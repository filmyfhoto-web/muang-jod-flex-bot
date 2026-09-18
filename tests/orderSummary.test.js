import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOrderSummary,
  isShippingLine,
  sheetsOf,
  sqmOfSheets,
  SHEETS_PER_SQM,
} from '../src/utils/orderSummary.js';

/* ใบสรุปใบสั่ง — ตามตัวอย่างที่ร้านส่งมา
 *
 * ร้านส่ง "สรุปใบสั่งทำสติ๊กเกอร์" มาแล้วบอกว่า "อยากทำใบสรุปราคาแบบนี้ไปด้วย"
 * ตารางแยกตามวันที่สั่ง แต่ละวันมีรายการ ขนาด ตร.ม. จำนวนแผ่น ราคา แล้วปิดท้าย
 * ด้วยยอดรวมที่แยกค่าสินค้ากับค่าส่งออกจากกัน
 *
 * ตัวเลขข้างล่างลอกจากใบของร้านทั้งใบ ทั้งยอดรายวันและยอดรวม
 */

const sticker = (name, size, sheets, amount) => ({
  item_name: name,
  size,
  quantity: sheets,
  unit: 'แผ่น',
  total: amount,
});

// วันที่ 18/07/69 — 7 รายการ รวม 72 แผ่น 3,350 บาท
const DAY_18 = {
  job_date: '2026-07-18',
  job_name: 'สติ๊กเกอร์ 18 ก.ค.',
  total: 3350,
  items: [
    sticker('สติ๊กเกอร์ กล้วยตาก', '4 × 8 ซม.', 6, 300),
    sticker('สติ๊กเกอร์ Mixed Fruit', '4 × 8 ซม.', 6, 300),
    sticker('สติ๊กเกอร์ Lemon', '4 × 8 ซม.', 6, 300),
    sticker('สติ๊กเกอร์ ดอกเกลือ', '4 × 8 ซม.', 6, 300),
    sticker('สติ๊กเกอร์ Rice Milk', '4 × 8 ซม.', 6, 300),
    sticker('สติ๊กเกอร์ วิธีใช้', '4 × 8 ซม.', 30, 1250),
    sticker('สติ๊กเกอร์ Lhonk khal', null, 12, 600),
  ],
};

// วันที่ 20/07/69 — 2 รายการ รวม 18 แผ่น 900 บาท + ค่าส่งของสองวันรวมกัน 105
const DAY_20 = {
  job_date: '2026-07-20',
  job_name: 'สติ๊กเกอร์ 20 ก.ค.',
  total: 1005,
  items: [
    sticker('สติ๊กเกอร์ กลิ่นไอเกลือ Bakery', null, 6, 300),
    sticker('สติ๊กเกอร์ GLIN', null, 12, 600),
    { item_name: 'ค่าส่ง', size: null, quantity: 1, unit: null, total: 105 },
  ],
};

// วันที่ 24/07/69 — 4 รายการ รวม 42 แผ่น 2,100 บาท + ค่าส่ง 80
const DAY_24 = {
  job_date: '2026-07-24',
  job_name: 'สติ๊กเกอร์ 24 ก.ค.',
  total: 2180,
  items: [
    sticker('สติ๊กเกอร์ หลงเขา', '5 × 10 ซม.', 6, 300),
    sticker('สติ๊กเกอร์ เมล็ดกาแฟ', '9 × 11 ซม.', 6, 300),
    sticker('สติ๊กเกอร์ Lhonk khal', null, 18, 900),
    sticker('สติ๊กเกอร์ เขียววงรี', null, 12, 600),
    { item_name: 'ค่าส่ง', size: null, quantity: 1, unit: null, total: 80 },
  ],
};

const BILL = {
  bill_number: 'MJ-B-20260724-0001',
  customer_name: 'ร้านหลงเขา',
  total: 6535,
  jobs: [DAY_24, DAY_18, DAY_20], // สลับลำดับมา ใบสรุปต้องเรียงวันเอง
};

test('6 แผ่น = 1 ตร.ม. ตามตารางของร้าน', () => {
  assert.equal(SHEETS_PER_SQM, 6);
  assert.equal(sqmOfSheets(6), 1);
  assert.equal(sqmOfSheets(30), 5);
  assert.equal(sqmOfSheets(72), 12);
  assert.equal(sqmOfSheets(0), 0);
});

