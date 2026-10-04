import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createIntake, intakeMessages, intakeWindowMs } from '../src/intake.js';
import { delaySeconds, isMenuText, waitFor } from '../src/delay.js';

const shop = JSON.parse(readFileSync(new URL('../data/shop.json', import.meta.url), 'utf8'));
const clock = () => {
  let t = 1_000_000;
  return { now: () => t, tick: (ms) => (t += ms) };
};
const MIN = 60_000;

test('wait: 90 seconds for free text, none for buttons or a two-step question', () => {
  assert.equal(shop.replyDelaySeconds, 90);
  assert.equal(delaySeconds(shop, {}), 90);
  assert.equal(waitFor(shop, 'ขอสอบถามหน่อยค่ะ'), 90);
  assert.equal(waitFor(shop, 'สวัสดีค่ะ'), 90);
  for (const b of ['เวลาเปิดร้าน', 'สั่งของ', 'อุปกรณ์การเรียน 2-69', 'ที่ตั้งร้าน']) assert.equal(waitFor(shop, b), 0, b);
  assert.equal(waitFor(shop, 'ร.ร.บ้านกอก', { awaitingSchool: true }), 0);
  assert.ok(isMenuText(shop, 'เวลาเปิดร้านค่ะ'));
});

test('the wait can be changed or switched off', () => {
  assert.equal(delaySeconds(shop, { REPLY_DELAY_SECONDS: '5' }), 5);
  assert.equal(delaySeconds({ ...shop, replyDelaySeconds: 0 }, {}), 0);
  assert.equal(waitFor({ ...shop, replyDelaySeconds: 0 }, 'อะไรก็ได้'), 0);
  assert.equal(delaySeconds({}, {}), 0);
});

test('job intake: ask once, thank once, then quiet; starts over after 20 idle minutes', () => {
  const c = clock();
  const intake = createIntake(c.now);
  const win = intakeWindowMs(shop);
  assert.equal(win, 20 * MIN);
  assert.equal(intake.next('u1', win), 'prompt');
  c.tick(2 * MIN);
  assert.equal(intake.next('u1', win), 'ack');
  c.tick(3 * MIN);
  assert.equal(intake.next('u1', win), 'silent');
  c.tick(19 * MIN); // each message restarts the idle clock
  assert.equal(intake.next('u1', win), 'silent');
  c.tick(21 * MIN); // 20+ minutes of nothing → back to BOT MODE
  assert.equal(intake.next('u1', win), 'prompt');
});

test('intake is tracked per customer', () => {
  const intake = createIntake(clock().now);
  assert.equal(intake.next('a', 20 * MIN), 'prompt');
  assert.equal(intake.next('b', 20 * MIN), 'prompt');
  assert.equal(intake.next('a', 20 * MIN), 'ack');
});

test('intake messages: the job-details request asks for the four things; silence sends nothing', () => {
  const prompt = JSON.stringify(intakeMessages(shop, 'prompt'));
  for (const w of ['งานหรือสินค้า', 'จำนวน', 'ชื่อและเบอร์', 'รับที่ร้านหรือให้จัดส่ง', 'แอดมินจะตรวจสอบ']) assert.match(prompt, new RegExp(w));
  assert.match(JSON.stringify(intakeMessages(shop, 'ack')), /ได้รับรายละเอียดแล้ว/);
  assert.deepEqual(intakeMessages(shop, 'silent'), []);
  assert.equal(intakeMessages(shop, 'prompt')[0].type, 'text'); // plain text without pictures
  const pics = intakeMessages({ ...shop, assetBase: 'https://b.example' }, 'prompt')[0];
  assert.equal(pics.type, 'flex');
});
