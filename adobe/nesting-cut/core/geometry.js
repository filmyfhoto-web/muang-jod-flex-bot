// เรขาคณิตพื้นฐานที่ทุกส่วนใช้ร่วมกัน (Illustrator panel / Photoshop panel / เทสต์บน Node)
//
// เขียนแบบ ES2017 ธรรมดา ไม่มี import/export เพื่อให้โหลดได้ทั้ง
//   - <script> ใน CEP (Chromium 61 ของ Illustrator 2019 ขึ้นไป) และ UXP → window.NestingCut.geometry
//   - require() บน Node สำหรับเทสต์
// ห้ามใช้ ?. / ?? / Array.prototype.flat — Chromium ของ CEP รุ่นเก่ายังไม่รู้จัก
//
// หน่วยในนี้ไม่ผูกกับอะไร ฝั่งเอนจินจัดวางใช้ mm แกน y ชี้ลง (เหมือนกระดาษที่ไหลออกจากเครื่อง)
// จุด = [x, y]   วง (ring) = อาร์เรย์ของจุด ไม่ต้องซ้ำจุดแรกไว้ท้าย
(function (root, factory) {
  if (typeof module === 'object' && module.exports && typeof window === 'undefined') {
    module.exports = factory();
  } else {
    var ns = (root.NestingCut = root.NestingCut || {});
    ns.geometry = factory();
  }
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  var PT_PER_MM = 72 / 25.4;
  var DEG = Math.PI / 180;

  function mmToPt(mm) {
    return mm * PT_PER_MM;
  }
  function ptToMm(pt) {
    return pt / PT_PER_MM;
  }

  function bounds(rings) {
    var minX = Infinity;
    var minY = Infinity;
    var maxX = -Infinity;
    var maxY = -Infinity;
    for (var r = 0; r < rings.length; r++) {
      var ring = rings[r];
      for (var i = 0; i < ring.length; i++) {
        var p = ring[i];
        if (p[0] < minX) minX = p[0];
        if (p[0] > maxX) maxX = p[0];
        if (p[1] < minY) minY = p[1];
        if (p[1] > maxY) maxY = p[1];
      }
    }
    return { minX: minX, minY: minY, maxX: maxX, maxY: maxY };
  }

  // พื้นที่แบบมีเครื่องหมาย (shoelace) — บวก/ลบบอกทิศการวน
  function signedArea(ring) {
    var a = 0;
    for (var i = 0, n = ring.length; i < n; i++) {
      var p = ring[i];
      var q = ring[(i + 1) % n];
      a += p[0] * q[1] - q[0] * p[1];
    }
    return a / 2;
  }

  // มุมฉากใช้ค่าตรง ๆ — cos/sin ของ 90° ไม่ได้ 0 เป๊ะ ทำให้ชิ้นสี่เหลี่ยมเบี้ยวเศษ ๆ
  function cosSin(deg) {
    var d = ((deg % 360) + 360) % 360;
    if (d === 0) return [1, 0];
    if (d === 90) return [0, 1];
    if (d === 180) return [-1, 0];
    if (d === 270) return [0, -1];
    return [Math.cos(d * DEG), Math.sin(d * DEG)];
  }

  function rotatePoint(p, deg) {
    if (!deg) return [p[0], p[1]];
    var cs = cosSin(deg);
    return [cs[0] * p[0] - cs[1] * p[1], cs[1] * p[0] + cs[0] * p[1]];
  }

  function rotateRings(rings, deg) {
    return rings.map(function (ring) {
      return ring.map(function (p) {
        return rotatePoint(p, deg);
      });
    });
  }

  // t = { angle (องศา), tx, ty } → p' = R(angle)·p + (tx, ty)
  function transformPoint(p, t) {
    var r = rotatePoint(p, t.angle || 0);
    return [r[0] + t.tx, r[1] + t.ty];
  }

  function transformRings(rings, t) {
    return rings.map(function (ring) {
      return ring.map(function (p) {
        return transformPoint(p, t);
      });
    });
  }

  // even-odd
  function pointInRing(pt, ring) {
    var x = pt[0];
    var y = pt[1];
    var inside = false;
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      var xi = ring[i][0];
      var yi = ring[i][1];
      var xj = ring[j][0];
      var yj = ring[j][1];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  function pointSegDist2(px, py, ax, ay, bx, by) {
    var dx = bx - ax;
    var dy = by - ay;
    var len2 = dx * dx + dy * dy;
    var t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    var cx = ax + t * dx - px;
    var cy = ay + t * dy - py;
    return cx * cx + cy * cy;
  }

  // ระยะ² จากจุดถึงสี่เหลี่ยมแกนตรง [x0,x1]×[y0,y1] (0 ถ้าอยู่ข้างใน)
  function pointBoxDist2(px, py, x0, y0, x1, y1) {
    var dx = px < x0 ? x0 - px : px > x1 ? px - x1 : 0;
    var dy = py < y0 ? y0 - py : py > y1 ? py - y1 : 0;
    return dx * dx + dy * dy;
  }

  // ระยะ² จากเส้นตรง pq ถึงสี่เหลี่ยมแกนตรง — ระยะใกล้สุดของรูปนูนสองรูปเกิดที่มุมของรูปใดรูปหนึ่งเสมอ
  function segBoxDist2(px, py, qx, qy, x0, y0, x1, y1) {
    if (segmentHitsBox(px, py, qx, qy, x0, y0, x1, y1)) return 0;
    return Math.min(
      pointBoxDist2(px, py, x0, y0, x1, y1),
      pointBoxDist2(qx, qy, x0, y0, x1, y1),
      pointSegDist2(x0, y0, px, py, qx, qy),
      pointSegDist2(x1, y0, px, py, qx, qy),
      pointSegDist2(x1, y1, px, py, qx, qy),
      pointSegDist2(x0, y1, px, py, qx, qy)
    );
  }

  // Liang–Barsky: เส้นตรงผ่านสี่เหลี่ยมไหม
  function segmentHitsBox(px, py, qx, qy, x0, y0, x1, y1) {
    var t0 = 0;
    var t1 = 1;
    var dx = qx - px;
    var dy = qy - py;
    var ps = [-dx, dx, -dy, dy];
    var qs = [px - x0, x1 - px, py - y0, y1 - py];
    for (var i = 0; i < 4; i++) {
      if (ps[i] === 0) {
        if (qs[i] < 0) return false;
      } else {
        var t = qs[i] / ps[i];
        if (ps[i] < 0) {
          if (t > t1) return false;
          if (t > t0) t0 = t;
        } else {
          if (t < t0) return false;
          if (t < t1) t1 = t;
        }
      }
    }
    return true;
  }

  function segSegDist2(a, b, c, d) {
    if (segmentsIntersect(a, b, c, d)) return 0;
    return Math.min(
      pointSegDist2(a[0], a[1], c[0], c[1], d[0], d[1]),
      pointSegDist2(b[0], b[1], c[0], c[1], d[0], d[1]),
      pointSegDist2(c[0], c[1], a[0], a[1], b[0], b[1]),
      pointSegDist2(d[0], d[1], a[0], a[1], b[0], b[1])
    );
  }

  function orient(a, b, c) {
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  }

  function segmentsIntersect(a, b, c, d) {
    var d1 = orient(c, d, a);
    var d2 = orient(c, d, b);
    var d3 = orient(a, b, c);
    var d4 = orient(a, b, d);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
  }

  // จุดอยู่ในเนื้อของรูปไหม (even-odd ข้ามทุกวง — จุดในรูไม่นับ)
  function pointInShape(pt, rings) {
    var n = 0;
    for (var i = 0; i < rings.length; i++) if (pointInRing(pt, rings[i])) n++;
    return n % 2 === 1;
  }

  // ระยะใกล้สุดระหว่างสองรูป (ชุดของวง) — 0 ถ้าซ้อน/ทับกัน
  // ใช้ในเทสต์และตรวจผลจัดวาง ไม่ได้อยู่ในลูปร้อนของเอนจิน
  function ringsDistance(ringsA, ringsB) {
    for (var i = 0; i < ringsA.length; i++) {
      if (ringsA[i].length && pointInShape(ringsA[i][0], ringsB)) return 0;
    }
    for (var j = 0; j < ringsB.length; j++) {
      if (ringsB[j].length && pointInShape(ringsB[j][0], ringsA)) return 0;
    }
    var best = Infinity;
    for (var a = 0; a < ringsA.length; a++) {
      var ra = ringsA[a];
      for (var b = 0; b < ringsB.length; b++) {
        var rb = ringsB[b];
        for (var p = 0; p < ra.length; p++) {
          var p0 = ra[p];
          var p1 = ra[(p + 1) % ra.length];
          for (var q = 0; q < rb.length; q++) {
            var d = segSegDist2(p0, p1, rb[q], rb[(q + 1) % rb.length]);
            if (d < best) {
              best = d;
              if (best === 0) return 0;
            }
          }
        }
      }
    }
    return Math.sqrt(best);
  }

  // แปลงเส้นโค้งเบซิเยร์เป็นเส้นตรงหลายท่อน
  // points: [{ a:[x,y], l:[x,y], r:[x,y] }] แบบ Illustrator (l = มือจับขาเข้า, r = มือจับขาออก)
  // tol: ความคลาดเคลื่อนสูงสุดจากโค้งจริง (หน่วยเดียวกับพิกัด)
  function flattenBezier(points, closed, tol) {
    var out = [];
    var n = points.length;
    if (!n) return out;
    tol = tol > 0 ? tol : 0.1;
    out.push(points[0].a.slice());
    var segs = closed ? n : n - 1;
    for (var i = 0; i < segs; i++) {
      var s = points[i];
      var e = points[(i + 1) % n];
      var p0 = s.a;
      var p1 = s.r || s.a;
      var p2 = e.l || e.a;
      var p3 = e.a;
      if (samePt(p0, p1) && samePt(p2, p3)) {
        out.push(p3.slice());
      } else {
        subdivide(p0, p1, p2, p3, tol * tol, 0, out);
      }
    }
    if (closed && out.length > 1 && samePt(out[0], out[out.length - 1])) out.pop();
    return out;
  }

  function samePt(a, b) {
    return a[0] === b[0] && a[1] === b[1];
  }

  function subdivide(p0, p1, p2, p3, tol2, depth, out) {
    var flat =
      pointSegDist2(p1[0], p1[1], p0[0], p0[1], p3[0], p3[1]) <= tol2 &&
      pointSegDist2(p2[0], p2[1], p0[0], p0[1], p3[0], p3[1]) <= tol2;
    if (flat || depth >= 12) {
      out.push(p3.slice());
      return;
    }
    var p01 = mid(p0, p1);
    var p12 = mid(p1, p2);
    var p23 = mid(p2, p3);
    var p012 = mid(p01, p12);
    var p123 = mid(p12, p23);
    var m = mid(p012, p123);
    subdivide(p0, p01, p012, m, tol2, depth + 1, out);
    subdivide(m, p123, p23, p3, tol2, depth + 1, out);
  }

  function mid(a, b) {
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  }

  // ตัดจุดซ้ำติดกัน (และจุดท้ายที่ซ้ำจุดแรก)
  function dedupe(ring, eps) {
    eps = eps || 1e-9;
    var out = [];
    for (var i = 0; i < ring.length; i++) {
      var p = ring[i];
      var last = out[out.length - 1];
      if (!last || Math.abs(last[0] - p[0]) > eps || Math.abs(last[1] - p[1]) > eps) out.push(p);
    }
    while (out.length > 1) {
      var f = out[0];
      var l = out[out.length - 1];
      if (Math.abs(f[0] - l[0]) > eps || Math.abs(f[1] - l[1]) > eps) break;
      out.pop();
    }
    return out;
  }

  // Ramer–Douglas–Peucker สำหรับวงปิด: ตัดที่จุดแรกกับจุดที่ไกลที่สุดจากมัน แล้วลดทีละครึ่ง
  function simplifyRing(ring, tol) {
    if (ring.length <= 4 || !(tol > 0)) return ring.slice();
    var far = 0;
    var best = -1;
    for (var i = 1; i < ring.length; i++) {
      var dx = ring[i][0] - ring[0][0];
      var dy = ring[i][1] - ring[0][1];
      var d = dx * dx + dy * dy;
      if (d > best) {
        best = d;
        far = i;
      }
    }
    var a = rdp(ring.slice(0, far + 1), tol * tol);
    var b = rdp(ring.slice(far).concat([ring[0]]), tol * tol);
    var out = a.slice(0, -1).concat(b.slice(0, -1));
    return out.length >= 3 ? out : ring.slice();
  }

  function rdp(pts, tol2) {
    var n = pts.length;
    if (n <= 2) return pts.slice();
    var keep = new Uint8Array(n);
    keep[0] = 1;
    keep[n - 1] = 1;
    var stack = [[0, n - 1]];
    while (stack.length) {
      var seg = stack.pop();
      var s = seg[0];
      var e = seg[1];
      var maxD = -1;
      var idx = -1;
      for (var i = s + 1; i < e; i++) {
        var d = pointSegDist2(pts[i][0], pts[i][1], pts[s][0], pts[s][1], pts[e][0], pts[e][1]);
        if (d > maxD) {
          maxD = d;
          idx = i;
        }
      }
      if (maxD > tol2) {
        keep[idx] = 1;
        stack.push([s, idx], [idx, e]);
      }
    }
    var out = [];
    for (var k = 0; k < n; k++) if (keep[k]) out.push(pts[k]);
    return out;
  }

  // วงเส้นตรง → จุดเบซิเยร์โค้งนุ่ม (Catmull-Rom ปรับความยาวมือจับตามช่วง กันโค้งพองเกิน)
  // มุมที่หักแรงกว่า cornerDeg ปล่อยเป็นมุมแหลม (มือจับ = จุดยึด)
  function smoothRing(ring, cornerDeg) {
    var n = ring.length;
    var limit = (cornerDeg == null ? 60 : cornerDeg) * DEG;
    var out = [];
    for (var i = 0; i < n; i++) {
      var prev = ring[(i - 1 + n) % n];
      var p = ring[i];
      var next = ring[(i + 1) % n];
      var ax = p[0] - prev[0];
      var ay = p[1] - prev[1];
      var bx = next[0] - p[0];
      var by = next[1] - p[1];
      var la = Math.sqrt(ax * ax + ay * ay);
      var lb = Math.sqrt(bx * bx + by * by);
      var turn = la && lb ? Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by) / (la * lb)))) : Math.PI;
      if (turn > limit) {
        out.push({ a: p.slice(), l: p.slice(), r: p.slice() });
        continue;
      }
      var tx = next[0] - prev[0];
      var ty = next[1] - prev[1];
      var tl = Math.sqrt(tx * tx + ty * ty) || 1;
      tx /= tl;
      ty /= tl;
      out.push({
        a: p.slice(),
        l: [p[0] - (tx * la) / 3, p[1] - (ty * la) / 3],
        r: [p[0] + (tx * lb) / 3, p[1] + (ty * lb) / 3],
      });
    }
    return out;
  }

  // วงเส้นตรง → จุดเบซิเยร์แบบมุมทุกจุด
  function ringToBezier(ring) {
    return ring.map(function (p) {
      return { a: p.slice(), l: p.slice(), r: p.slice() };
    });
  }

  // สี่เหลี่ยมมุมมนเป็นจุดเบซิเยร์ (y ขึ้นหรือลงก็ได้ — วนตามเข็มในระบบ y ลง)
  function roundedRect(x, y, w, h, r) {
    r = Math.max(0, Math.min(r || 0, w / 2, h / 2));
    if (!r) {
      return ringToBezier([
        [x, y],
        [x + w, y],
        [x + w, y + h],
        [x, y + h],
      ]);
    }
    var k = 0.5522847498 * r;
    var x1 = x + w;
    var y1 = y + h;
    return [
      { a: [x + r, y], l: [x + r - k, y], r: [x + r, y] },
      { a: [x1 - r, y], l: [x1 - r, y], r: [x1 - r + k, y] },
      { a: [x1, y + r], l: [x1, y + r - k], r: [x1, y + r] },
      { a: [x1, y1 - r], l: [x1, y1 - r], r: [x1, y1 - r + k] },
      { a: [x1 - r, y1], l: [x1 - r + k, y1], r: [x1 - r, y1] },
      { a: [x + r, y1], l: [x + r, y1], r: [x + r - k, y1] },
      { a: [x, y1 - r], l: [x, y1 - r + k], r: [x, y1 - r] },
      { a: [x, y + r], l: [x, y + r], r: [x, y + r - k] },
    ];
  }

  // แปลงจุดเบซิเยร์ทุกตัวด้วยฟังก์ชัน f([x,y]) → [x,y]
  function mapBezier(points, f) {
    return points.map(function (p) {
      return { a: f(p.a), l: f(p.l || p.a), r: f(p.r || p.a) };
    });
  }

  return {
    PT_PER_MM: PT_PER_MM,
    mmToPt: mmToPt,
    ptToMm: ptToMm,
    bounds: bounds,
    signedArea: signedArea,
    rotatePoint: rotatePoint,
    rotateRings: rotateRings,
    transformPoint: transformPoint,
    transformRings: transformRings,
    pointInRing: pointInRing,
    pointInShape: pointInShape,
    pointSegDist2: pointSegDist2,
    segBoxDist2: segBoxDist2,
    ringsDistance: ringsDistance,
    flattenBezier: flattenBezier,
    dedupe: dedupe,
    simplifyRing: simplifyRing,
    smoothRing: smoothRing,
    ringToBezier: ringToBezier,
    roundedRect: roundedRect,
    mapBezier: mapBezier,
  };
});
