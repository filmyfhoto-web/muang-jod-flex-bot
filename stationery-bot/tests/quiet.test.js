import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildReply } from '../src/replies.js';
import { createQuiet, parseAdminIds, parseAdminCommand, isWakeWord, isWhoAmI } from '../src/quiet.js';

const shop = JSON.parse(readFileSync(new URL('../data/shop.json', import.meta.url), 'utf8'));
const clock = () => {
  let t = 1_000_000;
  return { now: () => t, tick: (ms) => (t += ms) };
};

test('a customer who asked for the admin is left alone until the time is up', () => {
  const c = clock();
  const q = createQuiet(c.now);
  assert.equal(q.silentFor('u1'), false);
  q.silenceUser('u1', 3 * 3600_000);
  assert.equal(q.silentFor('u1'), true);
  assert.equal(q.silentFor('u2'), false); // other customers unaffected
  c.tick(3 * 3600_000 - 1);
  assert.equal(q.silentFor('u1'), true);
  c.tick(2);
  assert.equal(q.silentFor('u1'), false);
});

test('the customer can wake the bot', () => {
  const q = createQuiet();
  q.silenceUser('u1', 3600_000);
  q.wake('u1');
  assert.equal(q.silentFor('u1'), false);
  for (const w of ['เมนู', 'เมนูค่ะ', 'บอท', 'menu', 'เริ่มใหม่']) assert.ok(isWakeWord(w), w);
  assert.ok(!isWakeWord('ขอดูเมนูอาหาร'));
});

test('an admin pause silences everyone and ends by itself', () => {
  const c = clock();
  const q = createQuiet(c.now);
  q.pauseAll(2 * 3600_000);
  assert.equal(q.silentFor('anyone'), true);
  c.tick(2 * 3600_000 + 1);
  assert.equal(q.silentFor('anyone'), false);
  q.pauseAll(3600_000);
  q.resumeAll();
  assert.equal(q.silentFor('anyone'), false);
});

test('admin commands', () => {
  assert.deepEqual(parseAdminCommand('ปิดบอท'), { type: 'pause', hours: null });
  assert.deepEqual(parseAdminCommand('ปิดบอท 2'), { type: 'pause', hours: 2 });
  assert.deepEqual(parseAdminCommand('ปิดบอท 1.5 ชม.'), { type: 'pause', hours: 1.5 });
  assert.deepEqual(parseAdminCommand('แอดมินออนไลน์'), { type: 'pause', hours: null });
  assert.deepEqual(parseAdminCommand('เปิดบอท'), { type: 'resume' });
  assert.deepEqual(parseAdminCommand('แอดมินออฟไลน์'), { type: 'resume' });
  assert.equal(parseAdminCommand('ปิดบอทให้หน่อยได้ไหม'), null);
  assert.equal(parseAdminCommand('สวัสดี'), null);
});

test('admin ids come from a comma / space separated list', () => {
  assert.deepEqual([...parseAdminIds('U111, U222 U333')], ['U111', 'U222', 'U333']);
  assert.equal(parseAdminIds(undefined).size, 0);
  assert.ok(isWhoAmI('ไอดีฉัน') && isWhoAmI('myid') && !isWhoAmI('ไอดีฉันคืออะไร'));
});

test('the handoff reply tells the customer the bot goes quiet and how to bring it back', () => {
  assert.match(shop.handoff, /บอทจะไม่ตอบแทน/);
  assert.match(shop.handoff, /เมนู/);
  assert.ok(shop.handoffQuietMinutes > 0 && shop.adminPauseHours > 0);
});

test('"เมนู" brings back the welcome card, not "sorry"', () => {
  const withPics = { ...shop, assetBase: 'https://bot.example' };
  for (const w of ['เมนู', 'เมนูค่ะ', 'menu', 'บอท']) {
    const card = buildReply(w, withPics).messages[0];
    assert.equal(card.contents.header.contents[0].text, shop.name, w);
  }
});
