import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderReceiptHtml, receiptData, RECEIPT_IMAGE_JS } from '../src/routes/receipt.js';

/* ใบเสร็จเลือกขนาดได้ + QR จ่ายเงินติดไปกับรูป — สองคำขอจริงของร้าน:
 * "ใบเสร็จขอ มีให้เลือก A5 A4 และสลิปเหมือนเดิม" และ
 * "ยังไม่เห็นมีว่าเราจะใส่ QR จ่ายเงินที่รูปฝากไว้"
 */

const bill = {
  bill_number: 'MJ-B-0001',
  customer_name: 'รร.สบกอน',
  payment_status: 'pending',
  subtotal: 600,
  discount: 0,
  total: 600,
  paid_amount: 0,
  balance_due: 600,
  created_at: '2026-10-13T03:00:00Z',
  share_token: 'a'.repeat(32),
  jobs: [{ job_name: 'ป้ายไวนิล', job_date: '2026-10-13', total: 600, items: [{ item_name: 'ป้ายไวนิล', size: '60 × 160 ซม.', quantity: 1, unit_price: 600, total: 600 }] }],
};
const QR = 'https://example.supabase.co/sign/qr.png';

test('หน้าใบเสร็จมีแถบเลือกขนาด สลิป/A5/A4 และจำที่เลือกไว้', () => {
  const html = renderReceiptHtml(bill, {}, { qrUrl: QR });

  for (const id of ['id="size-slip"', 'id="size-a5"', 'id="size-a4"']) assert.ok(html.includes(id), id);
  assert.match(html, /สลิป = รูปส่งในแชต · A5 \/ A4 = พิมพ์ลงกระดาษ/);

  // แถบขนาดต้องอยู่ "ใน" style บล็อกแรก ไม่ใช่บล็อกใหม่ก่อนหน้า — receiptFit
  // ตัด CSS ถึง </style> แรก ถ้ามีบล็อกแทรกก่อน เทสต์นั้นจะอ่านผิดไฟล์
  const firstStyle = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
  assert.match(firstStyle, /\.size button\.on\{background:var\(--purple\)/);
  // ตอนพิมพ์: ปุ่ม/สวิตช์/ราคาภายในร้านหาย แต่ QR ต้องอยู่ให้ลูกค้าสแกนจากกระดาษ
  assert.match(firstStyle, /\.print,\.shot,\.size,\.size-hint,\.pick,\.warn,\.mine\{display:none\}/);
  assert.doesNotMatch(firstStyle, /@media print\{[^]*\.qr\{display:none/);

  assert.match(RECEIPT_IMAGE_JS, /muangjod\.receipt\.size/, 'ไม่จำขนาดที่เลือก');
  // @page เลือกตาม selector ไม่ได้ — ฉีดตอนกดพิมพ์ และต้องกันสภาพแวดล้อมไม่มี window
  assert.match(RECEIPT_IMAGE_JS, /@page\{size:' \+ \(size === 'a5' \? 'A5' : 'A4'\) \+ ';margin:12mm\}/);
  assert.match(RECEIPT_IMAGE_JS, /typeof window === 'undefined' \|\| !window\.print/);
  // ปุ่มเดิมสลับหน้าที่ตามขนาด: สลิป = ทำรูปเส้นเดิม อื่น ๆ = สั่งพิมพ์
  assert.match(RECEIPT_IMAGE_JS, /sizeNow === 'slip' \? make\(btn, false\) : printPaper\(sizeNow\)/);
});

test('QR ไปกับรูปใบเสร็จ — เฉพาะใบค้างจ่าย โหลดพลาดต้องไม่ทำสลิปพัง', () => {
  // ข้อมูลที่ส่งให้ canvas: มี qr เมื่อค้างจ่าย ไม่มีเมื่อจ่ายครบ (กติกาเดียวกับหน้า)
  assert.equal(receiptData(bill, {}, false, QR).qr, QR);
  assert.equal(receiptData({ ...bill, payment_status: 'paid', balance_due: 0, paid_amount: 600 }, {}, false, QR).qr, null);
  assert.equal(receiptData(bill, {}, false, null).qr, null);

  const html = renderReceiptHtml(bill, {}, { qrUrl: QR });
  assert.ok(html.includes('"qr":"https://example.supabase.co/sign/qr.png"'), 'bill-data ไม่พก qr ไปให้ canvas');

  // ตัววาด: โหลดก่อน (รอไม่เกิน 1.5 วิ) เช็ก taint ตั้งแต่ตอนโหลด และความสูงใบ
  // ขยับตามว่ามี QR ไหม — ทั้งหมดต้องไม่พังในที่ที่ไม่มี Image (ตัวเทสต์เก่า)
  assert.match(RECEIPT_IMAGE_JS, /typeof Image !== 'undefined'/);
  assert.match(RECEIPT_IMAGE_JS, /crossOrigin = 'anonymous'/);
  assert.match(RECEIPT_IMAGE_JS, /toDataURL\(\);\s*\n\s*qrImg = im;/, 'ไม่ได้เช็ก taint ก่อนใช้');
  assert.match(RECEIPT_IMAGE_JS, /setTimeout\(res, 1500\)/);
  assert.match(RECEIPT_IMAGE_JS, /var qrExtra = qrImg && data\.qr \? QR_BLOCK : 0;/);
  assert.match(RECEIPT_IMAGE_JS, /if \(qrWait\) \{ try \{ await qrWait; \}/);
  assert.match(RECEIPT_IMAGE_JS, /สแกนจ่ายยอดคงเหลือ/);
});

test('ปุ่มชื่อธนาคารหลังฝากรูปเป็น postback — "พร้อมเพย์" ไม่โดนเมนูดักอีก', async () => {
  const { readFileSync } = await import('node:fs');
  const image = readFileSync(new URL('../src/handlers/imageHandler.js', import.meta.url), 'utf8');
  assert.match(image, /action=qr_label&id=\$\{saved\.id\}/);
  assert.match(image, /label === 'ข้าม' \? '' : `&v=\$\{encodeURIComponent\(label\)\}`/, 'ข้าม = ไม่ส่งชื่อ');

  const router = readFileSync(new URL('../src/handlers/postbackHandler.js', import.meta.url), 'utf8');
  assert.match(router, /case 'qr_label':/);

  const action = readFileSync(new URL('../src/actions/shopQr.js', import.meta.url), 'utf8');
  assert.match(action, /export async function qrLabelPick/);
  assert.match(action, /renameShopQr\(profile\.id, params\.id, label\)/);
  // เส้นพิมพ์ชื่อเองของเดิมต้องยังอยู่ (เผื่อร้านพิมพ์ชื่อธนาคารอื่น)
  const mh = readFileSync(new URL('../src/handlers/messageHandler.js', import.meta.url), 'utf8');
  assert.match(mh, /WAITING_FOR_QR_LABEL/);
});

test('บัญชีลูกค้าในสมุด รวมทุกหมวดเป็นลิสต์เดียว — หมวดย้ายไปอยู่ชิปท้ายแถว', async () => {
  const { readFileSync } = await import('node:fs');
  const book = readFileSync(new URL('../public/liff/book/index.html', import.meta.url), 'utf8');
  assert.match(book, /งานทุกใบของเจ้านี้ รวมทุกหมวด/);
  assert.doesNotMatch(book, /แยกตามหมวด'/, 'หัวการ์ดยังพูดว่าแยกตามหมวดอยู่');
  // ลิสต์เดียวเรียงวันใหม่สุดก่อน และชิปหมวดอยู่กับแถวงาน
  assert.match(book, /\.flatMap\(\(g\) => g\.jobs\.map\(\(j\) => \(\{ j, g \}\)\)\)/);
  assert.match(book, /localeCompare\(String\(a\.j\.jobDate/);
  assert.match(book, /what\.querySelector\('\.cat'\)\.textContent/);
  assert.doesNotMatch(book, /catband'\);\n\s+paint\(band/, 'ยังสร้างแถบหัวหมวดเป็นกอง ๆ อยู่');
});
