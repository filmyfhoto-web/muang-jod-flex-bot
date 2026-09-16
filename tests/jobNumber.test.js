import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { formatJobNumber, summarizeJobs } from '../src/services/jobService.js';
import { CATEGORY_CODES, categoryCode, jobCode, parseJobNumber, auditCodes } from '../src/utils/jobNumber.js';
import { CATEGORY_GROUPS, OTHER_GROUP } from '../src/utils/category.js';

// ร้านขอว่า "เลขรหัส รันตามหมวดงานได้มั้ย ต่อให้แก้กี่รอบก็ไม่เปลี่ยน" และ
// "ต้องการแยก ทั้งเก่าด้วย" — ของเดิม MJ-YYYYMMDD-XXXX รันตามวัน งานตรายางกับ
// งานป้ายของวันเดียวกันได้เลขติดกัน แยกกองกันไม่ได้เลย

test('formatJobNumber -> MJ-<หมวด>-XXXX', () => {
  assert.equal(formatJobNumber('stamp', 1), 'MJ-STP-0001');
  assert.equal(formatJobNumber('sign', 42), 'MJ-SGN-0042');
  assert.equal(formatJobNumber('photo', 1234), 'MJ-PIC-1234');
  // หมวดที่ไม่รู้จักตกมาที่ GEN ไม่ใช่ undefined
  assert.equal(formatJobNumber('ไม่มีหมวดนี้', 3), 'MJ-GEN-0003');
  assert.equal(formatJobNumber(null, 3), 'MJ-GEN-0003');
  assert.match(formatJobNumber('print', 7), /^MJ-[A-Z]{3}-\d{4}$/);
});

test('every category has a code of its own', () => {
  // เพิ่มหมวดใหม่แล้วลืมใส่รหัส งานทั้งหมวดจะไปกองรวมกันที่ GEN เงียบ ๆ
  const { missing, duplicated } = auditCodes();
  assert.deepEqual(missing, [], 'หมวดที่ยังไม่มีรหัส: ' + missing.join(', '));
  assert.deepEqual(duplicated, [], 'รหัสซ้ำกัน: ' + duplicated.join(', '));
  assert.equal(Object.keys(CATEGORY_CODES).length, CATEGORY_GROUPS.length + 1, 'รหัสกับหมวดไม่เท่ากัน');
  assert.ok(Object.values(CATEGORY_CODES).every((c) => /^[A-Z]{3}$/.test(c)), 'รหัสต้องเป็นตัวใหญ่สามตัว');
  assert.equal(categoryCode(OTHER_GROUP.id), 'GEN');
});

test('a job knows its own code, from the category or from its items', () => {
  assert.equal(jobCode({ category: 'stamp' }), 'STP');
  // ประเภทเจาะจงกว่าชนะหมวดที่บันทึกไว้ เหมือนที่อื่นในระบบ
  assert.equal(jobCode({ category: 'print', category_type: 'stamp' }), 'STP');
  assert.equal(jobCode({ items: [{ item_name: 'ป้ายไวนิล 60x100' }] }), 'SGN');
  assert.equal(jobCode({}), 'GEN');
});

test('a job number reads back to the category that made it', () => {
  assert.deepEqual(parseJobNumber('MJ-STP-0007'), { code: 'STP', category: 'stamp', seq: 7 });
  assert.equal(parseJobNumber('MJ-20260915-0002'), null, 'เลขแบบเก่าต้องไม่ถูกอ่านเป็นแบบใหม่');
  assert.equal(parseJobNumber(''), null);
});

test('the database and the app agree on the codes', () => {
  // ไมเกรชันเขียนรหัสไว้เองเป็น SQL ถ้าสองที่ไม่ตรงกัน งานเก่ากับงานใหม่ของหมวด
  // เดียวกันจะได้คนละรหัส แล้วเลขก็จะชนกันเองด้วย
  const sql = readFileSync(new URL('../supabase/migrations/011_job_number_by_category.sql', import.meta.url), 'utf8');
  for (const [id, code] of Object.entries(CATEGORY_CODES)) {
    if (id === 'other') continue;
    assert.match(sql, new RegExp(`when '${id}'\\s+then '${code}'`), `ไมเกรชันไม่มีรหัสของหมวด ${id}`);
  }
  assert.match(sql, /else 'GEN'/);
});

