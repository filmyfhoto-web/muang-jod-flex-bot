import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { quickReplyBlock, defaultItems, QUICK_JOBS } from '../src/flex/quickReply.js';
import { classifyJob, findType } from '../src/utils/category.js';

const jot = readFileSync(new URL('../public/liff/jot/script.js', import.meta.url), 'utf8');

// The shop asked for the bar above the keyboard to be the three jobs they do
// all day, and said "เราไม่เอาออกบิลละ เรากรอกเสร็จออกใบเสร็จเลย".

// The three job links need a LIFF app to open; tests/setup.js deliberately
// configures none, which is the case the last test here covers.
function withLiff(fn) {
  const had = process.env.LIFF_ID;
  process.env.LIFF_ID = '1234567890-AbCdEfGh';
  try {
    return fn();
  } finally {
    if (had === undefined) delete process.env.LIFF_ID;
    else process.env.LIFF_ID = had;
  }
}

test('the bar starts with the three jobs, each opening the form ready to fill', () => {
  const items = withLiff(() => quickReplyBlock().items);
  const first = items.slice(0, QUICK_JOBS.length);

  assert.deepEqual(first.map((i) => i.action.label), ['🖼 งานกรอบรูป', '🪧 งานป้าย', '🧊 งานโฟมบอร์ด']);
  for (const i of first) {
    assert.equal(i.action.type, 'uri', `${i.action.label} still goes through the bot`);
    assert.match(i.action.uri, /\/jot\?quick=1&name=/);
  }
  assert.ok(items.length <= 13, "LINE shows 13 at most");
  for (const i of items) assert.ok(i.action.label.length <= 20, `label too long: ${i.action.label}`);
});

test('the bill step is gone — a job is filled in and receipted', () => {
  const json = withLiff(() => JSON.stringify(quickReplyBlock()));
  assert.ok(!json.includes('create_bill'), 'ออกบิล is still on the bar');
  assert.ok(!json.includes('bill_payment'));
  // The ones worth keeping are still there.
  for (const a of ['add_job', 'today_summary', 'pending_payment', 'recent_jobs', 'help']) {
    assert.ok(json.includes(`action=${a}`), `${a} went missing`);
  }
});

test('a framed job lands in its own category, not in "everything else"', () => {
  // There was no กรอบรูป before, so this shop's own work — "รูปหน้างานพร้อมกรอบ"
  // — fell through to งานทั่วไป.
  assert.ok(findType('frame'), 'no กรอบรูป type');
  for (const name of ['กรอบรูป 8x10', 'รูปหน้างานพร้อมกรอบ', 'ใส่กรอบ A4']) {
    const hit = classifyJob([{ item_name: name }]);
    assert.equal(hit?.type.id, 'frame', `"${name}" was filed as ${hit?.type.label || 'งานทั่วไป'}`);
  }

  // And it must not have eaten the type next to it.
  assert.equal(classifyJob([{ item_name: 'อัดรูป 4x6' }])?.type.id, 'photo');
  assert.equal(classifyJob([{ item_name: 'ป้ายไวนิล 2x3' }])?.type.id, 'vinyl');
  assert.equal(classifyJob([{ item_name: 'โฟมบอร์ด A1' }])?.type.id, 'foamboard');
});

test('the form fills the name in, but never over work already in progress', () => {
  assert.match(jot, /params\.get\('name'\)/, 'nothing reads ?name=');
  // Only into a first row that is still empty: a shop with a half-typed job
  // who taps the bar must not lose it.
  assert.match(jot, /state\.items\.length === 1 && !state\.items\[0\]\.name && !state\.items\[0\]\.total/);
});

test('with no LIFF app the bar keeps working, minus the three links', () => {
  const items = defaultItems();
  assert.ok(items.every((i) => !i.uri), 'a link to nowhere is on the bar');
  assert.ok(items.length >= 5, 'the bar emptied out');
});
