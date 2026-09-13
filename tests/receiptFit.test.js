import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderReceiptHtml } from '../src/routes/receipt.js';

// ร้านส่งรูปมาบอกว่า "ข้อความล้น" — ใบเสร็จบนจอถูกตัดขอบขวาหายไปทั้งแถบ
// ทั้ง ฿5,030 ของงาน ยอดรวม ฿4,931.43 และคำว่า "คงเหลือ" ซึ่งคือทุกตัวเลขที่
// ร้านเปิดใบเสร็จขึ้นมาดู กรอบกว้างถูกต้อง (จอ − ขอบ 14 จุดสองข้าง) แต่รูปข้างใน
// กว้างกว่ากรอบ แล้ว overflow-x:auto ก็เฉือนทิ้งเงียบ ๆ ตรงฝั่งที่มีตัวเลขพอดี

const BILL = {
  bill_number: 'MJ-B-20260911-0002',
  issued_at: '2026-09-11T05:18:00.000Z',
  customer_name: 'ผอ กิ๊ก ที่อยู่ โรงเรียนบ้านนาบง',
  payment_status: 'pending',
  subtotal: 5030,
  total: 4931.43,
  paid_amount: 0,
  balance_due: 4931.43,
  jobs: [
    {
      job_name: 'งานป้าย / ป้ายไวนิล',
      job_date: '2026-09-11',
      total: 5030,
      items: [
        { item_name: 'ไวนิลพระเทพ', size: '150 × 300 ซม.', quantity: 1, total: 800 },
        { item_name: 'สแตนตี้', quantity: 2, total: 2400 },
      ],
    },
  ],
};

const html = renderReceiptHtml(BILL, { shop_name: 'นัฐภรณ์ การพิมพ์' }, { shopView: true });
const css = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));

test('the receipt on screen cannot be cut off, however wide the frame comes out', () => {
  // object-fit:contain คือข้อรับประกัน ไม่ใช่ความหวัง — กรอบจะกว้างผิดแค่ไหน
  // ทั้งใบก็ยังอยู่ในกรอบ อย่างแย่ที่สุดคือมีขอบว่าง ไม่ใช่ตัวเลขหาย
  assert.match(css, /\.shot \.frame img\{[^}]*object-fit:contain/, 'รูปยังถูกเฉือนขอบได้อยู่');
  assert.match(css, /\.shot \.frame img\{[^}]*max-width:100%/, 'รูปกว้างเกินกรอบได้');
  // กรอบสูงตามสัดส่วนรูปจริง ไม่งั้น contain จะเหลือขอบว่างบนล่างเต็มไปหมด
  assert.match(css, /\.shot \.frame\{[^}]*aspect-ratio:var\(--ar,auto\)/);
  assert.match(html, /frame\.style\.setProperty\('--ar'/, 'ไม่มีใครบอกกรอบว่ารูปสัดส่วนเท่าไหร่');

  // ของเดิมเลื่อนแนวนอนได้ตลอดเวลา ซึ่งคือช่องทางที่ทำให้ของหายไปนอกจอ
  // ตอนนี้เลื่อนได้เฉพาะตอนกดขยายเท่านั้น
  assert.doesNotMatch(css, /\.shot \.frame\{[^}]*overflow-x:auto/, 'กรอบยังเลื่อนแนวนอนได้ตอนพอดีจอ');
  assert.match(css, /\.shot \.frame\.zoom\{[^}]*overflow-x:auto/);

  // กรอบไม่ใช่ลูกของ flex ที่กว้างเป็นเปอร์เซ็นต์อีกแล้ว — นั่นคือจุดที่เบราว์เซอร์
  // คิดความกว้างพลาดแล้วรูปล้นออกไป
  assert.match(css, /\.shot \.wrap\{max-width:560px;margin:0 auto\}/);
  assert.doesNotMatch(css, /\.shot\{[^}]*align-items:center/, 'ยังวางกรอบด้วย flex อยู่');
  assert.match(html, /<div class="wrap">/);
});

test('zooming lands on the numbers, because that is what you zoomed for', () => {
  assert.match(html, /frame\.scrollLeft = frame\.scrollWidth - frame\.clientWidth/, 'ขยายแล้วไปหยุดกลางใบ');
  assert.doesNotMatch(html, /scrollWidth - frame\.clientWidth\) \/ 2/);
});

test('a line too long to fit says so, instead of stopping mid-word', () => {
  // wrap().slice(0, n) ตัดทิ้งเงียบ ๆ อ่านแล้วนึกว่าร้านพิมพ์มาแค่นั้นจริง ๆ
  assert.match(html, /function clip\(ctx, text, maxWidth, maxLines\)/);
  assert.match(html, /kept\[maxLines - 1\] = last \+ '…'/);
  assert.doesNotMatch(html, /wrap\(ctx, [^)]*\)\.slice\(0, [12]\)/, 'ยังมีที่ที่ตัดข้อความทิ้งเงียบ ๆ');
});
