import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* งานป้ายคิดตามพื้นที่ งานสติ๊กเกอร์ขายเป็นแผ่น
 *
 * ร้านถามว่า "งานสติ๊กเกอร์ต้องลงรายละเอียดอีกแบบไหม เช่น ตรม ละ ....... ได้กี่แผ่น
 * หรือ 13X19 แผ่นละ 50 บาท ค่าส่ง ....."
 *
 * ของเดิมฟอร์มมีช่องเรตช่องเดียว ป้ายว่า "ตรมละ (บาท)" ซึ่งถูกสำหรับไวนิล
 * (160×300 ตรมละ 165 = 792) แต่ผิดวิธีคิดสำหรับสติ๊กเกอร์ที่ขายเป็นแผ่น —
 * 13×19 แผ่นละ 50 คือ 50 บาท ขนาดไม่ได้เอาไปคูณราคาเลย
 *
 * ไฟล์นี้ล็อกสูตรของทั้งสองโหมดไว้ และล็อก id ของโหมดด้วย เพราะ id ถูกเก็บลง
 * ร่างในเครื่องของร้าน เปลี่ยนแล้วร่างเก่าจะอ่านผิดวิธีคิด
 */

// โหลดไฟล์ตัวจริงที่หน้าฟอร์มใช้ ไม่ใช่สำเนา — เทสต์กับจอต้องคิดเลขสูตรเดียวกัน
function loadRate() {
  const src = readFileSync(new URL('../public/liff/jot/rate.js', import.meta.url), 'utf8');
  const sandbox = {};
  new Function('globalThis', `${src}\nreturn globalThis.MJRate;`)(sandbox);
  return sandbox.MJRate;
}

const MJRate = loadRate();

test('id ของวิธีคิดต้องไม่เปลี่ยน — ร่างในเครื่องของร้านเก็บ id นี้ไว้', () => {
  assert.deepEqual(
    MJRate.MODES.map((m) => m.id),
    ['sqm', 'sheet', 'piece', 'unit', 'set', 'tier']
  );
  // โหมดแรกคือโหมดตั้งต้น และของที่ไม่รู้จักต้องตกมาที่นี่ ไม่ใช่ undefined
  assert.equal(MJRate.mode(undefined).id, 'sqm');
  assert.equal(MJRate.mode('ไม่มีจริง').id, 'sqm');
  assert.equal(MJRate.mode('sheet').piece, 'แผ่น');
});

test('งานป้ายคิดตามพื้นที่ — 160×300 ซม. ตรมละ 165 = 792', () => {
  const item = { w: 160, h: 300, unit: 'cm', rate: 165, rateMode: 'sqm' };
  assert.equal(MJRate.sqmOf(160, 300, 'cm').sqm, 4.8);
  assert.equal(MJRate.suggested(item), 792);

  // ยังไม่ใส่ขนาด ก็ยังคิดไม่ได้ ต้องเป็น 0 ไม่ใช่เอาเรตไปเป็นราคา
  assert.equal(MJRate.suggested({ ...item, w: 0 }), 0);
  assert.equal(MJRate.suggested({ ...item, h: 0 }), 0);
  // ไม่ใส่เรตก็คิดไม่ได้
  assert.equal(MJRate.suggested({ ...item, rate: 0 }), 0);
});

test('สติ๊กเกอร์ขายเป็นแผ่น — 13×19 นิ้ว แผ่นละ 50 คือ 50 ไม่ใช่ 50 คูณพื้นที่', () => {
  const item = { w: 13, h: 19, unit: 'inch', rate: 50, rateMode: 'sheet' };
  assert.equal(MJRate.suggested(item), 50);

  // ขนาดไม่เกี่ยวกับราคาในโหมดนี้ — ไม่ใส่ขนาดเลยราคาก็ยังเป็น 50
  assert.equal(MJRate.suggested({ ...item, w: 0, h: 0 }), 50);
  // และเปลี่ยนขนาดยังไงราคาก็ไม่ขยับ
  assert.equal(MJRate.suggested({ ...item, w: 100, h: 200 }), 50);

  // ทุกโหมดที่ไม่ใช่ sqm คิดเหมือนกันหมด
  for (const id of ['sheet', 'piece', 'unit', 'set']) {
    assert.equal(MJRate.suggested({ ...item, rateMode: id }), 50, id);
  }
});

