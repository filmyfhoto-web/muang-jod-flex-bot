import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMockSupabase } from './helpers/mockSupabase.js';
import {
  createBill,
  splitBill,
  getBillById,
  getBillByToken,
  getSplittableBills,
  isCancelledToken,
} from '../src/services/billService.js';
import { splitPlan, canSplitBill } from '../src/utils/billSplit.js';
import { billFlex, billsCarousel, CAROUSEL_MAX } from '../src/flex/billFlex.js';
import { todayISO } from '../src/utils/dates.js';

const USER = 'user-1';
const today = todayISO();

function job(id, over = {}) {
  return {
    id,
    user_id: USER,
    job_number: `MJ-PRN-000${id}`,
    job_name: `งาน ${id}`,
    customer_name: null,
    job_date: today,
    total: 100,
    paid_amount: 0,
    balance_due: 100,
    payment_status: 'pending',
    status: 'active',
    bill_id: null,
    created_at: `2026-09-10T0${id}:00:00.000Z`,
    ...over,
  };
}

// ทุกปุ่มบนการ์ดต้องเก็บชื่อและ data ได้ ไม่ว่าจะซ้อนอยู่ชั้นไหนของ footer
function buttonLabels(message) {
  const found = [];
  (function walk(node) {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== 'object') return;
    if (node.action?.label) found.push(node.action.label);
    Object.values(node).forEach(walk);
  })(message);
  return found;
}

function postbackData(message, prefix) {
  const found = [];
  (function walk(node) {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== 'object') return;
    if (typeof node.data === 'string' && node.data.startsWith(prefix)) found.push(node.data);
    Object.values(node).forEach(walk);
  })(message);
  return found;
}

test('การจัดกลุ่ม: มีชื่อรวมตามชื่อ ไม่มีชื่อแยกใบละงาน', () => {
  // กองที่ไม่มีชื่อ = คนละคนกันทั้งกอง รวมไม่ได้แม้จะอยู่บิลเดียวกันมาก่อน
  const nameless = splitPlan([job('1'), job('2'), job('3'), job('4')]);
  assert.equal(nameless.length, 4);
  assert.deepEqual(nameless.map((g) => g.jobs.length), [1, 1, 1, 1]);
  assert.deepEqual(nameless.map((g) => g.customerName), [null, null, null, null]);

  // งานของคนเดียวกันยังรวมกันได้ตามเดิม
  const mixed = splitPlan([
    job('1', { customer_name: 'พี่น้อย' }),
    job('2', { customer_name: 'ช่างฟิวส์' }),
    job('3', { customer_name: 'พี่น้อย' }),
    job('4'),
  ]);
  assert.deepEqual(
    mixed.map((g) => [g.customerName, g.jobs.length]),
    [['พี่น้อย', 2], ['ช่างฟิวส์', 1], [null, 1]]
  );

  // ของคนเดียวล้วน ๆ ไม่ต้องแยก
  assert.equal(splitPlan([job('1', { customer_name: 'พี่น้อย' }), job('2', { customer_name: 'พี่น้อย' })]).length, 1);
});

