import { test } from 'node:test';
import assert from 'node:assert/strict';
import { candidates, pick, createCatalog } from '../src/catalog.js';

const P = [
  { id: 'p1', code: 'A1', name: 'ไม้ถูพื้น', unit: 'อัน' },
  { id: 'p2', name: 'ไม้ถูพื้นสำเร็จรูป ตราช้าง', unit: 'อัน' },
  { id: 'p3', name: 'ปากกาลูกลื่นน้ำเงิน 0.5', unit: 'ด้าม' },
  { id: 'p4', name: 'ปากกาลูกลื่นแดง 0.5', unit: 'ด้าม' },
  { id: 'p5', name: 'สมุดปกอ่อน 80 แกรม', unit: 'เล่ม' },
  { id: 'p6', name: 'แปรงขัดห้องน้ำ', unit: 'อัน' },
  { id: 'p7', name: 'ไม้กวาดหยากไย่', unit: 'อัน' },
];

test('an exact name is the product; the best candidates come first', () => {
  assert.equal(pick(P, 'ไม้ถูพื้น').product.id, 'p1'); // p2 contains the words too, but p1 is the exact one
  assert.deepEqual(candidates(P, 'ไม้ถูพื้น').map((c) => c.p.id), ['p1', 'p2']);
  assert.equal(pick(P, 'แปรงขัดห้องน้ำ').product.id, 'p6');
  assert.equal(pick(P, 'ปากกาลูกลื่นน้ำเงิน').product.id, 'p3', 'the customer wrote most of the product\'s name and nothing else is close');
});

test('a general word is never linked to one product: the staff choose', () => {
  const r = pick(P, 'ปากกา');
  assert.equal(r.product, null, 'two pens match equally');
  assert.deepEqual(r.near.map((p) => p.id).sort(), ['p3', 'p4']);
  assert.equal(pick(P, 'สมุด').product, null, 'half a product name is a suggestion, not a match');
  assert.deepEqual(pick(P, 'สมุด').near.map((p) => p.id), ['p5']);
});

test('what the shop does not sell stays the customer\'s own words (nothing is invented or forced)', () => {
  assert.deepEqual(pick(P, 'ไม้กวาดทางมะพร้าว'), { product: null, near: [] });
  assert.deepEqual(pick(P, 'น้ำยาล้างจาน'), { product: null, near: [] });
  assert.equal(pick(P, 'น้ำยาล้างห้องน้ำ').product, null);
  assert.equal(pick(P, 'x').product, null, 'a single letter says nothing');
  assert.equal(pick([], 'ปากกา').product, null);
  assert.equal(pick(null, 'ปากกา').product, null);
});

test('a small difference in spelling still brings the right product up as a suggestion', () => {
  const r = pick(P, 'ไม้กวาดหยักใย'); // หยักใย / หยากไย่
  assert.equal(r.product, null);
  assert.deepEqual(r.near.map((p) => p.id), ['p7']);
});

test('two products with the very same name are never picked blindly', () => {
  const dup = [{ id: 'a', name: 'ยางลบก้อนเล็ก' }, { id: 'b', name: 'ยางลบก้อนเล็ก' }];
  assert.equal(pick(dup, 'ยางลบก้อนเล็ก').product, null);
  assert.equal(pick(dup, 'ยางลบก้อนเล็ก').near.length, 2);
});

test('the thresholds are the shop\'s to set', () => {
  assert.equal(pick(P, 'สมุด', { auto: 0.7, gap: 0.1 }).product.id, 'p5');
  assert.equal(pick(P, 'ไม้ถูพื้น', { auto: 0.99 }).product.id, 'p1');
  assert.deepEqual(pick(P, 'ไม้กวาดหยักใย', { hint: 0.99 }).near, []);
});

test('the catalogue is read once, shared by callers that arrive together, and read again after its time', async () => {
  let loads = 0;
  let t = 0;
  const cat = createCatalog({ load: async () => (loads++, P), ttlMs: 1000, now: () => t });
  const [a, b] = await Promise.all([cat.get(), cat.get()]);
  assert.equal(a, b);
  assert.equal(loads, 1);
  t = 500;
  await cat.get();
  assert.equal(loads, 1);
  t = 1500;
  assert.equal(await cat.get(), a, 'a stale copy is answered at once …');
  await new Promise((r) => setImmediate(r));
  assert.equal(loads, 2, '… while a new one is read behind the scenes');
});

test('nobody waits for a refresh: a slow database delays only the very first read', async () => {
  let t = 0;
  let release;
  let calls = 0;
  const cat = createCatalog({ load: () => (calls++ === 0 ? Promise.resolve(P) : new Promise((r) => { release = () => r([]); })), ttlMs: 10, now: () => t });
  assert.equal((await cat.get()).length, P.length);
  t = 100;
  const started = Date.now();
  assert.equal((await cat.get()).length, P.length, 'answered from the old copy while the refresh hangs');
  assert.ok(Date.now() - started < 200);
  release();
});

test('when the products cannot be read, the last copy is kept (or nothing) and nothing throws', async () => {
  let fail = false;
  let t = 0;
  const cat = createCatalog({ load: async () => { if (fail) throw new Error('db down'); return P; }, ttlMs: 10, now: () => t });
  assert.equal((await cat.get()).length, P.length);
  fail = true;
  t = 100;
  assert.equal((await cat.get()).length, P.length, 'the old copy');
  const never = createCatalog({ load: async () => { throw new Error('db down'); } });
  assert.deepEqual(await never.get(), []);
  const odd = createCatalog({ load: async () => ({ not: 'a list' }) });
  assert.deepEqual(await odd.get(), []);
});
