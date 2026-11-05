import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeJobSheet,
  readImage,
  READABLE_TYPES,
} from '../src/services/visionService.js';
import { readFileSync } from 'node:fs';
import { makeDraft, priceDraft, parseBarePrice } from '../src/utils/jobDraft.js';


/* ร้านสั่ง "เอาบอทอ่านออก ฉันจะย้าย การจ่ายเงินอ่านรูปภาพ ไปไว้บอทร้าน
 * เครื่องเขียน" — ม่วงจดเลิกอ่านสลิปเป็นงาน/เงินแล้วทั้งตัว เหลือหน้าที่เดียว
 * คือรู้ว่า "นี่คือสลิป" เพื่อบอกร้านตรง ๆ และแนบรูปเป็นหลักฐานตามปกติ
 * ส่วนการอ่านใบสั่งงาน (job sheet) ยังอยู่ครบเหมือนเดิม
 * (เส้นอ่านสลิปตัวเดิมอยู่ในประวัติ git เผื่อบอทร้านเครื่องเขียนยกไปใช้)
 */
test('readImage: สลิปไม่ถูกอ่านเป็นงาน/เงินอีกแล้ว — แค่บอกชนิดไว้ให้แนบเป็นหลักฐาน', async () => {
  const buf = Buffer.from('x');
  const seeing = (raw) => ({ visionExtract: async () => raw });

  // สลิปชัด ๆ → ไม่สร้างอะไรจากรูป และ diag บอกว่าเป็นสลิป (คนตอบจะได้พูดถูก)
  const diag = {};
  assert.equal(
    await readImage(buf, 'image/png', { ...seeing({ kind: 'slip', merchantName: 'ร้าน', total: 60 }), diag }),
    null
  );
  assert.equal(diag.reason, 'slip');

  // คำตอบแบบเก่าที่ไม่มี kind (เคยถูกเดาเป็นสลิป) → ไม่ใช่งาน ไม่บันทึกอะไรทั้งนั้น
  assert.equal(await readImage(buf, 'image/png', seeing({ merchantName: 'ร้าน', total: 60 })), null);

  // และตัวโค้ดต้องไม่เหลือเส้นสร้างงานจากสลิปอยู่เลย
  const handler = readFileSync(new URL('../src/handlers/imageHandler.js', import.meta.url), 'utf8');
  assert.ok(!handler.includes("kind === 'slip'"), 'เส้นสลิปในตัวรับรูปต้องถูกถอดออก');
  assert.ok(!handler.includes('slipReceiptFlex'), 'การ์ดสลิปต้องไม่ถูกใช้แล้ว');
  assert.ok(handler.includes("diag.reason === 'slip'"), 'เจอสลิปต้องบอกร้านตรง ๆ แล้วแนบเป็นหลักฐานแทน');
  const vision = readFileSync(new URL('../src/services/visionService.js', import.meta.url), 'utf8');
  assert.ok(!vision.includes('normalizeSlip'), 'ตัวแปลงสลิปเป็นงานต้องถูกถอดออกทั้งตัว');
});

// A job sheet is a photographed work order: it says what to make, and often
// says nothing at all about money, so it needs its own reading.
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

test('readImage: reads a work order, and leaves a mere photo alone', async () => {
  const buf = Buffer.from('x');
  const seeing = (raw) => ({ visionExtract: async () => raw });

  assert.deepEqual(READABLE_TYPES, ['image/jpeg', 'image/png']);

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

