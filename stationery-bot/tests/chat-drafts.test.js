// The pure part of the chat-to-order drafts (src/orders/draft.js and config.js): what a message means, the lines a draft holds,
// the merge that keeps one customer's messages in one draft, and the switches. The database side is in db/test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyText, itemsFromLines, mergeItems, noteAppend, summarize } from '../src/orders/draft.js';
import { chatDraftsFromEnv } from '../src/orders/config.js';

const PRODUCTS = [
  { id: 'p1', code: 'A1', name: 'ไม้ถูพื้น', unit: 'อัน', price: 55 },
  { id: 'p2', code: 'A2', name: 'น้ำยาล้างจาน', unit: 'ขวด', price: 60 },
  { id: 'p3', code: 'A3', name: 'ปากกาลูกลื่นน้ำเงิน 0.5', unit: 'ด้าม', price: 5 },
  { id: 'p4', code: 'A4', name: 'ปากกาลูกลื่นแดง 0.5', unit: 'ด้าม', price: 5 },
];

test('a list of two or more lines is a list; a single clear line is a single order; a greeting is ignored', () => {
  const list = classifyText('ไม้ถูพื้น=10\nน้ำยาล้างจาน=1แกลอน', { open: false });
  assert.equal(list.kind, 'list');
  assert.equal(list.items.length, 2);
  assert.equal(classifyText('ไม้ถูพื้น 2 อัน', { open: false }).kind, 'single');
  assert.equal(classifyText('สวัสดีค่ะ', { open: false }).kind, 'ignore');
  assert.equal(classifyText('ขอบคุณค่ะ', { open: false }).kind, 'ignore');
});

test('while a draft is open, items join it as "follow"; other words are kept as a remark with the customer\'s own text', () => {
  assert.equal(classifyText('ไม้ถูพื้น 2 อัน', { open: true }).kind, 'follow');
  const remark = classifyText('ฝากจัดของตามนี้นะครับ วันที่ 28 ครูจะมารับ', { open: true });
  assert.equal(remark.kind, 'remark');
  assert.deepEqual(remark.items, []);
  assert.deepEqual(remark.notes, ['ฝากจัดของตามนี้นะครับ วันที่ 28 ครูจะมารับ']);
  assert.ok(remark.day === 28 || remark.day === null, 'the day, when the message gives one');
});

test('an ordering word is not a product: "ขอ 1 ขวด" is one bottle with no name, not a line called "ขอ"', () => {
  const open = classifyText('ขอ 1 ขวดค่ะ', { open: true });
  assert.equal(open.kind, 'remark', 'no line from it: the AI may read it with the messages before it');
  assert.deepEqual(open.items, []);
  assert.equal(classifyText('ขอ 1 ขวดค่ะ', { open: false }).kind, 'ignore');
  assert.equal(classifyText('ขอ 5 ชิ้นด้วยค่ะ', { open: true }).items.length, 0);
});

test('a word that is part of a product name is left alone: "ขอบกระดาษ" is not "ขอ" plus "บกระดาษ"', () => {
  const c = classifyText('ขอบกระดาษ 2 ม้วน', { open: false });
  assert.equal(c.kind, 'single');
  assert.equal(c.items[0].name, 'ขอบกระดาษ');
  assert.equal(c.items[0].qty, 2);
});

test('a list header such as "ขอ" on its own line does not stop the list', () => {
  const c = classifyText('ขอ\nไม้ถูพื้น=2\nน้ำยาล้างจาน=1', { open: false });
  assert.equal(c.kind, 'list');
  assert.deepEqual(c.items.map((x) => x.name), ['ไม้ถูพื้น', 'น้ำยาล้างจาน']);
});

test('a line the shop has by its name is linked to the product; a line it cannot tell apart waits for a check', () => {
  const lines = [
    { name: 'ไม้ถูพื้น', qty: 10, unit: '', raw: 'ไม้ถูพื้น=10' },
    { name: 'ไม้กวาดทางมะพร้าว', qty: 10, unit: '', raw: 'ไม้กวาดทางมะพร้าว=10' },
  ];
  const [water, broom] = itemsFromLines(lines, PRODUCTS, { src: 'chat' });
  assert.equal(water.product_id, 'p1');
  assert.equal(water.status, 'ok');
  assert.equal(water.unit, 'อัน', 'the product’s unit when the customer wrote none');
  assert.equal(water.price, null, 'no price is set from the list: the product’s price is taken when the order is confirmed');
  assert.equal(water.product_price, 55, 'the price the staff see');
  assert.equal(broom.product_id, null);
  assert.equal(broom.status, 'review');
  assert.equal(broom.name, 'ไม้กวาดทางมะพร้าว', 'the customer’s words are kept');
});

