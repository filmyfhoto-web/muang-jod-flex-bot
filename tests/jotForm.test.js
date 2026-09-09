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
    ['i-detail', 'เช่น ป้ายไวนิล 60x120 ซม.'],
    ['i-price', 'เช่น 700'],
    ['i-qty', 'เช่น 2'],
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

test('the form page opens in the same colours as the card it came from', () => {
  const accentOf = (source) => /--accent:\s*(#[0-9a-f]{6})/i.exec(source)?.[1]?.toLowerCase();
  const accentTextOf = (source) => /--accent-text:\s*(#[0-9a-f]{6})/i.exec(source)?.[1]?.toLowerCase();

  // Only the default theme is checked: the page is reached by tapping a card,
  // and arriving in a different palette is the jarring part. `body.night` is a
  // deliberate alternate with its own values.
  const root = /:root\s*\{([\s\S]*?)\n\}/.exec(css)?.[1];
  assert.ok(root, 'the default token block is gone');
  assert.equal(accentOf(root), COLORS.accent.toLowerCase(), 'accent drifted from theme.js');
  assert.equal(accentTextOf(root), COLORS.accentText.toLowerCase(), 'accent-text drifted from theme.js');

  // The dashboard keeps its own darker identity, but must still declare both.
  assert.ok(accentOf(dashboard) && accentTextOf(dashboard), 'the dashboard lost a token');
});

test('the cards swipe sideways, with dots that follow', () => {
  assert.ok(html.includes('class="track"') && html.includes('id="dots"'), 'no carousel markup');
  // Snap is what makes a swipe land on one card instead of halfway between two.
  assert.match(css, /\.track\s*\{[^}]*scroll-snap-type:\s*x mandatory/);
  assert.match(css, /\.track > \.item\s*\{[^}]*scroll-snap-align/);

  assert.ok(js.includes('function renderDots'), 'the dots are never built');
  assert.ok(js.includes("itemsBox.addEventListener('scroll'"), 'the dots do not follow a swipe');
  assert.ok(js.includes('function scrollToCard'), 'a dot cannot jump to its card');
  // Buttons live on every card in the mockup, so both must do something.
  assert.ok(js.includes("$('.act-save', el).onclick") && js.includes("$('.act-add', el).onclick"));
});

test('both themes are one stylesheet, switched by a class', () => {
  assert.ok(js.includes("params.get('theme') === 'night'"), 'nothing reads ?theme=night');
  assert.ok(js.includes("classList.add('night')"), 'the night theme is never applied');
  // Every colour has to come from a token, or switching the class leaves
  // stragglers behind in the other theme's palette.
  const body = css.slice(css.indexOf('* { box-sizing'));
  const literals = body.match(/(?<!-)#[0-9a-f]{3,8}\b/gi) || [];
  const allowed = /^#(0a1220|0c1526|091120|16324f|0e2136|0b1524|fdf6d8|e8dfa8|fff)$/i; // night sky art only
  const strays = literals.filter((hex) => !allowed.test(hex));
  assert.deepEqual(strays, [], `hard-coded colours outside the token blocks: ${strays.join(', ')}`);
});

test('quick mode is a sheet: no chat, no summary card, a total bar that stays put', () => {
  assert.ok(html.includes('id="quickbar"') && html.includes('id="qb-save"'), 'no quick save bar');
  assert.ok(html.includes('class="handle"'), 'no sheet handle');
  assert.ok(html.includes('id="more"'), 'the extra fields are not collapsible');

  assert.ok(js.includes("get('quick') === '1'"), 'nothing reads ?quick=1');
  assert.ok(js.includes("classList.add('quick')"));

  // The three things quick mode has to hide, and the bar it puts in their place.
  for (const rule of ['body.quick .bar', 'body.quick .chat', 'body.quick .summary', '.quickbar {']) {
    assert.ok(css.includes(rule), `missing style: ${rule}`);
  }
  // The bar is fixed to the bottom, and the page leaves room so it covers nothing.
  assert.match(css, /\.quickbar\s*\{[^}]*position:\s*fixed/);
  assert.match(css, /body\.quick main\s*\{[^}]*padding-bottom:\s*\d+px/);
});
