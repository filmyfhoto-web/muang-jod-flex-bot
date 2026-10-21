import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildReply } from '../src/replies.js';
import { isThanks } from '../src/matcher.js';
import { isPaused } from '../src/quiet.js';
import { describeEvent } from '../src/line.js';
import { applyHoliday, createNoticeTracker } from '../src/holiday.js';

const shop = JSON.parse(readFileSync(new URL('../data/shop.json', import.meta.url), 'utf8'));
const demo = { ...shop, productsEnabled: true, faq: shop.faq.map((f) => ({ ...f, enabled: true })) };

test('shipped config answers only what it knows', () => {
  assert.equal(shop.replyOnlyKnown, true);
});

test('text the shop has no answer for gets no reply at all', () => {
  for (const t of ['xyz', 'มีเวลาว่างไหม', 'ช่วยหน่อยครับพี่', 'ราคาเท่าไหร่', '555', 'ok',
    // answers that exist but are switched off until the shop has real data for them
    'ปากกา', 'ดินสอ', 'โอนยังไง', 'ค่าส่งเท่าไหร่', 'ขอใบเสร็จ']) {
    const r = buildReply(t, shop);
    assert.deepEqual(r.messages, [], t);
    assert.equal(r.silent, true);
  }
});

test('everything that is set up with real data still answers', () => {
  const known = ['สวัสดีค่ะ', 'ร้านเปิดกี่โมง', 'สั่งของ', 'ที่ตั้งร้าน', 'อุปกรณ์การเรียน 2-69', 'ขอบคุณค่ะ', 'เมนู'];
  for (const t of known) assert.ok(buildReply(t, shop).messages.length > 0, t);
});

test('sample-data answers stay switched off in the shipped file, and can be switched back on', () => {
  assert.equal(shop.productsEnabled, false);
  const off = shop.faq.filter((f) => f.enabled === false).map((f) => f.label);
  assert.deepEqual(off.sort(), ['การชำระเงิน', 'ใบเสร็จ/หน่วยงาน', 'โปรโมชั่น/ราคาส่ง'].sort());
  assert.ok(buildReply('ปากกา', demo).messages.length > 0);
  assert.ok(buildReply('โอนยังไง', demo).messages.length > 0);
});

test('no shipping: nothing about delivery is answered', () => {
  assert.ok(!shop.faq.some((f) => /จัดส่ง|ค่าส่ง/.test(f.label + f.answer)));
});

test('location: real shop name and a Google Maps button, no made-up address', () => {
  const card = buildReply('ที่ตั้งร้าน', shop).messages[0];
  const json = JSON.stringify(card);
  assert.match(json, /ร้านนัฐภรณ์ เชียงกลาง/);
  assert.ok(!/ตัวอย่าง|shop\.json|123 /.test(json));
  const btn = card.contents.footer.contents[0].action;
  assert.equal(btn.type, 'uri');
  assert.match(btn.uri, /^https:\/\/www\.google\.com\/maps\/place\/.*19\.2906561,100\.8612987/);
  assert.ok(btn.uri.length < 1000); // LINE's limit for a link
  assert.ok(!btn.uri.includes('g_ep')); // tracking parameters trimmed
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

test('the file is switched on (paused is a real boolean)', () => {
  assert.equal(shop.paused, false);
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
    buildReply('ปากกา', { ...demo, assetBase: 'https://b.example' }).messages,
    buildReply('ไฮไลท์', { ...demo, assetBase: 'https://b.example' }).messages,
    buildReply('ขอบคุณ', withPics).messages,
    buildReply('xyz', { ...withPics, replyOnlyKnown: false }).messages,
  ]);
  assert.ok(!all.includes('คุยกับแอดมิน'));
  const inStock = buildReply('ปากกา', demo).messages[0].contents.footer.contents[0].action;
  assert.equal(inStock.text, 'สั่งของ');
  assert.ok(buildReply(inStock.text, shop).messages.length > 0);
  const out = buildReply('ไฮไลท์', demo).messages[0].contents.footer.contents[0].action;
  assert.match(out.text, /^ถามวันเข้าสินค้า /);
  assert.ok(out.label.length <= 20);
});

test('event log lines describe the kind of event and never include what was written', () => {
  const line = describeEvent({ type: 'message', mode: 'active', source: { type: 'user', userId: 'U123' }, message: { type: 'text', text: 'secret words' }, replyToken: 'x' });
  assert.equal(line, '[webhook] type=message source=user message=text mode=active');
  assert.ok(!line.includes('secret') && !line.includes('U123'));
  assert.match(describeEvent({ type: 'follow', source: { type: 'user' }, strange: 1 }), /other=strange/);
});

test('thanks that name an admin is still thanks; a thank-you with a question is not', () => {
  const names = ['หญิง', 'ฟิล์ม', 'พี่ปิ่น'];
  assert.ok(isThanks('ขอบคุณพี่ปิ่นค่ะ', names));
  assert.ok(isThanks('ขอบคุณหญิงเจ้า', names));
  assert.ok(isThanks('ขอบคุณเจ้าพี่', names));
  assert.ok(!isThanks('ขอบคุณค่ะ ราคาเท่าไหร่', names));
  assert.ok(!isThanks('ขอบคุณ ป้าย 2 ผืน', names));
  // through the reply builder: "ขอบคุณเจ้าพี่" now gets the thank-you card
  assert.match(JSON.stringify(buildReply('ขอบคุณเจ้าพี่', shop).messages), /ยินดีค่ะ/);
  assert.match(JSON.stringify(buildReply('ขอบคุณพี่ปิ่น', shop).messages), /ยินดีค่ะ/);
});