test('นับแผ่นเฉพาะของที่ขายเป็นแผ่น', () => {
  assert.equal(sheetsOf({ quantity: 6, unit: 'แผ่น' }), 6);
  // ป้ายนับเป็นผืน ตรายางนับเป็นอัน เอามารวมเป็นแผ่นไม่ได้ ไม่งั้นยอดแผ่นบนใบ
  // สรุปกลายเป็นเลขที่ไม่ได้แปลว่าอะไร
  assert.equal(sheetsOf({ quantity: 2, unit: 'ผืน' }), 0);
  assert.equal(sheetsOf({ quantity: 3, unit: 'อัน' }), 0);
  assert.equal(sheetsOf({ quantity: 5, unit: null }), 0);
  assert.equal(sheetsOf({}), 0);
});

test('ค่าส่งแยกออกจากค่าสินค้าได้', () => {
  for (const w of ['ค่าส่ง', 'ค่าจัดส่ง', 'ค่าขนส่ง', ' ค่าส่ง ', 'Shipping', 'delivery']) {
    assert.ok(isShippingLine(w), `${w} ควรเป็นค่าส่ง`);
  }
  // ของที่แค่มีคำว่าส่งอยู่ในชื่อ ไม่ใช่ค่าส่ง
  assert.ok(!isShippingLine('สติ๊กเกอร์ ส่งของ'));
  assert.ok(!isShippingLine('ค่าส่งด่วน EMS'));
  assert.ok(!isShippingLine(''));
  assert.ok(!isShippingLine());
});

test('ยอดรายวันตรงกับใบของร้านทุกวัน', () => {
  const s = buildOrderSummary(BILL);

  // เรียงวันจากเก่าไปใหม่ แม้ข้อมูลจะมาสลับลำดับ
  assert.deepEqual(s.days.map((d) => d.date), ['2026-07-18', '2026-07-20', '2026-07-24']);

  const [d18, d20, d24] = s.days;

  // รวม 18/07/69 → 72 แผ่น 3,350 บาท ไม่มีค่าส่ง
  assert.equal(d18.totals.sheets, 72);
  assert.equal(d18.totals.sqm, 12);
  assert.equal(d18.totals.goods, 3350);
  assert.equal(d18.totals.shipping, 0);

  // รวม 20/07/69 → 18 แผ่น 900 บาท + ค่าส่ง 105
  assert.equal(d20.totals.sheets, 18);
  assert.equal(d20.totals.sqm, 3);
  assert.equal(d20.totals.goods, 900);
  assert.equal(d20.totals.shipping, 105);
  assert.equal(d20.totals.total, 1005);

  // รวม 24/07/69 → 42 แผ่น 2,100 บาท + ค่าส่ง 80 = 2,180
  assert.equal(d24.totals.sheets, 42);
  assert.equal(d24.totals.sqm, 7);
  assert.equal(d24.totals.goods, 2100);
  assert.equal(d24.totals.shipping, 80);
  assert.equal(d24.totals.total, 2180);
});

test('ยอดรวมทั้งใบตรงกับกล่อง "สรุปทั้งหมด" ของร้าน', () => {
  const s = buildOrderSummary(BILL);
  // จำนวนแผ่น (รวม) 132 · ค่าสินค้า 6,350 · ค่าส่ง 185 (105 + 80) · รวม 6,535
  assert.equal(s.grand.sheets, 132);
  assert.equal(s.grand.goods, 6350);
  assert.equal(s.grand.shipping, 185);
  assert.equal(s.grand.total, 6535);
  assert.equal(s.grand.sqm, 22);

  assert.equal(s.billNumber, 'MJ-B-20260724-0001');
  assert.equal(s.customerName, 'ร้านหลงเขา');
  assert.equal(s.charged, 6535);
  assert.equal(s.adjusted, false, 'ยอดบิลตรงกับผลบวก จึงไม่ใช่ราคาที่ปัดแล้ว');
});

test('ค่าส่งไม่ถูกนับเป็นแผ่น และไม่ปนกับค่าสินค้า', () => {
  const s = buildOrderSummary(BILL);
  const ship = s.days.flatMap((d) => d.lines).filter((l) => l.shipping);
  assert.equal(ship.length, 2);
  assert.deepEqual(ship.map((l) => l.amount), [105, 80]);
  assert.deepEqual(ship.map((l) => l.sheets), [0, 0], 'ค่าส่งต้องไม่นับเป็นแผ่น');
});

