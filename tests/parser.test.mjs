import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeThaiDigits, parseTransactions } from '../src/lib/parser.mjs';

test('แปลงเลขไทย', () => {
  assert.equal(normalizeThaiDigits('กาแฟ ๕๐ บาท'), 'กาแฟ 50 บาท');
});

test('กาแฟ 50 ถูกจัดเป็นรายจ่ายอาหาร', () => {
  const result = parseTransactions('กาแฟ 50');
  assert.deepEqual(result.issues, []);
  assert.equal(result.entries[0].type, 'expense');
  assert.equal(result.entries[0].category, 'อาหาร');
  assert.equal(result.entries[0].amount, 50);
});

test('ขายรูป 120 ถูกจัดเป็นรายรับงานรูป', () => {
  const result = parseTransactions('ขายรูปติดบัตร 120 พร้อมเพย์');
  assert.deepEqual(result.issues, []);
  assert.equal(result.entries[0].type, 'income');
  assert.equal(result.entries[0].category, 'งานรูป');
  assert.equal(result.entries[0].paymentMethod, 'พร้อมเพย์');
  assert.equal(result.entries[0].amount, 120);
});

test('หลายรายการและขนาดไม่ถูกอ่านเป็นราคา', () => {
  const result = parseTransactions('งานวันนี้ ป้ายไวนิล 60*100 150 บาท โฟมบอร์ด 40*60 250 บาท');
  assert.deepEqual(result.issues, []);
  assert.equal(result.entries.length, 2);
  assert.deepEqual(result.entries.map((item) => item.amount), [150, 250]);
  assert.match(result.entries[0].description, /60\*100/);
  assert.match(result.entries[1].description, /40\*60/);
  assert.equal(result.entries[0].type, 'income');
});

test('ข้อความไม่มีราคาไม่ถูกบันทึก', () => {
  const result = parseTransactions('ซื้อกระดาษ');
  assert.equal(result.entries.length, 0);
  assert.match(result.issues[0], /ไม่พบจำนวนเงิน/);
});
