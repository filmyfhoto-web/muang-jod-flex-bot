import express from 'express';
import { escapeHtml } from '../utils/html.js';
import { getBillByToken } from '../services/billService.js';
import { getShopProfile, hasShopDetails } from '../services/shopService.js';
import { isShopKey } from '../utils/receiptLink.js';
import { formatBaht, numText, round2 } from '../utils/currency.js';
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
    sub: '#555555',
  };
  // กระดาษแคบลงแต่ตัวหนังสือใหญ่ขึ้น — รูปนี้ถูกดูบนจอมือถือกว้างราว 360 จุด
  // เสมอ ไม่ว่าจะเปิดในหน้านี้หรือถูกส่งเข้าแชต ยิ่งกระดาษกว้างเท่าไหร่ตัวหนังสือ
  // ยิ่งถูกย่อลงเท่านั้น ของเดิมกว้าง 720 แล้วตัวเลขเหลือสูงไม่ถึง 10 จุดบนจอ
  var W = 680, M = 24, P = 28, S = 2;
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

  var NAME_W = CW - 34 - 180;
  var LINE_H = 29, ITEM_H = 25, SHOP_H = 66;

  // Measure first: the sheet is as tall as its rows, and a canvas has to be
  // sized before anything is drawn on it.
  function layout(ctx, withShopOnly) {
    font(ctx, '500', 22);
    var rows = data.rows.map(function (r) {
      return { row: r, lines: wrap(ctx, r.name, NAME_W) };
    });
    // 18 above, the name's lines, then the date's own line, then room under it
    // — the separator used to land on the date's baseline and strike it out.
    // A job entered as several items prints those under the date.
    var rowsH = rows.reduce(function (s, r) {
      return s + 18 + r.lines.length * LINE_H + (r.row.items || []).length * ITEM_H + 36 + 1;
    }, 0);
    if (!rows.length) rowsH = 64;
    // ที่อยู่/เบอร์/เลขภาษีของร้าน และข้อความท้ายใบ ต้องกินความสูงของกระดาษ
    // ด้วย ไม่งั้นมันจะถูกวาดทับขอบล่าง
    var headExtra = data.shop.lines.length ? data.shop.lines.length * 22 + 6 : 0;
    var footExtra = data.shop.footer ? 26 : 0;
    var shopExtra = withShopOnly ? SHOP_H + 16 : 0;
    // 80 หัวใบ + 28 เส้นคั่น + (92+26) แถบข้อมูล + รายการ + 22 + (92+20) ยอดรวม
    // + (38+20) ชำระ/คงเหลือ + 10 ใต้บรรทัดท้าย
    var h = P + 80 + headExtra + 28 + 92 + 26 + rowsH + 22 + 92 + 20 + shopExtra + 38 + 20 + 10 + footExtra + P;
    return { rows: rows, rowsH: rowsH, sheetH: h, shopOnly: withShopOnly };
  }

  function draw(withShopOnly) {
    var probe = document.createElement('canvas').getContext('2d');
    var L = layout(probe, Boolean(withShopOnly && data.shopOnly));
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
      font(ctx, '700', 19);
      ctx.fillStyle = C.ink;
    } else {
      font(ctx, '400', 17);
      ctx.fillStyle = C.grey;
    }
    ctx.fillText(data.shop.name || 'ม่วงจดให้ · ผู้ช่วยบันทึกงานใน LINE', INNER + 68, y + 52);

    y += 80;
    if (data.shop.lines.length) {
      font(ctx, '400', 16);
      ctx.fillStyle = C.grey;
      data.shop.lines.forEach(function (line, i) {
        wrap(ctx, line, CW).slice(0, 1).forEach(function (l) { ctx.fillText(l, INNER, y + 15 + i * 22); });
      });
      y += data.shop.lines.length * 22 + 6;
    }
    ctx.fillStyle = C.line;
    ctx.fillRect(INNER, y, CW, 1);
    y += 28;

    // แถบข้อมูล: เลขที่ / วันที่ / ลูกค้า
    roundRect(ctx, INNER, y, CW, 92, 12, C.soft);
    var colW = CW / 3;
    [['เลขที่', data.number], ['วันที่', data.date], ['ลูกค้า', data.customer]].forEach(function (pair, i) {
      var x = INNER + 16 + i * colW;
      font(ctx, '700', 16);
      ctx.fillStyle = C.dark;
      ctx.fillText(pair[0], x, y + 29);
      font(ctx, '400', 17);
      ctx.fillStyle = C.ink;
      wrap(ctx, pair[1], colW - 24).slice(0, 2).forEach(function (line, k) {
        ctx.fillText(line, x, y + 54 + k * 23);
      });
    });
    y += 92 + 26;

    // รายการ
    if (!L.rows.length) {
      font(ctx, '400', 20);
      ctx.fillStyle = C.grey;
      ctx.fillText('ไม่มีรายการ', INNER, y + 32);
      y += 64;
    } else {
      L.rows.forEach(function (r) {
        y += 18;
        font(ctx, '700', 20);
        ctx.fillStyle = C.purple;
        ctx.fillText(String(L.rows.indexOf(r) + 1), INNER, y + 21);

        font(ctx, '500', 22);
        ctx.fillStyle = C.ink;
        r.lines.forEach(function (line, k) { ctx.fillText(line, INNER + 34, y + 21 + k * LINE_H); });

        font(ctx, '400', 17);
        ctx.fillStyle = C.grey;
        ctx.fillText(r.row.date, INNER + 34, y + 21 + r.lines.length * LINE_H);

        font(ctx, '600', 22);
        ctx.fillStyle = C.ink;
        ctx.textAlign = 'right';
        ctx.fillText(r.row.amount, INNER + CW, y + 21);
        ctx.textAlign = 'left';

        // แต่ละรายการย่อยในงานเดียว: ชื่อซ้าย ยอดขวา สีอ่อนกว่าบรรทัดหลัก
        // เพื่อให้อ่านออกว่าเป็นของที่รวมอยู่ในยอดข้างบน ไม่ใช่ยอดเพิ่ม
        var itemY = y + 21 + r.lines.length * LINE_H;
        (r.row.items || []).forEach(function (it, k) {
          var ly = itemY + (k + 1) * ITEM_H;
          font(ctx, '400', 17);
          ctx.fillStyle = C.sub;
          wrap(ctx, '• ' + it.text, CW - 34 - (it.amount ? 130 : 8)).slice(0, 1).forEach(function (line) {
            ctx.fillText(line, INNER + 34, ly);
          });
          ctx.fillStyle = C.grey;
          ctx.textAlign = 'right';
          ctx.fillText(it.amount, INNER + CW, ly);
          ctx.textAlign = 'left';
        });

        y += r.lines.length * LINE_H + (r.row.items || []).length * ITEM_H + 36;
        ctx.fillStyle = C.line;
        ctx.fillRect(INNER, y, CW, 1);
        y += 1;
      });
    }

    y += 22;
    roundRect(ctx, INNER, y, CW, 92, 12, C.soft);
    font(ctx, '700', 25);
    ctx.fillStyle = C.ink;
    ctx.fillText('รวมทั้งสิ้น', INNER + 18, y + 57);
    font(ctx, '700', 42);
    ctx.fillStyle = C.purple;
    ctx.textAlign = 'right';
    ctx.fillText(data.total, INNER + CW - 18, y + 60);
    ctx.textAlign = 'left';
    y += 92 + 20;

    // แถบเฉพาะร้าน — วาดเฉพาะใบที่ร้านเก็บไว้ดูเอง ใบที่ส่งให้ลูกค้าไม่มีบรรทัดนี้
    // สีส้มไม่ใช่ม่วง เพื่อให้เห็นแต่ไกลว่านี่ไม่ใช่ใบที่ส่งต่อได้
    if (L.shopOnly) {
      roundRect(ctx, INNER, y, CW, SHOP_H, 12, '#fff7ed');
      font(ctx, '700', 15);
      ctx.fillStyle = '#b45309';
      ctx.fillText(data.shopOnly.tag, INNER + 16, y + 24);
      font(ctx, '600', 20);
      ctx.fillStyle = C.ink;
      ctx.fillText('ราคาจริง ' + data.shopOnly.listed, INNER + 16, y + 51);
      font(ctx, '700', 20);
      ctx.fillStyle = data.shopOnly.up ? C.green : C.red;
      ctx.textAlign = 'right';
      ctx.fillText(data.shopOnly.gapText, INNER + CW - 16, y + 51);
      ctx.textAlign = 'left';
      y += SHOP_H + 16;
    }

    font(ctx, '600', 21);
    ctx.fillStyle = C.green;
    ctx.fillText('รับชำระแล้ว ' + data.paidAmount, INNER, y + 21);
    ctx.fillStyle = C.red;
    ctx.textAlign = 'right';
    ctx.fillText('คงเหลือ ' + data.balance, INNER + CW, y + 21);
    ctx.textAlign = 'left';
    y += 38 + 20;

    font(ctx, '400', 17);
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
  var btnShop = document.getElementById('make-shop');
  var shot = document.getElementById('shot');
  var img = document.getElementById('shot-img');
  var dl = document.getElementById('shot-dl');
  var share = document.getElementById('shot-share');
  var hint = document.getElementById('shot-hint');
  var badge = document.getElementById('shot-badge');
  var frame = document.getElementById('shot-frame');
  var baseName = dl.getAttribute('download') || 'receipt.png';

  // แตะรูปเพื่อสลับ "พอดีจอ" กับ "ขนาดจริง" — ย่อให้พอดีจอกว้าง 360 จุด ตัวเลข
  // เหลือครึ่งเดียวของที่วาดไว้ ซึ่งร้านบอกว่ามองไม่เห็น กดแล้วเลื่อนดูได้
  frame.onclick = function () {
    if (!img.src) return;
    var zoomed = frame.classList.toggle('zoom');
    if (zoomed) frame.scrollLeft = (frame.scrollWidth - frame.clientWidth) / 2;
  };

  // เบราว์เซอร์ในแอป LINE ไม่ยอมให้ดาวน์โหลดจาก data: URL — มันอ่านว่ากำลังจะ
  // เปิดแอปข้างนอก แล้วเด้งถามว่า "อนุญาต / ไม่อนุญาต" ซึ่งกดยังไงก็ไม่ได้ไฟล์
  // ทางที่มีอยู่จริงบนมือถือคือ share sheet ของเครื่อง ซึ่งมีทั้ง "บันทึกรูป"
  // และ "ส่งเข้าแชตไลน์" ในที่เดียว — ตรงกับสิ่งที่ร้านจะทำต่ออยู่แล้ว
  function fileOf(dataUrl) {
    var bin = atob(dataUrl.split(',')[1]);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new File([bytes], (dl.getAttribute('download') || 'receipt.png'), { type: 'image/png' });
  }

  function canShareFiles(file) {
    try {
      return Boolean(navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share);
    } catch (e) {
      return false;
    }
  }

  share.onclick = async function () {
    if (!img.src) return;
    var file;
    try {
      file = fileOf(img.src);
    } catch (e) {
      file = null;
    }

    if (file && canShareFiles(file)) {
      try {
        await navigator.share({ files: [file], title: 'ใบเสร็จ' });
        return;
      } catch (e) {
        // กดยกเลิกเองไม่ใช่ความผิดพลาด อย่าไปบอกว่าพัง
        if (e && e.name === 'AbortError') return;
      }
    }

    // แชร์ไม่ได้ ก็ลองดาวน์โหลดตรง ๆ ซึ่งได้ผลบนคอมและ Chrome ของแอนดรอยด์
    // ถ้าเครื่องไหนไม่ได้อีก ยังเหลือวิธีแตะรูปค้างไว้ที่เขียนบอกไว้ข้างบน
    dl.click();
    hint.innerHTML =
      'ถ้ายังบันทึกไม่ได้ ให้ <b>แตะรูปค้างไว้</b> แล้วเลือก “บันทึกรูปภาพ” ค่ะ<br />' +
      'หรือเปิดหน้านี้ในเบราว์เซอร์ปกติ (ปุ่ม ⋯ มุมขวาบน) แล้วกดอีกครั้งนะคะ 💜';
  };

  async function make(source, withShopOnly) {
    source.disabled = true;
    var label = source.textContent;
    source.textContent = 'กำลังทำรูป…';
    try {
      // วาดหลังฟอนต์ไทยมาแล้ว ไม่งั้นตัวหนังสือจะกลายเป็นฟอนต์สำรอง
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      var url = draw(withShopOnly);
      img.src = url;
      dl.href = url;
      dl.setAttribute('download', withShopOnly ? baseName.replace(/\.png$/, '-ร้าน.png') : baseName);
      frame.classList.remove('zoom');
      if (badge) badge.hidden = !withShopOnly;
      shot.hidden = false;
      shot.scrollTop = 0;
    } catch (e) {
      source.textContent = 'ทำรูปไม่สำเร็จ ลองใหม่อีกครั้งนะคะ';
      setTimeout(function () { source.textContent = label; source.disabled = false; }, 2200);
      return;
    }
    source.textContent = label;
    source.disabled = false;
  }

  btn.onclick = function () { return make(btn, false); };
  if (btnShop) btnShop.onclick = function () { return make(btnShop, true); };

  document.getElementById('shot-close').onclick = function () { shot.hidden = true; };
})();
`;

// JSON safe to drop inside a <script> tag: only "<" can end the block early.
function jsonScript(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

// The lines inside one job, as the customer should read them.
//
// A shop taking three things from one customer in one visit enters them as
// three items on one job — and the receipt used to print that as a single
// amount against the job's name, which is not something you can hand to
// anyone. One item is not worth breaking out: it *is* the job, and printing it
// twice only adds a line saying what the line above already said.
export function receiptItemLines(job = {}, opts = {}) {
  const items = job.items || [];
  if (items.length < 2) return [];
  // ถ้าร้านปัดราคาไปแล้ว ยอดย่อยจะบวกกันไม่เท่ากับยอดที่เก็บจริง ใบของลูกค้า
  // จึงบอกแค่ "ได้อะไรไปบ้าง" ไม่บอกราคาต่อชิ้น — เพราะเลขที่บวกแล้วไม่ตรงกับ
  // ยอดข้างล่างคือเลขที่ทำให้ลูกค้าคิดว่าร้านคิดเกิน ส่วนใบของร้านโชว์ครบ
  const showAmounts = opts.shopView || !jobWasAdjusted(job);
  return items.map((it) => {
    const qty = Number(it.quantity) || 0;
    const parts = [String(it.item_name || 'รายการ').trim()];
    if (it.size) parts.push(String(it.size));
    // The count hangs off the end of what it counts — a "·" in front of it
    // reads as another attribute of the item rather than how many there are.
    const unit = it.unit && !/^(ชิ้น|อัน)$/.test(it.unit) ? ` ${it.unit}` : '';
    const text = parts.join(' · ') + (qty > 1 ? ` × ${numText(qty)}${unit}` : '');
    return { text, amount: showAmounts ? formatBaht(Number(it.total) || 0) : '' };
  });
}

// งานที่ร้านตั้งราคาเก็บลูกค้าต่างจากที่คิดได้จากรายการ (ปัดขึ้น หรือลดให้)
export function jobWasAdjusted(job = {}) {
  const listed = round2(Number(job.subtotal) || 0);
  const charged = round2(Number(job.total) || 0);
  return listed > 0 && Math.abs(listed - charged) >= 0.01;
}

// ราคาที่คิดได้จากรายการ เทียบกับราคาที่ร้านเก็บลูกค้าจริง
//
// ร้านบอกว่า "บางทีเราอยากแก้ราคาปัดขึ้น" — ปัด 4,931.43 เป็น 5,000 แล้วลูกค้า
// เห็นแค่ 5,000 ส่วนร้านยังต้องรู้ว่าของจริงเท่าไหร่ ไม่งั้นพอมาดูย้อนหลังก็
// แยกไม่ออกว่าเลขนี้มาจากไหน ตัวเลขทั้งสองอยู่ในบิลอยู่แล้ว: subtotal คือที่คิดได้
// total คือที่เก็บ ตรงนี้แค่เอามาเทียบ และคืน null เมื่อไม่มีส่วนต่างให้พูดถึง
export function shopOnlyPrice(bill = {}) {
  const listed = round2(Number(bill.subtotal) || 0);
  const charged = round2(Number(bill.total) || 0);
  const gap = round2(charged - listed);
  if (!listed || Math.abs(gap) < 0.01) return null;
  const up = gap > 0;
  return {
    tag: '🔒 เฉพาะร้าน · ใบที่ส่งลูกค้าไม่มีบรรทัดนี้',
    listed: formatBaht(listed),
    charged: formatBaht(charged),
    up,
    gapText: `${up ? 'ปัดขึ้น +' : 'ลดให้ −'}${formatBaht(Math.abs(gap))}`,
  };
}

// What the canvas needs to draw the receipt, so the picture and the page are
// built from one set of numbers rather than two.
function receiptData(bill, shop = {}, shopView = false) {
  const paid = bill.payment_status === 'paid';
  return {
    paid,
    // มีเฉพาะตอนเปิดด้วยกุญแจร้าน ลิงก์ที่ลูกค้าถือไม่มีฟิลด์นี้ติดไปเลย —
    // ไม่ใช่ซ่อนด้วย CSS ที่กดดูซอร์สก็เห็น
    shopOnly: shopView ? shopOnlyPrice(bill) : null,
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
      items: receiptItemLines(j, { shopView }),
    })),
    total: formatBaht(Number(bill.total) || 0),
    paidAmount: formatBaht(Number(bill.paid_amount) || 0),
    balance: formatBaht(Number(bill.balance_due) || 0),
  };
}

export function renderReceiptHtml(bill, shop = {}, opts = {}) {
  const jobs = bill.jobs || [];
  const paid = bill.payment_status === 'paid';
  const shopView = Boolean(opts.shopView);
  const shopOnly = shopView ? shopOnlyPrice(bill) : null;
  const rows = jobs
    .map((j, i) => {
      const lines = receiptItemLines(j, { shopView })
        .map(
          (it) =>
            `<span class="li"><span>${escapeHtml(it.text)}</span><span>${escapeHtml(it.amount)}</span></span>`
        )
        .join('');
      return `<tr>
        <td class="n">${i + 1}</td>
        <td>${escapeHtml(j.job_name || 'งาน')}<small>${escapeHtml(formatThaiDate(j.job_date))}</small>${lines}</td>
        <td class="amt">${escapeHtml(formatBaht(Number(j.total) || 0))}</td>
      </tr>`;
    })
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
  /* บรรทัดย่อยของงานที่มีหลายรายการ ลูกค้าจะได้เห็นว่ายอดมาจากอะไรบ้าง */
  .li{display:flex;justify-content:space-between;gap:10px;color:var(--sub);font-size:12.5px;margin-top:3px}
  .li>span:last-child{color:var(--grey);white-space:nowrap}
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
     ได้เลย ซึ่งเป็นวิธีที่ใช้ได้จริงในเบราว์เซอร์ของ LINE

     ของเดิมจับรูปยัดให้พอดีจอด้วย max-height:70vh ซึ่งบนมือถือแปลว่ารูปกว้าง
     1440 จุดถูกย่อเหลือ ~354 จุด ตัวหนังสือเลยเล็กจนอ่านไม่ออก ตอนนี้ให้รูป
     เต็มความกว้าง แล้วเลื่อนดูส่วนที่เกินจอแทน — ยาวไม่ใช่ปัญหา เล็กสิเป็น */
  .shot{position:fixed;inset:0;background:rgba(31,41,55,.97);z-index:9;overflow-y:auto;
        -webkit-overflow-scrolling:touch;display:flex;flex-direction:column;align-items:center;
        padding:14px 14px 0}
  .shot .frame{width:100%;max-width:560px;overflow-x:auto;border-radius:12px;
        box-shadow:0 8px 30px rgba(0,0,0,.35);background:#fff;line-height:0}
  .shot .frame img{width:100%;height:auto;display:block}
  /* แตะรูป = ขยายเป็นสองเท่าแล้วเลื่อนซ้ายขวาดู สำหรับตอนอยากเห็นเลขชัด ๆ
     (ขนาดจริงคือ 4 เท่าของจอ ซึ่งใหญ่จนหาตัวเองไม่เจอ) */
  .shot .frame.zoom img{width:200%;max-width:none}
  .shot .frame{cursor:zoom-in}
  .shot .frame.zoom{cursor:zoom-out}
  .shot p{margin:0;color:#fff;font-size:13.5px;text-align:center}
  .shot .bar{position:sticky;bottom:0;width:100%;max-width:560px;padding:12px 0 14px;
        display:flex;flex-direction:column;gap:10px;align-items:center;
        background:linear-gradient(180deg,rgba(31,41,55,0),rgba(31,41,55,.94) 30%)}
  .shot .row{display:flex;gap:10px;width:100%}
  .shot a,.shot button{flex:1;text-align:center;padding:12px;border:0;border-radius:12px;font:inherit;
        font-weight:700;font-size:14.5px;text-decoration:none}
  .shot a{background:var(--purple);color:#fff}
  .shot button{background:#fff;color:var(--ink)}
  /* ปุ่มแชร์คือทางหลัก ปุ่มดาวน์โหลดเป็นทางสำรองที่ซ่อนไว้จนกว่าจะได้ใช้ */
  .shot #shot-share{background:var(--purple);color:#fff}
  .shot .badge{margin:10px 0 0;align-self:stretch;max-width:560px;background:#fff7ed;color:#b45309;
        border-radius:10px;padding:8px 12px;font-size:13px;font-weight:700;text-align:center}
  .shot [hidden]{display:none}

  /* ราคาที่คิดได้จริง ก่อนร้านปัด — มีเฉพาะตอนร้านเปิดเอง */
  .mine{margin-top:12px;background:#fff7ed;border-radius:12px;padding:12px 14px}
  .mine .tag{display:block;color:#b45309;font-size:12px;font-weight:700}
  .mine .num{display:flex;justify-content:space-between;gap:10px;margin-top:4px;font-weight:700;font-size:16px}
  .mine .up{color:var(--green)}
  .mine .down{color:var(--red)}
  .print.ghost{background:#fff;color:var(--purple-dark);box-shadow:inset 0 0 0 2px var(--purple-soft);margin-top:10px}
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

    ${
      shopOnly
        ? `<div class="mine">
      <span class="tag">🔒 เฉพาะร้าน · ลูกค้าไม่เห็นส่วนนี้</span>
      <div class="num"><span>ราคาจริง ${escapeHtml(shopOnly.listed)}</span><span class="${
        shopOnly.up ? 'up' : 'down'
      }">${escapeHtml(shopOnly.gapText)}</span></div>
    </div>`
        : ''
    }

    <button class="print" id="make">📸 ใบของลูกค้า · บันทึกเป็นรูป</button>
    ${shopOnly ? '<button class="print ghost" id="make-shop">🔒 ใบของร้าน · มีราคาจริง</button>' : ''}
    <footer>ขอบคุณที่ใช้บริการค่ะ 💜${
      shop.footer_note ? `<div class="shopfoot">${escapeHtml(shop.footer_note)}</div>` : ''
    }</footer>
  </div>

  <div class="shot" id="shot" hidden>
    ${shopOnly ? '<p class="badge" id="shot-badge" hidden>🔒 ใบนี้มีราคาจริง — เก็บไว้ดูเอง อย่าส่งให้ลูกค้านะคะ</p>' : ''}
    <div class="frame" id="shot-frame">
      <img id="shot-img" alt="ใบเสร็จ ${escapeHtml(bill.bill_number || '')}" />
    </div>
    <div class="bar">
      <p id="shot-hint">แตะรูปเพื่อขยายให้เห็นตัวเลขชัด ๆ · แตะค้างไว้เพื่อ “บันทึกรูปภาพ”<br />แล้วส่งให้ลูกค้าในไลน์ได้เลยค่ะ 💜</p>
      <div class="row">
        <button type="button" id="shot-share">📤 ส่ง / บันทึกรูป</button>
        <a id="shot-dl" hidden download="ใบเสร็จ-${escapeHtml(bill.bill_number || 'muangjod')}.png">⬇️ บันทึกลงเครื่อง</a>
        <button type="button" id="shot-close">ปิด</button>
      </div>
    </div>
  </div>

<script id="bill-data" type="application/json">${jsonScript(receiptData(bill, shop, shopView))}</script>
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
    // ?k=... คือกุญแจของร้าน ซึ่งมีอยู่ในลิงก์ที่ร้านได้จากในแอปตัวเองเท่านั้น
    // ลิงก์ที่ยื่นให้ลูกค้าไม่มีติดไปด้วย ใบที่ลูกค้าเปิดจึงไม่มีราคาจริงอยู่ใน
    // หน้าเลย — ไม่ใช่มีแล้วซ่อน
    const shopView = isShopKey(req.params.token, String(req.query.k || ''));
    res.type('html').send(renderReceiptHtml(bill, shop, { shopView }));
  } catch (err) {
    logger.error('receipt.render_failed', { message: err?.message });
    res.status(500).type('html').send('<!doctype html><meta charset="utf-8"><p>เปิดใบเสร็จไม่สำเร็จค่ะ</p>');
  }
});

export default router;
