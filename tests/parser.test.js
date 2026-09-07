import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLine, parseJobText } from '../src/utils/parser.js';

test('parseLine extracts name, size, and price', () => {
  const item = parseLine('ป้ายไวนิล 60x100 150 บาท');
  assert.equal(item.size, '60x100');
  assert.equal(item.unit_price, 150);
  assert.equal(item.quantity, 1);
  assert.equal(item.total, 150);
  assert.match(item.item_name, /ป้ายไวนิล/);
});

test('parseLine handles quantity via xN', () => {
  const item = parseLine('โฟมบอร์ด 40x60 250 บาท x3');
  assert.equal(item.quantity, 3);
  assert.equal(item.unit_price, 250);
  assert.equal(item.total, 750);
});

test('parseLine handles quantity via unit word', () => {
  const item = parseLine('สติกเกอร์ 20 บาท 5 ชิ้น');
  assert.equal(item.quantity, 5);
  assert.equal(item.unit_price, 20);
  assert.equal(item.total, 100);
});

test('parseLine falls back to last number as price', () => {
  const item = parseLine('ค่าออกแบบ 500');
  assert.equal(item.unit_price, 500);
  assert.equal(item.total, 500);
});

test('parseJobText sums multiple lines', () => {
  const parsed = parseJobText('ป้ายไวนิล 60x100 150 บาท\nโฟมบอร์ด 40x60 250 บาท');
  assert.equal(parsed.items.length, 2);
  assert.equal(parsed.subtotal, 400);
  assert.equal(parsed.total, 400);
});

test('parseJobText ignores blank lines and returns empty for no input', () => {
  const parsed = parseJobText('\n\n');
  assert.equal(parsed.items.length, 0);
  assert.equal(parsed.total, 0);
});
