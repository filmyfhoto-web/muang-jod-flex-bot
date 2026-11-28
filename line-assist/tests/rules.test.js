import { test } from 'node:test';
import assert from 'node:assert/strict';
import data from '../src/data.js';
import { cleanReply, cleanRule, cleanRules, rulesFromFaq, ruleMessages, MAX_REPLIES, MAX_RULES } from '../src/rules.js';
import { findRule, matchIntent } from '../src/matcher.js';
import { buildReply } from '../src/replies.js';
import { buildShop } from '../src/config.js';
import { setup, CUSTOMER, CUSTOMER2, IDS, textsOf } from './_line.js';
import { makeShop } from './_shop.js';

const rule = (extra = {}) => ({ id: 'a', name: 'ราคาสมุด', keywords: ['สมุด'], replies: [{ type: 'text', text: 'สมุด 25 บาทค่ะ' }], ...extra });
const lastReply = (t) => t.log.replies.at(-1);

test('a reply is cleaned: unusable ones are dropped, addresses must be https, sizes are capped', () => {
  assert.equal(cleanReply(null), null);
  assert.equal(cleanReply({ type: 'nope' }), null);
  assert.equal(cleanReply({ type: 'text', text: '   ' }), null);
  assert.deepEqual(cleanReply({ type: 'text', text: '  สวัสดี ' }), { type: 'text', text: 'สวัสดี' });
  assert.equal(cleanReply({ type: 'text', text: 'x'.repeat(9000) }).text.length, 5000);
  // card: needs text; a button needs an https address; the picture must be one the shop has
  assert.equal(cleanReply({ type: 'card', title: 'a', text: '' }), null);
  const card = cleanReply({ type: 'card', title: 'ที่ตั้ง', text: 'มาหาเรา', image: 'staff', button: { label: 'แผนที่', url: 'https://maps.example/x' } });
  assert.deepEqual(card, { type: 'card', title: 'ที่ตั้ง', text: 'มาหาเรา', image: 'staff', button: { label: 'แผนที่', url: 'https://maps.example/x' } });
  assert.equal(cleanReply({ type: 'card', text: 't', button: { label: 'x', url: 'http://insecure.example' } }).button, null);
  assert.equal(cleanReply({ type: 'card', text: 't', button: { label: 'x', url: 'javascript:alert(1)' } }).button, null);
  assert.equal(cleanReply({ type: 'card', text: 't', image: '../../etc/passwd' }).image, '');
  // image / sticker / flex
  assert.equal(cleanReply({ type: 'image', url: 'http://x/y.png' }), null);
  assert.deepEqual(cleanReply({ type: 'image', url: 'https://x.example/y.png' }), { type: 'image', url: 'https://x.example/y.png', previewUrl: '' });
  assert.deepEqual(cleanReply({ type: 'sticker', packageId: 446, stickerId: '1988' }), { type: 'sticker', packageId: '446', stickerId: '1988' });
  assert.equal(cleanReply({ type: 'sticker', packageId: 'abc', stickerId: '1' }), null);
  assert.equal(cleanReply({ type: 'flex', contents: { type: 'text' } }), null);
  assert.equal(cleanReply({ type: 'flex', contents: { type: 'bubble', body: { type: 'box', layout: 'vertical', contents: ['x'.repeat(40_000)] } } }), null);
  assert.equal(cleanReply({ type: 'flex', contents: { type: 'bubble' } }).altText, 'ข้อความจากร้าน');
  assert.deepEqual(cleanReply({ type: 'silent' }), { type: 'silent' });
});

