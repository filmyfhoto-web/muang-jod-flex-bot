import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBook, buildAccount, accountKey, jobOwed, UNNAMED_ACCOUNT } from '../src/utils/customerBook.js';

/* ร้านขอ: "ถ้าเราทำเป็นบัญชี ของแต่ละโรงเรียน หากมีคนมาสั่งงานเราบอกบอทให้แยกไว้
 * แต่ละโรงเรียนงี้น่าจะหาง่ายกว่าเวลาเข้าไปดูย้อนหลัง ส่วนงานหน้าร้านให้จัดเป็น
 * งานทั่วไป แต่แยกหมวดงาน"
 */

// งานจริงแบบที่ร้านจดไว้ — โรงเรียนปนกับลูกค้าหน้าร้าน
const JOBS = [
  { id: 'a', customer_name: 'รร.สบกอน', category: 'sign', job_name: 'ป้ายเกษียณ', job_date: '2026-09-25',
    total: 2448, paid_amount: 0, balance_due: 2448, created_at: '2026-09-25T09:00:00Z' },
  { id: 'b', customer_name: 'รร สบกอน', category: 'sign', job_name: 'โฟมบอร์ดรูปครู', job_date: '2026-09-25',
    total: 2100, paid_amount: 0, balance_due: 2100, created_at: '2026-09-25T09:05:00Z' },
  { id: 'c', customer_name: 'รร.สบกอน', category: 'stamp', job_name: 'ตรายาง', job_date: '2026-08-12',
    total: 500, paid_amount: 500, balance_due: 0, created_at: '2026-08-12T10:00:00Z', bill_id: 'bill-1' },
  { id: 'd', customer_name: 'ธกส ทุ่งช้าง', category: 'sign', job_name: 'กรอบรูป', job_date: '2026-09-26',
    total: 1200, paid_amount: 1200, balance_due: 0, created_at: '2026-09-26T11:00:00Z' },
  { id: 'e', customer_name: 'พี่ยงค์ ร้านไข่', category: 'stamp', job_name: 'ตรายาง 2 อัน', job_date: '2026-09-13',
    total: 960, paid_amount: 0, balance_due: 960, created_at: '2026-09-13T08:00:00Z' },
  { id: 'f', customer_name: 'น้าปิ่ม', category: 'sticker', job_name: 'สติ๊กเกอร์ 50 ดวง', job_date: '2026-09-30',
    total: 250, paid_amount: 250, balance_due: 0, created_at: '2026-09-30T08:30:00Z' },
  { id: 'g', customer_name: null, category: 'print', job_name: 'ถ่ายเอกสาร', job_date: '2026-09-30',
    total: 300, paid_amount: 300, balance_due: 0, created_at: '2026-09-30T09:30:00Z' },
];

test('โรงเรียนเข้าบัญชีรายเจ้า งานหน้าร้านเข้าหมวดงาน', () => {
  const book = buildBook(JOBS);

  assert.deepEqual(book.orgs.map((o) => o.name), ['รร.สบกอน', 'ธกส ทุ่งช้าง']);

  // ลูกค้าหน้าร้านไม่ได้กลายเป็นบัญชีรายเจ้า — พี่ยงค์ น้าปิ่ม และงานไม่ระบุชื่อ
  // อยู่ในหมวดงาน ไม่ใช่ในรายชื่อเจ้า
  const names = book.orgs.map((o) => o.name).join(' ');
  for (const walkin of ['พี่ยงค์', 'น้าปิ่ม']) assert.ok(!names.includes(walkin), walkin);

  // หมวดที่ทำเงินมากที่สุดอยู่บน — ตรายาง ฿960 · งานพิมพ์ ฿300 · สติ๊กเกอร์ ฿250
  assert.deepEqual(
    book.walkins.map((c) => [c.label, c.jobCount, c.total]),
    [['ตรายาง', 1, 960], ['งานพิมพ์', 1, 300], ['สติ๊กเกอร์', 1, 250]],
  );
});

test('ชื่อเดียวกันพิมพ์คนละแบบ นับเป็นเจ้าเดียว ยอดค้างจึงไม่แตกเป็นหลายใบ', () => {
  // "รร.สบกอน" กับ "รร สบกอน" คือโรงเรียนเดียวกัน ต่างกันแค่จุดกับเว้นวรรค
  assert.equal(accountKey('รร.สบกอน'), accountKey('รร สบกอน'));
  assert.equal(accountKey('รร.สบกอน'), accountKey('รรสบกอน'));

  const sbk = buildBook(JOBS).orgs.find((o) => o.name === 'รร.สบกอน');
  assert.equal(sbk.jobCount, 3);
  assert.equal(sbk.total, 5048); // 2448 + 2100 + 500
  assert.equal(sbk.owed, 4548); // ตรายางจ่ายแล้ว จึงไม่นับ
  assert.equal(sbk.openCount, 2);

  // สะกดแบบที่ร้านใช้บ่อยกว่าเป็นชื่อที่โชว์
  assert.equal(sbk.name, 'รร.สบกอน');
});

