import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNaturalJob, extractGrandTotal } from '../src/utils/nlParser.js';
import { makeDraft } from '../src/utils/jobDraft.js';

// The bot works out 4,887.97 and the shop charges 4,900. Before this, the only
// way to say so was to save the job and then edit it in the web form.

const NOTE = `ผอ กิ้ก โรงเรียนบ้านนาบง
ไวนิลพระเทพ 150*300ซม ตรม. ละ 165
สแตนตี้ 2 ตัว ตัวละ 1,200`;
// 742.50 + 2,400
const SUM = 3142.5;

test('a line that is only a total sets the price, and is not an item', () => {
  for (const line of ['รวม 3,200', 'ยอดรวม 3200', 'ราคารวม 3,200 บาท', 'เหมา 3200', 'เหมาทั้งหมด 3200',
                      'คิด 3,200', 'สรุป 3200', 'ทั้งหมด 3200', 'ปัดเป็น 3,200', 'ปัดเศษเป็น 3200',
                      'รวมเป็น 3200', 'รวม = 3,200', 'รวม ฿3200']) {
    const d = parseNaturalJob(`${NOTE}\n${line}`);
    assert.equal(d.items.length, 2, `"${line}" was counted as an item`);
    assert.equal(d.total, 3200, `"${line}" did not set the total`);
    assert.equal(d.subtotal, SUM, `"${line}" moved the line totals`);
    assert.equal(d.discount, 3142.5 - 3200, 'subtotal − discount must still be the total');
  }
});

test('rounding down and rounding up both work', () => {
  const down = parseNaturalJob(`${NOTE}\nรวม 3,100`);
  assert.equal(down.total, 3100);
  assert.equal(down.discount, 42.5, 'the shop knocked 42.50 off');

  const up = parseNaturalJob(`${NOTE}\nรวม 3,200`);
  assert.equal(up.total, 3200);
  assert.equal(up.discount, -57.5, 'and here charged 57.50 more than the lines');

  // subtotal − discount = total, whichever way it went.
  for (const d of [down, up]) assert.equal(Math.round((d.subtotal - d.discount) * 100) / 100, d.total);
});

test('the shop is told what was adjusted, because nothing renders a discount', () => {
  const d = parseNaturalJob(`${NOTE}\nรวม 3,200`);
  const draft = makeDraft({ jobName: 'x', jobDate: '2026-09-11', items: d.items, subtotal: d.subtotal, discount: d.discount, total: d.total });
  assert.equal(draft.total, 3200);
  assert.match(draft.note, /เพิ่มจาก 3142\.5 เป็น 3200 \(\+57\.5\)/);

  const off = parseNaturalJob(`${NOTE}\nรวม 3,100`);
  const draft2 = makeDraft({ jobName: 'x', jobDate: '2026-09-11', items: off.items, subtotal: off.subtotal, discount: off.discount, total: off.total });
  assert.match(draft2.note, /ลดจาก 3142\.5 เป็น 3100 \(-42\.5\)/);

  // No adjustment, no line about one.
  const plain = parseNaturalJob(NOTE);
  const draft3 = makeDraft({ jobName: 'x', jobDate: '2026-09-11', items: plain.items, subtotal: plain.subtotal, discount: plain.discount, total: plain.total });
  assert.ok(!/ลดจาก|เพิ่มจาก/.test(draft3.note || ''), 'said something was adjusted when nothing was');
});

test('an item line is never mistaken for a total', () => {
  // Every one of these has more on the line than a keyword and a number.
  for (const line of [
    'ไวนิลรวมมิตร 100*200ซม ตรมละ 165',
    'ป้ายรวมญาติ 2 ผืน ผืนละ 300',
    'สติกเกอร์ 5 แผ่น แผ่นละ 20',
  ]) {
    assert.equal(extractGrandTotal(line).total, null, `"${line}" was read as a total`);
  }

  const d = parseNaturalJob(`${NOTE}\nไวนิลรวมมิตร 100*200ซม ตรมละ 165`);
  assert.equal(d.items.length, 3, 'a real item went missing');
  assert.equal(d.total, d.subtotal, 'nothing was overridden');
});

test('the last total wins, for a shop that changes its mind', () => {
  const d = parseNaturalJob(`${NOTE}\nรวม 3,200\nรวม 3,150`);
  assert.equal(d.total, 3150);
  assert.equal(d.items.length, 2, 'neither total became an item');
});

test('a total of nothing is ignored', () => {
  assert.equal(extractGrandTotal('รวม 0').total, null);
  assert.equal(parseNaturalJob(`${NOTE}\nรวม 0`).total, SUM);
});