test('a rule is cleaned: keywords deduped, ids unique, silent beats the other replies, at most five replies', () => {
  const r = cleanRule({ id: 'x y!', name: '', keywords: ['สมุด', ' สมุด ', 'สมุดค่ะ', '', 'ปากกา'], replies: Array.from({ length: 9 }, () => ({ type: 'text', text: 'ก' })) });
  assert.equal(r.id, 'xy');
  assert.equal(r.name, 'กฎ 1');
  assert.deepEqual(r.keywords, ['สมุด', 'ปากกา']); // "สมุดค่ะ" is the same word as "สมุด" once politeness is ignored
  assert.equal(r.replies.length, MAX_REPLIES);
  assert.equal(r.match, 'contains');
  assert.equal(r.enabled, true);
  assert.equal(r.quick, true);
  assert.deepEqual(cleanRule({ keywords: ['a'], replies: [{ type: 'text', text: 'hi' }, { type: 'silent' }] }).replies, [{ type: 'silent' }]);
  assert.deepEqual(cleanRule({ keywords: ['a'], reply: { type: 'text', text: 'one' } }).replies, [{ type: 'text', text: 'one' }]); // the single-reply spelling
  assert.equal(cleanRule('nope'), null);

  const rules = cleanRules([rule({ id: 'dup' }), rule({ id: 'dup' }), null, rule({ id: 'dup' })]);
  assert.deepEqual(rules.map((x) => x.id), ['dup', 'dup-2', 'dup-3']);
  assert.equal(cleanRules(Array.from({ length: MAX_RULES + 20 }, (_, i) => rule({ id: `r${i}` }))).length, MAX_RULES);
  assert.deepEqual(cleanRules('x'), []);
});

test('matching: contains / exact, politeness and spaces ignored, disabled and unfinished rules never answer, first match wins', () => {
  const rules = cleanRules([
    rule({ id: 'off', name: 'ปิดอยู่', keywords: ['สมุด'], enabled: false }),
    rule({ id: 'empty', keywords: ['สมุด'], replies: [] }),
    rule({ id: 'nokw', keywords: [] }),
    rule({ id: 'exact', keywords: ['ราคา'], match: 'exact' }),
    rule({ id: 'one', keywords: ['สมุดปกอ่อน'] }),
    rule({ id: 'two', keywords: ['สมุด'] }),
  ]);
  assert.equal(findRule('มีสมุดปกอ่อนไหมคะ', rules).id, 'one'); // first in the list, though "สมุด" would match too
  assert.equal(findRule('สมุดเล่มละเท่าไหร่', rules).id, 'two');
  assert.equal(findRule('ราคาค่ะ', rules).id, 'exact');
  assert.equal(findRule('  ราคา  ', rules).id, 'exact');
  assert.equal(findRule('ราคาปากกา', rules), null); // exact means the whole message
  assert.equal(findRule('', rules), null);
  assert.equal(findRule('xyz', rules), null);
  assert.equal(findRule('สมุด', []), null);
  assert.equal(findRule('สมุด', undefined), null);
});

test('the shipped question list, written as rules, answers the same way as before', () => {
  const rules = rulesFromFaq(data.faq);
  assert.equal(rules.length, data.faq.length);
  assert.deepEqual(rules.map((r) => r.replies[0].type), ['card', 'card', 'card', 'silent', 'silent', 'silent']); // the three switched-off topics stay silent
  const plain = buildShop(null);
  const custom = buildShop({ content: { rules } });
  assert.ok(Array.isArray(custom.rules));
  assert.equal(plain.rules, undefined);
  for (const text of ['ร้านเปิดกี่โมงคะ', 'สั่งของ', 'ที่ตั้งร้าน', 'ร้านอยู่ที่ไหน', 'โอนยังไง', 'ขอใบเสร็จ', 'ส่วนลดไหม', 'xyz']) {
    const a = buildReply(text, plain, {});
    const b = buildReply(text, custom, {});
    assert.equal(a.messages.length, b.messages.length, text);
    assert.equal(Boolean(a.silent), Boolean(b.silent), text);
    // same card, apart from the topic buttons the shipped path puts on it itself
    const strip = (m) => JSON.stringify(m, (k, v) => (k === 'quickReply' ? undefined : v));
    assert.deepEqual(a.messages.map(strip), b.messages.map(strip), text);
  }
});

