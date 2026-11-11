import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReply } from '../src/replies.js';
import { parseAdminCommand, isWhoAmI } from '../src/commands.js';
import { quotaText } from '../src/lineapi.js';
import shop from '../src/data.js';

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

test('"ไอดีฉัน" / "myid" is the setup helper', () => {
  assert.ok(isWhoAmI('ไอดีฉัน') && isWhoAmI('myid') && !isWhoAmI('ไอดีฉันคืออะไร'));
});

test('"เมนู" brings back the welcome card, not "sorry"', () => {
  const withPics = { ...shop, assetBase: 'https://bot.example' };
  for (const w of ['เมนู', 'เมนูค่ะ', 'menu', 'บอท']) {
    const card = buildReply(w, withPics).messages[0];
    assert.equal(card.contents.header.contents[0].text, shop.name, w);
  }
});

test('"โควตา" is an admin command and the quota text states used / limit / left', async () => {
  assert.deepEqual(parseAdminCommand('โควตา'), { type: 'quota' });
  assert.match(quotaText({ type: 'limited', limit: 300, used: 120 }), /ใช้ไปแล้ว 120 จาก 300[\s\S]*เหลือ 180/);
  assert.match(quotaText({ type: 'limited', limit: 300, used: 300 }), /เต็มแล้ว/);
  assert.match(quotaText(null), /ดูโควตาไม่ได้/);
});
