import { supabase } from '../config/supabase.js';
import { logger } from './logger.js';

export const STATES = {
  IDLE: 'idle',
  WAITING_FOR_JOB: 'waiting_for_job',
  // กำลังถามรายละเอียดทีละข้อ — ร้านบอกมาว่า "มีงานกรอบรูป" แต่ยังไม่บอกขนาด
  // จำนวน ราคา ม่วงถามเก็บทีละข้อจนครบ แล้วค่อยขึ้นการ์ดสรุปให้ยืนยัน
  COLLECTING_JOB: 'collecting_job',
  CONFIRMING_JOB: 'confirming_job', // parsed a draft, waiting for confirm/edit/cancel
  // ร้านจดรวดเดียวทั้งวัน ม่วงแยกเป็นงาน ๆ ให้ รอตรวจแล้วกดบันทึกทีเดียว
  CONFIRMING_DUMP: 'confirming_dump',
  WAITING_FOR_EVIDENCE: 'waiting_for_evidence',
  WAITING_FOR_EDIT: 'waiting_for_edit',
  WAITING_FOR_PAYMENT: 'waiting_for_payment_amount',
  WAITING_FOR_BILL_PAYMENT: 'waiting_for_bill_payment_amount',
  WAITING_FOR_SEARCH: 'waiting_for_search',
  // รอรูป QR รับเงินของร้าน — รูปถัดไปเก็บเป็น QR ไม่ใช่หลักฐานของงาน
  WAITING_FOR_QR: 'waiting_for_qr',
  // เก็บรูปแล้ว รอชื่อที่ร้านเรียกใบนั้น ("กสิกร" / "ออมสิน")
  WAITING_FOR_QR_LABEL: 'waiting_for_qr_label',
};

/* อายุของสถานะสนทนา
 *
 * เคสจริง: ชุดคำถามจดงานกรอบรูปค้างคำถาม "ขนาดเท่าไหร่คะ?" ข้ามคืน เช้ามา
 * ทุกประโยคที่ร้านพิมพ์ถูกอ่านเป็นคำตอบของคำถามเมื่อวาน — "งานพิมพ์การ์ด"
 * เลยได้ "ยังไม่เข้าใจ" ซ้ำ ๆ จนร้านสรุปว่าบอทพัง สถานะที่เก่ากว่านี้
 * ไม่ใช่บทสนทนาเดียวกันแล้ว ให้เริ่มใหม่
 */
export const STATE_TTL_MS = 6 * 60 * 60 * 1000;

export function isStaleState(row, now = Date.now()) {
  if (!row || !row.state || row.state === STATES.IDLE) return false;
  const t = Date.parse(row.updated_at);
  // เวลาอ่านไม่ออกถือว่ายังไม่หมดอายุ — ห้ามล้างสถานะเพราะข้อมูลเพี้ยน
  return Number.isFinite(t) && now - t > STATE_TTL_MS;
}

// จุดอ่านสถานะของทางข้อความ/รูป: ของค้างเกินอายุ → ล้างทิ้งแล้วคืน idle
// (ปุ่มบนการ์ดเก่ายังใช้ getState ตรง ๆ — ปุ่มพกค่าของมันเองและมีคำตอบ
// "ไม่พบ…แล้วค่ะ" รองรับอยู่แล้ว การกดปุ่มคือเจตนาชัด ไม่ใช่ข้อความหลงบริบท)
export async function getFreshState(userId, client = supabase) {
  const row = await getState(userId, client);
  if (!isStaleState(row)) return row;
  logger.info('state.expired', { state: row.state });
  try {
    return await clearState(userId, client);
  } catch {
    return null; // ล้างไม่สำเร็จก็ยังต้องไม่ติดกับดัก — คืน idle ให้รอบนี้ไปก่อน
  }
}

// Get the current state row for a user (by profile id). Returns null if none.
//
// Reads the newest row rather than requiring exactly one: a database whose
// user_states.user_id lost its UNIQUE constraint can hold duplicates, and a
// stale conversation state must never break the conversation itself.
export async function getState(userId, client = supabase) {
  const { data, error } = await client
    .from('user_states')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1);

  if (error) {
    logger.error('state.get_failed', { code: error.code, message: error.message });
    return null;
  }
  return data?.[0] || null;
}

// Upsert the state for a user.
//
// Prefers a real upsert (one round-trip, safe under concurrency). Falls back to
// update-then-insert when the database rejects ON CONFLICT — e.g. 42P10, "no
// unique or exclusion constraint matching the ON CONFLICT specification", which
// a hand-edited schema missing `user_id unique` produces.
export async function setState(userId, state, context = {}, client = supabase) {
  const row = { user_id: userId, state, context, updated_at: new Date().toISOString() };

  const { data, error } = await client
    .from('user_states')
    .upsert(row, { onConflict: 'user_id' })
    .select('*')
    .maybeSingle();

  if (!error) return data;

  logger.warn('state.upsert_failed', { code: error.code, message: error.message });

  const updated = await client.from('user_states').update(row).eq('user_id', userId).select('*');
  if (updated.error) {
    logger.error('state.update_failed', { code: updated.error.code, message: updated.error.message });
    throw updated.error;
  }
  if (updated.data?.length) return updated.data[0];

  const inserted = await client.from('user_states').insert(row).select('*').maybeSingle();
  if (inserted.error) {
    logger.error('state.insert_failed', { code: inserted.error.code, message: inserted.error.message });
    throw inserted.error;
  }
  return inserted.data;
}

// Reset a user back to idle with empty context.
export async function clearState(userId, client = supabase) {
  return setState(userId, STATES.IDLE, {}, client);
}
