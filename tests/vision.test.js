import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSlip, readSlip, READABLE_TYPES } from '../src/services/visionService.js';
import { slipReceiptFlex } from '../src/flex/slipFlex.js';
import { todayISO, addDays } from '../src/utils/dates.js';

test('normalizeSlip: keeps line items only when they add up to the slip total', () => {
  const exact = normalizeSlip({
    merchantName: 'ร้านข้าวกะเพรา',
    date: '2026-09-07',
    total: 50,
    items: [{ item_name: 'กะเพราหมู', quantity: 1, unit_price: 50 }],
  });
  assert.equal(exact.items.length, 1);
  assert.equal(exact.items[0].item_name, 'กะเพราหมู');
  assert.equal(exact.total, 50);

  // Items that disagree with the printed total are replaced by one line, so
  // the card can never show money the slip does not.
  const mismatch = normalizeSlip({
    merchantName: 'ร้านข้าวกะเพรา',
    total: 50,
    items: [{ item_name: 'กะเพราหมู', quantity: 1, unit_price: 45 }],
  });
  assert.equal(mismatch.items.length, 1);
  assert.equal(mismatch.items[0].total, 50);
  assert.equal(mismatch.subtotal, 50);
});

test('normalizeSlip: rejects a slip with no usable total', () => {
  assert.equal(normalizeSlip(null), null);
  assert.equal(normalizeSlip({ total: 0 }), null);
  assert.equal(normalizeSlip({ total: -5 }), null);
  assert.equal(normalizeSlip({ total: 'ห้าสิบ' }), null);
});

test('normalizeSlip: a missing or future date falls back to today', () => {
  assert.equal(normalizeSlip({ total: 10 }).date, null);
  assert.equal(normalizeSlip({ total: 10, date: '7/9/2026' }).date, null);
  assert.equal(normalizeSlip({ total: 10, date: '2026-09-07' }).date, '2026-09-07');
  assert.equal(normalizeSlip({ total: 10, date: addDays(todayISO(), 5) }).date, todayISO());
});

test('readSlip: only images, and any failure returns null instead of throwing', async () => {
  const buf = Buffer.from('x');
  const ok = { visionExtract: async () => ({ merchantName: 'ร้าน', total: 60 }) };

  assert.deepEqual(READABLE_TYPES, ['image/jpeg', 'image/png']);
  assert.equal((await readSlip(buf, 'image/png', ok)).total, 60);
  assert.equal(await readSlip(buf, 'application/pdf', ok), null); // not an image

  assert.equal(await readSlip(buf, 'image/png', { visionExtract: async () => null }), null);
  assert.equal(await readSlip(buf, 'image/png', { visionExtract: async () => ({ total: 0 }) }), null);
  assert.equal(
    await readSlip(buf, 'image/png', {
      visionExtract: async () => {
        throw new Error('no key');
      },
    }),
    null
  );
});

test('slip card: shows the fields the mockup names, and the job actions', () => {
  const job = {
    id: 'job-1',
    job_name: 'สลิป ร้านข้าวกะเพรา',
    customer_name: 'ร้านข้าวกะเพรา',
    job_date: '2026-09-07',
    total: 50,
    category: 'food',
    category_type: 'food',
    items: [],
  };
  const json = JSON.stringify(slipReceiptFlex(job));
  assert.ok(json.includes('บันทึกจากหลักฐานสำเร็จ'));
  assert.ok(json.includes('ร้านข้าวกะเพรา'));
  assert.ok(json.includes('ยอดชำระ'));
  assert.ok(json.includes('อาหาร'));
  assert.ok(json.includes('สลิป / ใบเสร็จ'));
  assert.ok(json.includes('action=edit_job&jobId=job-1'));
  assert.ok(json.includes('action=delete_job&jobId=job-1'));

  // When storage failed the card says so instead of claiming a file is there.
  assert.ok(JSON.stringify(slipReceiptFlex(job, { attached: false })).includes('ยังไม่ได้แนบ'));
});
