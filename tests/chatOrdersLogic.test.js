import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  orderTotals,
  filterCustomers,
  filterCounts,
  matchesFilter,
  blankForm,
  jobToForm,
  draftToForm,
  validateOrder,
  toCreatePayload,
  toPatchPayload,
  isDirty,
  workLabel,
  closeWarnings,
  summaryText,
  customerKeyOf,
  money,
  TAX_NOTE,
} from '../public/liff/orders/logic.js';
import { accountKey } from '../src/utils/customerBook.js';

const ITEMS = [
  { item_name: 'กระดาษ A4 80 แกรม', quantity: 10, unit: 'รีม', unit_price: 135 },
  { item_name: 'ปากกาแดง', quantity: 2, unit: 'โหล', unit_price: 120 },
];

test('orderTotals: ยอดว่างให้เท่ากับรวมรายการ และไม่คิดภาษีเอง', () => {
  const t = orderTotals(ITEMS, '');
  assert.equal(t.subtotal, 1590);
  assert.equal(t.total, 1590);
  assert.equal(t.adjust, 0);
});

test('orderTotals: ร้านปัดขึ้นเป็นเลขกลมได้ ส่วนต่างเป็นบวก', () => {
  const t = orderTotals(ITEMS, 1600);
  assert.equal(t.total, 1600);
  assert.equal(t.adjust, 10);
});

test('orderTotals: ลดให้ลูกค้าได้ ส่วนต่างเป็นลบ', () => {
  const t = orderTotals(ITEMS, '1500');
  assert.equal(t.total, 1500);
  assert.equal(t.adjust, -90);
});

test('orderTotals: ทศนิยมปัดสองตำแหน่งโดยไม่เพี้ยนจากจุดลอยตัว', () => {
  const t = orderTotals([{ quantity: 3, unit_price: 0.1 }], '');
  assert.equal(t.subtotal, 0.3);
});

test('money: แสดงสองตำแหน่งด้วยเลขอารบิกเสมอ', () => {
  assert.equal(money(1590), '1,590.00');
  assert.equal(money('12.5'), '12.50');
  assert.equal(money(undefined), '0.00');
});

const CUSTOMERS = [
  { key: 'a', name: 'ครูแนน', orgName: 'โรงเรียนพระธาตุ', unread: 2, openJobs: 1, jobCount: 3, lastMessage: { body: 'ขอใบเสนอราคา' } },
  { key: 'b', name: 'บริษัท เอ', orgName: null, unread: 0, openJobs: 0, jobCount: 1, lastMessage: null },
  { key: 'c', name: 'ร้านหนังสือ', orgName: null, unread: 0, openJobs: 2, jobCount: 2, lastMessage: { body: 'มีปากกาแบบแพ็ค' } },
  { key: 'd', name: 'เพิ่งเริ่ม', orgName: null, unread: 0, openJobs: 0, jobCount: 0, lastMessage: null },
];

test('filterCounts: ตัวนับชิปตรงกับกติกาของแต่ละตัวกรอง', () => {
  assert.deepEqual(filterCounts(CUSTOMERS), { all: 4, unread: 1, open: 2, done: 1 });
});

test('matchesFilter: "เสร็จแล้ว" ต้องมีงานจริง ไม่รวมลูกค้าที่ยังไม่เคยสั่ง', () => {
  assert.equal(matchesFilter(CUSTOMERS[3], 'done'), false);
  assert.equal(matchesFilter(CUSTOMERS[1], 'done'), true);
});

test('filterCustomers: ค้นหาได้ทั้งชื่อ หน่วยงาน และข้อความล่าสุด', () => {
  assert.deepEqual(filterCustomers(CUSTOMERS, { query: 'พระธาตุ' }).map((c) => c.key), ['a']);
  assert.deepEqual(filterCustomers(CUSTOMERS, { query: 'แพ็ค' }).map((c) => c.key), ['c']);
  assert.deepEqual(filterCustomers(CUSTOMERS, { query: 'บริษัท' }).map((c) => c.key), ['b']);
});

