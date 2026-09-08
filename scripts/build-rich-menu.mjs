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

// The brand lockup (mascot + wordmark) already sits on a dark ground. Its own
// dead margin above the mascot and below the tagline is trimmed here so the
// panel can show the artwork itself as large as the design does.
const logo = (await sharp(ROOT + 'public/brand/logo-dark.jpg')
  .resize({ width: 900 })
  .extract({ left: 0, top: 80, width: 900, height: 755 })
  .jpeg({ quality: 90 })
  .toBuffer()).toString('base64');

// Geometry — mirrored by LAYOUT in create-rich-menu.js.
const W = 2500, H = 1686;
const PANEL_W = 860;        // brand panel, not tappable
const TOP = 26;             // margin above the first row
const STRIP_H = 300;        // bottom strip — three more buttons, full width
const RIGHT = 40;           // margin after the last column, to match the panel's
const COLS = 4, ROWS = 2;
const CELL_W = Math.floor((W - PANEL_W - RIGHT) / COLS);
const CELL_H = Math.floor((H - TOP - STRIP_H) / ROWS);
const PANEL_H = 1150;       // brand panel, centred in the space beside the grid
const STRIP_COLS = 3;
const STRIP_W = Math.floor(W / STRIP_COLS);

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
  board: `<rect x="8" y="14" width="84" height="66" rx="10" fill="${LIGHT}"/><rect x="16" y="22" width="30" height="22" rx="5" fill="${BLUE}"/>
          <rect x="52" y="22" width="24" height="22" rx="5" fill="${MID}"/><rect x="16" y="50" width="60" height="8" rx="4" fill="${MID}"/>
          <rect x="16" y="63" width="42" height="8" rx="4" fill="${MID}"/><rect x="36" y="84" width="28" height="8" rx="4" fill="${MID}"/>`,
  bell: `<path d="M50 8a26 26 0 0126 26v18l10 12H14l10-12V34A26 26 0 0150 8z" fill="${LIGHT}"/>
         <path d="M38 70a12 12 0 0024 0z" fill="${MID}"/><circle cx="76" cy="24" r="14" fill="${BLUE}"/>`,
  bill: `<path d="M20 6h60v82l-10-8-10 8-10-8-10 8-10-8-10 8z" fill="${LIGHT}"/>
         <rect x="32" y="26" width="36" height="6" rx="3" fill="${MID}"/><rect x="32" y="42" width="24" height="6" rx="3" fill="${MID}"/>
         <circle cx="72" cy="64" r="21" fill="${BLUE}"/><text x="72" y="74" font-size="27" font-weight="700" fill="#fff" text-anchor="middle" font-family="sans-serif">฿</text>`,
  help: `<path d="M18 56V44a32 32 0 0164 0v12" stroke="${LIGHT}" stroke-width="9" fill="none" stroke-linecap="round"/>
         <rect x="6" y="52" width="20" height="30" rx="10" fill="${LIGHT}"/><rect x="74" y="52" width="20" height="30" rx="10" fill="${LIGHT}"/>
         <path d="M40 74h28a10 10 0 0110 10v2a10 10 0 01-10 10H52l-12 8z" fill="${BLUE}"/>`,
};

// `title` is written as the lines it should break into: Thai has no spaces, so
// left to itself Chromium splits a word mid-syllable. Subtitles are kept short
// enough for one line — on a phone the card is about 90px wide, and anything
// longer is decoration nobody can read.
const BUTTONS = [
  { icon: 'add', title: ['บันทึกงาน', 'วันนี้'], sub: 'จดงาน / รับเงิน' },
  { icon: 'slip', title: ['แนบสลิป/', 'หลักฐาน'], sub: 'สลิป / ใบเสร็จ' },
  { icon: 'recent', title: ['รายการ', 'ล่าสุด'], sub: 'ดูงานที่บันทึก' },
  { icon: 'chart', title: ['สรุปวันนี้'], sub: 'ยอดรับ / ยอดค้าง' },
  { icon: 'edit', title: ['แก้ไข', 'ล่าสุด'], sub: 'แก้ข้อความ / ยอด' },
  { icon: 'trash', title: ['ยกเลิก', 'ล่าสุด'], sub: 'ลบรายการล่าสุด' },
  { icon: 'pending', title: ['ค้างรับ &', 'ติดตามงาน'], sub: 'งานค้าง / มัดจำ' },
  { icon: 'help', title: ['ช่วยเหลือ'], sub: 'วิธีใช้ / ติดต่อ' },
];

// The bottom strip — tappable, unlike the decorative strip it replaces.
const STRIP = [
  { icon: 'board', title: 'แดชบอร์ด', sub: 'ดูภาพรวมงานทั้งหมด' },
  { icon: 'bill', title: 'ออกบิล', sub: 'รวมบิล / รับชำระ' },
  { icon: 'bell', title: 'ตั้งแจ้งเตือนงาน', sub: 'เตือนตามเวลาที่ตั้ง' },
];

const cards = BUTTONS.map(
  (b, i) => `<div class="cell" style="grid-column:${(i % COLS) + 1};grid-row:${Math.floor(i / COLS) + 1}">
    <div class="card">
      <div class="num">${i + 1}</div>
      <svg class="ic" viewBox="0 0 100 100">${ICONS[b.icon]}</svg>
      <div class="t">${b.title.join('<br>')}</div>
      <div class="s">${b.sub}</div>
      <div class="rule"></div>
    </div></div>`
).join('');

