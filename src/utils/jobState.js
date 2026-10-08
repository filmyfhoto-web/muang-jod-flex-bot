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
/* สี่ขั้นที่ร้านเขียนมาเอง: ทำเสร็จ → ลูกค้ารับ → ได้เงิน → ลงบัญชี
 *
 * สองขั้นกลางมีอยู่แล้วในฐานข้อมูล (picked_up_at, balance_due) ส่วนหัวกับท้าย
 * มาจาก migration 015 (done_at, booked_at)
 *
 * ขั้นนับแบบ "เดินมาถึงไหนแล้ว" ไม่ใช่ติ๊กอิสระสี่ช่อง เพราะงานจริงเดินไปทาง
 * เดียว และร้านอ่านตารางด้วยการกวาดตาหาว่าแถวไหนหยุดอยู่ตรงไหน — ติ๊กข้ามขั้น
 * ได้เมื่อไหร่ ตารางก็ตอบคำถามนั้นไม่ได้อีก
 */
export const JOB_STAGES = [
  { id: 'made', label: 'ทำเสร็จ', field: 'done_at' },
  { id: 'picked', label: 'ลูกค้ารับ', field: 'picked_up_at' },
  { id: 'paid', label: 'ได้เงิน', field: null },
  { id: 'booked', label: 'ลงบัญชี', field: 'booked_at' },
];

const isPaid = (job) => round2(Number(job?.total) || 0) > 0 && round2(Number(job?.balance_due) || 0) <= 0;

/* งานใบนี้เดินมาถึงขั้นไหน — 0 ถึง 4
 *
 * นับเฉพาะขั้นที่ต่อกันมาจากต้น งานที่จ่ายเงินล่วงหน้าแต่ยังไม่ได้มารับ จึงอยู่
 * ที่ "ทำเสร็จ" ไม่ใช่ "ได้เงิน" — เพราะสิ่งที่ค้างอยู่จริงคือของยังไม่ออกจากร้าน
 * และนั่นคือสิ่งที่ร้านต้องทำต่อ
 */
export function jobStage(job = {}) {
  // ลูกค้ารับของไปแล้ว แปลว่างานเสร็จแน่ ๆ ถึงจะไม่เคยกดปุ่ม "ทำเสร็จ"
  const made = Boolean(job.done_at || job.picked_up_at);
  const steps = [made, Boolean(job.picked_up_at), isPaid(job), Boolean(job.booked_at)];
  let at = 0;
  for (const ok of steps) {
    if (!ok) break;
    at += 1;
  }
  return at;
}

/* แตะช่องไหน = งานเดินถึงขั้นนั้น · แตะช่องที่อยู่ = ถอยกลับหนึ่งขั้น
 *
 * คืน patch ที่พาไปถึงขั้นที่ขอพอดี ไม่มากไม่น้อย
 */
export function stagePatch(job = {}, stage, now = new Date()) {
  /* ค่าว่างต้องไม่แปลว่า "ขั้น 0"
   *
   * Number(null) และ Number('') เป็น 0 ทั้งคู่ ถ้าปล่อยผ่าน คำขอที่ไม่ได้บอก
   * ขั้นมาเลยจะกลายเป็นคำสั่งถอยงานกลับไปจุดเริ่มต้น แล้วเวลาที่ลงไว้ทั้งหมด
   * หายเกลี้ยงโดยไม่มีใครตั้งใจ
   */
  const text = typeof stage === 'string' ? stage.trim() : stage;
  const looksLikeAStage = typeof text === 'number' || (typeof text === 'string' && /^\d+$/.test(text));
  if (!looksLikeAStage) return null;

  const want = Number(text);
  if (!Number.isInteger(want) || want < 0 || want > JOB_STAGES.length) return null;

  const total = round2(Number(job.total) || 0);
  const paid = round2(Number(job.paid_amount) || 0);
  const stamp = now.toISOString();
  const patch = {};

  patch.done_at = want >= 1 ? job.done_at || stamp : null;
  patch.picked_up_at = want >= 2 ? job.picked_up_at || stamp : null;

  if (want >= 3) {
    // ได้เงินแล้ว = เก็บครบ เก็บของเดิมไว้ถ้าจ่ายมาครบอยู่แล้ว (มัดจำเต็ม)
    if (!isPaid(job)) Object.assign(patch, { paid_amount: total, balance_due: 0, payment_status: 'paid' });
  } else if (isPaid(job)) {
    /* ถอยจาก "ได้เงินแล้ว" = บอกว่ายังไม่ได้เงิน ยอดที่จ่ายต้องกลับไปเป็นศูนย์
     * ไม่งั้นป้ายกับตัวเลขพูดคนละเรื่อง — เหมือนที่ปุ่ม "ค้างจ่าย" ทำ
     *
     * จ่ายมาบางส่วน (มัดจำ) ไม่ใช่ "ได้เงินแล้ว" อยู่แล้ว จึงไม่ต้องไปยุ่ง
     */
    Object.assign(patch, { paid_amount: 0, balance_due: total, payment_status: 'pending' });
  } else if (paid > 0) {
    Object.assign(patch, { paid_amount: paid, balance_due: round2(total - paid), payment_status: 'partial' });
  }

  patch.booked_at = want >= 4 ? job.booked_at || stamp : null;
  return patch;
}

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

