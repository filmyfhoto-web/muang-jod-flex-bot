// ลิงก์ดูป้าย 3 มิติ — ร้านกด "สร้างลิงก์" ในแอปจำลองป้าย แล้วส่งลิงก์ให้ลูกค้าเปิดหมุนดูในมือถือ
//
//   GET  /sign/api/ping           เช็กว่าเซิร์ฟเวอร์ตื่นแล้ว (แอปปลุกก่อนส่งไฟล์ — เซิร์ฟเวอร์ฟรีหลับ/กำลังอัปเดต)
//   GET  /sign/api/live           สายสด (Server-Sent Events) บอกรุ่นแอปที่ขึ้นระบบอยู่ + เวลาที่ขึ้น — แอปที่เปิดค้างรู้ทันทีว่ามีรุ่นใหม่
//   POST /sign/api/share          รับไฟล์ .glb (+ รูปตัวอย่าง) → { id, url }
//   GET  /sign/v/:id              หน้าดู 3 มิติ (มีรูปตัวอย่างให้ LINE โชว์ตอนแปะลิงก์)
//   GET  /sign/v/:id/model.glb    ไฟล์ 3 มิติ (?dl=1 = ดาวน์โหลด)
//   GET  /sign/v/:id/poster.jpg   รูปตัวอย่าง
//   POST /sign/v/:id/seen         หน้า 3 มิติแจ้งว่ามีคนเปิดดู (มาจาก Facebook/LINE/อื่น ๆ · มือถือ/คอม) — สคริปต์ส่ง บอตพรีวิวลิงก์ไม่นับ
//   POST /sign/v/:id/lead         ฟอร์ม "สนใจ / ขอราคา" (ชื่อ + เบอร์) → เก็บ + แจ้งร้านทาง LINE
//   POST /sign/api/stats          ร้านดูยอดเปิด + รายชื่อลูกค้าที่สนใจ (ต้องมีกุญแจเจ้าของของลิงก์นั้น)
//
// ไฟล์เก็บใน Supabase Storage bucket ส่วนตัวของตัวเอง ("sign-share" รับ .glb / .jpg / .json ไม่เกิน 20 MB)
// แยกจาก job-evidence ที่รับแค่รูป/PDF 10 MB — ถ้ายังไม่มี bucket เซิร์ฟเวอร์สร้างให้เองครั้งแรกที่ใช้
// (หรือรัน supabase/migrations/023_sign_share_bucket.sql) · เซิร์ฟเวอร์อ่านส่งต่อเอง ไม่เปิด bucket สาธารณะ

