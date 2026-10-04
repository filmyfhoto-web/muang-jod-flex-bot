import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseSlip, slipReply, thaiDate, readSlip, MAX_BYTES } from '../src/slip.js';

const shop = JSON.parse(readFileSync(new URL('../data/shop.json', import.meta.url), 'utf8'));
const TODAY = '2026-10-04';
const png = Buffer.from('x');

test('parseSlip keeps only sane fields and ignores non-slips', () => {
  assert.equal(parseSlip({ kind: 'other' }, TODAY), null);
  assert.deepEqual(parseSlip({ kind: 'slip', amount: 350.5, date: '2026-10-03', bank: 'กสิกรไทย' }, TODAY), { amount: 350.5, date: '2026-10-03', bank: 'กสิกรไทย' });
  const bad = parseSlip({ kind: 'slip', amount: -5, date: '2099-01-01', bank: '<script>' }, TODAY);
  assert.equal(bad.amount, null);
  assert.equal(bad.date, null);
  assert.ok(!bad.bank.includes('<'));
});

test('thaiDate uses the Buddhist year', () => assert.equal(thaiDate('2026-10-03'), '3 ต.ค. 2569'));

const textOf = (m) => JSON.stringify(m);
test('the slip reply thanks, states what was read, and never claims the money arrived', () => {
  const t = textOf(slipReply(shop, { amount: 350, date: '2026-10-03', bank: 'กสิกรไทย' }));
  assert.ok(t.includes('ขอบคุณค่ะ') && t.includes('350') && t.includes('กสิกรไทย'));
  assert.ok(t.includes('ตรวจสอบยอดเงินเข้า'));
  assert.ok(!t.includes('ได้รับเงินแล้ว'));
  assert.ok(textOf(slipReply(shop, { amount: null, date: null, bank: null })).includes('ขอบคุณค่ะ'));
});

test('readSlip: returns the parsed slip, null for non-slips, wrong types, big files and errors', async () => {
  const ok = await readSlip(png, 'image/png', { extract: async () => ({ kind: 'slip', amount: 100 }), today: TODAY });
  assert.equal(ok.amount, 100);
  assert.equal(await readSlip(png, 'image/png', { extract: async () => ({ kind: 'other' }) }), null);
  assert.equal(await readSlip(png, 'image/gif', { extract: async () => ({ kind: 'slip' }) }), null);
  assert.equal(await readSlip(Buffer.alloc(MAX_BYTES + 1), 'image/png', { extract: async () => ({ kind: 'slip' }) }), null);
  assert.equal(await readSlip(png, 'image/png', { extract: async () => { throw new Error('boom'); } }), null);
  assert.equal(await readSlip(png, 'image/png', { env: {} }), null); // no API key
});
