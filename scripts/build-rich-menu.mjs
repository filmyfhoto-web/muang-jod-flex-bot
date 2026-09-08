// Draws assets/rich-menu.png — the 2500x1686 Rich Menu artwork — with headless
// Chromium, so the layout below stays the single source of truth for it.
//
// The three tools it needs are not runtime dependencies of the bot, so install
// them only when redrawing:
//   npm i --no-save playwright @fontsource/noto-sans-thai sharp
//   node scripts/build-rich-menu.mjs
//
// Geometry must stay in step with LAYOUT in create-rich-menu.js: the brand
// panel on the left and the strip along the bottom are decoration and sit
// outside the tappable grid.
import { chromium } from 'playwright';
import { readFileSync, statSync } from 'node:fs';
import sharp from 'sharp';

const ROOT = new URL('..', import.meta.url).pathname;
const b64 = (p) => readFileSync(ROOT + p).toString('base64');
const font400 = b64('node_modules/@fontsource/noto-sans-thai/files/noto-sans-thai-thai-400-normal.woff2');
const font700 = b64('node_modules/@fontsource/noto-sans-thai/files/noto-sans-thai-thai-700-normal.woff2');

// The brand lockup (mascot + wordmark) already sits on a dark ground.
const logo = (await sharp(ROOT + 'public/brand/logo-dark.jpg').resize({ width: 900 }).jpeg({ quality: 90 }).toBuffer())
  .toString('base64');

// Two mascot cut-outs stuck on the brand panel like stickers.
const cutout = async (file, width) =>
  (await sharp(ROOT + `public/brand/${file}`).resize({ width }).png({ compressionLevel: 9 }).toBuffer()).toString('base64');
const waveDog = await cutout('mascot-clipboard-wave.png', 420);
const sleepDog = await cutout('mascot-sleep.png', 560);

// Geometry — mirrored by LAYOUT in create-rich-menu.js.
const W = 2500, H = 1686;
const PANEL_W = 860;        // brand panel, not tappable
const TOP = 26;             // margin above the first row
const FOOTER_H = 26;        // margin below the last row
const COLS = 3, ROWS = 3;
const CELL_W = Math.floor((W - PANEL_W) / COLS);
const CELL_H = Math.floor((H - TOP - FOOTER_H) / ROWS);

