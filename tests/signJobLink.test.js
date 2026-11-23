// ม่วงจด ↔ แอปจำลองป้าย: ปุ่ม "ทำภาพ 3 มิติ" บนงาน → ตั๋วของงานนั้นงานเดียว → แอปเติมชื่อลูกค้า/ขนาด/รูปให้เอง
// → "บันทึกภาพเข้างาน" แนบภาพจำลอง + ลิงก์ 3 มิติกลับเข้างานเดิม
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { readFileSync } from 'node:fs';
import { createApiRouter } from '../src/routes/api.js';
import { createSignJobRouter, decodeImage } from '../src/routes/signJob.js';
import { mintTicket, readTicket, sizeFromJob, jobForMockup, isShareLink, noteWithLink, LINK_LINE } from '../src/utils/mockupTicket.js';
import { storagePathOf } from '../src/services/attachmentService.js';

const KEY = 'test-ticket-secret';
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
// JPEG เล็ก ๆ ที่หัวไฟล์ถูก (FF D8) พอให้ตรวจชนิด
const JPEG = 'data:image/jpeg;base64,' + Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 7)]).toString('base64');

test('ตั๋ว: อ่านกลับได้ · แก้ข้อมูล/ลายเซ็น/กุญแจผิด = ใช้ไม่ได้ · หมดอายุใน 3 วัน', () => {
  const now = Date.UTC(2026, 10, 23);
  const t = mintTicket('user-1', 'job-1', { key: KEY, now });
  assert.deepEqual(readTicket(t, { key: KEY, now }), { userId: 'user-1', jobId: 'job-1', expires: now + 3 * 86400000 });
  assert.equal(readTicket(t, { key: 'other', now }), null);
  assert.equal(readTicket(t.slice(0, -1) + (t.endsWith('A') ? 'B' : 'A'), { key: KEY, now }), null);
  // เปลี่ยนงานในตั๋วเอง (ขอดูงานคนอื่น) ลายเซ็นไม่ตรง
  const [, sig] = t.split('.');
  const forged = Buffer.from(JSON.stringify({ u: 'user-1', j: 'job-2', e: now / 1000 + 86400 })).toString('base64url') + '.' + sig;
  assert.equal(readTicket(forged, { key: KEY, now }), null);
  assert.deepEqual(readTicket(t, { key: KEY, now: now + 3 * 86400000 + 1000 }), { expired: true });
  for (const bad of ['', 'abc', 'a.b', null, 'x'.repeat(500)]) assert.equal(readTicket(bad, { key: KEY, now }), null);
  assert.equal(mintTicket('user-1', 'job-1', { key: '' }), null); // ไม่มีกุญแจ ไม่ออกตั๋ว
});

test('ขนาดป้ายจากงาน: รายการก่อน · ซม./ม./นิ้ว · ไม่ใส่หน่วยเดาแบบร้านป้าย · ไม่เจอ = null', () => {
  assert.deepEqual(sizeFromJob({ job_name: 'ไวนิลหน้าร้าน', items: [{ item_name: 'ไวนิล 160*300' }] }), { w: 160, h: 300 });
  assert.deepEqual(sizeFromJob({ job_name: 'ป้าย 1.2x2.4 ม.' }), { w: 120, h: 240 });
  assert.deepEqual(sizeFromJob({ job_name: 'สติ๊กเกอร์', items: [{ item_name: 'สติ๊กเกอร์', size: '5x5 นิ้ว' }] }), { w: 12.7, h: 12.7 });
  assert.deepEqual(sizeFromJob({ job_name: 'โฟมบอร์ด', note: 'ขนาด 60 x 90 cm' }), { w: 60, h: 90 });
  assert.equal(sizeFromJob({ job_name: 'นามบัตร 2 กล่อง' }), null);
});

test('ข้อมูลที่ส่งให้แอป: เฉพาะที่ใช้ทำภาพ (ไม่มียอดค้าง/การจ่าย) · รูปส่งเป็นรหัสให้โหลดผ่านเซิร์ฟเวอร์', () => {
  const j = jobForMockup(
    { id: 'job-1', job_number: 'J-0123', job_name: 'ไวนิล 300x100', customer_name: 'ร้านกาแฟ', total: '450', balance_due: 450, paid_amount: 0, customer_phone: '0812345678', items: [{ item_name: 'ไวนิล 300x100', quantity: 2 }] },
    [{ id: 'a-1', file_url: 'https://secret-signed-url' }]
  );
  assert.deepEqual(j, { id: 'job-1', number: 'J-0123', name: 'ไวนิล 300x100', customer: 'ร้านกาแฟ', total: 450, items: [{ name: 'ไวนิล 300x100', size: '', qty: 2 }], size: { w: 300, h: 100 }, images: [{ id: 'a-1' }] });
});

