import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createMockSupabase } from './helpers/mockSupabase.js';

process.env.SUPABASE_URL ||= 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-key';
process.env.LINE_CHANNEL_ACCESS_TOKEN ||= 'test-token';
process.env.LINE_CHANNEL_SECRET ||= 'test-secret';

const { createJob, getFrequentItems } = await import('../src/services/jobService.js');

/* ร้านถาม "ทำให้เป็นระบบ pos ได้ไหม" — หน้าขายหน้าร้าน /app/pos/:
 * เมนูของที่ขายบ่อย (จากบรรทัดงานจริง ไม่มีตารางสินค้าแยก) → ตะกร้า →
 * เงินสดคิดทอน / โอนโชว์ QR → บันทึกผ่าน POST /jobs เส้นเดิม (จ่ายครบ+ช่องทาง
 * = รายรับวันนี้ของใบลงบัญชี และบิลพร้อมลิงก์ใบเสร็จทันที) */

const html = readFileSync(new URL('../public/liff/pos/index.html', import.meta.url), 'utf8');
const api = readFileSync(new URL('../src/routes/api.js', import.meta.url), 'utf8');

const draft = (name, price, qty = 1) => ({
  jobName: name,
  items: [{ item_name: name, quantity: qty, unit_price: price, total: price * qty }],
  subtotal: price * qty,
  total: price * qty,
});

test('เมนูขายบ่อย: นับจากบรรทัดงานจริง ชื่อ+ราคาเดียวกันเป็นปุ่มเดียว เรียงจากบ่อย', async () => {
  const db = createMockSupabase();
  await createJob('userA', draft('ถ่ายเอกสาร', 1), db);
  await createJob('userA', draft('ถ่ายเอกสาร', 1), db);
  await createJob('userA', draft('ถ่ายเอกสาร', 1), db);
  await createJob('userA', draft('อัดรูป 4x6', 20), db);
  await createJob('userA', draft('อัดรูป 4x6', 20), db);
  await createJob('userA', draft('กรอบรูป A4', 250), db);
  // ราคา 0 (ยังไม่ตั้งราคา) ไม่ควรเป็นปุ่มขาย
  await createJob('userA', draft('งานออกแบบ', 0), db);

  const items = await getFrequentItems('userA', 12, db);
  assert.deepEqual(items.map((i) => i.name), ['ถ่ายเอกสาร', 'อัดรูป 4x6', 'กรอบรูป A4']);
  assert.equal(items[0].count, 3);
  assert.equal(items[1].price, 20);
  assert.ok(!items.some((i) => i.price <= 0), 'ของไม่มีราคาห้ามขึ้นเมนู');
});

test('มีเส้น API ของ POS: เมนูขายบ่อย กับ QR รับเงินของร้าน', () => {
  assert.match(api, /router\.get\('\/pos\/items'/);
  assert.match(api, /getFrequentItems\(req\.profile\.id\)/);
  assert.match(api, /router\.get\('\/shop\/qr'/);
  assert.match(api, /defaultQrUrl\(req\.profile\.id\)/);
});

test('หน้าขาย: คิดเงินทอนก่อนบันทึก และกันรับเงินน้อยกว่ายอด', () => {
  assert.match(html, /const change = received - total;/);
  assert.match(html, /received < total/);
  assert.match(html, /รับเงินมาน้อยกว่ายอดค่ะ/);
  // ปุ่มแบงก์ที่ลูกค้าชอบยื่น
  assert.match(html, /\[total, 100, 500, 1000\]/);
});

test('หน้าขาย: บันทึกผ่าน POST /jobs เส้นเดิม จ่ายครบพร้อมช่องทาง และเปิดใบเสร็จจากลิงก์ที่ได้ทันที', () => {
  assert.match(html, /jobName: 'ขายหน้าร้าน'/);
  assert.match(html, /paidAmount: total/);
  assert.match(html, /payMethod,/);
  assert.match(html, /doneReceipt = body\.receipt \|\| null/);
  assert.match(html, /doneReceipt\.shopUrl \|\| doneReceipt\.url/);
  // โอน = โชว์ QR ของร้านให้ลูกค้าสแกนตรงเคาน์เตอร์
  assert.match(html, /api\('\/shop\/qr'\)/);
  assert.match(html, /เพิ่ม QR/);
});

test('หน้าขาย: หน้าตาเดียวกับทั้งแอป — คอลัมน์มือถือ 430 และเหลี่ยม', () => {
  assert.match(html, /max-width: 430px/);
  assert.ok(!/border-radius:\s*(?!0|50%)[^;}]/.test(html.replace(/border-radius: 50%/g, '')), 'ห้ามมีขอบมน');
});
