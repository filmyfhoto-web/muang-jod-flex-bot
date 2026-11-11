import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createMockSupabase } from './helpers/mockSupabase.js';

process.env.SUPABASE_URL ||= 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-key';
process.env.LINE_CHANNEL_ACCESS_TOKEN ||= 'test-token';
process.env.LINE_CHANNEL_SECRET ||= 'test-secret';

const { createJob, getJobById } = await import('../src/services/jobService.js');
const { ensureJobBill, createBill, getBillableJobs, getBillById } = await import('../src/services/billService.js');
const { pickCombineCustomer } = await import('../src/actions/bill.js');

/* ร้านขอ (พร้อมภาพแชตที่ม่วงวนถาม "หมายถึง ออกบิล ไหมคะ" ไม่จบ):
 * "แยกงานให้แต่ถ้าชื่อลูกค้าคนเดียวกันเราออกใบเสร็จ [รวม] และแก้ไข หรือเพิ่มงาน
 * ด้วยได้ไหม แต่ระบบแยกงานไว้ให้เหมือนเดิม ยอดโชว์ยอดทั้งหมดและแยกตามยอด"
 * — งานยังแยกใบใครใบมัน แต่รวมเป็นใบเสร็จใบเดียวของเจ้านั้นได้ บนใบเห็นทั้ง
 * ยอดรวมและยอดรายงาน และจดเพิ่ม/แก้แล้วสั่งรวมใหม่ได้เรื่อย ๆ
 */

const draft = (name, total, customer) => ({
  jobName: name,
  customerName: customer,
  items: [{ item_name: name, size: null, quantity: 1, unit: null, unit_price: total, total }],
  subtotal: total,
  total,
});

async function jotWithAutoBill(db, name, total, customer) {
  const job = await createJob('userA', draft(name, total, customer), db);
  await ensureJobBill('userA', job, db);
  return getJobById('userA', job.id, db);
}

test('รวมบิล: งานสามใบของเจ้าเดียว (ต่างมีใบเดี่ยวอัตโนมัติ) รวมเป็นใบเดียว ยอดรวมถูก', async () => {
  const db = createMockSupabase();
  const a = await jotWithAutoBill(db, 'ป้ายไวนิล', 700, 'โรงเรียนบ้านห้วยฟอง');
  const b = await jotWithAutoBill(db, 'ตรายาง', 450, 'โรงเรียนบ้านห้วยฟอง');
  const c = await jotWithAutoBill(db, 'กรอบรูป', 250, 'โรงเรียนบ้านห้วยฟอง');
  assert.ok(a.bill_id && b.bill_id && c.bill_id, 'ทุกงานมีใบเดี่ยวติดตัวมาแล้ว');

  // งานทั้งสามต้องยังนับเป็น "รวมได้" แม้มีใบเดี่ยวแล้ว
  const billable = await getBillableJobs('userA', { customerName: 'โรงเรียนบ้านห้วยฟอง' }, db);
  assert.equal(billable.length, 3);

  const combined = await createBill('userA', [a.id, b.id, c.id], { customerName: 'โรงเรียนบ้านห้วยฟอง', rebill: true }, db);
  assert.ok(combined, 'รวมไม่สำเร็จ');
  assert.equal(combined.jobs.length, 3, 'ใบรวมต้องเห็นครบสามงาน (แยกตามยอดบนใบ)');
  assert.equal(combined.total, 1400, 'ยอดรวมทั้งหมด');

  // งานยังแยกใบใครใบมันในระบบ (เลขงานเดิม) แค่ชี้ไปใบรวมใบเดียวกัน
  for (const j of [a, b, c]) {
    const now = await getJobById('userA', j.id, db);
    assert.equal(now.bill_id, combined.id);
    assert.equal(now.job_number, j.job_number, 'เลขงานห้ามเปลี่ยน');
  }

  // ใบเดี่ยวเก่าถูกยกเลิก ไม่ใช่ลอยค้างเป็นใบซ้ำ
  for (const oldId of [a.bill_id, b.bill_id, c.bill_id]) {
    const old = await getBillById('userA', oldId, db);
    assert.equal(old.status, 'cancelled');
  }
});

test('เพิ่มงานทีหลังแล้วสั่งรวมใหม่ได้ — ใบรวมเก่าที่ยังไม่จ่ายถูกแทนที่ด้วยใบที่ครบกว่า', async () => {
  const db = createMockSupabase();
  const a = await jotWithAutoBill(db, 'ป้าย', 700, 'อบต.ผาทอง');
  const b = await jotWithAutoBill(db, 'ตรายาง', 450, 'อบต.ผาทอง');
  const first = await createBill('userA', [a.id, b.id], { customerName: 'อบต.ผาทอง', rebill: true }, db);

  const c = await jotWithAutoBill(db, 'สติ๊กเกอร์', 150, 'อบต.ผาทอง');
  const jobs = await getBillableJobs('userA', { customerName: 'อบต.ผาทอง' }, db);
  assert.equal(jobs.length, 3, 'งานบนใบรวม (ยังไม่จ่าย) + งานใหม่ ต้องรวมได้ทั้งหมด');

  const second = await createBill('userA', jobs.map((j) => j.id), { customerName: 'อบต.ผาทอง', rebill: true }, db);
  assert.equal(second.jobs.length, 3);
  assert.equal(second.total, 1300);
  assert.equal((await getBillById('userA', first.id, db)).status, 'cancelled');
});

