import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveMenuCommand, suggestMenuCommand, labelForAction } from '../src/utils/menuCommands.js';

/* ร้านพิมพ์ "ดูงานค้างหน่อย" สองรอบ แล้วได้คำทักทายกลับไปทั้งสองรอบ
 *
 * "สวัสดีค่ะ 💜 ม่วงจดพร้อมช่วยจดงานให้แล้วค่ะ / พิมพ์รายการงานมาได้เลย …"
 * ซึ่งไม่เกี่ยวกับสิ่งที่ถามเลย และไม่ได้บอกด้วยซ้ำว่าม่วงไม่เข้าใจ
 *
 * ร้านบอกว่า "อยากให้บอทตอบได้ในสิ่งที่เราถาม"
 *
 * สาเหตุ: ตารางคำสั่งเทียบแบบตรงตัวเป๊ะ ๆ — มีแต่ "งานค้าง" ไม่มี "ดูงานค้างหน่อย"
 */

test('คำสุภาพที่หุ้มคำสั่งไว้ ไม่ทำให้คำสั่งหาย', () => {
  assert.equal(resolveMenuCommand('ดูงานค้างหน่อย'), 'pending_payment', 'คำที่ร้านพิมพ์จริง');

  for (const said of [
    'ดูงานค้าง',
    'ขอดูงานค้างหน่อย',
    'เช็คงานค้างหน่อย',
    'ช่วยดูค้างรับให้หน่อยค่ะ',
    'ดูค้างรับที',
  ]) {
    assert.equal(resolveMenuCommand(said), 'pending_payment', said);
  }

  // ใช้ได้กับทุกคำสั่ง ไม่ใช่แก้เฉพาะคำเดียวที่ร้านบ่น
  assert.equal(resolveMenuCommand('ดูรายการล่าสุดหน่อย'), 'recent_jobs');
  assert.equal(resolveMenuCommand('เปิดสรุปวันนี้ที'), 'today_summary');
  assert.equal(resolveMenuCommand('ขอ qr หน่อย'), 'shop_qr');
  assert.equal(resolveMenuCommand('ขอดูใบเสร็จ'), 'view_receipt');
});

/* ปอกหัวท้ายแล้วยังต้องตรงกับชื่อคำสั่งเป๊ะ ๆ อยู่ดี
 *
 * การเทียบไม่ได้หลวมลงเลย — "ขอตรายาง 2 อัน" ปอกแล้วได้ "ตรายาง 2 อัน" ซึ่ง
 * ไม่ใช่คำสั่ง ก็ยังตกไปเป็นการจดงานเหมือนเดิม
 */
test('ประโยคจดงานและคำคุยเล่น ยังไม่ถูกอ่านเป็นคำสั่ง', () => {
  for (const said of [
    'ขอตรายาง 2 อัน',
    'ป้ายไวนิล 60x100 150 บาท',
    'ไวนิล 160x300 ตรมละ 165',
    'ดูสวยดีนะ',
    'สวัสดีค่ะ',
    'ขอบคุณค่ะ',
    'เปิดร้านกี่โมง',
    'ขอดูรูปหน่อย',
  ]) {
    assert.equal(resolveMenuCommand(said), null, said + ' ถูกอ่านเป็นคำสั่ง');
  }

  // คำที่เหลือแต่คำสุภาพ ไม่ใช่คำสั่งอะไรเลย
  assert.equal(resolveMenuCommand('ดู'), null);
  assert.equal(resolveMenuCommand('ขอ'), null);
  assert.equal(resolveMenuCommand('หน่อย'), null);
  assert.equal(resolveMenuCommand(''), null);
});

/* คำสั่งที่ขึ้นต้นด้วย "ดู" อยู่แล้ว ต้องไม่ถูกปอกหัวทิ้งจนหาไม่เจอ
 *
 * เทียบตรงตัวก่อนเสมอ แล้วค่อยลองแบบปอก
 */
test('คำสั่งเดิมที่มีคำว่า "ดู" อยู่ในชื่อ ยังทำงานเหมือนเดิม', () => {
  assert.equal(resolveMenuCommand('ดูงานทั้งหมด'), 'recent_jobs');
  assert.equal(resolveMenuCommand('งานค้าง'), 'pending_payment');
  assert.equal(resolveMenuCommand('จดงาน'), 'add_job');
  assert.equal(resolveMenuCommand('ตั้งค่า'), 'open_dashboard');
});

/* เดาไม่ออกก็อย่าตอบคำทักทาย — ถามกลับว่าหมายถึงอันนี้ไหม
 *
 * เสนอเป็นปุ่ม ไม่ใช่ทำให้เลย เพราะการเดาจากคำที่อยู่กลางประโยคหลวมเกินกว่า
 * จะลงมือเอง
 */
test('เดาคำสั่งที่ใกล้เคียงได้ สำหรับถามกลับ', () => {
  assert.equal(suggestMenuCommand('งานค้างมีอะไรบ้าง'), 'pending_payment');
  assert.equal(suggestMenuCommand('อยากรู้ว่ามีงานค้างรับกี่งาน'), 'pending_payment');

  // ไม่มีเค้าคำสั่งเลย ก็ไม่ต้องเดา
  assert.equal(suggestMenuCommand('สวัสดีค่ะ'), null);
  assert.equal(suggestMenuCommand('วันนี้อากาศดี'), null);
  assert.equal(suggestMenuCommand(''), null);

  // ปุ่มที่เสนอต้องมีป้ายชื่อจริง ไม่ใช่ชื่อ action ดิบ ๆ
  assert.equal(labelForAction('pending_payment'), 'งานค้าง');
  assert.equal(labelForAction('ไม่มี action นี้'), null);
});

/* ประโยคหนึ่งมีได้หลายคำสั่งซ้อนกัน — เอาคำที่ยาวที่สุด
 *
 * "แยกบิล" มีคำว่า "บิล" อยู่ข้างใน ถ้าเลือกคำสั้นจะเสนอ "ออกบิล" ให้ร้านที่
 * กำลังถามเรื่องแยกบิล ซึ่งเป็นคนละเรื่องกัน
 */
test('คำยาวชนะคำสั้น เมื่อคำสั่งซ้อนกันอยู่ในประโยคเดียว', () => {
  assert.equal(suggestMenuCommand('แยกบิลยังไง'), 'split_bills', 'เดาเป็นออกบิล ซึ่งคนละเรื่อง');
  assert.equal(suggestMenuCommand('บิลยังไง'), 'create_bill');

  // คำสั่งที่ชื่อยาวกว่าอยู่ในประโยค ต้องชนะคำสั่งที่ชื่อสั้นกว่า
  assert.equal(suggestMenuCommand('ขอค้างรับ & ติดตามงาน'), 'pending_payment');
});
