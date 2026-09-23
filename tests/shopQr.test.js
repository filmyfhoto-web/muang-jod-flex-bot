import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createMockSupabase } from './helpers/mockSupabase.js';
import {
  addShopQr,
  listShopQrs,
  shopQrUrl,
  renameShopQr,
  setDefaultShopQr,
  deleteShopQr,
  defaultQrUrl,
  saveShopProfile,
  getShopProfile,
} from '../src/services/shopService.js';
import { qrPickerFlex } from '../src/flex/qrFlex.js';
import { renderReceiptHtml } from '../src/routes/receipt.js';
import { resolveMenuCommand } from '../src/utils/menuCommands.js';

/* ร้านส่ง QR มาสองใบแล้วบอกว่า "ให้ฉันกดเลือกว่าจะใส่ QR อันไหน"
 *
 *   1. พร้อมเพย์ของกสิกร — ชื่อบุคคล "นัฐภรณ์ ไชยปรุง"
 *   2. Thai QR ของออมสิน — ชื่อร้าน "ร้านนัฐภรณ์ การพิมพ์" มีรหัสร้านค้า
 *
 * คนละบัญชีกันจริง ๆ ไม่ใช่รูปซ้ำ เก็บได้ใบเดียวแปลว่าต้องเลือกทิ้งอีกใบ
 */

function withStorage(db) {
  const files = new Map();
  db.storage = {
    from: () => ({
      upload: async (path, buffer, opts) => {
        files.set(path, { buffer, opts });
        return { error: null };
      },
      remove: async (paths) => {
        for (const p of paths) files.delete(p);
        return { error: null };
      },
      createSignedUrl: async (path) =>
        files.has(path)
          ? { data: { signedUrl: `https://files.example/${path}` }, error: null }
          : { data: null, error: new Error('not found') },
    }),
  };
  db._files = files;
  return db;
}

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
const fresh = () => withStorage(createMockSupabase({ profiles: [{ id: 'u1' }] }));

async function twoQrs(db) {
  const kbank = await addShopQr('u1', { buffer: PNG, fileType: 'image/png' }, db);
  const gsb = await addShopQr('u1', { buffer: PNG, fileType: 'image/png' }, db);
  await renameShopQr('u1', kbank.id, 'กสิกร', db);
  await renameShopQr('u1', gsb.id, 'ออมสิน', db);
  return { kbank, gsb };
}

test('เก็บได้หลายใบ ใบแรกเป็นใบที่ใช้เอง', async () => {
  const db = fresh();
  const { kbank, gsb } = await twoQrs(db);

  const list = await listShopQrs('u1', db);
  assert.equal(list.length, 2, 'เก็บได้ใบเดียว ใบที่สองทับใบแรก');
  assert.deepEqual(list.map((q) => q.label), ['กสิกร', 'ออมสิน'], 'ใบที่ใช้อยู่ไม่ได้ขึ้นก่อน');

  // ร้านที่มีใบเดียวไม่ควรต้องรู้ด้วยซ้ำว่ามีเรื่อง "ใบหลัก" อยู่
  assert.equal(list.find((q) => q.id === kbank.id).is_default, true);
  assert.equal(list.find((q) => q.id === gsb.id).is_default, false);

  // คนละไฟล์กัน ไม่ทับกัน
  assert.equal(db._files.size, 2);
});

test('กดเลือกว่าจะใช้ใบไหน แล้วใบนั้นขึ้นใบเสร็จ', async () => {
  const db = fresh();
  const { kbank, gsb } = await twoQrs(db);

  const before = await defaultQrUrl('u1', db);
  assert.ok(before?.includes(kbank.path), 'ใบเสร็จไม่ได้ใช้ใบแรกเป็นค่าตั้งต้น');

  const picked = await setDefaultShopQr('u1', gsb.id, db);
  assert.equal(picked.label, 'ออมสิน');

  // ใบหลักมีได้ใบเดียว ใบเดิมต้องถูกปลด
  const after = await listShopQrs('u1', db);
  assert.deepEqual(after.filter((q) => q.is_default).map((q) => q.label), ['ออมสิน']);
  assert.notEqual(await defaultQrUrl('u1', db), before, 'เลือกใบใหม่แล้วใบเสร็จยังใช้ใบเดิม');
});

