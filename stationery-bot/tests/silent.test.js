import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildReply } from '../src/replies.js';
import { isPaused } from '../src/quiet.js';
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
    'ปากกา', 'ดินสอ', 'สมุด', 'กระดาษ a4', 'อุปกรณ์การเรียน 2-69', 'ขอบคุณค่ะ', 'เมนู'];
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

test('master pause switch: shop file or environment variable', () => {
  assert.equal(isPaused({ paused: true }, {}), true);
  assert.equal(isPaused({}, { BOT_PAUSED: '1' }), true);
  assert.equal(isPaused({}, { BOT_PAUSED: 'true' }), true);
  assert.equal(isPaused({ paused: false }, {}), false);
  assert.equal(isPaused({}, {}), false);
  for (const off of ['0', 'false', 'off', 'no', '']) assert.equal(isPaused({}, { BOT_PAUSED: off }), false, off);
});

test('the file ships paused for now', () => {
  assert.equal(shop.paused, true);
});

test('the admin chat feature is gone: "แอดมิน" and the old topics get no bot answer', () => {
  for (const t of ['แอดมิน', 'ขอคุยกับแอดมิน', 'ทำไวนิล', 'ใบเสนอราคา', 'ทำตรายาง']) {
    assert.deepEqual(buildReply(t, shop).messages, [], t);
  }
  assert.equal(shop.adminRouting, undefined);
  assert.equal(shop.handoff, undefined);
});

test('no card offers "คุยกับแอดมิน" any more, and product buttons lead somewhere the bot answers', () => {
  const withPics = { ...shop, assetBase: 'https://b.example' };
  const all = JSON.stringify([
    buildReply('สวัสดี', withPics).messages,
    buildReply('ปากกา', withPics).messages,
    buildReply('ไฮไลท์', withPics).messages,
    buildReply('ขอบคุณ', withPics).messages,
    buildReply('xyz', { ...withPics, replyOnlyKnown: false }).messages,
  ]);
  assert.ok(!all.includes('คุยกับแอดมิน'));
  const inStock = buildReply('ปากกา', shop).messages[0].contents.footer.contents[0].action;
  assert.equal(inStock.text, 'สั่งของ');
  assert.ok(buildReply(inStock.text, shop).messages.length > 0);
  const out = buildReply('ไฮไลท์', shop).messages[0].contents.footer.contents[0].action;
  assert.match(out.text, /^ถามวันเข้าสินค้า /);
  assert.ok(out.label.length <= 20);
});
