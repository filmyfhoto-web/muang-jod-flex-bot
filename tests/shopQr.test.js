import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createMockSupabase } from './helpers/mockSupabase.js';
import { saveShopQr, shopQrUrl, saveShopProfile, getShopProfile, hasShopDetails } from '../src/services/shopService.js';
import { renderReceiptHtml } from '../src/routes/receipt.js';
import { resolveMenuCommand } from '../src/utils/menuCommands.js';

/* ร้านบอกว่า "ฉันเพิ่ม QR สแกนเงิน ไว้ในม่วงได้ไหม บางทีฉันหาในอัลบั้มไม่เจอ"
 *
 * เวลาลูกค้ายืนรออยู่หน้าร้านแล้วต้องไถหาในอัลบั้มรูป คือเวลาที่เสียไปจริง ๆ
 * ทุกครั้งที่เก็บเงิน
 */

// ที่เก็บไฟล์จำลอง — mockSupabase ไม่มี storage เพราะยังไม่เคยมีใครใช้
function withStorage(db) {
  const files = new Map();
  db.storage = {
    from: () => ({
      upload: async (path, buffer, opts) => {
        files.set(path, { buffer, opts });
        return { error: null };
      },
      createSignedUrl: async (path, seconds) =>
        files.has(path)
          ? { data: { signedUrl: `https://files.example/${path}?exp=${seconds}` }, error: null }
          : { data: null, error: new Error('not found') },
    }),
  };
  db._files = files;
  return db;
}

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);

test('ส่งรูป QR มาครั้งเดียว แล้วหยิบมาใช้ได้ตลอด', async () => {
  const db = withStorage(createMockSupabase({ profiles: [{ id: 'u1' }] }));

  const path = await saveShopQr('u1', { buffer: PNG, fileType: 'image/png' }, db);
  assert.match(path, /^u1\/shop\/qr-[0-9a-f-]+\.png$/, 'ไฟล์ไม่ได้แยกตามร้าน');
  assert.ok(db._files.has(path), 'ไม่ได้อัปโหลดไฟล์จริง');
  assert.equal(db._files.get(path).opts.contentType, 'image/png');

  // เก็บ "ที่อยู่ไฟล์" ไม่ใช่ลิงก์สำเร็จรูป — ลิงก์ที่เซ็นไว้มีวันหมดอายุ
  // เก็บลิงก์ไว้แล้วอีกปีหนึ่ง QR จะหายไปเงียบ ๆ
  const shop = await getShopProfile('u1', db);
  assert.equal(shop.qr_path, path);
  assert.ok(!/^https?:/.test(shop.qr_path), 'เก็บลิงก์ไว้ในฐานข้อมูล ซึ่งจะหมดอายุ');

  const url = await shopQrUrl(shop, db);
  assert.match(url, /^https:\/\/files\.example\/u1\/shop\/qr-/);
});

test('ยังไม่เคยเก็บ QR ก็ไม่พัง แค่ไม่มีอะไรให้โชว์', async () => {
  const db = withStorage(createMockSupabase({ profiles: [{ id: 'u1' }] }));
  assert.equal(await shopQrUrl(await getShopProfile('u1', db), db), null);
  assert.equal(await shopQrUrl(null, db), null);
  assert.equal(await shopQrUrl({ qr_path: null }, db), null);

  // ไฟล์หายไปจากที่เก็บ ก็ต้องคืน null ไม่ใช่โยน error ขึ้นไปล้มทั้งใบเสร็จ
  assert.equal(await shopQrUrl({ qr_path: 'u1/shop/หาย.png' }, db), null);
});

test('QR ไม่ใช่ช่องที่พิมพ์เองในหน้าตั้งค่า และไม่ใช่หัวใบเสร็จ', async () => {
  const db = withStorage(createMockSupabase({ profiles: [{ id: 'u1' }] }));
  const path = await saveShopQr('u1', { buffer: PNG, fileType: 'image/png' }, db);

  // บันทึกข้อมูลร้านทับ ต้องไม่ลบ QR ทิ้ง — คนละเรื่องกัน
  await saveShopProfile('u1', { shop_name: 'นัฐภรณ์ การพิมพ์', phone: '081-234-5678' }, db);
  const after = await getShopProfile('u1', db);
  assert.equal(after.qr_path, path, 'ตั้งค่าข้อมูลร้านแล้ว QR หาย');
  assert.equal(after.shop_name, 'นัฐภรณ์ การพิมพ์');

  // และห้ามเขียน qr_path ผ่านช่องข้อความ ไม่งั้นชี้ไปไฟล์ของร้านอื่นได้
  await saveShopProfile('u1', { qr_path: 'u2/shop/ของคนอื่น.png' }, db);
  assert.equal((await getShopProfile('u1', db)).qr_path, path, 'เขียน qr_path ผ่านหน้าตั้งค่าได้');

  // QR อยู่ท้ายใบ ไม่ใช่หัวใบ — มีแต่ QR ไม่ทำให้เกิดหัวใบเสร็จเปล่า ๆ
  assert.equal(hasShopDetails({ qr_path: path }), false);
  assert.equal(hasShopDetails({ shop_name: 'ร้าน' }), true);
});

