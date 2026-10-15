// ไฟล์สั่งเครื่องตัด: PLT (HP-GL), DXF (R12), SVG
//
// รับเส้นตัดเป็นพิกัด mm ของแผ่น ((0,0) = มุมซ้ายบน, y ลง) แล้ว
//   1. เรียงลำดับการตัด: เส้นที่อยู่ข้างในตัดก่อนเส้นที่ล้อมมัน (ชิ้นไม่หลุดขยับก่อนตัดรูเสร็จ)
//      ที่เหลือเลือกเส้นที่ใกล้หัวมีดที่สุดก่อน และเริ่มตัดจากจุดที่ใกล้ที่สุดของเส้นนั้น
//   2. เขียนออกตามรูปแบบไฟล์
(function (root, factory) {
  if (typeof module === 'object' && module.exports && typeof window === 'undefined') {
    module.exports = factory(require('./geometry.js'));
  } else {
    var ns = (root.NestingCut = root.NestingCut || {});
    ns.cutfile = factory(ns.geometry);
  }
})(typeof window !== 'undefined' ? window : this, function (G) {
  'use strict';

  function boxOf(pts) {
    var b = G.bounds([pts]);
    return b;
  }

  function boxInside(a, b) {
    return a.minX >= b.minX && a.maxX <= b.maxX && a.minY >= b.minY && a.maxY <= b.maxY;
  }

  function boxDist2(x, y, b) {
    var dx = x < b.minX ? b.minX - x : x > b.maxX ? x - b.maxX : 0;
    var dy = y < b.minY ? b.minY - y : y > b.maxY ? y - b.maxY : 0;
    return dx * dx + dy * dy;
  }

  // paths: [{ points: [[x,y],...], closed: true|false }]
  // คืนอาร์เรย์ใหม่เรียงตามลำดับตัด (วงปิดถูกหมุนให้เริ่มที่จุดใกล้หัวมีด)
  function orderPaths(paths, start) {
    var items = paths
      .filter(function (p) {
        return p.points && p.points.length >= 2;
      })
      .map(function (p, i) {
        return { i: i, path: p, box: boxOf(p.points), children: 0, parents: [] };
      });
    // เส้นไหนอยู่ในวงปิดไหน
    for (var a = 0; a < items.length; a++) {
      for (var b = 0; b < items.length; b++) {
        if (a === b || !items[b].path.closed) continue;
        var A = items[a];
        var B = items[b];
        if (!boxInside(A.box, B.box)) continue;
        if (A.box.minX === B.box.minX && A.box.maxX === B.box.maxX && A.box.minY === B.box.minY && A.box.maxY === B.box.maxY) {
          if (a > b) continue; // วงซ้อนทับเท่ากันพอดี ให้ตัวแรกตัดก่อน
        }
        if (G.pointInRing(A.path.points[0], B.path.points)) {
          A.parents.push(b);
          B.children++;
        }
      }
    }
    var cur = start || [0, 0];
    var out = [];
    var done = new Uint8Array(items.length);
    for (var n = 0; n < items.length; n++) {
      var best = -1;
      var bestD = Infinity;
      var bestV = 0;
      var cands = [];
      for (var k = 0; k < items.length; k++) {
        if (!done[k] && items[k].children === 0) cands.push({ k: k, lb: boxDist2(cur[0], cur[1], items[k].box) });
      }
      cands.sort(function (x, y) {
        return x.lb - y.lb;
      });
      for (var c = 0; c < cands.length; c++) {
        if (cands[c].lb >= bestD) break;
        var it = items[cands[c].k];
        var pts = it.path.points;
        var limit = it.path.closed ? pts.length : 1;
        for (var v = 0; v < limit; v++) {
          var dx = pts[v][0] - cur[0];
          var dy = pts[v][1] - cur[1];
          var d = dx * dx + dy * dy;
          if (d < bestD) {
            bestD = d;
            best = cands[c].k;
            bestV = v;
          }
        }
        if (!it.path.closed) {
          // เส้นเปิดเริ่มได้ทั้งสองปลาย
          var e = pts[pts.length - 1];
          var d2 = (e[0] - cur[0]) * (e[0] - cur[0]) + (e[1] - cur[1]) * (e[1] - cur[1]);
          if (d2 < bestD) {
            bestD = d2;
            best = cands[c].k;
            bestV = -1;
          }
        }
      }
      if (best < 0) {
        // วงวนอ้างกันเอง (ไม่น่าเกิด) — ปล่อยตัวที่เหลือตามลำดับเดิม
        for (var r = 0; r < items.length; r++) if (!done[r]) items[r].children = 0;
        n--;
        continue;
      }
      var chosen = items[best];
      done[best] = 1;
      chosen.parents.forEach(function (p) {
        items[p].children--;
      });
      var P = chosen.path.points;
      var rotated;
      if (chosen.path.closed) rotated = P.slice(bestV).concat(P.slice(0, bestV));
      else rotated = bestV === -1 ? P.slice().reverse() : P.slice();
      var copy = {};
      for (var key in chosen.path) copy[key] = chosen.path[key];
      copy.points = rotated;
      out.push(copy);
      var last = chosen.path.closed ? rotated[0] : rotated[rotated.length - 1];
      cur = last;
    }
    return out;
  }

  function fmt(n) {
    var s = (Math.round(n * 1000) / 1000).toString();
    return s === '-0' ? '0' : s;
  }

  // ---------- SVG (mm) ----------
  function toSVG(paths, size, opts) {
    opts = opts || {};
    var W = size.width;
    var L = size.length;
    var out = [];
    out.push('<?xml version="1.0" encoding="UTF-8"?>');
    out.push(
      '<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="' +
        fmt(W) +
        'mm" height="' +
        fmt(L) +
        'mm" viewBox="0 0 ' +
        fmt(W) +
        ' ' +
        fmt(L) +
        '">'
    );
    if (opts.title) out.push('<title>' + escapeXml(opts.title) + '</title>');
    if (opts.marks && opts.marks.length) {
      out.push('<g id="RegMarks" fill="#000000" stroke="none">');
      opts.marks.forEach(function (g) {
        (g.parts || [g]).forEach(function (p) {
          if (p.kind === 'circle') out.push('<circle cx="' + fmt(p.cx) + '" cy="' + fmt(p.cy) + '" r="' + fmt(p.r) + '"/>');
          else out.push('<rect x="' + fmt(p.x) + '" y="' + fmt(p.y) + '" width="' + fmt(p.w) + '" height="' + fmt(p.h) + '"/>');
        });
      });
      out.push('</g>');
    }
    out.push('<g id="CutContour" fill="none" stroke="#ff00ff" stroke-width="0.25">');
    paths.forEach(function (p) {
      if (!p.points.length) return;
      var d = 'M' + fmt(p.points[0][0]) + ' ' + fmt(p.points[0][1]);
      for (var i = 1; i < p.points.length; i++) d += 'L' + fmt(p.points[i][0]) + ' ' + fmt(p.points[i][1]);
      if (p.closed) d += 'Z';
      out.push('<path d="' + d + '"/>');
    });
    out.push('</g>');
    out.push('</svg>');
    return out.join('\n') + '\n';
  }

  function escapeXml(s) {
    return String(s).replace(/[<>&"]/g, function (c) {
      return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c];
    });
  }

  // ---------- DXF R12 (mm, y ขึ้น) ----------
  function toDXF(paths, size) {
    var L = size.length;
    var o = [];
    function g(code, value) {
      o.push(String(code), String(value));
    }
    g(0, 'SECTION');
    g(2, 'HEADER');
    g(9, '$ACADVER');
    g(1, 'AC1009');
    g(9, '$EXTMIN');
    g(10, '0.0');
    g(20, '0.0');
    g(9, '$EXTMAX');
    g(10, fmt(size.width));
    g(20, fmt(L));
    g(0, 'ENDSEC');
    g(0, 'SECTION');
    g(2, 'ENTITIES');
    paths.forEach(function (p) {
      if (p.points.length < 2) return;
      g(0, 'POLYLINE');
      g(8, 'CUT');
      g(66, 1);
      g(10, '0.0');
      g(20, '0.0');
      g(30, '0.0');
      g(70, p.closed ? 1 : 0);
      p.points.forEach(function (pt) {
        g(0, 'VERTEX');
        g(8, 'CUT');
        g(10, fmt(pt[0]));
        g(20, fmt(L - pt[1]));
        g(30, '0.0');
      });
      g(0, 'SEQEND');
      g(8, 'CUT');
    });
    g(0, 'ENDSEC');
    g(0, 'EOF');
    return o.join('\r\n') + '\r\n';
  }

  // ---------- PLT / HP-GL ----------
  // feed 'x' (ค่าเริ่ม): แกน X ตามทางที่ม้วนไหล — หมุนงาน 90° (ไม่กลับด้าน) เหมาะกับเครื่องตัดแบบม้วนส่วนใหญ่
  // feed 'y': วางตามแผ่นตรง ๆ (x ข้ามหน้ากว้าง, y ขึ้น)
  // overcut: ตัดเลยจุดเริ่มไปอีกกี่ มม. ให้เส้นปิดสนิท
  function mapPlt(pt, size, feed) {
    if (feed === 'y') return [pt[0], size.length - pt[1]];
    return [pt[1], pt[0]];
  }

  function overcutTail(points, mm) {
    var tail = [];
    var left = mm;
    for (var i = 0; i < points.length && left > 0; i++) {
      var a = points[i];
      var b = points[(i + 1) % points.length];
      var len = Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1]));
      if (len <= 0) continue;
      if (len >= left) {
        tail.push([a[0] + ((b[0] - a[0]) * left) / len, a[1] + ((b[1] - a[1]) * left) / len]);
        left = 0;
      } else {
        tail.push(b);
        left -= len;
      }
    }
    return tail;
  }

  function toHPGL(paths, size, opts) {
    opts = opts || {};
    var upm = opts.unitsPerMm || 40;
    var feed = opts.feed === 'y' ? 'y' : 'x';
    var overcut = opts.overcut > 0 ? opts.overcut : 0;
    var cmds = ['IN', 'PA', 'SP1'];
    function u(pt) {
      var m = mapPlt(pt, size, feed);
      return Math.round(m[0] * upm) + ',' + Math.round(m[1] * upm);
    }
    paths.forEach(function (p) {
      var pts = p.points;
      if (pts.length < 2) return;
      var seq = pts.slice(1);
      if (p.closed) {
        seq.push(pts[0]);
        if (overcut) seq = seq.concat(overcutTail(pts, overcut));
      }
      cmds.push('PU' + u(pts[0]));
      for (var i = 0; i < seq.length; i += 64) {
        cmds.push('PD' + seq.slice(i, i + 64).map(u).join(','));
      }
    });
    cmds.push('PU0,0', 'SP0');
    return cmds.join(';\n') + ';\n';
  }

  return {
    orderPaths: orderPaths,
    toSVG: toSVG,
    toDXF: toDXF,
    toHPGL: toHPGL,
    mapPlt: mapPlt,
  };
});
