// เส้นบอกขนาด (Dimension) และรันนัมเบอร์ — คำนวณล้วน ๆ ให้ host.jsx วาดตาม
//
// พิกัดเป็นพิกัดเอกสารของ Illustrator (pt, y ชี้ขึ้น) กรอบ = [left, top, right, bottom]
(function (root, factory) {
  if (typeof module === 'object' && module.exports && typeof window === 'undefined') {
    module.exports = factory();
  } else {
    var ns = (root.NestingCut = root.NestingCut || {});
    ns.dimension = factory();
  }
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  var PT_PER_MM = 72 / 25.4;
  var UNITS = {
    mm: { label: 'mm', mm: 1 },
    cm: { label: 'cm', mm: 10 },
    m: { label: 'm', mm: 1000 },
    in: { label: 'in', mm: 25.4 },
  };

  // ความยาวบนไฟล์ (pt) → ขนาดจริงตามสเกล 1:scale → ข้อความ
  function formatLength(pt, opts) {
    var o = opts || {};
    var unit = UNITS[o.unit] || UNITS.mm;
    var real = (pt / PT_PER_MM) * (o.scale > 0 ? o.scale : 1);
    var v = real / unit.mm;
    var dec = Math.max(0, Math.min(4, o.decimals == null ? 1 : o.decimals));
    var s = v.toFixed(dec);
    return o.showUnit === false ? s : s + ' ' + unit.label;
  }

  // ด้านที่วาง: กว้าง = top | bottom, สูง = left | right ('auto' → กว้างบน สูงขวา)
  // opts (pt): { side, offset, overshoot, gap, size, arrow }
  // คืน { lines: [[x1,y1,x2,y2]], arrows: [[[x,y]x3]], text: { str, size, vertical, side, line, mid, gap } }
  function dimension(box, axis, opts) {
    var o = opts || {};
    var l = box[0];
    var t = box[1];
    var r = box[2];
    var b = box[3];
    var off = o.offset != null ? o.offset : 8 * PT_PER_MM;
    var over = o.overshoot != null ? o.overshoot : 2 * PT_PER_MM;
    var gap = o.gap != null ? o.gap : 1 * PT_PER_MM;
    var size = o.size || 8;
    var al = o.arrow != null ? o.arrow : size * 0.8;
    var aw = al * 0.35;
    var side = o.side;
    var lines = [];
    var arrows = [];
    var text;
    if (axis === 'w') {
      if (side !== 'bottom') side = 'top';
      var y = side === 'top' ? t + off : b - off;
      var ey = side === 'top' ? y + over : y - over;
      var sy = side === 'top' ? t + gap : b - gap;
      lines.push([l, sy, l, ey], [r, sy, r, ey], [l, y, r, y]);
      if (r - l > al * 2.2) {
        arrows.push([[l, y], [l + al, y + aw], [l + al, y - aw]], [[r, y], [r - al, y + aw], [r - al, y - aw]]);
      }
      text = { size: size, vertical: false, side: side, line: y, mid: (l + r) / 2, gap: gap };
    } else {
      if (side !== 'left') side = 'right';
      var x = side === 'right' ? r + off : l - off;
      var ex = side === 'right' ? x + over : x - over;
      var sx = side === 'right' ? r + gap : l - gap;
      lines.push([sx, t, ex, t], [sx, b, ex, b], [x, t, x, b]);
      if (t - b > al * 2.2) {
        arrows.push([[x, t], [x - aw, t - al], [x + aw, t - al]], [[x, b], [x - aw, b + al], [x + aw, b + al]]);
      }
      text = { size: size, vertical: true, side: side, line: x, mid: (t + b) / 2, gap: gap };
    }
    return { lines: lines, arrows: arrows, text: text };
  }

  // กรอบรวมของหลายชิ้น
  function unionBox(boxes) {
    var u = null;
    boxes.forEach(function (bx) {
      if (!u) u = bx.slice();
      else u = [Math.min(u[0], bx[0]), Math.max(u[1], bx[1]), Math.max(u[2], bx[2]), Math.min(u[3], bx[3])];
    });
    return u;
  }

  // ---------------------------------------------------------------- รันนัมเบอร์

  // เลขลำดับที่ i (0, 1, 2, …) เป็นข้อความ: prefix + เลข (เติมศูนย์) + suffix
  // opts: { start, step, prefix, suffix, pad: 'auto' | number, count }
  function numberText(i, opts) {
    var o = opts || {};
    var start = isFinite(o.start) ? Number(o.start) : 1;
    var step = isFinite(o.step) ? Number(o.step) : 1;
    var v = start + i * step;
    var width = 0;
    if (o.pad === 'auto' || o.pad == null) {
      var count = Math.max(1, o.count || 1);
      var last = start + (count - 1) * step;
      width = Math.max(String(Math.abs(Math.trunc(start))).length, String(Math.abs(Math.trunc(last))).length);
    } else width = Math.max(0, parseInt(o.pad, 10) || 0);
    var digits = String(Math.abs(v));
    while (digits.length < width) digits = '0' + digits;
    return (o.prefix || '') + (v < 0 ? '-' : '') + digits + (o.suffix || '');
  }

  // ใส่เลขในข้อความ: มี {%n} แทนเฉพาะตรงนั้น ไม่มีก็แทนทั้งข้อความ
  function fillTemplate(text, value, onlyToken) {
    var src = String(text == null ? '' : text);
    if (src.indexOf('{%n}') >= 0) return src.split('{%n}').join(value);
    return onlyToken ? src : value;
  }

  // เรียงกรอบข้อความ: 'rows' (บน→ล่าง แล้วซ้าย→ขวา) · 'cols' (ซ้าย→ขวา แล้วบน→ล่าง) · 'layer' (ตามลำดับที่ส่งมา)
  // items: [{ vb: [l, t, r, b], ... }] → คืนลำดับใหม่ (สำเนา)
  function orderItems(items, mode) {
    var list = items.slice();
    if (mode === 'layer') return list;
    var hs = list
      .map(function (it) {
        return mode === 'cols' ? it.vb[2] - it.vb[0] : it.vb[1] - it.vb[3];
      })
      .sort(function (a, b) {
        return a - b;
      });
    var tol = (hs.length ? hs[hs.length >> 1] : 0) / 2;
    function key(it) {
      return mode === 'cols' ? [(it.vb[0] + it.vb[2]) / 2, -(it.vb[1] + it.vb[3]) / 2] : [-(it.vb[1] + it.vb[3]) / 2, (it.vb[0] + it.vb[2]) / 2];
    }
    list.sort(function (a, b) {
      var ka = key(a);
      var kb = key(b);
      if (Math.abs(ka[0] - kb[0]) > tol) return ka[0] - kb[0];
      return ka[1] - kb[1];
    });
    return list;
  }

  var POSITIONS = ['top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right'];

  // ตำแหน่งเลขหน้าบนอาร์ตบอร์ด rect = [l, t, r, b] (pt)
  // mirror: หน้าคู่ (ลำดับหน้าที่ 2, 4, …) สลับซ้าย↔ขวา · คืน { x, y, justify: 'left' | 'center' | 'right' }
  function pagePosition(rect, pos, marginPt, size, mirror, pageNo) {
    var p = POSITIONS.indexOf(pos) >= 0 ? pos : 'bottom-center';
    var v = p.split('-')[0];
    var h = p.split('-')[1];
    if (mirror && pageNo % 2 === 0) h = h === 'left' ? 'right' : h === 'right' ? 'left' : h;
    var x = h === 'left' ? rect[0] + marginPt : h === 'right' ? rect[2] - marginPt : (rect[0] + rect[2]) / 2;
    // baseline: ด้านบนหักความสูงตัวอักษร ด้านล่างอยู่เหนือขอบพอดี
    var y = v === 'top' ? rect[1] - marginPt - size * 0.75 : rect[3] + marginPt;
    return { x: x, y: y, justify: h };
  }

  // ---------------------------------------------------------------- รันเลข + จัดเรียงหลายหน้า (Step & Repeat)

  /* วางชิ้นงานซ้ำเต็มกระดาษ: o = { itemW, itemH, sheetW, sheetH, margin, gap, rotate } (หน่วยเดียวกัน เช่น pt)
   * ลองชิ้นงานตรง/หมุน 90° × กระดาษตั้ง/นอน แล้วเลือกแบบที่ได้ต่อหน้ามากสุด (เท่ากัน: ไม่หมุนชิ้นงานก่อน แล้วกระดาษตามที่ตั้ง)
   * → { cols, rows, perSheet, rot, landscape, sheetW, sheetH, cellW, cellH, gap, x0, y0, gridW, gridH, slots: [{ x, y }] }
   *   slots = มุมซ้ายบนของแต่ละชิ้น วัดจากมุมซ้ายบนกระดาษ (แกน y ชี้ลง) เรียงซ้าย→ขวา บน→ล่าง · วางไม่ได้คืน null */
  function sheetGrid(o) {
    var m = Math.max(0, +o.margin || 0);
    var g = Math.max(0, +o.gap || 0);
    var items = [[+o.itemW, +o.itemH, false]];
    if (o.rotate && Math.abs(o.itemW - o.itemH) > 1e-6) items.push([+o.itemH, +o.itemW, true]);
    var sheets = [[+o.sheetW, +o.sheetH, false]];
    if (Math.abs(o.sheetW - o.sheetH) > 1e-6) sheets.push([+o.sheetH, +o.sheetW, true]);
    var best = null;
    items.forEach(function (it) {
      sheets.forEach(function (sh) {
        if (!(it[0] > 0 && it[1] > 0)) return;
        var cols = Math.floor((sh[0] - 2 * m + g + 1e-6) / (it[0] + g));
        var rows = Math.floor((sh[1] - 2 * m + g + 1e-6) / (it[1] + g));
        var n = cols > 0 && rows > 0 ? cols * rows : 0;
        if (n > (best ? best.perSheet : 0)) best = { cols: cols, rows: rows, perSheet: n, rot: it[2], landscape: sh[2], sheetW: sh[0], sheetH: sh[1], cellW: it[0], cellH: it[1], gap: g };
      });
    });
    if (!best) return null;
    best.gridW = best.cols * best.cellW + (best.cols - 1) * g;
    best.gridH = best.rows * best.cellH + (best.rows - 1) * g;
    best.x0 = (best.sheetW - best.gridW) / 2;
    best.y0 = (best.sheetH - best.gridH) / 2;
    best.slots = [];
    for (var r = 0; r < best.rows; r++) {
      for (var c = 0; c < best.cols; c++) best.slots.push({ x: best.x0 + c * (best.cellW + g), y: best.y0 + r * (best.cellH + g) });
    }
    return best;
  }

  /* เลขของแต่ละช่อง: 'page' = เรียงทีละหน้า (หน้า 1 ได้เลขแรก ๆ) · 'stack' = ตัดทั้งปึกแล้ววางกองต่อกัน เลขเรียงพอดี
   * (ช่องเดียวกันของทุกหน้าเลขติดกัน: หน้า 1 อยู่บนสุด) → { pages, cells: [{ page, slot, i }] } (i = ลำดับเลข 0..count-1) */
  function sheetNumbers(count, perSheet, order) {
    var n = Math.max(0, Math.floor(count));
    var per = Math.max(1, Math.floor(perSheet));
    var pages = Math.max(1, Math.ceil(n / per));
    var cells = [];
    for (var i = 0; i < n; i++) {
      if (order === 'stack') cells.push({ page: i % pages, slot: Math.floor(i / pages), i: i });
      else cells.push({ page: Math.floor(i / per), slot: i % per, i: i });
    }
    return { pages: pages, cells: cells };
  }

  /* ครอปมาร์กรอบกริด: เส้นสั้นในระยะขอบกระดาษ ตรงแนวตัดทุกเส้น (ตัดกิโยตินทั้งปึกได้) · ชิ้นชิดกันใช้แนวตัดร่วม
   * o = { offset, length } → [[x1, y1, x2, y2], …] (มุมซ้ายบนกระดาษ แกน y ชี้ลง) */
  function sheetMarks(grid, o) {
    var off = o && o.offset > 0 ? o.offset : 0;
    var len = o && o.length > 0 ? o.length : 0;
    if (!grid || !(len > 0)) return [];
    function edges(start, cell, gap, n) {
      var out = [];
      for (var k = 0; k < n; k++) {
        var a = start + k * (cell + gap);
        [a, a + cell].forEach(function (v) {
          if (!out.some(function (u) {
            return Math.abs(u - v) < 0.01;
          })) out.push(v);
        });
      }
      return out;
    }
    var xs = edges(grid.x0, grid.cellW, grid.gap, grid.cols);
    var ys = edges(grid.y0, grid.cellH, grid.gap, grid.rows);
    var top = grid.y0;
    var bottom = grid.y0 + grid.gridH;
    var left = grid.x0;
    var right = grid.x0 + grid.gridW;
    var lines = [];
    xs.forEach(function (x) {
      lines.push([x, top - off - len, x, top - off], [x, bottom + off, x, bottom + off + len]);
    });
    ys.forEach(function (y) {
      lines.push([left - off - len, y, left - off, y], [right + off, y, right + off + len, y]);
    });
    return lines;
  }

  /* อาร์ตบอร์ดหลายหน้าในไฟล์ใหม่: เรียงเป็นตาราง ไม่ให้เกินพื้นที่ทำงานของ Illustrator (~227 นิ้ว) และไม่เกิน 1,000 อาร์ตบอร์ด
   * square = จำนวนคอลัมน์ ≈ จำนวนแถว (หน้าละ 1 ใบ: 9 ใบ = 3 × 3) · → { cols, rows } หรือ null ถ้าหน้าเยอะเกิน */
  function artboardGrid(pages, w, h, spacing, canvas, square) {
    if (pages > 1000) return null;
    var room = canvas || 15800;
    var sp = spacing == null ? 28 : spacing;
    var maxCols = Math.max(1, Math.floor((room + sp) / (w + sp)));
    var want = square ? Math.ceil(Math.sqrt(pages)) : Math.ceil(Math.sqrt(pages * (h + sp) / (w + sp)));
    var cols = Math.max(1, Math.min(pages, maxCols, want));
    var rows = Math.ceil(pages / cols);
    if (rows * (h + sp) - sp > room) {
      cols = maxCols;
      rows = Math.ceil(pages / cols);
      if (rows * (h + sp) - sp > room) return null;
    }
    return { cols: cols, rows: rows };
  }

  /* กล่องข้อความที่จะใส่เลข (จากข้อความทั้งหมดในชิ้นงานต้นแบบ): texts = ['ข้อความ', …] · o = { token, prefix, suffix }
   * ① กล่องที่มี {%n} (แทนเฉพาะตรงนั้น) ② ติ๊ก “แทนเฉพาะ {%n}” แต่ไม่มี → error ③ มีกล่องเดียว → กล่องนั้น
   * ④ ข้อความสั้น ๆ ที่มีตัวเลข เช่น NO.0000 (ใบหลัก + ต้นขั้ว ได้เลขเดียวกันทุกกล่อง) ⑤ ไม่รู้ว่ากล่องไหน → error
   * → { targets: [{ idx, ranges: [[เริ่ม, ยาว], …] } | { idx, all: true }], why } · ranges = ส่วนที่แทนด้วยเลข (คงสี/ฟอนต์ส่วนอื่น) */
  function numberTargets(texts, o) {
    o = o || {};
    var list = (texts || []).map(function (t) {
      return String(t == null ? '' : t);
    });
    var tok = [];
    list.forEach(function (t, i) {
      if (t.indexOf('{%n}') >= 0) tok.push(i);
    });
    function tokenRanges(t) {
      var out = [];
      var at = t.indexOf('{%n}');
      while (at >= 0) {
        out.push([at, 4]);
        at = t.indexOf('{%n}', at + 4);
      }
      return out;
    }
    if (tok.length) {
      return {
        why: 'token',
        targets: tok.map(function (i) {
          return { idx: i, ranges: tokenRanges(list[i]) };
        }),
      };
    }
    if (o.token) throw new Error('NO_TOKEN');
    if (!list.length) throw new Error('NO_TEXT');
    var affix = !!(o.prefix || o.suffix);
    // ไม่ได้ตั้ง Prefix/Suffix: แทนเฉพาะกลุ่มตัวเลขชุดท้าย (NO.0000 → NO.0001 คงคำว่า NO. ไว้)
    function target(i) {
      var t = list[i];
      if (!affix) {
        var m = /(\d+)(?!.*\d)/.exec(t);
        if (m) return { idx: i, ranges: [[m.index, m[1].length]] };
      }
      return { idx: i, all: true };
    }
    if (list.length === 1) return { why: 'single', targets: [target(0)] };
    var looks = [];
    list.forEach(function (t, i) {
      var s = t.replace(/^\s+|\s+$/g, '');
      if (s.length <= 24 && /\d/.test(s) && !/\s{2,}|[\r\n]/.test(s)) looks.push(i);
    });
    if (o.prefix) {
      var pre = looks.filter(function (i) {
        return list[i].replace(/^\s+/, '').indexOf(o.prefix) === 0;
      });
      if (pre.length) looks = pre;
    }
    if (looks.length) return { why: 'digits', targets: looks.map(target) };
    throw new Error('WHICH_TEXT');
  }

  return {
    PT_PER_MM: PT_PER_MM,
    UNITS: UNITS,
    POSITIONS: POSITIONS,
    formatLength: formatLength,
    dimension: dimension,
    unionBox: unionBox,
    numberText: numberText,
    fillTemplate: fillTemplate,
    orderItems: orderItems,
    pagePosition: pagePosition,
    sheetGrid: sheetGrid,
    sheetNumbers: sheetNumbers,
    sheetMarks: sheetMarks,
    artboardGrid: artboardGrid,
    numberTargets: numberTargets,
  };
});
