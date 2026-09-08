// Draws assets/rich-menu.png — the 2500x1686 Rich Menu artwork — with headless
// Chromium, so the layout below stays the single source of truth for it.
//
// The three tools it needs are not runtime dependencies of the bot, so install
// them only when redrawing:
//   npm i --no-save playwright @fontsource/noto-sans-thai sharp
//   node scripts/build-rich-menu.mjs
//
// Keep the header/footer heights in step with LAYOUT in create-rich-menu.js:
// those strips are decoration and must stay outside the tappable grid.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import sharp from 'sharp';

const ROOT = new URL('..', import.meta.url).pathname;
const b64 = (p) => readFileSync(ROOT + p).toString('base64');
const font400 = b64('node_modules/@fontsource/noto-sans-thai/files/noto-sans-thai-thai-400-normal.woff2');
const font700 = b64('node_modules/@fontsource/noto-sans-thai/files/noto-sans-thai-thai-700-normal.woff2');

// The mascot cut-outs, scaled down to what the artwork actually shows.
const mascot = async (file, width) =>
  (await sharp(ROOT + `public/brand/${file}`).resize({ width }).png().toBuffer()).toString('base64');
const peek = await mascot('mascot-peek.png', 560);
const sleep = await mascot('mascot-sleep.png', 620);

// Flat two-tone icons in the brand purple, in the style of the mockup.
const P = '#7C3AED', PL = '#C4B5FD', PD = '#5B21B6';
const ICONS = {
  add: `<rect x="16" y="12" width="60" height="76" rx="10" fill="${PL}"/><rect x="24" y="20" width="60" height="76" rx="10" fill="${P}"/>
        <rect x="42" y="12" width="24" height="16" rx="6" fill="${PD}"/>
        <rect x="36" y="40" width="36" height="6" rx="3" fill="#fff"/><rect x="36" y="54" width="26" height="6" rx="3" fill="#fff"/>
        <circle cx="76" cy="76" r="20" fill="#22A06B"/><rect x="73" y="66" width="6" height="20" rx="3" fill="#fff"/><rect x="66" y="73" width="20" height="6" rx="3" fill="#fff"/>`,
  slip: `<rect x="10" y="14" width="52" height="72" rx="8" fill="#fff" stroke="${P}" stroke-width="5"/>
        <rect x="20" y="28" width="32" height="5" rx="2.5" fill="${PL}"/><rect x="20" y="42" width="32" height="5" rx="2.5" fill="${PL}"/><rect x="20" y="56" width="22" height="5" rx="2.5" fill="${PL}"/>
        <rect x="52" y="30" width="48" height="62" rx="8" fill="${P}"/><circle cx="68" cy="48" r="7" fill="#FDE68A"/><path d="M56 84l14-18 10 12 8-8 12 14z" fill="#fff" opacity=".85"/>`,
  list: `<rect x="12" y="14" width="62" height="78" rx="10" fill="${PL}"/><rect x="20" y="22" width="62" height="78" rx="10" fill="#fff" stroke="${P}" stroke-width="5"/>
        <rect x="32" y="40" width="30" height="5" rx="2.5" fill="${P}"/><rect x="32" y="54" width="30" height="5" rx="2.5" fill="${P}"/><rect x="32" y="68" width="20" height="5" rx="2.5" fill="${P}"/>
        <circle cx="80" cy="78" r="20" fill="${P}"/><path d="M80 68v11l7 5" stroke="#fff" stroke-width="5" stroke-linecap="round" fill="none"/>`,
  chart: `<rect x="14" y="58" width="20" height="34" rx="6" fill="${PL}"/><rect x="42" y="34" width="20" height="58" rx="6" fill="${P}"/><rect x="70" y="14" width="20" height="78" rx="6" fill="${PD}"/>`,
  edit: `<path d="M18 78l6-20L66 16a10 10 0 0114 14L38 72z" fill="${P}"/><path d="M62 20l14 14" stroke="${PD}" stroke-width="6" stroke-linecap="round"/>
        <path d="M14 92c14-10 26 6 40-2s22 2 32-6" stroke="${PL}" stroke-width="6" fill="none" stroke-linecap="round"/>`,
  trash: `<rect x="24" y="30" width="56" height="62" rx="10" fill="${P}"/><rect x="16" y="18" width="72" height="14" rx="7" fill="${PD}"/><rect x="42" y="8" width="20" height="10" rx="5" fill="${PD}"/>
        <rect x="38" y="46" width="6" height="32" rx="3" fill="#fff"/><rect x="49" y="46" width="6" height="32" rx="3" fill="#fff"/><rect x="60" y="46" width="6" height="32" rx="3" fill="#fff"/>`,
  coin: `<circle cx="50" cy="30" r="23" fill="#F59E0B"/><circle cx="50" cy="30" r="17" fill="#FBBF24"/>
        <text x="50" y="41" font-size="28" font-weight="700" fill="#fff" text-anchor="middle" font-family="sans-serif">฿</text>
        <ellipse cx="17" cy="72" rx="10" ry="14" fill="${PD}" transform="rotate(-24 17 72)"/>
        <path d="M20 64c0-7 6-12 13-12h38c7 0 13 5 13 12v6c0 16-14 30-30 30h-4c-16 0-30-14-30-30z" fill="${P}"/>`,
  help: `<path d="M50 12c22 0 40 14 40 32S72 76 50 76c-5 0-9-.5-13-1.5L18 86l5-17C15 63 10 55 10 44 10 26 28 12 50 12z" fill="${P}"/>
        <text x="50" y="58" font-size="42" font-weight="700" fill="#fff" text-anchor="middle" font-family="sans-serif">?</text>`,
};

