import { round2 } from './currency.js';

/* งานหนึ่งงานอยู่ในสถานะไหน — ของออกไปหรือยัง และได้เงินหรือยัง
 *
 * ร้านขอปุ่มสามปุ่มบนคิวงาน: ✅ รับแล้ว · 📛 ค้างจ่าย · ❎ ยังไม่มารับ
 *
 * สามอย่างนี้เป็นสองเรื่องซ้อนกัน — "ของออกจากร้านไปหรือยัง" กับ "ได้เงินหรือ
 * ยัง" ของเดิมมีแต่เรื่องเงิน งานที่ทำเสร็จวางรออยู่หน้าร้าน กับงานที่ลูกค้า
 * หอบไปแล้วแต่ยังไม่จ่าย จึงหน้าตาเหมือนกันเป๊ะ ทั้งที่ต้องตามคนละแบบ:
 * อันแรกโทรตามให้มารับ อันหลังโทรตามเงิน
 *
 * สถานะไม่ได้เก็บเป็นช่องของตัวเอง แต่คิดจากสองอย่างที่เก็บไว้จริง (เวลาที่มา
 * รับ กับยอดคงเหลือ) — เก็บซ้ำเมื่อไหร่ก็มีวันที่มันขัดกันเอง
 */

export const JOB_STATES = [
  { id: 'done', icon: '✅', label: 'รับแล้ว', short: 'รับแล้ว' },
  { id: 'owed', icon: '📛', label: 'ค้างจ่าย', short: 'ค้างจ่าย' },
  { id: 'waiting', icon: '❎', label: 'ยังไม่มารับ', short: 'ยังไม่มารับ' },
];

export function jobState(job = {}) {
  if (!job.picked_up_at) return 'waiting';
  return round2(Number(job.balance_due) || 0) > 0 ? 'owed' : 'done';
}

export function stateMeta(id) {
  return JOB_STATES.find((s) => s.id === id) || JOB_STATES[2];
}

/* ปุ่มที่กด → ช่องที่ต้องเขียน
 *
 * `now` ส่งเข้ามาได้เพื่อให้เทสต์คุมเวลาเองได้
 */
export function pickupPatch(job = {}, state, now = new Date()) {
  const total = round2(Number(job.total) || 0);
  const paid = round2(Number(job.paid_amount) || 0);
  const stamp = now.toISOString();

  if (state === 'waiting') {
    // ยังไม่มารับ = ของยังอยู่ที่ร้าน ไม่ยุ่งกับเรื่องเงินที่จ่ายมาแล้ว
    // (มัดจำไว้ก่อนแล้วค่อยมารับ เป็นเรื่องปกติ)
    return { picked_up_at: null };
  }

  if (state === 'done') {
    // รับแล้ว = ของออกไปและเก็บเงินครบ
    return { picked_up_at: stamp, paid_amount: total, balance_due: 0, payment_status: 'paid' };
  }

  if (state === 'owed') {
    /* ค้างจ่าย = ของออกไปแล้วแต่ยังไม่ได้เงิน
     *
     * จ่ายมาบางส่วนแล้ว (มัดจำ) ไม่ต้องไปยุ่ง — ยอดคงเหลือยังค้างอยู่จริง
     * แต่ถ้างานนั้นเคยถูกทำเครื่องหมายว่าจ่ายครบ การกดปุ่มนี้คือการแก้ว่า
     * "ยังไม่ได้เงินนะ" ซึ่งแปลว่ายอดที่จ่ายต้องกลับเป็นศูนย์ ไม่งั้นป้ายกับ
     * ตัวเลขจะพูดคนละเรื่อง
     */
    if (total - paid > 0.009) return { picked_up_at: stamp };
    return { picked_up_at: stamp, paid_amount: 0, balance_due: total, payment_status: 'pending' };
  }

  return null;
}
