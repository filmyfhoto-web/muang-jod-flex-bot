// สร้างเส้นตัด (cut contour) จากความโปร่งใสของภาพ
//
// ใช้ได้กับทุกอย่างที่ "มองเห็น" — ภาพ PNG พื้นใส, เวกเตอร์, ตัวหนังสือ, เอฟเฟกต์
// ฝั่ง Illustrator ส่งออกชิ้นงานเป็น PNG ชั่วคราวแล้วส่งพิกเซลมาที่นี่
//
// ขั้นตอน
//   1. ทำสนามค่า F ต่อพิกเซล: F > 0 = เนื้องาน
//      - ไม่เว้นขอบ: F = (alpha − threshold)  → เส้นอยู่ตรงขอบ anti-alias พอดี (ละเอียดกว่าพิกเซล)
//      - เว้นขอบ r พิกเซล: F = r + 0.5 − (ระยะถึงพิกเซลเนื้องานที่ใกล้สุด)  → ขอบกลมมนเท่ากันรอบตัว
//   2. อุดรูข้างใน (สติ๊กเกอร์ไดคัทตัดแค่ขอบนอก) และทิ้งจุดเล็ก ๆ ที่เป็นฝุ่น
//   3. marching squares หาเส้นที่ F = 0 → วงปิดทุกวง (ขอบภาพเผื่อที่ว่างไว้แล้ว)
//   4. ลดจุดด้วย RDP
// ผลลัพธ์เป็นพิกัดพิกเซลของภาพเดิม (0,0 = มุมซ้ายบน, y ลง) ผู้เรียกแปลงเป็นหน่วยเอกสารเอง
(function (root, factory) {
  if (typeof module === 'object' && module.exports && typeof window === 'undefined') {
    module.exports = factory(require('./geometry.js'));
  } else {
    var ns = (root.NestingCut = root.NestingCut || {});
    ns.contour = factory(ns.geometry);
  }
})(typeof window !== 'undefined' ? window : this, function (G) {
  'use strict';

  var INF = 1e20;

  function alphaOf(img) {
    if (img.alpha) return img.alpha;
    var n = img.width * img.height;
    var a = new Uint8Array(n);
    for (var i = 0; i < n; i++) a[i] = img.data[i * 4 + 3];
    return a;
  }

  // ระยะยุคลิดกำลังสองถึงพิกเซลที่ seed[k] = 1 (Felzenszwalb & Huttenlocher, O(n))
  function distanceSquared(seed, W, H) {
    var out = new Float32Array(W * H);
    var n = Math.max(W, H);
    var f = new Float64Array(n);
    var d = new Float64Array(n);
    var v = new Int32Array(n);
    var z = new Float64Array(n + 1);
    for (var x = 0; x < W; x++) {
      for (var y = 0; y < H; y++) f[y] = seed[y * W + x] ? 0 : INF;
      edt1d(f, H, d, v, z);
      for (var y2 = 0; y2 < H; y2++) out[y2 * W + x] = d[y2];
    }
    for (var yy = 0; yy < H; yy++) {
      var off = yy * W;
      for (var xx = 0; xx < W; xx++) f[xx] = out[off + xx];
      edt1d(f, W, d, v, z);
      for (var x2 = 0; x2 < W; x2++) out[off + x2] = d[x2];
    }
    return out;
  }

  function edt1d(f, n, d, v, z) {
    var k = 0;
    v[0] = 0;
    z[0] = -INF;
    z[1] = INF;
    for (var q = 1; q < n; q++) {
      var s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) {
        k--;
        s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      }
      k++;
      v[k] = q;
      z[k] = s;
      z[k + 1] = INF;
    }
    k = 0;
    for (var p = 0; p < n; p++) {
      while (z[k + 1] < p) k++;
      d[p] = (p - v[k]) * (p - v[k]) + f[v[k]];
    }
  }

  // พิกเซลว่างที่เดินจากขอบภาพมาไม่ถึง (4 ทิศ) = รูข้างในชิ้นงาน → ถมให้เป็นเนื้อ
  function fillHoles(inside, W, H) {
    var reached = new Uint8Array(W * H);
    var queue = new Int32Array(W * H);
    var head = 0;
    var tail = 0;
    function push(k) {
      if (!inside[k] && !reached[k]) {
        reached[k] = 1;
        queue[tail++] = k;
      }
    }
    for (var x = 0; x < W; x++) {
      push(x);
      push((H - 1) * W + x);
    }
    for (var y = 0; y < H; y++) {
      push(y * W);
      push(y * W + W - 1);
    }
    while (head < tail) {
      var k = queue[head++];
      var cx = k % W;
      if (cx > 0) push(k - 1);
      if (cx < W - 1) push(k + 1);
      if (k >= W) push(k - W);
      if (k < W * (H - 1)) push(k + W);
    }
    var filled = 0;
    for (var i = 0; i < W * H; i++) {
      if (!inside[i] && !reached[i]) {
        inside[i] = 1;
        filled++;
      }
    }
    return filled;
  }

  // ลบกลุ่มเนื้องาน (8 ทิศ) ที่เล็กกว่า minArea พิกเซล
  function removeSpecks(inside, W, H, minArea) {
    if (!(minArea > 0)) return 0;
    var seen = new Uint8Array(W * H);
    var queue = new Int32Array(W * H);
    var removed = 0;
    for (var s = 0; s < W * H; s++) {
      if (!inside[s] || seen[s]) continue;
      var head = 0;
      var tail = 0;
      queue[tail++] = s;
      seen[s] = 1;
      while (head < tail) {
        var k = queue[head++];
        var cx = k % W;
        var cy = (k - cx) / W;
        for (var dy = -1; dy <= 1; dy++) {
          var ny = cy + dy;
          if (ny < 0 || ny >= H) continue;
          for (var dx = -1; dx <= 1; dx++) {
            var nx = cx + dx;
            if (nx < 0 || nx >= W) continue;
            var nk = ny * W + nx;
            if (inside[nk] && !seen[nk]) {
              seen[nk] = 1;
              queue[tail++] = nk;
            }
          }
        }
      }
      if (tail < minArea) {
        for (var q = 0; q < tail; q++) inside[queue[q]] = 0;
        removed++;
      }
    }
    return removed;
  }

  // marching squares บนจุดกลางพิกเซล คืนวงปิดที่มีทิศการวนเดียวกันทุกวง
  // เดินรอบช่องตามเข็ม (บน → ขวา → ล่าง → ซ้าย) จุดตัดที่ "ออกจากเนื้อ" เชื่อมไป "เข้าเนื้อ"
  // ขอบเดียวกันเป็นจุดออกในช่องหนึ่งและจุดเข้าในช่องข้าง ๆ เสมอ เลยต่อกันเป็นวงได้ทันที
  function marchingSquares(F, W, H) {
    var next = new Map();
    function isIn(v) {
      return v > 0;
    }
    for (var j = 0; j < H - 1; j++) {
      for (var i = 0; i < W - 1; i++) {
        var k = j * W + i;
        var v0 = F[k];
        var v1 = F[k + 1];
        var v2 = F[k + W + 1];
        var v3 = F[k + W];
        var b0 = isIn(v0);
        var b1 = isIn(v1);
        var b2 = isIn(v2);
        var b3 = isIn(v3);
        if (b0 === b1 && b1 === b2 && b2 === b3) continue;
        var walk = [
          [2 * k, b0, b1],
          [2 * (k + 1) + 1, b1, b2],
          [2 * (k + W), b2, b3],
          [2 * k + 1, b3, b0],
        ];
        var cross = [];
        for (var e = 0; e < 4; e++) {
          if (walk[e][1] !== walk[e][2]) cross.push({ id: walk[e][0], out: walk[e][1] });
        }
        if (cross.length === 2) {
          if (cross[0].out) next.set(cross[0].id, cross[1].id);
          else next.set(cross[1].id, cross[0].id);
        } else {
          var centerIn = (v0 + v1 + v2 + v3) / 4 > 0;
          for (var c = 0; c < 4; c++) {
            if (!cross[c].out) continue;
            var partner = centerIn ? (c + 1) % 4 : (c + 3) % 4;
            next.set(cross[c].id, cross[partner].id);
          }
        }
      }
    }

    function point(id) {
      var k = Math.floor(id / 2);
      var i = k % W;
      var j = (k - i) / W;
      var a = F[k];
      var b;
      var t;
      if (id % 2 === 0) {
        b = F[k + 1];
        t = a / (a - b);
        return [i + t, j];
      }
      b = F[k + W];
      t = a / (a - b);
      return [i, j + t];
    }

    var loops = [];
    var visited = new Set();
    next.forEach(function (_to, from) {
      if (visited.has(from)) return;
      var loop = [];
      var cur = from;
      while (cur !== undefined && !visited.has(cur)) {
        visited.add(cur);
        loop.push(point(cur));
        cur = next.get(cur);
      }
      if (loop.length >= 3) loops.push(loop);
    });
    return loops;
  }

  var DEFAULTS = {
    threshold: 128, // ค่า alpha (0–255) ที่นับว่าเป็นเนื้องาน
    offsetPx: 0, // ระยะเส้นตัดห่างจากขอบงาน (พิกเซล)
    minAreaPx: 16, // กลุ่มเนื้องานเล็กกว่านี้ถือเป็นฝุ่น
    simplifyPx: 0.3, // ความคลาดเคลื่อนตอนลดจุด (พิกเซล)
    fillHoles: true,
  };

  // img = { width, height, data: RGBA } หรือ { width, height, alpha }
  // คืน [{ points: [[x,y],...], area }] เรียงจากใหญ่ไปเล็ก (พิกัดพิกเซลของภาพเดิม)
  function traceAlpha(img, opts) {
    var o = {};
    for (var k in DEFAULTS) o[k] = DEFAULTS[k];
    for (var j in opts || {}) if (opts[j] != null) o[j] = opts[j];

    var w = img.width;
    var h = img.height;
    var alpha = alphaOf(img);
    var offset = Math.max(0, o.offsetPx || 0);
    var P = Math.ceil(offset) + 2;
    var W = w + 2 * P;
    var H = h + 2 * P;
    var F = new Float32Array(W * H);
    var thr = Math.max(1, Math.min(254, o.threshold));

    // เนื้องานจริง (ก่อนเว้นขอบ) — ทิ้งฝุ่นตั้งแต่ตรงนี้ ไม่งั้นฝุ่นจุดเดียวจะพองเป็นวงกลมเท่าระยะเว้นขอบ
    var solid = new Uint8Array(W * H);
    for (var yy = 0; yy < h; yy++) {
      for (var xx = 0; xx < w; xx++) if (alpha[yy * w + xx] >= thr) solid[(yy + P) * W + xx + P] = 1;
    }
    removeSpecks(solid, W, H, o.minAreaPx);

    if (offset < 0.01) {
      F.fill(-thr / 255);
      for (var y = 0; y < h; y++) {
        for (var x = 0; x < w; x++) {
          var pk = (y + P) * W + x + P;
          var av = alpha[y * w + x];
          F[pk] = av >= thr && !solid[pk] ? -thr / 255 : (av - thr) / 255;
        }
      }
    } else {
      var d2 = distanceSquared(solid, W, H);
      for (var q = 0; q < W * H; q++) F[q] = offset + 0.5 - Math.sqrt(d2[q]);
    }

    var inside = new Uint8Array(W * H);
    for (var m = 0; m < W * H; m++) inside[m] = F[m] > 0 ? 1 : 0;
    if (o.fillHoles) fillHoles(inside, W, H);
    for (var n = 0; n < W * H; n++) {
      if (inside[n] && !(F[n] > 0)) F[n] = 0.5; // รูที่ถูกถม
    }

    var loops = marchingSquares(F, W, H);
    var shift = 0.5 - P;
    var out = [];
    for (var l = 0; l < loops.length; l++) {
      var pts = loops[l].map(function (p) {
        return [p[0] + shift, p[1] + shift];
      });
      pts = G.dedupe(pts, 1e-6);
      if (o.simplifyPx > 0) pts = G.simplifyRing(pts, o.simplifyPx);
      if (pts.length < 3) continue;
      var area = Math.abs(G.signedArea(pts));
      if (area < 1) continue;
      out.push({ points: pts, area: area });
    }
    out.sort(function (a, b) {
      return b.area - a.area;
    });
    return out;
  }

  return {
    DEFAULTS: DEFAULTS,
    traceAlpha: traceAlpha,
    distanceSquared: distanceSquared,
    marchingSquares: marchingSquares,
  };
});
