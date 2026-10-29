import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* หน้าสร้างคำสั่งซื้อ — กดเลือกสินค้าแทนการพิมพ์ (แบบแผงสั่งซื้อของ Pancake)
 *
 * โหลดไฟล์ตัวจริงที่หน้าเว็บใช้ ไม่ใช่สำเนา ยอดบนจอกับที่เทสต์ยืนยันจึงเป็นสูตรเดียวกัน
 */
function loadCart() {
  const src = readFileSync(new URL('../public/liff/order/cart.js', import.meta.url), 'utf8');
  const sandbox = {};
  new Function('globalThis', `${src}\nreturn globalThis.OrderCart;`)(sandbox);
  return sandbox.OrderCart;
}

const Cart = loadCart();
const page = readFileSync(new URL('../public/liff/order/index.html', import.meta.url), 'utf8');

test('กดสินค้าเดิมซ้ำ = เพิ่มจำนวน ไม่ใช่แถวใหม่', () => {
  let lines = Cart.add([], { name: 'ถ่ายเอกสาร', unit: 'แผ่น', price: 1 });
  lines = Cart.add(lines, { name: 'ถ่ายเอกสาร', unit: 'แผ่น', price: 1 });
  lines = Cart.add(lines, { name: 'เข้าเล่ม', unit: 'เล่ม', price: 0 });
  assert.equal(lines.length, 2);
  assert.equal(lines[0].qty, 2);
  assert.equal(lines[1].price, 0);
});

test('ยอด: ส่วนลดเกินยอดไม่ได้ รับเงินเกินยอดสุทธิไม่ได้', () => {
  const lines = [
    { name: 'เสื้อ Polo', qty: 1, price: 399 },
    { name: 'ไวนิล', qty: 2.5, price: 165.5 },
  ];
  const t = Cart.totals(lines, { discount: 50, paid: 100 });
  assert.equal(t.subtotal, 812.75);
  assert.equal(t.total, 762.75);
  assert.equal(t.due, 662.75);
  assert.equal(Cart.totals(lines, { discount: 9999 }).total, 0);
  assert.equal(Cart.totals(lines, { paid: 9999 }).paid, 812.75);
});

test('แถวที่ไม่มีชื่อหรือจำนวนศูนย์ไม่ถูกส่ง — เซิร์ฟเวอร์จะปฏิเสธทั้งใบ', () => {
  const items = Cart.toItems([
    { name: '  ป้ายไวนิล ', unit: 'ผืน', size: '1x2 ม.', qty: 1, price: 330 },
    { name: '', qty: 1, price: 10 },
    { name: 'ตรายาง', qty: 0, price: 150 },
  ]);
  assert.deepEqual(items, [
    { item_name: 'ป้ายไวนิล', size: '1x2 ม.', quantity: 1, unit: 'ผืน', unit_price: 330 },
  ]);
});

test('ขายบ่อย: เรียงตามจำนวนครั้ง ราคาคือราคาล่าสุด', () => {
  const jobs = [
    { items: [{ item_name: 'ถ่ายเอกสาร', unit: 'แผ่น', unit_price: 1.5 }] },
    { items: [{ item_name: 'ถ่ายเอกสาร', unit: 'แผ่น', unit_price: 1 }, { item_name: 'ตรายาง', unit: 'อัน', unit_price: 150 }] },
  ];
  const got = Cart.frequentFrom(jobs);
  assert.equal(got[0].name, 'ถ่ายเอกสาร');
  assert.equal(got[0].count, 2);
  assert.equal(got[0].price, 1.5);
  assert.equal(got[1].name, 'ตรายาง');
});

test('หน้าเว็บบันทึกผ่าน POST /api/jobs ตัวเดียวกับหน้าจด และมีแถบเมนูกลับหน้าอื่น', () => {
  assert.match(page, /api\('\/jobs', \{ method: 'POST'/);
  assert.match(page, /<script src="\.\/cart\.js"><\/script>/);
  for (const href of ['/app/jot/', '/app/', '/app/book/']) assert.ok(page.includes(`href="${href}"`), href);
  assert.ok(!/border-radius:\s*[1-9]/.test(page), 'ไม่เอาขอบมน');
});