test('ลิงก์ 3 มิติลงหมายเหตุ: เฉพาะลิงก์ของร้าน · บันทึกซ้ำแทนบรรทัดเดิม · ยาวเกิน 500 ไม่แตะ', () => {
  const a = 'https://shop.example.com/sign/v/AAAAAAAAAA';
  const b = 'https://shop.example.com/sign/v/BBBBBBBBBB';
  assert.ok(isShareLink(a));
  for (const bad of ['https://evil.example.com/x', 'javascript:alert(1)', a + '/../x', '']) assert.ok(!isShareLink(bad), bad);
  const n1 = noteWithLink('ส่งวันจันทร์', a);
  assert.equal(n1, 'ส่งวันจันทร์\n' + LINK_LINE + a);
  assert.equal(noteWithLink(n1, b), 'ส่งวันจันทร์\n' + LINK_LINE + b);
  assert.equal(noteWithLink(n1, a), null); // ลิงก์เดิมอยู่แล้ว
  assert.equal(noteWithLink('', a), LINK_LINE + a);
  assert.equal(noteWithLink('x'.repeat(480), a), null);
  assert.equal(noteWithLink('ok', 'https://evil.example.com/sign/v/../x'), null);
});

test('รูปที่ส่งมาบันทึก: JPEG/PNG จริงเท่านั้น (ดูหัวไฟล์) ไม่เกิน 5 MB', () => {
  assert.equal(decodeImage(JPEG).fileType, 'image/jpeg');
  assert.equal(decodeImage('data:image/png;base64,' + Buffer.alloc(300, 1).toString('base64')).error, 'bad_image'); // บอกว่า PNG แต่หัวไฟล์ไม่ใช่
  assert.equal(decodeImage('data:image/svg+xml;base64,PHN2Zz4=').error, 'bad_image');
  assert.equal(decodeImage('data:image/jpeg;base64,' + Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.alloc(5.2 * 1024 * 1024)]).toString('base64')).error, 'too_large');
  assert.equal(storagePathOf('https://x.supabase.co/storage/v1/object/sign/job-evidence/u-1/j-1/abc-def.jpg?token=t'), 'u-1/j-1/abc-def.jpg');
  assert.equal(storagePathOf('https://x.supabase.co/storage/v1/object/sign/other-bucket/u/j/a.jpg?t'), null);
});

