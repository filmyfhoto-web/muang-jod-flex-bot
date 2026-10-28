import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parsePickList, parseOrderText, dayToDate, normUnit, pickListKey, pickListAltText, pickListPushText, itemLine, fmtQty } from '../src/picklist.js';
import { pickListCard } from '../src/flex.js';

const shop = JSON.parse(readFileSync(new URL('../data/shop.json', import.meta.url), 'utf8'));

// the list a school sent in the chat (the case this was built for)
const SCHOOL = ['ไม้กวาดทางมะพร้าว=10', 'ไม้กวาดหยักใย=2', 'ไม้ถูพื้น=10', 'แปรงขัดห้องน้ำ=10', 'ขันน้ำ=10', 'น้ำยาล้างห้องน้ำ=2แพค', 'น้ำยาล้างจาน=1แกลอน'].join('\n');
const lines = (r) => r.items.map((i) => [i.name, i.qty, i.unit]);

test('the school\'s list is read into seven lines; units are spelled the way the shop\'s catalogue spells them', () => {
  const r = parsePickList(SCHOOL);
  assert.equal(r.items.length, 7);
  assert.deepEqual(lines(r)[0], ['ไม้กวาดทางมะพร้าว', 10, '']);
  assert.deepEqual(lines(r)[5], ['น้ำยาล้างห้องน้ำ', 2, 'แพ็ค']); // แพค → แพ็ค
  assert.deepEqual(lines(r)[6], ['น้ำยาล้างจาน', 1, 'แกลลอน']); // แกลอน → แกลลอน
  assert.equal(r.items[5].raw, 'น้ำยาล้างห้องน้ำ=2แพค', 'the customer\'s own line is kept next to the tidy one');
  assert.equal(r.note, '');
});

test('other ways customers write a list: x, ×, a unit after the number or before the name, bullets, a header and a closing remark', () => {
  assert.deepEqual(lines(parsePickList('ปากกา x2\nสมุด × 10\nยางลบ 5 ก้อน')), [['ปากกา', 2, ''], ['สมุด', 10, ''], ['ยางลบ', 5, 'ก้อน']]);
  assert.deepEqual(lines(parsePickList('1. ปากกา = 10 ด้าม\n2. ดินสอ = 5\n3) ยางลบ = 3')), [['ปากกา', 10, 'ด้าม'], ['ดินสอ', 5, ''], ['ยางลบ', 3, '']]);
  assert.deepEqual(lines(parsePickList('- ปากกา 10 ด้าม\n- สมุด 5 เล่ม\n- ดินสอ 2 โหล')), [['ปากกา', 10, 'ด้าม'], ['สมุด', 5, 'เล่ม'], ['ดินสอ', 2, 'โหล']]);
  assert.deepEqual(lines(parsePickList('10 อัน ไม้กวาด\n2 แพค น้ำยา')), [['ไม้กวาด', 10, 'อัน'], ['น้ำยา', 2, 'แพ็ค']]);
  assert.deepEqual(lines(parsePickList('09:15 ปากกา=10\n09:16 สมุด=5')), [['ปากกา', 10, ''], ['สมุด', 5, '']], 'chat times are dropped');
  assert.deepEqual(lines(parsePickList('ปากกา=1,200\nสมุด=5'))[0], ['ปากกา', 1200, '']);
  const dec = parsePickList('น้ำยา=1.5 ลิตร\nผ้า=2');
  assert.deepEqual(lines(dec)[0], ['น้ำยา', 1.5, 'ลิตร']);
  const withNotes = parsePickList('ขอสั่งของครับ\nปากกา x2\nสมุด × 10\nยางลบ 5 ก้อน\nขอบคุณครับ');
  assert.equal(withNotes.items.length, 3);
  assert.equal(withNotes.note, 'ขอสั่งของครับ ขอบคุณครับ');
});

test('"วันที่ 28" is the day the customer needs it, and the remark around the list is kept apart from the lines', () => {
  const r = parsePickList('ฝากจัดของ\nไม้กวาด=10\nน้ำยา=2 แกลลอน\nวันที่ 28 ครูจะมารับ');
  assert.equal(r.items.length, 2);
  assert.equal(r.day, 28);
  assert.equal(r.note, 'ฝากจัดของ วันที่ 28 ครูจะมารับ');
  // the next 28th in Bangkok: this month if it has not passed, otherwise next month (and never a day the month does not have)
  const at = Date.parse('2026-10-26T05:00:00Z');
  assert.equal(dayToDate(28, at), '2026-10-28');
  assert.equal(dayToDate(5, at), '2026-11-05');
  assert.equal(dayToDate(31, Date.parse('2026-11-26T05:00:00Z')), '2026-11-30');
  assert.equal(dayToDate(2, Date.parse('2026-12-30T05:00:00Z')), '2027-01-02');
});

test('what is not an order list stays one: a remark, one line, a phone number, a time, an address, a model name, plain questions', () => {
  for (const t of [
    'ฝากจัดของตามนี้จิ่มเน้อครับ ประมาณวันที่28 ครูเขาจะแวะเอาครับ ลงไว้งบนอกครับ',
    'ปากกาน้ำเงิน=10', // one line: the bot's ordinary answers handle it
    'ชื่อ=สมชาย\nเบอร์=0812345678\nวันที่=28',
    'เวลา: 09:00\nสถานที่: โรงเรียน',
    'Max 5\nPro 3', // a bare "name number" is not enough on its own …
    'บ้านเลขที่ 12\nหมู่ 5', // … nor an address
    'ปากกา 10\nสมุด 5\nดินสอ 3',
    'สวัสดีครับ\nขอถามราคาปากกาหน่อยครับ\nมีไหมครับ',
    '',
    null,
  ]) assert.equal(parsePickList(t), null, String(t));
  // far too many lines is not a customer's order
  assert.equal(parsePickList(Array.from({ length: 80 }, (_, i) => `สินค้า${i}=1`).join('\n')), null);
});

