import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLedger, bookedDate, payMethod } from '../src/utils/ledger.js';

/* ใบลงบัญชี = เงินที่รับมาจริงทั้งวันของร้าน แยกเงินสดกับเงินโอน
 * คนละใบกับใบเสร็จ ซึ่งเป็นของลูกค้าทีละเจ้า
 */

const JOBS = [
  // ลงบัญชีวันที่ 30 — เข้าใบนี้
  { id: 'a', job_name: 'ป้ายไวนิล', customer_name: 'คุณแม่ลา', total: 1530, balance_due: 0,
    pay_method: 'cash', booked_at: '2026-09-30T03:00:00Z' },
  { id: 'b', job_name: 'ตรายาง 2 อัน', customer_name: 'พี่ต่าย', total: 500, balance_due: 0,
    pay_method: 'cash', booked_at: '2026-09-30T04:00:00Z' },
  { id: 'c', job_name: 'กรอบรูป', customer_name: 'ธ.ก.ส. ทุ่งช้าง', total: 1200, balance_due: 0,
    pay_method: 'transfer', booked_at: '2026-09-30T05:00:00Z' },
  { id: 'd', job_name: 'อัดรูป', customer_name: 'ป้านวล', total: 460, balance_due: 0,
    booked_at: '2026-09-30T06:00:00Z' }, // ไม่ได้บอกว่าจ่ายมาทางไหน

  // ลงบัญชีวันอื่น — ไม่เข้าใบนี้
  { id: 'e', job_name: 'สติ๊กเกอร์', total: 250, balance_due: 0, pay_method: 'cash',
    booked_at: '2026-09-29T04:00:00Z' },

  // ยังไม่ได้ลงบัญชีและยังค้างเงิน — ยอดยกไป
  { id: 'f', job_name: 'โฟมบอร์ด', customer_name: 'รร.สบกอน', total: 8276, balance_due: 8276 },
  { id: 'g', job_name: 'ตรายาง', customer_name: 'พี่ยงค์', total: 960, balance_due: 960 },

  // เก็บเงินครบแล้วแต่ยังไม่ได้ลงบัญชี — ไม่ใช่รายรับวันนี้ และไม่ใช่ยอดค้าง
  { id: 'h', job_name: 'ถ่ายเอกสาร', total: 300, balance_due: 0 },
];

test('ใบของวันไหน เอาเฉพาะงานที่ลงบัญชีวันนั้น', () => {
  const led = buildLedger(JOBS, '2026-09-30');
  assert.deepEqual(led.rows.map((r) => r.id).sort(), ['a', 'b', 'c', 'd']);
  assert.equal(led.jobCount, 4);
  assert.equal(led.total, 3690); // 1530 + 500 + 1200 + 460
});

test('แยกเงินสดกับเงินโอน เพราะกระทบยอดคนละทาง', () => {
  const led = buildLedger(JOBS, '2026-09-30');
  assert.deepEqual(
    led.methods.map((m) => [m.label, m.jobCount, m.total]),
    [['เงินสด', 2, 2030], ['โอน', 1, 1200], ['ยังไม่ได้บอก', 1, 460]],
  );
});

test('ไม่ได้บอกว่าจ่ายทางไหน ไม่เดาให้เป็นเงินสด', () => {
  // เดาให้ = แต่งตัวเลขให้คนทำบัญชี งานเก่าทุกใบไม่มีใครบอกไว้
  assert.equal(payMethod({ pay_method: 'cash' }), 'cash');
  assert.equal(payMethod({ pay_method: 'transfer' }), 'transfer');
  assert.equal(payMethod({}), 'unknown');
  assert.equal(payMethod({ pay_method: 'เงินสด' }), 'unknown');
  assert.equal(payMethod({ pay_method: null }), 'unknown');
});

test('ยอดค้างยกไป ไม่ปนกับรายรับของวันนี้', () => {
  const led = buildLedger(JOBS, '2026-09-30');
  assert.equal(led.carry.owed, 9236); // 8276 + 960
  assert.equal(led.carry.jobCount, 2);

  // งานที่เก็บครบแล้วแต่ยังไม่ลงบัญชี ไม่ใช่ทั้งรายรับและยอดค้าง
  assert.ok(!led.rows.some((r) => r.id === 'h'));
  assert.equal(led.total + 0, 3690);
});

test('ตัดวันตามเวลาไทย ไม่ใช่ UTC — ยอดค่ำวันนี้ต้องไม่ไปโผล่พรุ่งนี้', () => {
  // สี่ทุ่มครึ่งของวันที่ 30 ตามเวลาไทย = 15:30Z ของวันที่ 30 ยังเป็นวันที่ 30
  assert.equal(bookedDate({ booked_at: '2026-09-30T15:30:00Z' }), '2026-09-30');
  // 17:30Z ของวันที่ 30 = ตีครึ่งของวันที่ 1 ตามเวลาไทย
  assert.equal(bookedDate({ booked_at: '2026-09-30T17:30:00Z' }), '2026-10-01');
  // เที่ยงคืนครึ่งของวันที่ 30 ตามเวลาไทย = 17:30Z ของวันที่ 29
  assert.equal(bookedDate({ booked_at: '2026-09-29T17:30:00Z' }), '2026-09-30');

  assert.equal(bookedDate({}), null);
  assert.equal(bookedDate({ booked_at: 'เมื่อวาน' }), null);
});

test('งานที่ยกเลิก ไม่เข้าใบและไม่เป็นยอดยกไป', () => {
  const led = buildLedger(
    [...JOBS, { id: 'x', total: 9999, balance_due: 9999, status: 'cancelled', booked_at: '2026-09-30T03:00:00Z' }],
    '2026-09-30',
  );
  assert.equal(led.total, 3690);
  assert.equal(led.carry.owed, 9236);
});

test('วันที่ไม่มีงานเลย ได้ใบเปล่า ไม่ใช่พัง', () => {
  const led = buildLedger(JOBS, '2026-01-01');
  assert.deepEqual(led.rows, []);
  assert.equal(led.total, 0);
  assert.deepEqual(led.methods, []);
  // ยอดยกไปยังต้องบอก เพราะมันค้างอยู่จริงไม่ว่าจะดูวันไหน
  assert.equal(led.carry.owed, 9236);
});

test('เรียงเงินสดก่อน แล้วโอน แล้วที่ยังไม่ได้บอก — อ่านทีละกอง', () => {
  const led = buildLedger(JOBS, '2026-09-30');
  assert.deepEqual(led.rows.map((r) => r.method), ['cash', 'cash', 'transfer', 'unknown']);
  // ในกองเดียวกัน ยอดมากอยู่บน
  assert.deepEqual(led.rows.slice(0, 2).map((r) => r.amount), [1530, 500]);
});

test('แต่ละแถวบอกว่าเป็นงานหน่วยงานหรือหน้าร้าน', () => {
  const led = buildLedger(JOBS, '2026-09-30');
  const byId = Object.fromEntries(led.rows.map((r) => [r.id, r.kind]));
  assert.equal(byId.c, 'org'); // ธ.ก.ส. ทุ่งช้าง
  assert.equal(byId.a, 'walkin'); // คุณแม่ลา
});