async function serveSignJob(over = {}) {
  const now = Date.now();
  const job = { id: 'job-1', job_number: 'J-0123', job_name: 'ไวนิล 300x100', customer_name: 'ร้านกาแฟ', total: 450, note: 'ส่งวันจันทร์', status: 'active', items: [] };
  const calls = { attach: [], notes: [] };
  const app = express();
  app.use(
    '/sign/api/job',
    createSignJobRouter({
      readTicket: (t) => readTicket(t, { key: KEY }),
      getJobById: async (u, j) => (u === 'user-1' && j === 'job-1' ? job : null),
      listJobImages: async () => [{ id: '11111111-2222-3333-4444-555555555555' }],
      readJobImage: async (j, id) => (id === '11111111-2222-3333-4444-555555555555' ? { buffer: Buffer.from([0xff, 0xd8, 1]), fileType: 'image/jpeg' } : null),
      saveAttachment: async (u, j, f) => calls.attach.push({ u, job: j.id, type: f.fileType, messageId: f.messageId }),
      updateJob: async (u, j, patch) => calls.notes.push({ u, j, note: patch.note }),
      allow: () => true,
      ...over,
    })
  );
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}/sign/api/job/`;
  return { base, calls, job, now, close: () => new Promise((r) => server.close(r)) };
}

test('/sign/api/job: ตั๋วถูก → งาน + รูป · ตั๋วปลอม 403 · หมดอายุ 410 · งานคนอื่น/ยกเลิก 404', async () => {
  const s = await serveSignJob();
  try {
    const t = mintTicket('user-1', 'job-1', { key: KEY });
    const r = await fetch(s.base + t);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('cache-control'), 'no-store');
    const body = await r.json();
    assert.equal(body.job.customer, 'ร้านกาแฟ');
    assert.deepEqual(body.job.size, { w: 300, h: 100 });
    assert.equal(body.job.images.length, 1);
    const img = await fetch(s.base + t + '/image/11111111-2222-3333-4444-555555555555');
    assert.equal(img.status, 200);
    assert.equal(img.headers.get('content-type'), 'image/jpeg');
    assert.equal((await fetch(s.base + t + '/image/99999999-2222-3333-4444-555555555555')).status, 404);
    assert.equal((await fetch(s.base + t + '/image/..%2F..%2Fetc')).status, 404);
    assert.equal((await fetch(s.base + t.slice(0, -2) + 'zz')).status, 403);
    assert.equal((await fetch(s.base + mintTicket('user-1', 'job-1', { key: KEY, now: Date.now() - 4 * 86400000 }))).status, 410);
    assert.equal((await fetch(s.base + mintTicket('user-2', 'job-1', { key: KEY }))).status, 404);
    s.job.status = 'cancelled';
    assert.equal((await fetch(s.base + t)).status, 404);
  } finally {
    await s.close();
  }
});

test('/sign/api/job/:t/mockup: แนบภาพเข้างานของเจ้าของตั๋ว + ลิงก์ 3 มิติลงหมายเหตุ · รูปเสีย 400 · ลิงก์แปลกไม่ลงหมายเหตุ', async () => {
  const s = await serveSignJob();
  try {
    const t = mintTicket('user-1', 'job-1', { key: KEY });
    const post = (body) => fetch(s.base + t + '/mockup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    let r = await post({ image: JPEG, link: 'https://shop.example.com/sign/v/AAAAAAAAAA' });
    assert.equal(r.status, 201);
    assert.deepEqual(await r.json(), { ok: true, number: 'J-0123', linked: true });
    assert.deepEqual(s.calls.attach, [{ u: 'user-1', job: 'job-1', type: 'image/jpeg', messageId: null }]);
    assert.deepEqual(s.calls.notes, [{ u: 'user-1', j: 'job-1', note: 'ส่งวันจันทร์\n' + LINK_LINE + 'https://shop.example.com/sign/v/AAAAAAAAAA' }]);
    r = await post({ image: JPEG, link: 'https://evil.example.com/phish' });
    assert.equal(r.status, 201);
    assert.equal((await r.json()).linked, false);
    assert.equal(s.calls.notes.length, 1);
    r = await post({ image: 'data:text/html;base64,PGgxPg==' });
    assert.equal(r.status, 400);
    assert.equal(s.calls.attach.length, 2);
  } finally {
    await s.close();
  }
  // บันทึกถี่เกิน
  const s2 = await serveSignJob({ allow: () => false });
  try {
    const t = mintTicket('user-1', 'job-1', { key: KEY });
    const r = await fetch(s2.base + t + '/mockup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ image: JPEG }) });
    assert.equal(r.status, 429);
  } finally {
    await s2.close();
  }
});

test('/api/jobs/:id/mockup: ร้านที่ล็อกอินได้ลิงก์ /sign/?job=ตั๋ว ของงานตัวเองเท่านั้น', async () => {
  process.env.MOCKUP_TICKET_SECRET = KEY;
  process.env.LIFF_ID ||= '1234567890-abcdefgh';
  const app = express();
  app.use(
    '/api',
    createApiRouter({
      verify: async (tok) => (tok ? { userId: 'U-line' } : null),
      resolveProfile: async () => ({ id: 'user-1', line_user_id: 'U-line' }),
      getJobById: async (u, id) => (u === 'user-1' && id === 'job-1' ? { id: 'job-1' } : null),
    })
  );
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}/api/jobs/`;
  try {
    const r = await fetch(base + 'job-1/mockup', { method: 'POST', headers: { Authorization: 'Bearer t' } });
    assert.equal(r.status, 200);
    const { url } = await r.json();
    assert.match(url, /^\/sign\/\?job=[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{32}$/);
    assert.deepEqual(readTicket(url.slice('/sign/?job='.length), { key: KEY }).jobId, 'job-1');
    assert.equal((await fetch(base + 'job-2/mockup', { method: 'POST', headers: { Authorization: 'Bearer t' } })).status, 404);
    assert.equal((await fetch(base + 'job-1/mockup', { method: 'POST' })).status, 401);
  } finally {
    delete process.env.MOCKUP_TICKET_SECRET;
    await new Promise((r) => server.close(r));
  }
});

test('หน้าเว็บ: ปุ่มทำภาพ 3 มิติในม่วงจด (แผ่นปุ่มงาน + หน้าแก้ไข) · แถบงานในแอปจำลองป้าย · เส้นทางเซิร์ฟเวอร์', () => {
  const liff = read('public/liff/index.html');
  assert.match(liff, /id="hs-mockup">🪧 ทำภาพ 3 มิติ/);
  assert.match(liff, /id="e-mockup">🪧 ทำภาพ 3 มิติ/);
  assert.match(liff, /api\('\/jobs\/' \+ jobId \+ '\/mockup', \{ method: 'POST' \}\)/);
  const html = read('sign-mockup/index.html');
  for (const id of ['jobBar', 'jbTitle', 'jbSub', 'jbImgs', 'jbSave', 'jbStatus', 'jbClose']) assert.match(html, new RegExp('id="' + id + '"'), id);
  const app = read('sign-mockup/app.js');
  assert.match(app, /startJobLink\(\); \/\/ เปิดจากงานในม่วงจด/); // หลังโหลดงานที่ค้างไว้เสร็จ ไม่โดนทับ
  assert.match(app, /if \(last === j\.id\) return; \/\/ งานเดิม: ทำต่อจากที่ค้างไว้/);
  assert.match(app, /fetch\('api\/job\/' \+ jobLink\.ticket \+ '\/mockup'/);
  const server = read('src/server.js');
  assert.ok(server.indexOf("app.use('/sign/api/job', signJobRouter)") < server.indexOf("app.use('/sign', signShareRouter)"));
});
