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
  function typicalHeight(hs) {
    if (!hs.length) return 0;
    var s = hs.slice().sort(function (x, y) {
      return x - y;
    });
    return s[Math.min(s.length - 1, Math.floor(s.length * 0.7))];
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

    // ความสูงตัวอักษรทั่วไป = เปอร์เซ็นไทล์ 70 ของความสูงแต่ละชิ้น (รูในตัว สระ วรรณยุกต์ จุด เล็กกว่า — ไม่ดึงค่าลง)
    var heights = boxes.map(function (q) {
      return q.maxY - q.minY;
    });
    var typical = typicalHeight(heights);
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

  /* ---------- อ่านจากรูป: แยกสีหมึก (สติ๊กเกอร์ตัดได้ทีละสี) ----------
   * data = ImageData ({ width, height, data RGBA }) · mask = ผลของ contour.backgroundMask (alpha 0 = พื้นหลัง, bg = สีพื้น | null)
   * → [{ rgb: [r, g, b], share: สัดส่วนของพิกเซลหมึก }] เรียงจากมากไปน้อย (ตัดสีขอบภาพ/สีกลาง ๆ ที่เกิดจากขอบเบลอทิ้ง) */
  function dist3(a, b) {
    var dr = a[0] - b[0];
    var dg = a[1] - b[1];
    var db = a[2] - b[2];
    return Math.sqrt(dr * dr + dg * dg + db * db);
  }
  function inkColors(data, mask, opts) {
    var o = opts || {};
    var maxK = Math.max(1, o.max || 6);
    var d = data.data;
    var n = data.width * data.height;
    var a = mask.alpha;
    var bg = mask.bg ? [mask.bg.r, mask.bg.g, mask.bg.b] : null;
    // เอาเฉพาะ “เนื้อใน” ตัวอักษร (รอบตัวเป็นหมึกหมด) — ขอบที่เบลอเป็นสีกลางระหว่างหมึกกับพื้น ถ้านับด้วยจะได้สีเพี้ยน/สีเกินมา
    var W = data.width;
    var sample = [];
    var step = Math.max(1, Math.floor(n / 80000));
    for (var i = W + 1; i < n - W - 1; i += step) {
      if (a[i] < 128 || a[i - 1] < 128 || a[i + 1] < 128 || a[i - W] < 128 || a[i + W] < 128) continue;
      var c = [d[i * 4], d[i * 4 + 1], d[i * 4 + 2]];
      if (bg && dist3(c, bg) < 70) continue;
      if (!bg && d[i * 4 + 3] < 250) continue;
      sample.push(c);
    }
    if (!sample.length) return [];
    // k-means: เริ่มจากจุดที่ห่างกันที่สุด
    var centers = [sample[0]];
    while (centers.length < maxK) {
      var best = -1;
      var far = 0;
      for (var s = 0; s < sample.length; s += 7) {
        var m = Infinity;
        for (var q = 0; q < centers.length; q++) m = Math.min(m, dist3(sample[s], centers[q]));
        if (m > far) {
          far = m;
          best = s;
        }
      }
      if (best < 0 || far < 30) break;
      centers.push(sample[best]);
    }
    var lab = new Int32Array(sample.length);
    for (var it = 0; it < 10; it++) {
      var sum = centers.map(function () {
        return [0, 0, 0, 0];
      });
      for (var s2 = 0; s2 < sample.length; s2++) {
        var bi = 0;
        var bd = Infinity;
        for (var c2 = 0; c2 < centers.length; c2++) {
          var dd = dist3(sample[s2], centers[c2]);
          if (dd < bd) {
            bd = dd;
            bi = c2;
          }
        }
        lab[s2] = bi;
        var u = sum[bi];
        u[0] += sample[s2][0];
        u[1] += sample[s2][1];
        u[2] += sample[s2][2];
        u[3]++;
      }
      centers = centers.map(function (cc, k) {
        var u = sum[k];
        return u[3] ? [u[0] / u[3], u[1] / u[3], u[2] / u[3]] : cc;
      });
    }
    var groups = centers.map(function (cc, k) {
      var cnt = 0;
      for (var s3 = 0; s3 < lab.length; s3++) if (lab[s3] === k) cnt++;
      return { rgb: cc, count: cnt };
    });
    // รวมสีที่ใกล้กันมาก (เฉดเดียวกัน)
    groups.sort(function (x, y) {
      return y.count - x.count;
    });
    var out = [];
    groups.forEach(function (g) {
      var near = null;
      out.forEach(function (h) {
        if (!near && dist3(h.rgb, g.rgb) < 28) near = h;
      });
      if (near) near.count += g.count;
      else out.push({ rgb: g.rgb, count: g.count });
    });
    // สีจาง = หมึกเดิมที่บางจนไม่ทึบเต็ม (เส้นบาง ขอบตัวอักษร) อยู่บนเส้น “สีพื้น → หมึกเข้ม” → รวมเข้ากับหมึกเข้มนั้น
    // (ไม่งั้นตัวหนังสือสีเดียวจะถูกแบ่งไปอยู่หลายไฟล์)
    if (bg) {
      out.sort(function (x, y) {
        return dist3(y.rgb, bg) - dist3(x.rgb, bg);
      });
      var kept = [];
      out.forEach(function (g) {
        var host = null;
        kept.forEach(function (h) {
          if (host) return;
          var v = [h.rgb[0] - bg[0], h.rgb[1] - bg[1], h.rgb[2] - bg[2]];
          var w = [g.rgb[0] - bg[0], g.rgb[1] - bg[1], g.rgb[2] - bg[2]];
          var len2 = v[0] * v[0] + v[1] * v[1] + v[2] * v[2];
          var tt = (w[0] * v[0] + w[1] * v[1] + w[2] * v[2]) / Math.max(1, len2);
          if (tt <= 0.15 || tt >= 0.98) return;
          var res = dist3(w, [v[0] * tt, v[1] * tt, v[2] * tt]);
          if (res < 22) host = h;
        });
        if (host) host.count += g.count;
        else kept.push({ rgb: g.rgb, count: g.count });
      });
      out = kept;
    }
    // ทิ้งสีที่มีน้อยกว่า 2% (มักเป็นสีกลางที่ขอบตัวอักษร)
    var total = sample.length;
    out = out.filter(function (g) {
      return g.count / total >= 0.02;
    });
    out.sort(function (x, y) {
      return y.count - x.count;
    });
    return out.map(function (g) {
      return { rgb: g.rgb.map(Math.round), share: g.count / total };
    });
  }

  /* ความทึบของสีหนึ่ง (idx) ทั้งภาพ — ขอบตัวอักษรเป็นสีผสมระหว่างพื้นกับหมึก จึงวัดบน “เส้นสีพื้น → สีหมึก”:
   * พิกเซลเป็นของหมึกสีที่อยู่บนเส้นของมันใกล้ที่สุด · ความทึบ = ไปทางหมึกได้แค่ไหน (0–1)
   * (ถ้าวัดแค่สีใกล้สุด ขอบตัวหนังสือสีเทาจะกลายเป็นของสีทอง) · ขอบนุ่ม → หาขอบได้ละเอียดกว่าพิกเซล
   * ส่งให้ contour.traceAlpha ได้เลย */
  function colorAlpha(data, mask, colors, idx) {
    var d = data.data;
    var n = data.width * data.height;
    var a = mask.alpha;
    var out = new Uint8Array(n);
    if (!mask.bg) {
      // พื้นใส: ความทึบตามรูป · สีตามสีหมึกที่ใกล้สุด
      for (var j = 0; j < n; j++) {
        if (a[j] < 1) continue;
        var cj = [d[j * 4], d[j * 4 + 1], d[j * 4 + 2]];
        var bj = 0;
        var dj = Infinity;
        for (var q = 0; q < colors.length; q++) {
          var e = dist3(cj, colors[q].rgb);
          if (e < dj) {
            dj = e;
            bj = q;
          }
        }
        if (bj === idx) out[j] = a[j];
      }
      return { width: data.width, height: data.height, alpha: out };
    }
    var bg = [mask.bg.r, mask.bg.g, mask.bg.b];
    var dirs = colors.map(function (c) {
      var v = [c.rgb[0] - bg[0], c.rgb[1] - bg[1], c.rgb[2] - bg[2]];
      return { v: v, len2: Math.max(1, v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) };
    });
    for (var i = 0; i < n; i++) {
      if (a[i] < 1) continue;
      var px = d[i * 4] - bg[0];
      var py = d[i * 4 + 1] - bg[1];
      var pz = d[i * 4 + 2] - bg[2];
      var bi = -1;
      var best = Infinity;
      var bt = 0;
      for (var k = 0; k < dirs.length; k++) {
        var v = dirs[k].v;
        var tt = (px * v[0] + py * v[1] + pz * v[2]) / dirs[k].len2;
        if (tt <= 0) continue;
        var tc = Math.min(1, tt);
        var rx = px - tc * v[0];
        var ry = py - tc * v[1];
        var rz = pz - tc * v[2];
        var res = rx * rx + ry * ry + rz * rz;
        if (res < best) {
          best = res;
          bi = k;
          bt = tc;
        }
      }
      if (bi === idx) out[i] = Math.round(255 * bt);
    }
    return { width: data.width, height: data.height, alpha: out };
  }

  /* กรอบ/เส้นตรงยาวที่ติดมากับรูป (กรอบป้าย เส้นคั่น) ไม่ใช่ตัวหนังสือ:
   * วงที่เกือบเป็นสี่เหลี่ยมพอดีกรอบ (พื้นที่ ≥ 93% ของกล่อง) และยาวเกิน 4 เท่าของความสูงตัวอักษร → ดัชนีที่ควรตัดทิ้ง */
  function areaOf(ring) {
    var s = 0;
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) s += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
    return Math.abs(s / 2);
  }
  function frameIndex(rings, typical) {
    var out = [];
    (rings || []).forEach(function (r, i) {
      var b = boxOf(r);
      var w = b.maxX - b.minX;
      var h = b.maxY - b.minY;
      if (!(w > 0 && h > 0)) return;
      if (Math.max(w, h) < typical * 4) return;
      if (areaOf(r) >= 0.93 * w * h) out.push(i);
    });
    return out;
  }
  function ringHeights(rings) {
    return (rings || []).map(function (r) {
      var b = boxOf(r);
      return b.maxY - b.minY;
    });
  }

  function hex(rgb) {
    return (
      '#' +
      rgb
        .map(function (v) {
          var s = Math.max(0, Math.min(255, Math.round(v))).toString(16);
          return s.length < 2 ? '0' + s : s;
        })
        .join('')
    );
  }

  // ชื่อสีภาษาไทยคร่าว ๆ (ไว้ตั้งชื่อเลเยอร์/ไฟล์ให้ร้านรู้ว่าใช้สติ๊กเกอร์สีอะไร)
  function colorName(rgb) {
    var r = rgb[0] / 255;
    var g = rgb[1] / 255;
    var b = rgb[2] / 255;
    var mx = Math.max(r, g, b);
    var mn = Math.min(r, g, b);
    var l = (mx + mn) / 2;
    var s = mx === mn ? 0 : l > 0.5 ? (mx - mn) / (2 - mx - mn) : (mx - mn) / (mx + mn);
    if (s < 0.15) return l < 0.25 ? 'ดำ' : l > 0.85 ? 'ขาว' : 'เทา';
    var h;
    if (mx === r) h = ((g - b) / (mx - mn)) * 60;
    else if (mx === g) h = (2 + (b - r) / (mx - mn)) * 60;
    else h = (4 + (r - g) / (mx - mn)) * 60;
    if (h < 0) h += 360;
    if (h < 15 || h >= 340) return l < 0.35 ? 'แดงเข้ม' : 'แดง';
    if (h >= 25 && h < 65 && s < 0.65 && l >= 0.3) return 'ทอง';
    if (h < 45) return l < 0.45 ? 'น้ำตาล' : 'ส้ม';
    if (h < 65) return s < 0.6 || l < 0.5 ? 'ทอง' : 'เหลือง';
    if (h < 170) return l < 0.35 ? 'เขียวเข้ม' : 'เขียว';
    if (h < 200) return 'ฟ้า';
    if (h < 255) return l < 0.35 ? 'น้ำเงิน' : 'ฟ้า';
    if (h < 290) return 'ม่วง';
    return 'ชมพู';
  }

  // วงหลายเหลี่ยม (pt) → ตัวเลขทศนิยม 2 ตำแหน่ง (ส่งให้ Illustrator เบาลง)
  function roundPoly(ring) {
    return ring.map(function (q) {
      return [Math.round(q[0] * 100) / 100, Math.round(q[1] * 100) / 100];
    });
  }

  // ทิ้งชิ้นเล็กกว่า min มม. (หลังย่อ/ขยาย k) เช่น จุดไข่ปลา ฝุ่น → ดัชนีที่เก็บไว้
  function keepIndex(rings, k, min) {
    var out = [];
    (rings || []).forEach(function (r, i) {
      if (!(min > 0)) return out.push(i);
      var b = boxOf(r);
      if (Math.max(b.maxX - b.minX, b.maxY - b.minY) * k >= min) out.push(i);
    });
    return out;
  }

  return {
    plan: plan,
    piece: piece,
    rowBands: rowBands,
    grid: grid,
    scaleFor: scaleFor,
    median: median,
    inkColors: inkColors,
    colorAlpha: colorAlpha,
    colorName: colorName,
    hex: hex,
    roundPoly: roundPoly,
    keepIndex: keepIndex,
    frameIndex: frameIndex,
    typicalHeight: typicalHeight,
    ringHeights: ringHeights,
    areaOf: areaOf,
  };
});
