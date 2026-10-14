import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createVisitTracker, HOUR } from '../src/visit.js';
import { buildReply } from '../src/replies.js';
import { isHello } from '../src/matcher.js';

const shop = JSON.parse(readFileSync(new URL('../data/shop.json', import.meta.url), 'utf8'));

// A clock the test moves by hand. 03:00 Bangkok on 13 Oct 2026 (UTC 20:00 the day before).
const clock = (start = Date.parse('2026-10-12T20:00:00Z')) => {
  let t = start;
  return { now: () => t, add: (ms) => (t += ms), set: (v) => (t = v) };
};

test('the first message of a visit owes the "who?" card once; it stays done until the next visit', () => {
  const c = clock();
  const v = createVisitTracker({ now: c.now });
  assert.equal(v.owed('u1'), false); // never seen
  v.touch('u1');
  assert.equal(v.owed('u1'), true);
  v.done('u1');
  assert.equal(v.owed('u1'), false);
  c.add(10 * 60_000);
  v.touch('u1'); // still the same visit
  assert.equal(v.owed('u1'), false);
});

test('a quiet gap of 4 hours (the shop can change it) starts a new visit', () => {
  const c = clock();
  const v = createVisitTracker({ now: c.now });
  v.touch('u1');
  v.done('u1');
  c.add(3 * HOUR + 59 * 60_000);
  v.touch('u1');
  assert.equal(v.owed('u1'), false); // 3 h 59 min: same visit
  c.add(4 * HOUR);
  v.touch('u1');
  assert.equal(v.owed('u1'), true); // ≥ 4 h since the last message
  v.done('u1');
  c.add(4.5 * HOUR);
  v.touch('u1', 5 * HOUR); // gap given per call (from shop.json)
  assert.equal(v.owed('u1'), false);
  c.add(5 * HOUR);
  v.touch('u1', 5 * HOUR);
  assert.equal(v.owed('u1'), true);
});

test('messages keep the visit alive: the gap is counted from the latest message', () => {
  const c = clock();
  const v = createVisitTracker({ now: c.now });
  v.touch('u1');
  v.done('u1');
  for (let i = 0; i < 6; i++) {
    c.add(3 * HOUR);
    v.touch('u1');
    assert.equal(v.owed('u1'), false, `message ${i}`);
  }
});

test('the first message of a new Bangkok day starts a new visit even after a short gap', () => {
  const c = clock(Date.parse('2026-10-13T16:50:00Z')); // 23:50 on 13 Oct in Bangkok
  const v = createVisitTracker({ now: c.now });
  v.touch('u1');
  v.done('u1');
  c.add(20 * 60_000); // 00:10 on 14 Oct in Bangkok
  v.touch('u1');
  assert.equal(v.owed('u1'), true);
});

test('customers are tracked separately', () => {
  const c = clock();
  const v = createVisitTracker({ now: c.now });
  v.touch('a');
  v.done('a');
  v.touch('b');
  assert.equal(v.owed('a'), false);
  assert.equal(v.owed('b'), true);
});

test('shop settings for the visit card are in place', () => {
  assert.equal(shop.contact.sessionAsk, true);
  assert.equal(shop.contact.sessionGapHours, 4);
});

test('only a plain hello gets the visit card; a hello with more after it, a reply or a menu word does not', () => {
  const hi = buildReply('สวัสดีค่ะ', shop, {});
  assert.equal(hi.greeting, true);
  assert.equal(hi.pureHello, true);
  assert.equal(hi.menuRequest, false);
  for (const t of ['สวัสดีค่ะ อ.2 = 3 คน', 'ดีค่ะ']) assert.notEqual(buildReply(t, shop, {}).pureHello, true, t);
  assert.equal(buildReply('เมนู', shop, {}).menuRequest, true);
  assert.equal(buildReply('ร้านเปิดกี่โมง', shop, {}).greeting, undefined);
});

test('isHello: plain hellos in the ways customers write them', () => {
  for (const t of ['สวัสดีค่ะ', 'สวัสดีครับพี่', 'หวัดดีจ้า', 'Hello', 'hi', 'สวัสดีค่ะ 😊', 'สวัสดีตอนเช้าค่ะ', 'สวัสดีค่ะแอดมิน', 'ดีจ้า', 'สวัสดีนะคะ']) {
    assert.equal(isHello(t), true, t);
  }
  for (const t of ['สวัสดีค่ะ อ.2 = 3 คน', 'ดีค่ะ', 'ขอบคุณค่ะ', 'xyz', 'สวัสดีค่ะ ขอถามหน่อย', 'เมนู', 'hello there', 'อ. 2. = 3 คน', '']) {
    assert.equal(isHello(t), false, t);
  }
});

test('a message the bot does not understand is never answered with the card (even the first of the day)', () => {
  // the customer's lines in a chat where an admin had just asked "how many students?"
  for (const t of ['อ. 2. = 3 คน', 'อ.3. = 8 คน', 'ป.1. = 8 คน']) {
    const r = buildReply(t, shop, {});
    assert.equal(r.silent, true, t);
    assert.deepEqual(r.messages, [], t);
    assert.equal(r.needsPhotos, undefined, t);
  }
  assert.equal(shop.contact.askOnUnknown, false);
});
