import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNaturalJob } from '../src/utils/nlParser.js';
import { areaSqm, areaSqmExact } from '../src/utils/area.js';

// The note this shop actually types, word for word, spacing and all. Every
// assertion here is a bug it found the first time it was run.
const NOTE = `ผอ กิ้ก โรงเรียนบ้านนาบง 
ไวนิลพระเทพ 150*300ซม ตรม. ละ 165  
ไวนิลนิทัศกาล 80*180ซม ตรมละ 165 บาท 
ไวนิล เศรษฐกิจพอเพียง 110*422ซม  ตรม. ละ 165
ไวนิล โรงเรียน 122*303ซม ตรม ละ 165
ไวนิล ไข่ไก่อารมดี 100*80ซม ตรม. ละ 165 
สแตนตี้ 2 ตัว ตัวละ 1,200 `;

test("the shop's own note: six items, and the header is not one of them", () => {
  const d = parseNaturalJob(NOTE);

  // The first line has no number in it, so nothing about it can be an item.
  // It used to come back as a ฿0 line called "โรงเรียนบ้านนาบง", printed on
  // the customer's receipt under the customer's own name.
  assert.equal(d.items.length, 6);
  assert.ok(!d.items.some((i) => i.total === 0), 'a free item got in');

  // And the whole line is the customer, not the two words the pattern caught:
  // a receipt made out to "ผอกิ้ก" has lost the half that says which school.
  assert.equal(d.customerName, 'ผอ กิ้ก โรงเรียนบ้านนาบง');
});

test("the shop's own note: every line priced the way the shop would price it", () => {
  const { items } = parseNaturalJob(NOTE);
  const expected = [
    // ชื่อ                       กว้าง×ยาว (ซม.)   ตร.ม.    × 165
    ['ไวนิลพระเทพ', '150 × 300 ซม.', 1, 742.5],
    ['ไวนิลนิทัศกาล', '80 × 180 ซม.', 1, 237.6],
    ['ไวนิล เศรษฐกิจพอเพียง', '110 × 422 ซม.', 1, 765.93],
    ['ไวนิล โรงเรียน', '122 × 303 ซม.', 1, 609.94],
    ['ไวนิล ไข่ไก่อารมดี', '100 × 80 ซม.', 1, 132],
    // "สแตนตี้ 2 ตัว ตัวละ 1,200" — two at 1,200. The name used to keep the
    // word "ตัวละ" on the end of it.
    ['สแตนตี้', null, 2, 2400],
  ];

  assert.deepEqual(
    items.map((i) => [i.item_name, i.size, i.quantity, i.total]),
    expected
  );
});

test('the area is rounded once, at the money, not before it is multiplied', () => {
  // 110 × 422 ซม. is 4.642 ตร.ม. Rounding that to 4.64 first and then
  // multiplying by 165 gives 765.60 — 33 satang short of what the shop
  // charges. Per sign, on every sign.
  const size = { width: 110, height: 422, unit: 'cm' };
  assert.equal(areaSqm(size), 4.64, 'the shop still reads a tidy number');
  assert.equal(Math.round(areaSqmExact(size) * 1000) / 1000, 4.642);

  const [, , , sign] = parseNaturalJob(NOTE).items.map((i) => i.total);
  assert.equal(sign, 609.94, '122 × 303 ซม. × 165');

  const total = parseNaturalJob(NOTE).total;
  assert.equal(total, 4887.97);
  assert.notEqual(total, 4888.2, 'back to rounding the area before the rate');
});

test('a heading that names no customer becomes the job name instead', () => {
  const d = parseNaturalJob('งานกฐินปีนี้\nไวนิล 100*200ซม ตรมละ 165\nสติกเกอร์ 5 แผ่น แผ่นละ 20');
  assert.equal(d.items.length, 2, 'the heading is still not an item');
  assert.equal(d.jobName, 'งานกฐินปีนี้');
  assert.equal(d.customerName, null);
  assert.equal(d.items[1].total, 100, '5 แผ่น × 20');
});

test('only the name is taken from the heading, not what sits in front of it', () => {
  // The customer here is the temple, not "งานงานบุญ" plus the temple.
  const d = parseNaturalJob('งานงานบุญวัดบ้านชี\nไวนิล 100*200ซม ตรมละ 165');
  assert.equal(d.customerName, 'วัดบ้านชี');
  assert.equal(d.items.length, 1);
});

test('a note that is one line, or all numbers, is untouched by any of this', () => {
  const one = parseNaturalJob('ป้ายไวนิล 60x100 150 บาท');
  assert.equal(one.items.length, 1);
  assert.equal(one.jobName, null);

  // Every line priced: nothing is a heading, so nothing is dropped.
  const all = parseNaturalJob('ป้ายไวนิล 60x100 150 บาท\nโฟมบอร์ด 40x60 250 บาท');
  assert.equal(all.items.length, 2);
  assert.equal(all.total, 400);
});

test("the shop's working multiplies out to the money beside it", () => {
  // "4.64 ตร.ม. × 165 = 765.93" does not multiply out, and this line exists to
  // be checked by hand. A tidy area is kept whenever it still comes to the same
  // baht; only where it would not does the longer number appear.
  const workings = parseNaturalJob(NOTE).items.map((i) => i.working).filter(Boolean);
  assert.equal(workings.length, 5, 'สแตนตี้ is not priced by the square metre');

  for (const line of workings) {
    const m = /([\d.]+) ตร\.ม\. × ([\d.]+) = ([\d.]+)/.exec(line);
    assert.ok(m, `unreadable working: ${line}`);
    const [, sqm, rate, total] = m.map(Number);
    assert.equal(Math.round(sqm * rate * 100) / 100, total, `does not multiply out: ${line}`);
  }

  assert.ok(workings[0].includes('4.5 ตร.ม.'), 'a tidy area got written out long for no reason');
  assert.ok(workings[2].includes('4.642 ตร.ม.'));
});
