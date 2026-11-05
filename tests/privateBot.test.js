import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { gateEvent, DENIED_TEXT } from '../src/utils/access.js';
import { createApiRouter } from '../src/routes/api.js';

/* ร้านบอกว่า "ม่วงจดเป็นบอทส่วนตัวสำหรับฉันและใช้ดูหลังร้านเท่านั้น ... ห้ามเปิด
 * ข้อมูลงาน ยอดเงิน ข้อมูลลูกค้า หรือข้อมูลหลังร้านให้บุคคลอื่น ให้ตรวจสอบ LINE
 * User ID ก่อนเปิดสิทธิ์หลังร้าน"
 *
 * หลังร้านมีสองประตู ไม่ใช่ประตูเดียว: แชต กับหน้าแดชบอร์ด (LIFF) ปิดแค่แชต
 * แปลว่าใครที่รู้ URL ของแดชบอร์ดและล็อกอิน LINE ได้ ก็ยังเปิดดูยอดเงินได้อยู่ดี
 */

process.env.LIFF_ID = '1234567890-abcdefgh';

const OWNER = 'U' + '1'.repeat(32);
const STRANGER = 'U' + 'f'.repeat(32);
const ONLY_OWNER = { ALLOWED_LINE_USER_IDS: OWNER };

const msg = (userId, text) => ({ type: 'message', source: { userId }, message: { type: 'text', text } });

test('ประตูแชต: คนนอกไม่ได้ข้อมูลอะไรเลย', () => {
  const gate = gateEvent(msg(STRANGER, 'ดูงานวันนี้'), ONLY_OWNER);
  assert.equal(gate.action, 'deny');
  assert.equal(gate.text, DENIED_TEXT);

  // ข้อความปฏิเสธต้องไม่หลุดว่ามีร้านอะไร งานกี่ใบ หรือยอดเท่าไหร่
  for (const leak of ['นัฐภรณ์', 'ปริ้นงาน', 'เชียงกลาง', '฿', 'งานค้าง']) {
    assert.ok(!DENIED_TEXT.includes(leak), 'ข้อความปฏิเสธหลุด: ' + leak);
  }
});

test('ประตูแชต: เจ้าของผ่านตามปกติ', () => {
  assert.equal(gateEvent(msg(OWNER, 'ดูงานวันนี้'), ONLY_OWNER).action, 'pass');
  // ยังไม่ได้ตั้งรายชื่อ ก็ยังใช้ได้เหมือนเดิม
  assert.equal(gateEvent(msg(STRANGER, 'ดูงานวันนี้'), {}).action, 'pass');
});

/* ถ้าคำสั่งนี้ถูกปิดไปพร้อมกับทุกอย่าง เจ้าของที่กรอก id ผิดสักตัวจะล็อกตัวเอง
 * ออกถาวร โดยไม่มีทางถาม id ของตัวเองได้อีก
 */
test('"รหัสของฉัน" ตอบได้แม้อยู่นอกรายชื่อ และบอก id ของคนที่ถามเท่านั้น', () => {
  const gate = gateEvent(msg(STRANGER, 'รหัสของฉัน'), ONLY_OWNER);
  assert.equal(gate.action, 'my_id');
  assert.ok(gate.text.includes(STRANGER));
  assert.ok(!gate.text.includes(OWNER), 'หลุด id ของเจ้าของให้คนนอก');
  assert.ok(gate.text.includes('ALLOWED_LINE_USER_IDS'));
});

test('เหตุการณ์ที่ไม่มีตัวผู้ใช้ ถูกทิ้ง ไม่ถือว่าผ่าน', () => {
  assert.equal(gateEvent({ type: 'message', source: {}, message: { text: 'หวัดดี' } }, ONLY_OWNER).action, 'drop');
  assert.equal(gateEvent({}, ONLY_OWNER).action, 'drop');
});

test('postback ของคนนอกก็ไม่ผ่าน ไม่ใช่แค่ข้อความ', () => {
  // ปุ่มบนการ์ดเก่าที่ถูกส่งต่อให้คนอื่น กดแล้วต้องไม่เปิดหลังร้าน
  const ev = { type: 'postback', source: { userId: STRANGER }, postback: { data: 'action=today' } };
  assert.equal(gateEvent(ev, ONLY_OWNER).action, 'deny');
});

async function call(userId, allowed) {
  const prev = process.env.ALLOWED_LINE_USER_IDS;
  if (allowed === undefined) delete process.env.ALLOWED_LINE_USER_IDS;
  else process.env.ALLOWED_LINE_USER_IDS = allowed;

  let resolved = false;
  const app = express();
  app.use(express.json());
  app.use(
    '/api',
    createApiRouter({
      verify: async () => ({ userId }),
      resolveProfile: async () => {
        resolved = true;
        return { id: 'user-1', line_user_id: userId };
      },
      getDashboard: async () => ({ today: { jobs: [] } }),
    }),
  );

  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/me`, {
      headers: { authorization: 'Bearer t' },
    });
    return { status: res.status, body: await res.json().catch(() => null), resolved };
  } finally {
    server.close();
    if (prev === undefined) delete process.env.ALLOWED_LINE_USER_IDS;
    else process.env.ALLOWED_LINE_USER_IDS = prev;
  }
}

test('ประตูแดชบอร์ด: คนนอกได้ 403 และไม่ถูกสร้างเป็นผู้ใช้', async () => {
  const res = await call(STRANGER, OWNER);
  assert.equal(res.status, 403);
  assert.equal(res.body?.error, 'forbidden');
  // ด่านต้องอยู่ "ก่อน" การสร้าง/อ่านโปรไฟล์ ไม่ใช่หลัง
  assert.equal(res.resolved, false, 'คนนอกไม่ควรมีแถวในระบบหลังร้าน');
});

test('ประตูแดชบอร์ด: เจ้าของผ่านด่าน และยังเปิดได้เมื่อไม่ได้ตั้งรายชื่อ', async () => {
  /* ดูที่ "ผ่านด่านแล้วหรือยัง" ไม่ใช่ที่สถานะ 200 — /me เรียกฐานข้อมูลจริง
   * ต่อจากด่าน ซึ่งไม่ใช่เรื่องที่เทสต์นี้ถาม
   */
  const owner = await call(OWNER, OWNER);
  assert.notEqual(owner.status, 403);
  assert.ok(owner.resolved, 'เจ้าของไม่ผ่านด่าน');

  const open = await call(STRANGER, undefined);
  assert.notEqual(open.status, 403);
  assert.ok(open.resolved, 'ยังไม่ได้ตั้งรายชื่อ ต้องใช้ได้เหมือนเดิม');
});
