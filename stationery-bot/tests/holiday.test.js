import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bangkokDay, holidayNotice, createNoticeTracker, applyHoliday } from '../src/holiday.js';

const shop = JSON.parse(readFileSync(new URL('../data/shop.json', import.meta.url), 'utf8'));
const SAT = new Date('2026-10-03T05:00:00Z'); // Saturday 12:00 in Bangkok
const FRI = new Date('2026-10-02T05:00:00Z');
const msg = [{ type: 'text', text: 'normal answer' }];

test('days are counted in Bangkok time, not UTC', () => {
  assert.deepEqual(bangkokDay(SAT), { weekday: 6, key: '2026-10-03' });
  // 01:00 Saturday in Bangkok is still Friday in UTC
  assert.equal(bangkokDay(new Date('2026-10-02T18:00:00Z')).weekday, 6);
  // 00:30 Sunday in Bangkok is still Saturday in UTC
  assert.equal(bangkokDay(new Date('2026-10-03T17:30:00Z')).weekday, 0);
});

test('the notice appears only on Saturdays and says what the shop asked for', () => {
  assert.equal(holidayNotice(shop, FRI), null);
  assert.equal(holidayNotice(shop, new Date('2026-10-04T05:00:00Z')), null); // Sunday
  const n = holidayNotice(shop, SAT);
  assert.match(n.message.text, /วันหยุด/);
  assert.match(n.message.text, /ร้านหยุดทุกวันเสาร์/);
  assert.match(n.message.text, /ขออภัยในความไม่สะดวก/);
  assert.match(n.message.text, /แอดมินจะตอบกลับให้เร็วที่สุด/);
});

test('every Saturday, not just one', () => {
  for (const d of ['2026-10-10', '2026-10-17', '2026-12-26', '2027-01-02']) {
    assert.ok(holidayNotice(shop, new Date(`${d}T05:00:00Z`)), d);
  }
});

test('first message of the day gets the notice in front; the next ones do not', () => {
  const tracker = createNoticeTracker();
  const first = applyHoliday(msg, { shop, userId: 'u1', tracker, now: SAT });
  assert.equal(first.length, 2);
  assert.match(first[0].text, /ร้านหยุดทุกวันเสาร์/);
  assert.equal(first[1], msg[0]);
  assert.equal(applyHoliday(msg, { shop, userId: 'u1', tracker, now: SAT }), msg);
  // another customer is told separately
  assert.equal(applyHoliday(msg, { shop, userId: 'u2', tracker, now: SAT }).length, 2);
});

test('a new Saturday tells the same customer again', () => {
  const tracker = createNoticeTracker();
  applyHoliday(msg, { shop, userId: 'u1', tracker, now: SAT });
  const next = new Date('2026-10-10T05:00:00Z');
  assert.equal(applyHoliday(msg, { shop, userId: 'u1', tracker, now: next }).length, 2);
});

test('weekdays are untouched; thanks is not stamped and does not use up the notice', () => {
  const tracker = createNoticeTracker();
  assert.equal(applyHoliday(msg, { shop, userId: 'u1', tracker, now: FRI }), msg);
  assert.equal(applyHoliday(msg, { shop, userId: 'u1', tracker, now: SAT, skip: true }), msg);
  const out = applyHoliday(msg, { shop, userId: 'u1', tracker, now: SAT });
  assert.equal(out.length, 2);
  assert.match(out[0].text, /ร้านหยุดทุกวันเสาร์/);
});

test('no holiday configured → never a notice', () => {
  assert.equal(holidayNotice({ ...shop, holiday: undefined }, SAT), null);
});
