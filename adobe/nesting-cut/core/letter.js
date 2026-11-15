// ไดคัทตัวหนังสือ: สติ๊กเกอร์ตัวอักษร (PVC / ไวนิลสี ตัดด้วยเครื่องตัดสติ๊กเกอร์) สำหรับติดอะคริลิค
//
// งานจริงของร้าน: ตัวหนังสือ → Outline → รวมตัวที่ซ้อนกัน → ย่อ/ขยายตามขนาดป้าย
//   → ติดหลังอะคริลิคใส ต้องกลับด้าน (มองทะลุจากด้านหน้าอ่านถูก) → เส้นตัด CutContour
//   → กรอบลอกเศษรอบงาน + เส้นคั่นระหว่างบรรทัด (ลอกเศษง่าย ไม่ฉีก) → วางหลายชุดบนหน้าม้วน
// ไฟล์นี้คำนวณแผน (ไม่แตะ Illustrator) ให้แผงใช้แสดงตัวอย่าง และส่งตัวเลขให้ host.jsx ทำงานจริง
// พิกัด มม. (y ลง) เหมือนเอนจินตัวอื่น
(function (root, factory) {
  if (typeof module === 'object' && module.exports && typeof window === 'undefined') {
    module.exports = factory();
  } else {
    var ns = (root.NestingCut = root.NestingCut || {});
    ns.letter = factory();
  }
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  function boxOf(ring) {
    var b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    for (var i = 0; i < ring.length; i++) {
      var p = ring[i];
      if (p[0] < b.minX) b.minX = p[0];
      if (p[0] > b.maxX) b.maxX = p[0];
      if (p[1] < b.minY) b.minY = p[1];
      if (p[1] > b.maxY) b.maxY = p[1];
    }
    return b;
  }
  function union(boxes) {
    var b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    boxes.forEach(function (q) {
      b.minX = Math.min(b.minX, q.minX);
      b.minY = Math.min(b.minY, q.minY);
      b.maxX = Math.max(b.maxX, q.maxX);
      b.maxY = Math.max(b.maxY, q.maxY);
    });
    return b;
  }
  function median(a) {
    if (!a.length) return 0;
    var s = a.slice().sort(function (x, y) {
      return x - y;
    });
    var m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }
  function num(v, d) {
    v = parseFloat(v);
    return isFinite(v) ? v : d;
  }

  // ย่อ/ขยาย: 'keep' = ขนาดเดิมในไฟล์ · 'width' / 'height' = ให้กว้าง/สูงรวมเท่าที่กรอก (มม.)
  function scaleFor(b, mode, size) {
    var w = b.maxX - b.minX;
    var h = b.maxY - b.minY;
    if (mode === 'width' && size > 0 && w > 0) return size / w;
    if (mode === 'height' && size > 0 && h > 0) return size / h;
    return 1;
  }

  /* บรรทัด: รวมชิ้นที่ช่วงแนวตั้งซ้อนหรือห่างกันนิดเดียวเป็นบรรทัดเดียว
   * (สระบน/ล่าง วรรณยุกต์ของภาษาไทย ลอยห่างจากพยัญชนะนิดหน่อย — ต้องอยู่บรรทัดเดียวกัน)
   * ช่องว่างที่ถือว่าขึ้นบรรทัดใหม่ ≥ joinGap (มม. ก่อนย่อ/ขยาย) → [{ minY, maxY }] เรียงบน → ล่าง */
  function rowBands(boxes, joinGap) {
    var s = boxes.slice().sort(function (a, b) {
      return a.minY - b.minY;
    });
    var bands = [];
    s.forEach(function (q) {
      var last = bands[bands.length - 1];
      if (last && q.minY - last.maxY < joinGap) last.maxY = Math.max(last.maxY, q.maxY);
      else bands.push({ minY: q.minY, maxY: q.maxY });
    });
    return bands;
  }

  /* วางหลายชุดบนม้วน: กรอบละ bw × bh มม. ห่างกัน gap · หน้าม้วน roll (0 = ไม่จำกัด → เรียงแถวเดียวลงมา)
   * → { cols, rows, w, h, positions: [[x, y] มุมซ้ายบนของแต่ละชุด], fits } */
  function grid(n, bw, bh, roll, gap) {
    n = Math.max(1, Math.round(n) || 1);
    var cols = 1;
    if (roll > 0) cols = Math.max(1, Math.min(n, Math.floor((roll + gap + 1e-6) / (bw + gap))));
    var rows = Math.ceil(n / cols);
    var pos = [];
    for (var i = 0; i < n; i++) pos.push([(i % cols) * (bw + gap), Math.floor(i / cols) * (bh + gap)]);
    var usedCols = Math.min(cols, n);
    return {
      cols: usedCols,
      rows: rows,
      w: usedCols * bw + (usedCols - 1) * gap,
      h: rows * bh + (rows - 1) * gap,
      positions: pos,
      fits: !(roll > 0) || bw <= roll + 1e-6,
    };
  }

  /* แผนงาน · rings = วงปิดของตัวหนังสือ (มม.) · o:
   *   sizeMode 'keep' | 'width' | 'height', size (มม.), mirror, weed (กรอบลอกเศษ), margin (มม. จากตัวหนังสือถึงกรอบ),
   *   rows (เส้นคั่นบรรทัด), copies, roll (หน้าม้วน มม. 0 = ไม่จำกัด), gap (มม. ระหว่างชุด), minPiece (มม.), rotate ('auto' | 'never')
   * → { k, w, h, boxW, boxH, margin, rowsAt: [สัดส่วน 0..1 จากบนของตัวหนังสือ], rows, tiny, pieces, letterH,
   *     rotated, layout, lengthMm, warnings: [{ code, ... }] } */
  function plan(rings, o) {
    o = o || {};
    var boxes = (rings || []).filter(function (r) {
      return r && r.length >= 3;
    }).map(boxOf);
    if (!boxes.length) return null;
    var b = union(boxes);
    var w0 = b.maxX - b.minX;
    var h0 = b.maxY - b.minY;
    var k = scaleFor(b, o.sizeMode, num(o.size, 0));
    var w = w0 * k;
    var h = h0 * k;
    var weed = o.weed !== false;
    var m = weed ? Math.max(0, num(o.margin, 5)) : 0;
    var boxW = w + 2 * m;
    var boxH = h + 2 * m;

    // ความสูงตัวอักษรทั่วไป = ค่ากลางของความสูงแต่ละชิ้น (พยัญชนะเป็นส่วนใหญ่ สระ/วรรณยุกต์ไม่ดึงค่า)
    var heights = boxes.map(function (q) {
      return q.maxY - q.minY;
    });
    var typical = median(heights);
    // ขึ้นบรรทัดใหม่เมื่อช่องว่าง ≥ 35% ของความสูงตัวอักษร และหลังย่อ/ขยายเหลือ ≥ 3 มม. (มีที่ให้มีดลงกลางช่องได้)
    var joinGap = Math.max(typical * 0.35, 3 / Math.max(k, 1e-9));
    var bands = rowBands(boxes, joinGap);
    var rowsAt = [];
    if (o.rows !== false && h0 > 0) {
      for (var i = 1; i < bands.length; i++) rowsAt.push(((bands[i - 1].maxY + bands[i].minY) / 2 - b.minY) / h0);
    }

    var minPiece = Math.max(0, num(o.minPiece, 2));
    var tiny = 0;
    boxes.forEach(function (q) {
      if (Math.max(q.maxX - q.minX, q.maxY - q.minY) * k < minPiece) tiny++;
    });

    // วางชุดบนม้วน: กว้างเกินหน้าม้วนแต่หมุน 90° แล้วพอดี → หมุนให้วิ่งตามความยาวม้วน
    var roll = Math.max(0, num(o.roll, 0));
    var gap = Math.max(0, num(o.gap, 5));
    var n = Math.max(1, Math.round(num(o.copies, 1)));
    var lay = grid(n, boxW, boxH, roll, gap);
    var rotated = false;
    if (roll > 0 && o.rotate !== 'never') {
      var alt = grid(n, boxH, boxW, roll, gap);
      if ((!lay.fits && alt.fits) || (lay.fits && alt.fits && alt.h < lay.h - 1e-6 && o.rotate === 'save')) {
        lay = alt;
        rotated = true;
      }
    }

    var warnings = [];
    if (tiny) warnings.push({ code: 'TINY', count: tiny, min: minPiece });
    var letterH = typical * k;
    if (letterH > 0 && letterH < 8) warnings.push({ code: 'SMALL', height: letterH });
    if (!lay.fits) warnings.push({ code: 'TOO_WIDE', width: Math.min(boxW, boxH), roll: roll });

    return {
      k: k,
      src: b,
      w: w,
      h: h,
      margin: m,
      weed: weed,
      boxW: boxW,
      boxH: boxH,
      rowsAt: rowsAt,
      rows: bands.length,
      pieces: boxes.length,
      tiny: tiny,
      letterH: letterH,
      mirror: !!o.mirror,
      rotated: rotated,
      layout: lay,
      lengthMm: lay.h,
      warnings: warnings,
    };
  }

  /* รูปทรงหนึ่งชุด (มม. มุมซ้ายบนของกรอบ = 0,0) ตามแผน: ย่อ/ขยาย · กลับด้าน · หมุน
   * → { rings, box: [w, h], lines: [[[x, y], [x, y]]] (เส้นคั่นบรรทัด), frame: วงกรอบลอกเศษ | null } */
  function piece(rings, p) {
    var b = p.src;
    var k = p.k;
    var m = p.margin;
    var W = p.boxW;
    var H = p.boxH;
    function tf(q) {
      var x = (p.mirror ? b.maxX - q[0] : q[0] - b.minX) * k + m;
      var y = (q[1] - b.minY) * k + m;
      // หมุน 90° ทวนเข็ม (เท่ากับ rotate(90) ของ Illustrator): ขวา → บน
      return p.rotated ? [y, W - x] : [x, y];
    }
    var out = (rings || []).map(function (r) {
      return r.map(tf);
    });
    var lines = p.rowsAt.map(function (f) {
      var y = m + f * p.h;
      return [tf2([0, y]), tf2([W, y])];
    });
    function tf2(q) {
      return p.rotated ? [q[1], W - q[0]] : q;
    }
    var frame = p.weed ? [[0, 0], [W, 0], [W, H], [0, H]].map(tf2) : null;
    return { rings: out, box: p.rotated ? [H, W] : [W, H], lines: lines, frame: frame };
  }

  return { plan: plan, piece: piece, rowBands: rowBands, grid: grid, scaleFor: scaleFor, median: median };
});
