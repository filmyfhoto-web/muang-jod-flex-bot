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

  // รูข้างใน (4 ทิศ ไม่ต่อกับขอบภาพ) ที่เล็กกว่า minArea พิกเซล → ถม (เล็กเกินกว่าจะตัดได้)
  function fillSmallHoles(inside, W, H, minArea) {
    var reached = new Uint8Array(W * H);
    var queue = new Int32Array(W * H);
    var out = { filled: 0, kept: 0 };
    function flood(seed, mark) {
      var head = 0;
      var tail = 0;
      queue[tail++] = seed;
      reached[seed] = mark;
      while (head < tail) {
        var k = queue[head++];
        var cx = k % W;
        var nb = [cx > 0 ? k - 1 : -1, cx < W - 1 ? k + 1 : -1, k >= W ? k - W : -1, k < W * (H - 1) ? k + W : -1];
        for (var i = 0; i < 4; i++) {
          var n = nb[i];
          if (n >= 0 && !inside[n] && !reached[n]) {
            reached[n] = mark;
            queue[tail++] = n;
          }
        }
      }
      return tail;
    }
    for (var x = 0; x < W; x++) {
      if (!inside[x] && !reached[x]) flood(x, 1);
      var b = (H - 1) * W + x;
      if (!inside[b] && !reached[b]) flood(b, 1);
    }
    for (var y = 0; y < H; y++) {
      var l = y * W;
      if (!inside[l] && !reached[l]) flood(l, 1);
      if (!inside[l + W - 1] && !reached[l + W - 1]) flood(l + W - 1, 1);
    }
    for (var s = 0; s < W * H; s++) {
      if (inside[s] || reached[s]) continue;
      var n = flood(s, 2);
      if (n < minArea) {
        for (var q = 0; q < n; q++) inside[queue[q]] = 1;
        out.filled++;
      } else out.kept++;
    }
    return out;
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
    minHolePx: 0, // ไม่อุดรู: รูเล็กกว่านี้ (พิกเซล) ยังถมให้ เพราะเล็กเกินกว่าจะตัดได้
    stats: null, // ส่ง {} มารับตัวเลขสรุป: specks, holes, holesSkipped, shapes, points
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
    var specks = removeSpecks(solid, W, H, o.minAreaPx);

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
    var holeInfo = { filled: 0, kept: 0 };
    if (o.fillHoles) fillHoles(inside, W, H);
    else if (o.minHolePx > 0) holeInfo = fillSmallHoles(inside, W, H, o.minHolePx);
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
    markHoles(out);
    if (o.stats) {
      o.stats.specks = specks;
      o.stats.holesSkipped = holeInfo.filled;
      o.stats.holes = 0;
      o.stats.shapes = 0;
      o.stats.points = 0;
      out.forEach(function (lp) {
        if (lp.hole) o.stats.holes++;
        else o.stats.shapes++;
        o.stats.points += lp.points.length;
      });
    }
    return out;
  }

  // ทุกวงจาก marching squares วนทิศเดียวกันเทียบกับเนื้องาน → รูมีเครื่องหมายพื้นที่ตรงข้ามกับวงนอก
  function markHoles(loops) {
    if (!loops.length) return loops;
    var outer = G.signedArea(loops[0].points) > 0;
    loops.forEach(function (lp) {
      lp.hole = G.signedArea(lp.points) > 0 !== outer;
    });
    return loops;
  }

  // ---------------------------------------------------------------- อ่านรูปภาพ (พื้นทึบ)

  // หาพื้นหลังของรูปถ่าย/JPG: สีที่ขอบภาพ → ไล่จากขอบเข้าไปเฉพาะพิกเซลที่สีใกล้พื้น (หรือเป็นเงาของพื้น)
  // คืน { width, height, alpha, bg, removed } — alpha = 0 ตรงที่เป็นพื้นหลัง ส่งต่อให้ traceAlpha ได้เลย
  // opts.tolerance: ความต่างสีพื้น 0–255 · opts.shadow: ตัดเงาทิ้ง 0–100 (% ความมืดที่ยังนับเป็นเงาของพื้น)
  function backgroundMask(img, opts) {
    var o = opts || {};
    var w = img.width;
    var h = img.height;
    var d = img.data;
    var n = w * h;
    var alpha = new Uint8Array(n);
    for (var i = 0; i < n; i++) alpha[i] = d[i * 4 + 3];
    var tol = Math.max(0, o.tolerance == null ? 40 : o.tolerance);
    var shadow = Math.max(0, Math.min(100, o.shadow || 0)) / 100;

    // สีพื้น = ค่ากลางของพิกเซลทึบรอบขอบภาพ (ขอบส่วนใหญ่โปร่งใส = ไม่ใช่รูปพื้นทึบ)
    var rs = [];
    var gs = [];
    var bs = [];
    var border = 0;
    function sample(k) {
      border++;
      if (d[k * 4 + 3] < 128) return;
      rs.push(d[k * 4]);
      gs.push(d[k * 4 + 1]);
      bs.push(d[k * 4 + 2]);
    }
    for (var x = 0; x < w; x++) {
      sample(x);
      sample((h - 1) * w + x);
    }
    for (var y = 1; y < h - 1; y++) {
      sample(y * w);
      sample(y * w + w - 1);
    }
    if (rs.length < border * 0.5) return { width: w, height: h, alpha: alpha, bg: null, removed: 0 };
    function median(a) {
      a.sort(function (p, q) {
        return p - q;
      });
      return a[a.length >> 1];
    }
    var bg = { r: median(rs), g: median(gs), b: median(bs) };
    var bgSum = bg.r + bg.g + bg.b + 1;

    function isBg(k) {
      var j = k * 4;
      if (d[j + 3] < 128) return true;
      var dr = d[j] - bg.r;
      var dg = d[j + 1] - bg.g;
      var db = d[j + 2] - bg.b;
      if (Math.sqrt((dr * dr + dg * dg + db * db) / 3) <= tol) return true;
      if (!shadow) return false;
      // เงา: สีเดียวกับพื้นแต่มืดลง (สัดส่วน r:g:b ใกล้พื้น และสว่างไม่ต่ำกว่า 1 − shadow)
      var sum = d[j] + d[j + 1] + d[j + 2] + 1;
      var v = sum / bgSum;
      if (v > 1 || v < 1 - shadow) return false;
      var cr = d[j] / sum - bg.r / bgSum;
      var cg = d[j + 1] / sum - bg.g / bgSum;
      return Math.abs(cr) < 0.04 && Math.abs(cg) < 0.04;
    }

    var seen = new Uint8Array(n);
    var queue = new Int32Array(n);
    var head = 0;
    var tail = 0;
    function push(k) {
      if (!seen[k] && isBg(k)) {
        seen[k] = 1;
        queue[tail++] = k;
      }
    }
    for (var x2 = 0; x2 < w; x2++) {
      push(x2);
      push((h - 1) * w + x2);
    }
    for (var y2 = 0; y2 < h; y2++) {
      push(y2 * w);
      push(y2 * w + w - 1);
    }
    while (head < tail) {
      var k = queue[head++];
      var cx = k % w;
      if (cx > 0) push(k - 1);
      if (cx < w - 1) push(k + 1);
      if (k >= w) push(k - w);
      if (k < n - w) push(k + w);
    }
    var removed = 0;
    for (var m = 0; m < n; m++) {
      if (seen[m] && alpha[m] >= 128) removed++;
      if (seen[m]) alpha[m] = 0;
    }
    return { width: w, height: h, alpha: alpha, bg: bg, removed: removed };
  }

  // ---------------------------------------------------------------- เว้นระยะแบบมุมแหลม / ตัดมุม / มน

  // วงทุกวง (หน่วยใดก็ได้) → วงที่ขยายออก offset พร้อมมุมตามแบบ แล้วรวมวงที่ชนกันเป็นวงเดียว
  // opts: { offset, join: 'round' | 'bevel' | 'miter', miterLimit, cell, fillHoles, minHole, simplify }
  // วิธีเดียวกับ Clipper: สร้างเส้นขยายดิบ (มุมเว้าอาจไขว้กันเป็นห่วง) แล้วเก็บเฉพาะที่ winding > 0
  // ตรงนี้นับ winding บนตารางละเอียด cell แล้วลากเส้นขอบใหม่ — ห่วงเกินหายไป วงที่ชนกันรวมกันเอง
  function offsetOutline(rings, opts) {
    var o = opts || {};
    var d = Math.max(0, o.offset || 0);
    var join = o.join || 'round';
    var limit = Math.max(1, o.miterLimit || 4);
    var src = rings.filter(function (r) {
      return r.length >= 3 && Math.abs(G.signedArea(r)) > 1e-9;
    });
    if (!src.length) return [];
    var bb = G.bounds(src);
    var size = Math.max(bb.maxX - bb.minX, bb.maxY - bb.minY) + 2 * d;
    var cell = o.cell > 0 ? o.cell : size / 1200;
    var tol = cell / 4;

    // ทิศการวน: วงนอก (ซ้อนอยู่ในวงอื่นเป็นจำนวนคู่) พื้นที่บวก รูพื้นที่ลบ
    var oriented = orientRings(src);

    var raw = oriented.map(function (r) {
      return d > 0 ? offsetRing(r, d, join, limit, tol) : r;
    });

    // winding บนตาราง
    var P = 2;
    var ox = bb.minX - d - P * cell;
    var oy = bb.minY - d - P * cell;
    var W = Math.ceil((bb.maxX - bb.minX + 2 * d) / cell) + 2 * P + 1;
    var H = Math.ceil((bb.maxY - bb.minY + 2 * d) / cell) + 2 * P + 1;
    var inside = rasterWinding(raw, ox, oy, W, H, cell);
    if (o.fillHoles) fillHoles(inside, W, H);
    else if (o.minHole > 0) fillSmallHoles(inside, W, H, o.minHole / (cell * cell));

    var F = new Float32Array(W * H);
    for (var m = 0; m < W * H; m++) F[m] = inside[m] ? 1 : -1;
    var simplify = Math.max(cell * 0.8, o.simplify || 0);
    var out = [];
    marchingSquares(F, W, H).forEach(function (lp) {
      var pts = G.dedupe(
        lp.map(function (p) {
          return [ox + (p[0] + 0.5) * cell, oy + (p[1] + 0.5) * cell];
        }),
        1e-9
      );
      pts = G.simplifyRing(pts, simplify);
      if (pts.length < 3) return;
      var area = Math.abs(G.signedArea(pts));
      if (area < cell * cell * 4) return;
      out.push({ points: pts, area: area });
    });
    out.sort(function (a, b) {
      return b.area - a.area;
    });
    return markHoles(out);
  }

  // เติมช่องตาราง W × H (ช่องละ cell เริ่มที่ ox, oy) ที่ winding ของวงทั้งหมด > 0 → Uint8Array
  // วงนอกพื้นที่บวก = +1 ข้างใน, รูพื้นที่ลบ = −1
  function rasterWinding(rings, ox, oy, W, H, cell) {
    var inside = new Uint8Array(W * H);
    var edges = [];
    rings.forEach(function (r) {
      for (var i = 0; i < r.length; i++) {
        var a = r[i];
        var b = r[(i + 1) % r.length];
        if (a[1] !== b[1]) edges.push(a[1] < b[1] ? [a[0], a[1], b[0], b[1], -1] : [b[0], b[1], a[0], a[1], 1]);
      }
    });
    edges.sort(function (e, f) {
      return e[1] - f[1];
    });
    var xs = [];
    var start = 0;
    for (var row = 0; row < H; row++) {
      var yc = oy + (row + 0.5) * cell;
      while (start < edges.length && edges[start][3] <= yc) start++;
      xs.length = 0;
      for (var e = start; e < edges.length && edges[e][1] <= yc; e++) {
        var ed = edges[e];
        if (ed[3] <= yc) continue;
        xs.push([ed[0] + ((yc - ed[1]) / (ed[3] - ed[1])) * (ed[2] - ed[0]), ed[4]]);
      }
      if (!xs.length) continue;
      xs.sort(function (p, q) {
        return p[0] - q[0];
      });
      var wind = 0;
      var k = 0;
      for (var col = 0; col < W; col++) {
        var xc = ox + (col + 0.5) * cell;
        while (k < xs.length && xs[k][0] <= xc) wind += xs[k++][1];
        if (wind > 0) inside[row * W + col] = 1;
      }
    }
    return inside;
  }

  // ทิศการวนให้ถูก: วงนอก (ซ้อนในวงอื่นจำนวนคู่) พื้นที่บวก รูพื้นที่ลบ — ใช้ก่อน rasterWinding
  function orientRings(rings) {
    return rings.map(function (r, i) {
      var depth = 0;
      for (var j = 0; j < rings.length; j++) if (j !== i && G.pointInRing(r[0], rings[j])) depth++;
      var want = depth % 2 === 0 ? 1 : -1;
      return G.signedArea(r) * want > 0 ? r : r.slice().reverse();
    });
  }

  // เส้นขยายดิบของวงเดียว (พื้นที่บวก = ขยายออก, พื้นที่ลบ = รูหดเข้า)
  function offsetRing(r, d, join, limit, tol) {
    var n = r.length;
    var out = [];
    var normals = [];
    for (var i = 0; i < n; i++) {
      var a = r[i];
      var b = r[(i + 1) % n];
      var dx = b[0] - a[0];
      var dy = b[1] - a[1];
      var len = Math.sqrt(dx * dx + dy * dy) || 1;
      normals.push([dy / len, -dx / len]);
    }
    var step = 2 * Math.acos(Math.max(-1, Math.min(1, 1 - tol / d)));
    if (!(step > 0.01)) step = 0.01;
    for (var j = 0; j < n; j++) {
      var v = r[j];
      var n1 = normals[(j - 1 + n) % n];
      var n2 = normals[j];
      var p1 = [v[0] + n1[0] * d, v[1] + n1[1] * d];
      var p2 = [v[0] + n2[0] * d, v[1] + n2[1] * d];
      var cross = n1[0] * n2[1] - n1[1] * n2[0];
      var dot = n1[0] * n2[0] + n1[1] * n2[1];
      if (Math.abs(cross) < 1e-9 && dot > 0) {
        out.push(p1);
        continue;
      }
      if (cross < 0) {
        // มุมเว้า: ผ่านจุดยอดเดิม ให้ winding ถูกต้อง ห่วงที่เกินจะถูกตัดทิ้งตอนนับ winding
        out.push(p1, v, p2);
        continue;
      }
      if (join === 'miter') {
        var ratio = Math.sqrt(2 / (1 + dot));
        if (ratio <= limit) {
          out.push([v[0] + ((n1[0] + n2[0]) * d) / (1 + dot), v[1] + ((n1[1] + n2[1]) * d) / (1 + dot)]);
          continue;
        }
        // เกินขีดจำกัด → ตัดมุม
        out.push(p1, p2);
        continue;
      }
      if (join === 'bevel') {
        out.push(p1, p2);
        continue;
      }
      var a1 = Math.atan2(n1[1], n1[0]);
      var turn = Math.atan2(cross, dot);
      var steps = Math.max(1, Math.ceil(turn / step));
      for (var s2 = 0; s2 <= steps; s2++) {
        var t = a1 + (turn * s2) / steps;
        out.push([v[0] + Math.cos(t) * d, v[1] + Math.sin(t) * d]);
      }
    }
    return out;
  }

  return {
    DEFAULTS: DEFAULTS,
    traceAlpha: traceAlpha,
    backgroundMask: backgroundMask,
    offsetOutline: offsetOutline,
    rasterWinding: rasterWinding,
    orientRings: orientRings,
    fillHoles: fillHoles,
    fillSmallHoles: fillSmallHoles,
    removeSpecks: removeSpecks,
    markHoles: markHoles,
    distanceSquared: distanceSquared,
    marchingSquares: marchingSquares,
  };
});