test('เจ้าที่ค้างมากอยู่บนสุด — คือเจ้าที่ต้องตามก่อน', () => {
  const book = buildBook(JOBS);
  assert.equal(book.orgs[0].name, 'รร.สบกอน');
  assert.equal(book.orgs[0].owed, 4548);
  assert.equal(book.orgs[1].owed, 0);
  assert.equal(book.totals.orgOwed, 4548);
  assert.equal(book.totals.orgCount, 2);
});

test('เปิดบัญชีเจ้าหนึ่ง เห็นงานทุกใบ แยกหมวด ไม่ยุบรวมกัน', () => {
  const acc = buildAccount(JOBS, accountKey('รร.สบกอน'));

  assert.equal(acc.name, 'รร.สบกอน');
  assert.equal(acc.kind, 'org');
  assert.equal(acc.jobCount, 3);
  assert.equal(acc.owed, 4548);

  assert.deepEqual(acc.groups.map((g) => [g.label, g.jobs.length]), [['งานป้าย', 2], ['ตรายาง', 1]]);

  // งานสองใบของหมวดป้ายยังเป็นคนละใบ ติ๊กเลือกทีละใบได้
  const sign = acc.groups[0];
  assert.deepEqual(sign.jobs.map((j) => j.id).sort(), ['a', 'b']);
  assert.equal(sign.total, 4548);

  // ใบที่ออกบิลไปแล้วบอกไว้ว่าออกแล้ว จะได้ไม่ถูกเลือกซ้ำ
  const stamp = acc.groups[1].jobs[0];
  assert.equal(stamp.billed, true);
  assert.equal(stamp.paid, true);
  assert.equal(stamp.owed, 0);
});

test('งานที่ยกเลิกไม่นับ ทั้งในสมุดและในบัญชีเจ้า', () => {
  const withCancelled = [
    ...JOBS,
    { id: 'x', customer_name: 'รร.สบกอน', category: 'sign', job_name: 'ยกเลิก', job_date: '2026-09-26',
      total: 9999, paid_amount: 0, balance_due: 9999, status: 'cancelled', created_at: '2026-09-26T09:00:00Z' },
  ];

  const sbk = buildBook(withCancelled).orgs.find((o) => o.name === 'รร.สบกอน');
  assert.equal(sbk.jobCount, 3);
  assert.equal(sbk.owed, 4548);

  const acc = buildAccount(withCancelled, accountKey('รร.สบกอน'));
  assert.equal(acc.jobCount, 3);
  assert.ok(!acc.groups.some((g) => g.jobs.some((j) => j.id === 'x')));
});

test('ยอดค้างคิดจากยอดลบที่จ่ายมา เมื่อฐานข้อมูลยังไม่มี balance_due', () => {
  assert.equal(jobOwed({ total: 1000, paid_amount: 400 }), 600);
  assert.equal(jobOwed({ total: 1000, paid_amount: 400, balance_due: 600 }), 600);

  // จ่ายเกิน (ปัดขึ้น / ทอนทีหลัง) ไม่ทำให้ยอดค้างติดลบ
  assert.equal(jobOwed({ total: 1000, paid_amount: 1200 }), 0);
  assert.equal(jobOwed({ total: 1000, paid_amount: 0, balance_due: -50 }), 0);

  // งานที่ยกเลิกไม่ใช่ยอดค้าง
  assert.equal(jobOwed({ total: 1000, paid_amount: 0, balance_due: 1000, status: 'cancelled' }), 0);
});

test('เจ้าที่ไม่มีงานเลย เปิดไม่ได้ ไม่ใช่บัญชีเปล่า', () => {
  assert.equal(buildAccount(JOBS, accountKey('รร.ไม่มีจริง')), null);
  assert.equal(buildAccount([], 'อะไรก็ได้'), null);
});

test('งานหน่วยงานที่ไม่ได้ใส่ชื่อ ไม่กลายเป็นบัญชีลอย', () => {
  // ชื่อว่าง = หน้าร้าน (customerKind) จึงต้องไปอยู่หมวดงาน ไม่ใช่บัญชีรายเจ้า
  const book = buildBook([{ id: 'z', customer_name: '  ', category: 'print', total: 100, paid_amount: 100, balance_due: 0 }]);
  assert.equal(book.orgs.length, 0);
  assert.equal(book.walkins.length, 1);
  assert.ok(!JSON.stringify(book).includes(UNNAMED_ACCOUNT));
});
