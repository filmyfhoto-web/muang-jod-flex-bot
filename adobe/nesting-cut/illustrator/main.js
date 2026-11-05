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
  var P = NC.price;
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
    NO_REG_LAYERS: 'ไฟล์ที่เปิดอยู่ไม่มีเลเยอร์มาร์กของ Cutting Master (margin / color / reg_1) — เปิดไฟล์ต้นแบบ Graphtec ของร้านก่อน',
    NO_REG_MARKS: 'เจอเลเยอร์ reg_1 แต่ไม่มีมาร์กบนอาร์ตบอร์ดที่เปิดอยู่ — คลิกอาร์ตบอร์ดที่มีมาร์กแล้วลองใหม่',
    CANVAS_FULL: 'แผ่นงานยาว/เยอะเกินพื้นที่ของ Illustrator — ลดความยาวหรือแบ่งงานเป็นหลายรอบ',
    NO_LAYOUT: 'ไฟล์ชีตไดคัทถูกปิดไปแล้ว — กด “สร้างชีต” ใหม่',
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
  // ค่าที่บันทึกจากรุ่นก่อน UI_VERSION: หัวงานเคยเปิดเป็นค่าเริ่มต้น → ปิดให้ครั้งเดียว
  var UI_VERSION = 6;
  var PANEL_VERSION = '1.7.0'; // ต้องตรงกับ CSXS/manifest.xml — โชว์มุมล่างขวาของแผง ให้ร้านเช็กว่าได้รุ่นใหม่
  var PV_W = 300; // กรอบพรีวิวขนาดคงที่ (px) — ต้องตรงกับ #previewBox ใน panel.css
  var PV_H = 400;
  var WIDE_MIN = 734; // แผงกว้างพอวางพรีวิว (334) คู่ช่องคำสั่ง (400) — ตรงกับ --pv-col + --ctl-w ใน panel.css
  // ชื่ออาร์ตบอร์ดของชีตที่ปลั๊กอินสร้าง — ปุ่ม “ล้างงานเก่า” ใช้หาชีตเก่า
  var SHEET_MARK = 'นัดพอน · ';
  var DEFAULTS = {
    uiVersion: UI_VERSION,
    tool: 'nest',
    guideSeen: false, // เคยเห็นการ์ด “วันนี้จะทำอะไร?” แล้ว
    layoutMode: 'auto', // auto | side | stack — ตำแหน่งพรีวิว
    cutter: 'graphtec',
    media: 'artboard', // เรียงลงอาร์ตบอร์ดเทมเพลตร้านที่เปิดอยู่
    sizeUnit: 'in',
    width: 13,
    length: 19,
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
    fillSheet: true, // เต็มแผ่น: ดวงแบบแรกใส่ให้ได้มากที่สุด
    rectButt: true, // ป้ายสี่เหลี่ยม: วางชิดกันเป็นตาราง ตัดเส้นตรงยาว (แบบไฟล์งานสีดำ)
    target: 'artboard',
    cutMode: 'none',
    detectRed: true,
    printLayer: 'ไฟล์ปริ้นชิ้นงาน',
    cutLayer: 'เส้นไดคัท',
    cutOffset: 2,
    boxRadius: 0,
    spotName: 'CutContour',
    strokeWidth: 0.25,
    markType: 'graphtec', // L 4 มุมรอบงานแบบ Cutting Master 5
    markSize: 8,
    markInset: 10,
    markThick: 1,
    markClearance: 1,
    markEvery: 0,
    gtMarks: null, // มาร์ก Graphtec ที่จำจากไฟล์ต้นแบบของร้าน (np_readMarks)
    shopSize: null, // ขนาดงานตัดหน้าร้านที่แก้เอง { w, l } มม.
    sheetPrice: '', // ราคาที่ลูกค้าจ่ายต่อแผ่น (บาท) ของขนาดที่เลือกอยู่ (ม้วน = ต่อเมตร)
    prices: {}, // ราคาแยกตามขนาดกระดาษ { media: บาท }
    orderQty: '', // จำนวนดวงที่ลูกค้าสั่ง (งานดวงเดียวซ้ำ) — ว่าง = ตามพรีวิว
    priceInHeader: true, // พิมพ์ราคาต่อท้ายหมายเหตุบนหัวงาน (เมื่อเปิดหัวงาน)
    headerOn: false, // หัวงาน (โลโก้ + ชื่องาน) ด้านบนแผ่น — ปิดไว้ ร้านเปิดเองในขั้น “กระดาษ”
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
    // ไดคัทต่อเนื่อง
    runMaterial: '',
    runGram: '',
    runShape: 'rounded',
    runSize: 'art',
    runW: 50,
    runH: 30,
    runRadius: 3,
    runGap: 3,
    runLayout: 'straight',
    // ไดคัทตามรูปทรง
    dcSource: 'all',
    dcOffset: 0,
    dcJoin: 'round',
    dcMiter: 4,
    dcHoles: false,
    dcTol: 40,
    dcShadow: 50,
    dcDetail: 100,
    dcLayer: 'Die cut',
    dcWidth: 0.25,
    dcColor: 'red',
    // ทำมุมโค้ง (CNC)
    cnIn: 1.5875,
    cnOut: 0,
    cnMode: 'copy',
    cnFlags: true,
    // หาเส้นกลาง (LED)
    ledWidth: 6,
    ledRadius: 15,
    ledMargin: 10,
    ledLayer: 'เส้นกลาง',
    // เส้นบอกขนาด
    dimScope: 'all',
    dimAxis: 'both',
    dimUnit: 'mm',
    dimScale: '1',
    dimScaleCustom: 1,
    dimSide: 'auto',
    dimColor: '#e6007e',
    dimSize: 9,
    dimStroke: 0.5,
    dimDecimals: 1,
    dimOffset: 8,
    dimLayer: 'Dimension',
    dimClear: false,
    // รันนัมเบอร์
    numMode: 'text',
    numStart: 1,
    numStep: 1,
    numPrefix: '',
    numSuffix: '',
    numPadMode: 'auto',
    numPad: 3,
    numOrder: 'rows',
    numToken: false,
    numPos: 'bottom-center',
    numMargin: 10,
    numSkip: 0,
    numMirror: false,
    numClear: true,
    numLayer: 'เลขหน้า',
    numStyle: 'keep',
    numFont: '',
    numSize: 12,
    numColor: '#000000',
    numAlign: 'center',
    numUnderline: false,
    // ตรายางเลเซอร์
    stShape: 'rounded',
    stMargin: 2,
    stRadius: 2,
    stGroup: 'one',
    stMirror: true,
    stNegative: true,
    stCutWidth: 0.01,
    stCutLayer: 'เส้นตัดเลเซอร์',
    stEngraveLayer: 'งานแกะเลเซอร์',
    // ปุ่มลัด
    hkKey: 'F5',
    hkCmd: false,
    hkShift: false,
  };

  function loadSettings() {
    var s = {};
    for (var k in DEFAULTS) s[k] = DEFAULTS[k];
    try {
      var saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
      for (var j in saved) if (j in DEFAULTS) s[j] = saved[j];
      if (!(saved.uiVersion >= 3)) s.headerOn = false;
      if (!(saved.uiVersion >= 4)) {
        // รุ่น 4: ร้านใช้เทมเพลต 13×19 นิ้ว (มาร์ก CM5 + หัวงาน) → เรียงลงอาร์ตบอร์ดที่เปิดอยู่ + เต็มแผ่น
        s.media = 'artboard';
        s.sizeUnit = 'in';
        s.width = 13;
        s.length = 19;
        s.fillSheet = true;
        s.shopSize = null;
      }
      if (!(saved.uiVersion >= 5) && s.markType === 'graphtec') {
        // รุ่น 5: มาร์ก Graphtec ตามไฟล์ CM5 ของร้าน — L ยาว 8 หนา 1 มม. ล้อมงาน
        s.markSize = 8;
        s.markThick = 1;
        s.markInset = 10;
        s.markClearance = 3;
      }
      if (!(saved.uiVersion >= 6) && s.markType === 'graphtec') s.markClearance = 1; // ไฟล์ CM5 ของร้าน: มาร์กห่างงาน ~1 มม.
      s.uiVersion = UI_VERSION;
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
    results: {},
    dc: null,
    busy: false,
    logoImg: null,
    page: 1, // หน้าของจัดวางดวง / ไดคัทต่อเนื่อง: 1 ชิ้นงาน · 2 กระดาษ · 3 สร้างชีต · 4 ส่งออก
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

  var STATUS_ID = { shape: 'dcStatus', corner: 'cnStatus', led: 'ledStatus', stamp: 'stStatus', dim: 'dimStatus', number: 'numStatus', hotkey: 'hkStatus' };

  function status(text, kind) {
    var el = $(STATUS_ID[S.settings.tool] || 'status');
    el.textContent = text;
    el.className = 'status' + (kind ? ' ' + kind : '');
  }

  function progress(f) {
    var bar = $(S.settings.tool === 'shape' ? 'dcBar' : STATUS_ID[S.settings.tool] ? '' : 'progressBar');
    if (!bar) return;
    bar.style.width = Math.round(Math.max(0, Math.min(1, f)) * 100) + '%';
  }

  // ปุ่มทุกปุ่ม (ยกเว้นแถบเครื่องมือ) ปิดระหว่างทำงาน
  function actionButtons() {
    return Array.prototype.slice.call(document.querySelectorAll('button:not([data-tool])'));
  }

  function run(fn) {
    if (S.busy) return Promise.resolve();
    S.busy = true;
    var locked = actionButtons().filter(function (b) {
      return !b.disabled;
    });
    locked.forEach(function (b) {
      b.disabled = true;
    });
    progress(0.02);
    return Promise.resolve()
      .then(fn)
      .then(
        function () {
          return true;
        },
        function (e) {
          console.error(e);
          status(errText(e), 'err');
          return false;
        }
      )
      .then(function (ok) {
        S.busy = false;
        locked.forEach(function (b) {
          b.disabled = false;
        });
        updateFlow();
        setTimeout(function () {
          if (!S.busy) progress(0);
        }, 600);
        return ok;
      });
  }

  function markStale() {
    if (S.result) S.stale = true;
    S.built = false;
    S.exported = false;
    updateFlow();
    renderCost();
    $('previewSub').textContent = S.stale ? '(กำลังคำนวณใหม่…)' : '';
    autoCalc();
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
    // ยังไม่มีชิ้นงาน: ปุ่มส้มด้านล่างคือปุ่มดึง — มีแล้วค่อยโชว์ปุ่มดึงใหม่ในการ์ด
    $('btnScan').hidden = !S.parts.length;
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
      S.exported = false;
      if (host.thumbFor) {
        S.parts.forEach(function (p) {
          p.thumb = host.thumbFor(p.idx);
        });
      }
      renderParts();
      clearPreview();
      updateFlow();
      status('ได้ ' + S.parts.length + ' แบบ จาก “' + res.document + '” — กำลังเตรียมพรีวิว…', 'ok');
      autoCalc();
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

  function prepareCuts(only) {
    var todo = S.parts.filter(function (p) {
      if (only && only.indexOf(p) < 0) return false;
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
    var gt = gtTemplate();
    if (gt) return { type: 'graphtec', custom: gt, clearance: num('markClearance') };
    return {
      type: s.markType,
      size: num('markSize'),
      inset: num('markInset'),
      thick: num('markThick'),
      clearance: num('markClearance'),
      every: num('markEvery'),
      square: 5,
      // มาร์ก Graphtec สีดำ 4 สีแบบที่ CM5 ใส่ (C75 M68 Y67 K90)
      color: s.markType === 'graphtec' ? [75, 68, 67, 90] : null,
    };
  }

  // ---------------------------------------------------------------- มาร์ก Graphtec (Cutting Master)

  // มาร์กที่จำจากไฟล์ต้นแบบ → รูปแบบที่ core/layout.js ใช้ (มม.) — ไม่ได้เลือกมาร์ก Graphtec / ยังไม่ได้จำ = null
  function gtTemplate() {
    var t = S.settings.gtMarks;
    if (S.settings.markType !== 'graphtec' || !t || !t.items || !t.items.length) return null;
    return {
      w: t.w,
      h: t.h,
      items: t.items.map(function (it, i) {
        return { box: it.box, poly: it.poly, closed: it.closed, fill: !!it.fill, sw: it.sw * K, src: i };
      }),
    };
  }

  // ผลจาก np_readMarks (pt, y ลง) → เก็บไว้ในค่าตั้ง พร้อมรูปเส้นตรง (มม.) ไว้วาดพรีวิว/กันพื้นที่
  function gtFromHost(r) {
    var items = r.items.map(function (it) {
      var bez = it.pts.map(function (q) {
        return { a: [q[0] * K, q[1] * K], l: [q[2] * K, q[3] * K], r: [q[4] * K, q[5] * K] };
      });
      var poly = G.flattenBezier(bez, it.closed, 0.05);
      var b = G.bounds([poly]);
      var half = it.stroke ? (it.sw * K) / 2 : 0;
      return {
        layer: it.layer,
        closed: it.closed,
        cp: it.cp || 0,
        fill: it.fill,
        stroke: it.stroke,
        sw: it.stroke ? it.sw : 0,
        pts: it.pts,
        poly: poly.map(function (q) {
          return [Math.round(q[0] * 1000) / 1000, Math.round(q[1] * 1000) / 1000];
        }),
        box: { x: b.minX - half, y: b.minY - half, w: b.maxX - b.minX + 2 * half, h: b.maxY - b.minY + 2 * half },
      };
    });
    return { file: r.document, w: r.w * K, h: r.h * K, layers: r.layers, items: items };
  }

  function learnMarks() {
    return host.call('np_readMarks', {}).then(function (r) {
      S.settings.gtMarks = gtFromHost(r);
      setSetting('markType', 'graphtec');
      saveSettings();
      markStale();
      renderGtInfo();
      var t = S.settings.gtMarks;
      status(
        'จำมาร์กจาก “' + t.file + '” แล้ว: ' + t.items.length + ' ชิ้น · ' + t.layers.length + ' เลเยอร์ (' +
          t.layers.map(function (n) { return n.split(' ')[0]; }).join(' / ') + ') · หน้า ' + fmtSize(t.w, t.h),
        'ok'
      );
    });
  }

  function forgetMarks() {
    S.settings.gtMarks = null;
    saveSettings();
    markStale();
    renderGtInfo();
    status('กลับไปใช้มาร์ก Graphtec มาตรฐาน (L 4 มุม ลงเลเยอร์ reg_1)', 'ok');
  }

  // ขนาด มม. → "12.6 × 19 นิ้ว" หรือ "297 × 420 มม." ตามหน่วยที่เลือก
  function fmtSize(w, l) {
    var k = unitK();
    function f(v) {
      return Math.round((v / k) * 100) / 100;
    }
    return f(w) + ' × ' + (l ? f(l) : 'ม้วน') + (k === 1 ? ' มม.' : ' นิ้ว');
  }

  function renderGtInfo() {
    var box = $('gtBox');
    if (!box) return;
    var t = S.settings.gtMarks;
    box.hidden = S.settings.markType !== 'graphtec';
    $('gtInfo').textContent = t
      ? '✓ ใช้มาร์กจากไฟล์ “' + t.file + '” (' + t.items.length + ' ชิ้น · หน้า ' + fmtSize(t.w, t.h) + ') ลงเลเยอร์ชื่อเดียวกับไฟล์ต้นแบบ'
      : 'มาร์กมาตรฐาน: L 4 มุม ลงเลเยอร์ reg_1 แบบ Cutting Master — ให้เหมือนไฟล์ร้านเป๊ะ: เปิดไฟล์ต้นแบบ Graphtec แล้วกด “จำมาร์ก”';
    $('btnForgetMarks').hidden = !t;
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

  // ---------------------------------------------------------------- กรอบงาน + จัดกลาง

  // กรอบงานจริงของแผ่น (มม.): เส้นตัดทุกดวง + งานพิมพ์ที่เลยเส้นตัด — มาร์ก Graphtec ล้อมกรอบนี้
  function contentBox(sh) {
    var b = null;
    function add(bb, pad) {
      if (!bb || !isFinite(bb.minX)) return;
      bb = { minX: bb.minX - pad, minY: bb.minY - pad, maxX: bb.maxX + pad, maxY: bb.maxY + pad };
      b = b
        ? { minX: Math.min(b.minX, bb.minX), minY: Math.min(b.minY, bb.minY), maxX: Math.max(b.maxX, bb.maxX), maxY: Math.max(b.maxY, bb.maxY) }
        : bb;
    }
    if (sh.cutPaths && sh.cutPaths.length) {
      add(
        G.bounds(
          sh.cutPaths.map(function (l) {
            return l.points;
          })
        ),
        0
      );
    } else {
      sh.placements.forEach(function (pl) {
        var p = byIdx(pl.partId);
        if (p) add(G.bounds(G.transformRings(p.rings.length ? p.rings : [vbRing(p.vb)], pl)), rawBleed(p));
      });
    }
    return b ? { x: b.minX, y: b.minY, w: b.maxX - b.minX, h: b.maxY - b.minY } : null;
  }

  function boxHit(a, o) {
    return a.x < o.x + o.w && o.x < a.x + a.w && a.y < o.y + o.h && o.y < a.y + a.h;
  }

  // เลื่อนทั้งก้อนไปกลางแผ่นตามแนวนอน (ไม่ชนของบนแผ่น/เทมเพลต)
  function centerSheet(plan, sh) {
    var b = contentBox(sh);
    if (!b || plan.roll) return;
    var dx = plan.area.x + plan.area.w / 2 - (b.x + b.w / 2);
    dx = Math.max(plan.area.x - b.x, Math.min(plan.area.x + plan.area.w - b.x - b.w, dx));
    if (!(Math.abs(dx) > 0.5)) return;
    var hit = sh.placements.some(function (pl) {
      var p = byIdx(pl.partId);
      if (!p) return false;
      var pb = G.bounds(G.transformRings(p.rings.length ? p.rings : [vbRing(p.vb)], pl));
      var r = { x: pb.minX + dx, y: pb.minY, w: pb.maxX - pb.minX, h: pb.maxY - pb.minY };
      return (plan.obstacles || []).some(function (o) {
        return boxHit(r, o);
      });
    });
    if (hit) return;
    sh.placements.forEach(function (pl) {
      pl.tx += dx;
      if (pl.cx != null) pl.cx += dx;
    });
  }

  // มาร์กชนของบนเทมเพลต (หัวงาน/โลโก้) ไหม
  function marksHitTemplate(plan, sheets) {
    if (!plan.template) return false;
    return sheets.some(function (sh) {
      return sh.marks.some(function (g) {
        return plan.template.boxes.some(function (o) {
          return boxHit(g.bbox, o);
        });
      });
    });
  }

  // ---------------------------------------------------------------- เทมเพลตร้าน (อาร์ตบอร์ดที่เปิดอยู่)

  function templateMode() {
    return S.settings.media === 'artboard';
  }

  // แผ่น = อาร์ตบอร์ดเทมเพลต: พื้นที่วาง = กรอบมาร์ก CM5 (เลเยอร์ reg_*) ถ้าไม่มีมาร์กใช้ระยะขอบแทน
  // ของบนเทมเพลต (มาร์ก หัวงาน โลโก้ QR) เป็นที่ห้ามวาง — มาร์กเว้นขาวรอบ ๆ 3 มม.
  function templatePlan(t) {
    S.tpl = t;
    var W = t.w * K;
    var H = t.h * K;
    var gap = Math.max(0.2, num('spacing'));
    var boxes = t.boxes.map(function (b) {
      return { x: b.x * K, y: b.y * K, w: b.w * K, h: b.h * K, mark: !!b.mark };
    });
    // เทมเพลตไม่มีมาร์ก CM5 → ใส่มาร์ก L 4 มุมรอบงานให้ (ถ้าเลือกมาร์ก Graphtec)
    var marks = !t.frame && S.settings.markType === 'graphtec' && !gtTemplate() ? markSpec() : { type: 'none' };
    var reach = L.isCm5(marks) ? L.cm5Reach(marks) : 0;
    var x0 = Math.max(num('marginLeft'), reach);
    var y0 = Math.max(num('marginTop'), reach);
    var area = t.frame
      ? markInner(boxes, { x: t.frame.x * K, y: t.frame.y * K, w: t.frame.w * K, h: t.frame.h * K })
      : { x: x0, y: y0, w: W - x0 - Math.max(num('marginRight'), reach), h: H - y0 - Math.max(num('marginBottom'), reach) };
    S.tplMarks = L.isCm5(marks);
    renderTplInfo();
    return {
      width: W,
      roll: false,
      fixedLength: H,
      pageLength: H,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      marks: marks,
      markClearance: 0,
      markExtent: 0,
      area: area,
      // มาร์กของเทมเพลตอยู่นอกพื้นที่วางอยู่แล้ว (วางในกรอบด้านในของมาร์ก) — หลบเฉพาะหัวงาน/ของอื่น
      obstacles: boxes
        .filter(function (b) {
          return !(t.frame && b.mark);
        })
        .map(function (b) {
          var c = b.mark ? 3 : gap / 2;
          return { x: b.x - c, y: b.y - c, w: b.w + 2 * c, h: b.h + 2 * c };
        }),
      headerBox: null,
      template: { abIndex: t.abIndex, boxes: boxes, framed: !!t.frame },
    };
  }

  // กรอบด้านในของมาร์ก 4 มุม (ขอบในของมาร์กซ้าย/ขวา/บน/ล่าง) = ที่วางงานแบบไฟล์ CM5 ของร้าน
  function markInner(boxes, frame) {
    var cx = frame.x + frame.w / 2;
    var cy = frame.y + frame.h / 2;
    var x0 = frame.x;
    var x1 = frame.x + frame.w;
    var y0 = frame.y;
    var y1 = frame.y + frame.h;
    boxes.forEach(function (b) {
      if (!b.mark) return;
      if (b.x + b.w / 2 < cx) x0 = Math.max(x0, b.x + b.w);
      else x1 = Math.min(x1, b.x);
      if (b.y + b.h / 2 < cy) y0 = Math.max(y0, b.y + b.h);
      else y1 = Math.min(y1, b.y);
    });
    if (!(x1 - x0 > 10 && y1 - y0 > 10)) return frame;
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  function planNow() {
    if (!templateMode()) return Promise.resolve(L.planSheet(sheetSpec()));
    status('กำลังอ่านเทมเพลตที่เปิดอยู่…');
    return host.call('np_readTemplate', {}).then(templatePlan);
  }

  function renderTplInfo() {
    var t = S.tpl;
    var lines = [];
    if (!t) {
      lines.push('เปิดไฟล์เทมเพลตของร้าน (มาร์ก CM5 + หัวงาน) แล้วคลิกอาร์ตบอร์ดนั้นให้ทำงานอยู่');
      lines.push('ดวงจะเรียงลงที่ว่างในอาร์ตบอร์ด — มาร์ก หัวงาน โลโก้ QR อยู่ที่เดิม ไม่ต้องสร้างมาร์กใหม่');
    } else {
      lines.push('✓ “' + t.document + '” · อาร์ตบอร์ด ' + (t.abIndex + 1) + ' · ' + fmtSize(t.w * K, t.h * K));
      lines.push(
        t.frame
          ? 'มาร์ก CM5 ' + t.marks + ' ชิ้น — วางในกรอบมาร์ก · หลบของบนเทมเพลต ' + (t.boxes.length - t.marks) + ' ชิ้น'
          : (S.tplMarks
              ? 'ไม่มีมาร์กในเทมเพลต — ใส่มาร์ก L 4 มุมรอบงาน (┘└┐┌ ยาว ' + num('markSize') + ' หนา ' + num('markThick') + ' มม.) ลงเลเยอร์ reg_1 ให้'
              : '⚠ ไม่เจอเลเยอร์มาร์ก (reg_1) — วางตามระยะขอบใน “ตั้งค่าละเอียด”') +
            ' · หลบของบนเทมเพลต ' + t.boxes.length + ' ชิ้น'
      );
      if (t.old) lines.push('มีดวงที่เรียงไว้รอบก่อน — กดเรียงอีกครั้งจะแทนที่ของเดิม');
    }
    $('tplInfo').textContent = lines.join('\n');
  }

  function nestNow() {
    if (S.settings.tool === 'run') {
      if (templateMode()) throw new Error('ไดคัทต่อเนื่องยังใช้กับเทมเพลตไม่ได้ — ใช้ “จัดวางดวง” + ติ๊กเต็มแผ่น หรือเลือกขนาดกระดาษอื่น');
      return runNow();
    }
    return planNow().then(nestWith);
  }

  function nestWith(plan) {
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
      // ป้ายสี่เหลี่ยม: เรียงชิดกันเป็นตารางเป๊ะ เส้นตัดเป็นเส้นตรงยาวเส้นเดียวต่อแนว (แบบไฟล์งานสีดำของร้าน)
      fill.butt = !!S.settings.rectButt && isRectPart(fill.part);
      status('นัดพอนกำลังหาวิธีใส่ “' + fill.part.name + '” ให้ได้มากที่สุด…');
      job = new Promise(function (resolve, reject) {
        setTimeout(function () {
          try {
            if (fill.butt) {
              var box = { id: first.id, rings: [bboxRing(fill.part.rings.length ? fill.part.rings : [vbRing(fill.part.vb)])], rotations: first.rotations };
              return resolve(NC.nest.fillGrid(box, plan, { spacing: 0, maxPerSheet: opts.maxPerSheet }));
            }
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
          var out = { index: i, length: len, placements: sh.placements, partsArea: sh.partsArea };
          centerSheet(plan, out);
          out.marks = L.markShapes(plan.width, len, plan.marks, contentBox(out));
          return out;
        });
        S.result = { plan: plan, res: res, sheets: sheets, ms: Date.now() - t0, fill: fill, butt: !!(fill && fill.butt) };
        S.pvSheet = 0;
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
              (fill.others > 0 ? ' (โหมดเต็มแผ่นใช้แบบแรกแบบเดียว ข้ามอีก ' + fill.others + ' แบบ)' : '') +
              (costInfo() ? ' · ' + costLine() : ''),
            'ok'
          );
        } else {
          status('จัดวางครบ ' + res.placedCount + ' ชิ้น ✓' + (costInfo() ? ' · ' + costLine() : ''), 'ok');
        }
        // คำเตือนก่อนสร้างชีต
        var warnings = [];
        var worst = S.parts.reduce(function (m, p) {
          return p.qty > 0 ? Math.max(m, rawBleed(p)) : m;
        }, 0);
        var gapNow = fill && fill.butt ? 0 : opts.spacing;
        if (worst > 0.2 && worst * 2 >= gapNow) {
          warnings.push(
            'งานพิมพ์เลยเส้นตัดออกมา ' + worst.toFixed(1) + ' มม. มากกว่าครึ่งหนึ่งของระยะห่าง — ภาพของดวงข้าง ๆ อาจทับกัน' +
              ' เพิ่มระยะห่างเป็นมากกว่า ' + (Math.ceil(worst * 2 * 10) / 10) + ' มม.' +
              (S.settings.respectBleed ? ' (ตอนนี้ “เผื่อ bleed” เว้นระยะเพิ่มให้แล้ว)' : '')
          );
        }
        var nocut = fill && fill.butt ? [] : noCutParts();
        if (nocut.length) {
          warnings.push(
            'ไม่พบเส้นไดคัท ' + nocut.length + ' แบบ (' + nocut.map(function (p) { return p.name; }).join(', ') +
              ') — ใช้กรอบสี่เหลี่ยมของชิ้นงานและเรียงแบบตารางแทน ตรวจไฟล์ก่อนสร้างชีต'
          );
        }
        if (res.sheets.some(function (sh) { return sh.placements.length >= 400; })) {
          warnings.push('ครบ 400 ดวงต่อแผ่นแล้ว (จำกัดสูงสุด 400 ดวง/แผ่น)');
        }
        if (marksHitTemplate(plan, sheets)) warnings.push('มาร์กมุมงานชนหัวงาน/ของบนเทมเพลต — ย้ายหัวงานหรือเพิ่มระยะขอบ');
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
    return prepareForTool().then(nestNow);
  }

  // ไดคัทต่อเนื่องใช้ต้นแบบดวงเดียว ทำเส้นตัดให้เฉพาะเมื่อเลือกรูปทรง “ตามเส้นไดคัทของงาน”
  function prepareForTool() {
    if (S.settings.tool !== 'run') return prepareCuts();
    var p = runTemplate();
    if (!p || S.settings.runShape !== 'artwork') return Promise.resolve();
    return prepareCuts([p]);
  }

  // ---------------------------------------------------------------- ไดคัทต่อเนื่อง

  function runTemplate() {
    return (
      S.parts.filter(function (p) {
        return p.qty > 0;
      })[0] ||
      S.parts[0] ||
      null
    );
  }

  function runNow() {
    var p = runTemplate();
    if (!p) throw new Error('ยังไม่มีต้นแบบ — เลือกสติ๊กเกอร์หนึ่งดวงแล้วกด “ดึงชิ้นงานที่เลือก”');
    engineParts();
    var s = S.settings;
    var plan = L.planSheet(sheetSpec());
    if (plan.roll) throw new Error('ไดคัทต่อเนื่องต้องใส่ความสูงของแผ่น (เช่น A3 = 420 มม.)');
    var warnings = [];
    var art = G.bounds(p.rings.length ? p.rings : [vbRing(p.vb)]);
    var outer = null;
    p.rings.forEach(function (r) {
      if (!outer || Math.abs(G.signedArea(r)) > Math.abs(G.signedArea(outer))) outer = r;
    });
    var shape = s.runShape;
    if (shape === 'artwork' && (!outer || p.mode === 'none')) {
      shape = 'rect';
      warnings.push('ต้นแบบ “' + p.name + '” ไม่พบเส้นไดคัท — ใช้กรอบสี่เหลี่ยมแทน ตรวจไฟล์ก่อนสร้างชีต');
    }
    var custom = s.runSize === 'custom' && shape !== 'artwork';
    var w = custom ? num('runW') : art.maxX - art.minX;
    var h = custom ? num('runH') : art.maxY - art.minY;
    if (!(w > 0.5 && h > 0.5)) throw new Error('ขนาดดวงต้องมากกว่า 0.5 มม.');
    var lay = NC.diecut.layout({
      area: plan.area,
      shape: shape,
      w: w,
      h: h,
      radius: num('runRadius'),
      ring: outer,
      gap: Math.max(0, num('runGap')),
      stagger: s.runLayout === 'stagger',
      max: NC.diecut.MAX_PER_SHEET,
    });
    if (!lay.cells.length) throw new Error('ดวงใหญ่กว่าพื้นที่วางบนแผ่น — ลดขนาด ระยะขอบ หรือเปลี่ยนขนาดกระดาษ');
    // ภาพต้นแบบวางกึ่งกลางช่อง (ยึดกรอบเส้นไดคัทของงาน ถ้ามี)
    var ax = (art.minX + art.maxX) / 2;
    var ay = (art.minY + art.maxY) / 2;
    var placements = lay.cells.map(function (c) {
      return { partId: p.idx, angle: 0, tx: c.x - ax, ty: c.y - ay, cx: c.x, cy: c.y };
    });
    var maxY = lay.cells.reduce(function (m, c) {
      return Math.max(m, c.y + lay.h / 2);
    }, 0);
    var len = L.finalLength(plan, maxY);
    var n = lay.cells.length;
    var sheet = {
      index: 0,
      length: len,
      placements: placements,
      partsArea: n * Math.abs(G.signedArea(lay.ring)),
      cutPaths: lay.paths,
    };
    sheet.marks = L.markShapes(plan.width, len, plan.marks, contentBox(sheet));
    var printW = (p.vb[2] - p.vb[0]) * K;
    var printH = (p.vb[1] - p.vb[3]) * K;
    // งานพิมพ์ที่เลยรูปทรงของดวงออกไป (bleed) ต้องไม่เกินครึ่งหนึ่งของระยะห่าง ไม่งั้นภาพดวงข้าง ๆ ทับกัน
    var bleed = Math.max(0, (printW - lay.w) / 2, (printH - lay.h) / 2);
    if (bleed > 0.05 && bleed * 2 > num('runGap') + 1e-6) {
      warnings.push(
        'งานพิมพ์ ' + printW.toFixed(1) + ' × ' + printH.toFixed(1) + ' มม. เลยรูปทรงดวงออกไป ' + bleed.toFixed(1) +
          ' มม. มากกว่าครึ่งหนึ่งของระยะห่าง — ภาพของดวงข้าง ๆ อาจทับกัน เพิ่มระยะห่างเป็นมากกว่า ' + (Math.ceil(bleed * 20) / 10) + ' มม. หรือขยายขนาดดวง'
      );
    }
    if (lay.capped) warnings.push('ครบ 400 ดวงต่อแผ่นแล้ว (จำกัดสูงสุด 400 ดวง/แผ่น)');
    S.result = {
      plan: plan,
      res: { placedCount: n, totalCount: n, unplaced: [], sheets: [sheet] },
      sheets: [sheet],
      ms: 0,
      fill: null,
      run: { lay: lay, part: p, shape: shape, w: lay.w, h: lay.h },
      warnings: warnings,
    };
    S.pvSheet = 0;
    S.stale = false;
    S.built = false;
    $('previewSub').textContent = '';
    drawPreview();
    renderStats();
    var msg =
      'ได้ ' + n + ' ดวง · ยกใบมีด ' + lay.lifts + ' ครั้ง · เส้นตัดยาว ' + (lay.cutLength / 1000).toFixed(2) + ' ม. · ดวง ' +
      lay.w.toFixed(1) + ' × ' + lay.h.toFixed(1) + ' มม.' + (costInfo() ? ' · ' + costLine() : '');
    if (warnings.length) status('⚠ ' + warnings.join(' · ') + ' — ' + msg, 'warn');
    else status(msg, 'ok');
  }

  // ---------------------------------------------------------------- สถิติ + พรีวิว

  // ---------------------------------------------------------------- ราคาลูกค้า

  // ร้านขายเป็นแผ่น (ม้วน = เมตร)
  function rollNow() {
    if (S.result) return !!S.result.plan.roll;
    return !templateMode() && !(num('length') > 0);
  }

  function baht(v) {
    return P.baht(v);
  }

  // ช่องราคาที่แก้แล้วคิดใหม่ทันที ไม่ต้องจัดวางใหม่
  var PRICE_KEYS = ['sheetPrice', 'orderQty'];

  // งานดวงเดียวซ้ำทั้งแผ่น → ใส่จำนวนที่ลูกค้าสั่งได้ คิดจำนวนแผ่นให้
  function repeatJob(r) {
    return !!(r && (r.fill || r.run));
  }

  // ราคาลูกค้า: แผ่นละ X บาท → ตกดวงละกี่บาท (สูตรอยู่ใน core/price.js)
  function costInfo() {
    var r = S.result;
    if (!r || !r.res.placedCount) return null;
    var used = r.sheets.reduce(function (a, sh) {
      return a + sh.length;
    }, 0);
    return P.quote({
      repeat: repeatJob(r),
      perSheet: r.sheets.length ? r.sheets[0].placements.length : 0,
      sheets: r.sheets.length,
      roll: r.plan.roll,
      meters: used / 1000,
      pieces: r.res.placedCount,
      orderQty: S.settings.orderQty,
      price: S.settings.sheetPrice,
    });
  }

  function unitWord(c) {
    return c.roll ? 'เมตรละ' : 'แผ่นละ';
  }

  function qtyText(c) {
    return c.roll ? Math.round(c.units * 100) / 100 + ' ม.' : c.units + ' แผ่น';
  }

  // บรรทัดสรุป เช่น “18 แผ่น × 50 = 900 บาท · 504 ดวง” / “แผ่นละ 50 บาท ÷ 28 ดวง”
  function quoteSum(c) {
    if (!c.byOrder && !c.roll && c.units === 1) return unitWord(c) + ' ' + baht(c.price) + ' บาท ÷ ' + c.pieces + ' ดวง';
    return qtyText(c) + ' × ' + baht(c.price) + ' = ' + baht(c.total) + ' บาท · ' + c.pieces + ' ดวง';
  }

  function costLine() {
    var c = costInfo();
    if (!c) return '';
    return 'ลูกค้าตกดวงละ ' + baht(c.per) + ' บาท (' + quoteSum(c) + ')';
  }

  function renderCost() {
    var word = rollNow() ? 'เมตรละ' : 'แผ่นละ';
    Array.prototype.forEach.call(document.querySelectorAll('[data-price-unit]'), function (e) {
      e.textContent = word;
    });
    renderQuote();
    var out = $('costOut');
    var c = costInfo();
    out.innerHTML = '';
    if (c && S.stale) {
      out.className = 'cost-out empty';
      out.textContent = 'ค่าเปลี่ยน — กำลังคำนวณใหม่…';
      return;
    }
    if (!c) {
      out.className = 'cost-out empty';
      out.textContent = S.result ? 'ใส่ราคา' + word + 'ที่ “ข้อมูลงาน & ราคา” แล้วจะบอกว่าลูกค้าตกดวงละกี่บาท' : 'ลูกค้าตกดวงละกี่บาท จะขึ้นตรงนี้';
      return;
    }
    out.className = 'cost-out';
    var per = el('div', 'cost-per');
    per.appendChild(el('span', null, 'ลูกค้าตกดวงละ'));
    per.appendChild(el('b', null, baht(c.per)));
    per.appendChild(el('span', null, 'บาท'));
    out.appendChild(per);
    out.appendChild(el('div', 'cost-sum', quoteSum(c)));
  }

  // ราคาลูกค้าในส่วน “ข้อมูลงาน & ราคา”
  function renderQuote() {
    var box = $('quoteOut');
    var c = costInfo();
    box.innerHTML = '';
    if (!c || S.stale) {
      box.className = 'quote empty';
      box.textContent = !S.result
        ? 'ดึงชิ้นงานก่อน แล้วราคาจะคิดให้เองตามพรีวิว'
        : S.stale
        ? 'กำลังคำนวณใหม่…'
        : 'ใส่ราคาแผ่นละกี่บาท — ระบบจำไว้ใช้งานถัดไป (แยกตามขนาดกระดาษ)';
      return;
    }
    box.className = 'quote';
    function row(label, value, cls) {
      var tr = el('div', 'q-row' + (cls ? ' ' + cls : ''));
      tr.appendChild(el('span', null, label));
      tr.appendChild(el('b', null, value));
      box.appendChild(tr);
    }
    if (c.byOrder) {
      row('ลูกค้าสั่ง ' + c.order + ' ดวง', 'ใช้ ' + c.sheets + ' แผ่น (แผ่นละ ' + c.perSheet + ' ดวง)');
      if (c.spare) row('ได้จริง', c.pieces + ' ดวง (เกิน ' + c.spare + ')');
    } else if (!c.roll && c.units === 1) {
      row('1 แผ่น', c.pieces + ' ดวง');
    } else {
      row(qtyText(c), c.pieces + ' ดวง');
    }
    row('ราคารวม', qtyText(c) + ' × ' + baht(c.price) + ' = ' + baht(c.total) + ' บาท', 'q-cost');
    row('ลูกค้าตกดวงละ', baht(c.per) + ' บาท', 'q-sell');
  }

  function renderStats() {
    var r = S.result;
    var box = $('stats');
    box.innerHTML = '';
    renderCost();
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
    var cells = r.run
      ? [
          [r.res.placedCount + ' ดวง', 'ต่อ 1 แผ่น'],
          [r.run.lay.lifts + ' ครั้ง', 'ยกใบมีด'],
          [(r.run.lay.cutLength / 1000).toFixed(1) + ' ม.', 'ความยาวเส้นตัด'],
        ]
      : null;
    (cells || [
      r.fill
        ? [r.res.placedCount + ' ดวง', 'ต่อ 1 แผ่น']
        : [r.plan.roll ? (used / 1000).toFixed(2) + ' ม.' : r.sheets.length + ' แผ่น', r.plan.roll ? 'ความยาวม้วนที่ใช้' : 'จำนวนแผ่น'],
      [util.toFixed(0) + '%', 'ใช้เนื้อที่'],
      [r.res.placedCount + '/' + r.res.totalCount, unplaced ? 'วางได้ (ขาด ' + unplaced + ')' : 'ชิ้นที่วาง'],
    ]).forEach(function (s) {
      var d = el('div', 'stat');
      d.appendChild(el('b', null, s[0]));
      d.appendChild(el('span', null, s[1]));
      box.appendChild(d);
    });
    box.hidden = false;
  }

  function clearPreview() {
    $('previewInfo').textContent = '';
    $('pvPager').hidden = true;
    renderCost();
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

  // พรีวิวกรอบขนาดคงที่ (ไม่ยืดตามแผง) ทีละแผ่น — หลายแผ่นกด ‹ › เปลี่ยน
  function drawPreview() {
    if (!S.result) return clearPreview();
    var r = S.result;
    var canvas = $('preview');
    canvas.hidden = false;
    $('previewEmpty').hidden = true;
    var n = r.sheets.length;
    S.pvSheet = Math.max(0, Math.min(n - 1, S.pvSheet || 0));
    var sh = r.sheets[S.pvSheet];
    var box = $('previewBox');
    var bw = Math.min(PV_W, box.clientWidth || PV_W) - 16;
    var bh = PV_H - 16;
    var sc = Math.min(bw / r.plan.width, bh / sh.length);
    var cssW = Math.max(60, r.plan.width * sc);
    renderSheets(canvas, cssW, Math.min(2, window.devicePixelRatio || 1), S.pvSheet);
    canvas.style.width = cssW + 'px';
    $('pvPager').hidden = n < 2;
    $('pvPage').textContent = 'แผ่น ' + (S.pvSheet + 1) + '/' + n;
    $('pvPrev').disabled = S.pvSheet === 0;
    $('pvNext').disabled = S.pvSheet === n - 1;
    renderInfo();
  }

  function pvStep(d) {
    S.pvSheet = (S.pvSheet || 0) + d;
    drawPreview();
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
    if (r.run) {
      $('previewInfo').textContent =
        r.res.placedCount + ' ดวง · ' + r.run.lay.rows + ' แถว · ' + r.run.lay.w.toFixed(1) + ' × ' + r.run.lay.h.toFixed(1) + ' มม. · หน้า ' + sizes[0];
      return;
    }
    $('previewInfo').textContent =
      r.res.placedCount + (r.fill ? ' ดวง' : ' ชิ้น') + ' · ' + (r.sheets.length > 1 ? r.sheets.length + ' แผ่น · ' : 'หน้า ') + sizes[0];
  }

  var LAYOUT_LABEL = {
    auto: 'พรีวิว: อัตโนมัติ (แผงกว้างอยู่ข้าง ๆ) — กดเพื่อสลับ',
    side: 'พรีวิว: ข้าง ๆ เสมอ — กดเพื่อสลับ',
    stack: 'พรีวิว: ในขั้น “สร้างชีต” — กดเพื่อสลับ',
  };

  // พรีวิวข้างเมนู: อัตโนมัติ (แผงกว้าง ≥ 734 px) · บังคับข้าง ๆ · บังคับอยู่ในหน้าขั้นที่ 3
  function placePreview() {
    var mode = S.settings.layoutMode;
    var wide = mode === 'side' ? true : mode === 'stack' ? false : window.innerWidth >= WIDE_MIN;
    $('btnLayout').title = LAYOUT_LABEL[mode] || LAYOUT_LABEL.auto;
    document.body.classList.toggle('wide', wide);
    var target = wide ? $('previewSide') : $('previewSlot');
    ['previewCard', 'dcPreviewCard', 'vecPreviewCard'].forEach(function (id) {
      var card = $(id);
      if (card.parentNode !== target) target.appendChild(card);
    });
    applyVisibility();
    if (S.result) drawPreview();
    if (S.dc) drawDc();
    if (S.vec) drawVec();
  }

  // วาดแผ่นลงแคนวาสกว้าง cssW: ทุกแผ่นเรียงลงมา (รูปส่งลูกค้า) หรือแผ่นเดียว (only = ลำดับแผ่น, พรีวิวบนแผง)
  function renderSheets(canvas, cssW, dpr, only) {
    var r = S.result;
    var s = cssW / r.plan.width; // px ต่อ mm
    var list = only == null ? r.sheets : [r.sheets[only]];
    var gap = only == null ? 12 : 0;
    var totalH = 0;
    list.forEach(function (sh) {
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
    list.forEach(function (sh) {
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

      // ของบนเทมเพลต: มาร์ก CM5 สีดำ · หัวงาน/โลโก้/QR สีเทา
      if (r.plan.template) {
        r.plan.template.boxes.forEach(function (b) {
          ctx.fillStyle = b.mark ? '#000' : 'rgba(31,42,68,.22)';
          ctx.fillRect(b.x * s, b.y * s, Math.max(1, b.w * s), Math.max(1, b.h * s));
          if (!b.mark) {
            ctx.strokeStyle = 'rgba(31,42,68,.55)';
            ctx.lineWidth = 1;
            ctx.strokeRect(b.x * s, b.y * s, b.w * s, b.h * s);
          }
        });
      }

      // มาร์ก
      ctx.fillStyle = '#000';
      ctx.strokeStyle = '#000';
      sh.marks.forEach(function (g) {
        g.parts.forEach(function (m) {
          if (m.kind === 'poly') {
            ctx.beginPath();
            m.points.forEach(function (q, i) {
              if (i) ctx.lineTo(q[0] * s, q[1] * s);
              else ctx.moveTo(q[0] * s, q[1] * s);
            });
            if (m.closed) ctx.closePath();
            if (m.fill) ctx.fill();
            if (m.sw > 0) {
              ctx.lineWidth = Math.max(1, m.sw * s);
              ctx.stroke();
            }
          } else if (m.kind === 'circle') {
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
        // ไดคัทต่อเนื่อง: รูปทรงของดวงอยู่กึ่งกลางช่อง ไม่ใช่เส้นตัดของต้นแบบ
        var clipRings = r.run ? [r.run.lay.ring] : p.rings;
        var ct = r.run ? { angle: 0, tx: pl.cx, ty: pl.cy } : t;
        if (p.thumb && !S.plainPreview) {
          ctx.save();
          ringPath(ctx, clipRings, ct, s);
          ctx.clip();
          ctx.translate(pl.tx * s, pl.ty * s);
          ctx.rotate((pl.angle * Math.PI) / 180);
          ctx.scale(s, s);
          var vb = p.thumb.vb;
          ctx.drawImage(p.thumb.img, vb[0] * K, -vb[1] * K, (vb[2] - vb[0]) * K, (vb[1] - vb[3]) * K);
          ctx.restore();
        } else {
          ringPath(ctx, clipRings, ct, s);
          ctx.fillStyle = 'hsla(' + p.hue + ',70%,60%,.45)';
          ctx.fill('evenodd');
        }
        ctx.strokeStyle = '#e600e6';
        ctx.lineWidth = 1;
        (useGridCut() || r.run ? [] : p.polys).forEach(function (poly) {
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
      if (useGridCut() || sh.cutPaths) {
        ctx.strokeStyle = '#e600e6';
        ctx.lineWidth = 1;
        (sh.cutPaths || gridLines(sh)).forEach(function (l) {
          ctx.beginPath();
          l.points.forEach(function (q, i) {
            if (i) ctx.lineTo(q[0] * s, q[1] * s);
            else ctx.moveTo(q[0] * s, q[1] * s);
          });
          if (l.closed) ctx.closePath();
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
    var material = r.run && (s.runMaterial || s.runGram) ? 'วัสดุ ' + [s.runMaterial, s.runGram ? s.runGram + ' แกรม' : ''].filter(Boolean).join(' ') : '';
    var c = s.priceInHeader ? costInfo() : null;
    var price = '';
    if (c) {
      price = unitWord(c) + ' ' + baht(c.price) + ' บาท · ดวงละ ' + baht(c.per) + ' บาท';
      if (c.byOrder) price += ' · ' + c.order + ' ดวง ' + c.sheets + ' แผ่น ' + baht(c.total) + ' บาท';
    }
    var line3 = [material, s.jobNote, price, cutter ? 'เครื่องตัด ' + cutter.label : '']
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
      var gt = r.plan.marks.type === 'graphtec' ? S.settings.gtMarks : null;
      return {
        // Graphtec: เลเยอร์ชื่อเดียวกับที่ Cutting Master ใช้ มาร์กอยู่ใน reg_1
        regLayers: r.plan.marks.type === 'graphtec' ? (gt && gt.layers.length ? gt.layers : L.GRAPHTEC_LAYERS) : null,
        target: target,
        template: r.plan.template ? { abIndex: r.plan.template.abIndex } : null,
        markColor: r.plan.marks && r.plan.marks.color ? r.plan.marks.color : null,
        spotName: S.settings.spotName || 'CutContour',
        strokeWidth: num('strokeWidth'),
        dropPieceCuts: grid || !!r.run,
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
          var markPaths = [];
          sh.marks.forEach(function (g) {
            g.parts.forEach(function (m) {
              if (m.kind !== 'poly') return marks.push(toPtShape(m));
              // มาร์กจากไฟล์ต้นแบบ: ใช้เส้นจริง (โค้ง + สี) เลื่อนตามมุมที่ยึด
              var src = gt && gt.items[m.src];
              if (!src) return;
              var dx = m.dx * PT;
              var dy = m.dy * PT;
              markPaths.push({
                layer: src.layer,
                closed: src.closed,
                cp: src.cp,
                fill: src.fill,
                stroke: src.stroke,
                sw: src.sw,
                pts: src.pts.map(function (q) {
                  return [q[0] + dx, q[1] + dy, q[2] + dx, q[3] + dy, q[4] + dx, q[5] + dy];
                }),
              });
            });
          });
          return {
            w: r.plan.width * PT,
            h: sh.length * PT,
            name: SHEET_MARK + 'แผ่น ' + (i + 1),
            pieces: sh.placements.map(function (pl) {
              var p = byIdx(pl.partId);
              copies[pl.partId] = (copies[pl.partId] || 0) + 1;
              var c = B.placementForIllustrator(pl);
              return { part: pl.partId, angle: c.angle, tx: c.tx, ty: c.ty, name: p.name + ' #' + copies[pl.partId] };
            }),
            marks: marks,
            markPaths: markPaths,
            header: headerPayload(sh, i, n),
            cutPolys: sh.cutPaths
              ? sh.cutPaths.map(function (l) {
                  return {
                    closed: l.closed,
                    points: l.points.map(function (q) {
                      return [q[0] * PT, q[1] * PT];
                    }),
                  };
                })
              : [],
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
      var tpl = !!S.result.plan.template;
      var target = tpl || S.settings.target !== 'document' ? 'artboard' : 'document';
      status((tpl ? 'กำลังเรียงลงเทมเพลต (' : 'กำลังสร้างชีตไดคัทใน Illustrator (') + S.result.res.placedCount + ' ดวง)…');
      progress(0.85);
      return host.call('np_buildLayout', layoutPayload(target)).then(function (out) {
        S.built = true;
        if (out.template) {
          return status(
            'เรียงลงอาร์ตบอร์ดเทมเพลตแล้ว ' + out.pieces + ' ดวง' +
              (out.sheets > 1 ? ' (' + out.sheets + ' แผ่น — แผ่นที่เพิ่มมีเทมเพลตให้ครบ)' : '') +
              (out.replaced ? ' · แทนที่ของรอบก่อน' : '') +
              (out.parked ? ' · ย้ายต้นแบบไปไว้ซ้ายอาร์ตบอร์ด' : '') +
              ' — ส่งเข้า Cutting Master 5 ได้เลย',
            'ok'
          );
        }
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
    if (S.settings.tool === 'run') return false;
    return (!!S.settings.gridCut && gridMode()) || !!(S.result && S.result.butt);
  }

  // ป้ายสี่เหลี่ยม (เส้นตัดเป็นสี่เหลี่ยม หรือไม่มีเส้นตัด → ใช้กรอบ)
  function isRectPart(p) {
    if (p.mode === 'none' || !p.cut) return true;
    if (p.rings.length !== 1) return false;
    var b = G.bounds(p.rings);
    var box = (b.maxX - b.minX) * (b.maxY - b.minY);
    return box > 0 && Math.abs(G.signedArea(p.rings[0])) / box > 0.985;
  }

  function cutPaths(sh) {
    if (sh.cutPaths) return sh.cutPaths;
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
        S.exported = true;
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
        // เทมเพลตร้าน: เรียงลงอาร์ตบอร์ดแล้วจบ (ส่งเข้า Cutting Master 5 ต่อจาก Illustrator)
        if (templateMode()) return buildLayout();
        return buildLayout().then(exportAll);
      })
      .then(function () {
        var tpl = templateMode() && !host.demo;
        setPage(host.demo || tpl ? 3 : 4);
        if (tpl) return; // ข้อความผลจาก buildLayout
        var r = S.result;
        var used = r.sheets.reduce(function (a, sh) {
          return a + sh.length;
        }, 0);
        var msg = host.demo
          ? 'จัดวางเสร็จ! (โหมดทดลอง) ไปขั้น 4 ส่งออก เพื่อดาวน์โหลด PLT / DXF / SVG'
          : 'เสร็จแล้วจ้า! ' + r.res.placedCount + ' ชิ้น ยาว ' + Math.round(used) + ' มม.' + (costInfo() ? ' · ' + costLine() : '') + ' — ส่งไฟล์เข้าเครื่องตัดได้เลย';
        status(msg, 'ok');
      });
  }

  function selectCutLines() {
    return host.call('np_selectCutLines', { cutNames: cutNames(), detectRed: !!S.settings.detectRed }).then(function (r) {
      status('เลือกเส้นตัดแล้ว ' + r.count + ' เส้น — กดส่งผ่านปลั๊กอินเครื่องตัด (Cutting Master / CutStudio / FineCut) ได้เลย', 'ok');
    });
  }

  // ---------------------------------------------------------------- ไดคัทตามรูปทรง

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  // ความละเอียดเส้น 1–100 → ความคลาดเคลื่อนตอนลดจุด (มม.) 100 = ตามขอบละเอียดสุด
  function dcTolMm() {
    return 0.02 + (100 - clamp(num('dcDetail'), 1, 100)) * 0.004;
  }

  function toBezier(ring, round) {
    if (round) return G.smoothRing(ring, 50);
    return ring.map(function (q) {
      return { a: q, l: q, r: q };
    });
  }

  function countLoops(loops, stats) {
    stats.shapes = 0;
    stats.holes = 0;
    stats.points = 0;
    loops.forEach(function (lp) {
      if (lp.hole) stats.holes++;
      else stats.shapes++;
      stats.points += lp.points.length;
    });
  }

  // อ่านทั้ง Selection เป็นรูป → ลบพื้นหลัง (รูปถ่าย/JPG) → หาขอบ → เผื่อระยะตามแบบมุม
  function dcFromImage() {
    var s = S.settings;
    var ppi = 150 + clamp(num('dcDetail'), 1, 100) * 1.5;
    return host
      .call('np_exportSelection', { ppi: ppi, maxPx: 3000 })
      .then(function (sil) {
        var src = sil.dataUrl || 'data:image/png;base64,' + host.readBase64(sil.file);
        return loadImage(src).then(function (img) {
          return { img: img, sil: sil };
        });
      })
      .then(function (r) {
        status('นัดพอนกำลังหาขอบรูป…');
        progress(0.5);
        var b = r.sil.bounds;
        var sx = (b[2] - b[0]) / r.img.width;
        var sy = (b[1] - b[3]) / r.img.height;
        var pxPerMm = PT / sx;
        var data = pixels(r.img);
        var mask = NC.contour.backgroundMask(data, { tolerance: num('dcTol'), shadow: num('dcShadow') });
        var offPx = Math.max(0, num('dcOffset')) * pxPerMm;
        var tolPx = Math.max(0.3, dcTolMm() * pxPerMm);
        var stats = {};
        var common = {
          threshold: 128,
          minAreaPx: Math.max(16, Math.pow(0.8 * pxPerMm, 2)),
          fillHoles: !s.dcHoles,
          minHolePx: Math.pow(1.5 * pxPerMm, 2),
          stats: stats,
        };
        var round = s.dcJoin === 'round';
        var loops;
        if (round || offPx < 0.01) {
          common.offsetPx = offPx;
          common.simplifyPx = tolPx;
          loops = NC.contour.traceAlpha(mask, common);
        } else {
          common.offsetPx = 0;
          common.simplifyPx = 0.3;
          var base = NC.contour.traceAlpha(mask, common);
          loops = NC.contour.offsetOutline(
            base.map(function (lp) {
              return lp.points;
            }),
            { offset: offPx, join: s.dcJoin, miterLimit: num('dcMiter'), cell: 1, fillHoles: !s.dcHoles, minHole: common.minHolePx, simplify: tolPx }
          );
          countLoops(loops, stats);
        }
        var paths = loops.map(function (lp) {
          var ring = lp.points.map(function (q) {
            return [b[0] + q[0] * sx, b[1] - q[1] * sy];
          });
          return { closed: true, points: toBezier(ring, round) };
        });
        stats.images = r.sil.kinds ? r.sil.kinds.images : 0;
        stats.count = r.sil.count;
        return { paths: paths, loops: loops, img: r.img, mask: mask, bounds: b, sx: sx, sy: sy, stats: stats, source: 'all' };
      });
  }

  // ขอบ Clipping Mask (เวกเตอร์) → เผื่อระยะ + รวมเส้นที่ชนกัน
  function dcFromClips() {
    var s = S.settings;
    return host.call('np_readClipPaths', {}).then(function (r) {
      var rings = [];
      (r.paths || []).forEach(function (sp) {
        if (sp.closed === false) return;
        var poly = G.dedupe(G.flattenBezier(sp.points, true, 0.1));
        if (poly.length >= 3) rings.push(poly);
      });
      if (!rings.length) throw new Error('ไม่พบ Clipping Mask ในชิ้นที่เลือก — เปลี่ยนเป็น “รูปทรงของชิ้นงานทั้งหมด”');
      var bb = G.bounds(rings);
      var size = Math.max(bb.maxX - bb.minX, bb.maxY - bb.minY);
      var cell = Math.max(0.1, size / 1500);
      var loops = NC.contour.offsetOutline(rings, {
        offset: Math.max(0, num('dcOffset')) * PT,
        join: s.dcJoin,
        miterLimit: num('dcMiter'),
        cell: cell,
        fillHoles: !s.dcHoles,
        minHole: Math.pow(1.5 * PT, 2),
        simplify: dcTolMm() * PT,
      });
      var stats = { images: 0, count: r.count, specks: 0, holesSkipped: 0, clips: rings.length };
      countLoops(loops, stats);
      return {
        paths: loops.map(function (lp) {
          return { closed: true, points: toBezier(lp.points, s.dcJoin === 'round') };
        }),
        loops: loops,
        clipRings: rings,
        bounds: [bb.minX, bb.maxY, bb.maxX, bb.minY],
        stats: stats,
        source: 'clip',
      };
    });
  }

  function dcRead() {
    status('นัดพอนกำลังอ่าน Selection… (รูปใหญ่อาจใช้เวลาหลายวินาที)');
    progress(0.15);
    var job = S.settings.dcSource === 'clip' ? dcFromClips() : dcFromImage();
    return job.then(function (dc) {
      if (!dc.paths.length) throw new Error('หาขอบชิ้นงานไม่เจอ — ลองลด “ความต่างสีพื้น” หรือเลือกชิ้นงานใหม่');
      S.dc = dc;
      drawDc();
      progress(1);
      status('อ่านเสร็จ: ได้เส้นไดคัท ' + dc.paths.length + ' เส้น — กด “สร้างเส้นไดคัท” เพื่อวาดลงไฟล์', 'ok');
      return dc;
    });
  }

  function dcReportText(dc) {
    var t = dc.stats;
    var parts = [];
    if (dc.source === 'clip') parts.push('อ่านขอบ Clipping Mask ' + t.clips + ' เส้น');
    else parts.push('อ่านรูปได้ ' + (t.images || 1) + ' รูป');
    parts.push('ได้รูปทรง ' + t.shapes + ' ชิ้น');
    parts.push('จุดทั้งหมด ' + t.points + ' จุด');
    if (t.holes) parts.push('มีรู ' + t.holes + ' รู');
    if (t.specks) parts.push('ทิ้งเศษจุดเล็ก ' + t.specks + ' จุด');
    if (t.holesSkipped) parts.push('ข้ามรูที่เล็กเกินกว่าจะตัดได้ ' + t.holesSkipped + ' รู');
    parts.push('เลือกไว้ ' + t.count + ' ชิ้น');
    if (dc.mask && dc.mask.bg) parts.push('ลบพื้นหลังสี rgb(' + dc.mask.bg.r + ', ' + dc.mask.bg.g + ', ' + dc.mask.bg.b + ')');
    return parts.join(' · ') + ' · เส้นที่เผื่อระยะแล้วมาชนกันถูกรวมเป็นเส้นเดียว';
  }

  function drawDc() {
    var dc = S.dc;
    var canvas = $('dcCanvas');
    if (!dc) {
      canvas.hidden = true;
      $('dcEmpty').hidden = false;
      $('dcReport').textContent = '';
      return;
    }
    canvas.hidden = false;
    $('dcEmpty').hidden = true;
    // กรอบ = รูป + เส้นไดคัท (เส้นที่เผื่อระยะอาจเลยขอบรูปออกไป) — pt: [left, top, right, bottom]
    var flat = dc.paths.map(function (sp) {
      return G.flattenBezier(sp.points, true, 0.5);
    });
    var pb = G.bounds(flat);
    var ib = dc.bounds;
    var b = [Math.min(ib[0], pb.minX), Math.max(ib[1], pb.maxY), Math.max(ib[2], pb.maxX), Math.min(ib[3], pb.minY)];
    var wPt = b[2] - b[0];
    var hPt = b[1] - b[3];
    var box = $('dcBox');
    var cssW = Math.max(120, (box.clientWidth || 300) - 16);
    var cssH = Math.max(160, document.body.classList.contains('wide') ? box.clientHeight - 16 : 360);
    var sc = Math.min(cssW / wPt, cssH / hPt);
    var W = Math.round(wPt * sc);
    var H = Math.round(hPt * sc);
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, H);
    var ix = (ib[0] - b[0]) * sc;
    var iy = (b[1] - ib[1]) * sc;
    var iw = (ib[2] - ib[0]) * sc;
    var ih = (ib[1] - ib[3]) * sc;
    if (dc.img) {
      ctx.drawImage(dc.img, ix, iy, iw, ih);
      // พื้นหลังที่ถูกลบ: ทาขาวทับให้เห็นว่าเหลืออะไร
      if (dc.mask && dc.mask.bg) {
        var m = document.createElement('canvas');
        m.width = dc.mask.width;
        m.height = dc.mask.height;
        var mctx = m.getContext('2d');
        var id = mctx.createImageData(m.width, m.height);
        for (var i = 0; i < dc.mask.alpha.length; i++) {
          if (dc.mask.alpha[i]) continue;
          id.data[i * 4] = 255;
          id.data[i * 4 + 1] = 255;
          id.data[i * 4 + 2] = 255;
          id.data[i * 4 + 3] = 170;
        }
        mctx.putImageData(id, 0, 0);
        ctx.drawImage(m, ix, iy, iw, ih);
      }
    } else if (dc.clipRings) {
      ctx.strokeStyle = 'rgba(31,42,68,.5)';
      ctx.setLineDash([4, 3]);
      dc.clipRings.forEach(function (ring) {
        ctx.beginPath();
        ring.forEach(function (q, k) {
          var x = (q[0] - b[0]) * sc;
          var y = (b[1] - q[1]) * sc;
          if (k) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
        });
        ctx.closePath();
        ctx.stroke();
      });
      ctx.setLineDash([]);
    }
    ctx.strokeStyle = '#ff1f3d';
    ctx.lineWidth = 1.5;
    flat.forEach(function (pts) {
      ctx.beginPath();
      pts.forEach(function (q, k) {
        var x = (q[0] - b[0]) * sc;
        var y = (b[1] - q[1]) * sc;
        if (k) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      });
      ctx.closePath();
      ctx.stroke();
    });
    $('dcSub').textContent = Math.round(wPt * K) + ' × ' + Math.round(hPt * K) + ' มม.';
    $('dcReport').textContent = dcReportText(dc);
  }

  // อ่านใหม่ทุกครั้งก่อนวาด — Selection อาจเปลี่ยนไปหลังดูตัวอย่าง
  function dcMake() {
    return dcRead().then(function (dc) {
      status('กำลังวาดเส้นไดคัทลงไฟล์…');
      progress(0.9);
      var s = S.settings;
      return host
        .call('np_drawDieCut', {
          paths: dc.paths,
          layer: s.dcLayer || 'Die cut',
          strokeWidth: num('dcWidth'),
          color: s.dcColor,
          spotName: s.spotName || 'CutContour',
        })
        .then(function (out) {
          progress(1);
          status('สร้างเส้นไดคัทแล้ว ' + out.count + ' เส้น อยู่บนเลเยอร์ “' + out.layer + '” (บนสุด)', 'ok');
        });
    });
  }

  // ---------------------------------------------------------------- ทำมุมโค้ง / หาเส้นกลาง

  var D = NC.dimension;

  function later() {
    return new Promise(function (resolve) {
      setTimeout(resolve, 20);
    });
  }

  // อ่านรูปทรงของ Selection (ตัวอักษรถูก Outline บนสำเนา) → วงปิดหน่วย มม. (y ลง)
  function readShapes(allowEmpty) {
    status('นัดพอนกำลังอ่านรูปทรง…');
    return host.call('np_readShapes', {}).then(function (r) {
      var rings = B.subpathsToRings(r.paths, 0.05);
      if (!rings.length && !allowEmpty) throw new Error('ไม่พบ Path ปิดในชิ้นที่เลือก — เลือกตัวอักษรหรือ Shape ที่ปิดแล้ว');
      return later().then(function () {
        return { read: r, rings: rings };
      });
    });
  }

  function cncRead() {
    return readShapes().then(function (r) {
      status('กำลังคำนวณมุมโค้ง…');
      return later().then(function () {
        var res = NC.cnc.roundCorners(r.rings, { rIn: num('cnIn'), rOut: num('cnOut') });
        S.vec = { kind: 'corner', rings: r.rings, loops: res.loops, flags: res.flags, read: r.read };
        drawVec();
        var msg =
          'อ่าน ' + r.read.count + ' ชิ้น' + (r.read.kinds && r.read.kinds.texts ? ' (ตัวอักษร ' + r.read.kinds.texts + ')' : '') +
          ' · ได้ ' + res.loops.length + ' วง · มุมใน R' + num('cnIn') + ' · มุมนอก R' + num('cnOut') +
          (res.flags.length ? ' · ⚠ จุดที่รัศมีลงไม่ได้ ' + res.flags.length + ' จุด' : ' · ดอกลงได้ทุกมุม');
        status(msg, res.flags.length ? 'warn' : 'ok');
        return S.vec;
      });
    });
  }

  function cncMake() {
    return cncRead().then(function (v) {
      var s = S.settings;
      var copy = s.cnMode !== 'replace';
      if (!copy && !host.demo && !window.confirm('แก้ทับของเดิม — ชิ้นต้นฉบับจะถูกลบแล้วแทนด้วยรูปทรงใหม่ (Undo ได้) ทำต่อไหม?')) {
        throw new Error('ยกเลิกแล้ว — ของเดิมไม่ถูกแตะ');
      }
      var bb = G.bounds(v.rings);
      var dx = copy ? bb.maxX - bb.minX + 10 : 0; // สำเนาวางข้างของเดิม ห่าง 10 มม.
      var paths = v.loops.map(function (lp) {
        return {
          closed: true,
          points: NC.cnc.toBezier(
            lp.points.map(function (q) {
              return [(q[0] + dx) / K, -q[1] / K];
            }),
            2 / K
          ),
        };
      });
      var flags = s.cnFlags
        ? v.flags.map(function (f) {
            return { x: (f.x + dx) / K, y: -f.y / K, r: f.r / K };
          })
        : [];
      status('กำลังวาดรูปทรงมุมโค้งลงไฟล์…');
      return host
        .call('np_drawShapes', { paths: paths, mode: copy ? 'copy' : 'replace', name: 'มุมโค้ง R' + num('cnIn'), flags: flags, flagLayer: 'ตรวจรัศมี' })
        .then(function (out) {
          status(
            'ทำมุมโค้งแล้ว ' + out.count + ' วง' + (copy ? ' — สำเนาวางข้างของเดิม ห่าง 10 มม.' : ' — แทนของเดิมแล้ว') +
              (out.flags ? ' · วงกลมตรวจ ' + out.flags + ' จุด บนเลเยอร์ “ตรวจรัศมี”' : ''),
            out.flags ? 'warn' : 'ok'
          );
        });
    });
  }

  function ledOpts() {
    return { stripWidth: num('ledWidth'), minRadius: num('ledRadius'), endMargin: num('ledMargin') };
  }

  function ledReport(st) {
    var parts = [
      'เส้น ' + st.lines + ' เส้น',
      'ยาวรวม ' + Math.round(st.length) + ' มม. (' + (st.length / 1000).toFixed(2) + ' ม.)',
      'กว้าง ' + st.minWidth.toFixed(1) + '–' + st.maxWidth.toFixed(1) + ' มม.',
    ];
    if (st.narrow) parts.push('แคบกว่าแถบไฟ ' + st.narrow + ' จุด');
    if (st.tight) parts.push('โค้งแคบกว่า R' + num('ledRadius') + ' ' + st.tight + ' จุด');
    if (st.wide) parts.push('กว้างเกิน 2 เท่าของแถบไฟ ' + st.wide + ' จุด (อาจต้องใช้ 2 แถว)');
    if (st.dropped) parts.push('ข้ามเส้นสั้นกว่าระยะเว้นปลาย ' + st.dropped + ' เส้น');
    return parts.join(' · ');
  }

  function ledRead() {
    return readShapes().then(function (r) {
      status('กำลังหาเส้นกลาง…');
      return later().then(function () {
        var res = NC.cnc.centerline(r.rings, ledOpts());
        if (!res.lines.length) throw new Error('หาเส้นกลางไม่ได้ — ตัวอักษรเล็ก/แคบเกินไปเมื่อเว้นจากปลาย ' + num('ledMargin') + ' มม.');
        S.vec = { kind: 'led', rings: r.rings, lines: res.lines, flags: res.flags, stats: res.stats };
        drawVec();
        var warn = res.stats.narrow || res.stats.tight || res.stats.wide;
        status(ledReport(res.stats), warn ? 'warn' : 'ok');
        return S.vec;
      });
    });
  }

  function ledMake() {
    return ledRead().then(function (v) {
      var paths = v.lines.map(function (ln) {
        return {
          closed: ln.closed,
          points: ln.points.map(function (q) {
            var a = [q[0] / K, -q[1] / K];
            return { a: a, l: a, r: a };
          }),
        };
      });
      return host
        .call('np_drawDieCut', { paths: paths, layer: S.settings.ledLayer || 'เส้นกลาง', strokeWidth: 1, color: 'hex', hex: '#00a651' })
        .then(function (out) {
          status('สร้างเส้นกลางแล้ว ' + out.count + ' เส้น บนเลเยอร์ “' + out.layer + '” · ' + ledReport(v.stats), 'ok');
        });
    });
  }

  // ---------------------------------------------------------------- ตรายางเลเซอร์

  function stampOpts() {
    var s = S.settings;
    return { shape: s.stShape, margin: num('stMargin'), radius: num('stRadius'), mirror: !!s.stMirror, negative: !!s.stNegative };
  }

  function vbBox(vb) {
    return { minX: vb[0] * K, minY: -vb[1] * K, maxX: vb[2] * K, maxY: -vb[3] * K };
  }

  // แบ่ง Selection เป็นดวงตรา (รวมเป็นดวงเดียว หรือดวงละชิ้น) แล้วคำนวณเส้นตัด + งานแกะ
  function stampPlan(read) {
    var items = read.items && read.items.length ? read.items : [{ idx: 0, from: 0, to: read.paths.length, vb: read.bounds }];
    var groups =
      S.settings.stGroup === 'each'
        ? items.map(function (it) {
            return { idxs: [it.idx], paths: read.paths.slice(it.from, it.to), vb: it.vb };
          })
        : [{ idxs: items.map(function (it) { return it.idx; }), paths: read.paths, vb: read.bounds }];
    var opts = stampOpts();
    return groups.map(function (g) {
      var rings = B.subpathsToRings(g.paths, 0.05);
      var st = NC.stamp.stamp(rings, vbBox(g.vb), opts);
      st.rings = rings;
      st.idxs = g.idxs;
      st.raster = !rings.length;
      return st;
    });
  }

  function stampRead() {
    return readShapes(true).then(function (r) {
      var stamps = stampPlan(r.read);
      S.vec = { kind: 'stamp', rings: r.rings, stamps: stamps, flags: [], read: r.read };
      drawVec();
      var raster = stamps.filter(function (st) {
        return st.raster;
      }).length;
      var sizes = stamps
        .slice(0, 4)
        .map(function (st) {
          return (st.box.maxX - st.box.minX).toFixed(1) + '×' + (st.box.maxY - st.box.minY).toFixed(1);
        })
        .join(', ');
      status(
        'ได้ ' + stamps.length + ' ดวงตรา (' + sizes + (stamps.length > 4 ? ', …' : '') + ' มม.)' +
          (S.settings.stMirror ? ' · กลับด้านแล้ว' : '') +
          (raster ? ' · ⚠ ภาพ Raster ' + raster + ' ดวง กลับสีอัตโนมัติไม่ได้ (กลับด้านให้อย่างเดียว)' : ''),
        raster ? 'warn' : 'ok'
      );
      return S.vec;
    });
  }

  function stampMake() {
    return stampRead().then(function (v) {
      var s = S.settings;
      var all = [];
      v.stamps.forEach(function (st) {
        all = all.concat(st.cut);
      });
      var ub = G.bounds(all);
      var dx = ub.maxX - ub.minX + 10; // สำเนาวางข้างของเดิม ห่าง 10 มม.
      function toPt(ring) {
        return {
          closed: true,
          points: NC.cnc.toBezier(
            ring.map(function (q) {
              return [(q[0] + dx) / K, -q[1] / K];
            }),
            2 / K
          ),
        };
      }
      var stamps = v.stamps.map(function (st) {
        return {
          cut: st.cut.map(toPt),
          engrave: st.engrave && !st.raster
            ? { mode: 'negative', paths: st.engrave.map(toPt) }
            : { mode: 'dup', items: st.idxs, dx: dx / K, mirror: !!s.stMirror },
        };
      });
      status('กำลังวาดงานตรายางลงไฟล์…');
      return host
        .call('np_drawStamps', {
          stamps: stamps,
          cutLayer: s.stCutLayer || 'เส้นตัดเลเซอร์',
          engraveLayer: s.stEngraveLayer || 'งานแกะเลเซอร์',
          cutWidth: Math.max(0.001, num('stCutWidth')) / K,
          cutHex: '#ff0000',
        })
        .then(function (out) {
          status(
            'สร้างงานตรายางแล้ว ' + out.stamps + ' ดวง — เส้นตัดบนเลเยอร์ “' + out.cutLayer + '” งานแกะบนเลเยอร์ “' + out.engraveLayer +
              '” (สำเนาวางข้างของเดิม ห่าง 10 มม.)',
            'ok'
          );
        });
    });
  }

  // ---------------------------------------------------------------- ล้างงานเก่า

  function resultLayerNames() {
    var s = S.settings;
    var names = [s.dcLayer, s.ledLayer, 'ตรวจรัศมี', s.dimLayer, s.numLayer, s.stCutLayer, s.stEngraveLayer].filter(Boolean);
    return names.filter(function (n, i) {
      return names.indexOf(n) === i;
    });
  }

  function resetPanel() {
    S.parts = [];
    S.result = null;
    S.results = {};
    S.stale = false;
    S.built = false;
    S.exported = false;
    S.dc = null;
    S.vec = null;
    renderParts();
    clearPreview();
    renderStats();
    drawDc();
    drawVec();
    $('numList').innerHTML = '';
    $('hkGuide').hidden = true;
    setPage(1);
  }

  function clearOld() {
    var doSheets = $('clearSheets').checked;
    var doLayers = $('clearLayers').checked;
    var s = S.settings;
    resetPanel();
    var msg = ['ล้างรายการชิ้นงานและพรีวิวแล้ว'];
    var job = Promise.resolve();
    if (doSheets) {
      job = job.then(function () {
        return host
          .call('np_clearSheets', {
            marker: SHEET_MARK,
            layers: [s.printLayer || 'ไฟล์ปริ้นชิ้นงาน', s.cutLayer || 'เส้นไดคัท', 'มาร์ก', 'หัวงาน'],
          })
          .then(function (r) {
            msg.push(
              r.artboards || r.kept
                ? 'ลบชีตเก่า ' + r.artboards + ' แผ่น (' + r.items + ' ชิ้นบนชีต)' + (r.kept ? ' · เหลืออาร์ตบอร์ดสุดท้ายไว้ 1 แผ่น (ไฟล์ต้องมีอย่างน้อย 1)' : '')
                : 'ไม่พบชีตเก่าของนัดพอนในไฟล์นี้'
            );
          });
      });
    }
    if (doLayers) {
      job = job.then(function () {
        return host.call('np_clearLayers', { names: resultLayerNames() }).then(function (r) {
          msg.push('ลบเลเยอร์ผลลัพธ์ ' + r.removed + ' เลเยอร์' + (r.emptied ? ' (ล้างของในเลเยอร์สุดท้าย ' + r.emptied + ')' : ''));
        });
      });
    }
    return job.then(function () {
      $('clearBox').hidden = true;
      $('clearSheets').checked = false;
      $('clearLayers').checked = false;
      status(msg.join(' · '), 'ok');
    });
  }

  var FLAG_COLOR = { inner: '#ff2d55', outer: '#ff9f1a', narrow: '#ff2d55', tight: '#ff9f1a', wide: '#2f7cf6' };

  function drawVec() {
    var v = S.vec;
    var canvas = $('vecCanvas');
    var tool = S.settings.tool;
    $('vecTitle').textContent = tool === 'led' ? 'ตัวอย่างเส้นกลาง' : tool === 'stamp' ? 'ตัวอย่างงานตรายาง' : 'ตัวอย่างมุมโค้ง';
    if (!v || v.kind !== tool) {
      canvas.hidden = true;
      $('vecEmpty').hidden = false;
      $('vecReport').textContent = '';
      $('vecLegend').innerHTML = '';
      $('vecSub').textContent = '';
      return;
    }
    canvas.hidden = false;
    $('vecEmpty').hidden = true;
    var stampRings = [];
    if (v.kind === 'stamp') {
      v.stamps.forEach(function (st) {
        stampRings = stampRings.concat(st.cut);
      });
    }
    var bb = G.bounds(v.kind === 'stamp' ? stampRings : v.rings);
    var pad = 4;
    v.flags.forEach(function (f) {
      pad = Math.max(pad, (f.r || 0) + 2);
    });
    var x0 = bb.minX - pad;
    var y0 = bb.minY - pad;
    var wMm = bb.maxX - bb.minX + 2 * pad;
    var hMm = bb.maxY - bb.minY + 2 * pad;
    var box = $('vecBox');
    var cssW = Math.max(160, (box.clientWidth || 300) - 16);
    var cssH = document.body.classList.contains('wide') ? Math.max(200, box.clientHeight - 16) : 420;
    var sc = Math.min(cssW / wMm, cssH / hMm);
    var W = Math.round(wMm * sc);
    var H = Math.round(hMm * sc);
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, H);
    function path(pts, closed) {
      pts.forEach(function (q, k) {
        var x = (q[0] - x0) * sc;
        var y = (q[1] - y0) * sc;
        if (k) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      });
      if (closed) ctx.closePath();
    }
    if (v.kind === 'stamp') {
      v.stamps.forEach(function (st) {
        ctx.beginPath();
        if (st.engrave) {
          st.engrave.forEach(function (r) {
            path(r, true);
          });
          ctx.fillStyle = '#111';
        } else {
          (S.settings.stMirror ? NC.stamp.mirror(st.rings, st.axis) : st.rings).forEach(function (r) {
            path(r, true);
          });
          ctx.fillStyle = '#1f2a44';
        }
        ctx.fill('evenodd');
        ctx.beginPath();
        st.cut.forEach(function (r) {
          path(r, true);
        });
        ctx.strokeStyle = '#ff1f3d';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });
    }
    // ของเดิม
    ctx.beginPath();
    (v.kind === 'stamp' ? [] : v.rings).forEach(function (r) {
      path(r, true);
    });
    ctx.fillStyle = v.kind === 'led' ? 'rgba(31,42,68,.85)' : 'rgba(31,42,68,.16)';
    ctx.fill('evenodd');
    ctx.strokeStyle = 'rgba(31,42,68,.7)';
    ctx.lineWidth = 1;
    ctx.stroke();
    if (v.kind === 'stamp') {
      // วาดไปแล้วข้างบน
    } else if (v.kind === 'corner') {
      ctx.beginPath();
      v.loops.forEach(function (lp) {
        path(lp.points, true);
      });
      ctx.fillStyle = 'rgba(200,100,59,.28)';
      ctx.fill('evenodd');
      ctx.strokeStyle = '#c8643b';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else {
      ctx.strokeStyle = '#3ee07a';
      ctx.lineWidth = 2.5;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      v.lines.forEach(function (ln) {
        ctx.beginPath();
        path(ln.points, ln.closed);
        ctx.stroke();
      });
    }
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 2;
    v.flags.forEach(function (f) {
      var r = Math.max(6, (f.r || Math.max(3, num('ledWidth'))) * sc);
      ctx.strokeStyle = FLAG_COLOR[f.kind] || '#ff2d55';
      ctx.beginPath();
      ctx.arc((f.x - x0) * sc, (f.y - y0) * sc, r, 0, Math.PI * 2);
      ctx.stroke();
    });
    ctx.setLineDash([]);
    $('vecSub').textContent = Math.round(bb.maxX - bb.minX) + ' × ' + Math.round(bb.maxY - bb.minY) + ' มม.';
    var legend =
      v.kind === 'stamp'
        ? [['#111111', 'ยิงแกะออก (พื้นดำ)'], ['#ffffff', 'เหลือนูน (รับหมึก)'], ['#ff1f3d', 'เส้นตัดขาด']]
        : v.kind === 'corner'
        ? [['#1f2a44', 'ของเดิม'], ['#c8643b', 'มุมโค้งใหม่'], ['#ff2d55', 'มุมใน: ดอกลงไม่ได้'], ['#ff9f1a', 'มุมนอก: บางกว่าดอก']]
        : [['#3ee07a', 'เส้นกลาง'], ['#ff2d55', 'แคบกว่าแถบไฟ'], ['#ff9f1a', 'โค้งเกิน'], ['#2f7cf6', 'กว้างเกิน 2 เท่า']];
    var lg = $('vecLegend');
    lg.innerHTML = '';
    legend.forEach(function (it) {
      var span = el('span', null, it[1]);
      var dot = el('i');
      dot.style.background = it[0];
      span.insertBefore(dot, span.firstChild);
      lg.appendChild(span);
    });
    $('vecReport').textContent =
      v.kind === 'stamp'
        ? v.stamps.length + ' ดวงตรา · ' + (S.settings.stMirror ? 'กลับด้านแล้ว (ปั๊มออกมาอ่านถูก)' : 'ไม่กลับด้าน') +
          ' · ' + (S.settings.stNegative ? 'กลับสีสำหรับแกะ' : 'ไม่กลับสี')
        : v.kind === 'led'
        ? ledReport(v.stats)
        : 'ได้ ' + v.loops.length + ' วง · จุดตรวจ ' + v.flags.length + ' จุด' + (v.flags.length ? ' — ร่องแคบกว่าดอกหรือมุมแหลมจัด ดอกกัดลงไม่ถึง' : '');
  }

  // ---------------------------------------------------------------- เส้นบอกขนาด

  function dimScale() {
    var s = S.settings;
    return s.dimScale === 'custom' ? Math.max(0.001, num('dimScaleCustom')) : parseFloat(s.dimScale) || 1;
  }

  function dimPlan(items) {
    var s = S.settings;
    var boxes = items.map(function (it) {
      return it.vb;
    });
    var fmt = { unit: s.dimUnit, scale: dimScale(), decimals: num('dimDecimals') };
    var side = (s.dimSide === 'auto' ? 'top-right' : s.dimSide).split('-');
    var size = num('dimSize');
    var off = num('dimOffset') * PT;
    var axes = s.dimAxis === 'both' ? ['w', 'h'] : [s.dimAxis];
    var targets = [];
    if (s.dimScope !== 'all') boxes.forEach(function (b) {
      targets.push({ box: b, offset: off });
    });
    if (s.dimScope !== 'each' && !(s.dimScope === 'both' && boxes.length < 2)) {
      targets.push({ box: D.unionBox(boxes), offset: s.dimScope === 'both' ? off * 2 + size * 1.6 : off });
    }
    var dims = [];
    targets.forEach(function (t) {
      axes.forEach(function (ax) {
        var d = D.dimension(t.box, ax, { side: ax === 'w' ? side[0] : side[1], offset: t.offset, size: size });
        d.text.str = D.formatLength(ax === 'w' ? t.box[2] - t.box[0] : t.box[1] - t.box[3], fmt);
        dims.push(d);
      });
    });
    return dims;
  }

  function dimMake() {
    var s = S.settings;
    status('กำลังวัดขนาด…');
    return host.call('np_readBounds', {}).then(function (r) {
      var dims = dimPlan(r.items);
      return host
        .call('np_drawDimensions', {
          dims: dims,
          layer: s.dimLayer || 'Dimension',
          hex: s.dimColor,
          strokeWidth: num('dimStroke'),
          clear: !!s.dimClear,
        })
        .then(function (out) {
          var values = dims
            .map(function (d) {
              return d.text.str;
            })
            .slice(0, 6)
            .join(', ');
          status(
            'ใส่เส้นบอกขนาดแล้ว ' + out.count + ' เส้น (สเกล 1:' + dimScale() + ') บนเลเยอร์ “' + out.layer + '”: ' + values +
              (dims.length > 6 ? ' …' : '') + (out.cleared ? ' · ล้างของเดิม ' + out.cleared + ' ชิ้น' : ''),
            'ok'
          );
        });
    });
  }

  // ---------------------------------------------------------------- รันนัมเบอร์

  function numOpts(count) {
    var s = S.settings;
    return {
      start: num('numStart'),
      step: num('numStep'),
      prefix: s.numPrefix || '',
      suffix: s.numSuffix || '',
      pad: s.numPadMode === 'auto' ? 'auto' : s.numPadMode === 'none' ? 0 : num('numPad'),
      count: count,
    };
  }

  function numStyle() {
    var s = S.settings;
    if (s.numStyle !== 'custom') return null;
    return { font: s.numFont || '', size: num('numSize'), hex: s.numColor, align: s.numAlign, underline: !!s.numUnderline };
  }

  function numPlan() {
    var s = S.settings;
    if (s.numMode === 'page') {
      return host.call('np_readArtboards', {}).then(function (r) {
        var abs = r.artboards;
        var skip = Math.max(0, Math.round(num('numSkip')));
        var numbered = abs.slice(skip);
        if (!numbered.length) throw new Error('เว้น ' + skip + ' หน้าแล้วไม่เหลือหน้าให้ใส่เลข (มี ' + abs.length + ' อาร์ตบอร์ด)');
        var opts = numOpts(numbered.length);
        var size = s.numStyle === 'custom' ? num('numSize') : 10;
        return {
          mode: 'page',
          skipped: abs.slice(0, skip),
          pages: numbered.map(function (ab, i) {
            var pos = D.pagePosition(ab.rect, s.numPos, num('numMargin') * PT, size, !!s.numMirror, skip + i + 1);
            return { x: pos.x, y: pos.y, justify: pos.justify, text: D.numberText(i, opts), label: ab.name || 'อาร์ตบอร์ด ' + (ab.index + 1) };
          }),
        };
      });
    }
    return host.call('np_readTexts', {}).then(function (r) {
      if (!r.texts.length) throw new Error('ไม่พบ Text Frame ในชิ้นที่เลือก — เลือกกล่องข้อความ (หรือกลุ่มที่มีข้อความ)');
      var ordered = D.orderItems(r.texts, s.numOrder);
      var opts = numOpts(ordered.length);
      return {
        mode: 'text',
        items: ordered.map(function (t, i) {
          return { idx: t.idx, before: t.contents, text: D.fillTemplate(t.contents, D.numberText(i, opts), !!s.numToken) };
        }),
      };
    });
  }

  function renderNumList(plan) {
    var ol = $('numList');
    ol.innerHTML = '';
    var rows = [];
    if (plan.mode === 'page') {
      plan.skipped.forEach(function (ab) {
        rows.push([ab.name || 'อาร์ตบอร์ด ' + (ab.index + 1), '(เว้น)']);
      });
      plan.pages.forEach(function (pg) {
        rows.push([pg.label, pg.text]);
      });
    } else {
      plan.items.forEach(function (it) {
        rows.push([it.before, it.text]);
      });
    }
    rows.slice(0, 60).forEach(function (r) {
      var li = el('li');
      li.appendChild(el('span', null, r[0] + ' → '));
      li.appendChild(el('b', null, r[1]));
      ol.appendChild(li);
    });
    if (rows.length > 60) ol.appendChild(el('li', null, '… อีก ' + (rows.length - 60) + ' รายการ'));
  }

  function numPreview() {
    status('กำลังอ่าน…');
    return numPlan().then(function (plan) {
      renderNumList(plan);
      var n = plan.mode === 'page' ? plan.pages.length : plan.items.length;
      status('ตัวอย่าง ' + n + ' รายการ — กด “ใส่เลข” เพื่อเขียนลงไฟล์', 'ok');
      return plan;
    });
  }

  function numMake() {
    var s = S.settings;
    return numPreview().then(function (plan) {
      if (plan.mode === 'page') {
        return host
          .call('np_pageNumbers', {
            pages: plan.pages,
            style: numStyle() || { size: 10, hex: '#000000' },
            layer: s.numLayer || 'เลขหน้า',
            clear: !!s.numClear,
          })
          .then(function (out) {
            status('ใส่เลขหน้าแล้ว ' + out.count + ' หน้า บนเลเยอร์ “' + out.layer + '”', 'ok');
          });
      }
      var items = plan.items.filter(function (it) {
        return it.text !== it.before;
      });
      if (!items.length) throw new Error('ไม่มีข้อความให้เปลี่ยน — ติ๊ก “แทนเฉพาะ {%n}” อยู่ แต่ไม่มีข้อความไหนมี {%n}');
      return host.call('np_setTexts', { items: items, style: numStyle() }).then(function (out) {
        status('ใส่เลขแล้ว ' + out.count + ' กล่อง (' + items[0].text + ' … ' + items[items.length - 1].text + ')', 'ok');
      });
    });
  }

  // ---------------------------------------------------------------- ปุ่มลัด (One-key)

  var QUICK_EVENT = 'com.nongploy.nestingcut.quick';
  var QUICK_FILE = 'NudPon Quick Nest.jsx';

  function asciiOnly(str) {
    return str.replace(/[\u007f-￿]/g, function (c) {
      return '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4);
    });
  }

  // สคริปต์ที่ Action เรียก: ส่งเหตุการณ์ให้แผงที่เปิดอยู่ (แผงทำงานต่อด้วยค่าล่าสุด)
  function quickScript() {
    var needPanel = 'เปิดแผงนัดพอน (Window → Extensions → นัดพอน Nesting Cut) อย่างน้อยหนึ่งครั้งหลังเปิด Illustrator แล้วกดปุ่มลัดอีกครั้ง';
    var needSel = 'เลือกชิ้นงานก่อน แล้วกดปุ่มลัดอีกครั้ง';
    return asciiOnly(
      [
        '// NudPon Quick Nest - created by the NudPon Nesting Cut panel',
        '// Select artwork and run this script (from an Action with a function key): the panel',
        '// nests the selection and builds the die-cut sheet with its latest settings.',
        '(function () {',
        '  if (!$.global.NP_PANEL_READY) { alert(' + JSON.stringify(needPanel) + '); return; }',
        '  var doc = app.documents.length ? app.activeDocument : null;',
        '  if (!doc || !doc.selection || !doc.selection.length) { alert(' + JSON.stringify(needSel) + '); return; }',
        '  try { new ExternalObject("lib:PlugPlugExternalObject"); } catch (e) {}',
        '  var ev = new CSXSEvent();',
        '  ev.type = "' + QUICK_EVENT + '";',
        '  ev.data = "go";',
        '  ev.dispatch();',
        '})();',
        '',
      ].join('\n')
    );
  }

  function keyLabel() {
    var s = S.settings;
    return [s.hkCmd ? 'Cmd/Ctrl' : '', s.hkShift ? 'Shift' : '', s.hkKey || 'F5']
      .filter(Boolean)
      .join(' + ');
  }

  function renderGuide(r) {
    var box = $('hkGuide');
    box.innerHTML = '';
    box.hidden = false;
    var head = el('div');
    head.appendChild(document.createTextNode('ตั้งปุ่ม '));
    head.appendChild(el('kbd', null, keyLabel()));
    box.appendChild(head);
    var ol = el('ol');
    function step(text, code) {
      var li = el('li', null, text);
      if (code) {
        li.appendChild(document.createTextNode(' '));
        li.appendChild(el('code', null, code));
      }
      ol.appendChild(li);
    }
    if (!r.installed) {
      step('คัดลอกไฟล์สคริปต์', r.path);
      step('ไปไว้ในโฟลเดอร์ Scripts ของ Illustrator (ต้องใช้สิทธิ์ผู้ดูแลเครื่อง)', r.scripts || '…/Adobe Illustrator …/Presets/<ภาษา>/Scripts');
    } else step('ติดตั้งสคริปต์แล้วที่', r.path);
    step('ปิดแล้วเปิด Illustrator ใหม่หนึ่งครั้ง ให้เมนู File → Scripts เห็น “NudPon Quick Nest”');
    step('เปิด Window → Actions → สร้าง Set ใหม่ (เช่น “นัดพอน”) แล้วกด New Action');
    step('ตั้ง Function Key = ' + (S.settings.hkKey || 'F5') + (S.settings.hkShift ? ' + Shift' : '') + (S.settings.hkCmd ? ' + Command/Ctrl' : '') + ' → กด Record');
    step('เมนูของแผง Actions → Insert Menu Item… → เลือก File → Scripts → NudPon Quick Nest → OK แล้วกด Stop');
    step('ทุกครั้งหลังเปิด Illustrator ให้เปิดแผงนัดพอนหนึ่งครั้ง จากนั้นเลือกชิ้นงานแล้วกด ' + keyLabel() + ' ได้เลย');
    box.appendChild(ol);
  }

  function hkSetup() {
    var code = quickScript();
    var job = host.demo
      ? Promise.resolve({ installed: false, path: host.writeText(QUICK_FILE, code) + ' (ดาวน์โหลดแล้ว)' })
      : host.call('np_installQuickScript', { code: code, fileName: QUICK_FILE });
    return job.then(function (r) {
      renderGuide(r);
      status(
        r.installed ? 'ติดตั้งสคริปต์แล้ว — ทำตามขั้นตอนด้านล่างเพื่อผูกปุ่ม ' + keyLabel() : 'บันทึกสคริปต์แล้ว — คัดลอกไปโฟลเดอร์ Scripts ตามขั้นตอนด้านล่าง',
        r.installed ? 'ok' : 'warn'
      );
    });
  }

  // สิ่งที่ปุ่มลัดทำ: ดึง Selection → จัดวางด้วยค่าล่าสุด → สร้างชีตไดคัท
  function quickRun() {
    var tool = S.settings.tool === 'run' ? 'run' : 'nest';
    if (S.settings.tool !== tool) setTool(tool);
    return scan()
      .then(prepareForTool)
      .then(nestNow)
      .then(function () {
        if (host.demo) return setPage(3);
        return buildLayout().then(function () {
          setPage(4);
        });
      });
  }

  // ช่องที่แสดงเฉพาะบางตัวเลือก
  function syncFields() {
    var s = S.settings;
    function show(sel, on) {
      Array.prototype.forEach.call(document.querySelectorAll(sel), function (e) {
        e.hidden = !on;
      });
    }
    show('[data-dim-custom]', s.dimScale === 'custom');
    show('[data-num-pad]', s.numPadMode === 'custom');
    show('[data-num="text"]', s.numMode !== 'page');
    show('[data-num="page"]', s.numMode === 'page');
    show('[data-num-style]', s.numStyle === 'custom');
    show('[data-run-custom]', s.runSize === 'custom');
    show('#headerFields', !!s.headerOn);
    // ขนาดของร้านที่ล็อกไว้ แก้กว้าง/สูงไม่ได้
    var med = L.media(s.media);
    var fixed = !!(med && med.fixed);
    $('width').disabled = fixed;
    $('length').disabled = fixed;
    show('#mediaLock', fixed);
    var tpl = templateMode();
    show('#tplBox', tpl);
    show('#sizeBox', !tpl);
    show('#headerOnRow', !tpl);
    show('#buildNormal', !tpl);
    show('#buildTpl', tpl);
    show('#rectButtRow', s.tool === 'nest' && !!s.fillSheet);
    show('#orderQtyRow', s.tool === 'run' || !!s.fillSheet);
    show('#priceHeadRow', !!s.headerOn && !tpl);
    if (tpl) show('#headerFields', false);
    if (tpl) renderTplInfo();
    renderGtInfo();
    var unit = s.sizeUnit === 'in' ? ' (นิ้ว)' : ' (มม.)';
    Array.prototype.forEach.call(document.querySelectorAll('[data-unit]'), function (e) {
      e.textContent = e.getAttribute('data-unit') + unit;
    });
  }

  // ---------------------------------------------------------------- หน้าเดียว (จัดวางดวง / ไดคัทต่อเนื่อง)
  //
  // ทุกอย่างอยู่หน้าเดียว ตายตัว: พรีวิวซ้าย เครื่องมือขวา — เปลี่ยนค่าอะไรก็คำนวณใหม่ให้เองทันที (พรีวิวสด)
  // ปุ่มส้มปุ่มเดียว: ① ดึงชิ้นงานที่เลือก → ② เรียงลงเทมเพลต / สร้างชีตใน Illustrator

  var WIZARD = ['nest', 'run'];

  function hasResult() {
    return !!S.result && !S.stale;
  }

  function calcNow() {
    return (S.parts.length ? Promise.resolve() : scan()).then(prepareForTool).then(nestNow);
  }

  // พรีวิวสด: รอให้หยุดแก้ค่าแป๊บหนึ่งแล้วคำนวณใหม่ (ยังไม่แตะไฟล์งาน)
  var autoTimer = null;
  function autoCalc() {
    if (WIZARD.indexOf(S.settings.tool) < 0) return;
    clearTimeout(autoTimer);
    autoTimer = setTimeout(function () {
      if (!S.parts.length || hasResult()) return;
      if (S.busy) return autoCalc();
      run(calcNow);
    }, 350);
  }

  function buildNow() {
    return buildLayout().then(updateFlow);
  }

  // ปุ่มส้ม: [ข้อความ, งาน]
  function nextAction() {
    var tpl = templateMode();
    if (!S.parts.length) return [host.demo ? '① โหลดชิ้นงานตัวอย่าง' : '① ดึงชิ้นงานที่เลือก', scan];
    if (!hasResult()) return ['คำนวณ', calcNow];
    if (S.built) return [tpl ? '✓ เรียงแล้ว — เรียงใหม่อีกครั้ง' : '✓ สร้างแล้ว — สร้างใหม่อีกครั้ง', buildNow];
    return [tpl ? '② เรียงลงเทมเพลตใน Illustrator' : '② สร้างชีตใน Illustrator', buildNow];
  }

  function stepHint() {
    var isRun = S.settings.tool === 'run';
    if (!S.parts.length) {
      return isRun
        ? 'เลือกสติ๊กเกอร์ต้นแบบ 1 ดวงใน Illustrator แล้วกด ① — พรีวิวขึ้นให้เอง'
        : 'เลือกชิ้นงานใน Illustrator แล้วกด ① — พรีวิวขึ้นให้เอง';
    }
    if (S.busy) return 'กำลังคำนวณ…';
    if (S.built) {
      return templateMode()
        ? 'เรียงลงเทมเพลตแล้ว ✓ ส่งเข้า Cutting Master 5 ได้เลย — แก้ค่าแล้วกดเรียงใหม่ได้'
        : 'สร้างชีตแล้ว ✓ — ส่งออกไฟล์ได้ที่ “ส่งออกไฟล์” ด้านล่าง';
    }
    if (hasResult()) return 'ปรับค่าได้เลย พรีวิวเปลี่ยนตามทันที — โอเคแล้วกด ② (งานเดิมไม่ถูกย้าย)';
    return 'กำลังเตรียมพรีวิว…';
  }

  function updateFlow() {
    var act = nextAction();
    var btn = $('btnNext');
    btn.textContent = act[0];
    btn.classList.toggle('done', !!S.built);
    $('stepHint').textContent = stepHint();
    $('btnExport').textContent = S.exported ? '✓ ส่งออกแล้ว — ส่งอีกครั้ง' : 'ส่งออกไฟล์';
  }

  // หน้าเดียวแล้ว — เก็บไว้ให้ส่วนอื่นเรียกได้ (เลื่อนกลับบนสุด)
  function setPage(n) {
    S.page = n;
    updateFlow();
    if (S.result) drawPreview();
  }

  // ---------------------------------------------------------------- การ์ด “วันนี้จะทำอะไร?”

  // ภาษาคนทำร้าน ไม่ใช่ชื่อฟีเจอร์
  var GUIDE_JOBS = [
    ['nest', '🧩', 'วางสติ๊กเกอร์หลายแบบลงแผ่นให้ประหยัด', 'แล้วส่งไฟล์เข้าเครื่องตัด (จัดวางดวง)'],
    ['run', '🏷️', 'สติ๊กเกอร์แบบเดียว ซ้ำเต็มแผ่น', 'ฉลากจำนวนมาก ตัดต่อเนื่อง (ไดคัทต่อเนื่อง)'],
    ['shape', '✂️', 'สร้างเส้นไดคัทตามขอบรูป', 'จากโลโก้ / PNG พื้นใส (ไดคัทตามรูป)'],
    ['corner', '🔧', 'ทำมุมโค้งให้ดอกกัด CNC เข้าได้', 'ตัวอักษรอะคริลิก / ไม้ (ทำมุมโค้ง)'],
    ['led', '💡', 'หาเส้นกลางตัวอักษรไว้วาง LED', 'ป้ายไฟตัวอักษร (หาเส้นกลาง)'],
    ['dim', '📏', 'ใส่เส้นบอกขนาดงาน', 'ส่งลูกค้าดู / ส่งช่าง (บอกขนาด)'],
    ['number', '🔢', 'รันเลขลงป้าย / คูปอง', 'เลขต่อเนื่องหรือเลขหน้า (รันนัมเบอร์)'],
    ['stamp', '🔴', 'ทำตรายางสำหรับเลเซอร์', 'กลับด้าน + เส้นตัดรอบ (ตรายางเลเซอร์)'],
    ['hotkey', '⌨️', 'ตั้งปุ่มลัดกดทีเดียว', 'สั่งงานที่ใช้บ่อยจากคีย์บอร์ด (ปุ่มลัด)'],
  ];

  function guideOpenStart() {
    var list = $('guideList');
    if (!list.children.length) {
      GUIDE_JOBS.forEach(function (j) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'guide-job';
        b.setAttribute('data-job', j[0]);
        b.innerHTML = '<span class="gj-ico"></span><span class="gj-txt"><b></b><small></small></span>';
        b.querySelector('.gj-ico').textContent = j[1];
        b.querySelector('b').textContent = j[2];
        b.querySelector('small').textContent = j[3];
        b.onclick = function () {
          guideStart(j[0]);
        };
        list.appendChild(b);
      });
    }
    Array.prototype.forEach.call(list.children, function (b) {
      b.classList.toggle('on', b.getAttribute('data-job') === S.settings.tool);
    });
    $('guideStart').hidden = false;
    // ระหว่างเลือกงาน โชว์การ์ดนี้อย่างเดียว
    document.body.classList.add('choosing');
    $('btnGuide').classList.add('on');
    $('scroller').scrollTop = 0;
  }

  function guideClose() {
    S.settings.guideSeen = true;
    saveSettings();
    $('guideStart').hidden = true;
    document.body.classList.remove('choosing');
    $('btnGuide').classList.remove('on');
  }

  function guideStart(tool) {
    if (S.busy) return;
    guideClose();
    setTool(tool);
    setPage(1);
  }

  function bindGuide() {
    $('btnGuide').onclick = function () {
      if ($('guideStart').hidden) guideOpenStart();
      else guideClose();
    };
    $('btnGuideOff').onclick = guideClose;
    if (!S.settings.guideSeen) guideOpenStart();
  }

  // ---------------------------------------------------------------- สลับเครื่องมือ

  var TOOL_STATUS = {
    nest: 'พร้อมลุย — เลือกชิ้นงานแล้วกด “ดึงชิ้นงานที่เลือก”',
    run: 'เลือกต้นแบบหนึ่งดวง → ดึงชิ้นงาน → กด “คำนวณ” ดูจำนวนดวงและจำนวนครั้งยกใบมีด',
    shape: 'เลือกชิ้นงานใน Illustrator แล้วกด “อ่านรูป / ดูตัวอย่าง”',
    corner: 'เลือกตัวอักษรหรือ Path แล้วกดวิเคราะห์',
    stamp: 'เลือกแบบตรายางแล้วกดวิเคราะห์',
    led: 'เลือกตัวอักษรปิดแล้วกดวิเคราะห์',
    dim: 'เลือกงานแล้วกดใส่เส้นบอกขนาด',
    number: 'เลือก Text Frame (หรือเปิดไฟล์หลายอาร์ตบอร์ด) แล้วกดดูตัวอย่าง',
    hotkey: 'เลือกปุ่มแล้วกด “วิธีตั้งค่า”',
  };
  var NO_PREVIEW = ['dim', 'number', 'hotkey'];

  // ส่วนที่แสดง = ตรงกับเครื่องมือ (พรีวิวที่ย้ายไปช่องซ้ายของจอกว้างเห็นตลอด)
  function applyVisibility() {
    var tool = S.settings.tool;
    Array.prototype.forEach.call(document.querySelectorAll('[data-for]'), function (e) {
      e.hidden = e.getAttribute('data-for').split(' ').indexOf(tool) < 0;
    });
    // หน้าเดียว: แสดงทุกการ์ดของเครื่องมือ (ไม่ซ่อนตามขั้นแล้ว)
    Array.prototype.forEach.call(document.querySelectorAll('.off-page'), function (e) {
      e.classList.remove('off-page');
    });
    syncFields(); // ช่องที่โชว์ตามตัวเลือก (data-for ข้างบนเพิ่งเปิดทุกอย่างของเครื่องมือนี้)
    if ($('toolSelect').value !== tool) $('toolSelect').value = tool;
  }

  // ช่องกรอกแบบ “ชื่ออยู่ซ้าย ช่องอยู่ขวา” อ่านง่ายเหมือนแผงของ Illustrator
  function markFields() {
    Array.prototype.forEach.call(document.querySelectorAll('label'), function (l) {
      if (l.classList.contains('check') || l.classList.contains('stack')) return;
      if (l.querySelector('input:not([type="checkbox"]), select')) l.classList.add('field');
    });
  }

  function setTool(tool) {
    var prev = S.settings.tool;
    if (!TOOL_STATUS[tool]) tool = 'nest';
    if (prev !== tool) {
      S.results[prev] = S.result;
      S.result = S.results[tool] || null;
    }
    S.settings.tool = tool;
    saveSettings();
    applyVisibility();
    document.body.classList.toggle('nopreview', NO_PREVIEW.indexOf(tool) >= 0);
    if (tool === 'corner' || tool === 'led' || tool === 'stamp') drawVec();
    if (S.result) {
      drawPreview();
      renderStats();
    } else clearPreview();
    if (prev !== tool) status(TOOL_STATUS[tool]);
    updateFlow();
  }

  // ---------------------------------------------------------------- ฟอร์มค่าตั้ง

  var NEST_KEYS = [
    'width', 'length', 'sizeUnit', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight', 'gridCut', 'spacing', 'rotation', 'quality', 'respectBleed', 'markType', 'markSize',
    'markInset', 'markThick', 'markClearance', 'markEvery', 'headerOn', 'headerHeight', 'cutter', 'media',
    'arrange', 'fillSheet', 'rectButt', 'runShape', 'runSize', 'runW', 'runH', 'runRadius', 'runGap', 'runLayout',
  ];
  var VEC_KEYS = ['cnIn', 'cnOut', 'ledWidth', 'ledRadius', 'ledMargin', 'stShape', 'stMargin', 'stRadius', 'stGroup', 'stMirror', 'stNegative'];
  var DC_KEYS = ['dcSource', 'dcOffset', 'dcJoin', 'dcMiter', 'dcHoles', 'dcTol', 'dcShadow', 'dcDetail'];

  function fields() {
    return Array.prototype.slice.call(document.querySelectorAll('[data-setting]'));
  }

  function writeField(key) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-setting="' + key + '"]'), function (f) {
      if (f.type === 'checkbox') f.checked = !!S.settings[key];
      else f.value = S.settings[key] == null ? '' : S.settings[key];
    });
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
    // เปลี่ยนเครื่องตัดไม่เปิดหัวงานเอง — เครื่องที่ไม่พิมพ์ (ตัดสติ๊กเกอร์อย่างเดียว) ปิดให้
    if (c.header === false) setSetting('headerOn', false);
    $('cutterNote').textContent = c.note || '';
  }

  // ขนาดของกระดาษ (มม.) — “ขนาดงานตัดหน้าร้าน” ใช้ขนาดที่ร้านแก้ไว้ถ้ามี
  function mediaSize(m) {
    var sz = m.id === 'gt_shop' && S.settings.shopSize;
    return sz && sz.w > 0 ? { w: sz.w, l: sz.l } : { w: m.width, l: m.length };
  }

  function mediaLabel(m) {
    if (!m.cutter) return m.label;
    var z = mediaSize(m);
    var k = m.unit === 'in' ? 25.4 : 1;
    function f(v) {
      return Math.round((v / k) * 100) / 100;
    }
    return m.label + ' · ' + f(z.w) + '×' + f(z.l) + (k === 1 ? ' มม.' : ' นิ้ว');
  }

  // เลือกขนาดกระดาษ: ขนาดของร้านตั้งหน่วย + เครื่องตัด + มาร์กให้ด้วย
  function applyMedia(id, keepCutter) {
    var m = L.media(id);
    if (!m || id === 'custom' || m.template) return;
    if (m.unit && !keepCutter) setSetting('sizeUnit', m.unit);
    if (m.cutter && !keepCutter) {
      setSetting('cutter', m.cutter);
      applyCutter(m.cutter);
    }
    var z = mediaSize(m);
    var k = unitK();
    setSetting('width', Math.round((z.w / k) * 100) / 100);
    setSetting('length', z.l ? Math.round((z.l / k) * 100) / 100 : '');
  }

  // ราคากระดาษจำแยกตามขนาด
  function loadPrice() {
    var p = (S.settings.prices || {})[S.settings.media];
    setSetting('sheetPrice', p == null ? '' : p);
  }

  function savePrice() {
    S.settings.prices = S.settings.prices || {};
    S.settings.prices[S.settings.media] = S.settings.sheetPrice;
  }

  function fillSelect(id, list) {
    var sel = $(id);
    list.forEach(function (it) {
      var o = el('option', null, it.label);
      o.value = it.id;
      sel.appendChild(o);
    });
  }

  // ขนาดของร้าน (Graphtec) อยู่กลุ่มบนสุด
  function fillMedia() {
    var sel = $('media');
    sel.innerHTML = '';
    [
      ['ของร้าน', L.MEDIA.filter(function (m) { return !!m.shop; })],
      ['ขนาดทั่วไป', L.MEDIA.filter(function (m) { return !m.shop; })],
    ].forEach(function (grp) {
      var g = document.createElement('optgroup');
      g.label = grp[0];
      grp[1].forEach(function (m) {
        var o = el('option', null, mediaLabel(m));
        o.value = m.id;
        g.appendChild(o);
      });
      sel.appendChild(g);
    });
    sel.value = S.settings.media;
  }

  function bindSettings() {
    fillSelect('cutter', L.CUTTERS);
    fillMedia();
    fillSelect('runShape', NC.diecut.SHAPES);
    fillSelect('stShape', NC.stamp.SHAPES);
    var keys = [];
    for (var f = 2; f <= 15; f++) keys.push({ id: 'F' + f, label: 'F' + f });
    fillSelect('hkKey', keys);
    fields().forEach(function (f) {
      var key = f.getAttribute('data-setting');
      writeField(key);
      f.addEventListener('change', function () {
        S.settings[key] = f.type === 'checkbox' ? f.checked : f.value;
        writeField(key); // ช่องเดียวกันที่อยู่หลายที่ (เช่น หมายเหตุงาน)
        if (key === 'cutter') applyCutter(f.value);
        if (key === 'media') loadPrice();
        if (key === 'sheetPrice') savePrice();
        if (key === 'markType') renderGtInfo();
        if (key === 'sizeUnit' && S.settings.media === 'custom') {
          // กำหนดเอง: แปลงตัวเลขเดิมเป็นหน่วยใหม่
          var r = f.value === 'in' ? 1 / 25.4 : 25.4;
          ['width', 'length'].forEach(function (k2) {
            var v = parseFloat(S.settings[k2]);
            if (v > 0) setSetting(k2, Math.round(v * r * 100) / 100);
          });
        } else if (key === 'media') applyMedia(S.settings.media);
        else if (key === 'sizeUnit') applyMedia(S.settings.media, true);
        if (key === 'width' || key === 'length') {
          if (S.settings.media === 'gt_shop') {
            // ขนาดงานตัดหน้าร้าน: แก้ขนาดได้ ชื่อเดิม (จำไว้ใช้ครั้งหน้า)
            S.settings.shopSize = { w: num('width') * unitK(), l: num('length') * unitK() };
            fillMedia();
          } else if (S.settings.media !== 'custom') setSetting('media', 'custom');
        }
        if (key === 'cutMode') {
          S.parts.forEach(function (p) {
            if (p.mode !== 'contour') p.mode = defaultMode(p);
          });
          renderParts();
        }
        saveSettings();
        if (DC_KEYS.indexOf(key) >= 0) S.dc = null;
        if (VEC_KEYS.indexOf(key) >= 0 && S.vec) {
          S.vec = null;
          drawVec();
        }
        syncFields();
        if (PRICE_KEYS.indexOf(key) >= 0) return priceChanged();
        if (NEST_KEYS.indexOf(key) >= 0) markStale();
        else S.built = false;
        if (S.result && !S.stale) drawPreview();
      });
    });
    var c = L.cutter(S.settings.cutter);
    $('cutterNote').textContent = c ? c.note : '';
    // ราคาอัปเดตทันทีที่พิมพ์ ไม่ต้องรอออกจากช่อง
    Array.prototype.forEach.call(document.querySelectorAll('[data-price]'), function (f) {
      f.addEventListener('input', function () {
        var key = f.getAttribute('data-setting');
        S.settings[key] = f.value;
        if (key === 'sheetPrice') savePrice();
        saveSettings();
        priceChanged();
      });
    });
    renderGtInfo();
    renderLogoName();
  }

  // ราคาเปลี่ยน: คิดใหม่ทันที (ไม่ต้องจัดวางใหม่) · ถ้าพิมพ์ราคาลงหัวงาน หัวงานในไฟล์ต้องสร้างใหม่
  function priceChanged() {
    renderStats();
    if (S.settings.priceInHeader && S.settings.headerOn && !templateMode()) {
      S.built = false;
      if (S.result && !S.stale) drawPreview();
    }
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
    var brand = document.querySelector('.topbar .logo');
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
      $('btnScan').textContent = '↻ โหลดตัวอย่างใหม่';
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
      run(calcNow);
    };
    $('btnLearnMarks').onclick = function () {
      run(learnMarks);
    };
    $('btnForgetMarks').onclick = forgetMarks;
    $('pvPrev').onclick = function () {
      pvStep(-1);
    };
    $('pvNext').onclick = function () {
      pvStep(1);
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
    $('toolSelect').onchange = function () {
      if (S.busy) $('toolSelect').value = S.settings.tool;
      else setTool($('toolSelect').value);
    };
    markFields();
    // ปุ่มส้ม: เปลี่ยนหน้าเฉย ๆ ทำทันที · งานที่แตะไฟล์ผ่าน run() (ล็อกปุ่ม + แจ้งผิดพลาด)
    $('btnNext').onclick = function () {
      if (S.busy) return;
      var act = nextAction();
      if (act[2]) act[1]();
      else run(act[1]);
    };
    $('btnExport').onclick = function () {
      run(exportAll);
    };
    $('appVer').textContent = 'รุ่น ' + PANEL_VERSION;
    $('btnStRead').onclick = function () {
      run(stampRead);
    };
    $('btnStMake').onclick = function () {
      run(stampMake);
    };
    $('btnClear').onclick = function () {
      $('clearLayerNames').textContent = resultLayerNames().join(', ');
      $('clearBox').hidden = !$('clearBox').hidden;
    };
    $('btnClearCancel').onclick = function () {
      $('clearBox').hidden = true;
    };
    $('btnClearGo').onclick = function () {
      run(clearOld);
    };
    $('btnCnRead').onclick = function () {
      run(cncRead);
    };
    $('btnCnMake').onclick = function () {
      run(cncMake);
    };
    $('cnBit').onchange = function () {
      if (!$('cnBit').value) return;
      setSetting('cnIn', parseFloat($('cnBit').value));
      saveSettings();
      S.vec = null;
      drawVec();
      $('cnBit').value = '';
    };
    $('btnLedRead').onclick = function () {
      run(ledRead);
    };
    $('btnLedMake').onclick = function () {
      run(ledMake);
    };
    $('btnDimMake').onclick = function () {
      run(dimMake);
    };
    $('btnNumPreview').onclick = function () {
      run(numPreview);
    };
    $('btnNumMake').onclick = function () {
      run(numMake);
    };
    $('btnHkSetup').onclick = function () {
      run(hkSetup);
    };
    $('btnHkTest').onclick = function () {
      run(quickRun);
    };
    if (host.onEvent) {
      host.onEvent(QUICK_EVENT, function () {
        run(quickRun);
      });
    }
    host.call('np_panelReady', {}).catch(function () {});
    syncFields();
    $('btnDcRead').onclick = function () {
      run(dcRead);
    };
    $('btnDcMake').onclick = function () {
      run(dcMake);
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
    var startTool = S.settings.tool;
    S.settings.tool = 'nest';
    setTool(startTool);
    $('btnLayout').onclick = function () {
      var order = ['auto', 'side', 'stack'];
      S.settings.layoutMode = order[(order.indexOf(S.settings.layoutMode) + 1) % order.length];
      saveSettings();
      placePreview();
    };
    placePreview();
    updateFlow();
    bindGuide();
    window.addEventListener('resize', placePreview);

    if (host.demo) {
      run(scan).then(function () {
        if (S.settings.tool === 'nest') status('โหมดทดลอง: มีชิ้นงานตัวอย่างให้แล้ว กด “เจ๊หญิงสั่งลุย!” ได้เลย');
      });
    } else {
      host
        .call('np_ping', {})
        .then(function (p) {
          status(TOOL_STATUS[S.settings.tool] + ' (Illustrator ' + p.app + ')');
        })
        .catch(function (e) {
          status(errText(e), 'err');
        });
    }
  }

  // เปิดให้เทสต์เรียกได้
  window.NPPanel = {
    state: S,
    go: go,
    nestNow: nestNow,
    exportAll: exportAll,
    cutPaths: cutPaths,
    setTool: setTool,
    dcRead: dcRead,
    quickScript: quickScript,
    setPage: setPage,
    guide: { open: guideOpenStart, start: guideStart, close: guideClose },
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
