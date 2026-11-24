// สะพานระหว่างงานจริงของม่วงจด กับบอร์ดเกมหน้าร้าน (NATTAPRON 8-BIT)
//
// กติกาเหล็กสองข้อของสะพานนี้:
//   1. เกมเขียนได้แค่สองเรื่อง — ขั้นผลิตละเอียด (work_status ช่องของเกมเอง
//      จาก migration 025) กับ ทำเสร็จ/ลูกค้ารับ (done_at / picked_up_at ช่อง
//      จริงเดิม ผ่าน statusPatch ซึ่งไม่แตะเงิน) ช่องเงินทุกช่อง (paid_amount,
//      balance_due, payment_status, booked_at, pay_method, paid_at) ต้องไม่
//      โผล่ใน patch เด็ดขาด — "ลูกค้ารับของแล้ว" ไม่ใช่ "ได้เงินแล้ว"
//   2. สถานะเกมไม่เก็บซ้ำกับของจริง: ยกเลิก/รับแล้ว/ทำเสร็จ คิดจาก status,
//      picked_up_at, done_at ที่ระบบหลักเก็บอยู่แล้ว work_status เก็บเฉพาะ
//      ขั้นกลางที่ระบบหลักไม่มีช่อง (ปรัชญาเดียวกับ jobState.js)
//
// ตารางเดินสถานะ (TRANSITIONS) นำเข้าจากสมองของเกมโดยตรง — ฝั่งเซิร์ฟเวอร์
// กับหน้าจอใช้กติกาชุดเดียวกัน ไม่มีสำเนาให้เพี้ยนจากกัน

import { TRANSITIONS, bkkTodayISO } from '../../public/game/engine.js';
import { statusPatch } from './jobState.js';

// ขั้นกลางที่เก็บใน work_status — "queued" ไม่เก็บ (ค่าว่าง = ยังไม่เริ่ม)
export const WORK_STAGES = ['preparing', 'producing', 'quality_check', 'out_to_vinyl', 'vinyl_production', 'back_at_shop'];

export function gameStatusOf(job = {}) {
  if (job.status === 'cancelled') return 'canceled';
  if (job.picked_up_at) return 'picked_up';
  if (job.done_at) return 'ready_for_pickup';
  return WORK_STAGES.includes(job.work_status) ? job.work_status : 'queued';
}

/* patch สำหรับขยับงานจริงไปขั้น `to` — หรือ null ถ้าเดินแบบนั้นไม่ได้
 *
 * การยกเลิกงาน (และการคืนงานที่ยกเลิก) ไม่ทำจากเกม — มันพันกับใบเสร็จ/บัญชี
 * จึงให้ไปทำในม่วงจดที่เดียว
 */
export function workPatch(job = {}, to, now = new Date()) {
  const from = gameStatusOf(job);
  if (to === 'canceled' || from === 'canceled') return null;
  if (!(TRANSITIONS[from] || []).includes(to)) return null;

  const patch = {};
  if (to === 'picked_up') {
    // รับของแล้ว = เสร็จแน่ด้วย — statusPatch ประทับเวลา ไม่แตะเงินสักช่อง
    Object.assign(patch, statusPatch(job, { picked: true }, now));
  } else if (to === 'ready_for_pickup') {
    Object.assign(patch, statusPatch(job, { done: true }, now));
  } else {
    // ถอยกลับมาแก้งาน = ยังไม่เสร็จ (ล้าง done_at และ picked_up_at ไปด้วยกัน)
    if (job.done_at || job.picked_up_at) Object.assign(patch, statusPatch(job, { done: false }, now));
    patch.work_status = to === 'queued' ? null : to;
  }

  const hist = Array.isArray(job.work_history) ? job.work_history : [];
  patch.work_history = [...hist, { from, to, at: now.toISOString() }].slice(-50);
  return { patch, from };
}

/* งานจริงหนึ่งใบ → ใบงานที่หน้าเกมอ่านได้ตรง ๆ
 *
 * เลขงานจริง (job_number) ส่งไปใน `no` — หน้าเกมแสดงเลขนี้ ไม่ใช่ uuid
 * และห้ามเปลี่ยนตามกติกาของร้าน ส่วนเรื่องเงินไม่ส่งไปเลยสักช่อง
 */
const KIND_BY_GROUP = {
  print: 'print',
  sign: 'vinyl', // งานป้ายทุกชนิดเดินสายไวนิล (มอไซค์ไปบ้านทำไวนิล)
  stamp: 'stamp',
  sticker: 'sticker',
  photo: 'photo',
  design: 'design',
};

export function gameKindOf(job = {}) {
  const type = String(job.category_type || '');
  if (type === 'vinyl' || type === 'banner') return 'vinyl';
  const hay = `${type} ${job.job_name || ''}`;
  if (/กรอบ|เฟรม|frame/i.test(hay)) return 'frame';
  return KIND_BY_GROUP[String(job.category || '')] || 'print';
}

export function gameJob(job = {}) {
  const items = (Array.isArray(job.items) ? job.items : [])
    .map((it) => ({
      title: String(it.item_name || '').slice(0, 200),
      qty: Number(it.quantity) || 1,
      unit: String(it.unit || '').slice(0, 10),
    }))
    .filter((it) => it.title)
    .slice(0, 20);
  const title = String(job.job_name || items[0]?.title || 'งานไม่ระบุชื่อ').slice(0, 200);
  if (!items.length) items.push({ title, qty: 1, unit: '' });

  const today = bkkTodayISO();
  const due = String(job.due_date || '');
  const pickedAt = job.picked_up_at || '';

  return {
    id: String(job.id || ''),
    no: String(job.job_number || ''),
    customer: String(job.customer_name || '').slice(0, 100),
    title,
    qty: items[0].qty,
    unit: items[0].unit,
    items,
    kind: gameKindOf(job),
    received: String(job.job_date || (job.created_at || '').slice(0, 10) || ''),
    due,
    // ของจริงไม่มีช่อง "งานด่วน" — ถึง/เลยวันนัดแล้วถือว่าด่วน
    priority: due && due <= today ? 'urgent' : 'normal',
    note: String(job.note || '').slice(0, 500),
    assignee: String(job.handler_name || '').slice(0, 50),
    status: gameStatusOf(job),
    pickedAt,
    pickedDate: pickedAt ? bkkTodayISO(new Date(pickedAt)) : '',
    sample: false,
    rank: 0,
    createdAt: job.created_at || '',
    updatedAt: job.updated_at || job.created_at || '',
    history: (Array.isArray(job.work_history) ? job.work_history : [])
      .slice(-12)
      .map((h) => ({ at: String(h?.at || ''), from: String(h?.from || ''), to: String(h?.to || ''), by: '' })),
  };
}