test('"ตรมละ ....... ได้กี่แผ่น" — ตอบเป็นจำนวนแผ่นกับต้นทุนต่อแผ่น', () => {
  // 13×19 นิ้ว = 0.33 × 0.48 ม. = 0.16 ตร.ม. ต่อแผ่น
  const item = { w: 13, h: 19, unit: 'inch', rate: 400, rateMode: 'sqm' };
  const y = MJRate.yieldPerSqm(item);

  assert.equal(y.sqmPerSheet, 0.16);
  // ปัดลง เพราะครึ่งแผ่นขายไม่ได้ (1 / 0.16 = 6.25)
  assert.equal(y.sheets, 6);
  assert.equal(y.exact, 6.25);
  // ตรมละ 400 → ต้นทุนแผ่นละ 0.16 × 400 = 64
  assert.equal(y.costPerSheet, 64);

  // ไม่ใส่เรต ก็ยังบอกจำนวนแผ่นได้ แค่ไม่มีต้นทุน
  assert.equal(MJRate.yieldPerSqm({ ...item, rate: 0 }).costPerSheet, 0);
  assert.equal(MJRate.yieldPerSqm({ ...item, rate: 0 }).sheets, 6);
  // ไม่มีขนาด ตอบไม่ได้ ต้องเป็น null ไม่ใช่เดา
  assert.equal(MJRate.yieldPerSqm({ ...item, w: 0 }), null);
  assert.equal(MJRate.yieldPerSqm({}), null);

  // แผ่นใหญ่กว่าหนึ่งตารางเมตร ได้ไม่ถึงหนึ่งแผ่น — หน้าฟอร์มซ่อนบรรทัดนี้
  assert.equal(MJRate.yieldPerSqm({ w: 160, h: 300, unit: 'cm', rate: 165 }).sheets, 0);
});

test('หน่วยความยาวทุกแบบคิดเป็นตารางเมตรได้ถูก', () => {
  assert.equal(MJRate.sqmOf(100, 100, 'cm').sqm, 1);
  assert.equal(MJRate.sqmOf(1, 1, 'm').sqm, 1);
  // 39.37 นิ้ว ≈ 1 ม. → ~1 ตร.ม.
  assert.equal(MJRate.sqmOf(39.37, 39.37, 'inch').sqm, 1);
  assert.equal(MJRate.sqmOf(1, 1, 'ft').sqm, 0.09);
  // หน่วยเพี้ยนให้ตกมาที่ซม. ไม่ใช่ NaN
  assert.equal(MJRate.sqmOf(100, 100, 'ไม่รู้จัก').sqm, 1);
  // ป้ายขนาดอ่านออก ไม่มีเรตติดไปด้วย (ป้ายนี้ขึ้นใบเสร็จ)
  assert.equal(MJRate.sqmOf(13, 19, 'inch').label, '13 × 19 นิ้ว');
});

