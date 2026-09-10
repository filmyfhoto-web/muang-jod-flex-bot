import express from 'express';
import { escapeHtml } from '../utils/html.js';
import { getBillByToken } from '../services/billService.js';
import { getShopProfile, hasShopDetails } from '../services/shopService.js';
import { formatBaht } from '../utils/currency.js';
import { formatThaiDate, formatThaiDateTime } from '../utils/dates.js';
import { logger } from '../services/logger.js';

// Printable receipt at /r/<share_token>.
//
// The token is the authorisation — whoever holds the link can read that one
// bill, which is exactly what handing a customer a receipt means. So: nothing
// here is user-scoped, nothing but this bill is reachable, and the page is
// marked noindex so a shared link never turns up in a search engine.


export { escapeHtml };

// Draws the receipt onto a canvas and hands back a PNG.
//
// The shop asked for a picture, not a PDF: a picture goes straight into a LINE
// chat, and "พิมพ์ / บันทึกเป็น PDF" was a print dialog on a phone. Nothing is
// loaded from a CDN — a receipt has to work the moment it is needed, so the
// drawing is done by hand on a canvas rather than by an html-to-image library.
const RECEIPT_IMAGE_JS = String.raw`
(function () {
  var C = {
    purple: '#7c3aed', dark: '#5b21b6', soft: '#ede9fe', ink: '#1f2937',
    grey: '#8e8e93', line: '#ececf0', green: '#22a06b', red: '#e5484d', white: '#fff',
  };
  var W = 720, M = 40, P = 36, S = 2;
  var INNER = M + P, CW = W - 2 * M - 2 * P;

  var data;
  try { data = JSON.parse(document.getElementById('bill-data').textContent); } catch (e) { return; }

  function font(ctx, weight, size) {
    ctx.font = weight + ' ' + size + "px 'Noto Sans Thai', -apple-system, sans-serif";
  }

  // Break a line to fit a width, so a long job name stacks instead of running
  // off the edge of the picture.
  function wrap(ctx, text, maxWidth) {
    var words = String(text).split(/\s+/).filter(Boolean);
    if (!words.length) return [''];
    var lines = [], line = words[0];
    for (var i = 1; i < words.length; i++) {
      var next = line + ' ' + words[i];
      if (ctx.measureText(next).width <= maxWidth) line = next;
      else { lines.push(line); line = words[i]; }
    }
    lines.push(line);
    // A single unbroken word can still overflow — cut it by character.
    var out = [];
    for (var j = 0; j < lines.length; j++) {
      var l = lines[j];
      while (ctx.measureText(l).width > maxWidth && l.length > 1) {
        var k = l.length;
        while (k > 1 && ctx.measureText(l.slice(0, k)).width > maxWidth) k--;
        out.push(l.slice(0, k));
        l = l.slice(k);
      }
      out.push(l);
    }
    return out;
  }

  function roundRect(ctx, x, y, w, h, r, fill) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }

  var NAME_W = CW - 34 - 170;

  // Measure first: the sheet is as tall as its rows, and a canvas has to be
  // sized before anything is drawn on it.
  function layout(ctx) {
    font(ctx, '500', 19);
    var rows = data.rows.map(function (r) {
      return { row: r, lines: wrap(ctx, r.name, NAME_W) };
    });
    // 18 above, the name's lines, then the date's own line, then room under it
    // — the separator used to land on the date's baseline and strike it out.
    var rowsH = rows.reduce(function (s, r) { return s + 18 + r.lines.length * 26 + 33 + 1; }, 0);
    if (!rows.length) rowsH = 60;
    // ที่อยู่/เบอร์/เลขภาษีของร้าน และข้อความท้ายใบ ต้องกินความสูงของกระดาษ
    // ด้วย ไม่งั้นมันจะถูกวาดทับขอบล่าง
    var headExtra = data.shop.lines.length ? data.shop.lines.length * 20 + 6 : 0;
    var footExtra = data.shop.footer ? 26 : 0;
    var h = P + 104 + headExtra + 114 + rowsH + 22 + 96 + 54 + 14 + footExtra + P;
    return { rows: rows, rowsH: rowsH, sheetH: h };
  }

  function draw() {
    var probe = document.createElement('canvas').getContext('2d');
    var L = layout(probe);
    var H = L.sheetH + 2 * M;

    var cv = document.createElement('canvas');
    cv.width = W * S;
    cv.height = H * S;
    var ctx = cv.getContext('2d');
    ctx.scale(S, S);
    ctx.textBaseline = 'alphabetic';

    ctx.fillStyle = '#f7f4ff';
    ctx.fillRect(0, 0, W, H);
    roundRect(ctx, M, M, W - 2 * M, L.sheetH, 18, C.white);

    var y = M + P;

    // หัวใบเสร็จ: วงกลม ✓ หรือ ฿ แล้วตามด้วยชื่อเอกสาร
    ctx.beginPath();
    ctx.arc(INNER + 26, y + 26, 26, 0, Math.PI * 2);
    ctx.fillStyle = data.paid ? C.purple : '#e8833a';
    ctx.fill();
    font(ctx, '700', 26);
    ctx.fillStyle = C.white;
    ctx.textAlign = 'center';
    ctx.fillText(data.paid ? '✓' : '฿', INNER + 26, y + 35);
    ctx.textAlign = 'left';

    font(ctx, '700', 27);
    ctx.fillStyle = C.dark;
    ctx.fillText(data.title, INNER + 68, y + 26);
    // ชื่อร้านมาก่อนชื่อผู้ช่วย ใบเสร็จที่ยื่นให้ลูกค้าต้องบอกว่ามาจากร้านไหน
    if (data.shop.name) {
      font(ctx, '700', 18);
      ctx.fillStyle = C.ink;
    } else {
      font(ctx, '400', 16);
      ctx.fillStyle = C.grey;
    }
    ctx.fillText(data.shop.name || 'ม่วงจดให้ · ผู้ช่วยบันทึกงานใน LINE', INNER + 68, y + 50);

    y += 76;
    if (data.shop.lines.length) {
      font(ctx, '400', 15);
      ctx.fillStyle = C.grey;
      data.shop.lines.forEach(function (line, i) {
        wrap(ctx, line, CW).slice(0, 1).forEach(function (l) { ctx.fillText(l, INNER, y + 14 + i * 20); });
      });
      y += data.shop.lines.length * 20 + 6;
    }
    ctx.fillStyle = C.line;
    ctx.fillRect(INNER, y, CW, 1);
    y += 28;

    // แถบข้อมูล: เลขที่ / วันที่ / ลูกค้า
    roundRect(ctx, INNER, y, CW, 88, 12, C.soft);
    var colW = CW / 3;
    [['เลขที่', data.number], ['วันที่', data.date], ['ลูกค้า', data.customer]].forEach(function (pair, i) {
      var x = INNER + 16 + i * colW;
      font(ctx, '700', 15);
      ctx.fillStyle = C.dark;
      ctx.fillText(pair[0], x, y + 28);
      font(ctx, '400', 16);
      ctx.fillStyle = C.ink;
      wrap(ctx, pair[1], colW - 24).slice(0, 2).forEach(function (line, k) {
        ctx.fillText(line, x, y + 52 + k * 22);
      });
    });
    y += 88 + 26;

    // รายการ
    if (!L.rows.length) {
      font(ctx, '400', 18);
      ctx.fillStyle = C.grey;
      ctx.fillText('ไม่มีรายการ', INNER, y + 30);
      y += 60;
    } else {
      L.rows.forEach(function (r) {
        y += 18;
        font(ctx, '700', 18);
        ctx.fillStyle = C.purple;
        ctx.fillText(String(L.rows.indexOf(r) + 1), INNER, y + 19);

        font(ctx, '500', 19);
        ctx.fillStyle = C.ink;
        r.lines.forEach(function (line, k) { ctx.fillText(line, INNER + 34, y + 19 + k * 26); });

        font(ctx, '400', 15);
        ctx.fillStyle = C.grey;
        ctx.fillText(r.row.date, INNER + 34, y + 19 + r.lines.length * 26);

        font(ctx, '600', 19);
        ctx.fillStyle = C.ink;
        ctx.textAlign = 'right';
        ctx.fillText(r.row.amount, INNER + CW, y + 19);
        ctx.textAlign = 'left';

        y += r.lines.length * 26 + 33;
        ctx.fillStyle = C.line;
        ctx.fillRect(INNER, y, CW, 1);
        y += 1;
      });
    }

    y += 22;
    roundRect(ctx, INNER, y, CW, 76, 12, C.soft);
    font(ctx, '700', 20);
    ctx.fillStyle = C.ink;
    ctx.fillText('รวมทั้งสิ้น', INNER + 18, y + 47);
    font(ctx, '700', 32);
    ctx.fillStyle = C.purple;
    ctx.textAlign = 'right';
    ctx.fillText(data.total, INNER + CW - 18, y + 50);
    ctx.textAlign = 'left';
    y += 76 + 20;

    font(ctx, '600', 17);
    ctx.fillStyle = C.green;
    ctx.fillText('รับชำระแล้ว ' + data.paidAmount, INNER, y + 17);
    ctx.fillStyle = C.red;
    ctx.textAlign = 'right';
    ctx.fillText('คงเหลือ ' + data.balance, INNER + CW, y + 17);
    ctx.textAlign = 'left';
    y += 34 + 20;

    font(ctx, '400', 16);
    ctx.fillStyle = C.grey;
    ctx.textAlign = 'center';
    ctx.fillText('ขอบคุณที่ใช้บริการค่ะ 💜', W / 2, y);
    if (data.shop.footer) {
      y += 26;
      font(ctx, '400', 15);
      ctx.fillStyle = C.grey;
      wrap(ctx, data.shop.footer, CW).slice(0, 1).forEach(function (l) { ctx.fillText(l, W / 2, y); });
    }
    ctx.textAlign = 'left';

    return cv.toDataURL('image/png');
  }

  var btn = document.getElementById('make');
  var shot = document.getElementById('shot');
  var img = document.getElementById('shot-img');
  var dl = document.getElementById('shot-dl');

  btn.onclick = async function () {
    btn.disabled = true;
    var label = btn.textContent;
    btn.textContent = 'กำลังทำรูป…';
    try {
      // วาดหลังฟอนต์ไทยมาแล้ว ไม่งั้นตัวหนังสือจะกลายเป็นฟอนต์สำรอง
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      var url = draw();
      img.src = url;
      dl.href = url;
      shot.hidden = false;
    } catch (e) {
      btn.textContent = 'ทำรูปไม่สำเร็จ ลองใหม่อีกครั้งนะคะ';
      setTimeout(function () { btn.textContent = label; btn.disabled = false; }, 2200);
      return;
    }
    btn.textContent = label;
    btn.disabled = false;
  };

  document.getElementById('shot-close').onclick = function () { shot.hidden = true; };
})();
`;

