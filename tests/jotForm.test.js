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
    ['i-detail', 'เช่น ตอกตาไก่ 4 มุม'],
    ['i-w', '160'],
    ['i-h', '300'],
    ['i-qty', '1'],
    ['i-rate', 'เช่น 165'],
    ['i-price', 'เช่น 700'],
    // สั้นลงตั้งแต่ยอดรวมย้ายมาอยู่ครึ่งบรรทัดคู่กับแนบรูป — ข้อความยาวกว่านี้
    // ถูกตัดกลางคำในช่องแคบ ซึ่งอ่านแล้วงงกว่าไม่มีเลย
    ['i-total', 'คิดให้อัตโนมัติ'],
  ];
  for (const [cls, placeholder] of fields) {
    assert.ok(html.includes(`class="${cls}"`), `missing field .${cls}`);
    assert.ok(html.includes(placeholder), `missing placeholder for .${cls}: ${placeholder}`);
  }
  assert.ok(html.includes('type="file"') && html.includes('แตะเพื่อแนบ'), 'no image field');

  // Width and length are their own boxes now: nobody should have to type an
  // "x" for the form to understand a size.
  assert.ok(html.includes('<span>กว้าง</span>') && html.includes('<span>ยาว</span>'), 'size is not split');
  assert.ok(html.includes('class="i-unit"'), 'no unit picker');
  assert.ok(!html.includes('60x120'), 'the old "type it with an x" example is still there');

  // The two cards the brief describes, and the buttons on them.
  // "เพิ่มรายการ" กลายเป็น "เพิ่มบรรทัด" ตั้งแต่รายการเรียงลงมาเป็นบรรทัด
  for (const label of ['ตรวจสอบก่อนบันทึก', 'บันทึกงาน', 'แก้ไข', 'ยกเลิก', 'เพิ่มบรรทัด']) {
    assert.ok(html.includes(label), `missing button/heading: ${label}`);
  }
});

test('the rate is the shop\'s own working, and the price is what the customer sees', () => {
  // The bill price is whatever the shop typed — never the rate calculation.
  // These two lines are what keep the two numbers from swapping places.
  assert.match(js, /const price = item\.priceManual \? item\.price : suggested \|\| item\.price;/);
  assert.ok(js.includes('unit_price: round2(price)'), 'the item carries the shop price');
  assert.ok(!/unit_price: round2\(item\.rate\)/.test(js), 'the rate must not be sold as a unit price');

  // What goes on the receipt as the size: width × length and its unit. No rate.
  assert.match(js, /label: `\$\{numText\(width\)\} × \$\{numText\(height\)\} \$\{UNIT_LABELS\[unit\]\}`/);
  assert.ok(js.includes('quantity: qty'), 'quantity is pieces, not square metres');
  assert.ok(!js.includes("unit: 'ตร.ม.'"), 'square metres must not become the billed unit');

  // The working is kept, but only where the shop looks: the note, which no
  // customer-facing card renders.
  assert.ok(js.includes('คิดตาม ตร.ม.'), 'the working is thrown away entirely');
  assert.ok(js.includes('🔒 ร้านเห็นคนเดียว'), 'the hint does not say who can see it');
  assert.ok(!html.includes('readOnly'), 'the price box must stay typable');
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

  // The dashboard is the same app opened from a different button, so it is the
  // same two blues. It used to be a dark theme on its own, which read as a
  // second app — the shop asked for it to match everything else.
  assert.equal(accentOf(dashboard), COLORS.accent.toLowerCase(), 'the dashboard drifted from theme.js');
  assert.equal(accentTextOf(dashboard), COLORS.accentText.toLowerCase());
  assert.match(dashboard, /color-scheme:\s*light/, 'the dashboard is dark again');

  // Nothing dark may be left hardcoded outside the token block: the donut's
  // track and its centre total were drawn straight into the SVG, so switching
  // the tokens left a black ring and an unreadable total on a white card.
  const afterRoot = dashboard.slice(dashboard.indexOf('* { box-sizing'));
  for (const dark of ['#1b2537', '#e8edf5', '#080b12', '#121a2a', '#8494a8']) {
    assert.ok(!afterRoot.includes(dark), `a dark-theme colour is still painted in: ${dark}`);
  }
});