test('replies of every kind become LINE messages', () => {
  const shop = makeShop();
  const r = cleanRule({
    keywords: ['x'],
    replies: [
      { type: 'text', text: 'ข้อความ' },
      { type: 'card', title: 'หัวเรื่อง', text: 'รายละเอียด', image: 'staff', button: { label: 'เปิด', url: 'https://x.example/a' } },
      { type: 'image', url: 'https://x.example/p.png' },
      { type: 'sticker', packageId: '446', stickerId: '1988' },
      { type: 'flex', altText: 'โปร', contents: { type: 'bubble', body: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: 'hi' }] } } },
    ],
  });
  const ms = ruleMessages(shop, r);
  assert.deepEqual(ms.map((m) => m.type), ['text', 'flex', 'image', 'sticker', 'flex']);
  assert.equal(ms[0].text, 'ข้อความ');
  assert.match(textsOf(ms[1]), /รายละเอียด/);
  assert.match(textsOf(ms[1]), /https:\/\/x\.example\/a/); // the button and the written-out address
  assert.match(textsOf(ms[1]), /pics\.example\/line-assist\/staff\.png/);
  assert.deepEqual(ms[2], { type: 'image', originalContentUrl: 'https://x.example/p.png', previewImageUrl: 'https://x.example/p.png' });
  assert.deepEqual(ms[3], { type: 'sticker', packageId: '446', stickerId: '1988' });
  assert.equal(ms[4].altText, 'โปร');
  assert.deepEqual(ruleMessages(shop, null), []);
});

test('the owner\'s rules come from the settings row; the shipped list is used until they exist', () => {
  assert.equal(buildShop({ content: {} }).rules, undefined);
  assert.equal(buildShop({ content: { rules: 'nope' } }).rules, undefined);
  const shop = buildShop({ content: { rules: [rule(), { junk: true }] } });
  assert.deepEqual(shop.rules.map((r) => r.id), ['a', 'r2']);
  assert.deepEqual(buildShop({ content: { rules: [] } }).rules, []); // an empty list is the owner's choice too: nothing is answered from it
});

test('a custom rule answers instead of the shipped question list, and the topic buttons ride on its last message', async () => {
  const shop = makeShop({ rules: cleanRules([rule({ keywords: ['ร้านเปิด'], replies: [{ type: 'text', text: 'วันนี้เปิดถึงสองทุ่มค่ะ' }] })]) });
  const t = setup({ shop });
  assert.equal(await t.say(CUSTOMER, 'ร้านเปิดกี่โมงคะ'), 'reply');
  const [m] = lastReply(t).messages;
  assert.equal(m.type, 'text');
  assert.equal(m.text, 'วันนี้เปิดถึงสองทุ่มค่ะ');
  assert.ok(m.quickReply.items.length >= 2);
  assert.equal(t.log.pushes.length, 0);
  // what the list does not cover stays silent, as before
  assert.equal(await t.say(CUSTOMER2, 'ที่ตั้งร้าน'), 'silent');
});

test('a rule can send several messages, a sticker, and turn the topic buttons off', async () => {
  const shop = makeShop({ rules: cleanRules([rule({ keywords: ['สวัสดีปีใหม่'], quick: false, replies: [{ type: 'text', text: 'สุขสันต์ปีใหม่ค่ะ' }, { type: 'sticker', packageId: '446', stickerId: '1988' }] })]) });
  const t = setup({ shop });
  assert.equal(await t.say(CUSTOMER, 'สวัสดีปีใหม่ค่ะ'), 'reply');
  const { messages } = lastReply(t);
  assert.deepEqual(messages.map((m) => m.type), ['text', 'sticker']);
  assert.equal(messages.at(-1).quickReply, undefined);
});

