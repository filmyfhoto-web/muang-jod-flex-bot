import { supabase } from '../config/supabase.js';
import { logger } from './logger.js';
import { normalizeSettings, zonedParts, DEFAULT_TZ } from '../utils/checkinSchedule.js';

/* ที่เก็บของสำหรับ "ม่วงแวะมาถามว่ามีงานให้จดไหม"
 *
 * ทุกฟังก์ชันรับ client เข้ามาได้ เทสต์จึงส่ง mock เข้ามาแทน Supabase จริงได้
 * และไม่มีฟังก์ชันไหนในไฟล์นี้ตัดสินใจว่าจะส่งหรือไม่ส่ง — นั่นเป็นงานของ
 * checkinSchedule.js ที่เป็นฟังก์ชันล้วน ที่นี่แค่หยิบของกับเก็บของ
 */

/* ---------------------------------------------------------- การตั้งค่า */

export async function getCheckinSettings(userId, client = supabase) {
  const { data, error } = await client
    .from('notification_settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    logger.warn('checkin.settings_failed', { message: error.message });
    return null;
  }
  return data || null;
}

export async function saveCheckinSettings(userId, lineUserId, patch = {}, client = supabase) {
  const row = { user_id: userId, line_user_id: lineUserId, ...patch };
  const { data, error } = await client
    .from('notification_settings')
    .upsert(row, { onConflict: 'user_id' })
    .select('*')
    .maybeSingle();
  if (error) {
    logger.error('checkin.settings_save_failed', { message: error.message });
    throw error;
  }
  return data;
}

/* ร้านที่เปิดรับการทักไว้แล้วเท่านั้น
 *
 * ไม่มีแถว = ไม่เคยเปิด = ไม่ทัก การส่งข้อความหาคนที่ไม่ได้ขอ ผิดหนึ่งครั้งก็
 * กลายเป็นแอปกวนใจไปแล้ว ฟีเจอร์นี้จึงต้องเปิดเองที่หน้าตั้งค่าก่อนเสมอ
 */
export async function listCheckinTargets(client = supabase, limit = 500) {
  const { data, error } = await client
    .from('notification_settings')
    .select('*')
    .eq('enabled', true)
    .limit(limit);
  if (error) throw new Error(`${error.code || ''} ${error.message || ''}`.trim());
  return data || [];
}

/* ------------------------------------------------------ สถานะของวันนี้ */

// วันตามเขตเวลาของร้าน ไม่ใช่วัน UTC
export function shopDay(now = new Date(), timezone = DEFAULT_TZ) {
  return zonedParts(now, timezone).day;
}

export async function getDayState(userId, day, client = supabase) {
  const { data, error } = await client
    .from('checkin_day_state')
    .select('*')
    .eq('user_id', userId)
    .eq('day', day)
    .maybeSingle();
  if (error) {
    logger.warn('checkin.day_state_failed', { message: error.message });
    return null;
  }
  return data || null;
}

export async function setDayState(userId, day, patch = {}, client = supabase) {
  const { error } = await client
    .from('checkin_day_state')
    .upsert({ user_id: userId, day, ...patch }, { onConflict: 'user_id,day' });
  if (error) {
    logger.error('checkin.day_state_save_failed', { message: error.message });
    return false;
  }
  return true;
}

/* -------------------------------------------------------- ประวัติการส่ง */

// กุญแจของรอบที่ส่งไปแล้ววันนี้ — เอาไว้ให้ dueSlot ตัดรอบที่ส่งแล้วออก
export async function sentKeysForDay(lineUserId, day, client = supabase) {
  const { data, error } = await client
    .from('notification_logs')
    .select('unique_send_key')
    .eq('line_user_id', lineUserId)
    .like('unique_send_key', `${lineUserId}|${day}|%`);
  if (error) {
    logger.warn('checkin.log_read_failed', { message: error.message });
    // อ่านไม่ได้ = ไม่รู้ว่าเคยส่งหรือยัง ถือว่าส่งแล้วไว้ก่อน ปลอดภัยกว่า
    // การเดาว่ายังไม่ส่งแล้วยิงซ้ำ
    return null;
  }
  return new Set((data || []).map((r) => r.unique_send_key));
}