const strip = STRIP.map(
  (b, i) => `<div class="scard" style="left:${i * STRIP_W + 18}px;width:${STRIP_W - 36}px">
    <svg class="sic" viewBox="0 0 100 100">${ICONS[b.icon]}</svg>
    <div><div class="st">${b.title}</div><div class="ss">${b.sub}</div></div>
  </div>`
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
.panel{position:absolute;left:40px;top:${TOP + Math.round((H - TOP - STRIP_H - PANEL_H) / 2)}px;
  width:${PANEL_W - 110}px;height:${PANEL_H}px;
  border-radius:46px;background:linear-gradient(160deg,rgba(20,28,44,.94),rgba(8,12,20,.94));
  border:2px solid rgba(46,125,247,.34);box-shadow:0 0 70px rgba(46,125,247,.16) inset,0 18px 44px rgba(0,0,0,.55);
  overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:30px;padding:24px 0}
/* Wider than the panel on purpose: the artwork's own side margins are what
   gets clipped, so the mascot and wordmark read as large as in the design.
   The mask fades its square edge into the panel instead of showing a seam. */
.panel .logo{width:${Math.round((PANEL_W - 110) * 1.37)}px;flex:none;
  -webkit-mask-image:linear-gradient(to bottom,transparent 0,#000 70px,#000 calc(100% - 46px),transparent 100%)}
.strip{position:absolute;left:0;top:${H - STRIP_H}px;width:${W}px;height:${STRIP_H}px}
.scard{position:absolute;top:16px;height:${STRIP_H - 40}px;border-radius:34px;display:flex;align-items:center;gap:26px;padding:0 34px;
  background:linear-gradient(165deg,rgba(20,27,42,.94),rgba(10,14,23,.94));border:2px solid rgba(46,125,247,.30);
  box-shadow:0 12px 26px rgba(0,0,0,.5)}
.sic{width:150px;height:150px;flex:none;filter:drop-shadow(0 6px 12px rgba(0,0,0,.55))}
.st{font-weight:700;font-size:60px;color:#fff;white-space:nowrap}
.ss{font-weight:400;font-size:38px;color:#93A3BC;margin-top:4px}
.badge{display:flex;align-items:center;gap:16px;padding:16px 34px;border-radius:999px;
  background:rgba(46,125,247,.13);border:2px solid rgba(46,125,247,.42)}
.badge .line{padding:8px 20px;border-radius:999px;background:#06C755;color:#fff;font-weight:700;font-size:26px;
  display:flex;align-items:center;justify-content:center;letter-spacing:1px}
.badge span{font-size:40px;color:#D8E4F7}
.grid{position:absolute;left:${PANEL_W}px;top:${TOP}px;width:${CELL_W * COLS}px;height:${CELL_H * ROWS}px;
  display:grid;grid-template-columns:repeat(${COLS},${CELL_W}px);grid-template-rows:repeat(${ROWS},${CELL_H}px)}
.cell{padding:18px 14px;display:flex}
.card{position:relative;flex:1;border-radius:34px;padding:30px 14px 34px;text-align:center;
  background:linear-gradient(165deg,rgba(20,27,42,.92),rgba(10,14,23,.92));
  border:2px solid rgba(120,150,200,.20);box-shadow:0 14px 30px rgba(0,0,0,.45);
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px}
.num{position:absolute;left:22px;top:20px;width:52px;height:52px;border-radius:16px;background:${BLUE};
  font-weight:700;font-size:30px;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 16px rgba(46,125,247,.5)}
.ic{width:220px;height:220px;filter:drop-shadow(0 8px 14px rgba(0,0,0,.55))}
.t{font-weight:700;font-size:56px;line-height:1.18;color:#fff;white-space:nowrap;
  min-height:132px;display:flex;flex-direction:column;justify-content:center}
.s{font-weight:400;font-size:36px;line-height:1.3;color:#93A3BC;white-space:nowrap}
.rule{width:70px;height:5px;border-radius:3px;background:${BLUE};margin-top:10px;box-shadow:0 0 14px rgba(46,125,247,.75)}
</style></head><body>
<div class="panel">
  <img class="logo" src="data:image/jpeg;base64,${logo}">
  <div class="badge"><div class="line">LINE</div><span>ผู้ช่วยบันทึกงานวันนี้ใน LINE</span></div>
</div>
<div class="grid">${cards}</div>
<div class="strip">${strip}</div>
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
console.log(`tap grid: ${COLS}x${ROWS} cells of ${CELL_W}x${CELL_H} from x=${PANEL_W} y=${TOP} (right margin ${RIGHT})`);
console.log(`strip: ${STRIP_COLS} cells of ${STRIP_W}x${STRIP_H} from y=${H - STRIP_H}`);
if (errs.length) {
  console.error('page errors:\n' + errs.join('\n'));
  process.exit(1);
}
// LINE rejects a Rich Menu image above 1 MB.
if (kb > 1024) {
  console.error(`too big for LINE: ${kb.toFixed(0)} KB > 1024 KB`);
  process.exit(1);
}
