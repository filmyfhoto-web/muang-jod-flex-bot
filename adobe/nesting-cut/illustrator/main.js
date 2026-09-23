// แผงนัดพอน Nesting Cut (Illustrator)
//
// ลำดับงานของปุ่ม "เจ๊หญิงสั่งลุย!"
//   1. ดึงชิ้นงานที่เลือก (ถ้ายังไม่ได้ดึง)
//   2. ชิ้นไหนยังไม่มีเส้นตัด → สร้าง (ตามขอบงาน / กรอบสี่เหลี่ยม) แล้ววาดเส้น CutContour ลงไฟล์งาน
//   3. จัดวางตามรูปทรงจริงบนม้วน/แผ่น
//   4. สร้างไฟล์เลย์เอาต์ใหม่: ชิ้นงาน + เส้นตัด + มาร์ก + หัวงาน
//   5. ส่งออก PDF (ให้ RIP พิมพ์+ตัด), .ai, PLT/DXF/SVG (ส่งเครื่องตัดตรง), รูปพรีวิว
(function () {
  'use strict';

  var NC = window.NestingCut;
  var G = NC.geometry;
  var L = NC.layout;
  var B = NC.bridge;
  var host = window.NPHost || window.NPDemoHost;
  var PT = G.PT_PER_MM;
  var K = 1 / PT;
  var LOGO_ASPECT = 1200 / 730; // assets/logo.png

  function $(id) {
    return document.getElementById(id);
  }

  var ERRORS = {
    NO_DOC: 'ยังไม่ได้เปิดไฟล์ใน Illustrator',
    NO_SELECTION: 'ยังไม่ได้เลือกชิ้นงาน — คลิกเลือกบนหน้างานก่อน (กด Shift เลือกได้หลายชิ้น)',
    ALL_LOCKED: 'ชิ้นที่เลือกถูกล็อกหรือซ่อนอยู่ทั้งหมด',
    PART_MISSING: 'ไม่พบชิ้นงาน — กด “ดึงชิ้นงานที่เลือก” ใหม่',
    PART_GONE: 'ชิ้นงานถูกลบหรือไฟล์ถูกปิดไปแล้ว — กด “ดึงชิ้นงานที่เลือก” ใหม่',
    EMPTY_ITEM: 'มีชิ้นงานที่ว่างเปล่า (มองไม่เห็นอะไรเลย)',
    EXPORT_FAILED: 'Illustrator ส่งออกรูปชั่วคราวไม่สำเร็จ',
    TOO_COMPLEX: 'ชิ้นงานเวกเตอร์ซับซ้อนเกินไป — เปลี่ยนเป็น “สร้างตามขอบงาน” แทน',
    NOTHING_PLACED: 'ยังไม่มีชิ้นที่จัดวางได้',
    CANVAS_FULL: 'แผ่นงานยาว/เยอะเกินพื้นที่ของ Illustrator — ลดความยาวหรือแบ่งงานเป็นหลายรอบ',
    NO_LAYOUT: 'ไฟล์ชีตไดคัทถูกปิดไปแล้ว — กด “สร้างชีตไดคัท” ใหม่',
    FOLDER: 'สร้างโฟลเดอร์ไม่ได้: ',
    IMAGE_MISSING: 'หาไฟล์รูปในแพ็กไม่เจอ: ',
    FS: 'อ่าน/เขียนไฟล์ไม่สำเร็จ ',
    DEMO: 'ขั้นนี้ต้องเปิดในแผงของ Illustrator (โหมดทดลองทำไม่ได้)',
    SCRIPT: 'สคริปต์ใน Illustrator สะดุด: ',
  };

  function errText(e) {
    if (e && e.code && ERRORS[e.code]) {
      var base = ERRORS[e.code];
      return /[:\s]$/.test(base) ? base + (e.detail || e.message || '') : base;
    }
    return (e && e.message) || String(e);
  }

  // ---------------------------------------------------------------- ค่าตั้ง

  var STORE_KEY = 'nongploy.nestingcut.settings.v2';
  var DEFAULTS = {
    cutter: 'circle4',
    media: 'a3',
    sizeUnit: 'mm',
    width: 297,
    length: 420,
    marginTop: 20,
    marginBottom: 20,
    marginLeft: 20,
    marginRight: 20,
    spacing: 3,
    rotation: 'quarter',
    quality: '1',
    respectBleed: true,
    arrange: 'shape',
    gridCut: false,
    fillSheet: false,
    target: 'artboard',
    cutMode: 'none',
    detectRed: true,
    printLayer: 'ไฟล์ปริ้นชิ้นงาน',
    cutLayer: 'เส้นไดคัท',
    cutOffset: 2,
    boxRadius: 0,
    spotName: 'CutContour',
    strokeWidth: 0.25,
    markType: 'circle',
    markSize: 5,
    markInset: 10,
    markThick: 0.5,
    markClearance: 4,
    markEvery: 0,
    headerOn: true,
    headerHeight: 18,
    jobName: '',
    customer: '',
    jobNote: '',
    logoFile: '',
    logoAspect: 0,
    outPdf: true,
    outAi: true,
    outPlt: true,
    outDxf: false,
    outSvg: false,
    outPng: true,
    pltFeed: 'x',
    overcut: 0,
    folder: '',
  };

  function loadSettings() {
    var s = {};
    for (var k in DEFAULTS) s[k] = DEFAULTS[k];
    try {
      var saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
      for (var j in saved) if (j in DEFAULTS) s[j] = saved[j];
    } catch (e) {
      /* ใช้ค่าเริ่มต้น */
    }
    return s;
  }

  function saveSettings() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(S.settings));
    } catch (e) {
      /* ไม่เป็นไร */
    }
  }

  var S = {
    settings: loadSettings(),
    parts: [],
    result: null,
    stale: false,
    built: false,
    busy: false,
    logoImg: null,
  };

  function num(key) {
    var v = parseFloat(S.settings[key]);
    return isFinite(v) ? v : parseFloat(DEFAULTS[key]) || 0;
  }

  function cutNames() {
    var names = [S.settings.spotName || 'CutContour', 'CutContour', 'Cut Contour'];
    return names.filter(function (n, i) {
      return names.indexOf(n) === i;
    });
  }

  // ---------------------------------------------------------------- สถานะบนจอ

  function status(text, kind) {
    var el = $('status');
    el.textContent = text;
    el.className = 'status' + (kind ? ' ' + kind : '');
  }

  function progress(f) {
    $('progressBar').style.width = Math.round(Math.max(0, Math.min(1, f)) * 100) + '%';
  }

  var BUTTONS = ['btnGo', 'btnNest', 'btnBuild', 'btnExport', 'btnSelectCut', 'btnScan', 'btnImport', 'btnAddPng'];

  function run(fn) {
    if (S.busy) return Promise.resolve();
    S.busy = true;
    BUTTONS.forEach(function (id) {
      $(id).disabled = true;
    });
    progress(0.02);
    return Promise.resolve()
      .then(fn)
      .catch(function (e) {
        console.error(e);
        status(errText(e), 'err');
      })
      .then(function () {
        S.busy = false;
        BUTTONS.forEach(function (id) {
          $(id).disabled = false;
        });
        setTimeout(function () {
          if (!S.busy) progress(0);
        }, 600);
      });
  }

  function markStale() {
    if (S.result) S.stale = true;
    S.built = false;
    $('previewSub').textContent = S.stale ? '(ค่าเปลี่ยน — กดจัดวางใหม่)' : '';
  }

  // ---------------------------------------------------------------- ชิ้นงาน

  function hueFor(idx) {
    return Math.round((idx * 137.508 + 280) % 360);
  }

  function byIdx(idx) {
    for (var i = 0; i < S.parts.length; i++) if (S.parts[i].idx === idx) return S.parts[i];
    return null;
  }

  function qtyFrom(d) {
    var m = /np:qty=(\d+)/.exec(d.note || '');
    if (m) return parseInt(m[1], 10);
    return NC.pack.parseQty(d.name) || 1;
  }

  function defaultMode(d) {
    var m = S.settings.cutMode;
    return m === 'vector' && !d.vectorOnly ? 'auto' : m;
  }

  function fromHost(d) {
    var hasCut = d.cut && d.cut.length > 0;
    return {
      idx: d.idx,
      name: d.name || 'ชิ้นที่ ' + (d.idx + 1),
      vb: d.vb,
      cut: hasCut ? d.cut : null,
      vec: null,
      vectorOnly: d.vectorOnly,
      mode: hasCut ? 'contour' : defaultMode(d),
      qty: qtyFrom(d),
      rotate: true,
      hue: hueFor(d.idx),
      thumb: null,
      rings: [],
      polys: [],
    };
  }

  function sizeText(vb) {
    return Math.round((vb[2] - vb[0]) * K) + '×' + Math.round((vb[1] - vb[3]) * K) + ' มม.';
  }

  var MODE_CHIP = {
    contour: ['✂ มีเส้นตัด', 'ok'],
    auto: ['✨ จะสร้างเส้นตัด', 'todo'],
    vector: ['✒ ตัดตามเวกเตอร์', 'ok'],
    box: ['▭ กรอบสี่เหลี่ยม', 'todo'],
    none: ['⚠ ไม่พบเส้นไดคัท — ใช้กรอบ', 'todo'],
  };

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function renderParts() {
    var ul = $('partsList');
    ul.innerHTML = '';
    $('partsEmpty').hidden = S.parts.length > 0;
    var total = 0;
    S.parts.forEach(function (p) {
      total += p.qty;
      var li = el('li', 'part');
      var sw = el('span', 'swatch');
      sw.style.background = 'hsl(' + p.hue + ',70%,60%)';
      li.appendChild(sw);

      var info = el('div', 'info');
      var name = el('div', 'name', p.name);
      name.title = p.name;
      info.appendChild(name);
      var meta = el('div', 'meta');
      meta.appendChild(el('span', null, sizeText(p.vb)));
      var chip = MODE_CHIP[p.mode];
      meta.appendChild(el('span', 'chip ' + chip[1], chip[0]));
      if (p.mode !== 'contour') {
        var sel = el('select', 'mode');
        [
          ['auto', 'ตามขอบงาน'],
          ['vector', 'ตามเวกเตอร์'],
          ['box', 'วาดกรอบเป็นเส้นตัด'],
          ['none', 'ไม่มีเส้นตัด (ใช้กรอบ+ตาราง)'],
        ].forEach(function (o) {
          var opt = el('option', null, o[1]);
          opt.value = o[0];
          if (o[0] === 'vector' && !p.vectorOnly) opt.disabled = true;
          sel.appendChild(opt);
        });
        sel.value = p.mode;
        sel.title = 'ชิ้นนี้ยังไม่มีเส้นตัด — จะให้ตัดแบบไหน';
        sel.onchange = function () {
          p.mode = sel.value;
          p.vec = null;
          markStale();
          renderParts();
        };
        meta.appendChild(sel);
      }
      info.appendChild(meta);
      li.appendChild(info);

      var rot = el('label', 'rot');
      var cb = el('input');
      cb.type = 'checkbox';
      cb.checked = p.rotate;
      cb.onchange = function () {
        p.rotate = cb.checked;
        markStale();
      };
      rot.appendChild(cb);
      rot.appendChild(document.createTextNode('หมุน'));
      rot.title = 'ยอมให้หมุนชิ้นนี้ตอนจัดวาง';
      li.appendChild(rot);

      var q = el('input', 'qty');
      q.type = 'number';
      q.min = '0';
      q.step = '1';
      q.value = p.qty;
      q.title = 'จำนวนชิ้น';
      q.onchange = function () {
        p.qty = Math.max(0, parseInt(q.value, 10) || 0);
        q.value = p.qty;
        markStale();
        renderTotal();
      };
      li.appendChild(q);
      ul.appendChild(li);
    });
    renderTotal();
  }

  function renderTotal() {
    var total = S.parts.reduce(function (s, p) {
      return s + p.qty;
    }, 0);
    $('partsTotal').textContent = S.parts.length ? 'รวม ' + total + ' ชิ้น จาก ' + S.parts.length + ' แบบ' : '';
  }

  function scan() {
    status('กำลังดึงชิ้นงานที่เลือก…');
    return host.call('np_scan', { cutNames: cutNames(), detectRed: !!S.settings.detectRed }).then(function (res) {
      S.parts = res.parts.map(fromHost);
      S.result = null;
      S.stale = false;
      S.built = false;
      if (host.thumbFor) {
        S.parts.forEach(function (p) {
          p.thumb = host.thumbFor(p.idx);
        });
      }
      renderParts();
      clearPreview();
      status('ได้ ' + S.parts.length + ' แบบ จาก “' + res.document + '”', 'ok');
    });
  }

  function importPack() {
    var path = host.openFile('เลือกไฟล์ ' + NC.pack.FILE_NAME + ' ที่ส่งมาจาก Photoshop', ['json']);
    if (!path) return Promise.resolve();
    var pack = NC.pack.validatePack(JSON.parse(host.readText(path)));
    var folder = path.replace(/[\\/][^\\/]*$/, '');
    status('กำลังนำเข้า ' + pack.items.length + ' ชิ้นจาก Photoshop…');
    return host
      .call('np_importPack', {
        pack: pack,
        folder: folder,
        spotName: S.settings.spotName || 'CutContour',
        strokeWidth: num('strokeWidth'),
        embed: false,
      })
      .then(scan);
  }

  // ---------------------------------------------------------------- เส้นตัด

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        resolve(img);
      };
      img.onerror = function () {
        reject(new Error('เปิดรูปชั่วคราวไม่ได้'));
      };
      img.src = src;
    });
  }

  function pixels(img) {
    var c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    var ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    return ctx.getImageData(0, 0, c.width, c.height);
  }

  // ส่งออกชิ้นงานเป็น PNG → หาขอบจากความโปร่งใส → เว้นระยะ → เส้นโค้งนุ่ม ๆ (พิกัด Illustrator)
  function autoCut(p) {
    var wPt = p.vb[2] - p.vb[0];
    var hPt = p.vb[1] - p.vb[3];
    var ppi = Math.max(50, Math.min(300, 2000 / (Math.max(wPt, hPt) / 72)));
    return host
      .call('np_exportSilhouette', { idx: p.idx, ppi: ppi })
      .then(function (sil) {
        var src = sil.dataUrl || 'data:image/png;base64,' + host.readBase64(sil.file);
        return loadImage(src).then(function (img) {
          return { img: img, bounds: sil.bounds };
        });
      })
      .then(function (r) {
        var b = r.bounds;
        var sx = (b[2] - b[0]) / r.img.width; // pt ต่อพิกเซล
        var sy = (b[1] - b[3]) / r.img.height;
        var pxPerMm = PT / sx;
        var loops = NC.contour.traceAlpha(pixels(r.img), {
          offsetPx: num('cutOffset') * pxPerMm,
          threshold: 128,
          simplifyPx: Math.max(0.3, 0.04 * pxPerMm),
          minAreaPx: Math.max(16, pxPerMm * pxPerMm),
        });
        if (!p.thumb) p.thumb = { img: r.img, vb: b };
        return loops.map(function (lp) {
          var ring = lp.points.map(function (q) {
            return [b[0] + q[0] * sx, b[1] - q[1] * sy];
          });
          return { closed: true, points: G.smoothRing(ring, 50) };
        });
      });
  }

  function boxCut(p) {
    var o = num('cutOffset') * PT;
    var r = num('boxRadius') * PT;
    var l = p.vb[0] - o;
    var t = p.vb[1] + o;
    var w = p.vb[2] - p.vb[0] + 2 * o;
    var h = p.vb[1] - p.vb[3] + 2 * o;
    var pts = G.mapBezier(G.roundedRect(l, -t, w, h, r), function (q) {
      return [q[0], -q[1]];
    });
    return [{ closed: true, points: pts }];
  }

  function prepareCuts() {
    var todo = S.parts.filter(function (p) {
      return p.qty > 0 && (p.mode === 'auto' || p.mode === 'box' || (p.mode === 'vector' && !p.vec));
    });
    if (!todo.length) return Promise.resolve();
    var adds = [];
    var chain = Promise.resolve();
    todo.forEach(function (p, i) {
      chain = chain.then(function () {
        status('นัดพอนกำลังทำเส้นตัด “' + p.name + '” (' + (i + 1) + '/' + todo.length + ')…');
        progress(0.05 + (0.25 * i) / todo.length);
        if (p.mode === 'vector') {
          return host.call('np_readVectors', { idx: p.idx }).then(function (v) {
            p.vec = v.paths;
          });
        }
        return Promise.resolve(p.mode === 'box' ? boxCut(p) : autoCut(p)).then(function (paths) {
          if (!paths.length) throw new Error('หาขอบของ “' + p.name + '” ไม่เจอ — ชิ้นนี้โปร่งใสทั้งหมดหรือเปล่า?');
          adds.push({ idx: p.idx, paths: paths });
        });
      });
    });
    return chain.then(function () {
      if (!adds.length) return;
      status('กำลังวาดเส้นตัดลงในไฟล์งาน…');
      return host
        .call('np_addCutLines', {
          items: adds,
          spotName: S.settings.spotName || 'CutContour',
          strokeWidth: num('strokeWidth'),
          cutNames: cutNames(),
        })
        .then(function (res) {
          res.parts.forEach(function (d) {
            var p = byIdx(d.idx);
            p.vb = d.vb;
            p.cut = d.cut;
            p.mode = 'contour';
          });
          renderParts();
        });
    });
  }

  // ---------------------------------------------------------------- จัดวาง

  function rotationSet() {
    return NC.nest.ROTATION_SETS[S.settings.rotation] || [0];
  }

  // ขอบงานที่เลยเส้นตัดออกไป (bleed) หน่วย mm — กันสีล้นทับชิ้นข้าง ๆ
  function bleedOf(p) {
    return S.settings.respectBleed ? rawBleed(p) : 0;
  }

  function rawBleed(p) {
    if (!p.rings.length || p.mode === 'vector') return 0;
    var bb = G.bounds(p.rings);
    var e = Math.max(
      0,
      bb.minX - p.vb[0] * K,
      bb.minY + p.vb[1] * K,
      p.vb[2] * K - bb.maxX,
      -p.vb[3] * K - bb.maxY
    );
    return e < 0.05 ? 0 : Math.min(e, 10);
  }

  // ชิ้นที่ไม่มีเส้นไดคัท: ใช้กรอบสี่เหลี่ยมของชิ้นงานแทน (ไม่มีเส้นตัดให้ส่งออก)
  function vbRing(vb) {
    return [
      [vb[0] * K, -vb[1] * K],
      [vb[2] * K, -vb[1] * K],
      [vb[2] * K, -vb[3] * K],
      [vb[0] * K, -vb[3] * K],
    ];
  }

  function noCutParts() {
    return S.parts.filter(function (p) {
      return p.qty > 0 && p.mode === 'none';
    });
  }

  // แบบตาราง: เลือกเอง หรือถูกบังคับเพราะมีชิ้นที่ไม่พบเส้นไดคัท
  function gridMode() {
    return S.settings.arrange === 'grid' || noCutParts().length > 0;
  }

  function engineParts() {
    var rots = rotationSet();
    var grid = gridMode();
    return S.parts.map(function (p) {
      var src = p.mode === 'vector' ? p.vec : p.cut;
      p.rings = src ? B.subpathsToRings(src, 0.3) : p.mode === 'none' ? [vbRing(p.vb)] : [];
      p.polys = src ? B.subpathsToPolylines(src, 0.1) : [];
      return {
        id: p.idx,
        // แบบตาราง: จัดวางด้วยกรอบสี่เหลี่ยมของชิ้น (เรียงเป็นแถว-คอลัมน์) แต่ตัดตามเส้นจริง
        rings: grid && p.rings.length ? [bboxRing(p.rings)] : p.rings,
        quantity: p.rings.length ? p.qty : 0,
        rotations: p.rotate ? rots : [0],
        bleed: bleedOf(p),
      };
    });
  }

  function bboxRing(rings) {
    var b = G.bounds(rings);
    return [
      [b.minX, b.minY],
      [b.maxX, b.minY],
      [b.maxX, b.maxY],
      [b.minX, b.maxY],
    ];
  }

  function markSpec() {
    var s = S.settings;
    if (s.markType === 'none') return { type: 'none' };
    return {
      type: s.markType,
      size: num('markSize'),
      inset: num('markInset'),
      thick: num('markThick'),
      clearance: num('markClearance'),
      every: num('markEvery'),
      square: 5,
    };
  }

  function unitK() {
    return S.settings.sizeUnit === 'in' ? 25.4 : 1;
  }

  function sheetSpec() {
    var len = num('length') * unitK();
    return {
      width: num('width') * unitK(),
      length: len > 0 ? len : null,
      margin: { top: num('marginTop'), bottom: num('marginBottom'), left: num('marginLeft'), right: num('marginRight') },
      marks: markSpec(),
      header: { enabled: !!S.settings.headerOn, height: num('headerHeight'), gap: 3 },
    };
  }

  function nestNow() {
    var parts = engineParts();
    var missing = S.parts.filter(function (p) {
      return p.qty > 0 && !p.rings.length;
    });
    var total = parts.reduce(function (s, p) {
      return s + p.quantity;
    }, 0);
    if (!total) {
      throw new Error(
        missing.length ? 'ชิ้นงานยังไม่มีเส้นตัด — กด “เจ๊หญิงสั่งลุย!” หรือ “คำนวณ” ให้สร้างเส้นตัดก่อน' : 'ยังไม่มีชิ้นงาน (หรือจำนวนเป็น 0 ทั้งหมด)'
      );
    }
    var plan = L.planSheet(sheetSpec());
    if (!(plan.area.w > 5 && plan.area.h > 5)) throw new Error('แผ่นเล็กเกินไปเมื่อหักขอบ มาร์ก และหัวงานแล้ว');
    var opts = {
      spacing: Math.max(0.2, num('spacing')),
      cellSize: num('quality') || 1,
      iterations: 24,
      timeLimitMs: 12000,
      maxPerSheet: 400,
    };
    var t0 = Date.now();
    var fill = null;
    var job;
    if (S.settings.fillSheet) {
      // เต็มแผ่น: ดวงแรกที่มีจำนวน ใส่ให้ได้มากที่สุดในแผ่นเดียว
      if (plan.roll) throw new Error('โหมดเต็มแผ่นต้องใส่ “ยาว (มม.)” ของแผ่นก่อน เช่น 13×19 นิ้ว = 330 × 483');
      var first = parts.filter(function (p) {
        return p.quantity > 0;
      })[0];
      fill = { part: byIdx(first.id), others: parts.filter(function (p) { return p.quantity > 0; }).length - 1 };
      status('นัดพอนกำลังหาวิธีใส่ “' + fill.part.name + '” ให้ได้มากที่สุด…');
      job = new Promise(function (resolve, reject) {
        setTimeout(function () {
          try {
            resolve(NC.nest.fillSheet(first, plan, opts));
          } catch (e) {
            reject(e);
          }
        }, 30);
      });
    } else {
      status('นัดพอนกำลังจัดวาง ' + total + ' ชิ้น…');
      job = NC.nest.nestAsync(parts, plan, opts, function (f) {
        progress(0.3 + 0.5 * f);
      });
    }
    return job
      .then(function (res) {
        var sheets = res.sheets.map(function (sh, i) {
          var len = L.finalLength(plan, sh.contentMaxY);
          return {
            index: i,
            length: len,
            placements: sh.placements,
            partsArea: sh.partsArea,
            marks: L.markShapes(plan.width, len, plan.marks),
          };
        });
        S.result = { plan: plan, res: res, sheets: sheets, ms: Date.now() - t0, fill: fill };
        S.stale = false;
        S.built = false;
        $('previewSub').textContent = '';
        drawPreview();
        renderStats();
        var unplaced = res.unplaced.reduce(function (s, u) {
          return s + u.count;
        }, 0);
        if (unplaced) {
          var names = res.unplaced
            .map(function (u) {
              return (byIdx(u.id) || {}).name;
            })
            .filter(Boolean)
            .join(', ');
          status('วางไม่ได้ ' + unplaced + ' ชิ้น (ใหญ่กว่าพื้นที่วาง?): ' + names, 'warn');
        } else if (fill) {
          var b = G.bounds(fill.part.rings);
          status(
            'ได้ ' + res.placedCount + ' ดวง ต่อ 1 แผ่น · ดวงขนาด ' + Math.round(b.maxX - b.minX) + ' × ' + Math.round(b.maxY - b.minY) + ' มม.' +
              (fill.others > 0 ? ' (โหมดเต็มแผ่นใช้แบบแรกแบบเดียว ข้ามอีก ' + fill.others + ' แบบ)' : ''),
            'ok'
          );
        } else {
          status('จัดวางครบ ' + res.placedCount + ' ชิ้น ✓', 'ok');
        }
        // คำเตือนก่อนสร้างชีต
        var warnings = [];
        var worst = S.parts.reduce(function (m, p) {
          return p.qty > 0 ? Math.max(m, rawBleed(p)) : m;
        }, 0);
        if (worst > 0 && worst * 2 >= opts.spacing) {
          warnings.push(
            'งานพิมพ์เลยเส้นตัดออกมา ' + worst.toFixed(1) + ' มม. มากกว่าครึ่งหนึ่งของระยะห่าง — ภาพของดวงข้าง ๆ อาจทับกัน' +
              ' เพิ่มระยะห่างเป็นมากกว่า ' + (Math.ceil(worst * 2 * 10) / 10) + ' มม.' +
              (S.settings.respectBleed ? ' (ตอนนี้ “เผื่อ bleed” เว้นระยะเพิ่มให้แล้ว)' : '')
          );
        }
        var nocut = noCutParts();
        if (nocut.length) {
          warnings.push(
            'ไม่พบเส้นไดคัท ' + nocut.length + ' แบบ (' + nocut.map(function (p) { return p.name; }).join(', ') +
              ') — ใช้กรอบสี่เหลี่ยมของชิ้นงานและเรียงแบบตารางแทน ตรวจไฟล์ก่อนสร้างชีต'
          );
        }
        if (res.sheets.some(function (sh) { return sh.placements.length >= 400; })) {
          warnings.push('ครบ 400 ดวงต่อแผ่นแล้ว (จำกัดสูงสุด 400 ดวง/แผ่น)');
        }
        S.result.warnings = warnings;
        if (warnings.length) status('⚠ ' + warnings.join(' · '), 'warn');
        if (missing.length) {
          status(
            'ข้าม ' +
              missing.length +
              ' แบบที่ยังไม่มีเส้นตัด: ' +
              missing
                .map(function (p) {
                  return p.name;
                })
                .join(', '),
            'warn'
          );
        }
      });
  }

  function ensureNested() {
    if (S.result && !S.stale) return Promise.resolve();
    return prepareCuts().then(nestNow);
  }

  // ---------------------------------------------------------------- สถิติ + พรีวิว

  function renderStats() {
    var r = S.result;
    var box = $('stats');
    box.innerHTML = '';
    if (!r) {
      box.hidden = true;
      return;
    }
    var used = 0;
    var area = 0;
    r.sheets.forEach(function (sh) {
      used += sh.length;
      area += sh.partsArea;
    });
    var util = used ? (100 * area) / (used * r.plan.width) : 0;
    var unplaced = r.res.unplaced.reduce(function (s, u) {
      return s + u.count;
    }, 0);
    [
      r.fill
        ? [r.res.placedCount + ' ดวง', 'ต่อ 1 แผ่น']
        : [r.plan.roll ? (used / 1000).toFixed(2) + ' ม.' : r.sheets.length + ' แผ่น', r.plan.roll ? 'ความยาวม้วนที่ใช้' : 'จำนวนแผ่น'],
      [util.toFixed(0) + '%', 'ใช้เนื้อที่'],
      [r.res.placedCount + '/' + r.res.totalCount, unplaced ? 'วางได้ (ขาด ' + unplaced + ')' : 'ชิ้นที่วาง'],
    ].forEach(function (s) {
      var d = el('div', 'stat');
      d.appendChild(el('b', null, s[0]));
      d.appendChild(el('span', null, s[1]));
      box.appendChild(d);
    });
    box.hidden = false;
  }

  function clearPreview() {
    $('previewInfo').textContent = '';
    $('preview').hidden = true;
    $('previewEmpty').hidden = false;
    $('stats').hidden = true;
    $('previewSub').textContent = '';
  }

  function ringPath(ctx, rings, t, s) {
    ctx.beginPath();
    rings.forEach(function (ring) {
      ring.forEach(function (p, i) {
        var q = G.transformPoint(p, t);
        if (i) ctx.lineTo(q[0] * s, q[1] * s);
        else ctx.moveTo(q[0] * s, q[1] * s);
      });
      ctx.closePath();
    });
  }

  function drawPreview() {
    if (!S.result) return clearPreview();
    var canvas = $('preview');
    canvas.hidden = false;
    $('previewEmpty').hidden = true;
    var box = $('previewBox');
    var cssW = box.clientWidth || 300;
    if (document.body.classList.contains('wide')) {
      // จอกว้าง: ย่อให้เห็นทั้งแผ่นในกรอบเดียว ไม่ต้องเลื่อน
      var r = S.result;
      var total = r.sheets.reduce(function (a, sh) {
        return a + sh.length;
      }, 0);
      var h = Math.max(200, box.clientHeight - 16);
      cssW = Math.min(cssW - 16, (h - 12 * r.sheets.length) * (r.plan.width / total));
    }
    renderSheets(canvas, Math.max(120, cssW), Math.min(2, window.devicePixelRatio || 1));
    canvas.style.width = Math.max(120, cssW) + 'px';
    renderInfo();
  }

  // บรรทัดสรุปใต้พรีวิว: "132 ดวง · หน้า 330.2 × 482.6 มม."
  function renderInfo() {
    var r = S.result;
    if (!r) {
      $('previewInfo').textContent = '';
      return;
    }
    var sizes = r.sheets.map(function (sh) {
      return (Math.round(r.plan.width * 10) / 10) + ' × ' + (Math.round(sh.length * 10) / 10) + ' มม.';
    });
    $('previewInfo').textContent =
      r.res.placedCount + (r.fill ? ' ดวง' : ' ชิ้น') + ' · ' + (r.sheets.length > 1 ? r.sheets.length + ' แผ่น · ' : 'หน้า ') + sizes[0];
  }

  // แผงกว้างพอ (≥ 620 px) ย้ายพรีวิวไปช่องซ้าย แคบก็กลับมาอยู่ใต้ปุ่มลุย
  function placePreview() {
    var wide = window.innerWidth >= 620;
    document.body.classList.toggle('wide', wide);
    var target = wide ? $('previewSide') : $('previewSlot');
    var card = $('previewCard');
    if (card.parentNode !== target) target.appendChild(card);
    if (S.result) drawPreview();
  }

  // วาดทุกแผ่นลงแคนวาสกว้าง cssW (ใช้ทั้งพรีวิวบนแผงและรูปส่งลูกค้า)
  function renderSheets(canvas, cssW, dpr) {
    var r = S.result;
    var s = cssW / r.plan.width; // px ต่อ mm
    var gap = 12;
    var totalH = 0;
    r.sheets.forEach(function (sh) {
      totalH += sh.length * s + gap;
    });
    var maxPx = 16000;
    if (totalH * dpr > maxPx) dpr = maxPx / totalH;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(totalH * dpr);
    canvas.style.height = totalH + 'px';
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, totalH);

    var y0 = 0;
    r.sheets.forEach(function (sh) {
      ctx.save();
      ctx.translate(0, y0);
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = 'rgba(0,0,0,.25)';
      ctx.shadowBlur = 6;
      ctx.fillRect(0, 0, r.plan.width * s, sh.length * s);
      ctx.shadowBlur = 0;

      // พื้นที่วาง
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = 'rgba(31,42,68,.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(r.plan.area.x * s, r.plan.area.y * s, r.plan.area.w * s, Math.min(r.plan.area.h, sh.length - r.plan.area.y) * s);
      ctx.setLineDash([]);

      drawHeaderPreview(ctx, r, sh, s);

      // มาร์ก
      ctx.fillStyle = '#000';
      sh.marks.forEach(function (g) {
        g.parts.forEach(function (m) {
          if (m.kind === 'circle') {
            ctx.beginPath();
            ctx.arc(m.cx * s, m.cy * s, m.r * s, 0, Math.PI * 2);
            ctx.fill();
          } else {
            ctx.fillRect(m.x * s, m.y * s, Math.max(1, m.w * s), Math.max(1, m.h * s));
          }
        });
      });

      // ชิ้นงาน
      sh.placements.forEach(function (pl) {
        var p = byIdx(pl.partId);
        if (!p) return;
        var t = { angle: pl.angle, tx: pl.tx, ty: pl.ty };
        if (p.thumb && !S.plainPreview) {
          ctx.save();
          ringPath(ctx, p.rings, t, s);
          ctx.clip();
          ctx.translate(pl.tx * s, pl.ty * s);
          ctx.rotate((pl.angle * Math.PI) / 180);
          ctx.scale(s, s);
          var vb = p.thumb.vb;
          ctx.drawImage(p.thumb.img, vb[0] * K, -vb[1] * K, (vb[2] - vb[0]) * K, (vb[1] - vb[3]) * K);
          ctx.restore();
        } else {
          ringPath(ctx, p.rings, t, s);
          ctx.fillStyle = 'hsla(' + p.hue + ',70%,60%,.45)';
          ctx.fill('evenodd');
        }
        ctx.strokeStyle = '#e600e6';
        ctx.lineWidth = 1;
        (useGridCut() ? [] : p.polys).forEach(function (poly) {
          ctx.beginPath();
          poly.points.forEach(function (pt, i) {
            var q = G.transformPoint(pt, t);
            if (i) ctx.lineTo(q[0] * s, q[1] * s);
            else ctx.moveTo(q[0] * s, q[1] * s);
          });
          if (poly.closed) ctx.closePath();
          ctx.stroke();
        });
      });
      if (useGridCut()) {
        ctx.strokeStyle = '#e600e6';
        ctx.lineWidth = 1;
        gridLines(sh).forEach(function (l) {
          ctx.beginPath();
          ctx.moveTo(l.points[0][0] * s, l.points[0][1] * s);
          ctx.lineTo(l.points[1][0] * s, l.points[1][1] * s);
          ctx.stroke();
        });
      }
      ctx.restore();
      y0 += sh.length * s + gap;
    });
  }

  function headerLines(sh, i, n) {
    var s = S.settings;
    var r = S.result;
    var cutter = L.cutter(s.cutter);
    var when = new Date();
    var date;
    try {
      date = when.toLocaleDateString('th-TH') + ' ' + when.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      date = when.toISOString().slice(0, 16).replace('T', ' ');
    }
    var line1 = (s.jobName || 'งานสติ๊กเกอร์') + (s.customer ? '  •  ' + s.customer : '');
    var line2 =
      date +
      '  •  ' +
      sh.placements.length +
      ' ชิ้น  •  ' +
      Math.round(r.plan.width) +
      ' × ' +
      Math.round(sh.length) +
      ' มม.' +
      (n > 1 ? '  •  แผ่น ' + (i + 1) + '/' + n : '');
    var line3 = [s.jobNote, cutter ? 'เครื่องตัด ' + cutter.label : '']
      .filter(Boolean)
      .join('  •  ');
    return [line1, line2, line3].filter(Boolean);
  }

  function logoAspect() {
    return S.settings.logoFile && S.settings.logoAspect > 0 ? S.settings.logoAspect : LOGO_ASPECT;
  }

  function drawHeaderPreview(ctx, r, sh, s) {
    if (!r.plan.headerBox) return;
    var hl = L.headerLayout(r.plan.headerBox, logoAspect(), 2);
    var hb = r.plan.headerBox;
    ctx.fillStyle = 'rgba(192,88,43,.08)';
    ctx.fillRect(hb.x * s, hb.y * s, hb.w * s, hb.h * s);
    if (hl.logo && S.logoImg && !S.plainPreview) ctx.drawImage(S.logoImg, hl.logo.x * s, hl.logo.y * s, hl.logo.w * s, hl.logo.h * s);
    var lines = headerLines(sh, sh.index, r.sheets.length);
    var fs = Math.max(4, (hl.text.h / Math.max(3, lines.length)) * s * 0.8);
    ctx.fillStyle = '#222';
    ctx.font = fs + 'px "Leelawadee UI", Tahoma, sans-serif';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    lines.forEach(function (line, k) {
      ctx.fillText(line, hl.text.x * s, (hl.text.y * s) + k * fs * 1.2, hl.text.w * s);
    });
  }

  // ---------------------------------------------------------------- สร้างเลย์เอาต์ใน Illustrator

  function toPtShape(m) {
    if (m.kind === 'circle') return { kind: 'circle', cx: m.cx * PT, cy: m.cy * PT, r: m.r * PT };
    return { kind: 'rect', x: m.x * PT, y: m.y * PT, w: m.w * PT, h: m.h * PT };
  }

  function boxPt(b) {
    return { x: b.x * PT, y: b.y * PT, w: b.w * PT, h: b.h * PT };
  }

  function headerPayload(sh, i, n) {
    var r = S.result;
    if (!r.plan.headerBox) return null;
    var hl = L.headerLayout(r.plan.headerBox, logoAspect(), 2);
    var lines = headerLines(sh, i, n);
    var text = boxPt(hl.text);
    text.lines = lines;
    text.size = Math.max(5, (text.h / Math.max(3, lines.length)) / 1.25);
    var logo = null;
    if (hl.logo) {
      logo = boxPt(hl.logo);
      logo.file = S.settings.logoFile || (host.extensionRoot() ? host.extensionRoot() + '/assets/logo.png' : '');
    }
    return { logo: logo, text: text };
  }

  function layoutPayload(target) {
      var r = S.result;
      var n = r.sheets.length;
      var grid = useGridCut();
      return {
        target: target,
        spotName: S.settings.spotName || 'CutContour',
        strokeWidth: num('strokeWidth'),
        dropPieceCuts: grid,
        layerNames: {
          pieces: S.settings.printLayer || 'ไฟล์ปริ้นชิ้นงาน',
          cut: S.settings.cutLayer || 'เส้นไดคัท',
          marks: 'มาร์ก',
          header: 'หัวงาน',
        },
        cutNames: cutNames(),
        sheets: r.sheets.map(function (sh, i) {
          var copies = {};
          var marks = [];
          sh.marks.forEach(function (g) {
            g.parts.forEach(function (m) {
              marks.push(toPtShape(m));
            });
          });
          return {
            w: r.plan.width * PT,
            h: sh.length * PT,
            name: 'แผ่น ' + (i + 1),
            pieces: sh.placements.map(function (pl) {
              var p = byIdx(pl.partId);
              copies[pl.partId] = (copies[pl.partId] || 0) + 1;
              var c = B.placementForIllustrator(pl);
              return { part: pl.partId, angle: c.angle, tx: c.tx, ty: c.ty, name: p.name + ' #' + copies[pl.partId] };
            }),
            marks: marks,
            header: headerPayload(sh, i, n),
            gridLines: grid
              ? gridLines(sh).map(function (l) {
                  return [l.points[0][0] * PT, l.points[0][1] * PT, l.points[1][0] * PT, l.points[1][1] * PT];
                })
              : [],
          };
        }),
      };
  }

  // คำเตือน (bleed เกิน / ไม่พบเส้นไดคัท) ต้องให้ร้านกดยืนยันก่อนสร้างชีต
  function confirmWarnings() {
    var w = (S.result && S.result.warnings) || [];
    if (!w.length || host.demo) return true;
    return window.confirm('⚠ ' + w.join('\n\n⚠ ') + '\n\nสร้างชีตต่อเลยไหม?');
  }

  function buildLayout() {
    return ensureNested().then(function () {
      if (!confirmWarnings()) throw new Error('ยกเลิกแล้ว — แก้ไฟล์/ระยะห่างแล้วกดคำนวณใหม่');
      var target = S.settings.target === 'document' ? 'document' : 'artboard';
      status('กำลังสร้างชีตไดคัทใน Illustrator (' + S.result.res.placedCount + ' ดวง)…');
      progress(0.85);
      return host.call('np_buildLayout', layoutPayload(target)).then(function (out) {
        S.built = true;
        status(
          (out.newDocument ? 'สร้างไฟล์ “' + out.document + '”' : 'สร้างอาร์ตบอร์ดใหม่ใน “' + out.document + '”') +
            ' แล้ว: ' + out.pieces + ' ดวง ' + out.sheets + ' แผ่น (ของเดิมไม่ถูกย้าย)',
          'ok'
        );
      });
    });
  }

  // ---------------------------------------------------------------- ส่งออก

  function fileBase() {
    var d = new Date();
    function two(n) {
      return (n < 10 ? '0' : '') + n;
    }
    var stamp = d.getFullYear() + two(d.getMonth() + 1) + two(d.getDate()) + '-' + two(d.getHours()) + two(d.getMinutes());
    return NC.pack.safeFileName(S.settings.jobName || 'nesting', 'nesting').replace(/\s+/g, '_') + '_' + stamp;
  }

  // เส้นตัดแบบตาราง: ลากยาวตามขอบทุกแถว/คอลัมน์ ตัดทีเดียวทั้งแผ่น (ใช้กับการเรียงแบบตาราง)
  // เส้นจะเว้นช่วงที่ผ่านกลางดวงอื่น — ดวงขนาดต่างกันจะไม่โดนตัดขาด
  function gridLines(sh) {
    var boxes = [];
    sh.placements.forEach(function (pl) {
      var p = byIdx(pl.partId);
      if (!p || !p.rings.length) return;
      boxes.push(G.bounds(G.transformRings([bboxRing(p.rings)], pl)));
    });
    return L.gridSegments(boxes);
  }

  function useGridCut() {
    return !!S.settings.gridCut && gridMode();
  }

  function cutPaths(sh) {
    if (useGridCut()) return gridLines(sh);
    var out = [];
    sh.placements.forEach(function (pl) {
      var p = byIdx(pl.partId);
      if (!p) return;
      p.polys.forEach(function (poly) {
        out.push({
          closed: poly.closed,
          points: poly.points.map(function (q) {
            return G.transformPoint(q, pl);
          }),
        });
      });
    });
    return out;
  }

  // รูปพรีวิวส่งลูกค้า กว้าง 1600 px — รูปที่โหลดจาก file:// ทำให้แคนวาส "ติดเชื้อ" ส่งออกไม่ได้
  // ถ้าเจอ วาดใหม่แบบไม่มีรูป (ระบายสีแทน) แล้วค่อยส่ง
  function previewBase64() {
    var c = document.createElement('canvas');
    renderSheets(c, 1600, 1);
    try {
      return c.toDataURL('image/png').split(',')[1];
    } catch (e) {
      S.plainPreview = true;
      try {
        renderSheets(c, 1600, 1);
        return c.toDataURL('image/png').split(',')[1];
      } finally {
        S.plainPreview = false;
      }
    }
  }

  function exportAll() {
    var s = S.settings;
    var files = [];
    var folder;
    var base = fileBase();
    return ensureNested()
      .then(function () {
        if (s.folder) return { folder: s.folder };
        return host.call('np_defaultFolder', {});
      })
      .then(function (f) {
        folder = f.folder;
        host.makeDir(folder);
        if ((s.outPdf || s.outAi) && !host.demo) {
          // PDF/AI ทำจากไฟล์ชั่วคราวแยกต่างหาก ไฟล์งานของร้านไม่ถูกบันทึกทับ
          status('กำลังเตรียมไฟล์ PDF / AI…');
          progress(0.92);
          return host
            .call('np_buildLayout', layoutPayload('document'))
            .then(function () {
              return host.call('np_export', { folder: folder, base: base, pdf: !!s.outPdf, ai: !!s.outAi, pdfPreset: '[PDF/X-4:2008]' });
            })
            .then(function (r) {
              files = files.concat(r.files);
              if (!s.outAi) return host.call('np_closeLayout', {});
            });
        }
      })
      .then(function () {
        var r = S.result;
        var n = r.sheets.length;
        r.sheets.forEach(function (sh, i) {
          var suffix = n > 1 ? '-' + (i + 1) : '';
          var paths = NC.cutfile.orderPaths(cutPaths(sh), [0, 0]);
          var size = { width: r.plan.width, length: sh.length };
          var at = folder + '/' + base + suffix;
          if (s.outPlt) files.push(host.writeText(at + '.plt', NC.cutfile.toHPGL(paths, size, { feed: s.pltFeed, overcut: num('overcut') })));
          if (s.outDxf) files.push(host.writeText(at + '.dxf', NC.cutfile.toDXF(paths, size)));
          if (s.outSvg) files.push(host.writeText(at + '.svg', NC.cutfile.toSVG(paths, size, { title: base, marks: sh.marks })));
        });
        if (s.outPng) files.push(host.writeBase64(folder + '/' + base + '-preview.png', previewBase64()));
        progress(1);
        status('ส่งออกแล้ว ' + files.length + ' ไฟล์ → ' + folder, 'ok');
      });
  }

  function go() {
    return Promise.resolve()
      .then(function () {
        if (!S.parts.length) return scan();
      })
      .then(prepareCuts)
      .then(nestNow)
      .then(function () {
        if (host.demo) return;
        return buildLayout().then(exportAll);
      })
      .then(function () {
        var r = S.result;
        var used = r.sheets.reduce(function (a, sh) {
          return a + sh.length;
        }, 0);
        var msg = host.demo
          ? 'จัดวางเสร็จ! (โหมดทดลอง) กด “ส่งออก” เพื่อดาวน์โหลด PLT / DXF / SVG'
          : 'เสร็จแล้วจ้า! ' + r.res.placedCount + ' ชิ้น ยาว ' + Math.round(used) + ' มม. — ส่งไฟล์เข้าเครื่องตัดได้เลย';
        status(msg, 'ok');
      });
  }

  function selectCutLines() {
    return host.call('np_selectCutLines', { cutNames: cutNames(), detectRed: !!S.settings.detectRed }).then(function (r) {
      status('เลือกเส้นตัดแล้ว ' + r.count + ' เส้น — กดส่งผ่านปลั๊กอินเครื่องตัด (Cutting Master / CutStudio / FineCut) ได้เลย', 'ok');
    });
  }

  // ---------------------------------------------------------------- ฟอร์มค่าตั้ง

  var NEST_KEYS = [
    'width', 'length', 'sizeUnit', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight', 'gridCut', 'spacing', 'rotation', 'quality', 'respectBleed', 'markType', 'markSize',
    'markInset', 'markThick', 'markClearance', 'markEvery', 'headerOn', 'headerHeight', 'cutter', 'media',
    'arrange', 'fillSheet',
  ];

  function fields() {
    return Array.prototype.slice.call(document.querySelectorAll('[data-setting]'));
  }

  function writeField(key) {
    var f = document.querySelector('[data-setting="' + key + '"]');
    if (!f) return;
    if (f.type === 'checkbox') f.checked = !!S.settings[key];
    else f.value = S.settings[key] == null ? '' : S.settings[key];
  }

  function setSetting(key, value) {
    S.settings[key] = value;
    writeField(key);
  }

  function applyCutter(id) {
    var c = L.cutter(id);
    if (!c) return;
    setSetting('markType', c.marks.type);
    if (c.marks.type !== 'none') {
      setSetting('markSize', c.marks.size);
      setSetting('markInset', c.marks.inset);
      setSetting('markThick', c.marks.thick || 0.5);
      setSetting('markClearance', c.marks.clearance);
      setSetting('markEvery', c.marks.every || 0);
    }
    setSetting('headerOn', c.header !== false);
    $('cutterNote').textContent = c.note || '';
  }

  function applyMedia(id) {
    var m = L.media(id);
    if (!m || id === 'custom') return;
    var k = unitK();
    setSetting('width', Math.round((m.width / k) * 100) / 100);
    setSetting('length', m.length ? Math.round((m.length / k) * 100) / 100 : '');
  }

  function fillSelect(id, list) {
    var sel = $(id);
    list.forEach(function (it) {
      var o = el('option', null, it.label);
      o.value = it.id;
      sel.appendChild(o);
    });
  }

  function bindSettings() {
    fillSelect('cutter', L.CUTTERS);
    fillSelect('media', L.MEDIA);
    fields().forEach(function (f) {
      var key = f.getAttribute('data-setting');
      writeField(key);
      f.addEventListener('change', function () {
        S.settings[key] = f.type === 'checkbox' ? f.checked : f.value;
        if (key === 'cutter') applyCutter(f.value);
        if (key === 'sizeUnit' && S.settings.media === 'custom') {
          // กำหนดเอง: แปลงตัวเลขเดิมเป็นหน่วยใหม่
          var r = f.value === 'in' ? 1 / 25.4 : 25.4;
          ['width', 'length'].forEach(function (k2) {
            var v = parseFloat(S.settings[k2]);
            if (v > 0) setSetting(k2, Math.round(v * r * 100) / 100);
          });
        } else if (key === 'media' || key === 'sizeUnit') applyMedia(S.settings.media);
        if ((key === 'width' || key === 'length') && S.settings.media !== 'custom') setSetting('media', 'custom');
        if (key === 'cutMode') {
          S.parts.forEach(function (p) {
            if (p.mode !== 'contour') p.mode = defaultMode(p);
          });
          renderParts();
        }
        saveSettings();
        if (NEST_KEYS.indexOf(key) >= 0) markStale();
        else S.built = false;
        if (S.result && !S.stale) drawPreview();
      });
    });
    var c = L.cutter(S.settings.cutter);
    $('cutterNote').textContent = c ? c.note : '';
    renderLogoName();
  }

  function renderLogoName() {
    $('logoName').textContent = S.settings.logoFile ? 'โลโก้: ' + S.settings.logoFile.split(/[\\/]/).pop() : 'ใช้โลโก้นัดพอน';
  }

  function loadLogoImg() {
    // ใน Illustrator อ่านเป็น data URL (รูปจาก file:// ทำให้ส่งออกพรีวิวเป็น PNG ไม่ได้)
    var file = host.demo ? '' : S.settings.logoFile || host.extensionRoot() + '/assets/logo.png';
    var mime = /\.jpe?g$/i.test(file) ? 'image/jpeg' : 'image/png';
    var src;
    try {
      src = file ? 'data:' + mime + ';base64,' + host.readBase64(file) : 'assets/logo.png';
    } catch (e) {
      src = 'assets/logo.png';
    }
    return loadImage(src)
      .then(function (img) {
        S.logoImg = img;
        if (S.settings.logoFile) {
          S.settings.logoAspect = img.width / img.height;
          saveSettings();
        }
        if (S.result) drawPreview();
      })
      .catch(function () {
        S.logoImg = null;
      });
  }

  function pickLogo() {
    var path = host.openFile('เลือกรูปโลโก้ (PNG / JPG)', ['png', 'jpg', 'jpeg']);
    if (!path) return;
    S.settings.logoFile = path;
    saveSettings();
    renderLogoName();
    S.built = false;
    loadLogoImg();
  }

  function applySkin() {
    var c = host.skin && host.skin();
    if (!c) return;
    var light = (c.r * 299 + c.g * 587 + c.b * 114) / 1000 > 140;
    document.documentElement.classList.toggle('light', light);
    // โลโก้ตัวอักษรขาวสำหรับพื้นเข้ม / สีกรมสำหรับพื้นสว่าง
    var brand = document.querySelector('.brand img');
    if (brand) brand.src = light ? 'assets/logo.png' : 'assets/logo-panel.png';
    document.documentElement.style.setProperty('--bg', 'rgb(' + Math.round(c.r) + ',' + Math.round(c.g) + ',' + Math.round(c.b) + ')');
  }

  // ---------------------------------------------------------------- เริ่ม

  function init() {
    bindSettings();
    applySkin();
    if (host.onSkinChange) host.onSkinChange(applySkin);
    loadLogoImg();

    if (host.demo) {
      $('demoBanner').hidden = false;
      $('btnImport').hidden = true;
      $('btnAddPng').hidden = false;
      $('btnScan').textContent = 'โหลดชิ้นงานตัวอย่าง';
      $('secHowto').open = false;
    }

    $('btnScan').onclick = function () {
      run(scan);
    };
    $('btnImport').onclick = function () {
      run(importPack);
    };
    $('btnAddPng').onclick = function () {
      $('pngInput').click();
    };
    $('pngInput').onchange = function () {
      // คัดลอกออกมาก่อน — ล้างค่า input แล้ว FileList เดิมจะว่างตาม
      var files = Array.prototype.slice.call($('pngInput').files || []);
      if (!files.length) return;
      run(function () {
        return host.addPngFiles(files).then(scan);
      });
      $('pngInput').value = '';
    };
    $('btnGo').onclick = function () {
      run(go);
    };
    $('btnNest').onclick = function () {
      run(function () {
        return (S.parts.length ? Promise.resolve() : scan()).then(prepareCuts).then(nestNow);
      });
    };
    $('btnBuild').onclick = function () {
      run(buildLayout);
    };
    $('btnExport').onclick = function () {
      run(exportAll);
    };
    $('btnSelectCut').onclick = function () {
      run(selectCutLines);
    };
    $('btnFolder').onclick = function () {
      run(function () {
        return host.call('np_chooseFolder', { title: 'เลือกโฟลเดอร์สำหรับไฟล์ส่งออก' }).then(function (r) {
          if (r.folder) setSetting('folder', r.folder);
          saveSettings();
        });
      });
    };
    $('btnLogo').onclick = pickLogo;
    $('btnLogoReset').onclick = function () {
      S.settings.logoFile = '';
      S.settings.logoAspect = 0;
      saveSettings();
      renderLogoName();
      S.built = false;
      loadLogoImg();
    };
    placePreview();
    window.addEventListener('resize', placePreview);

    if (host.demo) {
      run(scan).then(function () {
        status('โหมดทดลอง: มีชิ้นงานตัวอย่างให้แล้ว กด “เจ๊หญิงสั่งลุย!” ได้เลย');
      });
    } else {
      host
        .call('np_ping', {})
        .then(function (p) {
          status('พร้อมลุย — เลือกชิ้นงานแล้วกด “ดึงชิ้นงานที่เลือก” (Illustrator ' + p.app + ')');
        })
        .catch(function (e) {
          status(errText(e), 'err');
        });
    }
  }

  // เปิดให้เทสต์เรียกได้
  window.NPPanel = { state: S, go: go, nestNow: nestNow, exportAll: exportAll, cutPaths: cutPaths };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
