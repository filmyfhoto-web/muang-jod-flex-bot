// หน้าตาแผ่นงาน: ค่าตั้งต้นของเครื่องตัดแต่ละยี่ห้อ, ตำแหน่งมาร์ก, กล่องหัวงาน, พื้นที่จัดวาง
//
// พิกัด mm ของแผ่น: (0,0) = มุมซ้ายบน (หัวม้วน), x ไปทางขวา, y ลงตามทางที่ม้วนไหล
//
// ⚠️ ขนาด/ระยะมาร์กของแต่ละยี่ห้อเป็นค่าเริ่มต้นโดยประมาณ ต้องตั้งให้ตรงกับซอฟต์แวร์เครื่องตัดของร้าน
//    (Cutting Master / FineCut / Silhouette Studio ฯลฯ) — แก้ในแผงได้ทุกค่า
(function (root, factory) {
  if (typeof module === 'object' && module.exports && typeof window === 'undefined') {
    module.exports = factory();
  } else {
    var ns = (root.NestingCut = root.NestingCut || {});
    ns.layout = factory();
  }
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  var CUTTERS = [
    {
      id: 'graphtec',
      label: 'Graphtec (Cutting Master)',
      margin: 5,
      marks: { type: 'L', size: 20, thick: 0.5, inset: 10, clearance: 5, every: 0 },
      note: 'มาร์กแบบ L 4 มุม — ตั้ง ARMS ใน Cutting Master ให้ตรง (ยาว 20 มม. หนา 0.5 มม.) หรือปิดมาร์กแล้วใช้มาร์กของ Cutting Master เอง',
    },
    {
      id: 'mimaki',
      label: 'Mimaki (FineCut / RasterLink)',
      margin: 5,
      marks: { type: 'L', size: 10, thick: 0.5, inset: 10, clearance: 5, every: 0 },
      note: 'มาร์กแบบ L 4 มุม — ตั้งขนาด register mark ใน FineCut ให้ตรง',
    },
    {
      id: 'silhouette',
      label: 'Silhouette (Print & Cut)',
      margin: 5,
      marks: { type: 'silhouette', size: 20, thick: 0.5, inset: 10, square: 5, clearance: 5, every: 0 },
      note: 'สี่เหลี่ยมทึบมุมซ้ายบน + L สองมุม แบบ Silhouette Studio',
    },
    {
      id: 'circle4',
      label: 'เครื่องจีน / ทั่วไป — จุดวงกลม 4 มุม',
      margin: 5,
      marks: { type: 'circle', size: 5, inset: 10, clearance: 4, every: 0 },
      note: 'จุดดำ Ø5 มม. 4 มุม — ใส่มาร์กกลางทุก ๆ กี่ มม. ได้ถ้างานยาว',
    },
    {
      id: 'square4',
      label: 'สี่เหลี่ยมทึบ 4 มุม',
      margin: 5,
      marks: { type: 'square', size: 5, inset: 10, clearance: 4, every: 0 },
      note: 'สี่เหลี่ยมดำ 5×5 มม. 4 มุม',
    },
    {
      id: 'roland',
      label: 'Roland (VersaWorks ใส่มาร์กเอง)',
      margin: 15,
      marks: { type: 'none' },
      note: 'ไม่ใส่มาร์ก — เปิด Print & Cut + Crop marks ใน VersaWorks แล้วส่ง PDF ที่มีเส้น CutContour',
    },
    {
      id: 'summa',
      label: 'Summa (GoSign / Cutter Tools ใส่ OPOS เอง)',
      margin: 20,
      marks: { type: 'none' },
      note: 'ไม่ใส่มาร์ก — ให้ Summa Cutter Tools / GoSign สร้าง OPOS จากเส้น CutContour',
    },
    {
      id: 'vinyl',
      label: 'ตัดสติ๊กเกอร์อย่างเดียว (ไม่พิมพ์)',
      margin: 5,
      marks: { type: 'none' },
      header: false,
      note: 'ไม่มีมาร์ก ไม่มีหัวงาน — ส่ง PLT/DXF เข้าเครื่องตัดได้ทันที',
    },
  ];

  var IN = 25.4;
  var MEDIA = [
    { id: 'a3', label: 'A3 (297 × 420 มม.)', width: 297, length: 420 },
    { id: 'in12x18', label: '12 × 18 นิ้ว', width: 12 * IN, length: 18 * IN },
    { id: 'in125x18', label: '12.5 × 18 นิ้ว', width: 12.5 * IN, length: 18 * IN },
    { id: 'a3plus', label: '13 × 19 นิ้ว', width: 13 * IN, length: 19 * IN },
    { id: 'a4', label: 'A4 (210 × 297 มม.)', width: 210, length: 297 },
    { id: 'sra3', label: 'SRA3 (320 × 450 มม.)', width: 320, length: 450 },
    { id: 'roll60', label: 'ม้วน 60 ซม.', width: 600, length: null },
    { id: 'roll120', label: 'ม้วน 120 ซม.', width: 1200, length: null },
    { id: 'roll130', label: 'ม้วน 130 ซม.', width: 1300, length: null },
    { id: 'custom', label: 'กำหนดเอง', width: 297, length: 420 },
  ];

  // ระยะขอบ: ตัวเลขเดียว = ทุกด้านเท่ากัน หรือ { top, right, bottom, left }
  function normMargin(m, fallback) {
    var d = fallback == null ? 20 : fallback;
    if (m == null) return { top: d, right: d, bottom: d, left: d };
    if (typeof m === 'number') return { top: m, right: m, bottom: m, left: m };
    function v(x) {
      return x == null || !(x >= 0) ? d : +x;
    }
    return { top: v(m.top), right: v(m.right), bottom: v(m.bottom), left: v(m.left) };
  }

  // Illustrator ทำอาร์ตบอร์ดได้ยาวสุด ~5779 มม. เผื่อไว้นิดหน่อย
  var ROLL_MAX_LENGTH = 5500;

  function find(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function hasMarks(m) {
    return !!m && !!m.type && m.type !== 'none';
  }

  // ความกว้าง/สูงของมาร์กหนึ่งตัวนับจากมุมของมัน
  function markExtent(m) {
    if (!hasMarks(m)) return 0;
    if (m.type === 'silhouette') return Math.max(m.size || 0, m.square || 0);
    return m.size || 0;
  }

  function rect(x, y, w, h) {
    return { kind: 'rect', x: x, y: y, w: w, h: h };
  }

  function group(parts) {
    var minX = Infinity;
    var minY = Infinity;
    var maxX = -Infinity;
    var maxY = -Infinity;
    parts.forEach(function (p) {
      var b =
        p.kind === 'circle'
          ? { x: p.cx - p.r, y: p.cy - p.r, w: 2 * p.r, h: 2 * p.r }
          : { x: p.x, y: p.y, w: p.w, h: p.h };
      minX = Math.min(minX, b.x);
      minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.w);
      maxY = Math.max(maxY, b.y + b.h);
    });
    return { bbox: { x: minX, y: minY, w: maxX - minX, h: maxY - minY }, parts: parts };
  }

  // มาร์กมุมหนึ่งมุม: corner = 'tl' | 'tr' | 'bl' | 'br'
  function cornerMark(m, corner, W, L) {
    var inset = m.inset || 0;
    var s = m.size || 0;
    var t = m.thick || 0.5;
    var left = corner === 'tl' || corner === 'bl';
    var top = corner === 'tl' || corner === 'tr';
    if (m.type === 'circle') {
      var r = s / 2;
      return group([
        { kind: 'circle', cx: left ? inset + r : W - inset - r, cy: top ? inset + r : L - inset - r, r: r },
      ]);
    }
    if (m.type === 'square' || (m.type === 'silhouette' && corner === 'tl')) {
      var q = m.type === 'silhouette' ? m.square || 5 : s;
      return group([rect(left ? inset : W - inset - q, top ? inset : L - inset - q, q, q)]);
    }
    // แบบ L: มุมของ L หันออกนอกแผ่น
    var hx = left ? inset : W - inset - s;
    var hy = top ? inset : L - inset - t;
    var vx = left ? inset : W - inset - t;
    var vy = top ? inset : L - inset - s;
    return group([rect(hx, hy, s, t), rect(vx, vy, t, s)]);
  }

  // มาร์กทั้งหมดของแผ่นกว้าง W ยาว L
  function markShapes(W, L, m) {
    if (!hasMarks(m)) return [];
    var corners = m.type === 'silhouette' ? ['tl', 'tr', 'bl'] : ['tl', 'tr', 'bl', 'br'];
    var out = corners.map(function (c) {
      return cornerMark(m, c, W, L);
    });
    // มาร์กกลางตามขอบซ้าย-ขวา (งานยาว) — เฉพาะวงกลม/สี่เหลี่ยม
    if (m.every > 0 && (m.type === 'circle' || m.type === 'square')) {
      var s = m.size;
      var first = (m.inset || 0) + s / 2;
      var last = L - (m.inset || 0) - s / 2;
      for (var y = first + m.every; y < last - m.every / 2; y += m.every) {
        [true, false].forEach(function (left) {
          var cx = left ? m.inset + s / 2 : W - m.inset - s / 2;
          out.push(
            group([
              m.type === 'circle'
                ? { kind: 'circle', cx: cx, cy: y, r: s / 2 }
                : rect(cx - s / 2, y - s / 2, s, s),
            ])
          );
        });
      }
    }
    return out;
  }

  function expand(b, c) {
    return { x: b.x - c, y: b.y - c, w: b.w + 2 * c, h: b.h + 2 * c };
  }

  // วางแผนแผ่นงาน
  // spec = { width, length (null = ม้วน), margin, marks, header: { enabled, height, gap }, rollMaxLength }
  function planSheet(spec) {
    var W = spec.width;
    var M = normMargin(spec.margin, 20);
    var m = spec.marks || { type: 'none' };
    var has = hasMarks(m);
    var clear = has ? (m.clearance == null ? 3 : m.clearance) : 0;
    var ext = has ? (m.inset || 0) + markExtent(m) : 0;
    var roll = !(spec.length > 0);
    var pageLength = roll ? Math.min(spec.rollMaxLength || ROLL_MAX_LENGTH, ROLL_MAX_LENGTH) : spec.length;

    var header = spec.header && spec.header.enabled ? spec.header : null;
    var headerBox = null;
    var top = M.top;
    if (header) {
      var hx0 = has ? Math.max(M.left, ext + clear) : M.left;
      var hx1 = has ? Math.min(W - M.right, W - ext - clear) : W - M.right;
      headerBox = { x: hx0, y: M.top, w: Math.max(0, hx1 - hx0), h: header.height || 20 };
      top = M.top + headerBox.h + (header.gap == null ? 3 : header.gap);
    }

    var bottomReserve = has ? Math.max(M.bottom, ext + clear) : M.bottom;
    var area = {
      x: M.left,
      y: top,
      w: W - M.left - M.right,
      // ม้วนก็จำกัดความยาวต่อแผ่นไว้ที่ pageLength (อาร์ตบอร์ด Illustrator ยาวได้จำกัด) — เกินแล้วขึ้นแผ่นใหม่
      h: pageLength - top - bottomReserve,
    };

    // สิ่งกีดขวาง: มาร์ก (บวกระยะปลอด) — ม้วนยังไม่รู้ความยาว ใส่แค่มาร์กบน + มาร์กกลาง
    var obstacles = [];
    if (has) {
      var shapes = markShapes(W, pageLength, m);
      shapes.forEach(function (g) {
        var b = g.bbox;
        var isBottomCorner = b.y + b.h > pageLength - ext - 0.001 && b.y > pageLength / 2;
        if (roll && isBottomCorner) return;
        obstacles.push(expand(b, clear));
      });
    }

    return {
      width: W,
      roll: roll,
      fixedLength: roll ? null : pageLength,
      pageLength: pageLength,
      margin: M,
      marks: m,
      markClearance: clear,
      markExtent: ext,
      area: area,
      obstacles: obstacles,
      headerBox: headerBox,
    };
  }

  // ความยาวจริงของแผ่นหลังจัดวาง (ม้วน = ตัดแค่ที่ใช้)
  function finalLength(plan, contentMaxY) {
    if (!plan.roll) return plan.fixedLength;
    var has = hasMarks(plan.marks);
    var tail = has ? Math.max(plan.margin.bottom, plan.markExtent + plan.markClearance) : plan.margin.bottom;
    var minLen = has ? 2 * plan.markExtent + plan.markClearance : 0;
    var L = Math.max(contentMaxY == null ? plan.area.y : contentMaxY + tail, minLen, plan.area.y + tail);
    return Math.min(Math.ceil(L), plan.pageLength);
  }

  // กล่องย่อยในหัวงาน: โลโก้ชิดซ้าย (ตามสัดส่วนภาพ) แล้วตามด้วยข้อความ
  function headerLayout(box, logoAspect, pad) {
    if (!box) return null;
    pad = pad == null ? 2 : pad;
    var h = Math.max(0, box.h - 2 * pad);
    var logoW = logoAspect > 0 ? Math.min(h * logoAspect, box.w * 0.45) : 0;
    var logoH = logoAspect > 0 ? logoW / logoAspect : 0;
    return {
      logo: logoAspect > 0 ? { x: box.x + pad, y: box.y + (box.h - logoH) / 2, w: logoW, h: logoH } : null,
      text: {
        x: box.x + pad + (logoW ? logoW + 4 : 0),
        y: box.y + pad,
        w: Math.max(0, box.w - 2 * pad - (logoW ? logoW + 4 : 0)),
        h: h,
      },
    };
  }

  // เส้นตรงยาวตามขอบกรอบทุกดวง (boxes = {minX,minY,maxX,maxY})
  // ช่วงที่เส้นจะผ่านกลางดวงอื่นถูกเว้นไว้
  function gridSegments(boxes) {
    var E = 0.01;
    var out = [];
    function run(horiz) {
      var seen = {};
      boxes.forEach(function (b) {
        (horiz ? [b.minY, b.maxY] : [b.minX, b.maxX]).forEach(function (v) {
          var k = v.toFixed(2);
          if (seen[k]) return;
          seen[k] = true;
          var lo = Infinity;
          var hi = -Infinity;
          var blocks = [];
          boxes.forEach(function (c) {
            var a0 = horiz ? c.minY : c.minX;
            var a1 = horiz ? c.maxY : c.maxX;
            var b0 = horiz ? c.minX : c.minY;
            var b1 = horiz ? c.maxX : c.maxY;
            if (v < a0 - E || v > a1 + E) return;
            if (v > a0 + E && v < a1 - E) blocks.push([b0, b1]);
            else {
              lo = Math.min(lo, b0);
              hi = Math.max(hi, b1);
            }
          });
          if (!(hi > lo)) return;
          blocks.sort(function (m, n) {
            return m[0] - n[0];
          });
          var cur = lo;
          blocks.concat([[hi, hi]]).forEach(function (bl) {
            var e = Math.min(bl[0], hi);
            if (e - cur > E) {
              out.push({
                closed: false,
                points: horiz ? [[cur, v], [e, v]] : [[v, cur], [v, e]]
              });
            }
            cur = Math.max(cur, bl[1]);
          });
        });
      });
    }
    run(true);
    run(false);
    return out;
  }

  return {
    CUTTERS: CUTTERS,
    normMargin: normMargin,
    gridSegments: gridSegments,
    MEDIA: MEDIA,
    ROLL_MAX_LENGTH: ROLL_MAX_LENGTH,
    cutter: function (id) {
      return find(CUTTERS, id);
    },
    media: function (id) {
      return find(MEDIA, id);
    },
    hasMarks: hasMarks,
    markShapes: markShapes,
    planSheet: planSheet,
    finalLength: finalLength,
    headerLayout: headerLayout,
  };
});
