import { test } from 'node:test';
import assert from 'node:assert/strict';
import { receiptItemLines, renderReceiptHtml } from '../src/routes/receipt.js';

// A shop takes three things from one customer in one visit and enters them as
// three items on one job. The receipt used to print that as the job's name and
// one amount — nothing the customer could check against what they collected.

const items = [
  { item_name: 'ป้ายไวนิล', size: '160 × 300 ซม.', quantity: 2, unit: 'ผืน', total: 1000 },
  { item_name: 'สติกเกอร์', size: '60 × 40 ซม.', quantity: 4, unit: 'แผ่น', total: 600 },
  { item_name: 'ค่าตอกตาไก่', quantity: 1, unit: null, total: 250 },
];

test('a job entered as several items prints each of them', () => {
  const lines = receiptItemLines({ items });
  assert.equal(lines.length, 3);

  assert.equal(lines[0].text, 'ป้ายไวนิล · 160 × 300 ซม. × 2 ผืน');
  assert.equal(lines[0].amount, '฿1,000');

  // No size, one of them: neither a dimension nor a count to print.
  assert.equal(lines[2].text, 'ค่าตอกตาไก่');
  assert.equal(lines[2].amount, '฿250');
});

/* รายการเดียวพิมพ์เมื่อมันบอกอะไรที่แถวของงานไม่ได้บอก
 *
 * ของเดิมข้ามงานที่มีรายการเดียวทั้งใบ ด้วยเหตุผลว่ารายการเดียว "คือ" ตัวงาน
 * พิมพ์อีกรอบก็ได้บรรทัดที่พูดซ้ำ — ซึ่งจริงเฉพาะ "ชื่อ"
 *
 * ร้านบอกว่า "พิมพ์รายละเอียดงานก็ไม่ขึ้นในใบเสร็จนะ" ถูกต้อง: ขนาด รายละเอียด
 * และจำนวน ไม่เคยอยู่บนแถวของงาน งานหนึ่งรายการจึงพิมพ์ออกมาเหลือแค่ชื่อกับ
 * วันที่ ทั้งที่ร้านพิมพ์ "ตอกตาไก่ 4 มุม" ไว้ให้ลูกค้าอ่าน
 */
test('รายการเดียวที่มีขนาด/รายละเอียด ต้องขึ้นใบเสร็จ', () => {
  const lines = receiptItemLines({ job_name: 'ป้ายไวนิล', items: [items[0]] });
  assert.equal(lines.length, 1);
  // ชื่อซ้ำกับชื่องานถูกตัดออก เหลือแต่ของที่แถวบนไม่ได้บอก
  assert.equal(lines[0].text, '160 × 300 ซม. × 2 ผืน');
  // ยอดเท่ากับยอดของงานที่อยู่ข้าง ๆ พิมพ์ซ้ำก็ไม่ได้บอกอะไรเพิ่ม
  assert.equal(lines[0].amount, '');

  // ชื่อรายการต่างจากชื่องาน ก็ยังพิมพ์ชื่อ
  const other = receiptItemLines({ job_name: 'งานโรงเรียน', items: [items[0]] });
  assert.equal(other[0].text, 'ป้ายไวนิล · 160 × 300 ซม. × 2 ผืน');

  // รายละเอียดที่ร้านพิมพ์เอง (ไม่มีขนาด) ก็ต้องขึ้น
  const detail = receiptItemLines({
    job_name: 'ป้ายหน้าร้าน',
    items: [{ item_name: 'ป้ายหน้าร้าน', size: 'ตอกตาไก่ 4 มุม เคลือบด้าน', quantity: 1, total: 900 }],
  });
  assert.equal(detail[0].text, 'ตอกตาไก่ 4 มุม เคลือบด้าน');
});

test('รายการเดียวที่ไม่มีอะไรนอกจากชื่อซ้ำ ยังข้ามตามเดิม', () => {
  // ชื่อเดียวกับงาน ไม่มีขนาด ไม่มีจำนวน — พิมพ์ไปก็ได้บรรทัดที่พูดซ้ำเปล่า ๆ
  assert.deepEqual(
    receiptItemLines({ job_name: 'ค่าตอกตาไก่', items: [{ item_name: 'ค่าตอกตาไก่', quantity: 1, total: 250 }] }),
    []
  );
  assert.deepEqual(receiptItemLines({ items: [] }), []);
  assert.deepEqual(receiptItemLines({}), [], 'a job loaded without its items must not throw');
});

test('the printed receipt carries the lines and still adds up to the job total', () => {
  const html = renderReceiptHtml({
    bill_number: 'MJ-B-20260910-0001',
    customer_name: 'ผู้ใหญ่สมศรี',
    payment_status: 'paid',
    total: 1850,
    paid_amount: 1850,
    balance_due: 0,
    jobs: [{ id: 'j1', job_name: 'งานป้ายงานบุญ', job_date: '2026-09-10', total: 1850, items }],
  });

  for (const line of receiptItemLines({ items })) {
    assert.ok(html.includes(line.text), `the receipt does not show "${line.text}"`);
  }
  // The job's own total stays the amount of record; the lines sit under it.
  assert.ok(html.includes('฿1,850'));
  assert.equal(
    items.reduce((s, i) => s + i.total, 0),
    1850,
    'the fixture stopped adding up, so this test would pass on a broken receipt'
  );
});

test('saving the receipt image does not depend on a download LINE will not do', () => {
  const html = renderReceiptHtml({
    bill_number: 'MJ-B-20260911-0001',
    payment_status: 'pending',
    total: 930,
    paid_amount: 0,
    balance_due: 930,
    jobs: [{ id: 'j1', job_name: 'งานป้าย', job_date: '2026-09-11', total: 930, items: [] }],
  });

  // LINE's in-app browser reads a download from a data: URL as launching an
  // external app: the shop gets an อนุญาต / ไม่อนุญาต prompt and no file
  // either way. The share sheet is the route that exists on a phone, and it
  // offers saving and sending to a LINE chat in the same step.
  assert.ok(html.includes('id="shot-share"'), 'no share button');
  assert.ok(html.includes('navigator.canShare'), 'nothing checks for the share sheet');
  assert.ok(html.includes('navigator.share('), 'the share sheet is never opened');
  assert.ok(html.includes("files: [file]"), 'the image itself is not what gets shared');

  // A cancelled share is a choice, not a failure to report.
  assert.ok(html.includes("'AbortError'"), 'cancelling the share reads as an error');

  // The download stays as the fallback that works on desktop and Android,
  // and is out of the way until it is needed.
  assert.ok(/id="shot-dl" hidden/.test(html), 'the download button is still the primary');
  assert.ok(html.includes('dl.click()'), 'nothing falls back to the download');
  assert.ok(html.includes('แตะรูปค้างไว้'), 'the last-resort instruction is gone');
});