/* ร้านบอกว่า "เพิ่มเป็นบรรทัดเหมือนใบเสร็จธรรมดาได้มั้ย ไม่ต้องข้ามหน้าอ้ะ"
 *
 * ของเดิมหนึ่งรายการคือการ์ดเต็มจอที่ต้องปัดซ้าย-ขวาถึงจะเจอใบถัดไป (scroll-snap
 * + จุดบอกหน้า) งานที่มีสามรายการจึงไม่เคยเห็นพร้อมกันเลยสักครั้ง ทั้งที่ใบเสร็จ
 * จริงอ่านทีเดียวจบ
 */
test('รายการเรียงลงมาเป็นบรรทัด ไม่ใช่การ์ดที่ต้องปัดหา', () => {
  assert.ok(html.includes('class="track"'), 'ไม่มีกล่องรายการ');
  // ไม่มีการปัดแนวนอนแล้ว ทั้ง snap และจุดบอกหน้าต้องหายไปด้วย
  assert.ok(!/\.track\s*\{[^}]*scroll-snap-type/.test(css), 'ยังปัดทีละใบอยู่');
  assert.ok(!/\.track\s*\{[^}]*overflow-x:\s*auto/.test(css), 'ยังเลื่อนแนวนอนได้');
  assert.ok(!html.includes('id="dots"'), 'ยังมีจุดบอกหน้าอยู่ ทั้งที่ไม่มีหน้าให้ข้าม');
  assert.ok(!js.includes('function renderDots'), 'ยังสร้างจุดบอกหน้าอยู่');

  // หนึ่งรายการ = หนึ่งบรรทัดที่ยุบได้ หัวบรรทัดบอก เลขที่ · ชื่อ · ยอด
  assert.match(html, /<details class="card item">/, 'บรรทัดยุบไม่ได้');
  assert.match(html, /<summary class="row-top">/, 'ไม่มีหัวบรรทัดให้แตะ');
  for (const cls of ['row-no', 'row-title', 'row-amt']) {
    assert.ok(html.includes(cls), `หัวบรรทัดไม่มี ${cls}`);
  }
  // หัวบรรทัดต้องอัปเดตตามที่พิมพ์ ไม่งั้นยุบแล้วอ่านไม่ออกว่าบรรทัดไหนคืออะไร
  assert.match(js, /rowTitle\.textContent/, 'ชื่อบนหัวบรรทัดไม่ถูกอัปเดต');
  assert.match(js, /rowAmt\.textContent/, 'ยอดบนหัวบรรทัดไม่ถูกอัปเดต');

  // กางอันหนึ่งแล้วอันอื่นยุบ ไม่งั้นก็กลับไปเป็นกองยาวเหมือนเดิม
  assert.match(js, /other\.open = false/, 'กางแล้วไม่ยุบอันอื่น');
});

