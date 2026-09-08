import express from 'express';
import { escapeHtml } from '../utils/html.js';
import { getBillByToken } from '../services/billService.js';
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

export function renderReceiptHtml(bill) {
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
  .print{display:block;width:100%;margin-top:18px;padding:12px;border:0;border-radius:12px;background:var(--purple);color:#fff;font:inherit;font-weight:700}
  @media print{body{background:#fff;padding:0}.sheet{box-shadow:none;border-radius:0;max-width:none}.print{display:none}}
</style>
</head>
<body>
  <div class="sheet">
    <div class="head">
      <div class="mark">${paid ? '✓' : '฿'}</div>
      <div>
        <h1>${paid ? 'ใบเสร็จรับเงิน' : 'ใบแจ้งยอด'}</h1>
        <p>ม่วงจดให้ · ผู้ช่วยบันทึกงานใน LINE</p>
      </div>
    </div>

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

    <button class="print" onclick="window.print()">🖨️ พิมพ์ / บันทึกเป็น PDF</button>
    <footer>ขอบคุณที่ใช้บริการค่ะ 💜</footer>
  </div>
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
    res.type('html').send(renderReceiptHtml(bill));
  } catch (err) {
    logger.error('receipt.render_failed', { message: err?.message });
    res.status(500).type('html').send('<!doctype html><meta charset="utf-8"><p>เปิดใบเสร็จไม่สำเร็จค่ะ</p>');
  }
});

export default router;
