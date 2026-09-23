// โหมดทดลอง: ทำตัวเป็น Illustrator ปลอม ๆ เมื่อเปิดหน้าแผงในเบราว์เซอร์ธรรมดา
// มีชิ้นงานตัวอย่าง + เพิ่มรูป PNG ของร้านเองได้ ใช้เอนจินจริงทุกอย่าง ยกเว้นการสร้างไฟล์ใน Illustrator
(function (root) {
  'use strict';
  if (root.__adobe_cep__) return;

  var G = root.NestingCut.geometry;
  var PT = G.PT_PER_MM;

  // ---- ชิ้นงานตัวอย่าง (หน่วย mm, มุมซ้ายบนของงาน = 0,0, y ลง) ----

  function circle(cx, cy, r) {
    var k = 0.5522847498 * r;
    return [
      { a: [cx, cy - r], l: [cx - k, cy - r], r: [cx + k, cy - r] },
      { a: [cx + r, cy], l: [cx + r, cy - k], r: [cx + r, cy + k] },
      { a: [cx, cy + r], l: [cx + k, cy + r], r: [cx - k, cy + r] },
      { a: [cx - r, cy], l: [cx - r, cy + k], r: [cx - r, cy - k] },
    ];
  }

  function star(cx, cy, R, r, n) {
    var pts = [];
    for (var i = 0; i < n * 2; i++) {
      var a = -Math.PI / 2 + (i * Math.PI) / n;
      var d = i % 2 ? r : R;
      pts.push([cx + d * Math.cos(a), cy + d * Math.sin(a)]);
    }
    return G.ringToBezier(pts);
  }

  function heart(s, dx, dy) {
    function p(x, y) {
      return [dx + x * s, dy + y * s];
    }
    return [
      { a: p(23, 40), l: p(41, 28), r: p(5, 28) },
      { a: p(0, 11), l: p(0, 18), r: p(0, 4) },
      { a: p(11.5, 0), l: p(5, 0), r: p(16, 0) },
      { a: p(23, 7), l: p(20, 2.5), r: p(26, 2.5) },
      { a: p(34.5, 0), l: p(30, 0), r: p(41, 0) },
      { a: p(46, 11), l: p(46, 4), r: p(46, 18) },
    ];
  }

  function arrow() {
    return G.ringToBezier([
      [0, 12],
      [38, 12],
      [38, 0],
      [62, 22],
      [38, 44],
      [38, 32],
      [0, 32],
    ]);
  }

  function tracePath(ctx, pts, s) {
    ctx.beginPath();
    ctx.moveTo(pts[0].a[0] * s, pts[0].a[1] * s);
    for (var i = 0; i < pts.length; i++) {
      var a = pts[i];
      var b = pts[(i + 1) % pts.length];
      ctx.bezierCurveTo(a.r[0] * s, a.r[1] * s, b.l[0] * s, b.l[1] * s, b.a[0] * s, b.a[1] * s);
    }
    ctx.closePath();
  }

  // ไล่สีทแยงจากมุมซ้ายบนถึงขวาล่าง (ความยาว 0 จะไม่วาดอะไรเลย)
  function grad(ctx, w, h, c1, c2) {
    var g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, c1);
    g.addColorStop(1, c2);
    return g;
  }

  function label(ctx, text, x, y, size, color) {
    ctx.fillStyle = color || '#fff';
    ctx.font = 'bold ' + size + 'px "Leelawadee UI", Tahoma, "Sukhumvit Set", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
  }

  var SAMPLES = [
    {
      name: 'โลโก้ร้าน x12',
      w: 54,
      h: 54,
      cut: [circle(27, 27, 27)],
      draw: function (ctx, s) {
        tracePath(ctx, circle(27, 27, 25), s);
        ctx.fillStyle = grad(ctx, 54 * s, 54 * s, '#2c3b60', '#1f2a44');
        ctx.fill();
        label(ctx, 'ม่วง', 27 * s, 25 * s, 14 * s);
        label(ctx, 'ปริ้นท์', 27 * s, 36 * s, 7 * s, '#f0a57f');
      },
    },
    {
      name: 'ดาว x10',
      w: 60,
      h: 58,
      cut: [star(30, 31, 30, 14, 5)],
      draw: function (ctx, s) {
        tracePath(ctx, star(30, 31, 27, 12.5, 5), s);
        ctx.fillStyle = grad(ctx, 60 * s, 58 * s, '#ffd84d', '#ff8a00');
        ctx.fill();
      },
    },
    {
      name: 'หัวใจ x10',
      w: 50,
      h: 44,
      cut: [heart(50 / 46, 0, 0.5)],
      draw: function (ctx, s) {
        tracePath(ctx, heart(1, 2, 2), s);
        ctx.fillStyle = grad(ctx, 50 * s, 44 * s, '#ff7eb6', '#e0105a');
        ctx.fill();
      },
    },
    {
      name: 'ป้ายชื่อ x8',
      w: 84,
      h: 34,
      cut: [G.roundedRect(0, 0, 84, 34, 8)],
      draw: function (ctx, s) {
        tracePath(ctx, G.roundedRect(2, 2, 80, 30, 6), s);
        ctx.fillStyle = grad(ctx, 84 * s, 34 * s, '#c0582b', '#e0874f');
        ctx.fill();
        label(ctx, 'นัดพอน', 42 * s, 17 * s, 11 * s);
      },
    },
    {
      name: 'ลูกศร x6',
      w: 62,
      h: 44,
      cut: [arrow()],
      draw: function (ctx, s) {
        tracePath(ctx, arrow(), s);
        ctx.fillStyle = grad(ctx, 62 * s, 44 * s, '#35d0a0', '#138a6a');
        ctx.fill();
      },
    },
    {
      name: 'สติ๊กเกอร์ไดคัท x6',
      w: 66,
      h: 44,
      cut: null, // ไม่มีเส้นตัด — ให้ปลั๊กอินสร้างตามขอบงานเอง
      draw: function (ctx, s) {
        ctx.fillStyle = grad(ctx, 66 * s, 44 * s, '#6ec8ff', '#2176ff');
        [
          [18, 26, 14],
          [34, 18, 16],
          [50, 26, 14],
          [34, 31, 12],
        ].forEach(function (c) {
          ctx.beginPath();
          ctx.arc(c[0] * s, c[1] * s, c[2] * s, 0, Math.PI * 2);
          ctx.fill();
        });
        label(ctx, 'ลุย!', 34 * s, 25 * s, 13 * s);
      },
    },
  ];

  // ---- สถานะของ "เอกสาร" ปลอม ----
  var items = [];

  function toAi(p, item) {
    return [item.x + p[0] * PT, item.y - p[1] * PT];
  }

  function aiBezier(pts, item) {
    return G.mapBezier(pts, function (p) {
      return toAi(p, item);
    });
  }

  function addItem(def) {
    var col = items.length % 4;
    var row = Math.floor(items.length / 4);
    var item = {
      name: def.name,
      w: def.w,
      h: def.h,
      draw: def.draw,
      image: def.image || null,
      x: 40 + col * 260,
      y: 800 - row * 220,
      cutMm: def.cut,
      cutAi: null,
    };
    if (def.cut) {
      item.cutAi = def.cut.map(function (pts) {
        return { closed: true, points: aiBezier(pts, item) };
      });
    }
    items.push(item);
    return items.length - 1;
  }

  SAMPLES.forEach(addItem);

  function describe(idx) {
    var it = items[idx];
    var vb = [it.x, it.y, it.x + it.w * PT, it.y - it.h * PT];
    if (it.cutAi) {
      var b = G.bounds(
        it.cutAi.map(function (sp) {
          return sp.points.map(function (q) {
            return q.a;
          });
        })
      );
      vb = [Math.min(vb[0], b.minX), Math.max(vb[1], b.maxY), Math.max(vb[2], b.maxX), Math.min(vb[3], b.minY)];
    }
    return {
      idx: idx,
      name: it.name,
      typename: it.image ? 'PlacedItem' : 'GroupItem',
      vb: vb,
      gb: vb,
      note: '',
      cut: it.cutAi || [],
      vectorOnly: !it.image,
    };
  }

  // วาดชิ้นงานลงแคนวาสที่ ppi ที่ขอ (มุมซ้ายบน = มุมของงาน)
  function render(idx, ppi) {
    var it = items[idx];
    var s = ppi / 25.4; // px ต่อ mm
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(it.w * s));
    c.height = Math.max(1, Math.round(it.h * s));
    var ctx = c.getContext('2d');
    if (it.image) ctx.drawImage(it.image, 0, 0, c.width, c.height);
    else it.draw(ctx, s);
    return c;
  }

  function download(name, blob) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 1000);
  }

  function baseName(path) {
    return String(path).split(/[\\/]/).pop();
  }

  function demoError(code) {
    var e = new Error(code);
    e.code = code;
    return e;
  }

  // รูปถ่ายตัวอย่างสำหรับ "ไดคัทตามรูปทรง" — พื้นทึบสีม่วงอ่อน มีเงาจาง ๆ รอบตัวคน (เหมือนไฟล์ JPG)
  var PHOTO = { x: 1100, y: 800, w: 60, h: 80 };

  function renderPhoto(ppi) {
    var s = ppi / 25.4;
    var c = document.createElement('canvas');
    c.width = Math.round(PHOTO.w * s);
    c.height = Math.round(PHOTO.h * s);
    var ctx = c.getContext('2d');
    ctx.scale(s, s);
    ctx.fillStyle = '#e8e1f1';
    ctx.fillRect(0, 0, PHOTO.w, PHOTO.h);
    // เงาของคนบนฉากหลัง
    ctx.fillStyle = 'rgba(120,100,150,.18)';
    ctx.beginPath();
    ctx.ellipse(33, 52, 25, 30, 0, 0, Math.PI * 2);
    ctx.fill();
    // ลำตัว (สูทสีกรม) ยาวถึงขอบล่าง
    ctx.fillStyle = '#1f2a44';
    ctx.beginPath();
    ctx.moveTo(8, 80);
    ctx.bezierCurveTo(8, 62, 16, 55, 30, 54);
    ctx.bezierCurveTo(44, 55, 52, 62, 52, 80);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#f3e7da';
    ctx.beginPath();
    ctx.moveTo(24, 55);
    ctx.lineTo(30, 72);
    ctx.lineTo(36, 55);
    ctx.closePath();
    ctx.fill();
    // คอ + หน้า + ผม
    ctx.fillStyle = '#e9b99a';
    ctx.fillRect(26, 44, 8, 12);
    ctx.fillStyle = '#2b1d16';
    ctx.beginPath();
    ctx.ellipse(30, 32, 15, 17, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#efc3a4';
    ctx.beginPath();
    ctx.ellipse(30, 35, 10.5, 13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2b1d16';
    ctx.beginPath();
    ctx.ellipse(30, 24, 11, 6, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = '#3a2a24';
    ctx.fillRect(25, 33, 3, 1.2);
    ctx.fillRect(32, 33, 3, 1.2);
    ctx.fillStyle = '#c0582b';
    ctx.fillRect(27.5, 41, 5, 1.3);
    return c;
  }

  var dieCuts = [];

  // ตัวอักษรตัวอย่าง (มม., y ลง) สำหรับ “ทำมุมโค้ง” และ “หาเส้นกลาง” — U มีร่องแคบ 2 มม. ที่ดอก 1/8 นิ้วลงไม่ได้
  var LETTERS = { x: 1400, y: 800 };
  function ringO(cx, cy, r, n, rev) {
    var out = [];
    for (var i = 0; i < n; i++) {
      var t = ((rev ? -i : i) / n) * 2 * Math.PI;
      out.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]);
    }
    return out;
  }
  var LETTER_RINGS = [
    [[0, 0], [12, 0], [12, 48], [40, 48], [40, 60], [0, 60]],
    [[50, 0], [94, 0], [94, 12], [78, 12], [78, 60], [66, 60], [66, 12], [50, 12]],
    [[104, 0], [118, 0], [118, 48], [120, 48], [120, 0], [134, 0], [134, 60], [104, 60]],
    ringO(174, 30, 30, 72, false),
    ringO(174, 30, 18, 72, true),
  ];
  function letterPaths() {
    return LETTER_RINGS.map(function (ring) {
      return {
        closed: true,
        points: ring.map(function (q) {
          var a = [LETTERS.x + q[0] * PT, LETTERS.y - q[1] * PT];
          return { a: a, l: a, r: a };
        }),
      };
    });
  }
  function letterBoxes() {
    return [[0, 40], [50, 94], [104, 134], [144, 204]].map(function (xr) {
      return [LETTERS.x + xr[0] * PT, LETTERS.y, LETTERS.x + xr[1] * PT, LETTERS.y - 60 * PT];
    });
  }
  // ป้ายคิว 4 × 3 ใบ (ส่งมาแบบสลับลำดับ ให้เห็นว่าเรียงแถว/คอลัมน์ได้)
  var TICKETS = [];
  [5, 2, 9, 0, 11, 7, 3, 6, 1, 10, 4, 8].forEach(function (k) {
    var col = k % 4;
    var row = Math.floor(k / 4);
    var l = 100 + col * 160;
    var t = 700 - row * 90;
    TICKETS.push({ contents: 'บัตรคิว {%n}', vb: [l, t, l + 140, t - 30] });
  });


  var api = {
    np_ping: function () {
      return { version: 'demo', app: 'browser', documents: 1, selection: true };
    },
    np_scan: function () {
      return {
        document: 'ตัวอย่างของนัดพอน',
        parts: items.map(function (_it, i) {
          return describe(i);
        }),
      };
    },
    np_readVectors: function (a) {
      var it = items[a.idx];
      return { paths: it.cutAi || [] };
    },
    np_exportSilhouette: function (a) {
      var d = describe(a.idx);
      var it = items[a.idx];
      var c = render(a.idx, a.ppi);
      return { dataUrl: c.toDataURL('image/png'), bounds: [it.x, it.y, it.x + it.w * PT, it.y - it.h * PT], vb: d.vb };
    },
    np_addCutLines: function (a) {
      return {
        parts: a.items.map(function (x) {
          var it = items[x.idx];
          it.cutAi = (it.cutAi || []).concat(x.paths);
          return describe(x.idx);
        }),
      };
    },
    np_buildLayout: function (a) {
      var n = 0;
      a.sheets.forEach(function (s) {
        n += s.pieces.length;
      });
      return { document: 'โหมดทดลอง', sheets: a.sheets.length, pieces: n };
    },
    np_defaultFolder: function () {
      return { folder: 'ดาวน์โหลด' };
    },
    np_chooseFolder: function () {
      return { folder: 'ดาวน์โหลด' };
    },
    np_export: function () {
      return { folder: 'ดาวน์โหลด', files: [] };
    },
    np_selectCutLines: function () {
      throw demoError('DEMO');
    },
    np_exportSelection: function (a) {
      var c = renderPhoto(a.ppi || 300);
      return {
        dataUrl: c.toDataURL('image/png'),
        bounds: [PHOTO.x, PHOTO.y, PHOTO.x + PHOTO.w * PT, PHOTO.y - PHOTO.h * PT],
        count: 1,
        kinds: { images: 1, texts: 0, vectors: 0, clips: 1 },
      };
    },
    np_readClipPaths: function () {
      var l = PHOTO.x;
      var t = PHOTO.y;
      var r = PHOTO.x + PHOTO.w * PT;
      var b = PHOTO.y - PHOTO.h * PT;
      return {
        paths: [{ closed: true, points: [[l, t], [r, t], [r, b], [l, b]].map(function (q) { return { a: q, l: q, r: q }; }) }],
        count: 1,
      };
    },
    np_readShapes: function () {
      return {
        paths: letterPaths(),
        count: 4,
        kinds: { images: 0, texts: 4, vectors: 0, clips: 0 },
        bounds: [LETTERS.x, LETTERS.y, LETTERS.x + 204 * PT, LETTERS.y - 60 * PT],
      };
    },
    np_drawShapes: function (a) {
      return { count: a.paths.length, removed: 0, flags: (a.flags || []).length };
    },
    np_readBounds: function () {
      return {
        items: letterBoxes().map(function (vb, i) {
          return { vb: vb, name: 'ตัวที่ ' + (i + 1) };
        }),
      };
    },
    np_drawDimensions: function (a) {
      return { count: a.dims.length, cleared: 0, layer: a.layer };
    },
    np_readTexts: function () {
      return {
        texts: TICKETS.map(function (t, i) {
          return { idx: i, contents: t.contents, vb: t.vb };
        }),
      };
    },
    np_setTexts: function (a) {
      a.items.forEach(function (it) {
        TICKETS[it.idx].result = it.text;
      });
      return { count: a.items.length };
    },
    np_readArtboards: function () {
      var out = [];
      for (var i = 0; i < 6; i++) out.push({ index: i, rect: [i * 620, 842, i * 620 + 595, 0], name: 'หน้า ' + (i + 1) });
      return { artboards: out };
    },
    np_pageNumbers: function (a) {
      return { count: a.pages.length, layer: a.layer };
    },
    np_panelReady: function () {
      return { ready: true };
    },
    np_drawDieCut: function (a) {
      dieCuts = dieCuts.concat(a.paths);
      return { count: a.paths.length, layer: a.layer || 'Die cut' };
    },
    np_importPack: function () {
      throw demoError('DEMO');
    },
  };

  root.NPDemoHost = {
    demo: true,
    extensionRoot: function () {
      return '';
    },
    call: function (fn, args) {
      return new Promise(function (resolve, reject) {
        setTimeout(function () {
          try {
            if (!api[fn]) throw demoError('DEMO');
            resolve(JSON.parse(JSON.stringify(api[fn](args || {}))));
          } catch (e) {
            reject(e);
          }
        }, 30);
      });
    },
    writeText: function (path, text) {
      download(baseName(path), new Blob([text], { type: 'text/plain' }));
      return baseName(path);
    },
    writeBase64: function (path, b64) {
      var bin = atob(b64);
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      download(baseName(path), new Blob([bytes], { type: 'image/png' }));
      return baseName(path);
    },
    makeDir: function () {
      return true;
    },
    openFile: function () {
      return '';
    },
    skin: function () {
      return null;
    },
    onSkinChange: function () {},
    onEvent: function () {},
    // รูปชิ้นงานสำหรับพรีวิว
    thumbFor: function (idx, ppi) {
      var it = items[idx];
      if (!it) return null;
      return { img: render(idx, ppi || 150), vb: [it.x, it.y, it.x + it.w * PT, it.y - it.h * PT] };
    },
    // เพิ่มรูป PNG จากเครื่อง (ถือว่า 150 ppi) — คืน idx ของชิ้นใหม่
    addPngFiles: function (files) {
      return Promise.all(
        Array.prototype.map.call(files, function (file) {
          return new Promise(function (resolve, reject) {
            var img = new Image();
            img.onload = function () {
              var mm = 25.4 / 150;
              var scale = Math.min(1, 150 / (Math.max(img.width, img.height) * mm)); // ยาวสุด 150 มม.
              resolve(
                addItem({
                  name: file.name.replace(/\.png$/i, ''),
                  w: img.width * mm * scale,
                  h: img.height * mm * scale,
                  image: img,
                  cut: null,
                })
              );
            };
            img.onerror = function () {
              reject(new Error('เปิดรูป ' + file.name + ' ไม่ได้'));
            };
            // data URL ไม่ทำให้แคนวาสติดเชื้อ (blob: บนหน้า file:// ทำ)
            var reader = new FileReader();
            reader.onload = function () {
              img.src = reader.result;
            };
            reader.onerror = img.onerror;
            reader.readAsDataURL(file);
          });
        })
      );
    },
  };
})(window);