test('ลบใบที่ใช้อยู่ แล้วมีใบอื่นขึ้นแทน ไม่ใช่ใบเสร็จไม่มี QR เงียบ ๆ', async () => {
  const db = fresh();
  const { kbank, gsb } = await twoQrs(db);

  const gone = await deleteShopQr('u1', kbank.id, db);
  assert.equal(gone.label, 'กสิกร');

  const left = await listShopQrs('u1', db);
  assert.equal(left.length, 1);
  assert.equal(left[0].id, gsb.id);
  assert.equal(left[0].is_default, true, 'ลบใบที่ใช้อยู่แล้วไม่มีใบไหนขึ้นแทน');
  assert.ok(await defaultQrUrl('u1', db), 'ใบเสร็จไม่มี QR ทั้งที่ยังเหลืออีกใบ');

  // ไฟล์ของใบที่ลบก็ไปด้วย
  assert.equal(db._files.size, 1);

  // ลบใบสุดท้ายก็ไม่พัง แค่ไม่เหลืออะไร
  await deleteShopQr('u1', gsb.id, db);
  assert.deepEqual(await listShopQrs('u1', db), []);
  assert.equal(await defaultQrUrl('u1', db), null);
  assert.equal(await deleteShopQr('u1', gsb.id, db), null, 'ลบใบที่ไม่มีแล้วต้องไม่ระเบิด');
});

test('ยังไม่เคยเก็บ QR ก็ไม่พัง และข้อมูลร้านเป็นคนละเรื่องกัน', async () => {
  const db = fresh();
  assert.deepEqual(await listShopQrs('u1', db), []);
  assert.equal(await defaultQrUrl('u1', db), null);
  assert.equal(await shopQrUrl(null, db), null);
  // ไฟล์หายจากที่เก็บ ต้องคืน null ไม่ใช่โยน error ขึ้นไปล้มทั้งใบเสร็จ
  assert.equal(await shopQrUrl({ path: 'u1/shop/หาย.png' }, db), null);

  const qr = await addShopQr('u1', { buffer: PNG, fileType: 'image/png' }, db);
  await saveShopProfile('u1', { shop_name: 'นัฐภรณ์ การพิมพ์' }, db);
  assert.equal((await getShopProfile('u1', db)).shop_name, 'นัฐภรณ์ การพิมพ์');
  assert.equal((await listShopQrs('u1', db))[0].id, qr.id, 'ตั้งค่าข้อมูลร้านแล้ว QR หาย');
});

test('การ์ดเลือก QR โชว์ทุกใบ พร้อมทางเลือกครบ', async () => {
  const db = fresh();
  const { kbank, gsb } = await twoQrs(db);
  const list = await listShopQrs('u1', db);
  const urls = new Map(await Promise.all(list.map(async (q) => [q.id, await shopQrUrl(q, db)])));

  const flex = qrPickerFlex(list, urls);
  const json = JSON.stringify(flex);

  assert.equal(flex.contents.type, 'carousel');
  assert.equal(flex.contents.contents.length, 2, 'การ์ดไม่ได้โชว์ครบทุกใบ');
  assert.ok(json.includes('กสิกร') && json.includes('ออมสิน'));

  // ทั้งใบต้องเห็น ตัดขอบทิ้งแม้นิดเดียวก็อาจกินมุมของรหัสไป
  assert.ok(!json.includes('"aspectMode":"cover"'), 'รูป QR ถูกตัดขอบ');
  assert.ok(json.includes('"aspectMode":"fit"'));

  // ส่งได้ทุกใบ · ตั้งเป็นใบหลักได้เฉพาะใบที่ยังไม่ใช่ · ลบได้ทุกใบ
  assert.ok(json.includes(`action=qr_send&id=${kbank.id}`));
  assert.ok(json.includes(`action=qr_send&id=${gsb.id}`));
  assert.ok(json.includes(`action=qr_default&id=${gsb.id}`), 'เลือกใบที่ยังไม่ได้ใช้ไม่ได้');
  assert.ok(!json.includes(`action=qr_default&id=${kbank.id}`), 'ใบที่ใช้อยู่ยังมีปุ่มให้เลือกซ้ำ');
  assert.ok(json.includes(`action=qr_delete&id=${gsb.id}`));

  // รูปที่เซ็นลิงก์ไม่ได้ ไม่เอามาขึ้นการ์ดเป็นช่องว่าง
  assert.equal(qrPickerFlex(list, new Map()).contents.contents.length, 0);
});

