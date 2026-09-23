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
  };
});
