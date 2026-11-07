// ลิงก์ดูป้าย 3 มิติ — ร้านกด "สร้างลิงก์" ในแอปจำลองป้าย แล้วส่งลิงก์ให้ลูกค้าเปิดหมุนดูในมือถือ
//
//   GET  /sign/api/ping           เช็กว่าเซิร์ฟเวอร์ตื่นแล้ว (แอปปลุกก่อนส่งไฟล์ — เซิร์ฟเวอร์ฟรีหลับ/กำลังอัปเดต)
//   POST /sign/api/share          รับไฟล์ .glb (+ รูปตัวอย่าง) → { id, url }
//   GET  /sign/v/:id              หน้าดู 3 มิติ (มีรูปตัวอย่างให้ LINE โชว์ตอนแปะลิงก์)
//   GET  /sign/v/:id/model.glb    ไฟล์ 3 มิติ (?dl=1 = ดาวน์โหลด)
//   GET  /sign/v/:id/poster.jpg   รูปตัวอย่าง
//
// ไฟล์เก็บใน Supabase Storage bucket ส่วนตัวของตัวเอง ("sign-share" รับ .glb / .jpg / .json ไม่เกิน 20 MB)
// แยกจาก job-evidence ที่รับแค่รูป/PDF 10 MB — ถ้ายังไม่มี bucket เซิร์ฟเวอร์สร้างให้เองครั้งแรกที่ใช้
// (หรือรัน supabase/migrations/023_sign_share_bucket.sql) · เซิร์ฟเวอร์อ่านส่งต่อเอง ไม่เปิด bucket สาธารณะ

import express from 'express';
import { escapeHtml } from '../utils/html.js';
import { newShareId, isShareId, parseShareRequest, rateLimiter, SHARE_DAYS, SHARE_BUCKET, SHARE_TYPES, MAX_GLB } from '../utils/signShare.js';

export function supabaseStore(client, bucket = SHARE_BUCKET) {
  let ready = null;
  // ตรวจ/สร้าง bucket ครั้งเดียว ถ้าพลาดให้ลองใหม่รอบหน้า
  function ensure() {
    if (!ready) {
      ready = (async () => {
        const { data } = await client.storage.getBucket(bucket);
        if (data) return;
        const { error } = await client.storage.createBucket(bucket, { public: false, fileSizeLimit: MAX_GLB, allowedMimeTypes: SHARE_TYPES });
        if (error && !/exist/i.test(error.message || '')) throw error;
      })().catch((e) => {
        ready = null;
        throw e;
      });
    }
    return ready;
  }
  return {
    async put(path, buf, contentType) {
      await ensure();
      const { error } = await client.storage.from(bucket).upload(path, buf, { contentType, upsert: false });
      if (error) throw error;
    },
    async get(path) {
      const { data, error } = await client.storage.from(bucket).download(path);
      if (error || !data) return null;
      return Buffer.from(await data.arrayBuffer());
    },
  };
}

function baseUrl(req) {
  const env = (process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, '');
  if (env) return env;
  const proto = String(req.get('x-forwarded-proto') || req.protocol || 'https').split(',')[0].trim();
  return `${proto}://${req.get('host')}`;
}

function clientKey(req) {
  return String(req.get('x-forwarded-for') || req.ip || '').split(',')[0].trim() || 'unknown';
}

const MESSAGES = {
  bad_request: 'ส่งข้อมูลมาไม่ครบ',
  bad_model: 'ไฟล์ 3 มิติไม่ถูกต้อง',
  bad_poster: 'รูปตัวอย่างไม่ถูกต้อง',
  too_large: 'ไฟล์ใหญ่เกินไป (ไม่เกิน 20 MB)',
  rate_limited: 'สร้างลิงก์บ่อยเกินไป รอสักครู่แล้วลองใหม่',
  store_failed: 'บันทึกไฟล์ไม่สำเร็จ ลองใหม่อีกครั้ง',
};

function page(title, body, status = 200) {
  return {
    status,
    html: `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title>
<link rel="icon" href="/sign/icons/icon.svg" type="image/svg+xml"><link rel="stylesheet" href="/sign/viewer3d.css"></head>
<body class="v-msg"><main><img src="/sign/brand/ntp-mark.png" alt="" width="96"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(body)}</p></main></body></html>`,
  };
}

