// ลิงก์ดูป้าย 3 มิติ (แอปจำลองป้าย) — ร้านกดสร้างลิงก์ ส่งให้ลูกค้าเปิดหมุนดูในมือถือ
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createSignShareRouter, viewerHtml, deployedApp } from '../src/routes/signShare.js';
import { isGlb, isJpeg, cleanMeta, fromBase64, parseShareRequest, rateLimiter, isShareId, newShareId } from '../src/utils/signShare.js';

// GLB เล็กที่สุดที่ถูกต้อง: หัวไฟล์ 12 ไบต์ + ก้อน JSON
function tinyGlb() {
  let json = Buffer.from('{"asset":{"version":"2.0"}}');
  const pad = (4 - (json.length % 4)) % 4;
  json = Buffer.concat([json, Buffer.alloc(pad, 0x20)]);
  const total = 12 + 8 + json.length;
  const b = Buffer.alloc(total);
  b.writeUInt32LE(0x46546c67, 0);
  b.writeUInt32LE(2, 4);
  b.writeUInt32LE(total, 8);
  b.writeUInt32LE(json.length, 12);
  b.writeUInt32LE(0x4e4f534a, 16);
  json.copy(b, 20);
  return b;
}
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9]);

test('ตรวจไฟล์: รับเฉพาะ GLB หัวไฟล์ถูก + JPEG · ข้อความตัดแท็ก · base64 แปลก ๆ ไม่รับ', () => {
  const g = tinyGlb();
  assert.equal(isGlb(g), true);
  const bad = Buffer.from(g);
  bad.writeUInt32LE(g.length + 4, 8); // ความยาวในหัวไฟล์ไม่ตรง
  assert.equal(isGlb(bad), false);
  assert.equal(isGlb(Buffer.from('<html>hello world, not a model!!</html>')), false);
  assert.equal(isJpeg(JPEG), true);
  assert.equal(isJpeg(Buffer.from('GIF89a....')), false);
  const m = cleanMeta({ title: '<script>alert(1)</script>ไวนิล', size: '80 × 120 ซม.', w: '80', h: -5, customer: 'a'.repeat(200) });
  assert.ok(!/[<>]/.test(m.title));
  assert.equal(m.w, 80);
  assert.equal(m.h, 0);
  assert.equal(m.customer.length, 60);
  assert.equal(fromBase64('not base64 !!', 100), null);
  assert.deepEqual([...fromBase64('data:model/gltf-binary;base64,' + g.toString('base64'), 1e6)], [...g]);
  assert.equal(parseShareRequest({}).error, 'bad_model');
  assert.equal(parseShareRequest({ glb: Buffer.from('hello').toString('base64') }).error, 'bad_model');
  assert.equal(parseShareRequest({ glb: g.toString('base64'), poster: Buffer.from('nope').toString('base64') }).error, 'bad_poster');
  const ok = parseShareRequest({ glb: g.toString('base64'), poster: JPEG.toString('base64'), meta: { title: 'ป้าย' } });
  assert.equal(ok.error, undefined);
  assert.equal(ok.glb.length, g.length);
  assert.ok(isShareId(newShareId()));
  assert.equal(isShareId('../../etc'), false);
});

test('จำกัดการสร้างลิงก์ต่อเครื่องต่อชั่วโมง (กันยิงไฟล์ใส่จนพื้นที่เต็ม)', () => {
  let t = 0;
  const allow = rateLimiter({ perHour: 2, perDay: 3, now: () => t });
  assert.equal(allow('a'), true);
  assert.equal(allow('a'), true);
  assert.equal(allow('a'), false);
  assert.equal(allow('b'), true);
  assert.equal(allow('c'), false); // ครบโควตาทั้งวัน
  t += 86400001;
  assert.equal(allow('a'), true);
});

async function serve(opts = {}) {
  const files = new Map();
  const store = {
    async put(path, buf) {
      files.set(path, Buffer.from(buf));
    },
    async get(path) {
      return files.get(path) || null;
    },
  };
  const app = express();
  app.use('/sign', createSignShareRouter({ store, ...opts }));
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, files, close: () => server.close() };
}

