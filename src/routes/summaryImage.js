import { escapeHtml } from '../utils/html.js';
import { formatBaht, numText } from '../utils/currency.js';
import { formatThaiDate } from '../utils/dates.js';
import { buildOrderSummary } from '../utils/orderSummary.js';

/* รูปของใบสรุปใบสั่ง
 *
 * ใบเสร็จมีปุ่ม "บันทึกเป็นรูป" มาตั้งแต่แรก เพราะรูปส่งเข้าแชตไลน์ได้ทันที
 * ส่วนใบสรุปที่เพิ่งทำเสร็จยังมีแต่ลิงก์ ซึ่งแปลว่าร้านต้องแคปหน้าจอเอง แล้ว
 * ได้รูปที่มีแถบเบราว์เซอร์ติดมาด้วยและตัวหนังสือเล็กเท่าที่จอเป็น
 *
 * ต้นฉบับที่ร้านส่งมาคือกระดาษที่พิมพ์แล้วยื่นให้ลูกค้า รูปจึงเป็นรูปแบบที่ใบนี้
 * ควรออกมาตั้งแต่แรก ไม่ใช่ของแถม
 */

const PALETTE = ['#e8608c', '#3d7fd1', '#3fa86b', '#8b6fd4', '#e08a3c'];

/* ตัวเลขทั้งหมดถูกจัดรูปที่ฝั่งเซิร์ฟเวอร์ แล้วส่งไปให้แคนวาสวาดตามอย่างเดียว
 *
 * แบบเดียวกับ receiptData — หน้าเว็บกับรูปจึงมาจากชุดตัวเลขเดียวกัน ไม่ใช่สอง
 * ชุดที่บังเอิญตรงกันอยู่ตอนนี้ (ตัวอย่างที่ต้องกันไว้: ค่าส่งที่ไม่นับเป็นแผ่น
 * และไม่กินเลขลำดับ ถ้าปล่อยให้แคนวาสตัดสินใจเองก็มีวันที่ทั้งสองที่ไม่ตรงกัน)
 */
export function summaryImageData(bill = {}, shop = {}) {
  const s = buildOrderSummary(bill);

  return {
    title: 'สรุปใบสั่งทำ',
    shop: {
      name: shop.shop_name || null,
      lines: [shop.address, shop.phone ? `โทร. ${shop.phone}` : null].filter(Boolean),
      footer: shop.footer_note || null,
    },
    number: s.billNumber || '-',
    customer: s.customerName || 'ไม่ระบุ',
    days: s.days.map((day, i) => {
      let no = 0;
      return {
        date: formatThaiDate(day.date),
        color: PALETTE[i % PALETTE.length],
        rows: day.lines.map((l) => ({
          // ค่าส่งไม่ใช่ของที่ทำให้ลูกค้า จึงไม่กินเลขลำดับและไม่มีจำนวนแผ่น
          no: l.shipping ? '' : String(++no),
          name: l.name,
          size: l.size || '',
          sheets: !l.shipping && l.sheets > 0 ? `${numText(l.sheets)} แผ่น` : '',
          amount: formatBaht(l.amount),
        })),
        sheets: day.totals.sheets > 0 ? `${numText(day.totals.sheets)} แผ่น` : '',
        total: formatBaht(day.totals.total),
      };
    }),
    grand: {
      sheets: numText(s.grand.sheets),
      goods: formatBaht(s.grand.goods),
      shipping: formatBaht(s.grand.shipping),
      total: formatBaht(s.charged),
    },
    // ร้านปัดราคาแล้วยอดบรรทัดกับยอดที่เก็บไม่ตรงกัน ใบต้องบอกเอง ไม่ใช่ให้
    // ลูกค้าบวกเองแล้วมาถามทีหลังว่าทำไมไม่ตรง
    note: s.adjusted
      ? `ยอดรายการรวมได้ ${formatBaht(s.grand.total)} · ราคาที่ตกลงกัน ${formatBaht(s.charged)}`
      : '',
  };
}

