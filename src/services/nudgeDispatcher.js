import { supabase } from '../config/supabase.js';
import { push } from './lineService.js';
import { nudgeText } from '../utils/nudgeMessages.js';
import {
  findIdleShops,
  getNudgeState,
  lastJobAt,
  recordNudge,
  shouldNudge,
  nudgeSettings,
  withinNudgeHours,
} from './nudgeService.js';
import { logger } from './logger.js';

// ม่วงทักก่อนเมื่อร้านหายไปหลายวัน
//
// เดินบนตัวจับเวลาในโปรเซสเดียวกับทุกอย่าง เหมือน reminderDispatcher — ราคาที่
// จ่ายคือถ้าโฮสต์หลับ ม่วงทักตอนตื่น ไม่ใช่ตรงชั่วโมงเป๊ะ ซึ่งสำหรับ "ทักทาย"
// ไม่ใช่เรื่อง

const DEFAULT_INTERVAL_MS = 60 * 60_000; // ชั่วโมงละครั้งก็พอ

// ปุ่มบนข้อความที่ทักไป — ทางออกอยู่ในมือร้านเสมอ ข้อความที่ปิดไม่ได้คือสแปม
const NUDGE_ACTIONS = [
  { label: '📝 จดงานเลย', action: 'add_job', text: 'บันทึกงานวันนี้' },
  { label: '🔕 ไม่ต้องทัก', action: 'nudge_off', text: 'ไม่ต้องทัก' },
];

// หนึ่งรอบ แยกออกมาให้เรียกและทดสอบตรง ๆ ได้
export async function dispatchNudges(deps = {}) {
  const client = deps.client || supabase;
  const sendPush = deps.push || push;
  const now = deps.now || new Date();
  const cfg = { ...nudgeSettings(deps.env || process.env), ...(deps.settings || {}) };

  if (!cfg.enabled) return { skipped: 'disabled' };
  if (!withinNudgeHours(now, cfg.hours)) return { skipped: 'นอกเวลาทัก' };

  const since = new Date(now.getTime() - cfg.idleDays * 86_400_000);

  let idle;
  try {
    idle = await findIdleShops(since, client);
  } catch (err) {
    logger.error('nudge.scan_failed', { message: err?.message });
    return { error: err?.message };
  }

  let sent = 0;
  const skipped = [];

  for (const shop of idle) {
    const state = await getNudgeState(shop.id, client);

    // จดงานหลังจากที่ม่วงทักไปครั้งก่อน แปลว่าเขากลับมาแล้ว การเงียบรอบนี้จึง
    // เป็นรอบใหม่ ไม่ใช่รอบเดิมที่ทักครบโควตาไปแล้ว — ถ้าไม่นับใหม่ ร้านที่เคย
    // เงียบยาวครั้งหนึ่งจะไม่ได้ยินเสียงม่วงอีกเลยตลอดกาล
    const back = state.last_nudge_at ? await lastJobAt(shop.id, client) : null;
    const fresh = back && back > new Date(state.last_nudge_at) ? { ...state, streak: 0 } : state;

    const verdict = shouldNudge(fresh, { now, cooldownDays: cfg.cooldownDays });
    if (!verdict.ok) {
      skipped.push(verdict.why);
      continue;
    }

    const streak = verdict.streak;

    try {
      await sendPush(shop.line_user_id, {
        type: 'text',
        text: nudgeText(shop.display_name, streak, deps.pick),
        quickReply: {
          items: NUDGE_ACTIONS.map((a) => ({
            type: 'action',
            action: { type: 'postback', label: a.label, data: `action=${a.action}`, displayText: a.text },
          })),
        },
      });
      await recordNudge(shop.id, streak + 1, client);
      sent += 1;
    } catch (err) {
      // ไม่บันทึกว่าทักแล้ว รอบหน้าจะได้ลองใหม่ — แต่ไม่ล้มทั้งรอบเพราะคนเดียว
      logger.error('nudge.push_failed', { userId: shop.id, message: err?.message });
    }
  }

  if (idle.length) logger.info('nudge.pass', { idle: idle.length, sent, skipped: skipped.length });
  return { idle: idle.length, sent, skipped };
}

// เริ่มตัวจับเวลา คืนฟังก์ชันหยุด unref ไว้ไม่ให้ค้างโปรเซส
export function startNudgeDispatcher(opts = {}) {
  const intervalMs = Number(process.env.NUDGE_INTERVAL_MS) || opts.intervalMs || DEFAULT_INTERVAL_MS;
  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await dispatchNudges(opts);
    } catch (err) {
      logger.error('nudge.tick_failed', { message: err?.message });
    } finally {
      running = false;
    }
  };

  const timer = setInterval(tick, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();
  logger.info('nudge.dispatcher_started', { intervalMs });
  return () => clearInterval(timer);
}
