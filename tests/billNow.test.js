import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNaturalJob, extractCustomer, trimNameTail } from '../src/utils/nlParser.js';
import { startCollecting, nextSlot, nextQuestion, readTurn } from '../src/utils/slots.js';
import { splitDump } from '../src/utils/dumpSplit.js';
import { isWholeNewJob } from '../src/handlers/messageHandler.js';

/* "พิมพ์แบบนี้ก็ยังไม่เข้าใจ โอ้ยยยนนนนนน"
 *
 * ร้านพิมพ์งานหนึ่งงานเป็นสามบรรทัด แล้วม่วงตอบกลับว่า "แก้ขนาดเป็น 0.6 × 1.6
 * นิ้ว และจำนวนเป็น 1 ผืน และชื่อลูกค้าเป็นน้องป่านสั่งแล้วค่ะ / ต้องการแนบรูป
 * หรือหลักฐานประกอบงานไหมคะ?" — ผิดสี่อย่างในข้อความเดียว
 *
 * และร้านบอกว่าจริง ๆ ต้องการอะไร: "บางที ฉันจะออกบิลเลย ม่วงก็แค่ออกบิลแล้ว
 * เอางานลงไว้ให้เป็นหมวด ๆ ดิ"
 */
const ORDER = `งานไวนิล งานสีดำน้องป่านสั่ง
ขนาด 0.6*1.6  1 ผืน
200 บาท`;

test('งานเดียวที่เขียนสามบรรทัด เป็นงานเดียว ไม่ใช่สองรายการ', () => {
  const d = parseNaturalJob(ORDER);

  assert.equal(d.items.length, 1, 'บรรทัดราคากลายเป็นรายการที่สอง');
  assert.equal(d.total, 200, 'คิดเงินเกิน — เลข 1 ของ "1 ผืน" ถูกอ่านเป็นราคา');

  const [it] = d.items;
  assert.equal(it.item_name, 'ไวนิล', 'ชื่อของกลายเป็น "ขนาด ผืน"');
  assert.equal(it.quantity, 1);
  assert.equal(it.unit, 'ผืน');
  assert.equal(it.unit_price, 200);
  assert.match(String(it.size), /0\.6 × 1\.6/);
  assert.equal(it.detail, 'สีดำ', 'สีที่ร้านสั่งหายไป');
});

/* ราคาที่ขึ้นบรรทัดใหม่ เป็นราคาของบรรทัดบน
 *
 * แต่ของที่มีชื่อเป็นของตัวเอง ยังต้องแยกกันเหมือนเดิม
 */
test('บรรทัดที่เป็นตัวเลขล้วน คือราคา ไม่ใช่ของที่สั่ง', () => {
  const one = parseNaturalJob('ไวนิล 0.6*1.6 1 ผืน\n200');
  assert.equal(one.items.length, 1);
  assert.equal(one.total, 200);

  /* ของคนละอย่างที่ต่างมีชื่อของตัวเอง ยังแยกกัน
   *
   * ยอดที่ถูกของกองนี้คือ ฿500 ซึ่งมาจาก splitDump ที่อ่านทีละบรรทัด — ทางนี้
   * เป็นทางของงานใบเดียว ตรงนี้จึงคุมแค่ว่ายังไม่ถูกยุบรวมกัน
   */
  const two = parseNaturalJob('พี่ต่าย\nสติ๊กเกอร์ 50 ดวง ดวงละ 5\nตรายาง 1 อัน 250');
  assert.equal(two.items.length, 2, 'ของสองอย่างถูกยุบเป็นอย่างเดียว');
  assert.equal(splitDump('พี่ต่าย\nสติ๊กเกอร์ 50 ดวง ดวงละ 5\nตรายาง 1 อัน 250').total, 500);
});

/* ชื่อลูกค้ากวาดคำกริยาที่ติดมาข้างหลังไปด้วย
 *
 * ภาษาไทยไม่เว้นวรรค "น้องป่านสั่ง" จึงถูกอ่านเป็นชื่อทั้งก้อน แล้วใบเสร็จออก
 * ในชื่อที่ไม่ใช่ชื่อใคร
 */
test('คำว่า "สั่ง" ท้ายชื่อ ไม่ใช่ส่วนหนึ่งของชื่อ', () => {
  assert.equal(parseNaturalJob(ORDER).customerName, 'น้องป่าน');
  assert.equal(extractCustomer('น้องป่านสั่ง').customerName, 'น้องป่าน');
  assert.equal(extractCustomer('พี่ต่ายฝากมา').customerName, 'พี่ต่าย');

  // ชื่อที่ไม่ได้ลงท้ายด้วยกริยา ห้ามแตะ
  assert.equal(extractCustomer('น้องป่าน').customerName, 'น้องป่าน');
  assert.equal(trimNameTail('พี่นก'), 'พี่นก');

  /* ตัดแล้วต้องเหลือเป็นชื่อ ไม่ใช่ตัวอักษรเดียว
   *
   * "พี่สั่ง" ตัดแล้วเหลือ "พี่" ซึ่งเป็นแค่คำนำหน้า ไม่ใช่ชื่อคน จึงไม่ตัด
   */
  assert.equal(trimNameTail('กฝาก'), 'กฝาก');
});

