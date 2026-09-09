import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseAreaPricing, matchSize, matchSqmRate, inferUnit, areaSqm } from '../src/utils/area.js';
import { parseLine, parseJobText } from '../src/utils/parser.js';
import { parseNaturalJob } from '../src/utils/nlParser.js';
import { makeDraft } from '../src/utils/jobDraft.js';

// งานป้ายคิดราคาเป็น "ตารางเมตรละ" — เจ้าของร้านพิมพ์ขนาดกับเรต แล้วบอทคูณให้
//
// เรตเป็นวิธีคิดของร้าน ไม่ใช่ของลูกค้า บรรทัดที่ออกไปจึงเป็นราคาต่อชิ้น
// ส่วนพื้นที่กับเรตไปอยู่ในหมายเหตุ

test('the headline case: รพสตบ้านชี ไวนิล 160*300 ตรมละ 165', () => {
  const d = parseNaturalJob('รพสตบ้านชี ไวนิล ขนาด 160*300 ตรมละ 165 บาท');
  assert.equal(d.customerName, 'รพสตบ้านชี');
  assert.equal(d.items.length, 1);
  const it = d.items[0];
  assert.match(it.item_name, /ไวนิล/);
  assert.equal(it.size, '160 × 300 ซม.', 'ใบเสร็จเห็นแค่กว้างคูณยาว');
  assert.equal(it.quantity, 1, 'จำนวนคือจำนวนชิ้น ไม่ใช่ตารางเมตร');
  assert.equal(it.unit, null, '"ตร.ม." ต้องไม่กลายเป็นหน่วยที่คิดเงิน');
  assert.equal(it.unit_price, 792, 'ราคาต่อชิ้น ไม่ใช่เรตต่อตารางเมตร');
  assert.equal(it.total, 792);
  assert.equal(d.total, 792);
});

test('the rate is the shop\'s working, and it goes to the note, not the bill', () => {
  const d = parseNaturalJob('รพสตบ้านชี ไวนิล ขนาด 160*300 ตรมละ 165 บาท');

  // มันเดินทางมากับรายการ แต่ต้องไม่ไปต่อถึงใบเสร็จ
  assert.match(d.items[0].working, /4\.8 ตร\.ม\. × 165 = 792/);

  const draft = makeDraft({ jobName: 'ไวนิล', items: d.items, subtotal: d.subtotal, total: d.total });
  assert.match(draft.note, /คิดตาม ตร\.ม\..*4\.8 ตร\.ม\. × 165 = 792/);
  assert.equal('working' in draft.items[0], false, 'วิธีคิดต้องถูกยกออกจากรายการแล้ว');
  assert.equal(JSON.stringify(draft.items).includes('165'), false, 'เรตต้องไม่เหลืออยู่ในรายการเลย');

  // หมายเหตุที่ร้านพิมพ์เองต้องไม่หาย
  const withNote = makeDraft({ items: d.items, note: 'ส่งวันศุกร์', total: d.total });
  assert.match(withNote.note, /ส่งวันศุกร์/);
  assert.match(withNote.note, /คิดตาม ตร\.ม\./);

  // งานธรรมดาไม่มีวิธีคิดอะไรให้เก็บ หมายเหตุจึงต้องว่างตามเดิม
  assert.equal(makeDraft({ items: parseJobText('โฟมบอร์ด 40x60 250 บาท').items }).note, undefined);
});

test('the size reads the same whether it was typed in chat or into the form', () => {
  const fromChat = parseLine('ไวนิล 160x300 ตรมละ 165').size;
  const form = readFileSync(new URL('../public/liff/jot/script.js', import.meta.url), 'utf8');

  // ฟอร์มประกอบป้ายขนาดเป็น `${w} × ${h} ${หน่วย}` — ทางแชตต้องออกมาหน้าตาเดียวกัน
  assert.match(form, /\$\{numText\(width\)\} × \$\{numText\(height\)\} \$\{UNIT_LABELS\[unit\]\}/);
  assert.equal(fromChat, '160 × 300 ซม.');
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
    assert.equal(item.unit_price, 792, text);
  }
});

test('an explicit unit always wins over the guess', () => {
  // พื้นที่ยังคิดถูกเหมือนเดิม ดูจากยอด เพราะจำนวนเป็นจำนวนชิ้นไปแล้ว
  assert.equal(parseLine('ไวนิล 1.6x3 ม. ตรมละ 165').total, 792);
  assert.equal(parseLine('ไวนิล 160x300 ซม. ตรมละ 165').total, 792);
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
  assert.equal(item.quantity, 2, 'สองผืน ไม่ใช่ 9.6 ตร.ม.');
  assert.equal(item.unit_price, 792, 'ราคาต่อผืน');
  assert.equal(item.total, 1584);
  assert.match(item.working, /ต่อชิ้น × 2 ชิ้น/);
});

test('an area given straight out needs no size', () => {
  const item = parseLine('ไวนิล 4.8 ตร.ม. ตรมละ 165');
  assert.equal(item.quantity, 1);
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