test('a customer’s unit is written the way the shop writes it ("แกลอน" → "แกลลอน")', () => {
  const [line] = itemsFromLines([{ name: 'น้ำยาล้างจาน', qty: 1, unit: 'แกลอน', raw: 'น้ำยาล้างจาน=1แกลอน' }], PRODUCTS);
  assert.equal(line.unit, 'แกลลอน');
});

test('a second message with the same lines adds nothing; a line the staff took out is not put back', () => {
  const old = itemsFromLines([{ name: 'ไม้ถูพื้น', qty: 2, unit: '', raw: 'ไม้ถูพื้น 2' }], PRODUCTS);
  const again = mergeItems(old, itemsFromLines([{ name: 'ไม้ถูพื้น', qty: 2, unit: '', raw: 'ไม้ถูพื้น 2' }], PRODUCTS));
  assert.equal(again.added, 0);
  assert.equal(again.items.length, 1);
  const removed = old.map((x) => ({ ...x, removed: true }));
  const back = mergeItems(removed, itemsFromLines([{ name: 'ไม้ถูพื้น', qty: 2, unit: '', raw: 'ไม้ถูพื้น 2' }], PRODUCTS));
  assert.equal(back.added, 0, 'a line the staff removed is not added again');
});

test('a draft holds at most the number of lines the settings allow', () => {
  const many = Array.from({ length: 5 }, (_, i) => itemsFromLines([{ name: 'ไม้ถูพื้น', qty: i + 1, unit: '', raw: 'x' }], PRODUCTS)[0]);
  const m = mergeItems([], many, 3);
  assert.equal(m.items.length, 3);
  assert.equal(m.added, 3);
});

test('the note keeps every message in order, does not repeat one, and stays within its limit', () => {
  let note = noteAppend(null, 'ฝากจัดของ');
  note = noteAppend(note, 'วันที่ 28');
  note = noteAppend(note, 'ฝากจัดของ');
  assert.equal(note, 'ฝากจัดของ\n———\nวันที่ 28');
  assert.equal(noteAppend(note, 'x'.repeat(2000), 1000), note, 'a message too long for the note is not added');
});

test('the summary counts the lines that are linked, waiting for a check and removed', () => {
  const items = [
    { product_id: 'p1', staff_ok: false, removed: false },
    { product_id: null, staff_ok: false, removed: false },
    { product_id: null, staff_ok: true, removed: false },
    { product_id: null, staff_ok: false, removed: true },
  ];
  assert.deepEqual(summarize(items), { lines: 3, linked: 1, review: 1, removed: 1 });
});

test('the switches on Render win over the file; a value they do not know is ignored and the file’s value stays', () => {
  const file = { mode: 'off', ai: { mode: 'off' }, ack: { enabled: false, text: 'x' }, pilotUserIds: ['U' + 'a'.repeat(32)] };
  const on = chatDraftsFromEnv(file, { CHATDRAFTS_MODE: 'ON', CHATDRAFTS_AI: 'pilot', CHATDRAFTS_ACK: 'on', CHATDRAFTS_PILOT_IDS: 'U' + 'b'.repeat(32) + ', nonsense' });
  assert.equal(on.mode, 'on');
  assert.equal(on.ai.mode, 'pilot');
  assert.equal(on.ack.enabled, true);
  assert.deepEqual(on.pilotUserIds, ['U' + 'b'.repeat(32)]);
  assert.equal(on.ack.text, 'x', 'the rest of the ack settings are kept');
  const unknown = chatDraftsFromEnv(file, { CHATDRAFTS_MODE: 'maybe', CHATDRAFTS_ACK: '' });
  assert.equal(unknown.mode, 'off');
  assert.equal(unknown.ack.enabled, false);
  assert.equal(file.mode, 'off', 'the file object is not changed');
});
