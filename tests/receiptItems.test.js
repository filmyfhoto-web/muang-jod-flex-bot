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

test('one item is the job itself, so it is not printed twice', () => {
  assert.deepEqual(receiptItemLines({ items: [items[0]] }), []);
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