/* ตารางราคาสติ๊กเกอร์แบบช่วงจำนวน — ตามโปสเตอร์ราคาของร้าน
 *
 * ร้านส่งตารางมาว่า "สติ๊กเกอร์ต้องคิดแบบนี้": 6 แผ่น = 1 ตร.ม. แล้วราคาต่อ
 * ตารางเมตรลดลงตามยอดรวมที่สั่ง — 1–3 ตร.ม. 300 บาท, 4–9 เหลือ 250,
 * 10–14 เหลือ 200, 15 ขึ้นไปเหลือ 180
 *
 * หมายเหตุใต้ตาราง "เมื่อยอดรวมถึงแต่ละช่วง จะคิดราคาตามเรตของช่วงนั้น" แปลว่า
 * คิดเรตเดียวทั้งออเดอร์ ไม่ใช่ขั้นบันได — ซึ่งทำให้สั่ง 10 ตร.ม. (2,000) ถูกกว่า
 * สั่ง 9 ตร.ม. (2,250) จริง ๆ ตามที่ร้านทำไว้ ไม่ใช่ความผิดพลาดที่ต้องไปแก้ให้
 */

// ทุกแถวจากตาราง "ตัวอย่างคำนวณตาม ตร.ม." ของร้าน ลอกมาตรง ๆ
const POSTER = [
  [1, 6, 300], [2, 12, 600], [3, 18, 900],
  [4, 24, 1000], [5, 30, 1250], [6, 36, 1500],
  [7, 42, 1750], [8, 48, 2000], [9, 54, 2250],
  [10, 60, 2000], [11, 66, 2200], [12, 72, 2400],
  [13, 78, 2600], [14, 84, 2800], [15, 90, 2700],
];

test('ทุกแถวในตารางของร้าน ต้องได้ยอดตรงเป๊ะ', () => {
  for (const [sqm, sheets, total] of POSTER) {
    const q = MJRate.quote({ rateMode: 'tier', qty: sheets });
    assert.equal(q.sqm, sqm, `${sheets} แผ่น ควรได้ ${sqm} ตร.ม.`);
    assert.equal(q.total, total, `${sqm} ตร.ม. ควรได้ ${total} บาท`);
  }

  // ราคาเฉลี่ยต่อแผ่นที่ร้านเขียนไว้บนหัวตาราง
  const per = (sheets) => MJRate.quote({ rateMode: 'tier', qty: sheets }).price;
  assert.equal(per(6), 50);
  assert.equal(per(24), 41.67);
  assert.equal(per(60), 33.33);
  assert.equal(per(90), 30);
});

test('สั่งเยอะขึ้นแล้วถูกลงจริง แม้จะทำให้ยอดลดลงตอนข้ามช่วง', () => {
  const at = (sheets) => MJRate.quote({ rateMode: 'tier', qty: sheets }).total;
  // 9 ตร.ม. แพงกว่า 10 ตร.ม. — ตามตารางของร้าน ไม่ใช่บั๊ก
  assert.ok(at(54) > at(60), '9 ตร.ม. ควรแพงกว่า 10 ตร.ม.');
  assert.ok(at(84) > at(90), '14 ตร.ม. ควรแพงกว่า 15 ตร.ม.');
});

test('ขอบของแต่ละช่วง ตัดสินด้วย "ถึงช่วงนั้นหรือยัง"', () => {
  const rateAt = (sqm) => MJRate.tierFor(sqm).rate;
  assert.equal(rateAt(0.5), 300, 'ต่ำกว่าช่วงแรก ยังคิดเรตช่วงแรก ไม่ใช่ปฏิเสธ');
  assert.equal(rateAt(3.99), 300, 'ยังไม่ถึง 4 ยังเป็นเรตเดิม');
  assert.equal(rateAt(4), 250);
  assert.equal(rateAt(9.99), 250);
  assert.equal(rateAt(10), 200);
  assert.equal(rateAt(14.99), 200);
  assert.equal(rateAt(15), 180);
  assert.equal(rateAt(1000), 180, 'เกินช่วงสุดท้ายก็ยังเป็นเรตสุดท้าย');

  assert.equal(MJRate.tierFor(2).label, '1–3 ตร.ม.');
  assert.equal(MJRate.tierFor(5).label, '4–9 ตร.ม.');
  assert.equal(MJRate.tierFor(11).label, '10–14 ตร.ม.');
  assert.equal(MJRate.tierFor(20).label, '15 ตร.ม.ขึ้นไป');
});

