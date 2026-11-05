// ลิงก์ดูป้าย 3 มิติ (แอปจำลองป้าย) — ร้านกดสร้างลิงก์ ส่งให้ลูกค้าเปิดหมุนดูในมือถือ
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createSignShareRouter, viewerHtml } from '../src/routes/signShare.js';
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
