// เอนจินจัดวางชิ้นงานตามรูปทรงจริง (true-shape nesting)
//
// วิธีคิด: แปลงรูปทรงของแต่ละชิ้น (ทุกมุมที่ยอมให้หมุน) เป็นตารางช่องเล็ก ๆ (cell) แบบ "เผื่อไว้ก่อน"
// — ช่องไหนแตะชิ้นงานหรือแตะระยะห่าง (spacing/2) รอบชิ้นงาน ถือว่าช่องนั้นเต็ม
// ถ้าตารางของสองชิ้นไม่ทับกันสักช่อง รูปจริงของสองชิ้นก็ห่างกันอย่างน้อย spacing แน่นอน
// (ความละเอียด cell กินพื้นที่เพิ่มได้ไม่เกิน ~0.7 cell ต่อด้าน — cell 1 มม. ก็เผื่อไม่ถึง 1 มม.)
//
// การวาง: bottom-left fill ตามแนวม้วน — หาตำแหน่งแรกที่ว่าง (ใกล้หัวม้วนก่อน แล้วชิดซ้าย)
// ของทุกมุมหมุน เลือกมุมที่ขอบล่างของชิ้นอยู่ใกล้หัวม้วนที่สุด
// ลองหลายลำดับการวาง (ใหญ่ก่อน / ยาวก่อน / สุ่มสลับ) แล้วเก็บผลที่ใช้ม้วนสั้นที่สุด
//
// ระบบพิกัดของเอนจิน: mm, x ไปทางขวา (ข้ามหน้ากว้างม้วน), y ชี้ลง (ตามทางที่ม้วนไหล)
// ผลการวางของแต่ละชิ้น: จุด p ของชิ้นเดิม → R(angle)·p + (tx, ty) บนแผ่น
(function (root, factory) {
  if (typeof module === 'object' && module.exports && typeof window === 'undefined') {
    module.exports = factory(require('./geometry.js'));
  } else {
    var ns = (root.NestingCut = root.NestingCut || {});
    ns.nest = factory(ns.geometry);
  }
})(typeof window !== 'undefined' ? window : this, function (G) {
  'use strict';

  var ROTATION_SETS = {
    none: [0],
    half: [0, 180],
    quarter: [0, 90, 180, 270],
    eighth: [0, 45, 90, 135, 180, 225, 270, 315],
    fine: stepAngles(15),
  };

  function stepAngles(step) {
    var out = [];
    for (var a = 0; a < 360; a += step) out.push(a);
    return out;
  }

  var DEFAULTS = {
    spacing: 3, // ระยะห่างระหว่างเส้นตัดของสองชิ้น (mm)
    cellSize: 1, // ความละเอียดตาราง (mm) — เล็กลงแน่นขึ้นแต่ช้าลง
    rotations: ROTATION_SETS.quarter,
    fillHoles: true, // true = ถือว่ารูในชิ้นงานเป็นเนื้อ (ไม่เอาชิ้นเล็กไปใส่ในรู)
    iterations: 6, // จำนวนลำดับการวางที่ลอง
    timeLimitMs: 8000,
    seed: 1,
    maxSheets: 50,
  };

  // ---------- แปลงรูปทรงเป็นตาราง ----------

  // คืน mask: { w, h, ox, oy, rows:[Int32Array runs a0,b0,a1,b1..], cells, key, bbox }
  // (ox, oy) = มุมซ้ายบนของช่อง (0,0) ในพิกัดของรูปที่หมุนแล้ว
  function rasterize(rings, angle, cell, pad, fillHoles) {
    var rot = G.rotateRings(rings, angle);
    var b = G.bounds(rot);
    // ช่องที่ "เต็ม" = ช่องที่ตัวช่องเอง (ทั้งสี่เหลี่ยม) ห่างจากรูปไม่เกิน pad
    // ค้นเฉพาะช่องที่จุดกลางห่างไม่เกิน T ก่อน (ช่องที่เข้าเงื่อนไขอยู่ในนี้ทั้งหมด) แล้ววัดจริงทีละช่อง
    // (นับแบบ "น้อยกว่า pad" — จุดที่ห่างพอดี pad ไม่ต้องจอง จึงวางชิดกันได้พอดีระยะ)
    // ตั้งขอบตารางให้ตรงกับขอบรูป − pad → ชิ้นสี่เหลี่ยมตรง ๆ แทบไม่เสียเศษ
    var T = pad + cell * Math.SQRT1_2;
    var pad2 = pad * pad;
    var half = cell / 2;
    var ox = b.minX - pad;
    var oy = b.minY - pad;
    var W = Math.ceil((b.maxX - b.minX + 2 * pad) / cell) + 1;
    var H = Math.ceil((b.maxY - b.minY + 2 * pad) / cell) + 1;
    var grid = new Uint8Array(W * H);

    fillInterior(grid, W, H, rot, ox, oy, cell, fillHoles);

    // แถบรอบขอบ: ช่องที่จุดกลางห่างจากเส้นขอบไม่เกิน T
    for (var r = 0; r < rot.length; r++) {
      var ring = rot[r];
      for (var e = 0; e < ring.length; e++) {
        var a = ring[e];
        var c = ring[(e + 1) % ring.length];
        var len = Math.sqrt((c[0] - a[0]) * (c[0] - a[0]) + (c[1] - a[1]) * (c[1] - a[1]));
        var pieces = Math.max(1, Math.ceil(len / cell));
        for (var k = 0; k < pieces; k++) {
          var t0 = k / pieces;
          var t1 = (k + 1) / pieces;
          var px = a[0] + (c[0] - a[0]) * t0;
          var py = a[1] + (c[1] - a[1]) * t0;
          var qx = a[0] + (c[0] - a[0]) * t1;
          var qy = a[1] + (c[1] - a[1]) * t1;
          var i0 = Math.max(0, Math.ceil((Math.min(px, qx) - T - ox) / cell - 0.5));
          var i1 = Math.min(W - 1, Math.floor((Math.max(px, qx) + T - ox) / cell - 0.5));
          var j0 = Math.max(0, Math.ceil((Math.min(py, qy) - T - oy) / cell - 0.5));
          var j1 = Math.min(H - 1, Math.floor((Math.max(py, qy) + T - oy) / cell - 0.5));
          for (var j = j0; j <= j1; j++) {
            var cy = oy + (j + 0.5) * cell;
            var rowOff = j * W;
            for (var i = i0; i <= i1; i++) {
              if (grid[rowOff + i]) continue;
              var cx = ox + (i + 0.5) * cell;
              var d2 = G.segBoxDist2(px, py, qx, qy, cx - half, cy - half, cx + half, cy + half);
              if (d2 < pad2 || (pad === 0 && d2 === 0)) grid[rowOff + i] = 1;
            }
          }
        }
      }
    }

    // ตัดขอบว่าง
    var minI = W;
    var maxI = -1;
    var minJ = H;
    var maxJ = -1;
    for (var jj = 0; jj < H; jj++) {
      for (var ii = 0; ii < W; ii++) {
        if (grid[jj * W + ii]) {
          if (ii < minI) minI = ii;
          if (ii > maxI) maxI = ii;
          if (jj < minJ) minJ = jj;
          if (jj > maxJ) maxJ = jj;
        }
      }
    }
    if (maxI < 0) return null;

    var w = maxI - minI + 1;
    var h = maxJ - minJ + 1;
    var rows = new Array(h);
    var cells = 0;
    var key = w + 'x' + h;
    for (var y = 0; y < h; y++) {
      var runs = [];
      var off = (y + minJ) * W + minI;
      var start = -1;
      for (var x = 0; x <= w; x++) {
        var on = x < w && grid[off + x];
        if (on && start < 0) start = x;
        else if (!on && start >= 0) {
          runs.push(start, x - 1);
          cells += x - start;
          start = -1;
        }
      }
      rows[y] = new Int32Array(runs);
      key += '|' + runs.join(',');
    }
    return {
      w: w,
      h: h,
      ox: ox + minI * cell,
      oy: oy + minJ * cell,
      rows: rows,
      cells: cells,
      key: key,
      angle: angle,
      bbox: b,
    };
  }

  function fillInterior(grid, W, H, rings, ox, oy, cell, fillHoles) {
    var groups = fillHoles
      ? rings.map(function (r) {
          return [r];
        })
      : [rings];
    for (var j = 0; j < H; j++) {
      var yc = oy + (j + 0.5) * cell;
      for (var g = 0; g < groups.length; g++) {
        var xs = [];
        var group = groups[g];
        for (var r = 0; r < group.length; r++) {
          var ring = group[r];
          for (var i = 0, n = ring.length; i < n; i++) {
            var p = ring[i];
            var q = ring[(i + 1) % n];
            if (p[1] <= yc !== q[1] <= yc) {
              xs.push(p[0] + ((yc - p[1]) * (q[0] - p[0])) / (q[1] - p[1]));
            }
          }
        }
        if (xs.length < 2) continue;
        xs.sort(function (a, b) {
          return a - b;
        });
        for (var k = 0; k + 1 < xs.length; k += 2) {
          var i0 = Math.max(0, Math.ceil((xs[k] - ox) / cell - 0.5));
          var i1 = Math.min(W - 1, Math.floor((xs[k + 1] - ox) / cell - 0.5));
          for (var c = i0; c <= i1; c++) grid[j * W + c] = 1;
        }
      }
    }
  }

  // ---------- ตารางของแผ่น ----------
  // เก็บต่อแถว: prev[i] = ช่องเต็มตัวขวาสุดที่ ≤ i (หรือ -1) → เช็กชนได้ทีละช่วงใน O(1)
  // และกระโดดข้ามช่วงที่เต็มได้ทันที

  function Grid(cols, maxRows) {
    this.cols = cols;
    this.maxRows = maxRows;
    this.rows = [];
    this.free = [];
    this.firstOpen = 0; // แถวแรกที่ยังมีช่องว่าง
    this.usedRows = 0;
    this.resume = {};
    this.placements = [];
    this.RowType = cols < 32767 ? Int16Array : Int32Array;
  }

  Grid.prototype.row = function (y) {
    var r = this.rows[y];
    if (!r) {
      r = new this.RowType(this.cols);
      r.fill(-1);
      this.rows[y] = r;
      this.free[y] = this.cols;
    }
    return r;
  };

  Grid.prototype.fill = function (y, a, b) {
    if (y < 0 || (isFinite(this.maxRows) && y >= this.maxRows)) return;
    if (a < 0) a = 0;
    if (b >= this.cols) b = this.cols - 1;
    if (a > b) return;
    var r = this.row(y);
    var added = 0;
    for (var i = a; i <= b; i++) {
      if (r[i] !== i) {
        r[i] = i;
        added++;
      }
    }
    for (var k = b + 1; k < this.cols && r[k] < b; k++) r[k] = b;
    this.free[y] -= added;
    if (y + 1 > this.usedRows) this.usedRows = y + 1;
    while (this.free[this.firstOpen] === 0) this.firstOpen++;
  };

  Grid.prototype.occupy = function (mask, gx, gy) {
    for (var r = 0; r < mask.h; r++) {
      var runs = mask.rows[r];
      for (var k = 0; k < runs.length; k += 2) this.fill(gy + r, gx + runs[k], gx + runs[k + 1]);
    }
  };

  // หาตำแหน่งแรก (เรียงตาม y แล้ว x) ที่วาง mask ได้ เริ่มค้นจาก (sy, sx)
  Grid.prototype.find = function (mask, sy, sx) {
    var maxX = this.cols - mask.w;
    var maxY = this.maxRows - mask.h;
    if (maxX < 0 || maxY < 0) return null;
    var y = sy;
    var x = sx;
    if (y < this.firstOpen) {
      y = this.firstOpen;
      x = 0;
    }
    var rows = this.rows;
    var mrows = mask.rows;
    var mh = mask.h;
    for (; y <= maxY; y++, x = 0) {
      if (y >= rows.length) return { x: x, y: y };
      while (x <= maxX) {
        var jump = -1;
        for (var r = 0; r < mh; r++) {
          var row = rows[y + r];
          if (!row) continue;
          var runs = mrows[r];
          for (var k = 0; k < runs.length; k += 2) {
            var p = row[x + runs[k + 1]];
            if (p >= x + runs[k]) {
              jump = p - runs[k] + 1;
              break;
            }
          }
          if (jump >= 0) break;
        }
        if (jump < 0) return { x: x, y: y };
        x = jump;
      }
    }
    return null;
  };

  // วาง mask ที่ (x, y) ได้ไหม (ไม่ทับช่องที่เต็มแล้ว)
  Grid.prototype.fits = function (mask, x, y) {
    if (x < 0 || y < 0 || x + mask.w > this.cols || y + mask.h > this.maxRows) return false;
    for (var r = 0; r < mask.h; r++) {
      var row = this.rows[y + r];
      if (!row) continue;
      var runs = mask.rows[r];
      for (var k = 0; k < runs.length; k += 2) {
        if (row[x + runs[k + 1]] >= x + runs[k]) return false;
      }
    }
    return true;
  };

  function makeGrid(geo) {
    var g = new Grid(geo.cols, geo.maxRows);
    for (var i = 0; i < geo.obstacleCells.length; i++) {
      var oc = geo.obstacleCells[i];
      for (var y = oc.y0; y <= oc.y1; y++) g.fill(y, oc.x0, oc.x1);
    }
    return g;
  }

  // ---------- เตรียมชิ้นงาน ----------

  function cleanRings(rings) {
    var out = [];
    for (var i = 0; i < (rings || []).length; i++) {
      var r = G.dedupe(rings[i] || []);
      if (r.length >= 3 && Math.abs(G.signedArea(r)) > 1e-9) out.push(r);
    }
    return out;
  }

  // พื้นที่เนื้อจริง: วงที่อยู่ในวงอื่นเป็นจำนวนคี่ = รู
  function materialArea(rings, fillHoles) {
    var total = 0;
    for (var i = 0; i < rings.length; i++) {
      var depth = 0;
      for (var j = 0; j < rings.length; j++) {
        if (i !== j && G.pointInRing(rings[i][0], rings[j])) depth++;
      }
      var a = Math.abs(G.signedArea(rings[i]));
      if (depth % 2 === 0) total += a;
      else if (!fillHoles) total -= a;
    }
    return Math.max(0, total);
  }

  function prepareShapes(parts, o) {
    var pad = o.spacing / 2;
    return parts.map(function (p, index) {
      var rings = cleanRings(p.rings);
      var rots = p.rotations && p.rotations.length ? p.rotations : o.rotations;
      var extra = Math.max(0, p.bleed || 0);
      var masks = [];
      var seen = {};
      if (rings.length) {
        for (var i = 0; i < rots.length; i++) {
          var m = rasterize(rings, rots[i], o.cellSize, pad + extra, o.fillHoles);
          if (!m || seen[m.key]) continue;
          seen[m.key] = 1;
          m.key = null; // ไม่ต้องเก็บสตริงยาว ๆ ไว้
          masks.push(m);
        }
      }
      var b = rings.length ? G.bounds(rings) : { minX: 0, minY: 0, maxX: 0, maxY: 0 };
      return {
        index: index,
        id: p.id != null ? p.id : index,
        rings: rings,
        quantity: Math.max(0, Math.floor(p.quantity == null ? 1 : p.quantity)),
        masks: masks,
        area: materialArea(rings, o.fillHoles),
        w: b.maxX - b.minX,
        h: b.maxY - b.minY,
        bleed: extra,
      };
    });
  }

  // ---------- ลำดับการวาง ----------

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function buildOrders(shapes, count, seed) {
    var ids = shapes
      .filter(function (s) {
        return s.quantity > 0 && s.masks.length;
      })
      .map(function (s) {
        return s.index;
      });
    function by(fn) {
      return ids.slice().sort(function (a, b) {
        return fn(shapes[b]) - fn(shapes[a]) || a - b;
      });
    }
    var orders = [
      by(function (s) {
        return s.area;
      }),
      by(function (s) {
        return Math.max(s.w, s.h);
      }),
      by(function (s) {
        return s.w * s.h;
      }),
      by(function (s) {
        return s.h;
      }),
      by(function (s) {
        return s.w;
      }),
    ];
    var rand = mulberry32(seed || 1);
    var base = orders[0];
    var tries = 0;
    while (uniqueCount(orders) < count && tries++ < count * 4) {
      // สลับเพื่อนบ้านแบบสุ่ม — ยังคงชิ้นใหญ่ไว้ต้น ๆ แต่เปิดโอกาสให้เจอลำดับที่แน่นกว่า
      var o = base.slice();
      for (var i = 0; i < o.length - 1; i++) {
        if (rand() < 0.35) {
          var j = Math.min(o.length - 1, i + 1 + Math.floor(rand() * 3));
          var t = o[i];
          o[i] = o[j];
          o[j] = t;
        }
      }
      orders.push(o);
    }
    return unique(orders).slice(0, Math.max(1, count));
  }

  // ลำดับซ้ำไม่ต้องรันซ้ำ
  function unique(orders) {
    var seen = {};
    return orders.filter(function (o) {
      var k = o.join(',');
      if (seen[k]) return false;
      seen[k] = 1;
      return true;
    });
  }

  function uniqueCount(orders) {
    return unique(orders).length;
  }

  // ---------- วางหนึ่งรอบตามลำดับที่กำหนด ----------

  function runOnce(order, shapes, geo, o) {
    var sheets = [];
    var unplaced = [];
    var placedCount = 0;

    function newSheet() {
      var g = makeGrid(geo);
      sheets.push(g);
      return g;
    }

    function tryPlace(g, shape) {
      var best = null;
      for (var k = 0; k < shape.masks.length; k++) {
        var m = shape.masks[k];
        var key = shape.index + ':' + k;
        var start = g.resume[key] || { y: 0, x: 0 };
        if (start.y === Infinity) continue;
        var pos = g.find(m, start.y, start.x);
        if (!pos) {
          g.resume[key] = { y: Infinity, x: 0 };
          continue;
        }
        g.resume[key] = pos;
        var bottom = pos.y + m.h;
        if (
          !best ||
          bottom < best.bottom ||
          (bottom === best.bottom && (pos.x < best.x || (pos.x === best.x && pos.y < best.y)))
        ) {
          best = { k: k, x: pos.x, y: pos.y, bottom: bottom };
        }
      }
      if (!best) return false;
      var mask = shape.masks[best.k];
      g.occupy(mask, best.x, best.y);
      g.placements.push({ shape: shape.index, mask: best.k, gx: best.x, gy: best.y });
      return true;
    }

    for (var oi = 0; oi < order.length; oi++) {
      var shape = shapes[order[oi]];
      var fitsEmpty = shape.masks.some(function (m) {
        return m.w <= geo.cols && m.h <= geo.maxRows;
      });
      for (var c = 0; c < shape.quantity; c++) {
        var done = false;
        if (fitsEmpty) {
          for (var s = 0; s < sheets.length && !done; s++) done = tryPlace(sheets[s], shape);
          if (!done && sheets.length < o.maxSheets) {
            done = tryPlace(newSheet(), shape);
            if (!done) sheets.pop(); // แผ่นเปล่ายังวางไม่ได้ (ติดมาร์ก/หัวงาน) — ไม่ต้องเก็บแผ่นว่างไว้
          }
        }
        if (!done) {
          unplaced.push({ index: shape.index, id: shape.id, count: shape.quantity - c });
          break;
        }
        placedCount++;
      }
    }
    return { sheets: sheets, unplaced: unplaced, placedCount: placedCount };
  }

  function unplacedTotal(r) {
    return r.unplaced.reduce(function (s, u) {
      return s + u.count;
    }, 0);
  }

  function better(a, b) {
    if (!b) return true;
    var ua = unplacedTotal(a);
    var ub = unplacedTotal(b);
    if (ua !== ub) return ua < ub;
    if (a.sheets.length !== b.sheets.length) return a.sheets.length < b.sheets.length;
    var la = a.sheets.length ? a.sheets[a.sheets.length - 1].usedRows : 0;
    var lb = b.sheets.length ? b.sheets[b.sheets.length - 1].usedRows : 0;
    return la < lb;
  }

  // ---------- API ----------

  function normalizeOptions(opts) {
    var o = {};
    for (var k in DEFAULTS) o[k] = DEFAULTS[k];
    for (var j in opts || {}) if (opts[j] != null) o[j] = opts[j];
    if (typeof o.rotations === 'string') o.rotations = ROTATION_SETS[o.rotations] || [0];
    if (!(o.cellSize > 0)) o.cellSize = DEFAULTS.cellSize;
    if (!(o.spacing >= 0)) o.spacing = 0;
    return o;
  }

  // พื้นที่วางบนแผ่น → ตารางช่อง
  // plan.area = { x, y, w, h } (h = Infinity สำหรับม้วนไม่จำกัด), plan.obstacles = [{x,y,w,h}]
  function sheetGeometry(plan, o) {
    var pad = o.spacing / 2;
    var cell = o.cellSize;
    var x0 = plan.area.x - pad;
    var y0 = plan.area.y - pad;
    var cols = Math.floor((plan.area.w + 2 * pad) / cell);
    var maxRows = isFinite(plan.area.h) ? Math.floor((plan.area.h + 2 * pad) / cell) : Infinity;
    var obstacleCells = (plan.obstacles || []).map(function (r) {
      return {
        x0: Math.floor((r.x - x0) / cell),
        x1: Math.ceil((r.x + r.w - x0) / cell) - 1,
        y0: Math.max(0, Math.floor((r.y - y0) / cell)),
        y1: Math.ceil((r.y + r.h - y0) / cell) - 1,
      };
    });
    return { x0: x0, y0: y0, cols: cols, maxRows: maxRows, cell: cell, obstacleCells: obstacleCells };
  }

  function finalize(run, shapes, geo, o, meta) {
    var sheets = run.sheets.map(function (g, si) {
      var maxY = -Infinity;
      var area = 0;
      var placements = g.placements.map(function (pl) {
        var shape = shapes[pl.shape];
        var m = pl.m || shape.masks[pl.mask];
        var tx = geo.x0 + pl.gx * geo.cell - m.ox;
        var ty = geo.y0 + pl.gy * geo.cell - m.oy;
        var bb = {
          minX: m.bbox.minX + tx - shape.bleed,
          minY: m.bbox.minY + ty - shape.bleed,
          maxX: m.bbox.maxX + tx + shape.bleed,
          maxY: m.bbox.maxY + ty + shape.bleed,
        };
        if (bb.maxY > maxY) maxY = bb.maxY;
        area += shape.area;
        return {
          partIndex: shape.index,
          partId: shape.id,
          angle: m.angle,
          tx: tx,
          ty: ty,
          bbox: bb,
        };
      });
      return { index: si, placements: placements, contentMaxY: placements.length ? maxY : null, partsArea: area };
    });
    var unplaced = run.unplaced.slice();
    shapes.forEach(function (sh) {
      // ชิ้นที่ไม่มีรูปทรงให้วาง (เส้นว่าง/พื้นที่ศูนย์)
      if (sh.quantity > 0 && !sh.masks.length) unplaced.push({ index: sh.index, id: sh.id, count: sh.quantity });
    });
    return {
      sheets: sheets,
      unplaced: unplaced,
      placedCount: run.placedCount,
      totalCount: shapes.reduce(function (s, sh) {
        return s + sh.quantity;
      }, 0),
      options: { spacing: o.spacing, cellSize: o.cellSize, fillHoles: o.fillHoles },
      stats: meta,
    };
  }

  function now() {
    return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
  }

  // ตัวจัดวางแบบทีละรอบ: next() รันลำดับถัดไปหนึ่งรอบ คืน false เมื่อหมด/หมดเวลา
  function createNester(parts, plan, opts) {
    var o = normalizeOptions(opts);
    var t0 = now();
    var shapes = prepareShapes(parts, o);
    var geo = sheetGeometry(plan, o);
    var orders = buildOrders(shapes, Math.max(1, o.iterations), o.seed);
    var best = null;
    var bestOrder = -1;
    var i = 0;
    return {
      total: orders.length,
      done: function () {
        return i >= orders.length || (best && now() - t0 > o.timeLimitMs);
      },
      next: function () {
        if (this.done()) return false;
        var run = runOnce(orders[i], shapes, geo, o);
        if (better(run, best)) {
          best = run;
          bestOrder = i;
        }
        i++;
        return true;
      },
      progress: function () {
        return orders.length ? i / orders.length : 1;
      },
      result: function () {
        if (!best) best = runOnce([], shapes, geo, o);
        return finalize(best, shapes, geo, o, {
          iterations: i,
          bestOrder: bestOrder,
          timeMs: Math.round(now() - t0),
          cellSize: o.cellSize,
        });
      },
    };
  }

  function nest(parts, plan, opts) {
    var n = createNester(parts, plan, opts);
    while (n.next()) {
      /* รันจนครบหรือหมดเวลา */
    }
    return n.result();
  }

  // เวอร์ชันไม่บล็อกหน้าจอ: พักระหว่างรอบให้ UI วาด progress ได้
  function nestAsync(parts, plan, opts, onProgress) {
    return new Promise(function (resolve, reject) {
      var n;
      try {
        n = createNester(parts, plan, opts);
      } catch (e) {
        reject(e);
        return;
      }
      function step() {
        try {
          if (n.next()) {
            if (onProgress) onProgress(n.progress());
            setTimeout(step, 0);
          } else {
            resolve(n.result());
          }
        } catch (e) {
          reject(e);
        }
      }
      setTimeout(step, 0);
    });
  }

  // ---------- เต็มแผ่น: ดวงเดียวกันให้ได้จำนวนมากที่สุด ----------
  // ลองวางเป็นแถวซ้ำ ๆ (lattice): แถวคี่เลื่อนเยื้องได้และกลับหัว 180° ได้ — วงกลมจะได้แบบรังผึ้ง
  // สามเหลี่ยมได้แบบสลับหัวท้าย แล้วเทียบกับการวางทีละดวงแบบปกติ เอาแบบที่ได้ดวงมากกว่า

  // B วางที่ (dx, dy) เทียบกับ A ทับกันไหม
  function collide(A, B, dx, dy) {
    var r0 = Math.max(0, dy);
    var r1 = Math.min(A.h, dy + B.h);
    for (var y = r0; y < r1; y++) {
      var ra = A.rows[y];
      var rb = B.rows[y - dy];
      var i = 0;
      var j = 0;
      while (i < ra.length && j < rb.length) {
        if (ra[i + 1] < rb[j] + dx) i += 2;
        else if (rb[j + 1] + dx < ra[i]) j += 2;
        else return true;
      }
    }
    return false;
  }

  function pitchOf(m) {
    for (var px = 1; px < m.w; px++) {
      var ok = true;
      for (var k = 1; k * px < m.w && ok; k++) if (collide(m, m, k * px, 0)) ok = false;
      if (ok) return px;
    }
    return m.w;
  }

  function rowsOk(ma, mb, px, s, dy) {
    var K = Math.ceil(Math.max(ma.w, mb.w) / px) + 1;
    for (var k = -K; k <= K; k++) {
      if (collide(ma, mb, s + k * px, dy)) return false; // แถวคู่ → แถวคี่ถัดลงมา
      if (collide(mb, ma, k * px - s, dy)) return false; // แถวคี่ → แถวคู่ถัดลงมา
      if (collide(ma, ma, k * px, 2 * dy)) return false;
      if (collide(mb, mb, k * px, 2 * dy)) return false;
    }
    return true;
  }

  function latticeFor(ma, mb, grid) {
    var px = Math.max(pitchOf(ma), pitchOf(mb));
    var best = null;
    var step = Math.max(1, Math.floor(px / 24));
    for (var s = 0; s < px; s += step) {
      var dy = 1;
      var limit = ma.h + mb.h;
      while (dy <= limit && !rowsOk(ma, mb, px, s, dy)) dy++;
      if (dy > limit) continue;
      var list = [];
      var bottom = 0;
      for (var i = 0; ; i++) {
        var m = i % 2 ? mb : ma;
        var y = i * dy;
        if (y + m.h > grid.maxRows) break;
        for (var x = i % 2 ? s : 0; x + m.w <= grid.cols; x += px) {
          if (grid.fits(m, x, y)) {
            list.push({ shape: 0, m: m, gx: x, gy: y });
            if (y + m.h > bottom) bottom = y + m.h;
          }
        }
        if (!isFinite(grid.maxRows) && i > 100000) break;
      }
      if (!best || list.length > best.list.length || (list.length === best.list.length && bottom < best.bottom)) {
        best = { list: list, bottom: bottom, pitch: px, shift: s, rowPitch: dy };
      }
    }
    return best;
  }

  // part = { rings, rotations?, bleed? } — คืนผลรูปแบบเดียวกับ nest() หนึ่งแผ่น
  function fillSheet(part, plan, opts) {
    var o = normalizeOptions(opts);
    var t0 = now();
    var geo = sheetGeometry(plan, o);
    if (!isFinite(geo.maxRows)) throw new Error('fillSheet: ต้องรู้ความยาวแผ่น');
    var shape = prepareShapes([{ id: part.id, rings: part.rings, rotations: part.rotations, bleed: part.bleed, quantity: 0 }], o)[0];
    var rots = part.rotations && part.rotations.length ? part.rotations : o.rotations;
    var pad = o.spacing / 2 + shape.bleed;
    var cache = {};
    function maskAt(a) {
      a = ((a % 360) + 360) % 360;
      if (!(a in cache)) cache[a] = shape.rings.length ? rasterize(shape.rings, a, o.cellSize, pad, o.fillHoles) : null;
      return cache[a];
    }
    var grid = makeGrid(geo);
    var best = null;
    rots.forEach(function (a) {
      var pairs = [[a, a]];
      if (rots.indexOf((a + 180) % 360) >= 0 && (a + 180) % 360 !== a) pairs.push([a, (a + 180) % 360]);
      pairs.forEach(function (pr) {
        var ma = maskAt(pr[0]);
        var mb = maskAt(pr[1]);
        if (!ma || !mb) return;
        var c = latticeFor(ma, mb, grid);
        if (c && (!best || c.list.length > best.list.length || (c.list.length === best.list.length && c.bottom < best.bottom))) best = c;
      });
    });

    // เทียบกับการวางทีละดวง (บางรูปทรงแบบไม่เป็นแถวได้มากกว่า)
    var first = maskAt(rots[0]);
    var cap = first ? Math.ceil(((geo.cols * geo.maxRows) / Math.max(1, first.cells)) * 1.3) + 4 : 0;
    var blf = cap
      ? nest([{ id: part.id, rings: part.rings, rotations: part.rotations, bleed: part.bleed, quantity: cap }], plan, {
          spacing: o.spacing,
          cellSize: o.cellSize,
          rotations: o.rotations,
          fillHoles: o.fillHoles,
          iterations: 1,
          maxSheets: 1,
        })
      : null;
    var latticeCount = best ? best.list.length : 0;
    var meta = { method: 'lattice', timeMs: 0, cellSize: o.cellSize };
    var out;
    if (blf && blf.placedCount > latticeCount) {
      out = blf;
      out.unplaced = [];
      out.totalCount = blf.placedCount;
      meta.method = 'blf';
    } else {
      grid.placements = best ? best.list : [];
      shape.quantity = grid.placements.length;
      out = finalize({ sheets: [grid], unplaced: [], placedCount: grid.placements.length }, [shape], geo, o, meta);
      if (best) meta.lattice = { pitch: best.pitch * o.cellSize, shift: best.shift * o.cellSize, rowPitch: best.rowPitch * o.cellSize };
    }
    meta.timeMs = Math.round(now() - t0);
    out.stats = meta;
    return out;
  }

  return {
    ROTATION_SETS: ROTATION_SETS,
    fillSheet: fillSheet,
    DEFAULTS: DEFAULTS,
    rasterize: rasterize,
    materialArea: materialArea,
    createNester: createNester,
    nest: nest,
    nestAsync: nestAsync,
  };
});
