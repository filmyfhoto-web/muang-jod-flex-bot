import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildReply } from '../src/replies.js';
import { applyHoliday, createNoticeTracker } from '../src/holiday.js';

const shop = JSON.parse(readFileSync(new URL('../data/shop.json', import.meta.url), 'utf8'));

test('shipped config answers only what it knows', () => {
  assert.equal(shop.replyOnlyKnown, true);
  assert.equal(shop.ackMedia, false);
});

test('text the shop has no answer for gets no reply at all', () => {
  for (const t of ['xyz', 'มีเวลาว่างไหม', 'ช่วยหน่อยครับพี่', 'ราคาเท่าไหร่', '555', 'ok']) {
    const r = buildReply(t, shop);
    assert.deepEqual(r.messages, [], t);
    assert.equal(r.silent, true);
  }
});

test('everything that is set up still answers', () => {
  const known = ['สวัสดีค่ะ', 'ร้านเปิดกี่โมง', 'สั่งของ', 'ที่ตั้งร้าน', 'ค่าส่งเท่าไหร่', 'โอนยังไง', 'ใบเสร็จ',
    'ปากกา', 'ดินสอ', 'สมุด', 'กระดาษ a4', 'อุปกรณ์การเรียน 2-69', 'ขอบคุณค่ะ', 'แอดมิน', 'เมนู', 'ทำไวนิล', 'ใบเสนอราคา'];
  for (const t of known) assert.ok(buildReply(t, shop).messages.length > 0, t);
});

test('in the middle of "which school?", an unknown name is still answered (asked again)', () => {
  const r = buildReply('โรงเรียนอะไรไม่รู้', shop, { awaitingSchool: true });
  assert.ok(r.messages.length > 0);
  assert.equal(r.awaitingSchool, true);
});

test('on a Saturday an unknown message still earns the closing notice, once', () => {
  const sat = new Date('2026-10-03T05:00:00Z');
  const tracker = createNoticeTracker();
  const first = applyHoliday(buildReply('xyz', shop).messages, { shop, userId: 'u', tracker, now: sat });
  assert.equal(first.length, 1);
  assert.match(first[0].text, /ร้านหยุดทุกวันเสาร์/);
  assert.deepEqual(applyHoliday(buildReply('xyz', shop).messages, { shop, userId: 'u', tracker, now: sat }), []);
  // weekdays: nothing at all
  assert.deepEqual(applyHoliday([], { shop, userId: 'u2', tracker, now: new Date('2026-10-02T05:00:00Z') }), []);
});

test('switching replyOnlyKnown off brings the "sorry" card back', () => {
  const r = buildReply('xyz', { ...shop, replyOnlyKnown: false });
  assert.equal(r.messages[0].type, 'flex');
});
