// ไดคัทต่อเนื่อง: วางสติ๊กเกอร์ต้นแบบเดียวซ้ำเต็มแผ่น แล้วทำเส้นตัดยาวต่อเนื่อง ลดจำนวนครั้งที่ใบมีดยก
//
// พิกัดเป็น mm, y ชี้ลง (เหมือนเอนจินจัดวาง) รูปทรงของดวงวางศูนย์กลางไว้ที่ (0,0)
//
// เส้นตัดต่อเนื่อง 1 แถว = 1 เส้น (ยกใบมีดครั้งเดียว):
//   เริ่มที่จุดซ้ายสุดของดวงแรก → ไปตามขอบบนถึงจุดขวาสุด → ลากผ่านช่องว่างไปจุดซ้ายสุดของดวงถัดไป → …
//   ถึงดวงสุดท้ายแล้ววนกลับตามขอบล่างจากขวาไปซ้าย จนกลับมาที่จุดเริ่ม
// เส้นที่ลากผ่านช่องว่างอยู่ในเนื้อกระดาษทิ้งเสมอ (อยู่ระหว่างจุดขวาสุดกับซ้ายสุดของสองดวง) ไม่โดนตัวดวง
// กรอบสี่เหลี่ยมชิดกัน (ระยะห่าง 0) ใช้เส้นตรงยาวเต็มแถว/คอลัมน์แทน — ไม่ตัดซ้ำเส้นเดิมสองรอบ
(function (root, factory) {
  if (typeof module === 'object' && module.exports && typeof window === 'undefined') {
    module.exports = factory(require('./geometry.js'));
  } else {
    var ns = (root.NestingCut = root.NestingCut || {});
    ns.diecut = factory(ns.geometry);
  }
})(typeof window !== 'undefined' ? window : this, function (G) {
  'use strict';

  var SHAPES = [
    { id: 'rect', label: 'สี่เหลี่ยม' },
    { id: 'rounded', label: 'สี่เหลี่ยมมุมมน' },
    { id: 'circle', label: 'วงกลม' },
    { id: 'oval', label: 'วงรี' },
    { id: 'artwork', label: 'ตามเส้นไดคัทของงาน' },
  ];

  var MAX_PER_SHEET = 400;

  function arc(out, cx, cy, rx, ry, a0, a1, n) {
    for (var i = 0; i <= n; i++) {
      var t = a0 + ((a1 - a0) * i) / n;
      out.push([cx + rx * Math.cos(t), cy + ry * Math.sin(t)]);
    }
  }

  // รูปทรงศูนย์กลาง (0,0) ขนาด w × h (mm) — วนทิศเดียวกันทุกแบบ
  function shapeRing(kind, w, h, radius) {
    var hw = w / 2;
    var hh = h / 2;
    var pts = [];
    if (kind === 'circle' || kind === 'oval') {
      var rx = kind === 'circle' ? Math.min(hw, hh) : hw;
      var ry = kind === 'circle' ? rx : hh;
      var n = Math.max(48, Math.min(240, Math.round(Math.max(rx, ry) * 4)));
      for (var i = 0; i < n; i++) {
        var t = Math.PI + (2 * Math.PI * i) / n; // เริ่มที่จุดซ้ายสุด
        pts.push([rx * Math.cos(t), ry * Math.sin(t)]);
      }
      return pts;
    }
    var r = kind === 'rounded' ? Math.max(0, Math.min(radius || 0, hw, hh)) : 0;
    if (r < 1e-6) return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
    var seg = Math.max(4, Math.min(24, Math.round(r * 2)));
    arc(pts, -hw + r, -hh + r, r, r, Math.PI, 1.5 * Math.PI, seg);
    arc(pts, hw - r, -hh + r, r, r, 1.5 * Math.PI, 2 * Math.PI, seg);
    arc(pts, hw - r, hh - r, r, r, 0, 0.5 * Math.PI, seg);
    arc(pts, -hw + r, hh - r, r, r, 0.5 * Math.PI, Math.PI, seg);
    return G.dedupe(pts, 1e-9);
  }

  // ย้ายวงให้กรอบอยู่กลาง (0,0)
  function centerRing(ring) {
    var b = G.bounds([ring]);
    var cx = (b.minX + b.maxX) / 2;
    var cy = (b.minY + b.maxY) / 2;
    return ring.map(function (p) {
      return [p[0] - cx, p[1] - cy];
    });
  }

  function shift(ring, dx, dy) {
    return ring.map(function (p) {
      return [p[0] + dx, p[1] + dy];
    });
  }

  // ระยะแถวที่ชิดที่สุดเมื่อเรียงสลับแถว (เลื่อนครึ่งช่อง) โดยยังห่างกันไม่น้อยกว่า gap
  function staggerPitch(ring, px, gap, h) {
    var full = h + gap;
    var ok = function (py) {
      var a = [ring];
      return (
        G.ringsDistance(a, [shift(ring, px / 2, py)]) >= gap - 1e-6 &&
        G.ringsDistance(a, [shift(ring, -px / 2, py)]) >= gap - 1e-6 &&
        2 * py >= full - 1e-6
      );
    };
    var lo = full / 2;
    var hi = full;
    if (ok(lo)) return lo;
    for (var i = 0; i < 30; i++) {
      var mid = (lo + hi) / 2;
      if (ok(mid)) hi = mid;
      else lo = mid;
    }
    return hi;
  }

  // จุดซ้ายสุด/ขวาสุดของวง (เสมอกันเลือกจุดที่ใกล้แนวกลางแนวนอนที่สุด)
  function extremes(ring) {
    var li = 0;
    var ri = 0;
    var e = 1e-6;
    for (var i = 1; i < ring.length; i++) {
      var p = ring[i];
      var l = ring[li];
      var r = ring[ri];
      if (p[0] < l[0] - e || (Math.abs(p[0] - l[0]) <= e && Math.abs(p[1]) < Math.abs(l[1]))) li = i;
      if (p[0] > r[0] + e || (Math.abs(p[0] - r[0]) <= e && Math.abs(p[1]) < Math.abs(r[1]))) ri = i;
    }
    return { left: li, right: ri };
  }

  // แยกวงเป็นขอบบน (ซ้าย → ขวา) กับขอบล่าง (ขวา → ซ้าย)
  function chains(ring) {
    var ex = extremes(ring);
    var n = ring.length;
    var a = [];
    var b = [];
    for (var i = ex.left; ; i = (i + 1) % n) {
      a.push(ring[i]);
      if (i === ex.right) break;
    }
    for (var j = ex.right; ; j = (j + 1) % n) {
      b.push(ring[j]);
      if (j === ex.left) break;
    }
    // chain ที่อยู่สูงกว่า (y น้อยกว่า) คือขอบบน
    var ya = 0;
    var yb = 0;
    a.forEach(function (p) {
      ya += p[1];
    });
    b.forEach(function (p) {
      yb += p[1];
    });
    if (ya / a.length <= yb / b.length) return { top: a, bottom: b };
    return { top: b.slice().reverse(), bottom: a.slice().reverse() };
  }

  // เส้นต่อเนื่องหนึ่งแถว: ขอบบนซ้าย → ขวา แล้ววนกลับตามขอบล่าง
  function rowLoop(ring, centers) {
    if (centers.length === 1) {
      return { closed: true, points: shift(ring, centers[0][0], centers[0][1]) };
    }
    var ch = chains(ring);
    var pts = [];
    centers.forEach(function (c) {
      ch.top.forEach(function (p) {
        pts.push([p[0] + c[0], p[1] + c[1]]);
      });
    });
    for (var i = centers.length - 1; i >= 0; i--) {
      var c = centers[i];
      ch.bottom.forEach(function (p, k) {
        if (k === ch.bottom.length - 1 && i === 0) return; // จุดเริ่ม — ปิดวงเอง
        pts.push([p[0] + c[0], p[1] + c[1]]);
      });
    }
    return { closed: true, points: G.dedupe(pts, 1e-9) };
  }

  function pathLength(path) {
    var len = 0;
    var p = path.points;
    for (var i = 1; i < p.length; i++) len += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
    if (path.closed && p.length > 1) len += Math.hypot(p[0][0] - p[p.length - 1][0], p[0][1] - p[p.length - 1][1]);
    return len;
  }

  // opts: { area: {x,y,w,h}, shape, w, h, radius, ring (shape 'artwork'), gap, stagger, max }
  // คืน { cells: [{ x, y, row }], rows, cols, paths: [{closed, points}], lifts, cutLength, ring, pitch }
  function layout(opts) {
    var gap = Math.max(0, opts.gap || 0);
    var ring = opts.shape === 'artwork' && opts.ring ? centerRing(opts.ring) : shapeRing(opts.shape, opts.w, opts.h, opts.radius);
    var b = G.bounds([ring]);
    var w = b.maxX - b.minX;
    var h = b.maxY - b.minY;
    var A = opts.area;
    var max = opts.max || MAX_PER_SHEET;
    var px = w + gap;
    var py = opts.stagger ? staggerPitch(ring, px, gap, h) : h + gap;
    var cells = [];
    var rows = [];
    var cols = 0;
    for (var r = 0; ; r++) {
      var cy = A.y + h / 2 + r * py;
      if (cy + h / 2 > A.y + A.h + 1e-6) break;
      var off = opts.stagger && r % 2 ? px / 2 : 0;
      var row = [];
      for (var c = 0; ; c++) {
        var cx = A.x + w / 2 + off + c * px;
        if (cx + w / 2 > A.x + A.w + 1e-6) break;
        if (cells.length >= max) break;
        var cell = { x: cx, y: cy, row: r, col: c };
        cells.push(cell);
        row.push(cell);
      }
      if (!row.length) break;
      cols = Math.max(cols, row.length);
      rows.push(row);
      if (cells.length >= max) break;
    }

    var paths = [];
    var isRect = (opts.shape === 'rect' || (opts.shape === 'rounded' && !(opts.radius > 0))) && opts.shape !== 'artwork';
    if (isRect && gap < 1e-6 && !opts.stagger && cells.length) {
      // สี่เหลี่ยมชิดกัน: เส้นตรงยาว — แนวนอน rows+1 เส้น แนวตั้ง cols+1 เส้น (แถวสุดท้ายอาจสั้นกว่า)
      var x0 = A.x;
      rows.forEach(function (rw, i) {
        var top = rw[0].y - h / 2;
        var right = x0 + rw.length * w;
        var prev = i > 0 ? x0 + rows[i - 1].length * w : right;
        paths.push({ closed: false, points: [[x0, top], [Math.max(right, prev), top]] });
      });
      var last = rows[rows.length - 1];
      paths.push({ closed: false, points: [[x0, last[0].y + h / 2], [x0 + last.length * w, last[0].y + h / 2]] });
      for (var k = 0; k <= cols; k++) {
        var x = x0 + k * w;
        var bottom = A.y;
        rows.forEach(function (rw) {
          if (rw.length >= k) bottom = rw[0].y + h / 2;
        });
        paths.push({ closed: false, points: [[x, rows[0][0].y - h / 2], [x, bottom]] });
      }
    } else {
      rows.forEach(function (rw) {
        paths.push(
          rowLoop(
            ring,
            rw.map(function (c) {
              return [c.x, c.y];
            })
          )
        );
      });
    }
    var cutLength = paths.reduce(function (s, p) {
      return s + pathLength(p);
    }, 0);
    return {
      ring: ring,
      w: w,
      h: h,
      pitch: { x: px, y: py },
      cells: cells,
      rows: rows.length,
      cols: cols,
      paths: paths,
      lifts: paths.length,
      cutLength: cutLength,
      capped: cells.length >= max,
    };
  }

  return {
    SHAPES: SHAPES,
    MAX_PER_SHEET: MAX_PER_SHEET,
    shapeRing: shapeRing,
    centerRing: centerRing,
    chains: chains,
    rowLoop: rowLoop,
    staggerPitch: staggerPitch,
    layout: layout,
    pathLength: pathLength,
  };
});