test('a bare "name number" line rides along with lines that say their quantity, but cannot make a list alone', () => {
  const r = parsePickList('ปากกา 10 ด้าม\nสมุด 5');
  assert.deepEqual(lines(r), [['ปากกา', 10, 'ด้าม'], ['สมุด', 5, '']]);
  assert.deepEqual(r.items.map((i) => Boolean(i.strong)), [true, false]);
  // the web app's paste box (a person chose to paste) takes the bare lines too
  assert.equal(parseOrderText('Max 5\nPro 3').items.length, 2);
});

test('units: the ways a customer spells them become the catalogue\'s', () => {
  assert.equal(normUnit('แพค'), 'แพ็ค');
  assert.equal(normUnit('แพ็ก'), 'แพ็ค');
  assert.equal(normUnit('แกลอน'), 'แกลลอน');
  assert.equal(normUnit('กป'), 'กระป๋อง');
  assert.equal(normUnit('ด้าม'), 'ด้าม');
  assert.equal(normUnit(''), '');
});

test('the same list is the same list however the spaces fall; a different list is not', () => {
  assert.equal(pickListKey(SCHOOL), pickListKey(SCHOOL.replace(/=/g, ' = ')));
  assert.notEqual(pickListKey(SCHOOL), pickListKey(SCHOOL.replace('=10', '=11')));
});

test('texts for the banner and for the web app note', () => {
  const { items } = parsePickList(SCHOOL);
  assert.equal(itemLine(items[5]), 'น้ำยาล้างห้องน้ำ × 2 แพ็ค');
  assert.equal(fmtQty(1.5), '1.5');
  assert.equal(pickListAltText({ customer: 'ปู่', count: 7 }), '📋 มีรายการสั่งจัดของ — ไลน์ชื่อ ปู่ (7 รายการ)');
  const body = pickListPushText({ customer: 'ปู่', items });
  assert.match(body, /^ไลน์ชื่อ ปู่ · 7 รายการ: ไม้กวาดทางมะพร้าว × 10/);
  assert.ok(body.length <= 240);
  const many = pickListPushText({ customer: 'ปู่', items: Array.from({ length: 40 }, (_, i) => ({ name: `สินค้าตัวอย่างที่ ${i}`, qty: 3, unit: '' })) });
  assert.ok(many.length <= 240 && many.endsWith('…'), many.length);
});

test('the admin card: the list, the customer\'s LINE name, and two buttons that fit LINE', () => {
  const { items } = parsePickList(SCHOOL);
  const card = pickListCard(shop, {
    customerName: 'ปู่',
    customerPhoto: 'https://example.com/p.png',
    items: items.slice(0, 5),
    more: 2,
    note: 'ฝากจัดของ',
    link: 'https://chat.line.biz/x',
    appUrl: 'https://admin.nattagroup.com/#projdocs',
    altText: pickListAltText({ customer: 'ปู่', count: 7 }),
  });
  assert.equal(card.type, 'flex');
  assert.equal(card.contents.type, 'bubble');
  const json = JSON.stringify(card);
  for (const s of ['📋 มีรายการสั่งจัดของ', 'ไลน์ชื่อ ปู่', '7 รายการ', 'ไม้กวาดทางมะพร้าว', '× 10', 'และอีก 2 รายการ', 'ฝากจัดของ']) assert.ok(json.includes(s), s);
  assert.ok(!json.includes('บันทึกในแอปแล้ว'), 'no job number when the list was only announced');
  const buttons = card.contents.footer.contents;
  assert.deepEqual(buttons.map((b) => b.action.type), ['uri', 'uri']);
  assert.equal(buttons[1].action.uri, 'https://admin.nattagroup.com/#projdocs');
  assert.equal(buttons[1].action.label, 'เปิดหน้าออเดอร์ในแอป');
  for (const b of buttons) assert.ok([...b.action.label].length <= 20, b.action.label);
  assert.ok(card.altText.length <= 400);
  // no buttons without links
  assert.equal(pickListCard(shop, { customerName: 'x', items, altText: 'a' }).contents.footer, undefined);
});

test('the admin card for a list that was saved in the app: the job number, what joined, what waits for a product check, and a button to that job', () => {
  const { items } = parsePickList(SCHOOL);
  const card = pickListCard(shop, {
    customerName: 'ปู่',
    items: items.slice(0, 5),
    more: 2,
    link: 'https://chat.line.biz/x',
    appUrl: 'https://admin.nattagroup.com/?doc=PJ-0123#projdocs',
    altText: 'a',
    docNo: 'PJ-0123',
    review: 4,
  });
  const json = JSON.stringify(card);
  for (const s of ['✅ บันทึกในแอปแล้ว PJ-0123', '⚠️ 4 รายการรอตรวจสอบสินค้า']) assert.ok(json.includes(s), s);
  const app = card.contents.footer.contents[1].action;
  assert.equal(app.label, 'เปิดใบ PJ-0123 ในแอป');
  assert.equal(app.uri, 'https://admin.nattagroup.com/?doc=PJ-0123#projdocs');
  assert.ok([...app.label].length <= 20);
  const more = JSON.stringify(pickListCard(shop, { customerName: 'x', items, altText: 'a', docNo: 'PJ-0123', merged: true, added: 3 }));
  assert.ok(more.includes('✅ เพิ่มอีก 3 รายการในใบเดิม PJ-0123'));
});