export function viewerHtml(id, rec, origin) {
  const m = rec.meta || {};
  const title = [m.title, m.size].filter(Boolean).join(' ');
  const desc = ['หมุนดูป้ายแบบ 3 มิติ', m.customer ? `สำหรับ ${m.customer}` : '', m.shop].filter(Boolean).join(' · ');
  const og = rec.poster ? `<meta property="og:image" content="${escapeHtml(`${origin}/sign/v/${id}/poster.jpg`)}">` : '';
  // ข้อมูลส่งให้สคริปต์ — กัน </script> ด้วยการหนี "<"
  const data = JSON.stringify({ id, meta: m, poster: !!rec.poster }).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${escapeHtml(title)} — ภาพ 3 มิติ</title>
<meta name="description" content="${escapeHtml(desc)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${escapeHtml(title)} — ภาพ 3 มิติ">
<meta property="og:description" content="${escapeHtml(desc)}">
${og}
<meta name="theme-color" content="#1f2a4d">
<link rel="icon" href="/sign/icons/icon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;500;600&family=Kanit:wght@500;600&display=swap">
<link rel="stylesheet" href="/sign/viewer3d.css">
</head>
<body>
<header class="v-top">
  <img src="/sign/brand/ntp-mark.png" alt="" width="52" height="34">
  <div class="v-shop"><b>${escapeHtml(m.shop || 'NATTAPRON')}</b><small>${escapeHtml(m.phone ? 'โทร ' + m.phone.replace(/^โทร\s*/, '') : 'Color Lab & Printing')}</small></div>
  ${m.phone ? `<a class="v-call" href="tel:${escapeHtml(m.phone.replace(/[^0-9+]/g, ''))}">โทรสั่งทำ</a>` : ''}
</header>
<main class="v-stage" id="stage">
  ${rec.poster ? `<img class="v-poster" id="poster" src="/sign/v/${id}/poster.jpg" alt="รูปตัวอย่างป้าย" hidden>` : ''}
  <canvas id="c" aria-label="ภาพ 3 มิติของป้าย หมุนดูได้"></canvas>
  <p class="v-load" id="load">กำลังโหลดภาพ 3 มิติ…</p>
  <p class="v-hint" id="hint">ลากเพื่อหมุน · ถ่างนิ้วหรือเลื่อนล้อเมาส์เพื่อซูม</p>
</main>
<section class="v-info">
  <h1>${escapeHtml(m.title || 'ป้าย')}</h1>
  <p>${escapeHtml([m.size, m.customer ? 'ลูกค้า: ' + m.customer : ''].filter(Boolean).join(' · '))}</p>
</section>
<nav class="v-bar">
  <button type="button" id="spin" aria-pressed="true">หมุนอัตโนมัติ</button>
  <button type="button" id="reset">มุมเริ่มต้น</button>
  <button type="button" id="full">เต็มจอ</button>
  <button type="button" id="shot">บันทึกรูป</button>
  <a id="dl" href="/sign/v/${id}/model.glb?dl=1" download>ไฟล์ .glb</a>
</nav>
<script type="application/json" id="data">${data}</script>
<script type="importmap">{ "imports": { "three": "/sign/vendor/three.module.min.js", "three/addons/": "/sign/vendor/addons/" } }</script>
<script type="module" src="/sign/viewer3d.js"></script>
</body>
</html>`;
}

export function createSignShareRouter({ store, now = () => Date.now(), allow = rateLimiter() } = {}) {
  const router = express.Router();

  router.get('/api/ping', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ ok: true, at: now() });
  });

  router.post('/api/share', express.json({ limit: '30mb' }), async (req, res) => {
    if (!allow(clientKey(req))) return res.status(429).json({ error: 'rate_limited', message: MESSAGES.rate_limited });
    const parsed = parseShareRequest(req.body);
    if (parsed.error) {
      return res.status(parsed.error === 'too_large' ? 413 : 400).json({ error: parsed.error, message: MESSAGES[parsed.error] });
    }
    const id = newShareId();
    const created = now();
    const rec = { id, created, expires: created + SHARE_DAYS * 86400000, poster: !!parsed.poster, meta: parsed.meta };
    try {
      await store.put(`${id}/model.glb`, parsed.glb, 'model/gltf-binary');
      if (parsed.poster) await store.put(`${id}/poster.jpg`, parsed.poster, 'image/jpeg');
      await store.put(`${id}/meta.json`, Buffer.from(JSON.stringify(rec)), 'application/json');
    } catch (e) {
      console.error('[signShare] store failed:', e?.message || e);
      return res.status(502).json({ error: 'store_failed', message: MESSAGES.store_failed });
    }
    res.status(201).json({ id, url: `${baseUrl(req)}/sign/v/${id}`, expires: rec.expires });
  });

  // ไฟล์ใหญ่เกิน / JSON เสีย ตอบเป็นข้อความไทย ไม่โยนไปหน้า error รวม
  router.use('/api/share', (err, req, res, next) => {
    if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'too_large', message: MESSAGES.too_large });
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'bad_request', message: MESSAGES.bad_request });
    next(err);
  });

  async function loadRec(id) {
    if (!isShareId(id)) return null;
    const raw = await store.get(`${id}/meta.json`).catch(() => null);
    if (!raw) return null;
    try {
      return JSON.parse(raw.toString('utf8'));
    } catch {
      return null;
    }
  }

  router.get('/v/:id', async (req, res) => {
    res.set('X-Content-Type-Options', 'nosniff');
    const rec = await loadRec(req.params.id);
    if (!rec) {
      const p = page('ไม่พบภาพ 3 มิตินี้', 'ลิงก์อาจพิมพ์ไม่ครบ ขอลิงก์ใหม่จากร้านได้เลย', 404);
      return res.status(p.status).type('html').send(p.html);
    }
    if (rec.expires && now() > rec.expires) {
      const p = page('ลิงก์นี้หมดอายุแล้ว', 'ขอลิงก์ใหม่จากร้านได้เลย', 410);
      return res.status(p.status).type('html').send(p.html);
    }
    res.set('Cache-Control', 'no-cache').type('html').send(viewerHtml(rec.id, rec, baseUrl(req)));
  });

  const file = (name, type) => async (req, res) => {
    if (!isShareId(req.params.id)) return res.status(404).end();
    const buf = await store.get(`${req.params.id}/${name}`).catch(() => null);
    if (!buf) return res.status(404).end();
    res.set({ 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'public, max-age=86400' }).type(type);
    if (req.query.dl && name === 'model.glb') res.attachment(`sign-3d-${req.params.id}.glb`);
    res.send(buf);
  };
  router.get('/v/:id/model.glb', file('model.glb', 'model/gltf-binary'));
  router.get('/v/:id/poster.jpg', file('poster.jpg', 'image/jpeg'));

  return router;
}

// ของจริง: เก็บใน Supabase Storage ของบอต
const { supabase } = await import('../config/supabase.js');
export default createSignShareRouter({ store: supabaseStore(supabase) });