// JSON safe to drop inside a <script> tag: only "<" can end the block early.
function jsonScript(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

// What the canvas needs to draw the receipt, so the picture and the page are
// built from one set of numbers rather than two.
function receiptData(bill, shop = {}) {
  const paid = bill.payment_status === 'paid';
  return {
    paid,
    shop: {
      name: shop.shop_name || null,
      lines: [shop.address, shop.phone ? `โทร. ${shop.phone}` : null, shop.tax_id ? `เลขประจำตัวผู้เสียภาษี ${shop.tax_id}` : null].filter(Boolean),
      footer: shop.footer_note || null,
    },
    title: paid ? 'ใบเสร็จรับเงิน' : 'ใบแจ้งยอด',
    number: bill.bill_number || '-',
    date: formatThaiDateTime(bill.issued_at || bill.created_at),
    customer: bill.customer_name || 'ไม่ระบุ',
    rows: (bill.jobs || []).map((j) => ({
      name: j.job_name || 'งาน',
      date: formatThaiDate(j.job_date),
      amount: formatBaht(Number(j.total) || 0),
    })),
    total: formatBaht(Number(bill.total) || 0),
    paidAmount: formatBaht(Number(bill.paid_amount) || 0),
    balance: formatBaht(Number(bill.balance_due) || 0),
  };
}

export function renderReceiptHtml(bill, shop = {}) {
  const jobs = bill.jobs || [];
  const paid = bill.payment_status === 'paid';
  const rows = jobs
    .map(
      (j, i) => `<tr>
        <td class="n">${i + 1}</td>
        <td>${escapeHtml(j.job_name || 'งาน')}<small>${escapeHtml(formatThaiDate(j.job_date))}</small></td>
        <td class="amt">${escapeHtml(formatBaht(Number(j.total) || 0))}</td>
      </tr>`
    )
    .join('');

  return `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>ใบเสร็จ ${escapeHtml(bill.bill_number || '')}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@400;500;700&display=swap" rel="stylesheet" />
<style>
  :root { --purple:#7c3aed; --purple-dark:#5b21b6; --purple-soft:#ede9fe; --ink:#1f2937; --sub:#555; --grey:#8e8e93; --line:#ececf0; --green:#22a06b; --red:#e5484d; }
  *{box-sizing:border-box}
  body{margin:0;background:#f7f4ff;color:var(--ink);font-family:'Noto Sans Thai',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:1.55;padding:18px}
  .sheet{max-width:520px;margin:0 auto;background:#fff;border-radius:18px;padding:24px;box-shadow:0 3px 18px rgba(91,33,182,.09)}
  .head{display:flex;align-items:center;gap:12px;border-bottom:1px solid var(--line);padding-bottom:16px}
  .mark{width:46px;height:46px;border-radius:50%;background:${paid ? 'var(--purple)' : '#e8833a'};color:#fff;display:grid;place-items:center;font-size:22px;font-weight:700;flex:none}
  h1{margin:0;font-size:19px;color:var(--purple-dark)}
  .head p{margin:0;font-size:12px;color:var(--grey)}
  .meta{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;background:var(--purple-soft);border-radius:12px;padding:12px;margin:16px 0}
  .meta div{font-size:12.5px}
  .meta b{display:block;color:var(--purple-dark)}
  table{width:100%;border-collapse:collapse;margin-top:6px}
  td{padding:10px 4px;border-bottom:1px solid var(--line);vertical-align:top}
  td.n{width:26px;color:var(--purple);font-weight:700}
  td small{display:block;color:var(--grey);font-size:11.5px}
  td.amt{text-align:right;white-space:nowrap;font-weight:600}
  .total{display:flex;justify-content:space-between;align-items:center;background:var(--purple-soft);border-radius:12px;padding:14px;margin-top:16px}
  .total b{font-size:22px;color:var(--purple)}
  .pay{display:flex;justify-content:space-between;font-size:13.5px;margin-top:10px}
  .paid{color:var(--green);font-weight:600}
  .due{color:var(--red);font-weight:600}
  footer{margin-top:20px;text-align:center;color:var(--grey);font-size:12px}
  .head .who{font-size:14px;color:var(--ink);font-weight:700}
  .shopinfo{margin-top:10px;color:var(--grey);font-size:12px;line-height:1.7}
  .shopfoot{margin-top:6px;white-space:pre-wrap}
  .print{display:block;width:100%;margin-top:18px;padding:12px;border:0;border-radius:12px;background:var(--purple);color:#fff;font:inherit;font-weight:700}
  .print:disabled{opacity:.6}
  @media print{body{background:#fff;padding:0}.sheet{box-shadow:none;border-radius:0;max-width:none}.print,.shot{display:none}}

  /* รูปใบเสร็จที่วาดเสร็จแล้ว — เปิดทับหน้าจอ กดค้างที่รูปเพื่อเซฟลงเครื่อง
     ได้เลย ซึ่งเป็นวิธีที่ใช้ได้จริงในเบราว์เซอร์ของ LINE */
  .shot{position:fixed;inset:0;background:rgba(31,41,55,.86);display:flex;flex-direction:column;
        align-items:center;justify-content:center;gap:14px;padding:18px;z-index:9}
  .shot img{max-width:100%;max-height:70vh;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.35);background:#fff}
  .shot p{margin:0;color:#fff;font-size:13.5px;text-align:center}
  .shot .row{display:flex;gap:10px;width:100%;max-width:520px}
  .shot a,.shot button{flex:1;text-align:center;padding:12px;border:0;border-radius:12px;font:inherit;
        font-weight:700;font-size:14.5px;text-decoration:none}
  .shot a{background:var(--purple);color:#fff}
  .shot button{background:#fff;color:var(--ink)}
  [hidden]{display:none!important}
</style>
</head>
<body>
  <div class="sheet">
    <div class="head">
      <div class="mark">${paid ? '✓' : '฿'}</div>
      <div>
        <h1>${paid ? 'ใบเสร็จรับเงิน' : 'ใบแจ้งยอด'}</h1>
        <p class="who">${escapeHtml(shop.shop_name || 'ม่วงจดให้ · ผู้ช่วยบันทึกงานใน LINE')}</p>
      </div>
    </div>

    ${
      hasShopDetails(shop) && (shop.address || shop.phone || shop.tax_id)
        ? `<div class="shopinfo">${[
            shop.address,
            shop.phone ? `โทร. ${shop.phone}` : '',
            shop.tax_id ? `เลขประจำตัวผู้เสียภาษี ${shop.tax_id}` : '',
          ]
            .filter(Boolean)
            .map((line) => `<div>${escapeHtml(line)}</div>`)
            .join('')}</div>`
        : ''
    }

    <div class="meta">
      <div><b>เลขที่</b>${escapeHtml(bill.bill_number || '-')}</div>
      <div><b>วันที่</b>${escapeHtml(formatThaiDateTime(bill.issued_at || bill.created_at))}</div>
      <div><b>ลูกค้า</b>${escapeHtml(bill.customer_name || 'ไม่ระบุ')}</div>
    </div>

    <table>${rows || '<tr><td colspan="3">ไม่มีรายการ</td></tr>'}</table>

    <div class="total"><span>รวมทั้งสิ้น</span><b>${escapeHtml(formatBaht(Number(bill.total) || 0))}</b></div>
    <div class="pay">
      <span class="paid">รับชำระแล้ว ${escapeHtml(formatBaht(Number(bill.paid_amount) || 0))}</span>
      <span class="due">คงเหลือ ${escapeHtml(formatBaht(Number(bill.balance_due) || 0))}</span>
    </div>

    <button class="print" id="make">📸 บันทึกใบเสร็จเป็นรูป</button>
    <footer>ขอบคุณที่ใช้บริการค่ะ 💜${
      shop.footer_note ? `<div class="shopfoot">${escapeHtml(shop.footer_note)}</div>` : ''
    }</footer>
  </div>

  <div class="shot" id="shot" hidden>
    <img id="shot-img" alt="ใบเสร็จ ${escapeHtml(bill.bill_number || '')}" />
    <p>แตะรูปค้างไว้ แล้วเลือก “บันทึกรูปภาพ” เพื่อเก็บลงเครื่อง<br />แล้วส่งให้ลูกค้าในไลน์ได้เลยค่ะ 💜</p>
    <div class="row">
      <a id="shot-dl" download="ใบเสร็จ-${escapeHtml(bill.bill_number || 'muangjod')}.png">⬇️ บันทึกลงเครื่อง</a>
      <button type="button" id="shot-close">ปิด</button>
    </div>
  </div>

<script id="bill-data" type="application/json">${jsonScript(receiptData(bill, shop))}</script>
<script>${RECEIPT_IMAGE_JS}</script>
</body>
</html>`;
}

const router = express.Router();

router.get('/:token', async (req, res) => {
  try {
    const bill = await getBillByToken(req.params.token);
    if (!bill) {
      return res.status(404).type('html').send('<!doctype html><meta charset="utf-8"><p>ไม่พบใบเสร็จนี้ค่ะ</p>');
    }
    res.set('X-Robots-Tag', 'noindex, nofollow');
    res.set('Cache-Control', 'no-store');
    // The letterhead belongs to whoever issued the bill, and this page is
    // read by the customer with no login — so the shop is looked up from the
    // bill's own owner, never from a session.
    const shop = await getShopProfile(bill.user_id);
    res.type('html').send(renderReceiptHtml(bill, shop));
  } catch (err) {
    logger.error('receipt.render_failed', { message: err?.message });
    res.status(500).type('html').send('<!doctype html><meta charset="utf-8"><p>เปิดใบเสร็จไม่สำเร็จค่ะ</p>');
  }
});

export default router;