test('เพิ่มบรรทัดถัดไปได้โดยไม่ต้องเลื่อนผ่านช่องกรอกสิบช่อง', () => {
  /* ร้านเคยรายงานว่าฟอร์มจดได้งานเดียว เพราะปุ่มเพิ่มอยู่ท้ายการ์ด ซึ่งอยู่ต่ำ
   * ลงไป 970px บนมือถือ เท่ากับไม่มีอยู่จริง
   *
   * ตอนนี้บรรทัดที่กรอกแล้วยุบเหลือบรรทัดเดียว ปุ่มเพิ่มจึงอยู่ถัดจากรายการ
   * ที่สั้นอยู่แล้ว และมีที่เดียว ไม่ต้องมีสองที่เหมือนตอนที่การ์ดยาวเต็มจอ
   */
  assert.ok(html.includes('id="btn-add"'), 'ไม่มีปุ่มเพิ่มบรรทัด');
  assert.ok(html.includes('id="btn-ship"'), 'ไม่มีปุ่มเพิ่มค่าส่ง');
  assert.match(js, /\$\('#btn-add'\)\.onclick = addItem/, 'ปุ่มเพิ่มบรรทัดไม่ถูกต่อสาย');
  assert.match(js, /\$\('#btn-ship'\)\.onclick = addShipping/, 'ปุ่มค่าส่งไม่ถูกต่อสาย');

  // ปุ่มอยู่หลังรายการ ไม่ใช่ในแม่แบบของการ์ด (ซึ่งจะกลายเป็นปุ่มละใบอีก)
  const track = html.indexOf('id="items"');
  const add = html.indexOf('id="btn-add"');
  const tpl = html.indexOf('<template id="tpl-item">');
  assert.ok(track > 0 && add > track, 'ปุ่มเพิ่มไม่ได้อยู่ท้ายรายการ');
  assert.ok(add < tpl, 'ปุ่มเพิ่มไปอยู่ในแม่แบบการ์ด กลายเป็นปุ่มละใบอีกแล้ว');

  // บรรทัดที่เพิ่งเพิ่มต้องกางเอง ไม่ใช่เพิ่มแล้วต้องไปแตะเปิดอีกที
  assert.match(js, /openId = fresh\.id/, 'เพิ่มบรรทัดแล้วไม่กางให้');
  assert.match(js, /openId = ship\.id/, 'เพิ่มค่าส่งแล้วไม่กางให้');
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

test('the dashboard opens whichever tab the link asks for', () => {
  // The rich menu links straight to ?tab=settings and ?tab=pending. The page
  // used to accept only 'pending' and send everything else to งานวันนี้, so
  // the ตั้งค่า button would have opened the wrong screen.
  const tabs = [...new Set([...dashboard.matchAll(/data-tab="([a-z]+)"/g)].map((m) => m[1]))];
  assert.deepEqual(tabs.sort(), ['pending', 'report', 'settings', 'today']);

  const list = /const TABS = \[([^\]]+)\]/.exec(dashboard);
  assert.ok(list, 'no list of tabs the URL may name');
  const allowed = [...list[1].matchAll(/'([a-z]+)'/g)].map((m) => m[1]);

  // Every button in the nav has to be reachable by a link.
  for (const t of tabs) assert.ok(allowed.includes(t), `?tab=${t} cannot reach its own nav button`);

  // The reverse does not hold: "category" is opened by a link from the chat
  // and has no home in the nav, because it is "which category", not a place.
  // But every name the URL may carry must still go somewhere real.
  for (const t of allowed) {
    assert.ok(dashboard.includes(`id="v-${t}"`), `?tab=${t} names a view that does not exist`);
    assert.match(dashboard, new RegExp(`LOADERS = \\{[^}]*\\b${t}:`), `?tab=${t} has nothing to load it`);
  }
});

test('a wide screen gets a column, not a two-thousand-pixel-wide form', () => {
  // Both pages are laid out for a phone but open on a computer too, where
  // every card and every input stretched the whole window.
  assert.match(dashboard, /header, main \{[^}]*max-width:\s*640px/, 'the dashboard still spans the window');
  assert.match(dashboard, /margin-inline:\s*auto/);

  // The bars stay edge to edge — the surface reaching the sides reads as
  // deliberate — but what is on them lines up with the column.
  assert.match(dashboard, /nav \{[\s\S]*?padding:[^;]*max\(4px, calc\(\(100% - 640px\) \/ 2\)\)/, 'the nav buttons sit in the corners of the screen');
  assert.match(css, /\.bar \{[\s\S]*?padding:[^;]*max\(12px, calc\(\(100% - 560px\) \/ 2\)\)/, 'the form\'s title floats away from its own form');

  // The form already had its cap; this keeps the two pages the same shape.
  // ร้านขอให้ "เล็กลงแคบลง" คอลัมน์จึงแคบกว่าแดชบอร์ด แต่ยังจัดกลางเหมือนกัน
  assert.match(css, /^main \{[^}]*max-width:\s*560px/m);
});