test('ร้านปัดราคาแล้ว ใบสรุปโชว์ยอดที่เก็บจริง ไม่ใช่ผลบวก', () => {
  // ลูกค้าบวกเองแล้วต้องตรงกับที่โอนมา ไม่งั้นก็ต้องโทรมาถาม
  const rounded = buildOrderSummary({ ...BILL, total: 6500 });
  assert.equal(rounded.grand.total, 6535, 'ผลบวกของบรรทัดไม่เปลี่ยน');
  assert.equal(rounded.charged, 6500, 'ยอดที่เก็บคือยอดบนบิล');
  assert.equal(rounded.adjusted, true);
});

test('งานที่จดมาเป็นก้อนเดียว ไม่มีรายการย่อย ก็ยังขึ้นใบ', () => {
  const s = buildOrderSummary({
    total: 500,
    jobs: [{ job_date: '2026-07-18', job_name: 'ป้ายไวนิลหน้าร้าน', total: 500, items: [] }],
  });
  assert.equal(s.days.length, 1);
  assert.equal(s.days[0].lines.length, 1);
  assert.equal(s.days[0].lines[0].name, 'ป้ายไวนิลหน้าร้าน');
  assert.equal(s.days[0].totals.goods, 500);
  // ไม่รู้ว่ากี่แผ่น ก็ต้องเป็น 0 ไม่ใช่เดา
  assert.equal(s.days[0].totals.sheets, 0);
});

test('บิลเปล่า ๆ ไม่พัง', () => {
  const s = buildOrderSummary({});
  assert.deepEqual(s.days, []);
  assert.equal(s.grand.total, 0);
  assert.equal(s.charged, 0);
  assert.equal(buildOrderSummary().days.length, 0);
});

/* หน้าใบสรุปที่ /s/<token> — บิลใบเดียวกับใบเสร็จ มองคนละมุม */
test('หน้าใบสรุปแสดงทุกตัวเลขที่ร้านต้องการ', async () => {
  const { renderSummaryHtml } = await import('../src/routes/summary.js');
  const html = renderSummaryHtml(BILL, { shop_name: 'นัฐภรณ์ การพิมพ์' });

  // หัวใบ: ชื่อร้าน เลขบิล ลูกค้า
  for (const want of ['สรุปใบสั่งทำ', 'นัฐภรณ์ การพิมพ์', 'MJ-B-20260724-0001', 'ร้านหลงเขา']) {
    assert.ok(html.includes(want), `ขาด ${want}`);
  }
  // หัวตารางครบทุกคอลัมน์ตามใบของร้าน
  for (const col of ['ลำดับ', 'รายการ', 'ขนาด', 'ตร.ม.', 'แผ่น', 'ราคา']) {
    assert.ok(html.includes(`>${col}</th>`), `ขาดคอลัมน์ ${col}`);
  }
  // ยอดรายวันและยอดรวม
  for (const want of ['รวม 18 ก.ค. 2569', '฿3,350', 'รวม 20 ก.ค. 2569', '฿1,005', 'รวม 24 ก.ค. 2569', '฿2,180']) {
    assert.ok(html.includes(want), `ขาด ${want}`);
  }
  for (const want of ['จำนวนแผ่น (รวม)', '>132<', '฿6,350', '฿185', '฿6,535']) {
    assert.ok(html.includes(want), `ขาด ${want}`);
  }
  // หน้านี้ลูกค้าเปิดได้ด้วยลิงก์ ต้องไม่ถูกค้นเจอในกูเกิล
  assert.ok(html.includes('noindex'), 'หน้านี้ต้อง noindex');
});

test('ชื่อที่ลูกค้าตั้งเอง ไม่กลายเป็นโค้ดบนหน้าเว็บ', async () => {
  const { renderSummaryHtml } = await import('../src/routes/summary.js');
  const html = renderSummaryHtml({
    ...BILL,
    customer_name: '<script>alert(1)</script>',
    jobs: [{ job_date: '2026-07-18', job_name: 'x', total: 1, items: [
      { item_name: '<img src=x onerror=alert(1)>', size: '<b>4</b>', quantity: 6, unit: 'แผ่น', total: 1 },
    ] }],
  });
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(!html.includes('<img src=x onerror'));
  assert.ok(html.includes('&lt;script&gt;'), 'ต้องถูก escape ไม่ใช่ถูกลบ');
});