// JSON ที่ปลอดภัยเมื่ออยู่ใน <script>: มีแต่ "<" ที่ปิดบล็อกก่อนเวลาได้
export function jsonScript(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

/* วาดใบสรุปลงแคนวาส
 *
 * กระดาษกว้าง 680 เท่าใบเสร็จ เพราะรูปทั้งสองใบถูกดูบนจอมือถือกว้างราว 360 จุด
 * เสมอ ยิ่งกระดาษกว้างตัวหนังสือยิ่งถูกย่อลง
 *
 * ทุกยอดวาดด้วย MJSheet.textRight ซึ่งวัดความกว้างเองแทนการตั้ง ctx.textAlign
 * — เบราว์เซอร์ในแอปไลน์บนเครื่องของร้านไม่สนใจค่านั้น (ดูที่มาใน sheetCanvas.js)
 */
export const SUMMARY_IMAGE_JS = String.raw`
(function () {
  var C = {
    purple: '#7c3aed', dark: '#5b21b6', soft: '#ede9fe', ink: '#1f2937',
    grey: '#8e8e93', line: '#ececf0', white: '#fff', sub: '#555555', tint: '#fdf2f6',
  };
  var W = 680, M = 24, P = 28, S = 2;
  var INNER = M + P, CW = W - 2 * M - 2 * P;
  /* คอลัมน์ต้องกันที่ให้กันเอง ไม่ใช่แค่ "ไม่ล้นกระดาษ"
   *
   * ของเดิมให้ชื่อรายการกว้างถึง SHEET_R - 40 แล้วปล่อยให้จำนวนแผ่นชิดขวาไป
   * เรื่อย ๆ ซึ่งแปลว่าชื่อยาว ๆ กับ "42 แผ่น" มาเจอกันกลางทางแล้วตัวหนังสือ
   * ทับกัน (วัดจากรูปจริง: ชื่อจบที่ 459 ส่วนจำนวนเริ่มที่ 460)
   *
   * ตอนนี้กันที่ให้คอลัมน์จำนวนไว้ตายตัว ชื่อจึงขึ้นบรรทัดใหม่แทนที่จะเบียด
   */
  var AMT_R = INNER + CW;          // ขอบขวาของเนื้อหา — ยอดทุกตัวจบตรงนี้
  var SHEET_R = AMT_R - 118;       // คอลัมน์จำนวนแผ่น ชิดขวาเหมือนกัน
  var QTY_W = 86;                  // พอสำหรับ "1,320 แผ่น"
  var QTY_L = SHEET_R - QTY_W;
  var NAME_X = INNER + 30;
  var NAME_W = QTY_L - 12 - NAME_X;

  var data;
  try { data = JSON.parse(document.getElementById('summary-data').textContent); } catch (e) { return; }

  var font = MJSheet.font, wrap = MJSheet.wrap, clip = MJSheet.clip;
  var textRight = MJSheet.textRight, textCenter = MJSheet.textCenter, roundRect = MJSheet.roundRect;

  var NAME_H = 27, SIZE_H = 22, ROW_PAD = 13;

  // วัดก่อนวาด: กระดาษสูงเท่าเนื้อหาของมัน และแคนวาสต้องรู้ความสูงก่อนเริ่มวาด
  function layout(ctx) {
    var days = data.days.map(function (d) {
      var rows = d.rows.map(function (r) {
        font(ctx, '500', 20);
        var lines = wrap(ctx, r.name, NAME_W);
        var h = ROW_PAD + lines.length * NAME_H + (r.size ? SIZE_H : 0) + ROW_PAD + 1;
        return { row: r, lines: lines, h: h };
      });
      var h = 46 + 30 + rows.reduce(function (s, r) { return s + r.h; }, 0) + 44 + 18;
      return { day: d, rows: rows, h: h };
    });

    var daysH = days.reduce(function (s, d) { return s + d.h; }, 0);
    if (!days.length) daysH = 60;
    var headExtra = data.shop.lines.length ? data.shop.lines.length * 22 + 6 : 0;
    var noteExtra = data.note ? 30 : 0;
    var footExtra = data.shop.footer ? 26 : 0;
    // P + หัวใบ 80 + ที่อยู่ร้าน + เส้นคั่น 26 + แถบเลขที่/ลูกค้า (70+24)
    // + วัน ๆ + กล่องสรุป (112+16) + หมายเหตุ + บรรทัดท้าย 30 + P
    var h = P + 80 + headExtra + 26 + 70 + 24 + daysH + 112 + 16 + noteExtra + 30 + footExtra + P;
    return { days: days, sheetH: h };
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

    // หัวใบ: วงกลม 📊 แล้วชื่อเอกสารกับชื่อร้าน
    ctx.beginPath();
    ctx.arc(INNER + 26, y + 26, 26, 0, Math.PI * 2);
    ctx.fillStyle = C.purple;
    ctx.fill();
    font(ctx, '700', 24);
    ctx.fillStyle = C.white;
    textCenter(ctx, '📊', INNER + 26, y + 35);

    font(ctx, '700', 27);
    ctx.fillStyle = C.dark;
    ctx.fillText(data.title, INNER + 68, y + 26);
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
        clip(ctx, line, CW, 1).forEach(function (l) { ctx.fillText(l, INNER, y + 15 + i * 22); });
      });
      y += data.shop.lines.length * 22 + 6;
    }
    ctx.fillStyle = C.line;
    ctx.fillRect(INNER, y, CW, 1);
    y += 26;

    // แถบข้อมูล: เลขที่ / ลูกค้า
    roundRect(ctx, INNER, y, CW, 70, 12, C.soft);
    [['เลขที่', data.number], ['ลูกค้า', data.customer]].forEach(function (pair, i) {
      var x = INNER + 16 + i * (CW / 2);
      font(ctx, '700', 16);
      ctx.fillStyle = C.dark;
      ctx.fillText(pair[0], x, y + 27);
      font(ctx, '400', 17);
      ctx.fillStyle = C.ink;
      clip(ctx, pair[1], CW / 2 - 24, 1).forEach(function (line) { ctx.fillText(line, x, y + 52); });
    });
    y += 70 + 24;

    if (!L.days.length) {
      font(ctx, '400', 20);
      ctx.fillStyle = C.grey;
      ctx.fillText('ยังไม่มีรายการในใบนี้', INNER, y + 30);
      y += 60;
    }

    L.days.forEach(function (D) {
      var d = D.day;

      // ป้ายวันที่ทรงแคปซูล สีวนไปตามลำดับวัน เหมือนใบที่ร้านส่งตัวอย่างมา
      font(ctx, '700', 18);
      var pillW = ctx.measureText(d.date).width + 36;
      roundRect(ctx, INNER, y, pillW, 34, 17, d.color);
      ctx.fillStyle = C.white;
      ctx.fillText(d.date, INNER + 18, y + 23);
      y += 46;

      // หัวตาราง
      font(ctx, '600', 14);
      ctx.fillStyle = C.sub;
      ctx.fillText('รายการ', NAME_X, y + 14);
      textRight(ctx, 'จำนวน', SHEET_R, y + 14);
      textRight(ctx, 'ราคา', AMT_R, y + 14);
      y += 22;
      ctx.fillStyle = C.line;
      ctx.fillRect(INNER, y, CW, 1);
      y += 8;

      D.rows.forEach(function (R) {
        var r = R.row;
        var top = y + ROW_PAD;

        font(ctx, '700', 18);
        ctx.fillStyle = C.purple;
        if (r.no) ctx.fillText(r.no, INNER, top + 19);

        font(ctx, '500', 20);
        ctx.fillStyle = C.ink;
        R.lines.forEach(function (line, i) { ctx.fillText(line, NAME_X, top + 19 + i * NAME_H); });

        var afterName = top + R.lines.length * NAME_H;
        if (r.size) {
          font(ctx, '400', 15);
          ctx.fillStyle = C.grey;
          clip(ctx, r.size, NAME_W, 1).forEach(function (line) { ctx.fillText(line, NAME_X, afterName + 13); });
        }

        // จำนวนแผ่นกับราคาอยู่บนบรรทัดแรกของชื่อเสมอ ไม่ไหลลงไปกับชื่อที่ยาว
        font(ctx, '400', 17);
        ctx.fillStyle = C.sub;
        if (r.sheets) textRight(ctx, r.sheets, SHEET_R, top + 19, QTY_L);
        font(ctx, '700', 19);
        ctx.fillStyle = C.ink;
        textRight(ctx, r.amount, AMT_R, top + 19, SHEET_R + 8);

        y += R.h;
        ctx.fillStyle = C.line;
        ctx.fillRect(INNER, y - 1, CW, 1);
      });

      // แถบรวมของวันนั้น
      roundRect(ctx, INNER, y, CW, 38, 10, C.tint);
      font(ctx, '700', 17);
      ctx.fillStyle = C.sub;
      ctx.fillText('รวม ' + d.date, INNER + 14, y + 25);
      if (d.sheets) {
        font(ctx, '600', 16);
        textRight(ctx, d.sheets, SHEET_R, y + 25, QTY_L);
      }
      font(ctx, '700', 19);
      ctx.fillStyle = C.dark;
      textRight(ctx, d.total, AMT_R - 14, y + 25, SHEET_R + 8);
      y += 44 + 18;
    });

    // กล่องสรุปทั้งหมด — สี่ช่องเรียงเป็นสองแถว ไม่ใช่สี่คอลัมน์เรียงกัน
    // เพราะยอดเงินสี่ก้อนบนกระดาษกว้าง 680 จะเหลือที่ช่องละ 144 ซึ่งไม่พอ
    roundRect(ctx, INNER, y, CW, 112, 14, C.tint);
    var cells = [
      ['จำนวนแผ่น (รวม)', data.grand.sheets, false],
      ['ค่าสินค้า', data.grand.goods, false],
      ['ค่าส่ง', data.grand.shipping, false],
      ['รวมทั้งหมด', data.grand.total, true],
    ];
    cells.forEach(function (cell, i) {
      var cx = INNER + 18 + (i % 2) * (CW / 2);
      var cy = y + 16 + Math.floor(i / 2) * 54;
      font(ctx, '600', 14);
      ctx.fillStyle = C.sub;
      ctx.fillText(cell[0], cx, cy + 14);
      font(ctx, '700', cell[2] ? 26 : 21);
      ctx.fillStyle = cell[2] ? C.purple : C.ink;
      // ชิดขวาในช่องของตัวเอง เลขหลักหน่วยของทั้งสี่ช่องจะได้ตรงแนวกัน
      textRight(ctx, cell[1], INNER + (i % 2) * (CW / 2) + CW / 2 - 18, cy + 42, cx);
    });
    y += 112 + 16;

    if (data.note) {
      font(ctx, '400', 15);
      ctx.fillStyle = C.grey;
      textCenter(ctx, data.note, W / 2, y + 16);
      y += 30;
    }

    font(ctx, '400', 16);
    ctx.fillStyle = C.grey;
    textCenter(ctx, 'ขอบคุณที่ไว้วางใจนะคะ 💜', W / 2, y + 18);
    if (data.shop.footer) {
      font(ctx, '400', 15);
      clip(ctx, data.shop.footer, CW, 1).forEach(function (line) { textCenter(ctx, line, W / 2, y + 42); });
    }

    return cv.toDataURL('image/png');
  }

  MJShot.mount({ draw: draw, title: 'ใบสรุปใบสั่ง' });
})();
`;

// ชั้นดูรูปของใบสรุป — ปุ่มแชร์เป็นทางหลัก ปุ่มดาวน์โหลดเป็นทางสำรอง
export function summaryShotHtml(bill = {}) {
  const name = `ใบสรุป-${bill.bill_number || 'muangjod'}.png`;
  return `<div class="shot" id="shot" hidden>
    <div class="wrap">
    <div class="frame" id="shot-frame">
      <img id="shot-img" alt="ใบสรุปใบสั่ง ${escapeHtml(bill.bill_number || '')}" />
    </div>
    <div class="bar">
      <p id="shot-hint">แตะรูปเพื่อขยายให้เห็นตัวเลขชัด ๆ · แตะค้างไว้เพื่อ “บันทึกรูปภาพ”<br />แล้วส่งให้ลูกค้าในไลน์ได้เลยค่ะ 💜</p>
      <div class="row">
        <button type="button" id="shot-share">📤 ส่ง / บันทึกรูป</button>
        <a id="shot-dl" hidden download="${escapeHtml(name)}">⬇️ บันทึกลงเครื่อง</a>
        <button type="button" id="shot-close">ปิด</button>
      </div>
    </div>
    </div>
  </div>`;
}
