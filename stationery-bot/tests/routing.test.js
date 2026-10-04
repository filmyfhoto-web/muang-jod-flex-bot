import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildReply } from '../src/replies.js';
import { applyHoliday, createNoticeTracker } from '../src/holiday.js';

const base = JSON.parse(readFileSync(new URL('../data/shop.json', import.meta.url), 'utf8'));
const LINKS = { female: 'https://line.me/ti/p/~female-demo', film: 'https://line.me/ti/p/~film-demo' };
const shop = {
  ...base,
  adminRouting: {
    ...base.adminRouting,
    admins: {
      female: { ...base.adminRouting.admins.female, link: LINKS.female },
      film: { ...base.adminRouting.admins.film, link: LINKS.film },
    },
  },
};
const withPics = { ...shop, assetBase: 'https://bot.example' };
const FEMALE = ['ร้านเครื่องเขียน', 'อุปกรณ์สำนักงาน', 'ใบเสนอราคา', 'ใบส่งของ'];
const FILM = ['ทำไวนิล', 'ทำรูปพร้อมกรอบ', 'ทำตรายาง'];
const lineButton = (r) => r.messages[0].contents?.footer.contents.find((c) => c.action?.type === 'uri')?.action;

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

test('stationery / office / quotation / delivery note → the female admin\'s LINE', () => {
  for (const t of FEMALE) {
    const r = buildReply(t, shop);
    assert.equal(lineButton(r).uri, LINKS.female, t);
    assert.equal(r.messages[0].contents.header.contents[0].text, 'แอดมินหญิง');
    assert.match(JSON.stringify(r.messages[0]), new RegExp(t));
    assert.equal(r.quiet, true);
    assert.ok(!r.handoff); // the holiday notice must not swallow the link card
  }
});

test('vinyl / framed photo / rubber stamp → admin Film\'s LINE', () => {
  for (const t of FILM) {
    const r = buildReply(t, shop);
    assert.equal(lineButton(r).uri, LINKS.film, t);
    assert.equal(r.messages[0].contents.header.contents[0].text, 'แอดมินฟิล์ม');
  }
});

test('looser wording counts only right after the question', () => {
  assert.equal(lineButton(buildReply('อยากทำไวนิลค่ะ', shop, { awaitingAdmin: true })).uri, LINKS.film);
  assert.equal(lineButton(buildReply('ขอใบเสนอราคาหน่อย', shop, { awaitingAdmin: true })).uri, LINKS.female);
  assert.equal(lineButton(buildReply('ตรายาง', shop, { awaitingAdmin: true })).uri, LINKS.film);
  // not asked: ordinary chat is not turned into a handoff
  assert.equal(lineButton(buildReply('อยากทำไวนิลค่ะ', shop)), undefined);
  assert.equal(buildReply('อยากทำไวนิลค่ะ', shop).quiet, undefined);
});

test('something else while asked → carries on as usual and stops asking', () => {
  const r = buildReply('ปากกา', shop, { awaitingAdmin: true });
  assert.ok(!r.awaitingAdmin);
  assert.match(JSON.stringify(r.messages[0]), /ปากกาลูกลื่น/);
});

test('an admin with no LINE link yet falls back to the plain "admin will answer" reply', () => {
  const r = buildReply('ทำไวนิล', base); // links are blank in the shipped file
  assert.equal(r.handoff, true);
  assert.equal(r.quiet, true);
  assert.match(JSON.stringify(r.messages[0]), /แอดมินจะรีบมาตอบ/);
  assert.equal(lineButton(r), undefined);
});

test('no routing configured → the old single handoff', () => {
  const r = buildReply('แอดมิน', { ...base, adminRouting: undefined });
  assert.equal(r.handoff, true);
  assert.equal(r.messages[0].type, 'text');
});

test('on a Saturday the customer still gets the link card, after the closing notice', () => {
  const sat = new Date('2026-10-03T05:00:00Z');
  const r = buildReply('ทำไวนิล', shop);
  const out = applyHoliday(r.messages, { shop, userId: 'u', tracker: createNoticeTracker(), now: sat, handoff: r.handoff });
  assert.equal(out.length, 2);
  assert.match(out[0].text, /ร้านหยุดทุกวันเสาร์/);
  assert.equal(out[1].contents.footer.contents[0].action.uri, LINKS.film);
});

test('LINE links in the shop file, once filled in, must be https URLs', () => {
  for (const [key, a] of Object.entries(base.adminRouting.admins)) {
    assert.ok(a.link === '' || /^https:\/\/\S+$/.test(a.link), `${key} link`);
    assert.ok(a.buttonLabel.length <= 20);
  }
  const keys = Object.keys(base.adminRouting.admins);
  assert.ok(base.adminRouting.topics.every((t) => keys.includes(t.admin)));
  assert.ok(base.adminRouting.topics.every((t) => t.label.length <= 20));
});