const BILL = {
  bill_number: 'MJ-B-20260923-0001',
  customer_name: 'พี่ต่าย',
  total: 1584,
  paid_amount: 0,
  balance_due: 1584,
  payment_status: 'pending',
  created_at: '2026-09-23T03:00:00Z',
  jobs: [{ id: 'j1', job_name: 'ป้ายไวนิล', job_date: '2026-09-23', total: 1584, items: [] }],
};

test('ใบที่ยังค้างจ่าย มี QR ให้สแกน ใบที่จ่ายครบแล้วไม่มี', () => {
  const qrUrl = 'https://files.example/u1/shop/qr-1.png';

  const due = renderReceiptHtml(BILL, {}, { qrUrl });
  assert.match(due, /สแกนจ่ายได้เลยค่ะ/);
  assert.ok(due.includes(qrUrl), 'ไม่มีรูป QR บนใบที่ค้างจ่าย');
  assert.match(due, /ยอดที่ต้องโอน ฿1,584/, 'ไม่ได้บอกยอดที่ต้องโอนคู่กับ QR');

  // จ่ายครบแล้วไม่มีอะไรให้สแกน โชว์ QR ต่อมีแต่จะทำให้ลูกค้าจ่ายซ้ำ
  const paid = renderReceiptHtml(
    { ...BILL, paid_amount: 1584, balance_due: 0, payment_status: 'paid' },
    {},
    { qrUrl }
  );
  assert.ok(!paid.includes(qrUrl), 'ใบที่จ่ายครบแล้วยังโชว์ QR');
  assert.ok(!/สแกนจ่ายได้เลย/.test(paid));

  // ร้านที่ยังไม่เคยเก็บ QR ใบเสร็จต้องออกมาเหมือนเดิมทุกอย่าง
  assert.ok(!/สแกนจ่ายได้เลย/.test(renderReceiptHtml(BILL, {}, {})));
});

test('พิมพ์คำเดียวแล้วรูปเด้ง ไม่ต้องไถหาในอัลบั้ม', () => {
  for (const word of ['QR', 'qr', 'คิวอาร์', 'สแกนจ่าย', 'พร้อมเพย์']) {
    assert.equal(resolveMenuCommand(word), 'shop_qr', word);
  }
  for (const word of ['เปลี่ยน qr', 'เปลี่ยนคิวอาร์']) {
    assert.equal(resolveMenuCommand(word), 'replace_shop_qr', word);
  }

  // งานที่มีคำว่า QR อยู่ข้างในต้องไม่โดนดูดไป — จับทั้งข้อความเท่านั้น
  assert.notEqual(resolveMenuCommand('ทำป้าย QR ร้านกาแฟ 1 ป้าย 500'), 'shop_qr');
});

test('รูป QR ไม่ถูกเอาไปอ่านเป็นใบสั่งงาน', () => {
  const handler = readFileSync(new URL('../src/handlers/imageHandler.js', import.meta.url), 'utf8');

  // ต้องมาก่อนทางอ่านรูปและทางแนบหลักฐาน ไม่งั้นม่วงจะพยายามอ่าน QR เป็นงาน
  const qrAt = handler.indexOf('STATES.WAITING_FOR_QR');
  const readAt = handler.indexOf('await readImage(');
  const draftAt = handler.indexOf('if (drafting)');
  assert.ok(qrAt > -1, 'ตัวจัดการรูปไม่รู้จักโหมดเก็บ QR');
  assert.ok(qrAt < readAt, 'QR ถูกส่งไปให้ตัวอ่านรูปก่อน');
  assert.ok(qrAt < draftAt, 'QR ถูกแนบเข้ากับร่างงานที่ค้างอยู่');

  // PDF ไม่ใช่ QR ที่ส่งเข้าแชตได้
  assert.match(handler.slice(qrAt, readAt), /application\/pdf/);

  const postback = readFileSync(new URL('../src/handlers/postbackHandler.js', import.meta.url), 'utf8');
  assert.match(postback, /case 'shop_qr':/);
  assert.match(postback, /case 'replace_shop_qr':/);
});