test('สร้างลิงก์ → เปิดหน้าดู 3 มิติ → โหลดไฟล์ .glb และรูปตัวอย่าง (LINE โชว์รูปตอนแปะลิงก์)', async () => {
  process.env.PUBLIC_BASE_URL = 'https://shop.example.com';
  const s = await serve();
  try {
    const g = tinyGlb();
    const res = await fetch(`${s.base}/sign/api/share`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        glb: g.toString('base64'),
        poster: JPEG.toString('base64'),
        meta: { title: 'ป้ายขาตั้ง"><img src=x>', size: '80 × 120 ซม.', customer: 'โรงเรียนบ้านนา', shop: 'นัดพอน', phone: '081-234-5678' },
      }),
    });
    assert.equal(res.status, 201);
    const j = await res.json();
    assert.ok(isShareId(j.id));
    assert.equal(j.url, `https://shop.example.com/sign/v/${j.id}`);
    assert.ok(s.files.has(`${j.id}/model.glb`) && s.files.has(`${j.id}/poster.jpg`) && s.files.has(`${j.id}/meta.json`));

    const page = await fetch(`${s.base}/sign/v/${j.id}`);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, new RegExp(`og:image" content="https://shop.example.com/sign/v/${j.id}/poster.jpg"`));
    assert.match(html, /โรงเรียนบ้านนา/);
    assert.match(html, /href="tel:0812345678"/);
    assert.ok(!html.includes('<img src=x>'), 'ข้อความจากผู้ใช้ต้องไม่กลายเป็นแท็ก');
    assert.match(html, /\/sign\/viewer3d\.js/);

    const model = await fetch(`${s.base}/sign/v/${j.id}/model.glb`);
    assert.equal(model.status, 200);
    assert.equal(model.headers.get('content-type'), 'model/gltf-binary');
    assert.deepEqual([...Buffer.from(await model.arrayBuffer())], [...g]);
    const dl = await fetch(`${s.base}/sign/v/${j.id}/model.glb?dl=1`);
    assert.match(dl.headers.get('content-disposition') || '', /attachment/);
    const poster = await fetch(`${s.base}/sign/v/${j.id}/poster.jpg`);
    assert.equal(poster.headers.get('content-type'), 'image/jpeg');

    // ลิงก์ผิด / ไม่มี
    assert.equal((await fetch(`${s.base}/sign/v/zzzzzzzzzz`)).status, 404);
    assert.equal((await fetch(`${s.base}/sign/v/..%2F..%2Fx/model.glb`)).status, 404);
  } finally {
    s.close();
    delete process.env.PUBLIC_BASE_URL;
  }
});

