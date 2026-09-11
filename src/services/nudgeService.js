import { supabase } from '../config/supabase.js';
import { MAX_NUDGES } from '../utils/nudgeMessages.js';
import { logger } from './logger.js';

// ใครควรได้รับการทักจากม่วง — และที่สำคัญกว่า ใครไม่ควร
//
// ข้อความที่ร้านไม่ได้ขอ ส่งผิดทีเดียวก็กลายเป็นแอปกวนใจไปแล้ว ทุกกฎในไฟล์นี้
// จึงเป็นกฎที่บอกว่า "อย่าส่ง" ไม่ใช่ "ส่ง"

export const DEFAULTS = {
  idleDays: 3, // เงียบกี่วันถึงเรียกว่าหายไป
  cooldownDays: 3, // ทักแล้วเว้นกี่วันถึงทักได้อีก
  hours: [9, 19], // ทักได้ช่วงไหน (เวลาไทย) — ไม่มีใครอยากโดนทักตีสอง
};

const DAY_MS = 86_400_000;

export function nudgeSettings(env = process.env) {
  const num = (v, fallback) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : fallback);
  return {
    enabled: String(env.NUDGE_ENABLED ?? '1') !== '0',
    idleDays: num(env.NUDGE_IDLE_DAYS, DEFAULTS.idleDays),
    cooldownDays: num(env.NUDGE_COOLDOWN_DAYS, DEFAULTS.cooldownDays),
    hours: DEFAULTS.hours,
  };
}

// ชั่วโมงตามเวลาไทย ไม่ใช่ตามเวลาของเครื่องที่ Render จับได้ (UTC)
export function bangkokHour(date = new Date()) {
  return Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', hour: '2-digit', hour12: false }).format(date)
  );
}

export function withinNudgeHours(date = new Date(), [from, to] = DEFAULTS.hours) {
  const h = bangkokHour(date);
  return h >= from && h < to;
}

// ร้านที่ยังไม่มีงานเข้ามาตั้งแต่ `since` — สองคิวรี ไม่ใช่คิวรีต่อร้าน:
// ดึงร้านทั้งหมด แล้วดึง user_id ของงานที่เพิ่งเข้ามา ใครไม่อยู่ในชุดหลังคือ
// คนที่เงียบ
export async function findIdleShops(since, client = supabase, limit = 500) {
  const { data: profiles, error: pErr } = await client
    .from('profiles')
    .select('id, line_user_id, display_name, created_at')
    .limit(limit);
  if (pErr) throw new Error(`${pErr.code || ''} ${pErr.message || ''}`.trim());

  const { data: recent, error: jErr } = await client
    .from('jobs')
    .select('user_id')
    .gte('created_at', since.toISOString());
  if (jErr) throw new Error(`${jErr.code || ''} ${jErr.message || ''}`.trim());

  const active = new Set((recent || []).map((r) => r.user_id));
  return (profiles || []).filter(
    (p) =>
      p.line_user_id &&
      !active.has(p.id) &&
      // เพิ่งสมัครวันนี้แล้วโดนทักว่าหายไปไหน เป็นการทักที่ไม่จริง
      new Date(p.created_at) <= since
  );
}

// งานล่าสุดของร้านนี้ ใช้ตอบคำถามเดียว: เขากลับมาจดหลังจากที่ม่วงทักไปหรือยัง
// ถ้ากลับมาแล้วเงียบใหม่ ก็เป็นการหายไปรอบใหม่ ไม่ใช่รอบเดิมที่ทักครบแล้ว
export async function lastJobAt(userId, client = supabase) {
  const { data, error } = await client
    .from('jobs')
    .select('created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) {
    logger.warn('nudge.last_job_failed', { message: error.message });
    return null;
  }
  return data?.[0]?.created_at ? new Date(data[0].created_at) : null;
}

export async function getNudgeState(userId, client = supabase) {
  const { data, error } = await client
    .from('nudge_state')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    logger.warn('nudge.state_failed', { message: error.message });
    return null;
  }
  // ไม่มีแถว = ยังไม่เคยทัก และเปิดอยู่
  return data || { user_id: userId, enabled: true, last_nudge_at: null, streak: 0 };
}

export async function setNudgeEnabled(userId, enabled, client = supabase) {
  const { error } = await client
    .from('nudge_state')
    .upsert({ user_id: userId, enabled: Boolean(enabled) }, { onConflict: 'user_id' });
  if (error) {
    logger.error('nudge.toggle_failed', { message: error.message });
    return false;
  }
  return true;
}

export async function recordNudge(userId, streak, client = supabase) {
  const { error } = await client
    .from('nudge_state')
    .upsert({ user_id: userId, last_nudge_at: new Date().toISOString(), streak }, { onConflict: 'user_id' });
  if (error) logger.error('nudge.record_failed', { message: error.message });
}

// ทักคนนี้ตอนนี้ได้ไหม — คืนเหตุผลที่ "ไม่" ไว้ด้วย เวลาม่วงเงียบผิดปกติจะได้
// อ่านจาก log ออกว่าเพราะอะไร ไม่ต้องเดา
export function shouldNudge(state, { now = new Date(), cooldownDays = DEFAULTS.cooldownDays } = {}) {
  if (!state) return { ok: false, why: 'no state' };
  if (state.enabled === false) return { ok: false, why: 'ร้านปิดไว้' };

  const streak = Number(state.streak) || 0;
  // ทักไปสามครั้งแล้วยังเงียบ แปลว่าไม่ได้ลืม — หยุดจนกว่าจะกลับมาจดเอง
  if (streak >= MAX_NUDGES) return { ok: false, why: 'ทักครบแล้ว' };

  if (state.last_nudge_at) {
    const since = now - new Date(state.last_nudge_at);
    if (since < cooldownDays * DAY_MS) return { ok: false, why: 'เพิ่งทักไป' };
  }

  return { ok: true, streak };
}
