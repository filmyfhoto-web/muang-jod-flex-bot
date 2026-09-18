import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNaturalJob, splitNameDetail } from '../src/utils/nlParser.js';
import { classifyJob, deriveJobName } from '../src/utils/category.js';
import { normalizeExtraction } from '../src/services/nlpService.js';
import { subLine } from '../src/utils/itemLine.js';

/* ประโยคที่ร้านพิมพ์จริง ๆ ไม่ใช่ประโยคที่โค้ดอยากได้
 *
 * ร้านบอกว่า "ถ้าเขาพิมพ์ไป ม่วงก็จดไม่ได้ ไม่เข้าใจ" แล้วยกตัวอย่างมาเอง:
 *   "พี่ต่าย สั่งสติ๊กเกอร์ ติดของที่ระลึก ออกแบบใส่ชุดตชด ด้วย 50 ดวง ขนาด 5*6.5"
 * แล้วบอกต่อว่า "เราจะเขียนสลับ ก็อยากให้เข้าใจเราเลยอ่ะ"
 *
 * ของเดิมได้ชื่อรายการว่า "สั่งสติ๊กเกอร์ ติดของที่ระลึก ออกแบบใส่ชุดตชด ด้วย
 * ขนาด" — ทั้งประโยคยัดเป็นชื่อของ ซึ่งบนการ์ดและบนใบเสร็จอ่านแล้วเหมือน
 * ม่วงลอกมาโดยไม่เข้าใจอะไรเลย
 */

const SENTENCE = 'พี่ต่าย สั่งสติ๊กเกอร์ ติดของที่ระลึก ออกแบบใส่ชุดตชด ด้วย 50 ดวง ขนาด 5 *6.5';

test('ประโยคที่ร้านยกตัวอย่างมา แยกออกมาได้ครบทุกช่อง', () => {
  const d = parseNaturalJob(SENTENCE);
  assert.equal(d.customerName, 'พี่ต่าย');
  assert.equal(d.items.length, 1);

  const it = d.items[0];
  assert.equal(it.item_name, 'สติ๊กเกอร์');
  assert.equal(it.detail, 'ติดของที่ระลึก ออกแบบใส่ชุดตชด');
  assert.equal(it.size, '5 × 6.5 · ติดของที่ระลึก ออกแบบใส่ชุดตชด');
  assert.equal(it.quantity, 50);
  assert.equal(it.unit, 'ดวง');

  // ยังไม่บอกราคาก็จดได้ ร้านรับออเดอร์ก่อน ค่อยคิดราคาทีหลัง
  assert.equal(it.unit_price, 0);
  assert.equal(d.total, 0);

  // และงานนี้ต้องเข้าหมวดสติ๊กเกอร์ ไม่ใช่ "งานทั่วไป"
  assert.equal(classifyJob(d.items)?.type?.id, 'sticker');
  assert.equal(deriveJobName(d.items), 'สติ๊กเกอร์');
});

test('เขียนสลับลำดับ ก็ต้องได้ผลเหมือนกัน', () => {
  const orders = [
    'พี่ต่าย สั่งสติ๊กเกอร์ 50 ดวง ขนาด 5*6.5',
    'สติ๊กเกอร์ ขนาด 5*6.5 จำนวน 50 ดวง พี่ต่าย',
    'สั่งสติ๊กเกอร์ให้พี่ต่าย 50 ดวง 5*6.5',
  ];
  for (const text of orders) {
    const d = parseNaturalJob(text);
    const it = d.items[0];
    assert.equal(d.customerName, 'พี่ต่าย', text);
    assert.equal(it.item_name, 'สติ๊กเกอร์', text);
    assert.equal(it.quantity, 50, text);
    assert.equal(it.unit, 'ดวง', text);
    assert.match(String(it.size), /5 × 6\.5/, text);
  }
});

test('คำที่ร้านพูด ไม่ใช่ชื่อของ', () => {
  const cases = [
    ['สั่งป้ายไวนิล 2 ป้าย ป้ายละ 350', 'ป้ายไวนิล'],
    ['ขอตรายาง 1 อัน', 'ตรายาง'],
    ['เอาสติ๊กเกอร์ 10 ดวง', 'สติ๊กเกอร์'],
  ];
  for (const [text, want] of cases) {
    assert.equal(parseNaturalJob(text).items[0].item_name, want, text);
  }
});

