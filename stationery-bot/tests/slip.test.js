import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseSlip, slipReply, readSlip, MAX_BYTES } from '../src/slip.js';

const shop = JSON.parse(readFileSync(new URL('../data/shop.json', import.meta.url), 'utf8'));
const png = Buffer.from('x');

test('parseSlip only says whether it is a slip', () => {
  assert.equal(parseSlip({ kind: 'other' }), null);
  assert.deepEqual(parseSlip({ kind: 'slip', amount: 999 }), {});
});

test('the slip reply thanks and never mentions the amount or claims the money arrived', () => {
  const t = JSON.stringify(slipReply(shop));
  assert.ok(t.includes('ขอบคุณค่ะ') && t.includes('ตรวจสอบยอดเงินเข้า'));
  assert.ok(!t.includes('บาท') && !t.includes('ได้รับเงินแล้ว'));
});

test('readSlip: slip → {}, null for non-slips, wrong types, big files and errors', async () => {
  assert.deepEqual(await readSlip(png, 'image/png', { extract: async () => ({ kind: 'slip' }) }), {});
  assert.equal(await readSlip(png, 'image/png', { extract: async () => ({ kind: 'other' }) }), null);
  assert.equal(await readSlip(png, 'image/gif', { extract: async () => ({ kind: 'slip' }) }), null);
  assert.equal(await readSlip(Buffer.alloc(MAX_BYTES + 1), 'image/png', { extract: async () => ({ kind: 'slip' }) }), null);
  assert.equal(await readSlip(png, 'image/png', { extract: async () => { throw new Error('boom'); } }), null);
  assert.equal(await readSlip(png, 'image/png', { env: {} }), null);
});

test('free mode wording: thanks for the picture, without calling it a slip', () => {
  const t = JSON.stringify(slipReply(shop, { sure: false }));
  assert.ok(t.includes('ได้รับรูปแล้ว') && !t.includes('สลิป'));
});

test('the free Gemini reader is used when its key is set', async () => {
  const { readerOn } = await import('../src/slip.js');
  assert.equal(readerOn({}), false);
  assert.equal(readerOn({ GEMINI_API_KEY: 'k' }), true);
  let url = '';
  const fetchImpl = async (u, o) => {
    url = u;
    assert.equal(o.headers['x-goog-api-key'], 'k');
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"kind":"slip"}' }] } }] }) };
  };
  assert.deepEqual(await readSlip(png, 'image/png', { env: { GEMINI_API_KEY: 'k' }, fetchImpl }), {});
  assert.ok(url.includes('generativelanguage.googleapis.com'));
});
