import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { delaySeconds, isMenuText, waitFor } from '../src/delay.js';

const shop = JSON.parse(readFileSync(new URL('../data/shop.json', import.meta.url), 'utf8'));
const clock = () => {
  let t = 1_000_000;
  return { now: () => t, tick: (ms) => (t += ms) };
};
const MIN = 60_000;

test('wait: none by default; when set it spares buttons and two-step questions', () => {
  // the shop wants answers at once (the wait is still available: replyDelaySeconds)
  assert.equal(shop.replyDelaySeconds, 0);
  assert.equal(delaySeconds(shop, {}), 0);
  assert.equal(waitFor(shop, 'ขอสอบถามหน่อยค่ะ'), 0);
  assert.equal(waitFor({ ...shop, replyDelaySeconds: 90 }, 'สวัสดีค่ะ'), 90);
  const slow = { ...shop, replyDelaySeconds: 90 };
  for (const b of ['เวลาเปิดร้าน', 'สั่งของ', 'อุปกรณ์การเรียน 2-69', 'ที่ตั้งร้าน']) assert.equal(waitFor(slow, b), 0, b);
  assert.equal(waitFor(slow, 'ร.ร.บ้านกอก', { awaitingSchool: true }), 0);
  assert.ok(isMenuText(shop, 'เวลาเปิดร้านค่ะ'));
});

test('the wait can be changed or switched off', () => {
  assert.equal(delaySeconds(shop, { REPLY_DELAY_SECONDS: '5' }), 5);
  assert.equal(delaySeconds({ ...shop, replyDelaySeconds: 0 }, {}), 0);
  assert.equal(waitFor({ ...shop, replyDelaySeconds: 0 }, 'อะไรก็ได้'), 0);
  assert.equal(delaySeconds({}, {}), 0);
});