test('ไฟล์ผิด → 400 ข้อความไทย · ครบโควตา → 429 · ลิงก์หมดอายุ → 410', async () => {
  let t = Date.UTC(2026, 10, 5);
  const s = await serve({ now: () => t, allow: rateLimiter({ perHour: 2, perDay: 100, now: () => t }) });
  try {
    const post = (body) => fetch(`${s.base}/sign/api/share`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const bad = await post({ glb: Buffer.from('not a model').toString('base64') });
    assert.equal(bad.status, 400);
    assert.match((await bad.json()).message, /ไฟล์ 3 มิติ/);
    const okRes = await post({ glb: tinyGlb().toString('base64') });
    assert.equal(okRes.status, 201);
    const { id } = await okRes.json();
    assert.equal((await post({ glb: tinyGlb().toString('base64') })).status, 429);
    const broken = await fetch(`${s.base}/sign/api/share`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{oops' });
    assert.equal(broken.status, 400);
    t += 366 * 86400000;
    const old = await fetch(`${s.base}/sign/v/${id}`);
    assert.equal(old.status, 410);
    assert.match(await old.text(), /หมดอายุ/);
  } finally {
    s.close();
  }
});

test('หน้าดู 3 มิติ: ข้อมูลส่งให้สคริปต์ปิด </script> ไม่ได้', () => {
  const html = viewerHtml('AbCdEfGhIj', { poster: false, meta: { title: '</script><script>alert(1)</script>', size: '' } }, 'https://x');
  const data = html.slice(html.indexOf('id="data">'), html.indexOf('</script>', html.indexOf('id="data">')));
  assert.ok(!data.includes('</script'));
  assert.ok(!html.includes('og:image'));
});

test('แอปจำลองป้าย: มีตัวดู 3 มิติ + ตัวโหลด GLB ในเครื่อง และ service worker ไม่เก็บลิงก์ลูกค้า', async () => {
  const { readFileSync, existsSync } = await import('node:fs');
  for (const f of ['viewer3d.js', 'viewer3d.css', 'vendor/addons/loaders/GLTFLoader.js', 'vendor/addons/utils/BufferGeometryUtils.js']) {
    assert.ok(existsSync(new URL('../sign-mockup/' + f, import.meta.url)), f);
  }
  const sw = readFileSync(new URL('../sign-mockup/sw.js', import.meta.url), 'utf8');
  assert.match(sw, /sign\\\/\(v\|api\)/);
  const server = readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
  assert.ok(server.indexOf("app.use('/sign', signShareRouter)") > 0);
});

test('ที่เก็บไฟล์จริง: สร้าง bucket "sign-share" ให้เองครั้งแรก (รับ .glb/.jpg/.json) แล้วไม่สร้างซ้ำ', async () => {
  const calls = [];
  let exists = false;
  const files = new Map();
  const client = {
    storage: {
      async getBucket(name) {
        calls.push(['get', name]);
        return exists ? { data: { id: name }, error: null } : { data: null, error: { message: 'Bucket not found' } };
      },
      async createBucket(name, opts) {
        calls.push(['create', name, opts]);
        exists = true;
        return { data: { name }, error: null };
      },
      from(name) {
        return {
          async upload(path, buf, o) {
            calls.push(['upload', name, path, o.contentType]);
            files.set(path, buf);
            return { error: null };
          },
          async download(path) {
            const b = files.get(path);
            return b ? { data: new Blob([b]), error: null } : { data: null, error: { message: 'not found' } };
          },
        };
      },
    },
  };
  const { supabaseStore } = await import('../src/routes/signShare.js');
  const store = supabaseStore(client);
  await store.put('AbCdEfGhIj/model.glb', tinyGlb(), 'model/gltf-binary');
  await store.put('AbCdEfGhIj/meta.json', Buffer.from('{}'), 'application/json');
  const created = calls.filter((c) => c[0] === 'create');
  assert.equal(created.length, 1);
  assert.equal(created[0][1], 'sign-share');
  assert.equal(created[0][2].public, false);
  assert.deepEqual(created[0][2].allowedMimeTypes, ['model/gltf-binary', 'image/jpeg', 'application/json']);
  assert.equal(calls.filter((c) => c[0] === 'get').length, 1, 'ตรวจ bucket ครั้งเดียว');
  assert.deepEqual(calls.filter((c) => c[0] === 'upload').map((c) => c[1]), ['sign-share', 'sign-share']);
  assert.deepEqual([...(await store.get('AbCdEfGhIj/model.glb'))], [...tinyGlb()]);
  assert.equal(await store.get('AbCdEfGhIj/nope.jpg'), null);

  const { readFileSync } = await import('node:fs');
  const sql = readFileSync(new URL('../supabase/migrations/023_sign_share_bucket.sql', import.meta.url), 'utf8');
  assert.match(sql, /'sign-share'/);
  assert.match(sql, /model\/gltf-binary/);
});

test('ตัวดู 3 มิติรวมไฟล์เดียว (ไฟล์ HTML พรีวิว) สร้างจาก viewer3d-core.js รุ่นปัจจุบัน และเก็บไว้ใช้ออฟไลน์', async () => {
  const { readFileSync } = await import('node:fs');
  const { createHash } = await import('node:crypto');
  const core = readFileSync(new URL('../sign-mockup/viewer3d-core.js', import.meta.url));
  const hash = createHash('sha256').update(core).digest('hex').slice(0, 16);
  const bundle = readFileSync(new URL('../sign-mockup/vendor/viewer3d.standalone.js', import.meta.url), 'utf8');
  assert.ok(bundle.startsWith('/* NTP viewer3d standalone · viewer3d-core sha256:' + hash), 'แก้ viewer3d-core.js แล้วต้องรัน node sign-mockup/tools/build-viewer.mjs');
  assert.match(bundle, /window\.NTPViewer/);
  assert.match(bundle, /@license/); // ประกาศสิทธิ์ three.js (MIT) ติดไปด้วย
  assert.ok(!/^\s*import\s/m.test(bundle), 'ต้องเป็นสคริปต์ธรรมดา เปิดจากไฟล์ในเครื่องได้');
  const share = readFileSync(new URL('../sign-mockup/viewer3d.js', import.meta.url), 'utf8');
  assert.match(share, /from '\.\/viewer3d-core\.js'/);
  const sw = readFileSync(new URL('../sign-mockup/sw.js', import.meta.url), 'utf8');
  assert.match(sw, /'vendor\/viewer3d\.standalone\.js'/);
  assert.match(sw, /'viewer3d\.css'/);
  // หน้าลิงก์มีรูปสำรอง + ปุ่มบันทึกรูป
  const html = viewerHtml('AbCdEfGhIj', { poster: true, meta: { title: 'ป้าย' } }, 'https://x');
  assert.match(html, /id="poster"[^>]*hidden/);
  assert.match(html, /id="shot"/);
});

test('ปลุกเซิร์ฟเวอร์: GET /sign/api/ping ตอบทันที ไม่ให้จำ · แอปปลุกแล้วส่งใหม่เมื่อส่งไฟล์ไม่ถึง', async () => {
  const s = await serve({ now: () => 1234 });
  try {
    const r = await fetch(`${s.base}/sign/api/ping`);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await r.json(), { ok: true, at: 1234 });
  } finally {
    s.close();
  }
  const { readFileSync } = await import('node:fs');
  const app = readFileSync(new URL('../sign-mockup/app.js', import.meta.url), 'utf8');
  assert.match(app, /fetch\('api\/ping', \{ cache: 'no-store' \}\)/);
  assert.match(app, /return send\(\)\.catch\(function \(\) \{/);
  // service worker ไม่จับ /sign/api/ (ของสดเสมอ)
  const sw = readFileSync(new URL('../sign-mockup/sw.js', import.meta.url), 'utf8');
  assert.match(sw, /\/\\\/sign\\\/\(v\|api\)\\\//);
});

test('รูปตัวอย่างตอนแปะลิงก์ (Facebook/LINE): บอกขนาดรูป + ลิงก์หลัก + การ์ดรูปใหญ่ ให้ขึ้นรูปทันที ไม่เป็นการ์ดเทา', async () => {
  const { jpegSize } = await import('../src/utils/signShare.js');
  // หัว JPEG: SOI + APP0 + SOF0 (สูง 300 กว้าง 600)
  const head = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xc0, 0, 17, 8, 1, 0x2c, 2, 0x58, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
  assert.deepEqual(jpegSize(head), { w: 600, h: 300 });
  assert.equal(jpegSize(Buffer.from('nope')), null);
  const html = viewerHtml('abcdefghij', { poster: true, posterSize: { w: 1200, h: 750 }, meta: { title: 'บัตร', size: '6 × 11 ซม.' } }, 'https://shop.example.com');
  assert.match(html, /og:image" content="https:\/\/shop\.example\.com\/sign\/v\/abcdefghij\/poster\.jpg"/);
  assert.match(html, /og:image:width" content="1200"/);
  assert.match(html, /og:image:height" content="750"/);
  assert.match(html, /og:url" content="https:\/\/shop\.example\.com\/sign\/v\/abcdefghij"/);
  assert.match(html, /twitter:card" content="summary_large_image"/);
  // ลิงก์เก่าที่ไม่มีขนาดรูป ยังมีรูปตัวอย่าง (ไม่มีแท็กขนาด)
  const old = viewerHtml('abcdefghij', { poster: true, meta: {} }, 'https://shop.example.com');
  assert.match(old, /og:image"/);
  assert.ok(!/og:image:width/.test(old));
  // แอปใส่ป้าย "แตะเพื่อหมุนดู 3 มิติ" บนรูปตัวอย่าง
  const { readFileSync } = await import('node:fs');
  const app = readFileSync(new URL('../sign-mockup/app.js', import.meta.url), 'utf8');
  assert.match(app, /posterWithBadge\(mockupCanvas\(0\.75, false\)\)/);
});

test('คนเปิดดูลิงก์ + ลูกค้ากด "สนใจ": นับที่มา (Facebook/LINE) · ฟอร์มตรวจเบอร์ · แจ้งร้าน · ดูได้เฉพาะเครื่องที่ถือกุญแจ', async () => {
  const sent = [];
  let t = Date.UTC(2026, 10, 7, 5);
  const s = await serve({ now: () => t, flushMs: 5, notify: async (text) => (sent.push(text), true) });
  const post = (path, body, ip) =>
    fetch(`${s.base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ip || '1.1.1.1' }, body: JSON.stringify(body) });
  try {
    const c = await post('/sign/api/share', { glb: tinyGlb().toString('base64'), meta: { title: 'บัตรสมนาคุณ', size: '6 × 11 ซม.', shop: 'นัดพอน' } });
    const j = await c.json();
    assert.ok(j.key && j.key.length >= 20, 'ได้กุญแจเจ้าของ');
    const meta = JSON.parse(s.files.get(`${j.id}/meta.json`).toString());
    assert.equal(meta.ownerHash.length, 64);
    assert.ok(!JSON.stringify(meta).includes(j.key), 'เซิร์ฟเวอร์ไม่เก็บกุญแจตรง ๆ');

    // เปิดดู 3 ครั้ง: Facebook มือถือ, LINE, และคนเดิมรีเฟรชซ้ำใน 1 นาที (ไม่นับซ้ำ)
    assert.equal((await post(`/sign/v/${j.id}/seen`, { src: 'facebook', dev: 'mobile', first: true }, '2.2.2.2')).status, 204);
    await post(`/sign/v/${j.id}/seen`, { src: 'facebook', dev: 'mobile', first: false }, '2.2.2.2');
    await post(`/sign/v/${j.id}/seen`, { src: 'line', dev: 'desktop', first: true }, '3.3.3.3');
    await post(`/sign/v/${j.id}/seen`, { src: '<b>x', dev: 'tv' }, '4.4.4.4');
    await post('/sign/v/zzzzzzzzzz/seen', { src: 'line' }, '5.5.5.5'); // ลิงก์ที่ไม่มีจริง
    await new Promise((r) => setTimeout(r, 60));
    const st = JSON.parse(s.files.get(`${j.id}/stats.json`).toString());
    assert.equal(st.views, 3);
    assert.equal(st.visitors, 2);
    assert.deepEqual(st.src, { facebook: 1, line: 1, other: 1 });
    assert.deepEqual(st.dev, { mobile: 2, desktop: 1 });
    assert.ok(!s.files.has('zzzzzzzzzz/stats.json'));

    // ฟอร์มสนใจ: เบอร์ผิด → 400 · ถูก → 201 + แจ้งร้าน
    const bad = await post(`/sign/v/${j.id}/lead`, { name: 'สมชาย', phone: '12' });
    assert.equal(bad.status, 400);
    assert.match((await bad.json()).message, /เบอร์/);
    const ok = await post(`/sign/v/${j.id}/lead`, { name: 'สมชาย <b>ใจดี</b>', phone: '081-234-5678', note: 'ขอราคา 500 ใบ', src: 'facebook' });
    assert.equal(ok.status, 201);
    assert.equal((await ok.json()).notified, true);
    assert.equal(sent.length, 1);
    assert.match(sent[0], /สมชาย bใจดี\/b/);
    assert.match(sent[0], /081-234-5678/);
    assert.match(sent[0], /มาจาก: Facebook/);
    assert.match(sent[0], new RegExp(`/sign/v/${j.id}`));
    assert.equal((await post('/sign/v/zzzzzzzzzz/lead', { name: 'a', phone: '0812345678' })).status, 404);

    // ดูยอด: กุญแจผิด = ไม่ได้ข้อมูล · ถูก = ยอด + รายชื่อ
    const wrong = await (await post('/sign/api/stats', { links: [{ id: j.id, key: 'nope' }] })).json();
    assert.deepEqual(wrong.links, [{ id: j.id, ok: false }]);
    const mine = await (await post('/sign/api/stats', { links: [{ id: j.id, key: j.key }] })).json();
    assert.equal(mine.links[0].ok, true);
    assert.equal(mine.links[0].stats.views, 3);
    assert.equal(mine.links[0].leads.length, 1);
    assert.equal(mine.links[0].leads[0].phone, '081-234-5678');
  } finally {
    s.close();
  }
  // ส่งฟอร์มถี่เกิน → 429
  const s2 = await serve({ allowLead: () => false, notify: async () => false });
  try {
    const c = await fetch(`${s2.base}/sign/api/share`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ glb: tinyGlb().toString('base64') }) });
    const j = await c.json();
    const r = await fetch(`${s2.base}/sign/v/${j.id}/lead`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'ก', phone: '0812345678' }) });
    assert.equal(r.status, 429);
  } finally {
    s2.close();
  }
  // หน้า 3 มิติมีปุ่ม/ฟอร์ม และสคริปต์นับคนเปิด (เครื่องของร้านเองไม่นับ)
  const html = viewerHtml('abcdefghij', { poster: false, meta: { shop: 'นัดพอน' } }, 'https://x');
  assert.match(html, /id="lead"/);
  assert.match(html, /id="leadForm"/);
  const { readFileSync } = await import('node:fs');
  const v = readFileSync(new URL('../sign-mockup/viewer3d.js', import.meta.url), 'utf8');
  assert.match(v, /fetch\(`\/sign\/v\/\$\{data\.id\}\/seen`/);
  assert.match(v, /if \(!store\('own-' \+ data\.id\)\)/);
});

test('แจ้งเตือนลูกค้าสนใจ: ส่งถึง SIGN_NOTIFY_LINE_IDS ถ้าตั้งไว้ ไม่งั้นคนในรายชื่อหลังร้าน (ALLOWED_LINE_USER_IDS)', async () => {
  const { notifyIds } = await import('../src/routes/signShare.js');
  const A = 'U' + 'a'.repeat(32);
  const B = 'U' + 'b'.repeat(32);
  assert.deepEqual(notifyIds({ ALLOWED_LINE_USER_IDS: `${A}, ${B}` }), [A, B]);
  assert.deepEqual(notifyIds({ ALLOWED_LINE_USER_IDS: A, SIGN_NOTIFY_LINE_IDS: B }), [B]);
  assert.deepEqual(notifyIds({ SIGN_NOTIFY_LINE_IDS: 'not-an-id' }), []);
  assert.deepEqual(notifyIds({}), []);
});

test('อัปเดตเรียลไทม์: GET /sign/api/live เป็นสายสด (SSE) ส่งรุ่นที่ขึ้นระบบทันที + หัวใจกันสายเงียบ · รุ่นอ่านจาก sw.js ที่ deploy', async () => {
  const { readFileSync } = await import('node:fs');
  const sw = readFileSync(new URL('../sign-mockup/sw.js', import.meta.url), 'utf8');
  const real = deployedApp();
  assert.equal(real.v, sw.match(/VERSION = 'sign-mockup-([\d.]+)'/)[1]);
  assert.ok(real.at > 0);
  assert.deepEqual(deployedApp(new URL('file:///no/such/sw.js')), { v: '', at: 0 });

  const s = await serve({ app: { v: '9.8.7', at: 1700000000000 }, beatMs: 30 });
  const ac = new AbortController();
  try {
    const r = await fetch(`${s.base}/sign/api/live`, { signal: ac.signal });
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /^text\/event-stream/);
    assert.equal(r.headers.get('cache-control'), 'no-store');
    const reader = r.body.getReader();
    let text = '';
    while (!/: beat/.test(text)) text += new TextDecoder().decode((await reader.read()).value);
    assert.match(text, /^retry: 3000\nevent: version\ndata: \{"v":"9\.8\.7","at":1700000000000\}\n\n/);
  } finally {
    ac.abort();
    s.close();
  }
  // แอปต่อสายหลังหน้าโหลด · ได้รุ่นใหม่กว่า → อัปเดตเอง (ไม่วนโหลดถ้ายังได้รุ่นเดิม) · พับแอปปิดสาย
  const app = readFileSync(new URL('../sign-mockup/app.js', import.meta.url), 'utf8');
  assert.match(app, /new EventSource\('api\/live'\)/);
  assert.match(app, /if \(live\.v && newerVer\(live\.v, APP_VERSION\)\) liveUpdate\(live\.v\);/);
  assert.match(app, /if \(tried === v\) return;/);
  assert.match(app, /if \(document\.visibilityState === 'hidden'\) \{\n        liveClose\(\);/);
});

test('หน้าลิงก์ 3 มิติมีปุ่ม "ซูมดูป้าย" (ไฟล์มีรูปหน้างาน: เปิดมาเหมือนรูป ซูมเข้าไปดูป้ายได้)', () => {
  const html = viewerHtml('abcdefghij', { meta: { title: 'ป้าย' }, poster: true }, 'https://x.example');
  assert.match(html, /<button type="button" id="zoom" aria-pressed="false">ซูมดูป้าย<\/button>/);
});
