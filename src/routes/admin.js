import express from 'express';
import { timingSafeEqual } from 'node:crypto';
import { installRichMenu } from '../services/richMenuInstaller.js';
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

function keyOf(req) {
  const header = req.get('x-admin-token');
  if (typeof header === 'string' && header) return header;
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
  if (!keyMatches(keyOf(req), expected)) {
    logger.warn('admin.denied', { path: req.path });
    return res.status(404).json({ error: 'not found' });
  }
  return next();
});

const PAGE = (key, body) => `<!doctype html><html lang="th"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>ม่วงจด · ตั้งค่าเมนู</title>
<style>
:root{color-scheme:dark}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#080B12;color:#E8EDF5}
.card{width:100%;max-width:420px;background:#121A2A;border:1px solid #24344F;border-radius:20px;padding:28px}
h1{font-size:21px;margin:0 0 6px}
p{color:#93A3BC;font-size:15px;line-height:1.6;margin:0 0 20px}
button{width:100%;padding:16px;font-size:17px;font-weight:600;color:#fff;background:#2E7DF7;
  border:0;border-radius:12px;cursor:pointer}
button:active{opacity:.85}
.ok{color:#4ADE80}.bad{color:#F87171}
code{background:#0B111C;padding:2px 6px;border-radius:5px;font-size:13px;word-break:break-all}
</style></head><body><div class="card">${body}
<form method="post" action="?key=${encodeURIComponent(key)}"><button>ติดตั้งเมนูขึ้น LINE</button></form>
</div></body></html>`;

router.get('/rich-menu', (req, res) => {
  res.type('html').send(
    PAGE(
      keyOf(req),
      `<h1>ตั้งค่า Rich Menu</h1>
       <p>กดปุ่มด้านล่างเพื่ออัปโหลดเมนูล่าสุดขึ้น LINE และตั้งเป็นเมนูเริ่มต้น
          เมนูเก่าของม่วงจดจะถูกลบให้อัตโนมัติค่ะ</p>`
    )
  );
});

router.post('/rich-menu', async (req, res) => {
  try {
    const result = await installRichMenu();
    res.type('html').send(
      PAGE(
        keyOf(req),
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
        keyOf(req),
        `<h1 class="bad">❌ ไม่สำเร็จ</h1><p><code>${escapeHtml(String(detail).slice(0, 500))}</code></p>`
      )
    );
  }
});

export default router;
