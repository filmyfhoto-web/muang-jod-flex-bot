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

test('greeting replies with a flex card with menu buttons', () => {
  const { messages } = buildReply('สวัสดีค่ะ', shop);
  assert.equal(messages[0].type, 'flex');
  const buttons = messages[0].contents.footer.contents;
  assert.ok(buttons.length > 1);
  assert.ok(buttons.every((b) => b.action.label.length <= 20));
});

test('single product → bubble, several → carousel; out-of-stock flagged', () => {
  const one = buildReply('ไฮไลท์', shop).messages[0];
  assert.equal(one.contents.type, 'bubble');
  assert.match(JSON.stringify(one), /สินค้าหมดชั่วคราว/);
  const many = buildReply('ปากกา', shop).messages[0];
  assert.ok(['bubble', 'carousel'].includes(many.contents.type));
});

test('faq and fallback are flex cards; handoff stays text', () => {
  assert.equal(buildReply('ร้านเปิดกี่โมง', shop).messages[0].type, 'flex');
  assert.equal(buildReply('xyz', shop).messages[0].type, 'flex');
  assert.equal(buildReply('แอดมิน', shop).messages[0].type, 'text');
});

test('supplies button only asks which school — no school list, no link', () => {
  const r = buildReply('อุปกรณ์การเรียน 2-2569', shop);
  assert.equal(r.awaitingSchool, true);
  assert.equal(r.messages.length, 1);
  assert.equal(r.messages[0].type, 'text');
  assert.match(r.messages[0].text, /โรงเรียนไหน/);
  assert.equal(r.messages[0].quickReply, undefined);
  const out = JSON.stringify(r);
  assert.ok(!shop.schoolSupplies.schools.some((s) => out.includes(s.link) || out.includes(s.name)));
});

test('every school resolves to its own link, by full or short name', () => {
  for (const sc of shop.schoolSupplies.schools) {
    for (const typed of [sc.name, sc.name.replace(/^โรงเรียน/, '')]) {
      const r = buildReply(typed, shop, { awaitingSchool: true });
      assert.equal(r.awaitingSchool, false, typed);
      assert.ok(JSON.stringify(r.messages[0]).includes(sc.link), typed);
    }
  }
});

test('all school links are https and unique', () => {
  const links = shop.schoolSupplies.schools.map((s) => s.link);
  assert.ok(links.every((l) => /^https:\/\/\S+$/.test(l)));
  assert.equal(new Set(links).size, links.length);
});

test('school named together with supplies → link straight away', () => {
  const r = buildReply('ขอรายการอุปกรณ์ บ้านปางกอม', shop);
  assert.match(JSON.stringify(r.messages[0]), /dcbt7/);
});

test('school name alone, not asked → link is not sent', () => {
  assert.doesNotMatch(JSON.stringify(buildReply('โรงเรียนบ้านกอก', shop).messages[0]), /qeujy/);
});

test('unknown school while asked → ask again; other topics still work', () => {
  const again = buildReply('โรงเรียนอะไรไม่รู้', shop, { awaitingSchool: true });
  assert.equal(again.awaitingSchool, true);
  assert.match(again.messages[0].text, /ยังไม่พบ/);
  const faq = buildReply('ร้านเปิดกี่โมง', shop, { awaitingSchool: true });
  assert.equal(faq.awaitingSchool, false);
  assert.equal(faq.messages[0].type, 'flex');
});

test('สั่งของ has an answer', () => {
  assert.equal(matchIntent('สั่งของ', shop).faq.label, 'สั่งของ');
});

test('signature check', () => {
  const body = Buffer.from('{"events":[]}');
  const sig = crypto.createHmac('sha256', 's').update(body).digest('base64');
  assert.ok(verifySignature(body, sig, 's'));
  assert.ok(!verifySignature(body, sig, 'other'));
  assert.ok(!verifySignature(body, null, 's'));
});