test('filterCustomers: ตัวกรองกับคำค้นทำงานพร้อมกัน', () => {
  assert.deepEqual(filterCustomers(CUSTOMERS, { filter: 'open', query: 'ร้าน' }).map((c) => c.key), ['c']);
  assert.deepEqual(filterCustomers(CUSTOMERS, { filter: 'unread', query: 'ร้าน' }), []);
});

test('customerKeyOf: ตรงกับ accountKey ฝั่งเซิร์ฟเวอร์ทุกกรณี', () => {
  for (const name of ['ครูแนน', 'ครู แนน', 'ร้าน A.B-C', 'บริษัท เอ·บี', '  สมชาย  ', '']) {
    assert.equal(customerKeyOf(name), accountKey(name), name);
  }
});

test('validateOrder: ชี้ทุกข้อที่ยังผิด และผ่านเมื่อครบ', () => {
  assert.deepEqual(validateOrder({ customerName: '', items: [] }), [
    'ต้องใส่ชื่อลูกค้าก่อนค่ะ',
    'ต้องมีรายการอย่างน้อย 1 รายการ',
  ]);
  const errs = validateOrder({
    customerName: 'ครูแนน',
    items: [{ item_name: '', quantity: 0, unit_price: -5 }],
  });
  assert.ok(errs.includes('รายการที่ 1 ยังไม่ได้ใส่ชื่อ'));
  assert.ok(errs.includes('รายการที่ 1 จำนวนต้องมากกว่า 0'));
  assert.ok(errs.includes('รายการที่ 1 ราคาต่อหน่วยไม่ถูกต้อง'));
  assert.deepEqual(validateOrder({ customerName: 'ครูแนน', items: ITEMS }), []);
});

test('validateOrder: ยอดที่เก็บลูกค้าติดลบไม่ผ่าน', () => {
  const errs = validateOrder({ customerName: 'ก', items: ITEMS, customerTotal: '-1' });
  assert.ok(errs.includes('ยอดที่เก็บลูกค้าต้องไม่ติดลบ'));
});

test('toCreatePayload: ส่งรายการและยอดที่ร้านตั้ง ไม่ส่งยอดจ่ายเงิน และแนบรหัสกันซ้ำ', () => {
  const p = toCreatePayload(
    { customerName: ' ครูแนน ', jobName: '', items: ITEMS, customerTotal: 1600, customerPhone: '', fulfillment: 'pickup', handlerName: 'น้ำ', dueDate: '2026-11-10', note: '' },
    { clientRef: 'ref-123456789' }
  );
  assert.equal(p.customerName, 'ครูแนน');
  assert.equal(p.jobName, null);
  assert.equal(p.customerTotal, 1600);
  assert.equal(p.customerPhone, null);
  assert.equal(p.fulfillment, 'pickup');
  assert.equal(p.dueDate, '2026-11-10');
  assert.equal(p.clientRef, 'ref-123456789');
  assert.equal('paidAmount' in p, false);
  assert.equal('payMethod' in p, false);
  assert.equal(p.items[0].total, 1350);
});

test('toCreatePayload: วันนัดรับรูปแบบผิดจะไม่ส่งไปให้เซิร์ฟเวอร์ปฏิเสธทั้งใบ', () => {
  const p = toCreatePayload({ customerName: 'ก', items: ITEMS, dueDate: '10/11/2026' });
  assert.equal(p.dueDate, null);
});

test('toPatchPayload: ไม่ส่งสถานะการชำระเงินหรือยอดที่จ่ายแล้วปนมา', () => {
  const p = toPatchPayload({ customerName: 'ครูแนน', items: ITEMS, customerTotal: '' });
  assert.equal(p.total, 1590);
  assert.equal(p.subtotal, 1590);
  assert.equal(p.job_name, 'ครูแนน');
  assert.equal('paid_amount' in p, false);
  assert.equal('payment_status' in p, false);
  assert.equal(p.due_date, null);
});

