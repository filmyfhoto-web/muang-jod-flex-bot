import express from 'express';
import { timingSafeEqual } from 'node:crypto';
import { installRichMenu, getRichMenuStatus } from '../services/richMenuInstaller.js';
import { escapeHtml } from '../utils/html.js';
import { logger } from '../services/logger.js';

// A small owner-only page, so installing the Rich Menu does not need a laptop
// with Node on it. It is off unless ADMIN_TOKEN is set, and every request must
// carry that token — this endpoint can change what every user of the bot sees.

const router = express.Router();

const MIN_TOKEN_LENGTH = 16;

export function adminToken(env = process.env) {
  const token = String(env.ADMIN_TOKEN ?? '').trim();
  return token.length >= MIN_TOKEN_LENGTH ? token : null;
}

// Constant-time, and only on equal lengths — comparing different lengths with
// timingSafeEqual throws.
export function keyMatches(given, expected) {
  if (!expected || typeof given !== 'string') return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// The key may arrive three ways. Basic auth is the one that works on a phone:
// the browser shows a password box, so the token never has to survive being
// pasted into a URL — which is where it kept getting mangled.
export function readKey(req) {
  const header = req.get('x-admin-token');
  if (typeof header === 'string' && header) return header;

  const auth = req.get('authorization') || '';
  const basic = /^Basic\s+(\S+)$/i.exec(auth);
  if (basic) {
    // Base64 decoding is lenient and turns rubbish into rubbish, so require
    // the "user:password" shape rather than passing whatever came out along.
    const decoded = Buffer.from(basic[1], 'base64').toString('utf8');
    const colon = decoded.indexOf(':');
    return colon === -1 ? '' : decoded.slice(colon + 1); // any username; the password is the token
  }

  const q = req.query?.key;
  return typeof q === 'string' ? q : '';
}

// Every response here is private and must never be indexed or cached.
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  res.set('X-Robots-Tag', 'noindex, nofollow');

  const expected = adminToken();
  if (!expected) {
    return res.status(404).json({
      error: 'admin disabled',
      hint: `ตั้งค่า ADMIN_TOKEN (อย่างน้อย ${MIN_TOKEN_LENGTH} ตัวอักษร) ก่อนใช้หน้านี้`,
    });
  }
  const given = readKey(req);
  if (!given) {
    // Nothing supplied — ask the browser for it rather than guessing.
    res.set('WWW-Authenticate', 'Basic realm="muang-jod", charset="UTF-8"');
    return res.status(401).json({ error: 'unauthorized', hint: 'ใส่รหัสในช่องรหัสผ่าน (ชื่อผู้ใช้ปล่อยว่างได้)' });
  }
  if (!keyMatches(given, expected)) {
    logger.warn('admin.denied', { path: req.path, givenLength: given.length });
    res.set('WWW-Authenticate', 'Basic realm="muang-jod", charset="UTF-8"');
    // The length of what arrived, never the token: a 0 means the key never
    // reached the server at all, and a wrong length means it was mangled on
    // the way — which a bare "not found" could not tell apart.
    return res.status(401).json({ error: 'wrong key', receivedKeyLength: given.length });
  }
  return next();
});

// LINE's own status codes, said in the terms of what to go and fix. Without
// this the page just repeats "status code 401", which does not point anywhere.
function lineErrorHint(err) {
  switch (err?.statusCode ?? err?.status) {
    case 401:
      return 'LINE ปฏิเสธ token — <b>LINE_CHANNEL_ACCESS_TOKEN ใน Render ไม่ตรงกับตัวที่ใช้อยู่</b> ' +
        'ถ้าเพิ่งกด Reissue ที่ LINE Developers ตัวเก่าจะใช้ไม่ได้ทันที ให้ก็อปตัวใหม่มาใส่ใน Render แล้ว Save';
    case 403:
      return 'token ใช้ได้ แต่ช่องนี้ไม่มีสิทธิ์ตั้ง Rich Menu — ตรวจว่าเป็น channel แบบ Messaging API';
    case 400:
      return 'LINE ไม่รับข้อมูลที่ส่งไป — ดูรายละเอียดด้านล่าง';
    case 413:
      return 'ไฟล์รูปใหญ่เกิน 1 MB';
    default:
      return 'รายละเอียดจาก LINE:';
  }
}

