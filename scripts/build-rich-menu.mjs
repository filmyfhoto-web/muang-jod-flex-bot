// Draws assets/rich-menu.jpg — the 2500x1686 Rich Menu artwork — with headless
// Chromium, so the layout below stays the single source of truth for it.
//
// The three tools it needs are not runtime dependencies of the bot, so install
// them only when redrawing:
//   npm i --no-save playwright @fontsource/noto-sans-thai sharp
//   node scripts/build-rich-menu.mjs
//
// Geometry must stay in step with LAYOUT in create-rich-menu.js. Every cell
// here is tappable, the brand footer included — the old menu had a decorative
// panel that people pressed anyway.
import { chromium } from 'playwright';
import { readFileSync, statSync } from 'node:fs';
import sharp from 'sharp';

const ROOT = new URL('..', import.meta.url).pathname;
const b64 = (p) => readFileSync(ROOT + p).toString('base64');
const font400 = b64('node_modules/@fontsource/noto-sans-thai/files/noto-sans-thai-thai-400-normal.woff2');
const font700 = b64('node_modules/@fontsource/noto-sans-thai/files/noto-sans-thai-thai-700-normal.woff2');

// Cut-outs on transparent ground, so they sit on a card without a seam.
// The clipboard-and-pen pose, closest to the design's dog holding a checklist.
// mascot-pen.png is the same dog sitting side-on with only a pencil.
const dogPen = b64('public/brand/mascot.png');
const dogHappy = b64('public/brand/mascot-happy.png');

// ---------------------------------------------------------------- geometry --
// Light cards on a deep navy ground: one big "จดงาน" panel down the left with
// a 2x2 of cards beside it, a row of three under both, and the brand footer.
const W = 2500, H = 1686;
const PAD = 68;
const GAP_X = 42, GAP_Y = 36;

const LEFT_X = PAD, LEFT_W = 1175;
const COL1_X = LEFT_X + LEFT_W + GAP_X;      // 1285
const COL_W = 552;
const COL2_X = COL1_X + COL_W + GAP_X;       // 1879

const ROW1_Y = 36, ROW_H = 455;
const ROW2_Y = ROW1_Y + ROW_H + GAP_Y;       // 527
const BIG_Y = ROW1_Y, BIG_H = ROW_H * 2 + GAP_Y; // 946 — spans both right rows

const ROW3_Y = ROW2_Y + ROW_H + GAP_Y;       // 1018
const ROW3_H = 400;
const FOOT_Y = ROW3_Y + ROW3_H;              // 1418
const FOOT_H = H - FOOT_Y;                   // 268

// ------------------------------------------------------------------ colours --
const NAVY = '#17357E', INK = '#1B2540', SUB = '#3D4C73';
const BLUE = '#2E7DF7', PURPLE = '#7C3AED', RED = '#E5484D', GREEN = '#22A06B';