test('บิลที่รวมกองอยู่แล้ว แยกกลับเป็นคนละใบได้', async () => {
  // ใบเดียวกับที่ร้านถืออยู่: สี่งานของคนละคน ไม่มีใครใส่ชื่อลูกค้าไว้
  const db = createMockSupabase({ jobs: [job('1'), job('2'), job('3'), job('4')] });
  const lumped = await createBill(USER, ['1', '2', '3', '4'], { customerName: null }, db);
  assert.equal(lumped.jobs.length, 4);

  const oldToken = lumped.share_token;
  const result = await splitBill(USER, lumped.id, db);

  assert.equal(result.ok, true);
  assert.equal(result.bills.length, 4);
  // ทุกใบมีงานเดียว = ใบที่ยื่นให้ลูกค้าคนหนึ่งได้จริง
  assert.deepEqual(result.bills.map((b) => b.jobs.length), [1, 1, 1, 1]);
  assert.deepEqual([...new Set(result.bills.map((b) => b.jobs[0].id))].sort(), ['1', '2', '3', '4']);
  // เลขบิลต้องไม่ซ้ำกันเอง
  assert.equal(new Set(result.bills.map((b) => b.bill_number)).size, 4);
  // ยอดรวมของทุกใบเท่ากับใบเดิม ไม่มีเงินหายระหว่างแยก
  assert.equal(
    result.bills.reduce((s, b) => s + Number(b.total), 0),
    Number(lumped.total)
  );

  // ใบเดิมถูกยกเลิก และลิงก์เก่าเปิดไม่ได้อีก — ใบนั้นคือใบที่ผิด
  const after = await getBillById(USER, lumped.id, db);
  assert.equal(after.status, 'cancelled');
  assert.equal(after.jobs.length, 0);
  assert.equal(await getBillByToken(oldToken, db), null);

  // ไม่มีงานไหนหลุดไปอยู่สองบิล หรือค้างไม่มีบิล
  const jobs = db._store.tables.jobs;
  const fresh = new Set(result.bills.map((b) => b.id));
  assert.equal(jobs.filter((j) => fresh.has(j.bill_id)).length, 4);
  assert.equal(jobs.filter((j) => j.bill_id === lumped.id).length, 0);
});

test('งานของคนเดียวกันยังอยู่ใบเดียวกันหลังแยก', async () => {
  const db = createMockSupabase({
    jobs: [
      job('1', { customer_name: 'พี่น้อย', total: 600, balance_due: 600 }),
      job('2', { customer_name: 'พี่น้อย', total: 500, balance_due: 500 }),
      job('3', { customer_name: 'ช่างฟิวส์', total: 9900, balance_due: 9900 }),
    ],
  });
  const lumped = await createBill(USER, ['1', '2', '3'], { customerName: null }, db);
  const result = await splitBill(USER, lumped.id, db);

  assert.equal(result.ok, true);
  assert.equal(result.bills.length, 2);
  const noi = result.bills.find((b) => b.customer_name === 'พี่น้อย');
  const fuse = result.bills.find((b) => b.customer_name === 'ช่างฟิวส์');
  assert.equal(noi.jobs.length, 2);
  assert.equal(Number(noi.total), 1100);
  assert.equal(fuse.jobs.length, 1);
  assert.equal(Number(fuse.total), 9900);
});

test('บิลที่รับเงินมาแล้ว หรือเป็นของคนเดียวอยู่แล้ว ไม่แยก', async () => {
  const db = createMockSupabase({ jobs: [job('1'), job('2')] });

  const paid = await createBill(USER, ['1', '2'], { customerName: null }, db);
  await db.from('bills').update({ paid_amount: 50 }).eq('id', paid.id);
  // เงินก้อนเดียวผูกกับบิลใบเดียว แยกแล้วต้องเดาแทนร้านว่าเป็นของใคร — ปฏิเสธดีกว่า
  assert.deepEqual(await splitBill(USER, paid.id, db), { ok: false, why: 'paid' });
  // และปฏิเสธแล้วต้องไม่แตะอะไรเลย
  assert.equal(db._store.tables.jobs.filter((j) => j.bill_id === paid.id).length, 2);
  assert.equal((await getBillById(USER, paid.id, db)).status, 'active');

  const db2 = createMockSupabase({
    jobs: [job('1', { customer_name: 'พี่น้อย' }), job('2', { customer_name: 'พี่น้อย' })],
  });
  const single = await createBill(USER, ['1', '2'], { customerName: 'พี่น้อย' }, db2);
  assert.equal((await splitBill(USER, single.id, db2)).why, 'nothing_to_split');

  assert.equal((await splitBill(USER, 'ไม่มีจริง', db)).why, 'not_found');
});

test('บิลของร้านอื่นแตะไม่ได้', async () => {
  const db = createMockSupabase({ jobs: [job('1'), job('2')] });
  const mine = await createBill(USER, ['1', '2'], { customerName: null }, db);
  assert.deepEqual(await splitBill('user-2', mine.id, db), { ok: false, why: 'not_found' });
  assert.equal(db._store.tables.jobs.filter((j) => j.bill_id === mine.id).length, 2);
});