test('summarizeJobs aggregates total / paid / pending', () => {
  const rows = [
    { total: 100, paid_amount: 0, balance_due: 100, payment_status: 'pending' },
    { total: 200, paid_amount: 50, balance_due: 150, payment_status: 'partial' },
    { total: 300, paid_amount: 300, balance_due: 0, payment_status: 'paid' },
  ];
  const s = summarizeJobs(rows, '2026-09-07');
  assert.equal(s.jobCount, 3);
  assert.equal(s.total, 600);
  assert.equal(s.paid, 350);
  assert.equal(s.pending, 250);
});

test('summarizeJobs falls back when paid_amount absent', () => {
  const rows = [
    { total: 100, payment_status: 'paid' },
    { total: 100, payment_status: 'pending' },
  ];
  const s = summarizeJobs(rows, '2026-09-07');
  assert.equal(s.paid, 100);
  assert.equal(s.pending, 100);
});

test('the number is set once and never recomputed — not even by moving category', async () => {
  // "ต่อให้แก้กี่รอบก็ไม่เปลี่ยน" — เลขงานคือ "ชื่อ" ของใบงาน ไม่ใช่ผลลัพธ์ที่คิด
  // ใหม่ได้ ใบที่ยื่นให้ลูกค้าไปแล้วต้องตามหาเจอตลอดไป
  const { createJob, updateJob, getJobById } = await import('../src/services/jobService.js');
  const { createMockSupabase } = await import('./helpers/mockSupabase.js');
  const db = createMockSupabase();

  const job = await createJob(
    'userA',
    { jobName: 'ตรายางโรงเรียน', items: [{ item_name: 'ตรายาง', quantity: 1, unit_price: 250, total: 250 }], total: 250 },
    db
  );
  assert.equal(job.job_number, 'MJ-STP-0001', 'งานตรายางใบแรกไม่ได้เลขของหมวดตรายาง');

  // แก้ราคา แก้ชื่อลูกค้า แล้วย้ายหมวด — สามรอบ เลขต้องเป็นเลขเดิมทุกรอบ
  await updateJob('userA', job.id, { total: 300 }, db);
  await updateJob('userA', job.id, { customer_name: 'โรงเรียนเปียงซ้อ' }, db);
  await updateJob('userA', job.id, { category: 'sign', category_type: 'vinyl' }, db);

  const after = await getJobById('userA', job.id, db);
  assert.equal(after.job_number, 'MJ-STP-0001', 'ย้ายหมวดแล้วเลขงานเปลี่ยนตาม');
  assert.equal(after.category, 'sign', 'หมวดไม่ได้ย้ายจริง');
});

test('each category runs its own sequence, and a cancelled job does not free its number', async () => {
  const { createJob, cancelJob } = await import('../src/services/jobService.js');
  const { createMockSupabase } = await import('./helpers/mockSupabase.js');
  const db = createMockSupabase();
  const make = (name, price) =>
    createJob('userA', { jobName: name, items: [{ item_name: name, quantity: 1, unit_price: price, total: price }], total: price }, db);

  const stamp1 = await make('ตรายาง', 250);
  const sign1 = await make('ป้ายไวนิล 60x100', 150);
  const stamp2 = await make('ตรายาง', 280);
  const sign2 = await make('ป้ายไวนิล 100x200', 600);

  assert.equal(stamp1.job_number, 'MJ-STP-0001');
  assert.equal(stamp2.job_number, 'MJ-STP-0002', 'ตรายางใบที่สองไม่ได้นับต่อจากใบแรก');
  assert.equal(sign1.job_number, 'MJ-SGN-0001', 'งานป้ายไปนับต่อจากตรายาง');
  assert.equal(sign2.job_number, 'MJ-SGN-0002');

  // ยกเลิกแล้วเลขต้องไม่ถูกเอามาใช้ซ้ำ ใบที่ยื่นให้ลูกค้าไปแล้วยังอ้างเลขนั้นอยู่
  await cancelJob('userA', stamp2.id, db);
  const stamp3 = await make('ตรายาง', 300);
  assert.equal(stamp3.job_number, 'MJ-STP-0003', 'เลขของใบที่ยกเลิกถูกเอามาใช้ซ้ำ');

  // คนละร้านนับของตัวเอง ไม่ปนกัน
  const other = await createJob(
    'userB',
    { jobName: 'ตรายาง', items: [{ item_name: 'ตรายาง', quantity: 1, unit_price: 250, total: 250 }], total: 250 },
    db
  );
  assert.equal(other.job_number, 'MJ-STP-0001', 'เลขงานของอีกร้านนับต่อจากร้านแรก');
});