const PAGE = (action, body) => `<!doctype html><html lang="th"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>ม่วงจด · ตั้งค่าเมนู</title>
<style>
:root{color-scheme:dark}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#080B12;color:#E8EDF5}
.card{width:100%;max-width:420px;background:#121A2A;border:1px solid #24344F;border-radius:20px;padding:28px}
h1{font-size:21px;margin:0 0 6px}
p{color:#93A3BC;font-size:15px;line-height:1.6;margin:0 0 20px}
button{width:100%;padding:16px;font-size:17px;font-weight:600;color:#fff;background:#7C3AED;
  border:0;border-radius:12px;cursor:pointer}
button:active{opacity:.85}
.ok{color:#4ADE80}.bad{color:#F87171}
code{background:#0B111C;padding:2px 6px;border-radius:5px;font-size:13px;word-break:break-all}
h2{font-size:15px;margin:22px 0 8px;color:#93A3BC;font-weight:600}
.dim{color:#7C8CA6;font-size:13px}
.menus{list-style:none;padding:0;margin:0 0 20px}
.menus li{background:#0B111C;border:1px solid #24344F;border-radius:12px;padding:12px;margin-bottom:8px;
  font-size:14px;line-height:1.6}
</style></head><body><div class="card">${body}
<form method="post" action="${escapeHtml(action)}"><button>ติดตั้งเมนูขึ้น LINE</button></form>
</div></body></html>`;

// A phone cannot tell "never installed" from "installed but cached" from
// "something else is the default". This says which one it is.
function statusBlock(status) {
  if (!status) return '';
  if (status.error) {
    return `<p class="bad">อ่านสถานะจาก LINE ไม่ได้: ${escapeHtml(status.error)}</p>`;
  }
  if (!status.menus.length) {
    return '<p class="bad">ตอนนี้ LINE <b>ยังไม่มีเมนูเลย</b> — ยังไม่เคยติดตั้งสำเร็จค่ะ</p>';
  }

  const rows = status.menus
    .map((m) => {
      const mark = m.isDefault ? '<span class="ok">● ใช้อยู่</span>' : '<span class="dim">○ ไม่ได้ใช้</span>';
      const shape = `${m.size?.width}x${m.size?.height} · ${m.areas} ปุ่ม`;
      return `<li>${mark} <b>${escapeHtml(m.name || '(ไม่มีชื่อ)')}</b><br>
              <span class="dim">${escapeHtml(shape)}</span><br>
              <code>${escapeHtml(m.id)}</code></li>`;
    })
    .join('');

  const active = status.menus.find((m) => m.isDefault);
  let verdict;
  if (!active) {
    verdict = '<p class="bad">มีเมนูอยู่ แต่ <b>ยังไม่ได้ตั้งเป็นเมนูเริ่มต้น</b> — กดปุ่มด้านล่างอีกครั้งค่ะ</p>';
  } else if (active.areas !== status.expected.areas) {
    verdict = `<p class="bad">เมนูที่ใช้อยู่มี ${active.areas} ปุ่ม แต่เมนูล่าสุดมี ${status.expected.areas} ปุ่ม
               — <b>ยังเป็นเมนูเก่า</b> กดปุ่มด้านล่างเพื่อติดตั้งตัวใหม่ค่ะ</p>`;
  } else {
    verdict = `<p class="ok">เมนูล่าสุดติดตั้งแล้วค่ะ (${active.areas} ปุ่ม)<br>
               <span class="dim">ถ้าบนมือถือยังเป็นอันเก่า ให้ปิดแอป LINE แล้วเปิดใหม่ — LINE แคชรูปเมนูไว้</span></p>`;
  }

  return `${verdict}<ul class="menus">${rows}</ul>`;
}

router.get('/rich-menu', async (req, res) => {
  let status = null;
  try {
    status = await getRichMenuStatus();
  } catch (err) {
    status = { error: err?.body ? JSON.stringify(err.body) : err?.message || String(err) };
  }

  res.type('html').send(
    PAGE(
      req.originalUrl,
      `<h1>ตั้งค่า Rich Menu</h1>
       <p>กดปุ่มด้านล่างเพื่ออัปโหลดเมนูล่าสุดขึ้น LINE และตั้งเป็นเมนูเริ่มต้น
          เมนูเก่าของม่วงจดจะถูกลบให้อัตโนมัติค่ะ</p>
       <h2>สถานะตอนนี้</h2>
       ${statusBlock(status)}`
    )
  );
});

router.post('/rich-menu', async (req, res) => {
  try {
    const result = await installRichMenu();
    res.type('html').send(
      PAGE(
        req.originalUrl,
        `<h1 class="ok">✅ เสร็จเรียบร้อยค่ะ</h1>
         <p>ติดตั้งเมนู ${result.areas} ปุ่มแล้ว ลบเมนูเก่า ${result.removed.length} อัน<br>
            <code>${escapeHtml(result.richMenuId)}</code><br><br>
            เปิด LINE ปิด–เปิดห้องแชตใหม่ จะเห็นเมนูใหม่เลยค่ะ</p>`
      )
    );
  } catch (err) {
    const detail = err?.body ? JSON.stringify(err.body) : err?.message || String(err);
    logger.error('admin.rich_menu_failed', { message: detail });
    res.status(500).type('html').send(
      PAGE(
        req.originalUrl,
        `<h1 class="bad">❌ ไม่สำเร็จ</h1>
         <p>${lineErrorHint(err)}<br><br><code>${escapeHtml(String(detail).slice(0, 500))}</code></p>`
      )
    );
  }
});

export default router;