const BUTTONS = [
  { icon: 'add', title: 'บันทึกงานวันนี้', sub: 'จดงานใหม่ได้เลย' },
  { icon: 'slip', title: 'แนบสลิป/หลักฐาน', sub: 'ส่งรูปสลิปหรือไฟล์เอกสาร' },
  { icon: 'list', title: 'รายการล่าสุด', sub: 'ดูงานที่บันทึกไว้' },
  { icon: 'chart', title: 'สรุปวันนี้', sub: 'ยอดรวม รายการ แบบเข้าใจง่าย' },
  { icon: 'edit', title: 'แก้ไขล่าสุด', sub: 'ปรับปรุงข้อมูลงาน' },
  { icon: 'trash', title: 'ยกเลิกล่าสุด', sub: 'ลบรายการงาน' },
  { icon: 'coin', title: 'ค้างรับ', sub: 'ดูงานที่ยังไม่ได้รับเงิน' },
  { icon: 'help', title: 'ช่วยเหลือ', sub: 'มีอะไรให้ม่วงจดช่วย?' },
];

const paw = (x, y, s, o) =>
  `<g transform="translate(${x} ${y}) scale(${s})" opacity="${o}" fill="#7C3AED">
     <ellipse cx="0" cy="14" rx="13" ry="10"/><ellipse cx="-13" cy="-2" rx="5" ry="7"/>
     <ellipse cx="-4" cy="-9" rx="5" ry="7"/><ellipse cx="6" cy="-9" rx="5" ry="7"/><ellipse cx="14" cy="-2" rx="5" ry="7"/></g>`;

const cards = BUTTONS.map(
  (b, i) => `<div class="cell" style="grid-column:${(i % 4) + 1};grid-row:${Math.floor(i / 4) + 1}">
    <div class="card">
      <svg class="ic" viewBox="0 0 100 104">${ICONS[b.icon]}</svg>
      <div class="t">${b.title}</div>
      <div class="s">${b.sub}</div>
    </div>
  </div>`
).join('');

