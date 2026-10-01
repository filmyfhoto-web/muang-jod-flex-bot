import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const book = readFileSync(new URL('../public/liff/book/index.html', import.meta.url), 'utf8');
const dash = readFileSync(new URL('../public/liff/index.html', import.meta.url), 'utf8');

const ledger = readFileSync(new URL('../public/liff/ledger/index.html', import.meta.url), 'utf8');

test('มีทางเข้าสมุดลูกค้าจากหน้างานวันนี้ และทางกลับ', () => {
  // ปุ่มบนแถบล่างของหน้าหลัก — เป็นปุ่มพาไปอีกหน้า ไม่ใช่แท็บ จึงไม่ถือ
  // data-tab ที่แปลว่า ?tab=book ต้องเปิดได้
  assert.match(dash, /data-page="[^"]+"[^>]*>.*สมุดลูกค้า/s);
  assert.ok(!/data-tab="book"/.test(dash));
  assert.match(dash, /if \(b\.dataset\.page\) return void \(location\.href = b\.dataset\.page\)/);
});

/* ร้านกดสมุดลูกค้าแล้วเจอหน้าขาว
 *
 * LIFF เปิดหน้าหลักที่ /app ซึ่งไม่มีสแลชท้าย ลิงก์สัมพัทธ์ 'book/' จึงถูกคิด
 * เทียบกับ / ไม่ใช่ /app/ แล้ววิ่งไปที่ /book/ ซึ่งไม่มีอยู่จริง
 *
 * เทสต์เดิมดูแค่ว่ามีข้อความ 'book/' อยู่ในไฟล์ ซึ่งผ่านทั้งที่พาไปผิดที่ —
 * อันนี้คิดปลายทางจริงจากทุกที่อยู่ที่หน้าหลักถูกเปิดได้
 */
test('ลิงก์ข้ามหน้าต้องไปถูกที่ ไม่ว่าหน้าหลักจะถูกเปิดด้วยที่อยู่แบบไหน', () => {
  const ENTRIES = [
    'https://shop.example.com/app',
    'https://shop.example.com/app/',
    'https://shop.example.com/app?tab=settings',
    'https://shop.example.com/app/index.html',
  ];

  const target = /data-page="([^"]+)"/.exec(dash)?.[1];
  assert.ok(target, 'ไม่มีปุ่มพาไปสมุดลูกค้า');
  for (const from of ENTRIES) {
    assert.equal(new URL(target, from).pathname, '/app/book/', 'เปิดจาก ' + from);
  }

  // ทางกลับและลิงก์ข้ามหน้าของอีกสองหน้า คิดจากที่อยู่จริงของหน้านั้น
  const FROM_BOOK = 'https://shop.example.com/app/book/';
  for (const [page, text, want] of [
    [book, "location.href = '/app/'", '/app/'],
    [book, 'href="/app/ledger/"', '/app/ledger/'],
    [ledger, "location.href = '/app/'", '/app/'],
  ]) {
    assert.ok(page.includes(text), 'ไม่มี ' + text);
    assert.equal(new URL(want, FROM_BOOK).pathname, want);
  }
});

/* ร้านกดสมุดลูกค้าแล้วได้หน้าว่าง เพราะหน้าหลักใช้ data-go อยู่ก่อนแล้ว
 * สำหรับสลับแท็บในหน้าเดียวกัน พอปุ่มใหม่ใช้ชื่อเดิมคนละความหมาย
 * ตัวจัดการของเก่าก็ทับของใหม่ กลายเป็นสั่งเปิดแท็บชื่อ "/app/book/"
 */