test('ใบที่รับเงินแล้วห้ามแตะ — งานบนใบนั้นไม่ติดไปใบรวม', async () => {
  const db = createMockSupabase();
  const a = await jotWithAutoBill(db, 'ป้าย', 700, 'รร.สบกอน');
  const b = await jotWithAutoBill(db, 'ตรายาง', 450, 'รร.สบกอน');
  // จ่ายใบของงาน a แล้ว (จำลองรับเงินบนใบ)
  await db.from('bills').update({ paid_amount: 700, payment_status: 'paid', balance_due: 0 }).eq('id', a.bill_id);

  const billable = await getBillableJobs('userA', { customerName: 'รร.สบกอน' }, db);
  assert.deepEqual(billable.map((j) => j.id), [b.id], 'งานบนใบที่จ่ายแล้วต้องไม่โผล่มาให้รวม');

  const combined = await createBill('userA', [a.id, b.id], { customerName: 'รร.สบกอน', rebill: true }, db);
  assert.equal(combined.jobs.length, 1, 'ดึงมาได้เฉพาะงานที่ใบยังไม่จ่าย');
  const aNow = await getJobById('userA', a.id, db);
  assert.notEqual(aNow.bill_id, combined.id, 'งานบนใบจ่ายแล้วอยู่ที่ใบเดิม');
});

test('ปลดบางงานจากใบรวม: ใบเดิมไม่ถูกยกเลิก แต่ยอดคิดใหม่ตามงานที่เหลือ', async () => {
  const db = createMockSupabase();
  const a = await jotWithAutoBill(db, 'ป้าย', 700, 'คุณนก');
  const b = await jotWithAutoBill(db, 'กรอบ', 300, 'คุณนก');
  const both = await createBill('userA', [a.id, b.id], { customerName: 'คุณนก', rebill: true }, db);

  const solo = await createBill('userA', [a.id], { customerName: 'คุณนก', rebill: true }, db);
  assert.equal(solo.jobs.length, 1);
  const leftover = await getBillById('userA', both.id, db);
  assert.equal(leftover.status, 'active', 'ใบเดิมยังอยู่เพราะยังมีงาน b');
  assert.equal(leftover.total, 300, 'ยอดใบเดิมคิดใหม่ตามงานที่เหลือ');
});

test('pickCombineCustomer: เจอชื่อในประโยคแบบหลวม เจ้าเดียวเลือกเอง หลายเจ้าให้ถาม', () => {
  const customers = [
    { customerName: 'โรงเรียนบ้านห้วยฟอง' },
    { customerName: 'อบต.ผาทอง' },
  ];
  assert.equal(pickCombineCustomer('รวมบิลของ โรงเรียน บ้านห้วยฟอง ให้หน่อย', customers)?.customerName, 'โรงเรียนบ้านห้วยฟอง');
  assert.equal(pickCombineCustomer('รวมบิล อบต ผาทอง', customers)?.customerName, 'อบต.ผาทอง');
  assert.equal(pickCombineCustomer('รวมทั้งหมดให้หน่อย', customers), null, 'หลายเจ้าต้องถาม ไม่เดา');
  assert.equal(pickCombineCustomer('รวมทั้งหมดให้หน่อย', [customers[0]])?.customerName, 'โรงเรียนบ้านห้วยฟอง');
});

test('ประโยค "รวมบิล/รวมทั้งหมด" ถูกจับก่อนตัวทายจดงาน และไม่กินประโยคจดจริง', () => {
  const handler = readFileSync(new URL('../src/handlers/messageHandler.js', import.meta.url), 'utf8');
  const gate = handler.indexOf('combineBills({ replyToken, profile }, text)');
  const guess = handler.indexOf('if (looksLikeJob(text) || looksLikePricelessJob(text))');
  assert.ok(gate > 0 && gate < guess, 'เกตรวมบิลต้องมาก่อนตัวทายจดงาน');
  // กันประโยคจดจริง เช่น "กรอบ 3 อัน รวมทั้งหมด 450" — ต้องเช็ค looksLikeJob ก่อน
  assert.match(handler, /!looksLikeJob\(text\) &&\s*\n\s*\/รวม\/\.test\(text\)/);
  assert.match(handler, /ทั้งหมด\|ทั้ง\\s\*\(\?::?สอง\|สาม\|สี่\|ห้า\|หก\|\\d\+\)\\s\*งาน/);
});
