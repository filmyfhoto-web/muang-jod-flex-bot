import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const book = readFileSync(new URL('../public/liff/book/index.html', import.meta.url), 'utf8');
const dash = readFileSync(new URL('../public/liff/index.html', import.meta.url), 'utf8');

test('มีทางเข้าสมุดลูกค้าจากหน้างานวันนี้ และทางกลับ', () => {
  // ปุ่มบนแถบล่างของหน้าหลัก — เป็นปุ่มพาไปอีกหน้า ไม่ใช่แท็บ จึงไม่ถือ
  // data-tab ที่แปลว่า ?tab=book ต้องเปิดได้
  assert.match(dash, /data-go="book\/"[^>]*>.*สมุดลูกค้า/s);
  assert.ok(!/data-tab="book"/.test(dash));
  assert.match(dash, /if \(b\.dataset\.go\) return void \(location\.href = b\.dataset\.go\)/);
  // และกลับออกมาได้
  assert.match(book, /location\.href = '\.\.\/'/);
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
