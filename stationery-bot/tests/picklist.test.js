import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parsePickList, pickListKey, pickListAltText, pickListPushText, itemLine, fmtQty } from '../src/picklist.js';
import { pickListCard } from '../src/flex.js';

const shop = JSON.parse(readFileSync(new URL('../data/shop.json', import.meta.url), 'utf8'));

// the list a school sent in the chat (the case this was built for)
const SCHOOL = ['ไม้กวาดทางมะพร้าว=10', 'ไม้กวาดหยักใย=2', 'ไม้ถูพื้น=10', 'แปรงขัดห้องน้ำ=10', 'ขันน้ำ=10', 'น้ำยาล้างห้องน้ำ=2แพค', 'น้ำยาล้างจาน=1แกลอน'].join('\n');

test('the school\'s list is read into seven lines with their units', () => {
  const r = parsePickList(SCHOOL);
  assert.equal(r.items.length, 7);
  assert.deepEqual(r.items[0], { name: 'ไม้กวาดทางมะพร้าว', qty: 10, unit: '' });
  assert.deepEqual(r.items[5], { name: 'น้ำยาล้างห้องน้ำ', qty: 2, unit: 'แพค' });
  assert.deepEqual(r.items[6], { name: 'น้ำยาล้างจาน', qty: 1, unit: 'แกลอน' });
  assert.equal(r.note, '');
});

test('other ways customers write a list: x, ×, a unit after the number, bullets, a header and a closing remark', () => {
  assert.deepEqual(parsePickList('ปากกา x2\nสมุด × 10\nยางลบ 5 ก้อน').items.map((i) => [i.name, i.qty, i.unit]), [['ปากกา', 2, ''], ['สมุด', 10, ''], ['ยางลบ', 5, 'ก้อน']]);
  assert.deepEqual(parsePickList('1. ปากกา = 10 ด้าม\n2. ดินสอ = 5\n3) ยางลบ = 3').items.map((i) => [i.name, i.qty, i.unit]), [['ปากกา', 10, 'ด้าม'], ['ดินสอ', 5, ''], ['ยางลบ', 3, '']]);
  assert.deepEqual(parsePickList('น้ำยา=1.5 ลิตร\nผ้า=2').items[0], { name: 'น้ำยา', qty: 1.5, unit: 'ลิตร' });
  const withNotes = parsePickList('ขอสั่งของครับ\nปากกา x2\nสมุด × 10\nยางลบ 5 ก้อน\nขอบคุณครับ');
  assert.equal(withNotes.items.length, 3);
  assert.equal(withNotes.note, 'ขอสั่งของครับ ขอบคุณครับ');
});

test('what is not an order list stays one: a remark, one line, a phone number, a time, "Max 5", plain questions', () => {
  for (const t of [
    'ฝากจัดของตามนี้จิ่มเน้อครับ ประมาณวันที่28 ครูเขาจะแวะเอาครับ ลงไว้งบนอกครับ',
    'ปากกาน้ำเงิน=10', // one line: the bot's ordinary answers handle it
    'ชื่อ=สมชาย\nเบอร์=0812345678\nวันที่=28',
    'เวลา: 09:00\nสถานที่: โรงเรียน',
    'Max 5\nPro 3',
    'สวัสดีครับ\nขอถามราคาปากกาหน่อยครับ\nมีไหมครับ',
    '',
    null,
  ]) assert.equal(parsePickList(t), null, String(t));
  // far too many lines is not a customer's order
  assert.equal(parsePickList(Array.from({ length: 80 }, (_, i) => `สินค้า${i}=1`).join('\n')), null);
});

test('the same list is the same list however the spaces fall; a different list is not', () => {
  assert.equal(pickListKey(SCHOOL), pickListKey(SCHOOL.replace(/=/g, ' = ')));
  assert.notEqual(pickListKey(SCHOOL), pickListKey(SCHOOL.replace('=10', '=11')));
});

test('texts for the banner and for the web app note', () => {
  const { items } = parsePickList(SCHOOL);
  assert.equal(itemLine(items[5]), 'น้ำยาล้างห้องน้ำ × 2 แพค');
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
  const buttons = card.contents.footer.contents;
  assert.deepEqual(buttons.map((b) => b.action.type), ['uri', 'uri']);
  assert.equal(buttons[1].action.uri, 'https://admin.nattagroup.com/#projdocs');
  for (const b of buttons) assert.ok([...b.action.label].length <= 20, b.action.label);
  assert.ok(card.altText.length <= 400);
  // no buttons without links
  assert.equal(pickListCard(shop, { customerName: 'x', items, altText: 'a' }).contents.footer, undefined);
});