/* สถานะแบบเลือกอิสระ — แทนปุ่มสี่ขั้นที่ติ๊กต่อกัน
 *
 * ร้านบอกว่า "เอาเลือกแบบนี้ดีกว่า": ทำเสร็จ · ลูกค้ารับแล้ว · เงิน (ได้รับ → จ่ายสด/โอน ·
 * ยังไม่ได้รับ → ลงบัญชี) สามเรื่องนี้เป็นคนละเรื่องกัน กดข้อไหนก็ไม่ไปขยับข้ออื่น
 *
 *   done   ทำเสร็จแล้ว          (done_at)
 *   picked ลูกค้ารับของแล้ว      (picked_up_at) — รับแล้วแปลว่าเสร็จแล้วด้วย
 *   money  cash | transfer     ได้รับเงินครบ + ลงในใบลงบัญชีวันนี้ตามช่องทาง
 *          paid                ได้รับเงินครบแต่ไม่รู้ช่องทาง (งานเก่า)
 *          account             ยังไม่ได้รับเงิน แต่ลงบัญชีไว้แล้ว (ค้างจ่าย)
 *          partial | unpaid    ได้บางส่วน / ยังไม่ได้เลย และยังไม่ได้ลงบัญชี
 */
export const MONEY_CHOICES = ['cash', 'transfer', 'unpaid', 'account'];

export function jobStatus(job = {}) {
  const total = round2(Number(job.total) || 0);
  const paid = total > 0 && round2(Number(job.balance_due) || 0) <= 0.009;
  let money;
  if (paid) money = job.pay_method === 'cash' || job.pay_method === 'transfer' ? job.pay_method : 'paid';
  else if (job.booked_at) money = 'account';
  else money = round2(Number(job.paid_amount) || 0) > 0 ? 'partial' : 'unpaid';
  return {
    done: Boolean(job.done_at || job.picked_up_at),
    picked: Boolean(job.picked_up_at),
    money,
  };
}

/* change = { done?: boolean, picked?: boolean, money?: 'cash'|'transfer'|'unpaid'|'account' }
 * คืน patch ที่เขียนลงงานได้ หรือ null ถ้าคำขอไม่มีอะไรให้ทำ/ค่าไม่ถูก
 */
export function statusPatch(job = {}, change = {}, now = new Date()) {
  const stamp = now.toISOString();
  const patch = {};
  let touched = false;

  if (change.done !== undefined) {
    if (typeof change.done !== 'boolean') return null;
    touched = true;
    patch.done_at = change.done ? job.done_at || stamp : null;
    // ยังไม่เสร็จ = ยังไม่มีทางถูกรับไปแล้ว
    if (!change.done) patch.picked_up_at = null;
  }

  if (change.picked !== undefined) {
    if (typeof change.picked !== 'boolean') return null;
    touched = true;
    patch.picked_up_at = change.picked ? job.picked_up_at || stamp : null;
    // รับของไปแล้วแปลว่างานเสร็จแน่ ถึงไม่เคยกดทำเสร็จ
    if (change.picked) patch.done_at = patch.done_at ?? job.done_at ?? stamp;
  }

  if (change.money !== undefined) {
    if (!MONEY_CHOICES.includes(change.money)) return null;
    touched = true;
    const total = round2(Number(job.total) || 0);
    const paid = round2(Number(job.paid_amount) || 0);

    if (change.money === 'cash' || change.money === 'transfer') {
      Object.assign(patch, {
        paid_amount: total,
        balance_due: 0,
        payment_status: 'paid',
        pay_method: change.money,
        booked_at: job.booked_at || stamp,
      });
    } else {
      // ยังไม่ได้รับเงิน: มัดจำที่รับไว้แล้วไม่หาย ส่วนที่เคยบอกว่า "ได้ครบ" กลับเป็นศูนย์
      const fullyPaid = total > 0 && round2(total - paid) <= 0.009;
      const keep = fullyPaid ? 0 : paid;
      Object.assign(patch, {
        paid_amount: keep,
        balance_due: round2(total - keep),
        payment_status: keep > 0 ? 'partial' : 'pending',
        pay_method: null,
        booked_at: change.money === 'account' ? job.booked_at || stamp : null,
      });
    }
  }

  return touched ? patch : null;
}

/* งานใบนี้อยู่กองเงินไหน — เงินสด · โอน · ลงบัญชี · ยังไม่ได้รับ · รับแล้วไม่ระบุช่องทาง
 *
 * ได้รับบางส่วนนับเป็น "ยังไม่ได้รับ" เพราะยังมียอดค้างอยู่
 */
export const MONEY_KINDS = ['cash', 'transfer', 'account', 'unpaid', 'paid'];

export function moneyKind(job = {}) {
  const m = jobStatus(job).money;
  return m === 'partial' ? 'unpaid' : m;
}
