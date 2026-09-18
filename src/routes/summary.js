import express from 'express';
import { escapeHtml } from '../utils/html.js';
import { getBillByToken, isCancelledToken } from '../services/billService.js';
import { getShopProfile } from '../services/shopService.js';
import { formatBaht, numText } from '../utils/currency.js';
import { formatThaiDate } from '../utils/dates.js';
import { buildOrderSummary } from '../utils/orderSummary.js';
import { SHEET_CANVAS_JS, SHEET_SHOT_JS, SHEET_SHOT_CSS } from './sheetCanvas.js';
import { SUMMARY_IMAGE_JS, summaryImageData, summaryShotHtml, jsonScript } from './summaryImage.js';
import { logger } from '../services/logger.js';

/* ใบสรุปใบสั่ง ที่ /s/<share_token>
 *
 * ร้านส่งตัวอย่าง "สรุปใบสั่งทำสติ๊กเกอร์" มาแล้วบอกว่า "อยากทำใบสรุปราคาแบบนี้
 * ไปด้วย" — ตารางแยกตามวันที่สั่ง แต่ละวันมีรายการ ขนาด ตร.ม. จำนวนแผ่น ราคา
 * แล้วปิดท้ายด้วยยอดรวมที่แยกค่าสินค้ากับค่าส่ง
 *
 * ใช้โทเคนเดียวกับใบเสร็จ เพราะมันคือบิลใบเดียวกัน มองคนละมุม — ใบเสร็จตอบว่า
 * "ต้องจ่ายเท่าไหร่" ใบนี้ตอบว่า "สั่งอะไรไปบ้าง วันไหน กี่แผ่น"
 */

const PALETTE = ['#e8608c', '#3d7fd1', '#3fa86b', '#8b6fd4', '#e08a3c'];

function dayCard(day, index) {
  const color = PALETTE[index % PALETTE.length];
  // ค่าส่งไม่ใช่ของที่ทำให้ลูกค้า จึงไม่นับลำดับรวมกับของ และไม่มีจำนวนแผ่น
  let no = 0;
  const rows = day.lines
    .map((l) => {
      const size = l.size ? escapeHtml(l.size) : '–';
      return `<tr${l.shipping ? ' class="shiprow"' : ''}>
        <td class="c">${l.shipping ? '' : ++no}</td>
        <td>${escapeHtml(l.name)}${l.size ? `<small class="sz">${size}</small>` : ''}</td>
        <td class="c col-size">${l.shipping ? '–' : size}</td>
        <td class="c col-sqm">${!l.shipping && l.sqm > 0 ? escapeHtml(numText(l.sqm)) : '–'}</td>
        <td class="c">${!l.shipping && l.sheets > 0 ? escapeHtml(numText(l.sheets)) : '–'}</td>
        <td class="amt">${escapeHtml(formatBaht(l.amount))}</td>
      </tr>`;
    })
    .join('');

  return `<section class="day">
    <h2 style="background:${color}">${escapeHtml(formatThaiDate(day.date))}</h2>
    <table>
      <thead><tr>
        <th class="c">ลำดับ</th><th>รายการ</th><th class="c col-size">ขนาด</th>
        <th class="c col-sqm">ตร.ม.</th><th class="c">แผ่น</th><th class="amt">ราคา</th>
      </tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr>
        <td colspan="2">รวม ${escapeHtml(formatThaiDate(day.date))}</td>
        <td class="col-size"></td><td class="col-sqm"></td>
        <td class="c">${escapeHtml(numText(day.totals.sheets))}</td>
        <td class="amt">${escapeHtml(formatBaht(day.totals.total))}</td>
      </tr></tfoot>
    </table>
  </section>`;
}

