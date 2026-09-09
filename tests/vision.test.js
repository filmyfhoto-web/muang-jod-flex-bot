import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeSlip,
  normalizeJobSheet,
  readImage,
  READABLE_TYPES,
} from '../src/services/visionService.js';
import { slipReceiptFlex } from '../src/flex/slipFlex.js';
import { makeDraft, priceDraft, parseBarePrice } from '../src/utils/jobDraft.js';
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

// A job sheet is a photographed work order: it says what to make, and often
// says nothing at all about money. That is the case the slip rules reject, so
// it needs its own reading.
test('normalizeJobSheet: keeps the lines even when the paper names no price', () => {
  const stamp = normalizeJobSheet({
    kind: 'job',
    merchantName: 'อบต.ทุ่งช้าง',
    jobName: 'ตราประทับบัตรเลือกตั้ง',
    total: 0,
    items: [{ item_name: 'ตราประทับบัตรเลือกตั้ง', size: '3.5x4.0 ซม.', quantity: 1, unit_price: 0 }],
  });
  assert.equal(stamp.kind, 'job');
  assert.equal(stamp.customerName, 'อบต.ทุ่งช้าง');
  assert.equal(stamp.jobName, 'ตราประทับบัตรเลือกตั้ง');
  assert.equal(stamp.items[0].size, '3.5x4.0 ซม.');
  assert.equal(stamp.total, 0, 'a price the paper never gave must not be invented');

  // Priced lines win; a grand total alone is the fallback.
  assert.equal(
    normalizeJobSheet({ kind: 'job', total: 999, items: [{ item_name: 'ป้าย', quantity: 2, unit_price: 150 }] }).total,
    300
  );
  assert.equal(
    normalizeJobSheet({ kind: 'job', total: 500, items: [{ item_name: 'ป้าย', quantity: 1, unit_price: 0 }] }).total,
    500
  );

  // A missing quantity is one of the thing, not zero of it.
  assert.equal(normalizeJobSheet({ kind: 'job', items: [{ item_name: 'ป้าย' }] }).items[0].quantity, 1);
  // Nothing readable on the page is not a job.
  assert.equal(normalizeJobSheet({ kind: 'job', items: [] }), null);
  assert.equal(normalizeJobSheet(null), null);
});

test('readImage: tells a slip from a work order, and a photo from both', async () => {
  const buf = Buffer.from('x');
  const seeing = (raw) => ({ visionExtract: async () => raw });

  assert.deepEqual(READABLE_TYPES, ['image/jpeg', 'image/png']);

  const slip = await readImage(buf, 'image/png', seeing({ merchantName: 'ร้าน', total: 60 }));
  assert.equal(slip.kind, 'slip');
  assert.equal(slip.total, 60);

  const sheet = await readImage(
    buf,
    'image/png',
    seeing({ kind: 'job', jobName: 'ตรายาง', items: [{ item_name: 'ตรายาง', quantity: 1, unit_price: 0 }] })
  );
  assert.equal(sheet.kind, 'job');

  // A picture of the finished work is evidence, not paperwork — even if the
  // model volunteers a number with it.
  assert.equal(await readImage(buf, 'image/png', seeing({ kind: 'other', total: 500, items: [] })), null);

  assert.equal(await readImage(buf, 'application/pdf', seeing({ total: 60 })), null); // not an image
  assert.equal(await readImage(buf, 'image/png', seeing(null)), null);
  assert.equal(await readImage(buf, 'image/png', seeing({ total: 0 })), null);
  assert.equal(
    await readImage(buf, 'image/png', {
      visionExtract: async () => {
        throw new Error('no key');
      },
    }),
    null
  );
});

test('parseBarePrice: a price is a number on its own, a job is a sentence', () => {
  for (const [text, amount] of [
    ['1500', 1500],
    [' 1,500 ', 1500],
    ['฿1500', 1500],
    ['1500 บาท', 1500],
    ['1500.50', 1500.5],
  ]) {
    assert.equal(parseBarePrice(text), amount, `${text} should be a price`);
  }
  // Anything with a description in it is a new job, and must be re-parsed as
  // one — pricing it would silently throw away everything but the number.
  for (const text of ['ป้ายไวนิล 60x100 150 บาท', 'ไวนิล 160x300 ตรมละ 165', '0', '', 'ยกเลิก', 'x2']) {
    assert.equal(parseBarePrice(text), null, `${text} should not be a price`);
  }
});

test('priceDraft: a bare number prices a single-line draft and nothing else', () => {
  const sheet = makeDraft({
    jobName: 'ตราประทับ',
    items: [{ item_name: 'ตราประทับ', size: '3.5x4.0 ซม.', quantity: 4, unit: 'อัน', unit_price: 0, total: 0 }],
  });
  assert.equal(sheet.total, 0);
  assert.equal(sheet.paymentStatus, 'pending');

  const priced = priceDraft(sheet, 1500);
  assert.equal(priced.total, 1500);
  assert.equal(priced.subtotal, 1500);
  assert.equal(priced.items[0].unit_price, 375, 'the number is the line total, split over the quantity');
  assert.equal(priced.items[0].total, 1500);
  assert.equal(priced.items[0].size, '3.5x4.0 ซม.', 'what was read off the paper survives');

  // An area job keeps its rate per square metre.
  const area = makeDraft({
    items: [{ item_name: 'ไวนิล', quantity: 4.8, unit: 'ตร.ม.', unit_price: 0, total: 0 }],
  });
  assert.equal(priceDraft(area, 792).items[0].unit_price, 165);

  assert.equal(priceDraft(sheet, 0), null, 'zero is not a price');
  assert.equal(priceDraft(priced, 2000), null, 'a draft that already has a price is not re-priced');
  assert.equal(
    priceDraft(makeDraft({ items: [{ item_name: 'a', quantity: 1, total: 0 }, { item_name: 'b', quantity: 1, total: 0 }] }), 500),
    null,
    'with two lines there is no telling which one the number is for'
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