/* หน่วยที่เดาให้ ตอนร้านไม่ได้ใส่มา
 *
 * ม่วงตอบว่า "0.6 × 1.6 นิ้ว" — ป้ายไวนิลขนาดนิ้วครึ่งไม่มีในโลกของร้าน
 * ที่ถูกคือเมตร เพราะคำตอบขึ้นกับว่ากำลังสั่งงานอะไร ไม่ใช่ขนาดของตัวเลข
 */
test('ป้ายวัดเป็นเมตร กรอบรูปวัดเป็นนิ้ว', () => {
  assert.equal(startCollecting('งานไวนิล ขนาด 0.6*1.6').fields.size.unit, 'm');
  assert.equal(startCollecting('งานสติ๊กเกอร์ 5*6.5').fields.size.unit, 'm');
  assert.equal(startCollecting('มีงานกรอบรูป 12*18').fields.size.unit, 'inch');

  // เลขใหญ่ยังเป็นเซนติเมตรเหมือนเดิม
  assert.equal(startCollecting('ป้ายไวนิล 160*300').fields.size.unit, 'cm');

  // ใส่หน่วยมาเอง เชื่อหน่วยนั้นเสมอ
  assert.equal(startCollecting('งานไวนิล 60*160 ซม').fields.size.unit, 'cm');
});

/* พอรู้ราคาแล้ว ไม่ต้องถามอะไรที่ไม่เปลี่ยนตัวเลขบนบิล
 *
 * ร้าน: "ฉันจะออกบิลเลย ม่วงก็แค่ออกบิลแล้วเอางานลงไว้ให้เป็นหมวด ๆ ดิ"
 */
test('บอกราคามาแล้ว ม่วงไม่ถามเรื่องที่ไม่เกี่ยวกับเงิน', () => {
  // ไวนิลเคยโดนถาม "ต้องการเจาะตาไก่ไหมคะ?" คั่นกลางก่อนถึงราคา
  const vinyl = startCollecting('งานไวนิล 0.6*1.6 1 ผืน 200 บาท ลูกค้าน้องป่าน');
  assert.equal(nextSlot(vinyl), 'due', 'ยังถามเรื่องที่ไม่เกี่ยวกับบิล');

  // ยังไม่รู้ราคา = ยังพาไปทีละข้อเหมือนเดิม คำถามพวกนี้ไม่ได้หายไปไหน
  const started = startCollecting('มีงานไวนิล 0.6*1.6 1 ผืน');
  assert.equal(nextSlot(started), 'eyelet', 'คิดเงินยังไม่ได้ ก็ยังต้องถามตามลำดับเดิม');
});

/* พิมพ์งานใหม่เข้ามาตอนม่วงถามงานเก่าอยู่ = งานใหม่ ไม่ใช่การแก้งานเก่า
 *
 * ของเดิมข้อความถูกอ่านเป็นคำตอบ ร้านจึงเห็น "แก้ขนาดเป็น ... แล้วค่ะ" ทั้งที่
 * เพิ่งสั่งงานใหม่ ต้องพิมพ์ "ยกเลิก" ก่อนถึงจะจดงานใหม่ได้
 */
test('งานใหม่ทั้งใบ แยกออกจากคำตอบข้อเดียวได้', () => {
  assert.equal(isWholeNewJob(ORDER), true, 'งานใหม่ถูกกลืนไปเป็นคำตอบ');
  assert.equal(isWholeNewJob('ตรายาง พี่ต่าย 2 อัน อันละ 250'), true);

  // คำตอบของคำถามที่ม่วงถามค้างไว้ ต้องไม่ถูกอ่านเป็นงานใหม่
  for (const answer of ['200', '200 บาท', '0.6*1.6', '2 ผืน', 'ป้ายละ 200', 'ไม่ต้อง', 'ข้าม', 'น้องป่าน']) {
    assert.equal(isWholeNewJob(answer), false, `"${answer}" ถูกอ่านเป็นงานใหม่`);
  }
});

test('ตอบคำถามทีละข้อ ยังทำงานเหมือนเดิม', () => {
  let state = startCollecting('มีงานไวนิล');
  state = { ...state, asking: nextQuestion(state).id };
  state = readTurn(state, '0.6*1.6 1 ผืน').state;
  state = { ...state, asking: nextQuestion(state).id };

  assert.equal(state.fields.size.unit, 'm');
  assert.equal(state.fields.qty.count, 1);
});