import express from 'express';
import { readFileSync, statSync } from 'node:fs';
import { escapeHtml } from '../utils/html.js';
import { newShareId, isShareId, parseShareRequest, rateLimiter, jpegSize, newOwnerKey, hashKey, keyMatches, cleanView, mergeStats, cleanLead, leadText, SHARE_DAYS, SHARE_BUCKET, SHARE_TYPES, MAX_GLB } from '../utils/signShare.js';
import { allowedUserIds, LINE_USER_ID } from '../utils/access.js';

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
    async put(path, buf, contentType, opts = {}) {
      await ensure();
      const { error } = await client.storage.from(bucket).upload(path, buf, { contentType, upsert: !!opts.upsert });
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
  lead_name: 'ใส่ชื่อก่อนนะคะ',
  lead_phone: 'เบอร์โทรไม่ถูกต้อง (9–10 หลัก)',
  lead_limited: 'ส่งบ่อยเกินไป รอสักครู่แล้วลองใหม่',
  not_found: 'ไม่พบลิงก์นี้',
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
  const img = `${origin}/sign/v/${id}/poster.jpg`;
  const ps = rec.posterSize;
  const og = rec.poster
    ? [
        `<meta property="og:image" content="${escapeHtml(img)}">`,
        `<meta property="og:image:secure_url" content="${escapeHtml(img)}">`,
        '<meta property="og:image:type" content="image/jpeg">',
        ps ? `<meta property="og:image:width" content="${ps.w | 0}">\n<meta property="og:image:height" content="${ps.h | 0}">` : '',
        `<meta property="og:image:alt" content="${escapeHtml(title)}">`,
        '<meta name="twitter:card" content="summary_large_image">',
      ]
        .filter(Boolean)
        .join('\n')
    : '';
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
<meta property="og:url" content="${escapeHtml(`${origin}/sign/v/${id}`)}">
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
  <button type="button" class="v-cta" id="lead">สนใจ / ขอราคา</button>
</section>
<dialog class="v-lead" id="leadDlg" aria-labelledby="leadTitle">
  <form id="leadForm" method="dialog">
    <h2 id="leadTitle">สนใจทำป้ายแบบนี้</h2>
    <p class="v-lead-sub">ฝากชื่อกับเบอร์ไว้ ${escapeHtml(m.shop || 'ร้าน')} จะติดต่อกลับเร็ว ๆ นี้</p>
    <label>ชื่อ<input name="name" required maxlength="60" autocomplete="name"></label>
    <label>เบอร์โทร<input name="phone" required maxlength="20" inputmode="tel" autocomplete="tel"></label>
    <label>อยากได้แบบไหน / ข้อความถึงร้าน <small>(ไม่ใส่ก็ได้)</small><textarea name="note" rows="2" maxlength="300"></textarea></label>
    <p class="v-lead-msg" id="leadMsg" role="status"></p>
    <div class="v-lead-row">
      <button type="button" id="leadCancel">ปิด</button>
      <button type="submit" class="v-cta" id="leadSend">ส่งให้ร้าน</button>
    </div>
    <p class="v-lead-note">ข้อมูลนี้ส่งถึงร้านเท่านั้น ใช้ติดต่อกลับเรื่องงานป้ายนี้</p>
  </form>
</dialog>
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

/* แจ้งร้านทาง LINE เมื่อมีลูกค้ากด "สนใจ" — ส่งถึงคนในรายชื่อหลังร้าน (SIGN_NOTIFY_LINE_IDS ถ้าตั้งไว้ ไม่งั้น ALLOWED_LINE_USER_IDS)
 * ไม่มีรายชื่อ = ไม่ส่ง (รายชื่อลูกค้ายังดูได้ในแอป) */
export function notifyIds(env = process.env) {
  const own = String(env.SIGN_NOTIFY_LINE_IDS || '')
    .split(/[\s,;]+/)
    .filter((s) => LINE_USER_ID.test(s));
  return own.length ? [...new Set(own)] : allowedUserIds(env);
}
async function lineNotify(text) {
  const ids = notifyIds();
  if (!ids.length) return false;
  const { push } = await import('../services/lineService.js');
  const sent = await Promise.all(ids.map((to) => push(to, { type: 'text', text }).then(() => true, () => false)));
  return sent.some(Boolean);
}

// รุ่นแอปที่เซิร์ฟเวอร์นี้เสิร์ฟอยู่ (อ่านจาก sw.js ที่ deploy มา) + เวลาที่ไฟล์ลงเครื่อง ≈ เวลาขึ้นระบบ
const SW_FILE = new URL('../../sign-mockup/sw.js', import.meta.url);
export function deployedApp(file = SW_FILE) {
  try {
    const m = readFileSync(file, 'utf8').match(/VERSION = 'sign-mockup-([\d.]+)'/);
    return { v: m ? m[1] : '', at: Math.round(statSync(file).mtimeMs) };
  } catch {
    return { v: '', at: 0 };
  }
}

export function createSignShareRouter({ store, now = () => Date.now(), allow = rateLimiter(), allowLead = rateLimiter({ perHour: 5, perDay: 300 }), notify = lineNotify, flushMs = 4000, app = deployedApp(), beatMs = 25000, liveMs = 15 * 60 * 1000 } = {}) {
  const router = express.Router();

  router.get('/api/ping', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ ok: true, at: now() });
  });

  // สายสดบอกรุ่น: ต่อเมื่อไหร่ได้รุ่นปัจจุบันทันที · ตอน deploy เซิร์ฟเวอร์เก่าดับ สายหลุด → เบราว์เซอร์ต่อใหม่เอง
  // (retry 3 วิ) เจอเซิร์ฟเวอร์ใหม่ → ได้รุ่นใหม่ → แอปอัปเดตเอง · ส่งหัวใจทุก 25 วิ กันพร็อกซีตัดสายเงียบ
  // ตัดสายเองทุก 15 นาที (แอปต่อใหม่) ไม่ให้มีสายค้างนาน ๆ
  router.get('/api/live', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write(`retry: 3000\nevent: version\ndata: ${JSON.stringify({ v: app.v, at: app.at })}\n\n`);
    const beat = setInterval(() => res.write(': beat\n\n'), beatMs);
    const end = setTimeout(() => res.end(), liveMs);
    req.on('close', () => {
      clearInterval(beat);
      clearTimeout(end);
    });
  });

  router.post('/api/share', express.json({ limit: '30mb' }), async (req, res) => {
    if (!allow(clientKey(req))) return res.status(429).json({ error: 'rate_limited', message: MESSAGES.rate_limited });
    const parsed = parseShareRequest(req.body);
    if (parsed.error) {
      return res.status(parsed.error === 'too_large' ? 413 : 400).json({ error: parsed.error, message: MESSAGES[parsed.error] });
    }
    const id = newShareId();
    const created = now();
    const key = newOwnerKey();
    const rec = { id, created, expires: created + SHARE_DAYS * 86400000, poster: !!parsed.poster, meta: parsed.meta, ownerHash: hashKey(key) };
    const ps = parsed.poster ? jpegSize(parsed.poster) : null;
    if (ps) rec.posterSize = ps;
    try {
      await store.put(`${id}/model.glb`, parsed.glb, 'model/gltf-binary');
      if (parsed.poster) await store.put(`${id}/poster.jpg`, parsed.poster, 'image/jpeg');
      await store.put(`${id}/meta.json`, Buffer.from(JSON.stringify(rec)), 'application/json');
    } catch (e) {
      console.error('[signShare] store failed:', e?.message || e);
      return res.status(502).json({ error: 'store_failed', message: MESSAGES.store_failed });
    }
    res.status(201).json({ id, url: `${baseUrl(req)}/sign/v/${id}`, expires: rec.expires, key });
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

  /* ---------- คนเปิดดู: รวบไว้ในหน่วยความจำ แล้วเขียนลงที่เก็บทีละชุด (ไม่เขียนทุกครั้งที่มีคนเปิด) ---------- */
  const pending = new Map(); // id → [{src, dev, first, at}]
  const lastSeen = new Map(); // ip|id → เวลา (คนเดิมรีเฟรชถี่ ๆ นับครั้งเดียว)
  const chains = new Map(); // id → Promise (อ่าน-แก้-เขียนไฟล์เดียวกันทีละคำขอ)
  function serial(id, fn) {
    const p = (chains.get(id) || Promise.resolve()).then(fn, fn);
    const done = p.catch(() => {});
    chains.set(id, done);
    done.then(() => {
      if (chains.get(id) === done) chains.delete(id);
    });
    return p;
  }
  async function readJson(path, fallback) {
    const raw = await store.get(path).catch(() => null);
    if (!raw) return fallback;
    try {
      return JSON.parse(raw.toString('utf8'));
    } catch {
      return fallback;
    }
  }
  let timer = null;
  function flushSoon() {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      flushAll().catch(() => {});
    }, flushMs);
    if (timer.unref) timer.unref();
  }
  async function flush(id) {
    const views = pending.get(id);
    if (!views || !views.length) return;
    pending.delete(id);
    await serial(id, async () => {
      const old = await readJson(`${id}/stats.json`, null);
      const next = mergeStats(old, views, now());
      await store.put(`${id}/stats.json`, Buffer.from(JSON.stringify(next)), 'application/json', { upsert: true });
    }).catch((e) => console.error('[signShare] stats write failed:', e?.message || e));
  }
  async function flushAll() {
    await Promise.all([...pending.keys()].map(flush));
  }

  router.post('/v/:id/seen', express.json({ limit: '2kb' }), async (req, res) => {
    res.status(204).end();
    const id = req.params.id;
    if (!isShareId(id)) return;
    const t = now();
    // คนเดิม = IP + เบราว์เซอร์เดียวกัน (มือถือหลายเครื่องใช้ IP เดียวกันได้ผ่านเครือข่ายมือถือ/ไวไฟ)
    const k = `${clientKey(req)}|${String(req.get('user-agent') || '').slice(0, 160)}|${id}`;
    if (t - (lastSeen.get(k) || 0) < 60000) return;
    lastSeen.set(k, t);
    if (lastSeen.size > 20000) lastSeen.clear();
    if (!pending.has(id)) {
      if (pending.size > 2000) return;
      // ลิงก์ที่ไม่มีจริงไม่นับ
      if (!(await loadRec(id))) return;
      if (!pending.has(id)) pending.set(id, []);
    }
    const list = pending.get(id);
    if (list.length < 1000) list.push(Object.assign(cleanView(req.body), { at: t }));
    flushSoon();
  });

  router.post('/v/:id/lead', express.json({ limit: '4kb' }), async (req, res) => {
    const id = req.params.id;
    const rec = await loadRec(id);
    if (!rec || (rec.expires && now() > rec.expires)) return res.status(404).json({ error: 'not_found', message: MESSAGES.not_found });
    const lead = cleanLead(req.body);
    if (lead.error) return res.status(400).json({ error: lead.error, message: MESSAGES[lead.error] });
    if (!allowLead(clientKey(req))) return res.status(429).json({ error: 'lead_limited', message: MESSAGES.lead_limited });
    const item = Object.assign({ at: now() }, lead);
    try {
      await serial(id, async () => {
        const list = await readJson(`${id}/leads.json`, []);
        const next = (Array.isArray(list) ? list : []).concat([item]).slice(-200);
        await store.put(`${id}/leads.json`, Buffer.from(JSON.stringify(next)), 'application/json', { upsert: true });
      });
    } catch (e) {
      console.error('[signShare] lead write failed:', e?.message || e);
      return res.status(502).json({ error: 'store_failed', message: MESSAGES.store_failed });
    }
    let notified = false;
    try {
      notified = await notify(leadText(rec, lead, `${baseUrl(req)}/sign/v/${id}`), rec, lead);
    } catch (e) {
      console.error('[signShare] lead notify failed:', e?.message || e);
    }
    res.status(201).json({ ok: true, notified: !!notified });
  });

  // ร้านดูยอด: ส่ง [{ id, key }] (ไม่เกิน 60 ลิงก์) → ยอดเปิด + ลูกค้าที่สนใจ ของลิงก์ที่กุญแจถูก
  router.post('/api/stats', express.json({ limit: '16kb' }), async (req, res) => {
    const links = Array.isArray(req.body?.links) ? req.body.links.slice(0, 60) : [];
    await flushAll().catch(() => {});
    const out = await Promise.all(
      links.map(async (l) => {
        const id = l && l.id;
        const rec = isShareId(id) ? await loadRec(id) : null;
        if (!rec || !keyMatches(l.key, rec.ownerHash)) return { id: String(id || '').slice(0, 20), ok: false };
        const [stats, leads] = await Promise.all([readJson(`${id}/stats.json`, null), readJson(`${id}/leads.json`, [])]);
        return { id, ok: true, expires: rec.expires, stats: mergeStats(stats, [], now()), leads: Array.isArray(leads) ? leads : [] };
      })
    );
    res.set('Cache-Control', 'no-store').json({ links: out });
  });

  return router;
}

// ของจริง: เก็บใน Supabase Storage ของบอต
const { supabase } = await import('../config/supabase.js');
export default createSignShareRouter({ store: supabaseStore(supabase) });
