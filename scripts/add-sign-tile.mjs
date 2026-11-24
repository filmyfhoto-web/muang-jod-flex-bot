// การ์ด "จำลองป้าย 3D" มุมซ้ายล่างของริชเมนู — วางทับภาพเมนูที่ร้านทำ (assets/rich-menu.jpg) ไม่แตะส่วนอื่น
//
// ร้านขอ "เอาไปวางไว้ในริชเมนูในม่วงจดได้ไหม" (24 พ.ย. 69) — แอปจำลองป้าย (/sign/) แตะจากไลน์ได้เลย
// เรขาคณิตคู่กับการ์ดเกม (ขวาสุดของแถวแบรนด์): การ์ดนี้ซ้ายสุดของแถวแบรนด์ กว้าง SIGN_W เท่ากัน ขอบห่างเท่ากัน
// พื้นที่กดอยู่ใน scripts/create-rich-menu.js (SIGN) · ภาพตัวแทนใน scripts/build-rich-menu.mjs วาดการ์ดเดียวกัน
//
//   node scripts/add-sign-tile.mjs            (ต้องมี playwright + sharp)
//
// รันครั้งเดียวกับภาพของร้าน (รันซ้ำ = วางการ์ดทับที่เดิม เงาเข้มขึ้นนิดหน่อย) · ภาพต้องไม่เกิน 1 MB ตามเพดานของ LINE
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import sharp from 'sharp';

// playwright: ใช้ของในโปรเจกต์ หรือของที่ติดตั้งไว้ในเครื่อง (require หาตาม NODE_PATH ได้ ส่วน import หาไม่ได้)
const { chromium } = createRequire(import.meta.url)('playwright');

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const W = 2500;
const H = 1686;
const FOOT_Y = 1418; // ต้องตรงกับ build-rich-menu.mjs / create-rich-menu.js
const FOOT_H = H - FOOT_Y;
const SIGN_W = 840; // เท่าการ์ดเกม (GAME_W)

const b64 = (p) => readFileSync(ROOT + p).toString('base64');
// ฟอนต์ไทยที่มีในโปรเจกต์อยู่แล้ว (ปลั๊กอิน Nesting Cut) + Inter สำหรับ "3D"
const th400 = b64('adobe/nesting-cut/assets/fonts/noto-sans-thai-looped-thai-400-normal.woff2');
const th700 = b64('adobe/nesting-cut/assets/fonts/noto-sans-thai-looped-thai-700-normal.woff2');
const en700 = b64('adobe/nesting-cut/assets/fonts/inter-latin-700-normal.woff2');
const icon = b64('sign-mockup/icons/icon-192.png');

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:'T';src:url(data:font/woff2;base64,${th400}) format('woff2');font-weight:400}
@font-face{font-family:'T';src:url(data:font/woff2;base64,${th700}) format('woff2');font-weight:700}
@font-face{font-family:'E';src:url(data:font/woff2;base64,${en700}) format('woff2');font-weight:700}
html,body{margin:0;background:transparent}
body{width:${SIGN_W}px;height:${FOOT_H}px;position:relative;font-family:'E','T',sans-serif}
.card{position:absolute;left:68px;top:28px;width:${SIGN_W - 108}px;height:${FOOT_H - 56}px;box-sizing:border-box;
  border-radius:36px;background:linear-gradient(150deg,#F6B07E 0%,#D9622B 100%);
  box-shadow:0 14px 30px rgba(0,0,0,.3);display:flex;align-items:center;gap:26px;padding:0 34px}
.ic{width:140px;height:140px;border-radius:24px;background:#fff;display:flex;align-items:center;justify-content:center;flex:none}
.ic img{width:126px;height:126px}
.t{font-weight:700;font-size:60px;color:#fff;line-height:1.1;white-space:nowrap}
.s{font-family:'T';font-weight:400;font-size:36px;color:#FFEBDD;margin-top:4px;white-space:nowrap}
.spark{position:absolute;right:30px;top:22px;font-size:40px;color:#FFE08A}
</style></head><body>
<div class="card">
  <div class="ic"><img src="data:image/png;base64,${icon}"></div>
  <div><div class="t">จำลองป้าย 3D</div><div class="s">ภาพป้ายให้ลูกค้าดู · แตะเปิด</div></div>
  <div class="spark">✦</div>
</div>
</body></html>`;

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const page = await browser.newPage({ viewport: { width: SIGN_W, height: FOOT_H } });
await page.setContent(html, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(300);
const tile = await page.screenshot({ type: 'png', omitBackground: true });
await browser.close();

const src = ROOT + 'assets/rich-menu.jpg';
const meta = await sharp(src).metadata();
if (meta.width !== W || meta.height !== H) throw new Error(`rich-menu.jpg ต้องเป็น ${W}x${H} (ได้ ${meta.width}x${meta.height})`);
// encode รอบเดียว: คุณภาพสูงสุดที่ยังไม่เกิน 1 MB
let out = null;
for (const quality of [92, 90, 88, 86, 84]) {
  out = await sharp(src)
    .composite([{ input: tile, left: 0, top: FOOT_Y }])
    .jpeg({ quality, chromaSubsampling: '4:4:4', mozjpeg: true })
    .toBuffer();
  if (out.length < 1000 * 1024) {
    console.log(`quality ${quality} · ${Math.round(out.length / 1024)} KB`);
    break;
  }
}
if (out.length >= 1000 * 1024) throw new Error('ภาพใหญ่เกิน 1 MB');
writeFileSync(src, out);
console.log('วางการ์ดจำลองป้าย 3D แล้ว →', src);