test('ห้ามปัดพื้นที่ต่อแผ่น — ปัดแล้วทุกยอดเพี้ยนสูงไป 2%', () => {
  // ตารางของร้านเขียนว่าแผ่นละ 0.1667 ตร.ม. ซึ่งคือ 1/6 พอดี
  // ปัดเหลือ 0.17 แล้ว 6 แผ่นจะกลายเป็น 1.02 ตร.ม. และ 300 บาทจะกลายเป็น 306
  assert.equal(MJRate.sqmPerSheet({}), 1 / 6);
  assert.ok(Math.abs(MJRate.sqmPerSheet({}) - 0.1667) < 0.0001);
  assert.equal(MJRate.quote({ rateMode: 'tier', qty: 6 }).total, 300);
});

test('ใส่ขนาดแผ่นเอง ก็คิดจากขนาดนั้น ไม่ใช่ 1/6 ตายตัว', () => {
  // 50×50 ซม. = 0.25 ตร.ม./แผ่น → 16 แผ่น = 4 ตร.ม. → เรต 250 → 1,000
  const q = MJRate.quote({ rateMode: 'tier', qty: 16, w: 50, h: 50, unit: 'cm' });
  assert.equal(q.sqmPerSheet, 0.25);
  assert.equal(q.sqm, 4);
  assert.equal(q.tier.rate, 250);
  assert.equal(q.total, 1000);
  assert.equal(q.price, 62.5);
});

test('ยอดรวมทั้งงานเป็นตัวตัดสินช่วง ไม่ใช่รายการเดียว', () => {
  // ตารางของร้านพูดถึง "ยอดรวม" — สองแบบ แบบละ 2 ตร.ม. ต้องได้เรตของ 4 ตร.ม.
  const items = [
    { rateMode: 'tier', qty: 12 },
    { rateMode: 'tier', qty: 12 },
    { rateMode: 'sheet', qty: 5, rate: 20 }, // คนละวิธีคิด ต้องไม่ถูกนับรวม
  ];
  assert.equal(MJRate.tierSqmOf(items), 4);

  const tierSqm = MJRate.tierSqmOf(items);
  const a = MJRate.quote(items[0], { tierSqm });
  assert.equal(a.tier.rate, 250, 'รายการเดียว 2 ตร.ม. ต้องได้เรตของยอดรวม 4 ตร.ม.');
  assert.equal(a.total, 500);
  // สองรายการรวมกันได้เท่ากับสั่ง 4 ตร.ม. รวดเดียว ตามตารางของร้าน
  assert.equal(a.total + MJRate.quote(items[1], { tierSqm }).total, 1000);

  // ไม่มีรายการแบบช่วงราคาเลย ก็เป็น 0 ไม่ใช่ NaN
  assert.equal(MJRate.tierSqmOf([{ rateMode: 'sqm', qty: 3 }]), 0);
  assert.equal(MJRate.tierSqmOf([]), 0);
  assert.equal(MJRate.tierSqmOf(), 0);
});

test('ยอดของช่วงราคาไม่เพี้ยนสตางค์ — ใบเสร็จต้องบวกลงตัว', () => {
  // 4 ตร.ม. = 1,000 บาท หาร 24 แผ่น ได้ 41.666… ถ้าเก็บ 41.67 แล้วคูณกลับ
  // จะได้ 1,000.08 ซึ่งคือใบเสร็จที่ร้านต้องมานั่งอธิบายลูกค้า
  const q = MJRate.quote({ rateMode: 'tier', qty: 24 });
  assert.equal(q.price, 41.67);
  assert.equal(q.total, 1000, 'ยอดต้องมาจาก ตร.ม. × เรต ไม่ใช่ราคาต่อแผ่น × จำนวน');
  assert.notEqual(q.total, Math.round(q.price * 24 * 100) / 100);
});