// Flat icons for light cards: a filled body plus one accent, as in the design.
const ICONS = {
  recent: `<rect x="12" y="14" width="76" height="60" rx="14" fill="none" stroke="${BLUE}" stroke-width="7"/>
           <path d="M34 74l-6 16 22-16z" fill="${BLUE}"/>
           <circle cx="50" cy="44" r="19" fill="none" stroke="${BLUE}" stroke-width="7"/>
           <path d="M50 33v12l9 6" stroke="${BLUE}" stroke-width="7" stroke-linecap="round" fill="none"/>`,
  slip: `<rect x="10" y="10" width="66" height="80" rx="14" fill="none" stroke="${BLUE}" stroke-width="7"/>
         <circle cx="30" cy="32" r="8" fill="#F5A524"/>
         <path d="M16 72l18-22 12 14 10-10 14 18z" fill="#AEBACD"/>
         <circle cx="78" cy="70" r="21" fill="${BLUE}"/>
         <path d="M78 60v20M69 69l9-9 9 9" stroke="#fff" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
  pending: `<rect x="8" y="24" width="70" height="52" rx="13" fill="${RED}"/>
            <circle cx="26" cy="42" r="5.5" fill="#fff"/><circle cx="26" cy="60" r="5.5" fill="#fff"/>
            <rect x="38" y="37" width="30" height="9" rx="4.5" fill="#fff"/>
            <rect x="38" y="55" width="22" height="9" rx="4.5" fill="#fff"/>
            <circle cx="76" cy="70" r="21" fill="#fff" stroke="${RED}" stroke-width="5"/>
            <path d="M76 59v12l8 5" stroke="${RED}" stroke-width="6" stroke-linecap="round" fill="none"/>`,
  category: `<path d="M50 8a42 42 0 1042 42H50z" fill="${GREEN}"/>
             <path d="M50 8v42h42A42 42 0 0050 8z" fill="#EDE9FE"/>
             <path d="M50 8v42h30A42 42 0 0050 8z" fill="${PURPLE}"/>`,
  receipt: `<path d="M50 86S14 64 14 40a20 20 0 0136-12 20 20 0 0136 12c0 24-36 46-36 46z" fill="${PURPLE}"/>`,
  // A body plus four bars crossing it reads as eight teeth, and stays clean at
  // this size — a hand-written gear outline turned into a blob.
  settings: `<g fill="${PURPLE}"><circle cx="50" cy="50" r="33"/>
             <rect x="43" y="6" width="14" height="88" rx="7"/>
             <rect x="43" y="6" width="14" height="88" rx="7" transform="rotate(45 50 50)"/>
             <rect x="43" y="6" width="14" height="88" rx="7" transform="rotate(90 50 50)"/>
             <rect x="43" y="6" width="14" height="88" rx="7" transform="rotate(135 50 50)"/></g>
             <circle cx="50" cy="50" r="14" fill="#fff"/>`,
  help: `<path d="M16 58V46a34 34 0 0168 0v12" stroke="${PURPLE}" stroke-width="10" fill="none" stroke-linecap="round"/>
         <rect x="4" y="54" width="22" height="34" rx="11" fill="${PURPLE}"/>
         <rect x="74" y="54" width="22" height="34" rx="11" fill="${PURPLE}"/>`,
};

// ------------------------------------------------------------------- cards --
// Order matters: it is the order of AREAS in create-rich-menu.js.
const SMALL = [
  { icon: 'recent', title: 'รายการล่าสุด/แก้ไข', x: COL1_X, y: ROW1_Y, w: COL_W, h: ROW_H, bg: 'card-pale' },
  { icon: 'slip', title: 'บันทึก/แนบสลิป', x: COL2_X, y: ROW1_Y, w: COL_W, h: ROW_H, bg: 'card-pale' },
  { icon: 'pending', title: 'งานค้าง', sub: 'ดูงานทั้งหมด', x: COL1_X, y: ROW2_Y, w: COL_W, h: ROW_H, bg: 'card-pink', big: true },
  { icon: 'category', title: 'หมวดงาน', x: COL1_X, y: ROW2_Y, w: COL_W, h: ROW_H, bg: 'card-green', big: true, at: 'col2' },
  { icon: 'settings', title: 'ตั้งค่า', sub: 'ปรับแต่งแอป', x: COL1_X, y: ROW3_Y, w: COL_W, h: ROW3_H, bg: 'card-pale', row: true },
  { icon: 'help', title: 'ช่วยเหลือ', sub: 'แจ้งเตือนงาน', x: COL2_X, y: ROW3_Y, w: COL_W, h: ROW3_H, bg: 'card-pale', row: true },
];
// The two that sit in the second right-hand column / third row are placed by x
// above; fix the ones flagged so the list reads in visual order.
SMALL[3].x = COL2_X;

const card = (c) => `
  <div class="card ${c.bg} ${c.row ? 'wide' : ''}" style="left:${c.x}px;top:${c.y}px;width:${c.w}px;height:${c.h}px">
    <svg class="ic ${c.big ? 'ic-lg' : ''}" viewBox="0 0 100 100">${ICONS[c.icon]}</svg>
    <div class="t ${c.big ? 't-lg' : ''}">${c.title}</div>
    ${c.sub ? `<div class="s">${c.sub}</div>` : ''}
  </div>`;

const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><style>
@font-face{font-family:'NST';src:url(data:font/woff2;base64,${font400}) format('woff2');font-weight:400}
@font-face{font-family:'NST';src:url(data:font/woff2;base64,${font700}) format('woff2');font-weight:700}
*{box-sizing:border-box;margin:0}
body{width:${W}px;height:${H}px;font-family:'NST',sans-serif;overflow:hidden;position:relative;
  background:
    radial-gradient(1100px 760px at 22% 30%, rgba(58,120,220,.30), transparent 64%),
    radial-gradient(900px 620px at 84% 76%, rgba(46,110,210,.20), transparent 62%),
    linear-gradient(158deg,#1B3E86 0%,#153366 52%,#10264E 100%)}

.card{position:absolute;border-radius:40px;display:flex;flex-direction:column;
  align-items:center;justify-content:center;gap:18px;padding:28px;text-align:center;
  box-shadow:0 16px 34px rgba(0,0,0,.26)}
.card-pale{background:linear-gradient(168deg,#FFFFFF 0%,#EAF2FE 100%)}
.card-pink{background:linear-gradient(168deg,#FBD3D7 0%,#F6BEC5 100%)}
.card-green{background:linear-gradient(168deg,#D6F0DE 0%,#C3E7D0 100%)}
/* The bottom row is short and wide, so its icon sits beside the words. */
.card.wide{flex-direction:row;gap:34px;justify-content:center}
.card.wide .ic{margin:0}
.card.wide .stack{text-align:left}
.ic{width:180px;height:180px;flex:none}
.ic-lg{width:200px;height:200px}
.t{font-weight:700;font-size:58px;line-height:1.15;color:${NAVY};white-space:nowrap}
.t-lg{font-size:76px}
.s{font-weight:400;font-size:40px;color:${SUB};white-space:nowrap}

/* จดงาน — the big panel. Everything else is one tap; this is the one people
   look for, so it gets the room, the mascot and the wordmark. */
.big{position:absolute;left:${LEFT_X}px;top:${BIG_Y}px;width:${LEFT_W}px;height:${BIG_H}px;
  border-radius:44px;background:linear-gradient(150deg,#F4F9FF 0%,#E4EEFC 60%,#F7FBFF 100%);
  box-shadow:0 18px 40px rgba(0,0,0,.28);overflow:hidden}
.big h1{position:absolute;left:64px;top:34px;font-size:196px;font-weight:700;color:${NAVY};line-height:1}
.big .lead{position:absolute;left:70px;top:262px;font-size:56px;font-weight:400;color:${SUB};line-height:1.35}
.big .plus{position:absolute;left:74px;top:452px;width:150px;height:150px;border-radius:50%;
  background:${BLUE};box-shadow:0 12px 26px rgba(46,125,247,.45)}
.big .plus::before,.big .plus::after{content:'';position:absolute;background:#fff;border-radius:8px}
.big .plus::before{left:50%;top:34px;width:14px;height:82px;margin-left:-7px}
.big .plus::after{top:50%;left:34px;height:14px;width:82px;margin-top:-7px}
.big .dog{position:absolute;right:22px;bottom:96px;height:660px}
/* The wordmark, drawn rather than pasted, so it stays sharp at this size. */
.mark{position:absolute;right:56px;bottom:26px;display:flex;align-items:center;gap:6px;
  padding:16px 40px;border-radius:26px;background:#11224A;box-shadow:0 10px 24px rgba(0,0,0,.35)}
.mark b{font-size:66px;font-weight:700;line-height:1}
.mark .m1{color:#A78BFA}
.mark .m2{color:#fff}

/* ออกใบเสร็จ — wide, and the only lavender card. */
.bill{position:absolute;left:${LEFT_X}px;top:${ROW3_Y}px;width:${LEFT_W}px;height:${ROW3_H}px;
  border-radius:40px;background:linear-gradient(150deg,#EFE7FB 0%,#E1D5F7 100%);
  box-shadow:0 16px 34px rgba(0,0,0,.26);display:flex;align-items:center;gap:34px;padding:0 40px;overflow:hidden}
.bill .disc{width:150px;height:150px;border-radius:50%;background:#F3EDFF;
  display:flex;align-items:center;justify-content:center;flex:none}
.bill .disc svg{width:96px;height:96px}
.bill .txt{flex:1}
.bill .bt{font-weight:700;font-size:76px;color:${NAVY};line-height:1.1;white-space:nowrap}
.bill .bs{font-weight:400;font-size:40px;color:${SUB};margin-top:6px;white-space:nowrap}
.bill .dog2{height:330px;flex:none;margin-bottom:-18px}

/* Brand footer — tappable, and it says so by being the wordmark. */
.foot{position:absolute;left:0;top:${FOOT_Y}px;width:${W}px;height:${FOOT_H}px;
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px}
.foot .fw{font-weight:700;font-size:74px;color:#fff;letter-spacing:.5px}
.foot .ft{font-weight:400;font-size:40px;color:#B9C9E6}
</style></head><body>

<div class="big">
  <h1>จดงาน</h1>
  <div class="lead">จดงานง่ายๆ<br>แค่ไม่กี่ขั้นตอน</div>
  <div class="plus"></div>
  <img class="dog" src="data:image/png;base64,${dogPen}">
  <div class="mark"><b class="m1">ม่วง</b><b class="m2">จดให้</b></div>
</div>

${SMALL.filter((c) => !c.row).map(card).join('')}

<div class="bill">
  <div class="disc"><svg viewBox="0 0 100 100">${ICONS.receipt}</svg></div>
  <div class="txt">
    <div class="bt">ออกใบเสร็จ</div>
    <div class="bs">สร้างใบเสร็จได้ทันที</div>
  </div>
  <img class="dog2" src="data:image/png;base64,${dogHappy}">
</div>

${SMALL.filter((c) => c.row)
  .map(
    (c) => `<div class="card ${c.bg} wide" style="left:${c.x}px;top:${c.y}px;width:${c.w}px;height:${c.h}px">
      <svg class="ic" viewBox="0 0 100 100">${ICONS[c.icon]}</svg>
      <div class="stack"><div class="t">${c.title}</div><div class="s">${c.sub}</div></div>
    </div>`
  )
  .join('')}

<div class="foot">
  <div class="fw">ม่วงจดให้ 🐾</div>
  <div class="ft">จดงานให้ · จดเงินให้ · อยู่ข้างคุณเสมอ</div>
</div>
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

// JPEG, not PNG. The menu is two photographic cut-outs over wide gradients: as
// a PNG it lands at ~1.5 MB, and squeezing that under LINE's 1 MB cap with a
// 256-colour palette put visible blotches in the smooth card backgrounds.
const out = ROOT + 'assets/rich-menu.jpg';
const meta = await sharp(buf).metadata();
await sharp(buf).jpeg({ quality: 92, chromaSubsampling: '4:4:4', mozjpeg: true }).toFile(out);

const kb = statSync(out).size / 1024;
console.log(`rendered ${meta.width}x${meta.height} -> assets/rich-menu.jpg (${kb.toFixed(0)} KB)`);
console.log(`big: ${LEFT_X},${BIG_Y} ${LEFT_W}x${BIG_H} · bill: ${LEFT_X},${ROW3_Y} ${LEFT_W}x${ROW3_H}`);
console.log(`cols: ${COL1_X} / ${COL2_X} width ${COL_W} · rows: ${ROW1_Y} / ${ROW2_Y} height ${ROW_H} · row3 ${ROW3_Y} height ${ROW3_H}`);
console.log(`footer: y=${FOOT_Y} height ${FOOT_H}`);
if (errs.length) {
  console.error('page errors:\n' + errs.join('\n'));
  process.exit(1);
}
// LINE rejects a Rich Menu image above 1 MB.
if (kb > 1024) {
  console.error(`too big for LINE: ${kb.toFixed(0)} KB > 1024 KB`);
  process.exit(1);
}