test('ปุ่มออกไปอีกหน้า ต้องไม่ใช้ชื่อเดียวกับปุ่มสลับแท็บ', () => {
  const jump = /data-page="([^"]+)"/.exec(dash)?.[1];
  assert.ok(jump, 'ไม่มีปุ่มพาไปสมุดลูกค้า');

  // ปุ่มที่พาออกไปอีกหน้า ห้ามมี data-go ติดอยู่ด้วย ไม่งั้นโดนทับอีก
  for (const [, attrs] of dash.matchAll(/<button([^>]*data-page[^>]*)>/g)) {
    assert.ok(!/data-go=/.test(attrs), 'ปุ่มนี้มีทั้งสองชื่อ: ' + attrs);
  }

  // และตัวจัดการต้องอ่านคนละช่อง
  assert.match(dash, /if \(b\.dataset\.page\) return void \(location\.href = b\.dataset\.page\);/);
  assert.match(dash, /\[data-go\]'\)\.forEach\(\(el\) => \(el\.onclick = \(\) => show\(el\.dataset\.go\)\)\);/);
});

test('สั่งเปิดแท็บที่ไม่มีอยู่ ต้องขึ้นข้อความ ไม่ใช่ทิ้งหน้าว่าง', () => {
  const show = dash.slice(dash.indexOf('async function show(name)'), dash.indexOf('const TAB_NAMES'));

  // ต้องเช็กก่อนซ่อนของเดิม ไม่งั้นซ่อนหมดแล้วค่อยพัง = จอว่าง
  const guard = show.indexOf("const view = $('v-' + name);");
  const hideAll = show.indexOf("main > section");
  assert.ok(guard >= 0 && guard < hideAll, 'ยังซ่อนทุกส่วนก่อนเช็กว่ามีแท็บจริงไหม');

  assert.match(show, /if \(!view\) \{/);
  assert.match(show, /retry: \(\) => show\('today'\)/);
  assert.match(show, /view\.hidden = false;/);
});

/* ตอนถ่ายหน้าจอตรวจ เจอว่าแถบเลือกหมวดกับปุ่มย้อนกลับโผล่ในหน้าที่ไม่ควรมี
 *
 * เพราะกล่องพวกนี้ตั้ง display: flex ไว้ในสไตล์ ซึ่งทับ hidden ของเบราว์เซอร์
 * การซ่อนด้วย element.hidden = true จึงไม่มีผลเลยสักที่ในหน้านี้
 */
test('ซ่อนด้วย hidden แล้วต้องหายจริง ทั้งที่กล่องเป็น flex', () => {
  assert.match(book, /\[hidden\]\s*\{\s*display:\s*none\s*!important;?\s*\}/);

  // ทุกคลาสที่หน้านี้สั่งซ่อน/แสดงด้วย .hidden ต้องอยู่ใต้กฎนั้น
  for (const id of ['back', 'tabs', 'picker', 'bar', 'hint', 'h-owed', 'h-pill']) {
    assert.ok(book.includes(`$('${id}').hidden`), id);
  }
});

test('หน้านี้ใช้ฟอนต์ระบบของเครื่อง ไทยตกไปที่ฟอนต์ไทยของ Mac ก่อน Noto', () => {
  const stack = book.match(/font-family:\s*([^;]+);/)?.[1] || '';
  const order = ['-apple-system', 'SF Pro Text', 'Thonburi', 'Noto Sans Thai'];
  let at = -1;
  for (const font of order) {
    const found = stack.indexOf(font);
    assert.ok(found > at, `${font} ต้องมาหลัง ${order[order.indexOf(font) - 1] || 'ต้นลิสต์'}`);
    at = found;
  }
});

test('ปุ่มออกใบบอกจำนวนใบที่จะได้จริง ตามรูปแบบที่เลือก', () => {
  // แยกใบละงาน = ได้ใบเท่าจำนวนงานที่ติ๊ก · รวม = ใบเดียวเสมอ
  assert.match(book, /mode === 'split'\s*\?\s*`ออกใบเสร็จ \$\{ids\.length\} ใบ`\s*:\s*'ออกใบเสร็จ 1 ใบ'/);
  assert.match(book, /jobIds: ids, mode, customerName: account\.name/);
});

test('งานที่ออกบิลไปแล้ว ติ๊กเลือกซ้ำไม่ได้', () => {
  assert.match(book, /const locked = j\.billed;/);
  assert.match(book, /tick\.disabled = locked;/);
  // และตั้งต้นไม่ติ๊กให้ด้วย
  assert.match(book, /if \(!j\.billed && !j\.paid\) picked\.add\(j\.id\)/);
});
