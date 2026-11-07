import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildShop, modeOf, DEFAULT_ADMINS } from '../src/config.js';
import { shopChips, chipTexts } from '../src/chips.js';
import { IDS, NOTES } from './_shop.js';

const ADMINS = Object.entries(IDS).map(([name, userId]) => ({ name, userId }));
const ICONS = 'https://x.supabase.co/functions/v1/line-assets';

test('no settings at all: nobody to offer, quiet for the shop\'s 24 hours, the shop\'s buttons, plain sender', () => {
  const s = buildShop(null);
  assert.deepEqual(s.contact.people, []); // without LINE ids nobody can be told, so nobody is offered
  assert.equal(s.contact.quietMinutes, 24 * 60);
  assert.equal(s.paused, false);
  assert.equal(s.senderIcon, false);
  assert.equal(s.engineGreeting, false);
  assert.equal(s.assetBase, '');
  assert.equal(s.chips.length, 2);
  assert.equal(modeOf(null), 'off');
});

test('the people are the shop\'s own (names + what they look after); our row only adds their LINE ids', () => {
  const s = buildShop({ mode: 'all', admins: ADMINS });
  assert.deepEqual(s.contact.people.map((p) => p.name), DEFAULT_ADMINS.map((p) => p.name));
  assert.deepEqual(s.contact.people.map((p) => p.note), DEFAULT_ADMINS.map((p) => NOTES[p.name]));
  assert.deepEqual(s.contact.people.map((p) => p.userId), DEFAULT_ADMINS.map((p) => IDS[p.name]));

  // the shop reorders / drops someone / rewrites a note: we follow, and nobody it does not list is offered
  const bot = { admins: [{ name: 'ฟิล์ม', note: 'ป้าย' }, { name: 'หญิง', note: '' }] };
  const t = buildShop({ admins: ADMINS }, { bot });
  assert.deepEqual(t.contact.people.map((p) => [p.name, p.note]), [['ฟิล์ม', 'ป้าย'], ['หญิง', '']]);
});

test('a person without a valid LINE id is not offered, and neither is someone only our row knows about', () => {
  const s = buildShop({ admins: [{ name: 'หญิง', userId: 'not-an-id' }, { name: 'ฟิล์ม', userId: IDS.ฟิล์ม }, { name: 'มาลี', note: 'บัญชี', userId: 'U' + '9'.repeat(32) }] });
  assert.deepEqual(s.contact.people.map((p) => p.name), ['ฟิล์ม']);
});

test('quiet time follows the shop\'s silence_hours unless our row says otherwise', () => {
  assert.equal(buildShop({}, { bot: { silence_hours: 12 } }).contact.quietMinutes, 720);
  assert.equal(buildShop({}, { bot: { silence_hours: 0 } }).contact.quietMinutes, 1440); // nonsense → the shop's default
  assert.equal(buildShop({}, { bot: { silence_hours: 999 } }).contact.quietMinutes, 1440);
  assert.equal(buildShop({ quietMinutes: 20 }, { bot: { silence_hours: 12 } }).contact.quietMinutes, 20);
  assert.equal(buildShop({ alertEveryHours: 'x', burstSeconds: -1, pictureReplyMinutes: 5 }).contact.pictureReplyMinutes, 5);
  assert.equal(buildShop({ alertEveryHours: 'x', burstSeconds: -1 }).contact.alertEveryHours, 5); // bad values are ignored
  assert.equal(buildShop({ alertEveryHours: 'x', burstSeconds: -1 }).contact.burstSeconds, 6);
});

test('the buttons under our answers are the shop\'s topics only, with the same words', () => {
  const chips = shopChips({});
  assert.deepEqual(chips.map((c) => c.action.label), ['เวลาเปิด - ปิด', 'ที่ตั้งร้าน']);
  assert.deepEqual(chips.map((c) => c.action.type), ['message', 'message']);
  assert.ok(chips.every((c) => c.imageUrl === undefined)); // the topics have no picture, as in the shop

  const custom = shopChips({ admin_label: 'ถามแอดมิน', links: [{ url: 'https://shop.example/' }], old_chips: ['เวลาเปิดร้าน', 'ที่ตั้งร้าน'] });
  assert.deepEqual(custom.map((c) => c.action.label), ['เวลาเปิดร้าน', 'ที่ตั้งร้าน']);
  // never more than LINE shows, never a label longer than LINE allows
  const many = shopChips({ old_chips: Array.from({ length: 30 }, (_, i) => `หัวข้อยาวมากมากมากมากมาก ${i}`) });
  assert.ok(many.length <= 13 && many.every((c) => c.action.label.length <= 20));
  // the admin's words are still a request for a person and a tap, though their button is on the picture now
  assert.ok(chipTexts({ admin_label: 'ถามแอดมิน' }).includes('ถามแอดมิน'));
});

test('the shop\'s own "talk to the admin" button counts as asking for a person, and its buttons count as taps', () => {
  const s = buildShop({}, { bot: { admin_label: 'ถามแอดมิน' } });
  assert.ok(s.contact.buttonAliases.includes('ถามแอดมิน'));
  assert.ok(s.menuTexts.includes('ส่งเอกสารโครงการ') && s.menuTexts.includes('ถามแอดมิน') && s.menuTexts.includes('ที่ตั้งร้าน'));
});

test('switches: greeting, avatar, pause, https-only picture folder, content overrides of the same kind only', () => {
  const s = buildShop({ greeting: true, senderIcon: true, paused: true, assets_base: 'https://p.example/a/', notify: false, content: { thanks: 'ขอบคุณค่ะ', faq: 'oops', name: 5, holiday: { weekday: 5, message: 'หยุด' } } });
  assert.equal(s.engineGreeting, true);
  assert.equal(s.senderIcon, true);
  assert.equal(s.paused, true);
  assert.equal(s.assetBase, 'https://p.example/a');
  assert.equal(s.contact.notify, false);
  assert.equal(s.thanks, 'ขอบคุณค่ะ');
  assert.ok(Array.isArray(s.faq)); // 'oops' is not a list, ignored
  assert.equal(typeof s.name, 'string'); // 5 is not text, ignored
  assert.equal(s.holiday.weekday, 5);
  assert.equal(buildShop({ assets_base: 'http://p.example/a' }).assetBase, '');
  assert.equal(buildShop({ assets_base: '/relative' }).assetBase, '');
});

test('modes: only off / admins / all, anything else is off', () => {
  for (const m of ['off', 'admins', 'all']) assert.equal(modeOf({ mode: m }), m);
  for (const m of ['ALL', 'on', '', undefined, 3]) assert.equal(modeOf({ mode: m }), 'off');
});
