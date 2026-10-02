import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { matchIntent } from '../src/matcher.js';
import { buildReply } from '../src/replies.js';
import { verifySignature } from '../src/line.js';
import crypto from 'node:crypto';

const shop = JSON.parse(readFileSync(new URL('../data/shop.json', import.meta.url), 'utf8'));

test('product by alias', () => {
  const r = matchIntent('ปากกาลูกลื่นราคาเท่าไหร่คะ', shop);
  assert.equal(r.type, 'products');
  assert.match(r.products[0].name, /ปากกาลูกลื่น/);
});

test('longest alias wins', () => {
  const r = matchIntent('กระดาษ a4 มีไหม', shop);
  assert.equal(r.products.length, 1);
  assert.match(r.products[0].name, /A4/);
});

test('faq', () => {
  assert.equal(matchIntent('ร้านเปิดกี่โมงคะ', shop).faq.label, 'เวลาเปิดร้าน');
  assert.equal(matchIntent('ค่าส่งเท่าไหร่', shop).faq.label, 'การจัดส่ง');
});

test('handoff, greeting, fallback', () => {
  assert.equal(matchIntent('ขอคุยกับแอดมิน', shop).type, 'handoff');
  assert.equal(matchIntent('สวัสดีค่ะ', shop).type, 'greeting');
  assert.equal(matchIntent('xyz', shop).type, 'fallback');
});

test('out-of-stock product says so', () => {
  const { messages } = buildReply('ไฮไลท์', shop);
  assert.match(messages[0].text, /หมดชั่วคราว/);
});

test('signature check', () => {
  const body = Buffer.from('{"events":[]}');
  const sig = crypto.createHmac('sha256', 's').update(body).digest('base64');
  assert.ok(verifySignature(body, sig, 's'));
  assert.ok(!verifySignature(body, sig, 'other'));
  assert.ok(!verifySignature(body, null, 's'));
});