const BILL = {
  bill_number: 'MJ-B-20260923-0001',
  total: 1584,
  paid_amount: 0,
  balance_due: 1584,
  payment_status: 'pending',
  created_at: '2026-09-23T03:00:00Z',
  jobs: [{ id: 'j1', job_name: 'ป้ายไวนิล', job_date: '2026-09-23', total: 1584, items: [] }],
};

test('ใบที่ยังค้างจ่ายมี QR ใบที่เลือกไว้ ใบที่จ่ายครบแล้วไม่มี', () => {
  const qrUrl = 'https://files.example/u1/shop/qr-1.png';

  const due = renderReceiptHtml(BILL, {}, { qrUrl });
  assert.match(due, /สแกนจ่ายได้เลยค่ะ/);
  assert.ok(due.includes(qrUrl));
  assert.match(due, /ยอดที่ต้องโอน ฿1,584/);

  const paid = renderReceiptHtml({ ...BILL, paid_amount: 1584, balance_due: 0, payment_status: 'paid' }, {}, { qrUrl });
  assert.ok(!paid.includes(qrUrl), 'ใบที่จ่ายครบแล้วยังโชว์ QR');

  // ร้านที่ยังไม่เคยเก็บ QR ใบเสร็จออกมาเหมือนเดิมทุกอย่าง
  assert.ok(!/สแกนจ่ายได้เลย/.test(renderReceiptHtml(BILL, {}, {})));
});

test('คำสั่งและปุ่มต่อสายถึงจริง', () => {
  for (const word of ['QR', 'qr', 'คิวอาร์', 'สแกนจ่าย', 'พร้อมเพย์']) {
    assert.equal(resolveMenuCommand(word), 'shop_qr', word);
  }
  for (const word of ['เพิ่ม qr', 'เปลี่ยน qr', 'เพิ่มคิวอาร์']) {
    assert.equal(resolveMenuCommand(word), 'add_shop_qr', word);
  }
  assert.notEqual(resolveMenuCommand('ทำป้าย QR ร้านกาแฟ 1 ป้าย 500'), 'shop_qr');

  const postback = readFileSync(new URL('../src/handlers/postbackHandler.js', import.meta.url), 'utf8');
  for (const action of ['shop_qr', 'add_shop_qr', 'qr_send', 'qr_default', 'qr_delete']) {
    assert.match(postback, new RegExp(`case '${action}':`), action);
  }
});

test('รูป QR ไม่ถูกเอาไปอ่านเป็นใบสั่งงาน และชื่อที่ตอบกลับไม่กลายเป็นงาน', () => {
  const img = readFileSync(new URL('../src/handlers/imageHandler.js', import.meta.url), 'utf8');
  const qrAt = img.indexOf('STATES.WAITING_FOR_QR');
  const readAt = img.indexOf('await readImage(');
  const draftAt = img.indexOf('if (drafting)');
  assert.ok(qrAt > -1 && qrAt < readAt, 'QR ถูกส่งไปให้ตัวอ่านรูปก่อน');
  assert.ok(qrAt < draftAt, 'QR ถูกแนบเข้ากับร่างงานที่ค้างอยู่');
  assert.match(img.slice(qrAt, readAt), /application\/pdf/, 'PDF ยังถูกรับเป็น QR');

  // ตอบชื่อธนาคารสั้น ๆ ("กสิกร") ต้องไม่ถูกอ่านเป็นการจดงาน
  const msg = readFileSync(new URL('../src/handlers/messageHandler.js', import.meta.url), 'utf8');
  const labelAt = msg.indexOf('STATES.WAITING_FOR_QR_LABEL');
  const dumpAt = msg.indexOf('looksLikeDump(text)');
  assert.ok(labelAt > -1, 'ไม่ได้รับคำตอบชื่อ QR');
  assert.ok(labelAt < dumpAt, 'คำตอบชื่อ QR ถูกอ่านเป็นการจดงานก่อน');
  assert.match(msg.slice(labelAt, dumpAt), /ข้าม/, 'ไม่มีทางข้ามการตั้งชื่อ');
});
