import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNaturalJob } from '../src/utils/nlParser.js';
import { extractJobDraft, normalizeExtraction } from '../src/services/nlpService.js';
import { derivePaymentFields } from '../src/utils/payment.js';

const EXAMPLE = 'วันนี้ทำป้ายร้านพี่นก 2 ป้าย ป้ายละ 350 รับมาแล้ว 300';

test('rule parser understands the headline example', () => {
  const d = parseNaturalJob(EXAMPLE);
  assert.equal(d.customerName, 'พี่นก');
  assert.equal(d.items.length, 1);
  assert.equal(d.items[0].quantity, 2);
  assert.equal(d.items[0].unit_price, 350);
  assert.equal(d.items[0].total, 700);
  assert.equal(d.total, 700);
  assert.equal(d.paidAmount, 300);

  // Derived payment state: partial, 400 outstanding
  const pay = derivePaymentFields(d.total, d.paidAmount);
  assert.equal(pay.payment_status, 'partial');
  assert.equal(pay.balance_due, 400);
});

test('rule parser: deposit keyword + no customer', () => {
  const d = parseNaturalJob('ทำสติกเกอร์ 10 ชิ้น ชิ้นละ 20 มัดจำ 100');
  assert.equal(d.items[0].quantity, 10);
  assert.equal(d.items[0].unit_price, 20);
  assert.equal(d.total, 200);
  assert.equal(d.paidAmount, 100);
});

test('rule parser: multi-line list still works, with shared customer/paid', () => {
  const d = parseNaturalJob('ลูกค้าพี่ต่าย\nป้ายไวนิล 60x100 150 บาท\nโฟมบอร์ด 40x60 250 บาท\nรับมาแล้ว 200');
  assert.equal(d.items.length, 2);
  assert.equal(d.total, 400);
  assert.equal(d.paidAmount, 200);
  assert.equal(d.customerName, 'พี่ต่าย');
});

test('extractJobDraft uses the AI layer when it returns valid data', async () => {
  const llmExtract = async () => ({
    customerName: 'พี่นก',
    items: [{ item_name: 'ป้าย', size: null, quantity: 2, unit: 'ป้าย', unit_price: 350 }],
    paidAmount: 300,
  });
  const d = await extractJobDraft('anything', { llmExtract });
  assert.equal(d.customerName, 'พี่นก');
  assert.equal(d.items[0].total, 700);
  assert.equal(d.total, 700);
  assert.equal(d.paidAmount, 300);
});

test('extractJobDraft falls back to rules when the AI layer throws', async () => {
  const llmExtract = async () => {
    throw new Error('network down');
  };
  const d = await extractJobDraft(EXAMPLE, { llmExtract });
  assert.equal(d.customerName, 'พี่นก'); // rule-based result
  assert.equal(d.total, 700);
});

test('extractJobDraft falls back when the AI layer returns invalid data', async () => {
  const llmExtract = async () => ({ items: [{ item_name: 'x', quantity: 0, unit_price: 5 }] });
  const d = await extractJobDraft('ค่าออกแบบ 500', { llmExtract });
  assert.equal(d.items.length, 1);
  assert.equal(d.total, 500); // came from the rule parser
});

test('normalizeExtraction rejects non-positive quantity / negative price', () => {
  assert.equal(normalizeExtraction({ items: [{ item_name: 'a', quantity: 0, unit_price: 10 }] }), null);
  assert.equal(normalizeExtraction({ items: [{ item_name: 'a', quantity: 1, unit_price: -1 }] }), null);
  const ok = normalizeExtraction({ items: [{ item_name: 'a', quantity: 2, unit_price: 10 }], paidAmount: 5 });
  assert.equal(ok.total, 20);
  assert.equal(ok.paidAmount, 5);
});


test('the names a village shop actually uses', () => {
  // A customer here is as often a headman or a teacher as a "พี่".
  const cases = [
    ['ผู้ใหญ่สมศรี สั่งป้ายไวนิลหน้างานสีดำ', 'ผู้ใหญ่สมศรี'],
    ['กำนันแดง ป้ายไวนิล 2 ป้าย ป้ายละ 500', 'กำนันแดง'],
    ['ครูนก สติกเกอร์ 200', 'ครูนก'],
    ['ผอ.สมชาย ป้าย 400', 'ผอ.สมชาย'],
    ['ป้าแดง ป้ายไวนิล 300', 'ป้าแดง'],
    ['หมอเก่ง ป้าย 500', 'หมอเก่ง'],
  ];
  for (const [text, name] of cases) {
    assert.equal(parseNaturalJob(text).customerName, name, text);
  }

  // The trap: "ป้า" is the first two letters of "ป้าย", and nearly every job
  // here is a ป้าย. A sign must never be read as a customer.
  for (const text of ['ป้ายไวนิล 60x100 150 บาท', 'ป้ายหน้าร้าน 300', 'ป้ายไวนิล 160x300 ตรมละ 165']) {
    assert.equal(parseNaturalJob(text).customerName, null, text);
    assert.match(parseNaturalJob(text).items[0].item_name, /ป้าย/, text);
  }
});

test('a job with no price still becomes a draft to price later', () => {
  // "ผู้ใหญ่สมศรี สั่งป้ายไวนิลหน้างานสีดำ" names work but no money. That is a
  // real message, and it has to reach a preview rather than being rejected.
  const d = parseNaturalJob('ผู้ใหญ่สมศรี สั่งป้ายไวนิลหน้างานสีดำ');
  assert.equal(d.items.length, 1, 'nothing to show');
  assert.equal(d.total, 0);
  assert.match(d.items[0].item_name, /ไวนิล/);
});