export function renderSummaryHtml(bill, shop = {}) {
  const s = buildOrderSummary(bill);
  const shopName = String(shop.shop_name || '').trim();
  const days = s.days.map(dayCard).join('');

  return `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>ใบสรุปใบสั่ง ${escapeHtml(s.billNumber || '')}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@400;500;600;700&display=swap" rel="stylesheet" />
<style>
  :root{--ink:#1f2937;--sub:#555;--grey:#8e8e93;--line:#e6e9f0;--pink:#e8608c;--tint:#fdf2f6}
  *{box-sizing:border-box}
  body{margin:0;padding:16px 12px 36px;background:#f7f4ff;color:var(--ink);
       font-family:'Noto Sans Thai',-apple-system,BlinkMacSystemFont,sans-serif;font-size:14px;line-height:1.5}
  .sheet{max-width:820px;margin:0 auto;background:#fff;border-radius:18px;padding:18px 16px 22px;
         box-shadow:0 10px 30px rgba(31,41,55,.08)}
  .head{text-align:center;margin-bottom:18px}
  .head h1{margin:0 0 4px;font-size:21px;font-weight:700;color:var(--pink)}
  .head .who{font-size:14px;font-weight:600}
  .head .meta{font-size:12px;color:var(--grey);margin-top:2px}

  .day{margin-bottom:18px}
  .day h2{margin:0 0 8px;display:inline-block;padding:5px 18px;border-radius:999px;
          color:#fff;font-size:15px;font-weight:700}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th,td{padding:7px 6px;border-bottom:1px solid var(--line);vertical-align:top}
  thead th{background:var(--tint);color:var(--sub);font-size:11.5px;font-weight:600;white-space:nowrap}
  .c{text-align:center;white-space:nowrap}
  .amt{text-align:right;white-space:nowrap;font-weight:600}
  tfoot td{background:var(--tint);font-weight:700;border-bottom:0}
  .shiprow td{color:var(--sub)}
  .ship{text-align:center;font-size:12px}

  /* กล่องสรุปทั้งหมด: แผ่นรวม · ค่าสินค้า · ค่าส่ง · รวมทั้งหมด */
  .grand{margin-top:20px;border:2px solid var(--pink);border-radius:14px;overflow:hidden}
  .grand .title{background:var(--tint);padding:8px 12px;font-weight:700;color:var(--pink)}
  .grand table{font-size:13px}
  .grand td{border-bottom:0;padding:10px 8px}
  .grand .k{color:var(--sub);font-size:11.5px;text-align:center}
  .grand .v{text-align:center;font-size:17px;font-weight:700}
  .grand .v.big{color:var(--pink);font-size:20px}
  .note{margin:10px 2px 0;font-size:12px;color:var(--grey);text-align:center}
  .foot{margin-top:16px;text-align:center;font-size:12.5px;color:var(--grey)}
  /* ปุ่มทำรูป — ใบนี้ถูกส่งต่อเข้าแชตไลน์เหมือนใบเสร็จ รูปจึงต้องมี ไม่ใช่ให้
     แคปหน้าจอเอาเองแล้วได้แถบเบราว์เซอร์ติดมาด้วย */
  .print{display:block;width:100%;margin-top:18px;padding:14px;border:0;border-radius:14px;
         background:var(--pink);color:#fff;font:inherit;font-weight:700;font-size:15.5px;cursor:pointer}
  .print:disabled{opacity:.6}
${SHEET_SHOT_CSS}
  @media print{.print,.shot{display:none}}
  /* ขนาดพิมพ์ซ้ำใต้ชื่อรายการ ซ่อนไว้บนจอกว้าง ใช้ตอนจอแคบที่คอลัมน์ขนาดถูกพับ */
  .sz{display:none;color:var(--grey);font-size:11px;font-weight:400}

  /* จอมือถือ: พับคอลัมน์ ขนาด กับ ตร.ม. ทิ้ง แล้วเอาขนาดไปไว้ใต้ชื่อแทน
     หกคอลัมน์บนจอ 393 จุดดันคอลัมน์ราคาหลุดขอบ ซึ่งคือคอลัมน์ที่ทั้งใบมีไว้เพื่อ
     ให้อ่าน — เลื่อนดูได้ไม่พอ ต้องเห็นโดยไม่ต้องเลื่อน */
  @media (max-width:560px){
    body{padding:10px 8px 28px}
    .sheet{padding:14px 10px 18px}
    table{font-size:12.5px}
    th,td{padding:6px 4px}
    .col-size,.col-sqm{display:none}
    .sz{display:block}
    .grand .k{font-size:11px}
    .grand .v{font-size:15px}
    .grand .v.big{font-size:17px}
  }
  @media print{body{background:#fff;padding:0}.sheet{box-shadow:none;border-radius:0;max-width:none}}
</style>
</head>
<body>
  <div class="sheet">
    <div class="head">
      <h1>สรุปใบสั่งทำ</h1>
      ${shopName ? `<div class="who">${escapeHtml(shopName)}</div>` : ''}
      <div class="meta">${escapeHtml(
        [s.billNumber, s.customerName ? `ลูกค้า: ${s.customerName}` : ''].filter(Boolean).join(' · ')
      )}</div>
    </div>

    ${days || '<p class="note">ยังไม่มีรายการในใบนี้</p>'}

    <div class="grand">
      <div class="title">📊 สรุปทั้งหมด</div>
      <table><tr>
        <td><div class="k">จำนวนแผ่น (รวม)</div><div class="v">${escapeHtml(numText(s.grand.sheets))}</div></td>
        <td><div class="k">ค่าสินค้า (บาท)</div><div class="v">${escapeHtml(formatBaht(s.grand.goods))}</div></td>
        <td><div class="k">ค่าส่ง (บาท)</div><div class="v">${escapeHtml(formatBaht(s.grand.shipping))}</div></td>
        <td><div class="k">รวมทั้งหมด (บาท)</div><div class="v big">${escapeHtml(formatBaht(s.charged))}</div></td>
      </tr></table>
    </div>
    ${
      s.adjusted
        ? `<p class="note">ยอดรายการรวมได้ ${escapeHtml(formatBaht(s.grand.total))} · ราคาที่ตกลงกัน ${escapeHtml(
            formatBaht(s.charged)
          )}</p>`
        : ''
    }

    <button class="print" id="make">📸 บันทึกเป็นรูป · ส่งให้ลูกค้า</button>
    <p class="foot">ขอบคุณที่ไว้วางใจนะคะ 💜</p>
  </div>

  ${summaryShotHtml(bill)}

<script id="summary-data" type="application/json">${jsonScript(summaryImageData(bill, shop))}</script>
<script>${SHEET_CANVAS_JS}</script>
<script>${SHEET_SHOT_JS}</script>
<script>${SUMMARY_IMAGE_JS}</script>
</body>
</html>`;
}

const router = express.Router();

router.get('/:token', async (req, res) => {
  try {
    const bill = await getBillByToken(req.params.token);
    if (!bill) {
      const cancelled = await isCancelledToken(req.params.token);
      const note = cancelled
        ? 'ใบนี้ถูกยกเลิกแล้วค่ะ ทางร้านจะออกใบใหม่ให้นะคะ'
        : 'ไม่พบใบสรุปนี้ค่ะ';
      return res.status(404).type('html').send(`<!doctype html><meta charset="utf-8"><p>${escapeHtml(note)}</p>`);
    }
    res.set('X-Robots-Tag', 'noindex, nofollow');
    res.set('Cache-Control', 'no-store');
    const shop = await getShopProfile(bill.user_id);
    res.type('html').send(renderSummaryHtml(bill, shop));
  } catch (err) {
    logger.error('summary.render_failed', { message: err?.message });
    res.status(500).type('html').send('<!doctype html><meta charset="utf-8"><p>เปิดใบสรุปไม่สำเร็จค่ะ</p>');
  }
});

export default router;