/* จองสิทธิ์ส่งก่อนส่งจริง
 *
 * เขียนแถวลง log ก่อน แล้วค่อยยิง push — ไม่ใช่ยิงก่อนแล้วค่อยบันทึก เพราะถ้า
 * เขียนพลาดหลังยิงสำเร็จ รอบหน้าจะยิงซ้ำ ส่วนทางกลับกัน (จองแล้วยิงไม่ออก) แค่
 * ทำให้รอบนั้นหายไปหนึ่งครั้ง ซึ่งเจ็บน้อยกว่ามาก
 *
 * unique constraint ที่ฐานข้อมูลเป็นตัวตัดสิน ไม่ใช่การเช็คก่อนเขียนในโค้ด —
 * สองโปรเซสที่เช็คพร้อมกันจะผ่านทั้งคู่ แต่เขียนสำเร็จได้แค่ตัวเดียว
 */
export async function claimSend({ userId, lineUserId, key, slot, scheduledAt }, client = supabase) {
  const { error } = await client.from('notification_logs').insert({
    user_id: userId,
    line_user_id: lineUserId,
    notification_type: 'checkin',
    scheduled_at: scheduledAt || null,
    status: 'pending',
    unique_send_key: key,
  });
  if (!error) return true;
  // 23505 = unique_violation — มีคนจองไปแล้ว ไม่ใช่ความผิดพลาด
  if (error.code === '23505') return false;
  logger.error('checkin.claim_failed', { message: error.message, code: error.code });
  return false;
}

export async function markSent(key, client = supabase) {
  const { error } = await client
    .from('notification_logs')
    .update({ status: 'sent', sent_at: new Date().toISOString() })
    .eq('unique_send_key', key);
  if (error) logger.warn('checkin.mark_sent_failed', { message: error.message });
}

export async function markFailed(key, message, client = supabase) {
  const { error } = await client
    .from('notification_logs')
    .update({ status: 'failed', error_message: String(message || '').slice(0, 500) })
    .eq('unique_send_key', key);
  if (error) logger.warn('checkin.mark_failed_failed', { message: error.message });
}

// ร้านกดปุ่มตอบมา บันทึกลงรอบล่าสุดของวันนั้น
//
// "ไม่ตอบ" ไม่ใช่คำตอบ — แถวที่ user_response ยังว่างต้องไม่ถูกอ่านว่าไม่มีงาน
// ที่ไหนเลย มันแปลว่าไม่รู้ ซึ่งคนละเรื่องกัน
export async function logResponse(lineUserId, day, answer, client = supabase) {
  const { data, error } = await client
    .from('notification_logs')
    .select('unique_send_key')
    .eq('line_user_id', lineUserId)
    .like('unique_send_key', `${lineUserId}|${day}|%`)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error || !data?.length) return false;

  const { error: upErr } = await client
    .from('notification_logs')
    .update({ user_response: answer, responded_at: new Date().toISOString() })
    .eq('unique_send_key', data[0].unique_send_key);
  if (upErr) {
    logger.warn('checkin.log_response_failed', { message: upErr.message });
    return false;
  }
  return true;
}

/* ร้านบล็อก OA แล้ว — หยุดตารางของคนนี้ ไม่ใช่แค่ข้ามรอบนี้
 *
 * LINE ตอบ 403 เมื่อยิงหาคนที่บล็อกอยู่ ถ้าไม่ปิดให้ ระบบจะยิงหาเขาทุกวันไป
 * ตลอดกาล เสียโควตาและเสียของ
 */
export async function disableForBlocked(userId, client = supabase) {
  const { error } = await client
    .from('notification_settings')
    .update({ enabled: false })
    .eq('user_id', userId);
  if (error) logger.warn('checkin.disable_blocked_failed', { message: error.message });
  else logger.info('checkin.disabled_blocked', { userId });
}

export function settingsView(row) {
  return normalizeSettings(row || {});
}