/* กับดักของการตัดคำแบบ substring
 *
 * ภาษาไทยไม่เว้นวรรค การลบ "ขอ" ทิ้งดื้อ ๆ จะทำให้ "ของที่ระลึก" กลายเป็น
 * "งที่ระลึก" — พังกว่าเดิม จึงตัดเฉพาะตอนที่ส่วนที่เหลือยังเป็นของที่รู้จัก
 */
test('คำที่ขึ้นต้นเหมือนคำสั่ง แต่เป็นชื่อของจริง ต้องไม่โดนตัด', () => {
  assert.equal(parseNaturalJob('ของที่ระลึก 10 ชิ้น ชิ้นละ 20').items[0].item_name, 'ของที่ระลึก');
  assert.equal(parseNaturalJob('ของชำร่วย 5 ชิ้น ชิ้นละ 30').items[0].item_name, 'ของชำร่วย');
  // และของเดิมที่เคยกันไว้ ต้องยังกันอยู่
  assert.equal(parseNaturalJob('โฟมบอร์ด 40x60 ซม. 250 บาท').items[0].item_name, 'โฟมบอร์ด');
});

test('ไม่มีคำไหนที่ระบบรู้จักเลย ก็เก็บทั้งก้อนไว้เป็นชื่อ ดีกว่าเดาแล้วหาย', () => {
  assert.deepEqual(splitNameDetail('ที่คั่นหนังสือ ลายดอกไม้'), {
    name: 'ที่คั่นหนังสือ ลายดอกไม้',
    detail: null,
  });
  const d = parseNaturalJob('ที่คั่นหนังสือ ลายดอกไม้ 30 ชิ้น ชิ้นละ 12');
  assert.equal(d.items[0].item_name, 'ที่คั่นหนังสือ ลายดอกไม้');
  assert.equal(d.total, 360);
});

test('ขนาดที่พิมพ์มาคนละแบบ ออกมาแบบเดียวกันบนใบเสร็จ', () => {
  for (const text of ['สติ๊กเกอร์ 5*6.5 10 ดวง', 'สติ๊กเกอร์ 5x6.5 10 ดวง', 'สติ๊กเกอร์ 5 × 6.5 10 ดวง']) {
    assert.equal(parseNaturalJob(text).items[0].size, '5 × 6.5', text);
  }
});

/* ฝั่ง AI ต้องส่งข้อมูลรูปแบบเดียวกับฝั่งกฎ
 *
 * ไม่งั้นงานที่จดตอน ANTHROPIC_API_KEY ใช้ได้ กับตอนที่ใช้ไม่ได้ จะออกมาคนละ
 * หน้าตา ทั้งที่ร้านพิมพ์ประโยคเดียวกัน
 */
test('ผลจากฝั่ง AI ก็รวมรายละเอียดลงบรรทัดย่อยเหมือนกัน', () => {
  const draft = normalizeExtraction({
    customerName: 'พี่ต่าย',
    items: [
      {
        item_name: 'สติ๊กเกอร์',
        detail: 'ติดของที่ระลึก ออกแบบใส่ชุด ตชด',
        size: '5 × 6.5 ซม.',
        quantity: 50,
        unit: 'ดวง',
        unit_price: 0,
      },
    ],
    paidAmount: 0,
  });

  assert.ok(draft, 'งานที่ยังไม่มีราคาถูกทิ้งไปทั้งใบ');
  assert.equal(draft.items[0].item_name, 'สติ๊กเกอร์');
  assert.equal(draft.items[0].size, '5 × 6.5 ซม. · ติดของที่ระลึก ออกแบบใส่ชุด ตชด');
  assert.equal(draft.items[0].detail, 'ติดของที่ระลึก ออกแบบใส่ชุด ตชด');
  assert.equal(draft.items[0].quantity, 50);
  assert.equal(draft.total, 0);
});

test('บรรทัดย่อยที่พูดซ้ำกับชื่องาน ไม่ต้องพิมพ์ซ้ำ', () => {
  assert.equal(subLine('5 × 6.5', 'สติ๊กเกอร์', 'สติ๊กเกอร์'), '5 × 6.5');
  assert.equal(subLine(null, 'ติดของที่ระลึก', 'สติ๊กเกอร์'), 'ติดของที่ระลึก');
  assert.equal(subLine(null, null, 'สติ๊กเกอร์'), null);
  assert.equal(subLine('5 × 6.5', 'ก'.repeat(200), 'x').length, 100);
});