test('a silent rule says nothing and alerts nobody; an unfinished or disabled rule is skipped', async () => {
  const shop = makeShop({
    rules: cleanRules([
      rule({ id: 's', keywords: ['ราคาส่ง'], replies: [{ type: 'silent' }] }),
      rule({ id: 'd', keywords: ['ปากกา'], enabled: false }),
      rule({ id: 'u', keywords: ['ดินสอ'], replies: [] }),
    ]),
  });
  const t = setup({ shop });
  for (const text of ['ขอราคาส่งหน่อยค่ะ', 'ปากกา', 'ดินสอ']) assert.equal(await t.say(CUSTOMER, text), 'silent', text);
  assert.equal(t.log.replies.length, 0);
  assert.equal(t.log.pushes.length, 0);
  assert.equal(matchIntent('ขอราคาส่งหน่อยค่ะ', shop).type, 'off');
});

test('thanks, the picker words and the order words still come first; the school answer is not hijacked by a rule', () => {
  const shop = makeShop({ rules: cleanRules([rule({ keywords: ['ขอบคุณ', 'บ้านกอก', 'คุยกับแอดมิน', 'ไวนิล'] })]) });
  assert.equal(matchIntent('ขอบคุณค่ะ', shop).type, 'thanks');
  assert.equal(matchIntent('คุยกับแอดมิน', shop).type, 'contact');
  assert.equal(matchIntent('ทำไวนิล', shop).type, 'order');
  // "which school?" is asked, the customer names it: the school list answers, not the rule that also contains the name
  const asked = buildReply('อุปกรณ์การเรียน', shop, {});
  assert.equal(asked.awaitingSchool, true);
  const got = buildReply('บ้านกอก', shop, { awaitingSchool: true });
  assert.match(textsOf(got.messages), /qeujy/);
});

test('texts, trigger words and school list can be changed from the settings row, and bad values are ignored', () => {
  const shop = buildShop({
    content: {
      thanks: 'ยินดีค่ะ 😊',
      greeting: 'สวัสดีค่ะ',
      holiday: { weekday: 0, message: 'วันอาทิตย์ปิด' },
      contact: { ask: 'เลือกคนได้เลยค่ะ', orderWords: ['ป้าย', 'สติกเกอร์', ''], documentAsk: '', askWords: [], junk: 'x' },
      schoolSupplies: {
        label: 'อุปกรณ์การเรียน 1-70',
        ask: 'โรงเรียนไหนคะ',
        schools: [
          { name: 'โรงเรียนใหม่', link: 'https://www.nattagroup.com/new1', aliases: ['ใหม่'] },
          { name: 'ลิงก์ไม่ปลอดภัย', link: 'http://insecure.example/x' },
          { name: '', link: 'https://x.example' },
        ],
      },
    },
  });
  assert.equal(shop.thanks, 'ยินดีค่ะ 😊');
  assert.equal(shop.holiday.weekday, 0);
  assert.equal(shop.contact.ask, 'เลือกคนได้เลยค่ะ');
  assert.deepEqual(shop.contact.orderWords, ['ป้าย', 'สติกเกอร์']);
  assert.deepEqual(shop.contact.askWords, []);
  assert.equal(shop.contact.documentAsk, data.contact.documentAsk); // an empty text keeps the shipped one
  assert.equal(shop.contact.junk, undefined);
  assert.equal(shop.schoolSupplies.label, 'อุปกรณ์การเรียน 1-70');
  assert.deepEqual(shop.schoolSupplies.schools.map((s) => s.name), ['โรงเรียนใหม่']);
  assert.equal(shop.schoolSupplies.found, data.schoolSupplies.found); // untouched keys keep their shipped value
  // a school list that is not a list leaves the shipped one alone
  assert.equal(buildShop({ content: { schoolSupplies: { schools: 'x' } } }).schoolSupplies.schools.length, data.schoolSupplies.schools.length);
});

test('the three people are still told as before when a rule answers (nothing about alerts changed)', async () => {
  const shop = makeShop({ rules: cleanRules([rule()]) });
  const t = setup({ shop });
  await t.media(CUSTOMER, 'image', { contentProvider: { type: 'line' } });
  assert.deepEqual(t.log.pushes.map((p) => p.to).sort(), Object.values(IDS).sort());
});