// Flat icons for a dark ground: light bodies, one blue accent each.
const BLUE = '#2E7DF7', LIGHT = '#E8EDF5', MID = '#AEBACD', DARK = '#0C1220';
const ICONS = {
  add: `<rect x="14" y="10" width="56" height="72" rx="9" fill="${LIGHT}"/>
        <rect x="26" y="26" width="32" height="6" rx="3" fill="${MID}"/><rect x="26" y="40" width="32" height="6" rx="3" fill="${MID}"/><rect x="26" y="54" width="20" height="6" rx="3" fill="${MID}"/>
        <circle cx="72" cy="70" r="22" fill="${BLUE}"/><rect x="69" y="59" width="6" height="22" rx="3" fill="#fff"/><rect x="61" y="67" width="22" height="6" rx="3" fill="#fff"/>`,
  slip: `<rect x="14" y="10" width="56" height="72" rx="9" fill="${LIGHT}"/>
         <circle cx="34" cy="32" r="8" fill="#FBBF24"/><path d="M20 68l16-20 11 13 9-9 14 16z" fill="${MID}"/>
         <circle cx="72" cy="70" r="22" fill="${BLUE}"/><path d="M72 60v20M64 68l8-8 8 8" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
  recent: `<path d="M50 8c24 0 42 16 42 36S74 80 50 80c-6 0-11-1-16-2L14 90l6-19C13 65 8 55 8 44 8 24 26 8 50 8z" fill="${LIGHT}"/>
           <circle cx="50" cy="42" r="21" fill="none" stroke="${BLUE}" stroke-width="6"/>
           <path d="M50 30v13l9 6" stroke="${BLUE}" stroke-width="6" stroke-linecap="round" fill="none"/>`,
  chart: `<rect x="10" y="52" width="17" height="36" rx="5" fill="${BLUE}"/><rect x="34" y="30" width="17" height="58" rx="5" fill="${LIGHT}"/>
          <path d="M74 26a30 30 0 11-30 30h30z" fill="${MID}"/><path d="M74 26v30h30A30 30 0 0074 26z" fill="${BLUE}"/>`,
  edit: `<path d="M16 78l6-19L64 17a10 10 0 0114 14L46 72z" fill="${LIGHT}"/><path d="M60 21l14 14" stroke="${BLUE}" stroke-width="7" stroke-linecap="round"/>
         <rect x="12" y="88" width="76" height="7" rx="3.5" fill="${BLUE}"/>`,
  trash: `<rect x="24" y="28" width="52" height="62" rx="9" fill="${LIGHT}"/><rect x="16" y="16" width="68" height="13" rx="6.5" fill="${MID}"/><rect x="41" y="7" width="18" height="10" rx="5" fill="${MID}"/>
          <rect x="37" y="42" width="6" height="32" rx="3" fill="${DARK}"/><rect x="47" y="42" width="6" height="32" rx="3" fill="${DARK}"/><rect x="57" y="42" width="6" height="32" rx="3" fill="${DARK}"/>`,
  pending: `<rect x="14" y="10" width="56" height="74" rx="9" fill="${LIGHT}"/><rect x="30" y="4" width="24" height="14" rx="6" fill="${MID}"/>
            <path d="M26 34l6 6 12-12M26 54l6 6 12-12" stroke="${BLUE}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
            <circle cx="72" cy="70" r="22" fill="${BLUE}"/><path d="M72 58v12l8 5" stroke="#fff" stroke-width="6" stroke-linecap="round" fill="none"/>`,
  bill: `<path d="M20 6h60v82l-10-8-10 8-10-8-10 8-10-8-10 8z" fill="${LIGHT}"/>
         <rect x="32" y="26" width="36" height="6" rx="3" fill="${MID}"/><rect x="32" y="42" width="24" height="6" rx="3" fill="${MID}"/>
         <circle cx="72" cy="64" r="21" fill="${BLUE}"/><text x="72" y="74" font-size="27" font-weight="700" fill="#fff" text-anchor="middle" font-family="sans-serif">฿</text>`,
  help: `<path d="M18 56V44a32 32 0 0164 0v12" stroke="${LIGHT}" stroke-width="9" fill="none" stroke-linecap="round"/>
         <rect x="6" y="52" width="20" height="30" rx="10" fill="${LIGHT}"/><rect x="74" y="52" width="20" height="30" rx="10" fill="${LIGHT}"/>
         <path d="M40 74h28a10 10 0 0110 10v2a10 10 0 01-10 10H52l-12 8z" fill="${BLUE}"/>`,
};

const BUTTONS = [
  { icon: 'add', title: 'บันทึกงานวันนี้', sub: 'จดงาน / รับเงิน / รายรับ' },
  { icon: 'slip', title: 'แนบสลิป/หลักฐาน', sub: 'รูปสลิป / ใบเสร็จ / เอกสาร' },
  { icon: 'recent', title: 'รายการล่าสุด', sub: 'ดูรายการที่บันทึก' },
  { icon: 'chart', title: 'สรุปวันนี้', sub: 'ยอดรับ / ยอดค้าง / งานวันนี้' },
  { icon: 'edit', title: 'แก้ไขล่าสุด', sub: 'แก้ข้อความ / แก้ยอด' },
  { icon: 'trash', title: 'ยกเลิกล่าสุด', sub: 'ลบหรือยกเลิกรายการ' },
  { icon: 'pending', title: 'ค้างรับ & ติดตามงาน', sub: 'งานค้าง / มัดจำ / สถานะ' },
  { icon: 'bill', title: 'ออกบิล & ใบเสร็จ', sub: 'รวมบิล / รับชำระ / ใบเสร็จ' },
  { icon: 'help', title: 'ช่วยเหลือ', sub: 'วิธีใช้ / ติดต่อเรา' },
];

// Thai has no spaces inside a word, and Chromium will break one mid-word to
// make it fit. Size each title so it never has to.
const titleSize = (t) => (t.length <= 13 ? 48 : t.length <= 17 ? 42 : 38);

const cards = BUTTONS.map(
  (b, i) => `<div class="cell" style="grid-column:${(i % COLS) + 1};grid-row:${Math.floor(i / COLS) + 1}">
    <div class="card">
      <div class="num">${i + 1}</div>
      <svg class="ic" viewBox="0 0 100 100">${ICONS[b.icon]}</svg>
      <div class="t" style="font-size:${titleSize(b.title)}px">${b.title}</div>
      <div class="s">${b.sub}</div>
      <div class="rule"></div>
    </div></div>`
).join('');

const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><style>
@font-face{font-family:'NST';src:url(data:font/woff2;base64,${font400}) format('woff2');font-weight:400}
@font-face{font-family:'NST';src:url(data:font/woff2;base64,${font700}) format('woff2');font-weight:700}
*{box-sizing:border-box;margin:0}
body{width:${W}px;height:${H}px;font-family:'NST',sans-serif;overflow:hidden;position:relative;color:#fff;
  background:
    radial-gradient(900px 620px at 18% 26%, rgba(46,125,247,.20), transparent 62%),
    radial-gradient(760px 520px at 82% 78%, rgba(46,125,247,.13), transparent 60%),
    linear-gradient(150deg,#080B12 0%,#05070C 55%,#080B12 100%)}
.panel{position:absolute;left:40px;top:${TOP + 40}px;width:${PANEL_W - 110}px;height:${H - TOP - FOOTER_H - 80}px;
  border-radius:46px;background:linear-gradient(160deg,rgba(20,28,44,.94),rgba(8,12,20,.94));
  border:2px solid rgba(46,125,247,.34);box-shadow:0 0 70px rgba(46,125,247,.16) inset,0 18px 44px rgba(0,0,0,.55);
  overflow:visible;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:26px;padding:34px}
.panel .logo{width:${PANEL_W - 240}px;border-radius:34px}
.panel .wave{position:absolute;right:-24px;top:-34px;width:220px;filter:drop-shadow(0 10px 20px rgba(0,0,0,.6))}
.panel .sleepy{position:absolute;left:-6px;bottom:-18px;width:280px;filter:drop-shadow(0 10px 20px rgba(0,0,0,.6))}
.badge{display:flex;align-items:center;gap:16px;padding:16px 34px;border-radius:999px;
  background:rgba(46,125,247,.13);border:2px solid rgba(46,125,247,.42)}
.badge .line{padding:8px 20px;border-radius:999px;background:#06C755;color:#fff;font-weight:700;font-size:26px;
  display:flex;align-items:center;justify-content:center;letter-spacing:1px}
.badge span{font-size:34px;color:#D8E4F7}
.grid{position:absolute;left:${PANEL_W}px;top:${TOP}px;width:${W - PANEL_W}px;height:${CELL_H * ROWS}px;
  display:grid;grid-template-columns:repeat(${COLS},${CELL_W}px);grid-template-rows:repeat(${ROWS},${CELL_H}px)}
.cell{padding:18px 16px;display:flex}
.card{position:relative;flex:1;border-radius:34px;padding:30px 20px 34px;text-align:center;
  background:linear-gradient(165deg,rgba(20,27,42,.92),rgba(10,14,23,.92));
  border:2px solid rgba(120,150,200,.20);box-shadow:0 14px 30px rgba(0,0,0,.45);
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px}
.num{position:absolute;left:22px;top:20px;width:52px;height:52px;border-radius:16px;background:${BLUE};
  font-weight:700;font-size:30px;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 16px rgba(46,125,247,.5)}
.ic{width:150px;height:150px;filter:drop-shadow(0 8px 14px rgba(0,0,0,.55))}
.t{font-weight:700;line-height:1.15;color:#fff;white-space:nowrap}
.s{font-weight:400;font-size:27px;line-height:1.3;color:#93A3BC;max-width:470px}
.rule{width:70px;height:5px;border-radius:3px;background:${BLUE};margin-top:10px;box-shadow:0 0 14px rgba(46,125,247,.75)}
</style></head><body>
<div class="panel">
  <img class="logo" src="data:image/jpeg;base64,${logo}">
  <div class="badge"><div class="line">LINE</div><span>ผู้ช่วยบันทึกงานวันนี้ใน LINE</span></div>
  <img class="wave" src="data:image/png;base64,${waveDog}">
  <img class="sleepy" src="data:image/png;base64,${sleepDog}">
</div>
<div class="grid">${cards}</div>
</body></html>`;

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const page = await browser.newPage({ viewport: { width: W, height: H } });
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
console.log(`tap grid: ${COLS}x${ROWS} cells of ${CELL_W}x${CELL_H} from x=${PANEL_W} y=${TOP}`);
if (errs.length) {
  console.error('page errors:\n' + errs.join('\n'));
  process.exit(1);
}
// LINE rejects a Rich Menu image above 1 MB.
if (kb > 1024) {
  console.error(`too big for LINE: ${kb.toFixed(0)} KB > 1024 KB`);
  process.exit(1);
}