test('ปุ่มแยกขึ้นเฉพาะใบที่แยกแล้วได้จริง', () => {
  const lumped = {
    id: 'b1',
    bill_number: 'MJ-B-20260910-0001',
    total: 400,
    paid_amount: 0,
    balance_due: 400,
    status: 'active',
    jobs: [job('1'), job('2'), job('3'), job('4')],
  };
  assert.equal(canSplitBill(lumped), true);
  const card = billFlex(lumped, { baseUrl: '' });
  assert.ok(buttonLabels(card).some((l) => l.includes('แยกเป็นคนละใบ (4)')));
  assert.deepEqual(postbackData(card, 'action=split_bill'), ['action=split_bill&billId=b1']);

  // ของคนเดียว ไม่มีอะไรให้แยก ปุ่มต้องไม่ขึ้น
  const single = { ...lumped, jobs: [job('1', { customer_name: 'พี่น้อย' })] };
  assert.equal(canSplitBill(single), false);
  assert.equal(postbackData(billFlex(single, { baseUrl: '' }), 'action=split_bill').length, 0);

  // รับเงินมาแล้ว ปุ่มต้องไม่ขึ้น เพราะกดแล้วม่วงจะปฏิเสธอยู่ดี
  const settled = { ...lumped, paid_amount: 100 };
  assert.equal(canSplitBill(settled), false);
  assert.equal(postbackData(billFlex(settled, { baseUrl: '' }), 'action=split_bill').length, 0);
});

test('ลิงก์ของใบที่โดนแยก บอกว่าถูกยกเลิก ไม่ใช่ทำเป็นว่าไม่เคยมี', async () => {
  const db = createMockSupabase({ jobs: [job('1'), job('2')] });
  const lumped = await createBill(USER, ['1', '2'], { customerName: null }, db);
  const token = lumped.share_token;

  assert.equal(await isCancelledToken(token, db), false);
  await splitBill(USER, lumped.id, db);

  // ลูกค้าที่ถือลิงก์เดิมอยู่ ต้องได้คำอธิบาย ไม่ใช่ "ไม่พบใบเสร็จนี้"
  assert.equal(await getBillByToken(token, db), null);
  assert.equal(await isCancelledToken(token, db), true);
  // โทเคนมั่ว ๆ ยังคงเป็นไม่พบตามเดิม ไม่ใช่ "ถูกยกเลิก"
  assert.equal(await isCancelledToken('ไม่ใช่โทเคน', db), false);
  assert.equal(await isCancelledToken('a'.repeat(48), db), false);
});

test('หลายบิลในข้อความเดียว และรายการบิลที่ยังรวมกองอยู่', async () => {
  const db = createMockSupabase({ jobs: [job('1'), job('2'), job('3'), job('4')] });
  const lumped = await createBill(USER, ['1', '2'], { customerName: null }, db);
  const ok = await createBill(USER, ['3'], { customerName: 'พี่น้อย' }, db);

  const list = await getSplittableBills(USER, CAROUSEL_MAX, db);
  assert.deepEqual(list.map((b) => b.id), [lumped.id]);
  assert.ok(!list.some((b) => b.id === ok.id));

  // ใบเดียวส่งเป็นการ์ดเดี่ยว ไม่ต้องห่อ carousel ให้ปัดค้าง
  assert.equal(billsCarousel([lumped]).contents.type, 'bubble');
  const many = billsCarousel([lumped, ok]);
  assert.equal(many.contents.type, 'carousel');
  assert.equal(many.contents.contents.length, 2);

  // เกินที่ LINE รับได้ ต้องตัด ไม่ใช่ส่งไปให้ LINE ปฏิเสธทั้งข้อความ
  const lots = Array.from({ length: 20 }, () => lumped);
  assert.equal(billsCarousel(lots).contents.contents.length, CAROUSEL_MAX);
});
