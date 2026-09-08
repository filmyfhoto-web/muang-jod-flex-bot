import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAreaPricing, matchSize, matchSqmRate, inferUnit, areaSqm } from '../src/utils/area.js';
import { parseLine, parseJobText } from '../src/utils/parser.js';
import { parseNaturalJob } from '../src/utils/nlParser.js';

// งานป้ายคิดราคาเป็น "ตารางเมตรละ" — เจ้าของร้านพิมพ์ขนาดกับเรต แล้วบอทคูณให้

test('the headline case: รพสตบ้านชี ไวนิล 160*300 ตรมละ 165', () => {
  const d = parseNaturalJob('รพสตบ้านชี ไวนิล ขนาด 160*300 ตรมละ 165 บาท');
  assert.equal(d.customerName, 'รพสตบ้านชี');
  assert.equal(d.items.length, 1);
  const it = d.items[0];
  assert.match(it.item_name, /ไวนิล/);
  assert.equal(it.size, '160x300 ซม.');
  assert.equal(it.quantity, 4.8, '160×300 ซม. = 4.8 ตร.ม.');
  assert.equal(it.unit, 'ตร.ม.');
  assert.equal(it.unit_price, 165);
  assert.equal(it.total, 792);
  assert.equal(d.total, 792);
});

test('every way of writing the rate lands on the same price', () => {
  const forms = [
    'ไวนิล 160x300 ตรมละ 165',
    'ไวนิล 160x300 ตร.ม.ละ 165',
    'ไวนิล 160x300 ตารางเมตรละ 165 บาท',
    'ไวนิล 160x300 165 บาท/ตร.ม.',
    'ไวนิล 160x300 165 ต่อตารางเมตร',
    'ไวนิล 160×300 ราคาตารางเมตรละ 165',
  ];
  for (const text of forms) {
    const item = parseLine(text);
    assert.equal(item.total, 792, `${text}: ได้ ${item.total}`);
    assert.equal(item.unit_price, 165, text);
  }
});

test('an explicit unit always wins over the guess', () => {
  assert.equal(parseLine('ไวนิล 1.6x3 ม. ตรมละ 165').quantity, 4.8);
  assert.equal(parseLine('ไวนิล 160x300 ซม. ตรมละ 165').quantity, 4.8);
  assert.equal(parseLine('ไวนิล 1.6 ม. x 3 ม. ตรมละ 165').total, 792);
  assert.equal(parseLine('ป้าย กว้าง 1.6 ยาว 3 ม. ตรมละ 165').total, 792);
});

test('no unit typed: two-digit numbers and up are centimetres, small ones metres', () => {
  assert.equal(inferUnit(160, 300), 'cm');
  assert.equal(inferUnit(60, 100), 'cm');
  assert.equal(inferUnit(1.6, 3), 'm');
  assert.equal(inferUnit(2, 3), 'm');
  assert.equal(areaSqm({ width: 160, height: 300, unit: 'cm' }), 4.8);
  assert.equal(areaSqm({ width: 4, height: 8, unit: 'ft' }), 2.97);
});

test('a piece count multiplies the area', () => {
  const item = parseLine('ไวนิล 160x300 2 ผืน ตรมละ 165');
  assert.equal(item.quantity, 9.6);
  assert.equal(item.total, 1584);
});

test('an area given straight out needs no size', () => {
  const item = parseLine('ไวนิล 4.8 ตร.ม. ตรมละ 165');
  assert.equal(item.quantity, 4.8);
  assert.equal(item.total, 792);
  assert.equal(item.size, null);
});

test('the rate number is never mistaken for a dimension', () => {
  const area = parseAreaPricing('ไวนิล 160*300 ตรมละ 165');
  assert.equal(area.rate, 165);
  assert.equal(area.sqm, 4.8);
  assert.equal(area.inferred, true, 'หน่วยมาจากการเดา');
  assert.match(area.rest, /ไวนิล/);
  assert.doesNotMatch(area.rest, /165|160|300/);
});

test('mixed lines: one priced by area, one by the piece', () => {
  const parsed = parseJobText('ไวนิล 160x300 ตรมละ 165\nโฟมบอร์ด 40x60 250 บาท');
  assert.equal(parsed.items.length, 2);
  assert.equal(parsed.items[0].total, 792);
  assert.equal(parsed.items[1].total, 250);
  assert.equal(parsed.total, 1042);
});

test('a deposit still comes off an area-priced job', () => {
  const d = parseNaturalJob('ไวนิล 160x300 ตรมละ 165 มัดจำ 300');
  assert.equal(d.total, 792);
  assert.equal(d.paidAmount, 300);
});

test('nothing about ordinary lines changes', () => {
  assert.equal(matchSqmRate('ป้ายไวนิล 60x100 150 บาท'), null);
  assert.equal(parseLine('ป้ายไวนิล 60x100 150 บาท').total, 150);
  assert.equal(parseNaturalJob('ทำสติกเกอร์ 10 ชิ้น ชิ้นละ 20').total, 200);
  // "300 มัดจำ" must not read as 300 metres
  const size = matchSize('ไวนิล 160x300 มัดจำ 500');
  assert.equal(size.unit, null);
});

test('organisation customers, without an honorific', () => {
  assert.equal(parseNaturalJob('โรงเรียนบ้านหนอง ไวนิล 160x300 ตรมละ 165').customerName, 'โรงเรียนบ้านหนอง');
  assert.equal(parseNaturalJob('อบต.นาดี ไวนิล 160x300 ตรมละ 165').customerName, 'อบต.นาดี');
  // an honorific still wins, so "ร้านพี่นก" stays "พี่นก"
  assert.equal(parseNaturalJob('วันนี้ทำป้ายร้านพี่นก 2 ป้าย ป้ายละ 350').customerName, 'พี่นก');
  // and a stop word is not a name
  assert.equal(parseNaturalJob('ป้ายวัดขนาด 60x100 150 บาท').customerName, null);
});
