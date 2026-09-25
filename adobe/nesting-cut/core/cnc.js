// งาน CNC / ป้ายไฟ: ทำมุมโค้งตามรัศมีดอกกัด และหาเส้นกลางตัวอักษรสำหรับวางแถบ LED
//
// ทั้งสองอย่างทำบนตารางละเอียด (หน่วยเดียวกับพิกัดที่ส่งมา ปกติเป็น มม.)
//   ทำมุมโค้ง: มุมใน = closing (ขยาย r แล้วหด r) → ทุกมุมเว้ามีรัศมีอย่างน้อย r ที่ดอกกัดเข้าได้
//              มุมนอก = opening (หด r แล้วขยาย r) → มุมนูนโค้งตาม r
//              ส่วนที่ถูกเติม/ตัดออกเป็นก้อนใหญ่ (ร่องแคบกว่าดอก มุมแหลมจัด ส่วนบางกว่าดอก) ถูกเตือนเป็นวงกลม
//   เส้นกลาง:   บางตัวอักษรจนเหลือเส้นเดียว (Zhang–Suen) → ต่อเป็นเส้น → ตัดกิ่งสั้นที่มุม →
//              เว้นจากปลาย → วัดความกว้าง (2 × ระยะถึงขอบ) และรัศมีโค้งตลอดเส้น
(function (root, factory) {
  if (typeof module === 'object' && module.exports && typeof window === 'undefined') {
    module.exports = factory(require('./geometry.js'), require('./contour.js'));
  } else {
    var ns = (root.NestingCut = root.NestingCut || {});
    ns.cnc = factory(ns.geometry, ns.contour);
  }
})(typeof window !== 'undefined' ? window : this, function (G, C) {
  'use strict';

  var BIT_RADIUS = 1.5875; // ดอก 1/8 นิ้ว

  function grid(rings, pad, cell) {
    var bb = G.bounds(rings);
    var ox = bb.minX - pad;
    var oy = bb.minY - pad;
    var W = Math.ceil((bb.maxX - bb.minX + 2 * pad) / cell) + 1;
    var H = Math.ceil((bb.maxY - bb.minY + 2 * pad) / cell) + 1;
    return { ox: ox, oy: oy, W: W, H: H, cell: cell, bb: bb };
  }

  function usable(rings) {
    return (rings || []).filter(function (r) {
      return r && r.length >= 3 && Math.abs(G.signedArea(r)) > 1e-9;
    });
  }

  function complement(a) {
    var out = new Uint8Array(a.length);
    for (var i = 0; i < a.length; i++) out[i] = a[i] ? 0 : 1;
    return out;
  }

  // กลุ่มพิกเซล (8 ทิศ) ของ mask → [{ count, cx, cy, minX, maxX, minY, maxY, depth }]
  function components(mask, W, H, depthOf) {
    var seen = new Uint8Array(W * H);
    var queue = new Int32Array(W * H);
    var out = [];
    for (var s = 0; s < W * H; s++) {
      if (!mask[s] || seen[s]) continue;
      var head = 0;
      var tail = 0;
      queue[tail++] = s;
      seen[s] = 1;
      var c = { count: 0, sx: 0, sy: 0, minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, depth: 0, dx: 0, dy: 0 };
      while (head < tail) {
        var k = queue[head++];
        var x = k % W;
        var y = (k - x) / W;
        c.count++;
        c.sx += x;
        c.sy += y;
        if (x < c.minX) c.minX = x;
        if (x > c.maxX) c.maxX = x;
        if (y < c.minY) c.minY = y;
        if (y > c.maxY) c.maxY = y;
        var d = depthOf ? depthOf(k) : 0;
        if (d > c.depth) {
          c.depth = d;
          c.dx = x;
          c.dy = y;
        }
        for (var yy = Math.max(0, y - 1); yy <= Math.min(H - 1, y + 1); yy++) {
          for (var xx = Math.max(0, x - 1); xx <= Math.min(W - 1, x + 1); xx++) {
            var n = yy * W + xx;
            if (mask[n] && !seen[n]) {
              seen[n] = 1;
              queue[tail++] = n;
            }
          }
        }
      }
      out.push(c);
    }
    return out;
  }

  function loopsFromField(F, g, simplify) {
    var out = [];
    C.marchingSquares(F, g.W, g.H).forEach(function (lp) {
      var pts = G.dedupe(
        lp.map(function (p) {
          return [g.ox + (p[0] + 0.5) * g.cell, g.oy + (p[1] + 0.5) * g.cell];
        }),
        1e-9
      );
      pts = G.simplifyRing(pts, simplify);
      if (pts.length < 3) return;
      var area = Math.abs(G.signedArea(pts));
      if (area < g.cell * g.cell * 4) return;
      out.push({ points: pts, area: area });
    });
    out.sort(function (a, b) {
      return b.area - a.area;
    });
    return C.markHoles(out);
  }

  // ---------------------------------------------------------------- ทำมุมโค้ง

  // rings: วงปิดของตัวอักษร/ชิ้นงาน · opts: { rIn, rOut, cell }
  // คืน { loops: [{ points, hole, area }], flags: [{ x, y, r, kind: 'inner' | 'outer' }], cell }
  function roundCorners(rings, opts) {
    var o = opts || {};
    var rIn = Math.max(0, o.rIn || 0);
    var rOut = Math.max(0, o.rOut || 0);
    var src = C.orientRings(usable(rings));
    if (!src.length) return { loops: [], flags: [], cell: 0 };
    var bb = G.bounds(src);
    var size = Math.max(bb.maxX - bb.minX, bb.maxY - bb.minY);
    var rMin = Math.min(rIn > 0 ? rIn : Infinity, rOut > 0 ? rOut : Infinity);
    var cell = o.cell > 0 ? o.cell : Math.max(size / 2500, Math.min(0.05, isFinite(rMin) ? rMin / 10 : 0.05));
    var g = grid(src, Math.max(rIn, rOut) + 3 * cell, cell);
    var W = g.W;
    var H = g.H;
    var n = W * H;
    var inside = C.rasterWinding(src, g.ox, g.oy, W, H, cell);
    var flags = [];
    var cur = inside;
    var F = new Float32Array(n);
    var i;

    function flag(c, r, kind) {
      var ext = Math.hypot(c.maxX - c.minX + 1, c.maxY - c.minY + 1) * cell;
      var x = c.depth > 0 ? c.dx : c.sx / c.count;
      var y = c.depth > 0 ? c.dy : c.sy / c.count;
      flags.push({ x: g.ox + (x + 0.5) * cell, y: g.oy + (y + 0.5) * cell, r: Math.max(r, Math.min(ext / 2, r * 3)), kind: kind });
    }

    if (rIn > 0) {
      var rc = rIn / cell;
      var dOut = C.distanceSquared(inside, W, H);
      var D = new Uint8Array(n);
      for (i = 0; i < n; i++) D[i] = inside[i] || Math.sqrt(dOut[i]) <= rc + 0.5 ? 1 : 0;
      var dIn = C.distanceSquared(complement(D), W, H);
      var closed = new Uint8Array(n);
      for (i = 0; i < n; i++) {
        F[i] = D[i] ? Math.sqrt(dIn[i]) - 0.5 - rc : -1;
        closed[i] = F[i] > 0 ? 1 : 0;
      }
      // ส่วนที่ถูกเติม: มุมเว้าปกติเป็นก้อนเล็กชิดมุม · ร่องแคบกว่าดอกหรือมุมแหลมจัดจะยาว/ลึกกว่า
      var added = new Uint8Array(n);
      for (i = 0; i < n; i++) added[i] = closed[i] && !inside[i] ? 1 : 0;
      components(added, W, H, function (k) {
        return Math.sqrt(dOut[k]);
      }).forEach(function (c) {
        var ext = Math.hypot(c.maxX - c.minX + 1, c.maxY - c.minY + 1);
        if (c.depth > rc * 1.05 || ext > rc * 2.5) flag(c, rIn, 'inner');
      });
      cur = closed;
    } else {
      for (i = 0; i < n; i++) F[i] = inside[i] ? 0.5 : -0.5;
    }

    if (rOut > 0) {
      var ro = rOut / cell;
      var dC = C.distanceSquared(complement(cur), W, H);
      var E = new Uint8Array(n);
      for (i = 0; i < n; i++) E[i] = cur[i] && Math.sqrt(dC[i]) - 0.5 >= ro ? 1 : 0;
      var dE = C.distanceSquared(E, W, H);
      var removed = new Uint8Array(n);
      for (i = 0; i < n; i++) {
        var v = ro + 0.5 - Math.sqrt(dE[i]);
        // ไม่ขยายเกินรูปเดิม (หลัง closing)
        F[i] = Math.min(v, cur[i] ? F[i] > 0 ? F[i] : 0.5 : -1);
        removed[i] = cur[i] && !(F[i] > 0) ? 1 : 0;
      }
      components(removed, W, H, function (k) {
        return Math.sqrt(dE[k]);
      }).forEach(function (c) {
        var ext = Math.hypot(c.maxX - c.minX + 1, c.maxY - c.minY + 1);
        if (ext > ro * 2.5) flag(c, rOut, 'outer');
      });
    }

    return { loops: loopsFromField(F, g, cell * 0.35), flags: flags, cell: cell };
  }

  // ---------------------------------------------------------------- เส้นกลาง

  // Zhang–Suen thinning (แก้ใน mask เลย)
  function thin(m, W, H) {
    var del = [];
    var changed = true;
    function at(x, y) {
      return x >= 0 && y >= 0 && x < W && y < H ? m[y * W + x] : 0;
    }
    while (changed) {
      changed = false;
      for (var step = 0; step < 2; step++) {
        del.length = 0;
        for (var y = 1; y < H - 1; y++) {
          for (var x = 1; x < W - 1; x++) {
            var k = y * W + x;
            if (!m[k]) continue;
            var p2 = at(x, y - 1);
            var p3 = at(x + 1, y - 1);
            var p4 = at(x + 1, y);
            var p5 = at(x + 1, y + 1);
            var p6 = at(x, y + 1);
            var p7 = at(x - 1, y + 1);
            var p8 = at(x - 1, y);
            var p9 = at(x - 1, y - 1);
            var b = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
            if (b < 2 || b > 6) continue;
            var a =
              (!p2 && p3 ? 1 : 0) + (!p3 && p4 ? 1 : 0) + (!p4 && p5 ? 1 : 0) + (!p5 && p6 ? 1 : 0) +
              (!p6 && p7 ? 1 : 0) + (!p7 && p8 ? 1 : 0) + (!p8 && p9 ? 1 : 0) + (!p9 && p2 ? 1 : 0);
            if (a !== 1) continue;
            if (step === 0 ? p2 * p4 * p6 || p4 * p6 * p8 : p2 * p4 * p8 || p2 * p6 * p8) continue;
            del.push(k);
          }
        }
        if (del.length) changed = true;
        for (var i = 0; i < del.length; i++) m[del[i]] = 0;
      }
    }
    // ตัดพิกเซลมุมบันได (เชื่อมกันทางทแยงอยู่แล้ว) ให้เส้นหนา 1 พิกเซลจริง
    var corners = [
      [0, -1, 1, 0, -1, 1],
      [1, 0, 0, 1, -1, -1],
      [0, 1, -1, 0, 1, -1],
      [-1, 0, 0, -1, 1, 1],
    ];
    for (var yy = 1; yy < H - 1; yy++) {
      for (var xx = 1; xx < W - 1; xx++) {
        var kk = yy * W + xx;
        if (!m[kk]) continue;
        for (var c = 0; c < 4; c++) {
          var q = corners[c];
          if (!at(xx + q[0], yy + q[1]) || !at(xx + q[2], yy + q[3])) continue;
          // ด้านตรงข้ามว่างทั้งหมด = พิกเซลนี้แค่เชื่อมสองตัวที่ทแยงกันอยู่แล้ว
          var ox = q[4];
          var oy = q[5];
          if (!at(xx + ox, yy) && !at(xx, yy + oy) && !at(xx + ox, yy + oy) && !at(xx - ox, yy + oy) && !at(xx + ox, yy - oy)) {
            m[kk] = 0;
            break;
          }
        }
      }
    }
    return m;
  }

  var NB = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];

  // เส้นกลาง → กราฟ → เส้นยาว (pixel index)
  function traceSkeleton(sk, W, H, dist) {
    var n = W * H;
    var deg = new Uint8Array(n);
    var k;
    var j;
    function nbrs(p) {
      var x = p % W;
      var y = (p - x) / W;
      var out = [];
      for (var i = 0; i < 8; i++) {
        var nx = x + NB[i][0];
        var ny = y + NB[i][1];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        var q = ny * W + nx;
        if (sk[q]) out.push(q);
      }
      return out;
    }
    for (k = 0; k < n; k++) if (sk[k]) deg[k] = nbrs(k).length;
    // โหนด = ปลาย (deg 1) หรือทางแยก (deg ≥ 3) — พิกเซลทางแยกที่ติดกันรวมเป็นโหนดเดียว
    var node = new Int32Array(n).fill(-1);
    var nodes = [];
    for (k = 0; k < n; k++) {
      if (!sk[k] || deg[k] === 2 || node[k] >= 0) continue;
      var id = nodes.length;
      var stack = [k];
      node[k] = id;
      var pix = [];
      while (stack.length) {
        var p = stack.pop();
        pix.push(p);
        if (deg[p] < 3) continue;
        var nb = nbrs(p);
        for (j = 0; j < nb.length; j++) {
          if (deg[nb[j]] >= 3 && node[nb[j]] < 0) {
            node[nb[j]] = id;
            stack.push(nb[j]);
          }
        }
      }
      nodes.push({ id: id, pixels: pix, ends: 0, leaf: deg[k] <= 1 });
    }
    var seen = new Uint8Array(n);
    var segs = [];
    nodes.forEach(function (nd) {
      nd.pixels.forEach(function (s) {
        nbrs(s).forEach(function (first) {
          if (node[first] === nd.id) return;
          if (node[first] >= 0) {
            // โหนดติดกันตรง ๆ
            if (nd.id < node[first]) segs.push({ a: nd.id, b: node[first], px: [s, first] });
            return;
          }
          if (seen[first]) return;
          var path = [s, first];
          seen[first] = 1;
          var prev = s;
          var curp = first;
          for (;;) {
            var nx = nbrs(curp).filter(function (q) {
              return q !== prev && (node[q] >= 0 ? node[q] !== node[s] || path.length > 2 : !seen[q]);
            });
            if (!nx.length) break;
            var next = nx[0];
            path.push(next);
            if (node[next] >= 0) break;
            seen[next] = 1;
            prev = curp;
            curp = next;
          }
          var last = path[path.length - 1];
          segs.push({ a: nd.id, b: node[last] >= 0 ? node[last] : -1, px: path });
        });
      });
    });
    // วงปิดที่ไม่มีโหนด (เช่น ตัว O)
    for (k = 0; k < n; k++) {
      if (!sk[k] || seen[k] || node[k] >= 0) continue;
      var loop = [k];
      seen[k] = 1;
      var pv = -1;
      var cu = k;
      for (;;) {
        var cand = nbrs(cu).filter(function (q) {
          return q !== pv && !seen[q];
        });
        if (!cand.length) break;
        pv = cu;
        cu = cand[0];
        seen[cu] = 1;
        loop.push(cu);
      }
      if (loop.length > 3) segs.push({ a: -2, b: -2, px: loop, closed: true });
    }
    return { nodes: nodes, segs: segs };
  }

  function segLength(px, W) {
    var len = 0;
    for (var i = 1; i < px.length; i++) {
      var ax = px[i - 1] % W;
      var bx = px[i] % W;
      var ay = (px[i - 1] - ax) / W;
      var by = (px[i] - bx) / W;
      len += Math.hypot(bx - ax, by - ay);
    }
    return len;
  }

  // ตัดกิ่งสั้น (ปลายเปิด สั้นกว่าความกว้างตรงทางแยก) แล้วต่อเส้นที่ผ่านทางแยกเหลือสองทาง
  function prune(graph, W, dist) {
    var segs = graph.segs.slice();
    var nodes = graph.nodes;
    function count() {
      nodes.forEach(function (nd) {
        nd.ends = 0;
      });
      segs.forEach(function (s) {
        if (s.a >= 0) nodes[s.a].ends++;
        if (s.b >= 0) nodes[s.b].ends++;
      });
    }
    for (var round = 0; round < 20; round++) {
      count();
      var removed = false;
      segs = segs.filter(function (s) {
        if (s.closed) return true;
        var leafA = s.a < 0 || nodes[s.a].ends === 1;
        var leafB = s.b < 0 || nodes[s.b].ends === 1;
        if (leafA === leafB) return true; // เส้นเดี่ยว หรือเชื่อมสองทางแยก
        var junction = leafA ? s.b : s.a;
        var jw = 0;
        nodes[junction].pixels.forEach(function (p) {
          jw = Math.max(jw, dist[p]);
        });
        if (segLength(s.px, W) < jw * 2) {
          removed = true;
          return false;
        }
        return true;
      });
      if (!removed) break;
    }
    count();
    // ต่อเส้นที่ทางแยกเหลือ 2 ทาง
    var merged = true;
    while (merged) {
      merged = false;
      for (var i = 0; i < nodes.length && !merged; i++) {
        if (nodes[i].ends !== 2) continue;
        var at = [];
        segs.forEach(function (s, idx) {
          if (s.a === i) at.push({ idx: idx, end: 'a' });
          if (s.b === i) at.push({ idx: idx, end: 'b' });
        });
        if (at.length !== 2) continue;
        if (at[0].idx === at[1].idx) {
          segs[at[0].idx].closed = true;
          segs[at[0].idx].a = segs[at[0].idx].b = -2;
          nodes[i].ends = 0;
          merged = true;
          continue;
        }
        var s1 = segs[at[0].idx];
        var s2 = segs[at[1].idx];
        var p1 = at[0].end === 'b' ? s1.px : s1.px.slice().reverse(); // จบที่โหนด i
        var p2 = at[1].end === 'a' ? s2.px : s2.px.slice().reverse(); // เริ่มที่โหนด i
        var joined = {
          a: at[0].end === 'b' ? s1.a : s1.b,
          b: at[1].end === 'a' ? s2.b : s2.a,
          px: p1.concat(p2.slice(1)),
        };
        segs = segs.filter(function (_s, idx) {
          return idx !== at[0].idx && idx !== at[1].idx;
        });
        segs.push(joined);
        count();
        merged = true;
      }
    }
    return { nodes: nodes, segs: segs };
  }

  function smooth(pts, win, closed) {
    if (pts.length < 3 || win < 1) return pts;
    var n = pts.length;
    return pts.map(function (p, i) {
      if (!closed && (i === 0 || i === n - 1)) return p;
      var sx = 0;
      var sy = 0;
      var c = 0;
      for (var k = -win; k <= win; k++) {
        var j = i + k;
        if (closed) j = ((j % n) + n) % n;
        else if (j < 0 || j >= n) continue;
        sx += pts[j][0];
        sy += pts[j][1];
        c++;
      }
      return [sx / c, sy / c];
    });
  }

  function resample(pts, step, closed) {
    var src = closed ? pts.concat([pts[0]]) : pts;
    var out = [src[0]];
    var carry = 0;
    for (var i = 1; i < src.length; i++) {
      var a = src[i - 1];
      var b = src[i];
      var len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      var t = step - carry;
      while (t <= len) {
        out.push([a[0] + ((b[0] - a[0]) * t) / len, a[1] + ((b[1] - a[1]) * t) / len]);
        t += step;
      }
      carry = len - (t - step);
    }
    if (!closed) {
      var last = src[src.length - 1];
      var tail = out[out.length - 1];
      if (Math.hypot(last[0] - tail[0], last[1] - tail[1]) > step * 0.25) out.push(last);
    } else if (out.length > 1) {
      var e = out[out.length - 1];
      if (Math.hypot(e[0] - out[0][0], e[1] - out[0][1]) < step * 0.5) out.pop();
    }
    return out;
  }

  function polyLength(pts, closed) {
    var len = 0;
    for (var i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (closed && pts.length > 2) len += Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]);
    return len;
  }

  // ช่วงติดกันของจุดที่เข้าเงื่อนไข → จุดเตือนตรงกลางช่วง
  function runs(line, test, kind, out) {
    var n = line.points.length;
    var start = -1;
    for (var i = 0; i <= n; i++) {
      var hit = i < n && test(i);
      if (hit && start < 0) start = i;
      if (!hit && start >= 0) {
        var mid = Math.floor((start + i - 1) / 2);
        out.push({ x: line.points[mid][0], y: line.points[mid][1], kind: kind, value: line.widths[mid] });
        start = -1;
      }
    }
  }

  // rings: ตัวอักษรปิด · opts: { stripWidth: 6, minRadius: 15, endMargin: 10, cell }
  // คืน { lines: [{ points, closed, length, widths }], flags: [{ x, y, kind: 'narrow' | 'tight' | 'wide' }], stats }
  function centerline(rings, opts) {
    var o = opts || {};
    var strip = o.stripWidth > 0 ? o.stripWidth : 6;
    var minR = o.minRadius > 0 ? o.minRadius : 15;
    var margin = o.endMargin >= 0 ? o.endMargin : 10;
    var src = C.orientRings(usable(rings));
    var empty = { lines: [], flags: [], stats: { lines: 0, length: 0, minWidth: 0, maxWidth: 0, narrow: 0, tight: 0, wide: 0, dropped: 0 } };
    if (!src.length) return empty;
    var bb = G.bounds(src);
    var size = Math.max(bb.maxX - bb.minX, bb.maxY - bb.minY);
    var cell = o.cell > 0 ? o.cell : Math.max(size / 1200, Math.min(0.25, strip / 24));
    var g = grid(src, 3 * cell, cell);
    var W = g.W;
    var H = g.H;
    var inside = C.rasterWinding(src, g.ox, g.oy, W, H, cell);
    var d2 = C.distanceSquared(complement(inside), W, H);
    var dist = new Float32Array(W * H);
    for (var i = 0; i < W * H; i++) dist[i] = inside[i] ? Math.sqrt(d2[i]) : 0;
    var sk = thin(Uint8Array.from(inside), W, H);
    var graph = prune(traceSkeleton(sk, W, H, dist), W, dist);
    var nodes = graph.nodes;

    var lines = [];
    var dropped = 0;
    var step = Math.max(cell, 0.5);
    graph.segs.forEach(function (s) {
      if (s.px.length < 2) return;
      var closed = !!s.closed;
      var pts = s.px.map(function (p) {
        var x = p % W;
        var y = (p - x) / W;
        return [g.ox + (x + 0.5) * cell, g.oy + (y + 0.5) * cell];
      });
      pts = resample(smooth(pts, Math.max(1, Math.round(1.5 / cell)), closed), step, closed);
      // เว้นระยะจากปลายเปิด (ปลายที่เป็นทางแยกไม่เว้น)
      if (!closed) {
        var freeA = s.a < 0 || nodes[s.a].leaf || nodes[s.a].ends <= 1;
        var freeB = s.b < 0 || nodes[s.b].leaf || nodes[s.b].ends <= 1;
        var cut = Math.round(margin / step);
        var from = freeA ? cut : 0;
        var to = pts.length - (freeB ? cut : 0);
        if (to - from < 2) {
          dropped++;
          return;
        }
        pts = pts.slice(from, to);
      }
      var widths = pts.map(function (p) {
        var x = Math.max(0, Math.min(W - 1, Math.round((p[0] - g.ox) / cell - 0.5)));
        var y = Math.max(0, Math.min(H - 1, Math.round((p[1] - g.oy) / cell - 0.5)));
        return (2 * dist[y * W + x] - 1) * cell + cell;
      });
      lines.push({ points: pts, closed: closed, length: polyLength(pts, closed), widths: widths });
    });

    var flags = [];
    var minW = Infinity;
    var maxW = 0;
    var span = Math.max(1, Math.round(Math.min(5, minR / 3) / step));
    lines.forEach(function (ln) {
      ln.widths.forEach(function (w) {
        if (w < minW) minW = w;
        if (w > maxW) maxW = w;
      });
      var n = ln.points.length;
      ln.radii = ln.points.map(function (p, k) {
        var a = k - span;
        var b = k + span;
        if (ln.closed) {
          a = ((a % n) + n) % n;
          b = b % n;
        } else if (a < 0 || b >= n) return Infinity;
        var A = ln.points[a];
        var B = ln.points[b];
        var ab = Math.hypot(B[0] - A[0], B[1] - A[1]);
        var ap = Math.hypot(p[0] - A[0], p[1] - A[1]);
        var bp = Math.hypot(p[0] - B[0], p[1] - B[1]);
        var cross = Math.abs((p[0] - A[0]) * (B[1] - A[1]) - (p[1] - A[1]) * (B[0] - A[0]));
        return cross < 1e-9 ? Infinity : (ab * ap * bp) / (2 * cross);
      });
      runs(ln, function (k) {
        return ln.widths[k] < strip;
      }, 'narrow', flags);
      runs(ln, function (k) {
        return ln.radii[k] < minR;
      }, 'tight', flags);
      runs(ln, function (k) {
        return ln.widths[k] > strip * 2 + 2 * cell; // เผื่อความละเอียดตาราง
      }, 'wide', flags);
    });
    var stats = {
      lines: lines.length,
      length: lines.reduce(function (s2, l) {
        return s2 + l.length;
      }, 0),
      minWidth: lines.length ? minW : 0,
      maxWidth: maxW,
      narrow: 0,
      tight: 0,
      wide: 0,
      dropped: dropped,
    };
    flags.forEach(function (f) {
      stats[f.kind]++;
    });
    return { lines: lines, flags: flags, stats: stats, cell: cell };
  }

  // วง → จุดเบซิเยร์: ช่วงสั้น (ส่วนโค้งที่ถูกแบ่งละเอียด) ได้มือจับนุ่ม ช่วงยาวคงเป็นเส้นตรงเป๊ะ
  function toBezier(ring, maxSeg) {
    var n = ring.length;
    var L = maxSeg > 0 ? maxSeg : 2;
    return ring.map(function (p, i) {
      var prev = ring[(i - 1 + n) % n];
      var next = ring[(i + 1) % n];
      var la = Math.hypot(p[0] - prev[0], p[1] - prev[1]);
      var lb = Math.hypot(next[0] - p[0], next[1] - p[1]);
      var tx = next[0] - prev[0];
      var ty = next[1] - prev[1];
      var tl = Math.hypot(tx, ty) || 1;
      tx /= tl;
      ty /= tl;
      // มุมหักแรง (เกิน ~50°) คงเป็นมุม
      var ax = (p[0] - prev[0]) / (la || 1);
      var ay = (p[1] - prev[1]) / (la || 1);
      var bx = (next[0] - p[0]) / (lb || 1);
      var by = (next[1] - p[1]) / (lb || 1);
      var sharp = ax * bx + ay * by < Math.cos((50 * Math.PI) / 180);
      var l = !sharp && la < L ? [p[0] - (tx * la) / 3, p[1] - (ty * la) / 3] : p;
      var r = !sharp && lb < L ? [p[0] + (tx * lb) / 3, p[1] + (ty * lb) / 3] : p;
      return { a: p, l: l, r: r };
    });
  }

  return {
    toBezier: toBezier,
    BIT_RADIUS: BIT_RADIUS,
    roundCorners: roundCorners,
    centerline: centerline,
    thin: thin,
  };
});