test('draftToForm: ผลจากการอ่านข้อความเป็นฉบับให้ตรวจ ไม่ใช่ของที่บันทึกแล้ว', () => {
  const form = draftToForm(
    {
      jobName: 'ถ่ายเอกสาร',
      customerName: 'ครูแนน',
      jobDate: '2026-11-03',
      dueDate: '2026-11-05',
      items: [{ item_name: 'ถ่ายเอกสาร A4', quantity: 120, unit: 'แผ่น', unit_price: 1, total: 120 }],
      total: 120,
    },
    { customerName: 'อื่น' }
  );
  assert.equal(form.customerName, 'ครูแนน');
  assert.equal(form.items[0].quantity, 120);
  assert.equal(form.customerTotal, 120);
  assert.equal(form.dueDate, '2026-11-05');
  assert.equal(form.id, null);
});

test('draftToForm: ข้อความที่อ่านไม่ได้รายการ ยังได้ฟอร์มเปล่าหนึ่งแถว', () => {
  const form = draftToForm({ items: [] }, { customerName: 'ก' });
  assert.equal(form.items.length, 1);
  assert.equal(form.customerName, 'ก');
});

test('jobToForm: แปลงงานจากเซิร์ฟเวอร์ให้ฟอร์มใช้ได้ และไม่หลุดช่องว่างเป็น null', () => {
  const form = jobToForm({
    id: 'j1',
    job_number: 'MJ-20260103-0001',
    customer_name: 'ครูแนน',
    customer_phone: null,
    job_date: '2026-11-03',
    due_date: null,
    fulfillment: 'delivery',
    handler_name: null,
    note: null,
    total: '1590.00',
    items: [{ item_name: 'A4', size: null, quantity: '10', unit: 'รีม', unit_price: '135.00' }],
  });
  assert.equal(form.jobNumber, 'MJ-20260103-0001');
  assert.equal(form.customerPhone, '');
  assert.equal(form.dueDate, '');
  assert.equal(form.customerTotal, 1590);
  assert.equal(form.items[0].quantity, 10);
  assert.equal(form.items[0].size, '');
});

test('isDirty: แก้แล้วเทียบกับฉบับที่บันทึกเป็นจริง ไม่แก้ก็ไม่จริง', () => {
  const saved = blankForm({ customerName: 'ก', jobDate: '2026-11-03' });
  const form = JSON.parse(JSON.stringify(saved));
  assert.equal(isDirty(form, saved), false);
  form.items[0].quantity = 5;
  assert.equal(isDirty(form, saved), true);
});

test('workLabel: สถานะงานมาจาก done_at / picked_up_at ตามฝั่งเซิร์ฟเวอร์', () => {
  assert.equal(workLabel({}), 'รอดำเนินการ');
  assert.equal(workLabel({ done_at: '2026-11-03' }), 'ทำเสร็จ รอรับ/ส่ง');
  assert.equal(workLabel({ done_at: '2026-11-03', picked_up_at: '2026-11-04' }), 'ส่งมอบแล้ว');
  assert.equal(workLabel({ status: 'cancelled' }), 'ยกเลิกแล้ว');
});

test('closeWarnings: เตือนทั้งยังไม่ส่งมอบและยอดค้าง ไม่เตือนเมื่อครบ', () => {
  assert.deepEqual(closeWarnings({ delivered: false, balanceDue: 300 }), ['ยังไม่ได้ส่งมอบงาน', 'ยังมียอดค้าง 300.00 บาท']);
  assert.deepEqual(closeWarnings({ delivered: true, balanceDue: 0 }), []);
  assert.deepEqual(closeWarnings({ delivered: true, balanceDue: 0.004 }), []);
});

test('summaryText: ไม่แต่งตัวเลขภาษี และบอกว่ายังตั้งค่าภาษีไม่ได้', () => {
  const text = summaryText({ customerName: 'ครูแนน', items: ITEMS, customerTotal: '' }, { jobNumber: 'MJ-1' });
  assert.ok(text.includes('ยอดรวม 1,590.00 บาท'));
  assert.ok(text.includes('ยังไม่รวมภาษี'));
  assert.ok(!text.includes('VAT'));
  assert.ok(!text.includes('7%'));
  assert.ok(TAX_NOTE.includes('ยังตั้งค่าภาษีไม่ได้'));
});
