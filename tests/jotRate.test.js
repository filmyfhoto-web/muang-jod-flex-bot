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
    ['sqm', 'sheet', 'piece', 'unit', 'set']
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
