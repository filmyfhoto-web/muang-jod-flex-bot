import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildReply } from '../src/replies.js';
import { applyHoliday, createNoticeTracker } from '../src/holiday.js';

const base = JSON.parse(readFileSync(new URL('../data/shop.json', import.meta.url), 'utf8'));
const shop = base;
const withPics = { ...shop, assetBase: 'https://bot.example' };
const FEMALE = ['ร้านเครื่องเขียน', 'อุปกรณ์สำนักงาน', 'ใบเสนอราคา', 'ใบส่งของ'];
const FILM = ['ทำไวนิล', 'ทำรูปพร้อมกรอบ', 'ทำตรายาง'];
const lineButton = (r) => r.messages[0].contents?.footer?.contents.find((c) => c.action?.type === 'uri')?.action;

test('"คุยกับแอดมิน" asks for the subject first, grouped by admin, and stays chatty', () => {
  const r = buildReply('แอดมิน', withPics);
  assert.equal(r.awaitingAdmin, true);
  assert.ok(!r.quiet && !r.handoff);
  const rows = r.messages[0].contents.footer.contents;
  const labels = rows.filter((c) => c.type === 'button').map((c) => c.action.label);
  assert.deepEqual(labels, [...FEMALE, ...FILM]);
  const texts = rows.filter((c) => c.type === 'text').map((c) => c.text);
  assert.deepEqual(texts, ['แอดมินหญิง', 'แอดมินฟิล์ม']);
  assert.ok(labels.every((l) => l.length <= 20));
  assert.equal(r.messages[0].contents.header.contents[1].url, 'https://bot.example/assets/admin.png');
});

test('office / quotation topics → the female admin is named; the chat stays in the OA', () => {
  for (const t of FEMALE) {
    const r = buildReply(t, shop);
    assert.equal(r.messages[0].contents.header.contents[0].text, 'แอดมินหญิง', t);
    assert.match(JSON.stringify(r.messages[0]), new RegExp(`รับเรื่อง \\\\"${t}\\\\"`));
    assert.match(JSON.stringify(r.messages[0]), /ตอบกลับในแชทนี้/);
    assert.equal(lineButton(r), undefined, 'no button out to a personal LINE');
    assert.equal(r.quiet, true);
    assert.ok(!r.handoff); // the holiday notice must not swallow this card
  }
});

test('vinyl / framed photo / rubber stamp → admin Film is named', () => {
  for (const t of FILM) {
    const r = buildReply(t, shop);
    assert.equal(r.messages[0].contents.header.contents[0].text, 'แอดมินฟิล์ม', t);
    assert.equal(lineButton(r), undefined);
  }
});

test('looser wording counts only right after the question', () => {
  const who = (t, st) => buildReply(t, shop, st).messages[0]?.contents?.header.contents[0].text;
  assert.equal(who('อยากทำไวนิลค่ะ', { awaitingAdmin: true }), 'แอดมินฟิล์ม');
  assert.equal(who('ขอใบเสนอราคาหน่อย', { awaitingAdmin: true }), 'แอดมินหญิง');
  assert.equal(who('ตรายาง', { awaitingAdmin: true }), 'แอดมินฟิล์ม');
  // not asked: ordinary chat is not turned into a handoff
  assert.notEqual(who('อยากทำไวนิลค่ะ', {}), 'แอดมินฟิล์ม');
  assert.equal(buildReply('อยากทำไวนิลค่ะ', shop).quiet, undefined);
});

test('something else while asked → carries on as usual and stops asking', () => {
  const r = buildReply('ปากกา', shop, { awaitingAdmin: true });
  assert.ok(!r.awaitingAdmin);
  assert.match(JSON.stringify(r.messages[0]), /ปากกาลูกลื่น/);
});

test('an optional personal-LINE link adds a button, but the shipped file sets none', () => {
  assert.ok(Object.values(base.adminRouting.admins).every((a) => !a.link));
  const withLink = {
    ...shop,
    adminRouting: { ...shop.adminRouting, admins: { ...shop.adminRouting.admins, film: { ...shop.adminRouting.admins.film, link: 'https://line.me/ti/p/~x' } } },
  };
  assert.equal(lineButton(buildReply('ทำไวนิล', withLink)).uri, 'https://line.me/ti/p/~x');
});

test('no routing configured → the old single handoff', () => {
  const r = buildReply('แอดมิน', { ...base, adminRouting: undefined });
  assert.equal(r.handoff, true);
  assert.equal(r.messages[0].type, 'text');
});

test('on a Saturday the customer still gets the admin card, after the closing notice', () => {
  const sat = new Date('2026-10-03T05:00:00Z');
  const r = buildReply('ทำไวนิล', shop);
  const out = applyHoliday(r.messages, { shop, userId: 'u', tracker: createNoticeTracker(), now: sat, handoff: r.handoff });
  assert.equal(out.length, 2);
  assert.match(out[0].text, /ร้านหยุดทุกวันเสาร์/);
  assert.match(JSON.stringify(out[1]), /แอดมินฟิล์ม/);
});

test('routing config is consistent', () => {
  const keys = Object.keys(base.adminRouting.admins);
  assert.ok(base.adminRouting.topics.every((t) => keys.includes(t.admin)));
  assert.ok(base.adminRouting.topics.every((t) => t.label.length <= 20));
});