const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><style>
@font-face{font-family:'NST';src:url(data:font/woff2;base64,${font400}) format('woff2');font-weight:400}
@font-face{font-family:'NST';src:url(data:font/woff2;base64,${font700}) format('woff2');font-weight:700}
*{box-sizing:border-box;margin:0}
body{width:2500px;height:1686px;font-family:'NST',sans-serif;overflow:hidden;position:relative;
  background:linear-gradient(160deg,#F3EEFF 0%,#EDE6FF 45%,#E7DCFF 100%)}
.deco{position:absolute;inset:0;pointer-events:none}
.grid{position:absolute;left:0;top:150px;width:2500px;height:1386px;display:grid;
  grid-template-columns:repeat(4,625px);grid-template-rows:repeat(2,693px)}
.cell{padding:26px 30px;display:flex}
.card{flex:1;background:#FFFDF7;border-radius:44px;box-shadow:0 10px 28px rgba(91,33,182,.10);
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:28px 24px;text-align:center}
.ic{width:190px;height:198px;filter:drop-shadow(0 6px 10px rgba(91,33,182,.18))}
.t{font-weight:700;font-size:60px;color:#4C1D95;line-height:1.15}
.s{font-weight:400;font-size:34px;color:#7C6BA8;line-height:1.3;max-width:520px}
.foot{position:absolute;left:0;top:1536px;width:2500px;height:150px;display:flex;
  align-items:center;justify-content:center;gap:26px}
.brand{font-weight:700;font-size:86px;color:#6D28D9;letter-spacing:1px}
.tag{font-weight:400;font-size:38px;color:#8B7BB8}
.peek{position:absolute;left:56px;top:-30px;width:300px;z-index:2}
.sleep{position:absolute;right:40px;bottom:6px;width:330px;z-index:2}
.note{position:absolute;font-weight:700;color:#8B5CF6;opacity:.9;z-index:2}
</style></head><body>
<svg class="deco" viewBox="0 0 2500 1686">
  ${paw(388, 96, 1.3, 0.14)}${paw(1290, 62, 1.1, 0.12)}${paw(2150, 118, 1.2, 0.12)}
  ${paw(180, 1600, 1.2, 0.12)}${paw(1160, 1614, 1.0, 0.1)}${paw(1880, 1600, 1.1, 0.1)}
  <path d="M0 1536c260-40 420 40 700 10s420-70 700-30 500 60 1100 20v150H0z" fill="#7C3AED" opacity=".07"/>
</svg>
<img class="peek" src="data:image/png;base64,${peek}">
<img class="sleep" src="data:image/png;base64,${sleep}">
<div class="note" style="left:420px;top:44px;font-size:46px">จดงานง่าย หมดกังวล มีม่วงจดดูแล ♡</div>
<div class="note" style="right:120px;top:44px;font-size:46px">♡ งานเล็ก งานใหญ่ ก็จดได้</div>
<div class="grid">${cards}</div>
<div class="foot"><div class="brand">ม่วงจด</div><div class="tag">♡ ผู้ช่วยจดงาน ที่เข้าใจธุรกิจคุณ ♡</div></div>
</body></html>`;



const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 2500, height: 1686 } });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
await page.setContent(html, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(500);
const buf = await page.screenshot({ type: 'png' });
await browser.close();

const out = ROOT + 'assets/rich-menu.png';
const meta = await sharp(buf).metadata();
await sharp(buf).png({ compressionLevel: 9, palette: true }).toFile(out);

const kb = statSync(out).size / 1024;
console.log(`rendered ${meta.width}x${meta.height} -> assets/rich-menu.png (${kb.toFixed(0)} KB)`);
if (errs.length) {
  console.error('page errors:\n' + errs.join('\n'));
  process.exit(1);
}
// LINE rejects a Rich Menu image above 1 MB.
if (kb > 1024) {
  console.error(`too big for LINE: ${kb.toFixed(0)} KB > 1024 KB`);
  process.exit(1);
}
