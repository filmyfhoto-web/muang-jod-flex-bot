import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inferUnit } from '../src/utils/area.js';
import { COLORS } from '../src/flex/theme.js';

// The jot form is three static files the browser runs, so nothing here can be
// imported and called. What CAN break silently is the form drifting from the
// server it feeds — the same unit rule, the same colours, the same endpoint.

const read = (p) => readFileSync(new URL(`../public/liff/${p}`, import.meta.url), 'utf8');
const html = read('jot/index.html');
const css = read('jot/style.css');
const js = read('jot/script.js');
const dashboard = read('index.html');

test('the form guesses centimetres at the same size the bot does', () => {
  const threshold = Number(/CM_THRESHOLD = (\d+)/.exec(js)?.[1]);
  assert.ok(threshold > 0, 'CM_THRESHOLD not found in script.js');

  // Below it both parsers must say metres, at it and above, centimetres —
  // otherwise the same "160x300" prices differently in the form and in chat.
  assert.equal(inferUnit(threshold - 1, threshold - 1), 'm');
  assert.equal(inferUnit(threshold, threshold), 'cm');
  assert.equal(inferUnit(threshold, 1), 'cm', 'one big side is enough');
});

test('every field the brief asks for is on the page, with its example text', () => {
  const fields = [
    ['i-name', 'เช่น ป้ายหน้าร้าน'],
    ['i-detail', 'เช่น ป้ายไวนิล 60x100'],
    ['i-price', 'เช่น 150'],
    ['i-qty', 'เช่น 1'],
    ['i-rate', 'เช่น 165'],
    ['i-total', 'ระบบจะคำนวณให้อัตโนมัติ'],
  ];
  for (const [cls, placeholder] of fields) {
    assert.ok(html.includes(`class="${cls}"`), `missing field .${cls}`);
    assert.ok(html.includes(placeholder), `missing placeholder for .${cls}: ${placeholder}`);
  }
  assert.ok(html.includes('type="file"') && html.includes('แตะเพื่อแนบรูป'), 'no image field');

  // The two cards the brief describes, and the buttons on them.
  for (const label of ['ตรวจสอบก่อนบันทึก', 'บันทึกงาน', 'แก้ไข', 'ยกเลิก', 'เพิ่มรายการ']) {
    assert.ok(html.includes(label), `missing button/heading: ${label}`);
  }
});

test('inputs are 16px or more, so iOS does not zoom the page on focus', () => {
  const size = /input\[type='text'\][\s\S]*?font-size:\s*(\d+)px/.exec(css);
  assert.ok(size, 'no font-size on the inputs');
  assert.ok(Number(size[1]) >= 16, `inputs are ${size[1]}px`);
});

test('the page saves through the real API, not into thin air', () => {
  assert.ok(js.includes("fetch('/api/jobs'"), 'nothing posts to /api/jobs');
  assert.ok(js.includes("method: 'POST'"));
  assert.ok(js.includes("Authorization: 'Bearer ' + token"), 'the save is not authenticated');
  assert.ok(js.includes('liff.init'), 'never initialises LIFF');
});

test('both web pages use the same accent as the cards in chat', () => {
  const accentOf = (source) => /--accent:\s*(#[0-9a-f]{6})/i.exec(source)?.[1]?.toLowerCase();
  const accentTextOf = (source) => /--accent-text:\s*(#[0-9a-f]{6})/i.exec(source)?.[1]?.toLowerCase();

  for (const [name, source] of [['jot/style.css', css], ['index.html', dashboard]]) {
    assert.equal(accentOf(source), COLORS.accent.toLowerCase(), `${name}: accent drifted from theme.js`);
    assert.equal(accentTextOf(source), COLORS.accentText.toLowerCase(), `${name}: accent-text drifted`);
  }
});
