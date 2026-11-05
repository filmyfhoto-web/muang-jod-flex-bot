// ราคาลูกค้า: ร้านขายเป็นแผ่น (ม้วน = เมตร) → ลูกค้าตกดวงละ = ราคารวม ÷ ดวงที่ได้
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Q = require('../adobe/nesting-cut/core/price.js');

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);

test('ราคาลูกค้า: แผ่นละ 50 ได้ 28 ดวง → ตกดวงละ 1.79', () => {
  const q = Q.quote({ repeat: true, perSheet: 28, sheets: 1, pieces: 28, price: '50' });
  assert.equal(q.byOrder, false);
  assert.equal(q.units, 1);
  near(q.total, 50);
  near(q.per, 50 / 28);
  assert.equal(Q.baht(q.per), '1.79');
});

test('ราคาลูกค้า: สั่ง 500 ดวง แผ่นละ 120 → 5 แผ่น 250 บาท ได้ 600 ดวง', () => {
  const q = Q.quote({ repeat: true, perSheet: 120, sheets: 1, pieces: 120, orderQty: 500, price: 50 });
  assert.equal(q.byOrder, true);
  assert.equal(q.order, 500);
  assert.equal(q.sheets, 5);
  assert.equal(q.pieces, 600);
  assert.equal(q.spare, 100);
  near(q.total, 250);
  near(q.per, 50 / 120); // ตกดวงละเท่ากับทั้งแผ่น เพราะแผ่นสุดท้ายลูกค้าได้ครบแผ่น
});

test('ราคาลูกค้า: งานหลายแบบ (ไม่ใช่ดวงเดียวซ้ำ) ไม่สนจำนวนที่สั่ง ใช้แผ่นตามผลจัดวาง', () => {
  const q = Q.quote({ repeat: false, perSheet: 40, sheets: 3, pieces: 95, orderQty: 1000, price: 50 });
  assert.equal(q.byOrder, false);
  assert.equal(q.sheets, 3);
  assert.equal(q.pieces, 95);
  near(q.total, 150);
  near(q.per, 150 / 95);
});

test('ราคาลูกค้า: ม้วน คิดตามเมตรที่ใช้', () => {
  const q = Q.quote({ roll: true, meters: 2.5, sheets: 1, pieces: 50, price: 120 });
  assert.equal(q.units, 2.5);
  near(q.total, 300);
  near(q.per, 6);
});

test('ราคาลูกค้า: ยังไม่ใส่ราคา / ค่าผิด / ไม่มีชิ้นงาน → ไม่คิด', () => {
  assert.equal(Q.quote({ sheets: 1, pieces: 10 }), null);
  assert.equal(Q.quote({ sheets: 1, pieces: 10, price: 'abc' }), null);
  assert.equal(Q.quote({ sheets: 1, pieces: 10, price: -5 }), null);
  assert.equal(Q.quote({ sheets: 1, pieces: 0, price: 50 }), null);
});

test('ราคาลูกค้า: รูปแบบตัวเลขบาท', () => {
  assert.equal(Q.baht(1250), '1,250');
  assert.equal(Q.baht(585.4), '585');
  assert.equal(Q.baht(12.5), '12.50');
  assert.equal(Q.baht(60), '60');
  assert.equal(Q.baht(0.9), '0.90');
});
