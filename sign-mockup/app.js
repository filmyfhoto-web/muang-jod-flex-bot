/* นัดพอน Sign Mockup — หน้าจอ: 4 ขั้น (งาน → ชนิด/ขนาด → ฉาก → ราคา/ส่งออก) + ติดตั้งเป็นแอป */
(function () {
  'use strict';
  var NS = window.SignMockup;
  var C = NS.core;
  var R = NS.render;
  var KEY = 'np-sign-mockup-v1';
  // รุ่นของโปรแกรม — ต้องตรงกับ VERSION ใน sw.js (เลื่อนทั้งคู่ทุกครั้งที่ปล่อยรุ่นใหม่ แอปที่ติดตั้งไว้จะอัปเดตเอง)
  var APP_VERSION = '4.4.0';
  // โลโก้ร้าน NATTAPRON: แบบเต็ม (ใบเสนอราคา/แถบบน) · ตรา NTP (แถบใต้ภาพ) · รูปการ์ตูนเจ้าของร้าน (คนเทียบขนาด)
  var BRAND = (NS.BRAND = { full: 'brand/ntp-logo.png', mark: 'brand/ntp-mark.png', mascot: 'brand/mascot.webp', hands: C.HAND_BUILTIN.src });

  var UNIT_WORD = { vinyl: 'ผืน', frame: 'ผืน', foam: 'แผ่น', sticker: 'แผ่น', acrylic: 'แผ่น', lightbox: 'ป้าย', stand: 'ชุด', cnc: 'ป้าย', rollup: 'ชุด', xstand: 'ชุด', card: 'ใบ', letters: 'ชุด', neon: 'ป้าย', blade: 'ป้าย', flag: 'ผืน', backdrop: 'ชุด', billboard: 'ป้าย', poster: 'แผ่น', tablestand: 'อัน', standee: 'ชิ้น', window: 'ชิ้น' };
  // ชนิดงานของร้าน (ตัวเลือกของร้าน) ต้องลงทะเบียนก่อนโหลดงานที่บันทึกไว้ ไม่งั้นงานชนิดนั้นจะกลายเป็นไวนิล
  var OPT_KEY = 'np-sign-options-v1';
  try {
    C.applyTypes(C.normalizeOptions(JSON.parse(localStorage.getItem(OPT_KEY) || 'null')).types);
  } catch (e) {}

  var DEF = {
    mode: 'text',
    type: 'vinyl',
    w: 300,
    h: 100,
    fit: 'cover',
    scene: 'shop',
    person: true,
    dims: true,
    zoom: 1,
    aspect: 'auto',
    brightness: 1,
    info: true,
    night: false,
    view: 'angle',
    spot: 'auto',
    doorOpen: true, // ประตูห้องเรียนเปิดพับชิดผนัง (แบบที่ร้านส่งรูปมา)
    tone: 'pink',
    steel: { total: 0, depth: 0, tube: 25, wall: 1.2, nh: -1, nv: -1, cut: 'miter', base: 'rect', price: 0, frameOnly: false, color: '#1f2125' }, // โครงเหล็ก (0 / -1 = อัตโนมัติ)
    run: { on: true, prefix: 'No.', start: 1, digits: 4, pos: 'tr', size: 'm', color: '#c8102e', stub: 0 }, // บัตร: เลขรัน
    sheet: 'a4', // บัตร: กระดาษที่จัดหน้าพิมพ์
    paper: 'white', // บัตร: สีกระดาษรองในฉาก "บนกระดาษ"
    cmpOut: 'jpg', // หน้าเทียบ 2 แบบ: รูป JPG / PDF
    look: { mat: 'color', light: 'none', neon: 'design', lit: true, film: 'print' }, // ตัวอักษร: วัสดุ/ไฟ · นีออน: สี · ป้ายยื่น/บิลบอร์ด: เปิดไฟ · ติดกระจก: ชนิดฟิล์ม
    handView: 'both', // ฉากมือจับ (รูปของร้าน): สองมือ / มือซ้าย / มือขวา
    shape: { kind: 'rect', border: 0.3, radius: 10 }, // รูปทรงชิ้นงาน (สติ๊กเกอร์/โฟม/อะคริลิค/บัตร/สแตนดี้/ติดกระจก)
    bill: { extras: [], discount: 0, vat: false, deposit: 0, due: '', note: '', work: '' }, // ค่าใช้จ่ายเพิ่ม ส่วนลด VAT มัดจำ นัดรับ หมายเหตุ
    panel: 'right', // แผงตั้งค่าอยู่ขวา/ซ้าย
    fmt: 'jpg', // ชนิดรูปที่ส่งออกล่าสุด (jpg / png)
    qty: 1,
    rates: {},
    shopName: 'นัดพอน',
    shopPhone: '',
    logo: '', // โลโก้ที่อัปโหลดเอง (แทนโลโก้ร้าน)
    brandLogo: true, // ไม่ได้อัปโหลด = ใช้โลโก้ NATTAPRON
    text: { title: 'ก๋วยเตี๋ยวเรือ\nสูตรเจ้าเก่า', sub: 'เปิดทุกวัน 07:00 – 15:00', phone: '08X-XXX-XXXX', theme: 'brand', font: '', font2: '' },
  };

  /* ---------- สถานะ ---------- */
  var st = load();
  var step = 1;
  var imgDesign = null; // งานจากไฟล์ { src, w, h, bg, id, blob, name, thumb, px } (ไฟล์เก็บใน IndexedDB)
  var textCache = { key: '', design: null };
  var photo = null; // { id, img, w, h, quad, touched, blob }
  var logoImg = null; // โลโก้ที่อัปโหลดเอง
  var brandImg = { full: null, mark: null, mascot: null };
  var customer = '';
  var curJob = null; // งานที่เปิด/บันทึกล่าสุด { id, name }
  var lastOut = null;
  var stage = null; // เวที 3 มิติ (โหลดตามมาทีหลัง ถ้าเครื่องไม่รองรับใช้ภาพ 2 มิติแทน)
  var L3 = null; // ขนาดภาพตอนเป็น 3 มิติ { W, H, F, U, f }
  var faceCache = { key: '', canvas: null };
  var footCache = null;
  var inFrame = false; // เปิดในกรอบของหน้าอื่น เช่น พรีวิว
  try {
    inFrame = window.top !== window.self;
  } catch (e) {
    inFrame = true;
  }

  // ค่าที่บันทึกไว้ → สถานะที่ใช้ได้แน่นอน (ชนิดข้อมูลผิด/ชนิดป้ายหาย ใช้ค่าเริ่มต้น)
  function normalize(saved) {
    var s = JSON.parse(JSON.stringify(DEF));
    if (saved && typeof saved === 'object') {
      Object.keys(DEF).forEach(function (k) {
        if (saved[k] !== undefined && saved[k] !== null && typeof saved[k] === typeof DEF[k]) s[k] = JSON.parse(JSON.stringify(saved[k]));
      });
      s.text = Object.assign({}, DEF.text, saved.text || {});
      s.steel = Object.assign({}, DEF.steel, saved.steel && typeof saved.steel === 'object' ? saved.steel : {});
    }
    s.run = C.normalizeRun(Object.assign({}, DEF.run, s.run));
    if (!C.SHEETS[s.sheet]) s.sheet = DEF.sheet;
    if (!C.PAPERS[s.paper]) s.paper = DEF.paper;
    if (s.cmpOut !== 'pdf') s.cmpOut = 'jpg';
    s.look = C.normalizeLook(Object.assign({}, DEF.look, s.look));
    s.shape = C.normalizeShape(s.shape);
    if (!C.HAND_VIEWS[s.handView]) s.handView = 'both';
    s.bill = C.normalizeBill(s.bill);
    if (!C.TYPES[s.type]) s.type = DEF.type;
    if (!C.SCENES[s.scene]) s.scene = DEF.scene;
    if (s.scene !== 'photo' && !C.sceneFits(s.scene, s.type)) s.scene = C.defaultScene(s.type);
    if (s.mode !== 'image') s.mode = 'text';
    s.w = C.clampCm(s.w, DEF.w);
    s.h = C.clampCm(s.h, DEF.h);
    return s;
  }
  // ตอนเปิดแอป: ไฟล์งาน/รูปหน้าร้านโหลดตามมาจาก IndexedDB — ระหว่างนั้นโชว์ข้อความ/ฉากปกติไปก่อน
  var want; // { mode, scene } ที่บันทึกไว้ (ตั้งค่าใน load() ซึ่งรันก่อนบรรทัดนี้)
  function load() {
    var saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    } catch (e) {}
    var s = normalize(saved);
    want = { mode: s.mode, scene: s.scene };
    s.mode = 'text';
    if (s.scene === 'photo') s.scene = DEF.scene;
    return s;
  }
  var saveTimer = 0;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flushSave, 300);
  }
  // เก็บลงเครื่อง + จดประวัติย้อนกลับ + บันทึกงานปัจจุบันอัตโนมัติ
  function flushSave() {
    clearTimeout(saveTimer);
    try {
      localStorage.setItem(KEY, JSON.stringify(st));
    } catch (e) {}
    record();
    autosaveSoon();
  }

  /* ---------- ย้อนกลับ / ทำซ้ำ (Ctrl+Z / Ctrl+Y) ---------- */
  var NOHIST = { panel: 1, view: 1, fmt: 1, logo: 1, brandLogo: 1 };
  var hist = { list: [], i: -1, lock: false };
  function copyQuad(q) {
    return q
      ? q.map(function (c) {
          return { x: c.x, y: c.y };
        })
      : null;
  }
  function snapshot() {
    var o = {};
    Object.keys(st).forEach(function (k) {
      if (!NOHIST[k]) o[k] = st[k];
    });
    var json = JSON.stringify(o);
    var q = photo ? copyQuad(photo.quad) : null;
    return {
      key: json + '|' + (imgDesign ? imgDesign.id : '') + '|' + (photo ? photo.id + JSON.stringify(q) : ''),
      json: json,
      img: imgDesign,
      photo: photo,
      quad: q,
      touched: photo ? photo.touched : false,
    };
  }
  function record() {
    if (hist.lock) return;
    var s = snapshot();
    var top = hist.list[hist.i];
    if (top && top.key === s.key) return;
    hist.list = hist.list.slice(0, hist.i + 1);
    hist.list.push(s);
    if (hist.list.length > 80) hist.list.shift();
    hist.i = hist.list.length - 1;
    syncHist();
  }
  function syncHist() {
    var u = document.getElementById('undoBtn');
    if (!u) return;
    u.disabled = hist.i <= 0;
    document.getElementById('redoBtn').disabled = hist.i >= hist.list.length - 1;
  }
  function applySnap(s) {
    hist.lock = true;
    var o = JSON.parse(s.json);
    Object.keys(o).forEach(function (k) {
      st[k] = o[k];
    });
    imgDesign = s.img;
    photo = s.photo;
    if (photo && s.quad) {
      photo.quad = copyQuad(s.quad);
      photo.touched = s.touched;
    }
    if (st.mode === 'image' && !imgDesign) st.mode = 'text';
    if (st.scene === 'photo' && !photo) st.scene = DEF.scene;
    if (!C.TYPES[st.type]) st.type = DEF.type;
    showFileCard();
    sync();
    hist.lock = false;
  }
  function undo() {
    flushSave();
    if (hist.i <= 0) return;
    hist.i--;
    applySnap(hist.list[hist.i]);
    syncHist();
  }
  function redo() {
    flushSave();
    if (hist.i >= hist.list.length - 1) return;
    hist.i++;
    applySnap(hist.list[hist.i]);
    syncHist();
  }

  /* ---------- อ้างอิงหน้าจอ ---------- */
  var $ = function (id) {
    return document.getElementById(id);
  };
  var view = $('view');

  /* ---------- งานออกแบบปัจจุบัน ---------- */
  function currentDesign() {
    if (st.mode === 'image' && imgDesign) return imgDesign;
    var t = st.text;
    var th = R.themes()[t.theme];
    // บัตรมีต้นขั้ว: จัดข้อความเฉพาะฝั่งขวาของเส้นปรุ
    var sw = stubNow();
    var key = [t.title, t.sub, t.phone, t.theme, th ? [th.bg, th.bg2, th.title, th.sub, th.pillBg, th.pillFg].join(',') : '', t.font || '', t.font2 || '', st.w, st.h, sw].join('|');
    if (textCache.key !== key) textCache = { key: key, design: R.textDesign(t, st.w - sw, st.h) };
    return textCache.design;
  }

  // ชนิดหน้าตา (ชนิดของร้าน → ชนิดมาตรฐานที่ยืมมา) · หน่วยเรียก
  function bt() {
    return C.baseType(st.type);
  }
  function unitWord() {
    var t = C.TYPES[st.type];
    return (t && t.word) || UNIT_WORD[bt()] || 'ชิ้น';
  }
  function isCard() {
    return bt() === 'card' && C.TYPES[st.type].run !== false;
  }
  function runNow() {
    return isCard() && st.run.on && C.TYPES[st.type].run !== false ? st.run : null;
  }
  function stubNow() {
    var r = runNow();
    return r ? C.runSlots(r, st.w, st.h).stub : 0;
  }
  // งานที่โชว์: บัตรที่เปิดเลขรัน = งาน + เลขใบแรก (+ เส้นปรุต้นขั้ว) รวมเป็นรูปเดียว ใช้ทั้ง 2 มิติ/3 มิติ
  var runCache = { key: '', design: null };
  function runDesign() {
    var d = currentDesign();
    var r = runNow();
    if (!r) return d;
    var key = [d.id || textCache.key, st.fit, st.w, st.h, JSON.stringify(r)].join('|');
    if (runCache.key !== key) {
      var art = R.cardArt(d, st.w, st.h, st.fit, r, { k: 1600 / Math.max(st.w, st.h), split: st.mode !== 'image' });
      runCache = { key: key, design: { src: art.canvas, w: art.canvas.width, h: art.canvas.height, bg: d.bg, id: 'run|' + key } };
    }
    return runCache.design;
  }
  // รูปทรงที่ใช้ตอนนี้ (rect = สี่เหลี่ยมธรรมดา)
  function shapeNow() {
    return C.shapeKind(st.type, st.shape);
  }
  // งานที่โชว์ + รูปทรง (มุมมน/วงกลม/ไดคัท): ตัดรูปทรงเป็นภาพพื้นใสครั้งเดียว ใช้ทั้ง 2 มิติ/3 มิติ
  var shapeCache = { key: '', design: null };
  function shownDesign() {
    var d = runDesign();
    var kind = shapeNow();
    if (kind === 'rect') return d;
    var sh = st.shape;
    var fit = runNow() ? 'cover' : st.fit;
    var key = [d.id || textCache.key, fit, st.w, st.h, kind, sh.border, sh.radius, bt() === 'standee'].join('|');
    if (shapeCache.key !== key) {
      var sd = R.shapedDesign(d, st.w, st.h, fit, kind, Object.assign({ base: bt() === 'standee' }, sh), 1600);
      sd.id = 'shape|' + key;
      shapeCache = { key: key, design: sd };
    }
    return shapeCache.design;
  }
  function fitNow() {
    return runNow() || shapeNow() !== 'rect' ? 'cover' : st.fit;
  }
  // งานชิ้นเล็ก (บัตร) ไม่เอาคนยืนเทียบ ไม่งั้นบัตรเหลือนิดเดียวในภาพ
  function personNow() {
    return !!st.person && !C.TYPES[st.type].small;
  }

  function quoteNow() {
    return C.quote({ type: st.type, w: st.w, h: st.h, qty: st.qty, rate: st.rates[st.type] });
  }

  function footerInfo() {
    var t = C.TYPES[st.type];
    var q = quoteNow();
    var bt0 = C.billTotals(q, st.bill);
    var unit = unitWord();
    var line2 = [];
    if (t.unit === 'sqm') line2.push('พื้นที่ ' + C.fmtArea(st.w, st.h));
    line2.push('จำนวน ' + q.qty + ' ' + unit);
    var shn = C.shapeNote(st.type, st.shape);
    if (shn) line2.push(shn);
    if (bt() === 'window') line2.push(C.FILMS[st.look.film]);
    if (runNow()) line2.push('เลข ' + C.runText(st.run, 0) + (q.qty > 1 ? '–' + C.runText(st.run, q.qty - 1) : ''));
    if (customer.trim()) line2.push('ลูกค้า: ' + customer.trim());
    var line3 = [];
    if (st.shopName.trim()) line3.push(st.shopName.trim());
    if (st.shopPhone.trim()) line3.push(C.phoneText(st.shopPhone));
    line3.push(C.thaiDate(new Date()));
    line3.push('ภาพจำลอง สีจริงอาจต่างจากหน้าจอเล็กน้อย');
    return {
      title: t.name + '  ' + C.sizeText(st.w, st.h),
      line2: line2.join(' · '),
      line3: line3.join(' · '),
      price: bt0.plain ? (q.has ? C.baht(q.total) + ' บาท' : '') : bt0.has ? C.money(bt0.grand) + ' บาท' : '',
      priceNote: bt0.plain ? (q.has ? (q.qty > 1 ? 'ราคารวม (' + unit + 'ละ ' + C.baht(q.per) + ' บาท)' : 'ราคา') : '') : bt0.has ? 'ราคารวมทั้งหมด' + (bt0.vatOn ? ' (รวม VAT 7%)' : '') : '',
      logo: logoImg || (st.brandLogo ? brandImg.mark : null),
    };
  }

  function renderState(over) {
    var s = {
      design: shownDesign(),
      fit: fitNow(),
      type: st.type,
      w: st.w,
      h: st.h,
      scene: sceneNow(),
      spot: st.spot,
      tone: st.tone,
      paper: st.paper,
      steel: st.steel,
      look: st.look,
      photo: photo,
      handPhoto: handReady() ? handPhoto : null,
      handView: st.handView,
      handEdit: handEdit,
      person: personNow(),
      dims: st.dims,
      zoom: st.zoom,
      aspect: st.aspect,
      brightness: st.brightness,
      info: st.info,
      footer: footerInfo(),
    };
    if (over) Object.keys(over).forEach(function (k) {
      s[k] = over[k];
    });
    return s;
  }

  /* ---------- วาด ---------- */
  function is3d() {
    return !!stage && !(st.scene === 'photo' && photo) && !(st.scene === 'handPhoto' && handReady());
  }
  // ฉากที่วาดจริง: ฉากมือจับ (รูปของร้าน) ที่ยังไม่มีรูป ใช้ฉากมือจับแบบวาดไปก่อน
  function sceneNow() {
    return st.scene === 'handPhoto' && !handReady() ? 'hand' : st.scene;
  }
  var queued = false;
  function draw() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () {
      queued = false;
      if (is3d()) draw3d();
      else {
        if (stage) stage.setEnabled(false);
        L3 = null;
        lastOut = R.render(view, renderState(), { preview: true });
        fitView();
      }
      view.classList.toggle('editable', (st.scene === 'photo' && !!photo) || (st.scene === 'handPhoto' && handReady() && handEdit));
      syncViewbar();
      summary();
      thumbsSoon();
    });
  }

  // หน้าป้าย (เท็กซ์เจอร์) ตามสัดส่วนจริง — กล่องไฟเว้นขอบอะลูมิเนียม 4 ซม.
  function face3d() {
    var d = shownDesign();
    var lb = bt() === 'lightbox';
    var fw = lb ? Math.max(1, st.w - 8) : st.w;
    var fh = lb ? Math.max(1, st.h - 8) : st.h;
    var key = [d.id || textCache.key, fitNow(), fw, fh].join('|');
    if (faceCache.key !== key) faceCache = { key: key, canvas: R.faceCanvas(d, fw, fh, fitNow(), 2048), bg: d.bg };
    return faceCache;
  }

  var lastStage = null; // สถานะล่าสุดที่ส่งให้เวที 3 มิติ (วิดีโอสลับกลางวัน/กลางคืนจากค่านี้)
  function draw3d() {
    var g = C.geometry(st.type, st.w, st.h, st.steel);
    var size = C.canvasSize(st.aspect, g, null);
    var U = C.unitScale(size.W, size.H);
    var F = st.info ? Math.round(132 * U) : 0;
    // ความละเอียดตามขนาดที่เห็นบนจอจริง (จอมือถือไม่ต้องวาดเต็ม 1600 จุด)
    var css = fitSize(size.W / (size.H + F));
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var f = Math.max(0.35, Math.min(1, (css.w * dpr) / size.W));
    L3 = { W: size.W, H: size.H, F: F, U: U, f: f, g: g };
    var cw = Math.round(size.W * f);
    var ch = Math.round((size.H + F) * f);
    if (view.width !== cw) view.width = cw;
    if (view.height !== ch) view.height = ch;
    fitView();
    stage.setEnabled(true);
    stage.setSize(cw, Math.round(size.H * f));
    var fc = face3d();
    stage.update((lastStage = {
      type: st.type,
      w: st.w,
      h: st.h,
      scene: st.scene === 'photo' ? 'studio' : sceneNow(),
      spot: st.spot,
      doorOpen: st.doorOpen,
      tone: st.tone,
      paper: st.paper,
      steel: st.steel,
      look: st.look,
      shaped: shapeNow() === 'rect' ? '' : shapeNow(),
      person: personNow(),
      night: st.night,
      face: fc.canvas,
      faceKey: fc.key,
      edge: fc.bg,
    }));
    footCache = null;
    stage.requestRender();
  }

  function footerCanvas() {
    if (!L3 || !L3.F) return null;
    if (footCache) return footCache;
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(L3.W * L3.f));
    c.height = Math.max(1, Math.round(L3.F * L3.f));
    var x = c.getContext('2d');
    x.setTransform(L3.f, 0, 0, L3.f, 0, 0);
    R.footer(x, L3.W, 0, L3.F, L3.U, footerInfo());
    footCache = c;
    return c;
  }

  // ทุกเฟรมที่กล้องขยับ: ภาพ 3 มิติ + เส้นบอกขนาด + แถบรายละเอียด
  function composite3d() {
    if (!L3 || !is3d()) return;
    var x = view.getContext('2d');
    x.setTransform(L3.f, 0, 0, L3.f, 0, 0);
    x.drawImage(stage.canvas, 0, 0, L3.W, L3.H);
    R.overlay3d(x, stage.projected(), L3.g, L3.W, L3.H, L3.U, { dims: st.dims, person: st.person });
    var fc = footerCanvas();
    if (fc) {
      x.setTransform(1, 0, 0, 1, 0, 0);
      x.drawImage(fc, 0, Math.round(L3.H * L3.f));
    }
  }

  // ย่อภาพให้พอดีกรอบเสมอ (ภาพแนวตั้งไม่ล้นจอ) — มือถือสูงไม่เกิน 36% ของจอ
  var phone = window.matchMedia ? window.matchMedia('(max-width: 900px)') : { matches: false };
  function fitSize(a) {
    var box = $('canvasBox');
    var bw = box.clientWidth;
    var bh = phone.matches && !isFull() ? window.innerHeight * 0.36 : box.clientHeight;
    if (!(bw > 0 && bh > 0)) return { w: 800, h: 800 / a };
    var w = bw;
    var h = w / a;
    if (h > bh) {
      h = bh;
      w = h * a;
    }
    return { w: Math.floor(w), h: Math.floor(h) };
  }
  function fitView() {
    var sz = fitSize(view.width / view.height);
    view.style.width = sz.w + 'px';
    view.style.height = sz.h + 'px';
    // กล่องขนาดอยู่มุมซ้ายล่าง เหนือแถบรายละเอียด (ไม่บังป้าย/เส้นบอกขนาดที่มักอยู่ด้านบน)
    var o = L3 || lastOut;
    var fr = o && o.F ? o.F / (o.H + o.F) : 0;
    $('infoBox').style.bottom = Math.round(sz.h * fr + 10) + 'px';
  }
  var resizeTimer = 0;
  window.addEventListener('resize', function () {
    fitView();
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(draw, 150);
  });

  function summary() {
    var t = C.TYPES[st.type];
    var q = quoteNow();
    var html = '<b>' + esc(t.name) + '</b><span>' + esc(C.sizeText(st.w, st.h)) + '</span>';
    if (t.unit === 'sqm') html += '<span class="area">' + esc(C.fmtArea(st.w, st.h)) + '</span>';
    var shn = C.shapeNote(st.type, st.shape);
    if (shn) html += '<span>' + esc(shn) + '</span>';
    if (q.has) html += '<span class="price">' + esc(C.baht(q.total)) + ' บาท</span>';
    $('summary').innerHTML = html;
    // กล่องขนาดป้ายมุมภาพ: กว้าง (X) / สูง (Y) / หนา (Z)
    $('ibW').textContent = C.fmtCm(st.w) + ' ซม.';
    $('ibH').textContent = C.fmtCm(st.h) + ' ซม.';
    $('ibD').textContent = C.depthText(st.type);
    if (st.type === 'stand') {
      var so = C.steelOpts(st.w, st.h, st.steel);
      $('ibH').textContent = C.fmtCm(st.h) + ' ซม. (รวมขา ' + C.fmtCm(so.total) + ')';
      $('ibD').textContent = 'ฐานลึก ' + C.fmtCm(so.depth) + ' ซม. · เหล็ก ' + so.tube + ' มม.';
    }
    $('ibAreaRow').hidden = t.unit !== 'sqm';
    $('ibA').textContent = C.fmtArea(st.w, st.h);
    $('infoBox').hidden = false;
    $('sizeReadout').textContent = C.sizeText(st.w, st.h) + (t.unit === 'sqm' ? ' · พื้นที่ ' + C.fmtArea(st.w, st.h) : '');
    var unit = unitWord();
    $('qtyUnit').textContent = unit;
    billSync();
    $('rateLabel').textContent = t.unit === 'sqm' ? 'ราคาต่อ ตร.ม.' : st.type === 'cnc' ? (C.cncPosts(st.steel) ? 'ราคาต่อป้าย (รวมเสา)' : 'ราคาต่อป้าย (ติดผนัง)') : st.type === 'stand' ? 'ราคาต่อชุด (รวมโครงเหล็ก)' : 'ราคาต่อ' + unit;
    runSync();
    var pr = $('priceReadout');
    if (q.has) {
      var how =
        t.unit === 'sqm'
          ? C.fmtAreaExact(st.w, st.h) + ' × ' + C.baht(q.rate) + ' บาท = ' + unit + 'ละ ' + C.baht(q.per) + ' บาท' + (Math.abs(q.area * q.rate - q.per) > 1e-6 ? ' (ปัดเศษขึ้น)' : '')
          : unit + 'ละ ' + C.baht(q.per) + ' บาท';
      pr.innerHTML = '<b>' + esc(C.baht(q.total)) + ' บาท</b><small>' + esc(how + (q.qty > 1 ? ' × ' + q.qty + ' ' + unit : '')) + '</small>';
    } else {
      pr.innerHTML = '<small>ใส่ราคาแล้วจะคิดยอดให้ และพิมพ์ราคาไว้ใต้ภาพ (ไม่ใส่ = ไม่โชว์ราคา)</small>';
    }
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var toastTimer = 0;
  function toast(msg) {
    var el = $('toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.hidden = true;
    }, 3200);
  }

  /* ---------- ขั้นตอน ---------- */
  function go(n) {
    step = Math.max(1, Math.min(4, n));
    document.querySelectorAll('.step').forEach(function (b) {
      var on = +b.dataset.step === step;
      b.classList.toggle('on', on);
      if (on) b.setAttribute('aria-current', 'step');
      else b.removeAttribute('aria-current');
    });
    document.querySelectorAll('.page').forEach(function (p) {
      p.hidden = +p.dataset.page !== step;
    });
    $('prev').disabled = step === 1;
    $('prev').style.visibility = step === 1 ? 'hidden' : 'visible';
    var names = { 1: 'ชนิดและขนาด', 2: 'ฉาก', 3: 'ราคาและส่งออก' };
    $('next').textContent = step < 4 ? 'ถัดไป: ' + names[step] : 'บันทึกรูปส่งลูกค้า';
    $('pages').scrollTop = 0;
  }
  document.querySelectorAll('.step').forEach(function (b) {
    b.addEventListener('click', function () {
      go(+b.dataset.step);
    });
  });
  $('prev').addEventListener('click', function () {
    go(step - 1);
  });
  $('next').addEventListener('click', function () {
    if (step < 4) go(step + 1);
    else openExport(imageFmt());
  });

  /* ---------- ไอคอนชนิดป้าย ---------- */
  var TYPE_ICON = {
    vinyl:
      '<svg viewBox="0 0 44 34"><rect x="4" y="6" width="36" height="22" rx="1"/><circle cx="7" cy="9" r="1.3"/><circle cx="22" cy="9" r="1.3"/><circle cx="37" cy="9" r="1.3"/><circle cx="7" cy="25" r="1.3"/><circle cx="22" cy="25" r="1.3"/><circle cx="37" cy="25" r="1.3"/></svg>',
    frame: '<svg viewBox="0 0 44 34"><rect x="4" y="5" width="34" height="22" rx="1"/><path d="M38 5l3 3v22H7l-3-3"/></svg>',
    sticker: '<svg viewBox="0 0 44 34"><path d="M5 5h34v24H12l-7-7z"/><path d="M5 22h7v7"/><path d="M12 12h18M12 17h22"/></svg>',
    foam: '<svg viewBox="0 0 44 34"><rect x="5" y="5" width="34" height="24" rx="1"/><path d="M39 6.5h1.5V30.5H6.5V29"/><path d="M11 12h16M11 17h22M11 22h12"/></svg>',
    acrylic:
      '<svg viewBox="0 0 44 34"><rect x="5" y="5" width="34" height="24" rx="2"/><circle cx="9" cy="9" r="1.6"/><circle cx="35" cy="9" r="1.6"/><circle cx="9" cy="25" r="1.6"/><circle cx="35" cy="25" r="1.6"/><path d="M16 26l9-18M21 26l6-12"/></svg>',
    lightbox: '<svg viewBox="0 0 44 34"><rect x="4" y="8" width="36" height="20" rx="2"/><rect x="8" y="12" width="28" height="12" rx="1"/><path d="M13 2.5l1.6 2.8M22 1.5v3.4M31 2.5l-1.6 2.8"/></svg>',
    stand: '<svg viewBox="0 0 44 34"><path d="M12 3v28M32 3v28M12 3h20M12 21h20M12 12h20"/><path d="M7 31h30"/></svg>',
    cnc: '<svg viewBox="0 0 44 34"><path d="M6 3v29M38 3v29"/><rect x="8" y="6" width="28" height="16" rx="1"/><path d="M12 11h7M12 16h12M23 11h9"/><path d="M3.5 32h5M35.5 32h5"/></svg>',
    rollup: '<svg viewBox="0 0 44 34"><path d="M15 2h14"/><rect x="15.5" y="3" width="13" height="25"/><rect x="12" y="27" width="20" height="4" rx="1.5"/></svg>',
    xstand: '<svg viewBox="0 0 44 34"><rect x="15" y="2" width="14" height="24"/><path d="M15 26l-4 6M29 26l4 6"/></svg>',
    card: '<svg viewBox="0 0 44 34"><rect x="3" y="7" width="38" height="20" rx="2"/><path d="M13 7v20" stroke-dasharray="2 2"/><path d="M18 13h12M18 18h16"/><path d="M31 23.5h7"/></svg>',
    letters: '<svg viewBox="0 0 44 34"><path d="M3 4h38" opacity=".35"/><path d="M6 26l5-15 5 15M8 21h6"/><path d="M20 11v15h6"/><path d="M30 11h8M34 11v15"/><path d="M6 29h5M30 29h8" opacity=".5"/></svg>',
    neon: '<svg viewBox="0 0 44 34"><rect x="3" y="4" width="38" height="26" rx="3"/><path d="M10 22c0-7 4-11 7-11s4 4 2 7-6 5-2 6 7-3 8-8M29 11v11c0 2 1 3 3 3s3-1 3-3"/></svg>',
    blade: '<svg viewBox="0 0 44 34"><path d="M5 3v28"/><path d="M5 7h26"/><path d="M14 7v4M28 7v4"/><rect x="11" y="11" width="21" height="17" rx="1.5"/><path d="M15 17h13M15 22h9"/></svg>',
    flag: '<svg viewBox="0 0 44 34"><path d="M12 2v29"/><path d="M12 4h20"/><path d="M14 4h18v22c-6-2-12 2-18 0z"/><path d="M6 31h12"/></svg>',
    backdrop: '<svg viewBox="0 0 44 34"><rect x="3" y="3" width="38" height="5"/><rect x="3" y="3" width="5" height="28"/><rect x="36" y="3" width="5" height="28"/><path d="M3 3l5 5M8 3l-5 5M36 3l5 5M41 3l-5 5"/><rect x="10" y="10" width="24" height="17"/></svg>',
    billboard: '<svg viewBox="0 0 44 34"><rect x="4" y="4" width="36" height="16" rx="1"/><path d="M22 20v12M17 32h10"/><path d="M5 22h34"/><path d="M10 2l2 2M22 1v3M34 2l-2 2"/></svg>',
    poster: '<svg viewBox="0 0 44 34"><path d="M13 3h14l5 5v23H13z"/><path d="M27 3v5h5"/><rect x="16" y="11" width="12" height="9" rx="1"/><path d="M16 24h12M16 27h8"/></svg>',
    standee: '<svg viewBox="0 0 44 34"><path d="M22 3c3 0 5 2.2 5 5s-1.6 4.2-2.6 4.8c4 .9 6.6 3.6 6.6 8.2V30H13V21c0-4.6 2.6-7.3 6.6-8.2C18.6 12.2 17 10.8 17 8c0-2.8 2-5 5-5z"/><path d="M8 31h28"/></svg>',
    window: '<svg viewBox="0 0 44 34"><rect x="4" y="3" width="36" height="28" rx="1"/><path d="M22 3v28"/><rect x="8" y="10" width="11" height="12" rx="1"/><path d="M27 8l-3 5M33 8l-7 12"/></svg>',
    tablestand: '<svg viewBox="0 0 44 34"><path d="M14 4l4 25M30 4l-4 25"/><rect x="15" y="5" width="14" height="19" rx="1"/><path d="M9 30h26"/><path d="M18 10h8M18 14h6"/></svg>',
  };

  function buildTypes() {
    var box = $('types');
    box.innerHTML = '';
    C.TYPE_ORDER.forEach(function (k) {
      if (opts.hideTypes.indexOf(k) >= 0 && k !== st.type) return; // ร้านซ่อนไว้
      var t = C.TYPES[k];
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'card';
      b.dataset.type = k;
      b.innerHTML = (TYPE_ICON[k] || TYPE_ICON[C.baseType(k)]) + '<b>' + esc(t.name) + '</b><small>' + esc(t.desc) + '</small>';
      if (t.mine) b.classList.add('mine');
      b.addEventListener('click', function () {
        setType(k);
      });
      box.appendChild(b);
    });
  }

  function setType(k) {
    var was = st.type;
    st.type = k;
    var t = C.TYPES[k];
    // เปลี่ยนไปขาตั้ง (โรลอัพ / X-Stand) ใช้ขนาดมาตรฐานของขาตั้งนั้น
    var old = C.TYPES[was] || C.TYPES.vinyl;
    // ขนาดเดิมห่างจากขนาดปกติของชนิดใหม่มาก (เช่น ไวนิล 3 ม. → ป้ายยื่น) ใช้ขนาดมาตรฐานของชนิดนั้น
    var areas = t.presets.map(function (p) {
      return p[0] * p[1];
    });
    var cur = st.w * st.h;
    var outOfRange = cur > Math.max.apply(null, areas) * 2 || cur < Math.min.apply(null, areas) / 2;
    if (!!t.small !== !!old.small || (outOfRange && C.baseType(k) !== C.baseType(was) && t.mount === old.mount)) {
      // บัตร ↔ ป้าย ขนาดต่างกันมาก ใช้ขนาดมาตรฐานของชนิดใหม่
      var z = t.small || t.mine ? t.presets[0] : t.presets[2] || t.presets[0];
      if (z) {
        st.w = z[0];
        st.h = z[1];
      }
    } else if (t.mount === 'floor' && (old.mount !== 'floor' || was !== k)) {
      var p = t.presets[t.presets.length > 1 ? 1 : 0];
      st.w = p[0];
      st.h = p[1];
    } else if (t.mount === 'wall' && old.mount === 'floor') {
      var q = t.presets[2] || t.presets[0];
      st.w = q[0];
      st.h = q[1];
      if (st.mode === 'image' && imgDesign) st.h = C.heightForImage(st.w, imgDesign.w, imgDesign.h);
    }
    // สแตนดี้จากไฟล์รูป: คงความสูง ปรับความกว้างตามสัดส่วนรูป (ไดคัทพอดีตัว)
    if (C.baseType(k) === 'standee' && C.baseType(was) !== 'standee' && st.mode === 'image' && imgDesign) {
      st.w = C.clampCm(Math.round(((st.h * imgDesign.w) / imgDesign.h) * 10) / 10, st.w);
    }
    // ป้ายยื่นตั้งฉากกับผนัง: มุมด้านข้างเห็นหน้าป้ายชัดสุด
    if (C.baseType(k) === 'blade' && C.baseType(was) !== 'blade') {
      st.view = 'side';
      if (stage) stage.setView('side');
    }
    // บัตร ↔ ป้าย: ฉากที่เหมาะต่างกัน (บัตรเริ่มที่ "บนกระดาษ")
    if (!!t.small !== !!old.small) {
      if (st.scene !== 'photo') st.scene = C.defaultScene(k);
      buildScenes();
    } else if (st.scene !== 'photo' && !C.sceneFits(st.scene, k)) st.scene = C.defaultScene(k);
    else if (st.scene === C.defaultScene(was) && C.defaultScene(k) !== st.scene) st.scene = C.defaultScene(k); // เช่น แบ็คดรอป → ห้องจัดงาน · บิลบอร์ด/ธง → กลางแจ้ง
    refreshPhotoQuad();
    sync();
  }

  function buildPresets() {
    var box = $('presets');
    box.innerHTML = '';
    var same = function (p) {
      return Math.abs(p[0] - st.w) < 0.05 && Math.abs(p[1] - st.h) < 0.05;
    };
    var mine = opts.presets[st.type] || [];
    var exists = C.TYPES[st.type].presets.some(same) || mine.some(same);
    mine.forEach(function (p, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip mine';
      b.title = 'ขนาดประจำร้าน — กด × เพื่อลบ';
      b.innerHTML = esc(C.fmtCm(p[0]) + '×' + C.fmtCm(p[1])) + '<span class="x" aria-label="ลบ">×</span>';
      b.setAttribute('aria-pressed', String(same(p)));
      b.addEventListener('click', function (e) {
        if (e.target.classList.contains('x')) {
          opts.presets[st.type].splice(i, 1);
          if (!opts.presets[st.type].length) delete opts.presets[st.type];
          optsChanged();
          return;
        }
        st.w = p[0];
        st.h = p[1];
        refreshPhotoQuad();
        sync();
      });
      box.appendChild(b);
    });
    if (!exists) {
      var add = document.createElement('button');
      add.type = 'button';
      add.className = 'chip add';
      add.textContent = '+ บันทึกขนาดนี้';
      add.title = 'เก็บ ' + C.sizeText(st.w, st.h) + ' เป็นขนาดประจำร้าน';
      add.addEventListener('click', function () {
        opts.presets[st.type] = (opts.presets[st.type] || []).concat([[st.w, st.h]]);
        optsChanged();
        toast('บันทึกขนาด ' + C.fmtCm(st.w) + '×' + C.fmtCm(st.h) + ' ซม. เป็นขนาดประจำร้านแล้ว');
      });
      box.appendChild(add);
    }
    C.TYPES[st.type].presets.forEach(function (p) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.textContent = C.presetLabel(p);
      b.title = C.sizeText(p[0], p[1]);
      b.setAttribute('aria-pressed', String(Math.abs(p[0] - st.w) < 0.05 && Math.abs(p[1] - st.h) < 0.05));
      b.addEventListener('click', function () {
        st.w = p[0];
        st.h = p[1];
        refreshPhotoQuad();
        sync();
      });
      box.appendChild(b);
    });
  }

  /* ---------- ฉาก (ภาพย่อวาดจริงด้วยงานปัจจุบัน) ---------- */
  var CAMERA_ICON =
    '<svg viewBox="0 0 24 24"><path d="M4 8.5A1.5 1.5 0 0 1 5.5 7H8l1.5-2h5L16 7h2.5A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z"/><circle cx="12" cy="13" r="3.2"/></svg>';
  // รายการฉากโชว์เฉพาะฉากที่ใช้กับชนิดงานนี้ได้ — ชุดฉากเปลี่ยน (บัตร/ป้ายตั้งพื้น/ป้ายติดผนัง) ทำรายการใหม่
  var scenesKey = null;
  function fitScenes() {
    return C.SCENE_ORDER.filter(function (k) {
      return k === 'photo' || C.sceneFits(k, st.type);
    }).join(',');
  }
  function buildScenes() {
    var box = $('scenes');
    box.innerHTML = '';
    scenesKey = fitScenes();
    C.SCENE_ORDER.forEach(function (k) {
      if (opts.hideScenes.indexOf(k) >= 0 && k !== st.scene) return;
      if (k !== 'photo' && !C.sceneFits(k, st.type)) return; // ฉากบัตรโชว์เฉพาะงานบัตร

      var sc = C.SCENES[k];
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'scene';
      b.dataset.scene = k;
      var icon = k === 'photo' || (k === 'handPhoto' && !handReady()) ? CAMERA_ICON : '<canvas width="16" height="10"></canvas>';
      b.innerHTML = '<span class="thumb">' + icon + '</span><b>' + esc(sc.name) + '</b><small>' + esc(k === 'handPhoto' && !handReady() ? 'กดเพื่อใส่รูปมือจับบัตรของร้าน' : sc.desc) + '</small>';
      b.addEventListener('click', function () {
        st.scene = k;
        if (k === 'photo' && !photo) $('photoFile').click();
        if (k === 'handPhoto' && !handReady()) $('handFile').click();
        sync();
      });
      box.appendChild(b);
    });
  }
  var thumbTimer = 0;
  function thumbsSoon() {
    clearTimeout(thumbTimer);
    thumbTimer = setTimeout(drawThumbs, stage ? 900 : 450);
  }
  function drawThumbs() {
    document.querySelectorAll('.scene').forEach(function (b) {
      if (stage && b.dataset.scene !== 'photo' && b.dataset.scene !== 'handPhoto') {
        var tc = b.querySelector('canvas');
        if (tc.width !== 320) {
          tc.width = 320;
          tc.height = 200;
        }
        stage.thumb(b.dataset.scene, tc);
        return;
      }
      var k = b.dataset.scene;
      var c = b.querySelector('canvas');
      if (!c) {
        if (k === 'photo' && photo) {
          var holder = b.querySelector('.thumb');
          holder.innerHTML = '<canvas width="16" height="10"></canvas>';
          c = holder.querySelector('canvas');
        } else return;
      }
      if (!c) return;
      var s = renderState({ scene: k, info: false, dims: false, aspect: 'landscape', zoom: 1, handEdit: false });
      if (k !== 'photo') s.photo = null;
      R.render(c, s, { scale: 0.16 });
    });
  }

  /* ---------- ตำแหน่งติดป้าย (ฉากประตู / ห้องเรียน) ---------- */
  function buildSpots() {
    var sc = C.SCENES[st.scene];
    var field = $('spotField');
    var box = $('spotSeg');
    if (!sc || !sc.spots || C.geometry(st.type, st.w, st.h, st.steel).mount === 'floor') {
      field.hidden = true;
      $('doorField').hidden = true;
      return;
    }
    field.hidden = false;
    if (box.dataset.scene !== st.scene) {
      box.innerHTML = '';
      [['auto', 'อัตโนมัติ']].concat(sc.spots).forEach(function (o) {
        var b = document.createElement('button');
        b.type = 'button';
        b.dataset.spot = o[0];
        b.textContent = o[1];
        b.addEventListener('click', function () {
          st.spot = o[0];
          sync();
        });
        box.appendChild(b);
      });
      box.dataset.scene = st.scene;
    }
    var valid = sc.spots.some(function (o) {
      return o[0] === st.spot;
    });
    pressed('#spotSeg button', 'spot', valid ? st.spot : 'auto');
    $('spotHint').textContent =
      st.scene === 'classroom'
        ? 'อัตโนมัติ = ติดเหนือกระดาน'
        : 'อัตโนมัติ = ป้ายขนาดประตู (กว้าง 55–110 สูง 150–230 ซม.) ติดเต็มบาน · ป้ายเล็กติดบนบาน · ป้ายใหญ่ติดเหนือประตู';
    // ประตูห้องเรียน: เปิดพับชิดผนัง / ปิด (เฉพาะป้ายที่ติดบนบาน)
    var sp = C.resolveSpot(st.scene, st.spot, C.geometry(st.type, st.w, st.h));
    var canOpen = !!sc.canOpen && (sp === 'full' || sp === 'door');
    $('doorField').hidden = !canOpen;
    pressed('#doorSeg button', 'open', String(!!st.doorOpen));
  }
  // ฉาก "บนกระดาษ": สีกระดาษรองบัตร
  function buildPapers() {
    var field = $('paperField');
    field.hidden = !(C.SCENES[st.scene] && C.SCENES[st.scene].papers);
    if (field.hidden) return;
    var box = $('papers');
    if (!box.children.length) {
      C.PAPER_ORDER.forEach(function (k) {
        var pp = C.PAPERS[k];
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'swatch';
        b.dataset.paper = k;
        b.innerHTML = '<i style="background:' + pp.color + ';box-shadow:inset 0 0 0 1px rgba(0,0,0,.15)"></i>' + esc(pp.name);
        b.addEventListener('click', function () {
          st.paper = k;
          sync();
        });
        box.appendChild(b);
      });
    }
    pressed('#papers .swatch', 'paper', st.paper);
  }
  function buildTones() {
    var sc = C.SCENES[st.scene];
    var field = $('toneField');
    field.hidden = !(sc && sc.tones);
    if (field.hidden) return;
    var box = $('tones');
    if (!box.children.length) {
      C.TONE_ORDER.forEach(function (k) {
        var tn = C.WALL_TONES[k];
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'swatch';
        b.dataset.tone = k;
        b.innerHTML = '<i style="background:linear-gradient(180deg,' + tn.upper + ' 0 55%,' + tn.lower + ' 55% 100%);box-shadow:inset 0 0 0 1px rgba(0,0,0,.12)"></i>' + esc(tn.name);
        b.addEventListener('click', function () {
          st.tone = k;
          sync();
        });
        box.appendChild(b);
      });
      var add = document.createElement('button');
      add.type = 'button';
      add.className = 'swatch add';
      add.title = 'เพิ่มสีผนังของร้านเอง';
      add.innerHTML = '<i>+</i>สีผนังใหม่';
      add.addEventListener('click', openToneEditor);
      box.appendChild(add);
    }
    pressed('#tones .swatch', 'tone', st.tone);
  }

  /* ---------- ซิงก์หน้าจอกับสถานะ ---------- */
  function pressed(sel, attr, val) {
    document.querySelectorAll(sel).forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset[attr] === String(val)));
    });
  }
  function setVal(id, v) {
    var el = $(id);
    if (document.activeElement !== el) el.value = v;
  }
  function sync() {
    pressed('#modeSeg button', 'mode', st.mode);
    $('imagePane').hidden = st.mode !== 'image';
    $('textPane').hidden = st.mode !== 'text';
    pressed('#fitSeg button', 'fit', st.fit);
    pressed('#types .card', 'type', st.type);
    if (scenesKey !== null && scenesKey !== fitScenes()) buildScenes(); // เปลี่ยนชนิด/ย้อนกลับ/เปิดงานเก่า
    pressed('#scenes .scene', 'scene', st.scene);
    pressed('#themes .swatch', 'theme', st.text.theme);
    pressed('#aspectSeg button', 'aspect', st.aspect);
    setVal('w', C.fmtCm(st.w));
    setVal('h', C.fmtCm(st.h));
    setVal('tTitle', st.text.title);
    setVal('tSub', st.text.sub);
    setVal('tPhone', st.text.phone);
    setVal('rate', st.rates[st.type] || '');
    setVal('qty', String(st.qty));
    setVal('shopName', st.shopName);
    setVal('shopPhone', st.shopPhone);
    $('person').checked = st.person;
    // งานชิ้นเล็ก (บัตร/โปสเตอร์/ป้ายตั้งโต๊ะ) ไม่โชว์คนยืน — บอกให้ชัด ไม่ใช่คนหายไปเฉย ๆ
    var smallNow = !!C.TYPES[st.type].small;
    $('person').disabled = smallNow;
    $('personRow').classList.toggle('off', smallNow);
    $('personText').textContent = smallNow ? 'คนยืนเทียบขนาด — ไม่โชว์กับงานชิ้นเล็ก (บัตร/โปสเตอร์/ป้ายตั้งโต๊ะ เล็กจนมองไม่เห็นข้างคน) เปลี่ยนเป็นงานป้ายแล้วคนยืนกลับมาเอง' : 'คนยืนเทียบขนาด (สูง 170 ซม.)';
    $('dims').checked = st.dims;
    $('info').checked = st.info;
    $('zoom').value = st.zoom;
    $('zoomVal').textContent = Math.round(st.zoom * 100) + '%';
    $('bright').value = st.brightness;
    $('brightVal').textContent = Math.round(st.brightness * 100) + '%';
    var isPhoto = st.scene === 'photo';
    $('photoPane').hidden = !isPhoto;
    $('zoomRow').hidden = isPhoto || !!stage;
    $('aspectField').hidden = isPhoto; // รูปลูกค้าใช้สัดส่วนของรูปเอง
    $('photoDropText').textContent = photo ? 'เปลี่ยนรูปหน้าร้าน' : 'เลือกรูปหน้าร้านลูกค้า';
    $('fileCard').hidden = !imgDesign;
    $('drop').hidden = !!imgDesign;
    var mismatch = st.mode === 'image' && imgDesign && C.ratioMismatch(st.w, st.h, imgDesign.w, imgDesign.h);
    $('ratioNote').hidden = !mismatch;
    if (mismatch) {
      $('ratioText').textContent =
        st.fit === 'cover' ? 'สัดส่วนรูปไม่ตรงกับป้าย ขอบรูปบางส่วนจะถูกตัด' : 'สัดส่วนรูปไม่ตรงกับป้าย จะมีขอบว่างรอบรูป';
    }
    buildPresets();
    buildSpots();
    buildTones();
    buildPapers();
    buildMetals();
    steelSync();
    $('themeEdit').hidden = !(R.themes()[st.text.theme] || {}).mine;
    syncFontSelects();
    save();
    draw();
  }
  document.querySelectorAll('#doorSeg button').forEach(function (b) {
    b.addEventListener('click', function () {
      st.doorOpen = b.dataset.open === 'true';
      sync();
    });
  });

  /* ---------- ขั้น 1: งานออกแบบ ---------- */
  document.querySelectorAll('#modeSeg button').forEach(function (b) {
    b.addEventListener('click', function () {
      st.mode = b.dataset.mode;
      sync();
    });
  });
  document.querySelectorAll('#fitSeg button').forEach(function (b) {
    b.addEventListener('click', function () {
      st.fit = b.dataset.fit;
      sync();
    });
  });

  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        resolve(img);
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('อ่านรูปไม่ได้'));
      };
      img.src = url;
    });
  }
  function isImage(file) {
    return file && /^image\//.test(file.type || '') && !/heic|heif/i.test(file.type);
  }
  var uid = 0;
  function newId(p) {
    return p + Date.now().toString(36) + (++uid).toString(36);
  }
  // ไฟล์งาน → พร้อมใช้ (เก็บไฟล์ต้นฉบับไว้บันทึกงาน)
  function designFromBlob(blob, name) {
    return loadImage(blob).then(function (img) {
      var d = R.prepareImage(img, 3000);
      d.id = newId('img');
      d.blob = blob;
      d.name = name || 'รูปที่วาง';
      d.thumb = img.src;
      d.px = (img.naturalWidth || img.width) + ' × ' + (img.naturalHeight || img.height) + ' px';
      return d;
    });
  }
  function photoFromBlob(blob) {
    return loadImage(blob).then(function (img) {
      var p = R.prepareImage(img, 2400);
      return { id: newId('ph'), img: p.src, w: p.w, h: p.h, quad: null, touched: false, blob: blob };
    });
  }
  function showFileCard() {
    if (!imgDesign) return;
    $('fileThumb').src = imgDesign.thumb || '';
    $('fileName').textContent = imgDesign.name || '';
    $('fileInfo').textContent = imgDesign.px || '';
  }
  function setDesignFile(file) {
    if (!file) return;
    if (!isImage(file)) {
      toast('ไฟล์นี้เปิดไม่ได้ ใช้ JPG หรือ PNG (ไฟล์ PDF/AI ให้ Export เป็น JPG ก่อน)');
      return;
    }
    designFromBlob(file, file.name)
      .then(function (d) {
        imgDesign = d;
        showFileCard();
        st.mode = 'image';
        if (C.geometry(st.type, st.w, st.h, st.steel).mount === 'wall' && C.ratioMismatch(st.w, st.h, imgDesign.w, imgDesign.h)) {
          st.h = C.clampCm(C.heightForImage(st.w, imgDesign.w, imgDesign.h), st.h);
          toast('ปรับความสูงป้ายเป็น ' + C.fmtCm(st.h) + ' ซม. ให้ตรงกับสัดส่วนรูปแล้ว');
          refreshPhotoQuad();
        }
        sync();
      })
      .catch(function () {
        toast('อ่านรูปนี้ไม่ได้ ลองบันทึกเป็น JPG แล้วเลือกใหม่');
      });
  }
  $('designFile').addEventListener('change', function (e) {
    setDesignFile(e.target.files[0]);
    e.target.value = '';
  });
  $('fileClear').addEventListener('click', function () {
    imgDesign = null;
    st.mode = 'text';
    sync();
  });
  $('matchRatio').addEventListener('click', function () {
    if (!imgDesign) return;
    st.h = C.clampCm(C.heightForImage(st.w, imgDesign.w, imgDesign.h), st.h);
    refreshPhotoQuad();
    sync();
  });
  function dropZone(el, onFile) {
    ['dragenter', 'dragover'].forEach(function (ev) {
      el.addEventListener(ev, function (e) {
        e.preventDefault();
        el.classList.add('over');
      });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      el.addEventListener(ev, function (e) {
        e.preventDefault();
        el.classList.remove('over');
      });
    });
    el.addEventListener('drop', function (e) {
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) onFile(f);
    });
  }
  dropZone($('drop'), setDesignFile);
  dropZone($('canvasBox'), function (f) {
    if (st.scene === 'photo' && !photo) setPhotoFile(f);
    else setDesignFile(f);
  });
  document.addEventListener('paste', function (e) {
    var items = (e.clipboardData && e.clipboardData.items) || [];
    for (var i = 0; i < items.length; i++) {
      if (items[i].kind === 'file' && /^image\//.test(items[i].type)) {
        e.preventDefault();
        setDesignFile(items[i].getAsFile());
        go(1);
        return;
      }
    }
  });

  ['tTitle', 'tSub', 'tPhone'].forEach(function (id) {
    var key = { tTitle: 'title', tSub: 'sub', tPhone: 'phone' }[id];
    $(id).addEventListener('input', function (e) {
      st.text[key] = e.target.value;
      st.mode = 'text';
      save();
      draw();
    });
  });
  function buildThemes() {
    var box = $('themes');
    box.innerHTML = '';
    var all = R.themes();
    Object.keys(all).forEach(function (k) {
      var th = all[k];
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'swatch' + (th.mine ? ' mine' : '');
      b.dataset.theme = k;
      b.innerHTML =
        '<i style="background:linear-gradient(135deg,' + th.bg + ' 0 62%,' + th.pillBg + ' 62% 100%);box-shadow:inset 0 0 0 1px rgba(0,0,0,.12)"></i>' + esc(th.name);
      b.addEventListener('click', function () {
        st.text.theme = k;
        st.mode = 'text';
        sync();
      });
      box.appendChild(b);
    });
    var add = document.createElement('button');
    add.type = 'button';
    add.className = 'swatch add';
    add.title = 'สร้างชุดสีของร้านเอง';
    add.innerHTML = '<i>+</i>ชุดสีใหม่';
    add.addEventListener('click', function () {
      openThemeEditor(null);
    });
    box.appendChild(add);
  }

  /* ---------- ขั้น 2: ขนาด ---------- */
  function sizeInput(id, key) {
    $(id).addEventListener('input', function (e) {
      var v = C.num(e.target.value);
      if (v >= C.clampCm(1, 5) && v <= 2000) {
        st[key] = C.clampCm(v, st[key]);
        refreshPhotoQuad();
        save();
        buildPresets();
        steelSync();
        draw();
        syncRatioNote();
      }
    });
    $(id).addEventListener('change', function (e) {
      st[key] = C.clampCm(e.target.value, st[key]);
      e.target.value = C.fmtCm(st[key]);
      sync();
    });
  }
  function syncRatioNote() {
    var mismatch = st.mode === 'image' && imgDesign && C.ratioMismatch(st.w, st.h, imgDesign.w, imgDesign.h);
    $('ratioNote').hidden = !mismatch;
  }
  sizeInput('w', 'w');
  sizeInput('h', 'h');
  $('swap').addEventListener('click', function () {
    var t = st.w;
    st.w = st.h;
    st.h = t;
    refreshPhotoQuad();
    sync();
  });

  /* ---------- ขั้น 3: ฉาก / รูปหน้าร้าน ---------- */
  ['person', 'dims', 'info'].forEach(function (id) {
    $(id).addEventListener('change', function (e) {
      st[id] = e.target.checked;
      sync();
    });
  });
  $('zoom').addEventListener('input', function (e) {
    st.zoom = +e.target.value;
    $('zoomVal').textContent = Math.round(st.zoom * 100) + '%';
    save();
    draw();
  });
  $('bright').addEventListener('input', function (e) {
    st.brightness = +e.target.value;
    $('brightVal').textContent = Math.round(st.brightness * 100) + '%';
    save();
    draw();
  });

  function setPhotoFile(file) {
    if (!file) return;
    if (!isImage(file)) {
      toast('รูปนี้เปิดไม่ได้ ใช้ JPG หรือ PNG');
      return;
    }
    photoFromBlob(file)
      .then(function (p) {
        var size = C.canvasSize('auto', null, { w: p.w, h: p.h });
        p.quad = C.defaultQuad(C.geometry(st.type, st.w, st.h), size.W, size.H);
        photo = p;
        st.scene = 'photo';
        toast('ลากจุดส้ม 4 มุมให้ตรงตำแหน่งป้ายในรูป');
        sync();
      })
      .catch(function () {
        toast('อ่านรูปนี้ไม่ได้ ลองบันทึกเป็น JPG แล้วเลือกใหม่');
      });
  }
  $('photoFile').addEventListener('change', function (e) {
    setPhotoFile(e.target.files[0]);
    e.target.value = '';
  });
  dropZone($('photoDrop'), setPhotoFile);
  function refreshPhotoQuad(force) {
    if (!photo || (photo.touched && !force)) return;
    var size = C.canvasSize('auto', null, { w: photo.w, h: photo.h });
    photo.quad = C.defaultQuad(C.geometry(st.type, st.w, st.h), size.W, size.H);
  }
  $('resetQuad').addEventListener('click', function () {
    refreshPhotoQuad(true);
    if (photo) photo.touched = false;
    save();
    draw();
  });

  // ลากมุม/ย้ายป้ายบนรูปลูกค้า
  var drag = null;
  function toCanvas(e) {
    var r = view.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * lastOut.W,
      y: ((e.clientY - r.top) / r.height) * (lastOut.H + lastOut.F),
    };
  }
  view.addEventListener('pointerdown', function (e) {
    if (st.scene !== 'photo' || !photo || !lastOut || !lastOut.quad) return;
    var p = toCanvas(e);
    var q = lastOut.quad;
    var best = -1;
    var bestD = 42 * lastOut.U * Math.max(1, lastOut.W / view.getBoundingClientRect().width / 1.6);
    for (var i = 0; i < 4; i++) {
      var d = Math.hypot(q[i].x - p.x, q[i].y - p.y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best < 0 && !C.pointInQuad(p, q)) return;
    e.preventDefault();
    drag = { corner: best, start: p, quad: photo.quad.map(function (c) {
      return { x: c.x, y: c.y };
    }) };
    view.setPointerCapture(e.pointerId);
    view.classList.add('dragging');
  });
  view.addEventListener('pointermove', function (e) {
    if (!drag) return;
    var p = toCanvas(e);
    var dx = (p.x - drag.start.x) / lastOut.W;
    var dy = (p.y - drag.start.y) / lastOut.H;
    var lim = function (v) {
      return Math.max(-0.25, Math.min(1.25, v));
    };
    photo.quad = drag.quad.map(function (c, i) {
      if (drag.corner >= 0 && i !== drag.corner) return c;
      return { x: lim(c.x + dx), y: lim(c.y + dy) };
    });
    photo.touched = true;
    draw();
  });
  function endDrag() {
    if (!drag) return;
    drag = null;
    view.classList.remove('dragging');
    save();
    if (!C.isConvex(lastOut.quad || [])) toast('มุมไขว้กันอยู่ ลากมุมให้เป็นสี่เหลี่ยมก่อน');
  }
  view.addEventListener('pointerup', endDrag);
  view.addEventListener('pointercancel', endDrag);

  /* ---------- ฉาก "มือจับ (รูปของร้าน)" ----------
   * รูปมือจับบัตรของร้าน เก็บในเครื่อง (IndexedDB 'opt-hand-photo') ใช้ได้กับทุกงาน + ตำแหน่งบัตรในรูป (หาเองอัตโนมัติ ลากปรับได้)
   * st.handView = มุมที่โชว์: สองมือ (ทั้งรูป) / มือซ้าย / มือขวา (ตัดครึ่งรูป) */
  var HAND_ID = 'opt-hand-photo';
  var handPhoto = null;
  var handEdit = false;
  var hdrag = null;
  function handReady() {
    return !!(handPhoto && handPhoto.img && handPhoto.cards && handPhoto.cards.length);
  }
  function handDetect(p) {
    var f = Math.min(1, 420 / Math.max(p.w, p.h));
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(p.w * f));
    c.height = Math.max(1, Math.round(p.h * f));
    var x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(p.img, 0, 0, c.width, c.height);
    try {
      return C.findCards(x.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
    } catch (e) {
      return { cards: [], ref: 240 };
    }
  }
  // หาบัตรในรูป (ไม่เจอ = วางกรอบตั้งต้นให้ลากเอง) · คืนจำนวนที่หาเจอ
  function handFind(p, want) {
    var r = handDetect(p);
    var g = C.geometry(st.type, st.w, st.h);
    p.cards = r.cards.length ? r.cards : C.handDefaults(want || 2, p.w, p.h, g.w, g.h);
    p.ref = r.ref;
    p.split = C.handSplit(p.cards);
    p.layers = null;
    return r.cards.length;
  }
  // รูปพื้นใส (PNG/WebP) วางบนพื้นขาวก่อน ไม่งั้นส่งออก JPG พื้นกลายเป็นสีดำ
  function handFromBlob(blob) {
    return photoFromBlob(blob).then(function (p) {
      var c = document.createElement('canvas');
      c.width = p.w;
      c.height = p.h;
      var x = c.getContext('2d');
      x.fillStyle = '#ffffff';
      x.fillRect(0, 0, p.w, p.h);
      x.drawImage(p.img, 0, 0, p.w, p.h);
      p.img = c;
      return p;
    });
  }
  // รูปมาตรฐานของแอป (ตำแหน่งบัตรวัดไว้แล้ว) — cards = ตำแหน่งที่ร้านปรับเองไว้ (ถ้ามี)
  function loadBuiltinHand(cards, turn) {
    var B = C.HAND_BUILTIN;
    return fetch(B.src)
      .then(function (r) {
        if (!r.ok) throw new Error('no hand photo');
        return r.blob();
      })
      .then(handFromBlob)
      .then(function (p) {
        p.builtin = true;
        p.blob = null;
        p.cards = cards || B.cards.map(function (q) {
          return q.map(function (c) {
            return { x: c.x, y: c.y };
          });
        });
        p.ref = B.ref;
        p.round = B.round;
        p.turn = turn | 0;
        p.split = C.handSplit(p.cards);
        return p;
      });
  }
  function saveHand() {
    if (!NS.jobs || !handPhoto) return;
    var rec = { id: HAND_ID, at: Date.now(), cards: handPhoto.cards, ref: handPhoto.ref, turn: handPhoto.turn || 0 };
    if (handPhoto.builtin) rec.builtin = true;
    else rec.blob = handPhoto.blob;
    NS.jobs.put(rec).catch(function () {});
  }
  function setHandFile(file) {
    if (!file) return;
    if (!isImage(file)) {
      toast('รูปนี้เปิดไม่ได้ ใช้ JPG หรือ PNG');
      return;
    }
    handFromBlob(file)
      .then(function (p) {
        p.turn = 0;
        var n = handFind(p);
        handPhoto = p;
        handEdit = true;
        st.scene = 'handPhoto';
        st.handView = 'both';
        saveHand();
        buildScenes();
        toast(n ? 'พบบัตร ' + n + ' ใบในรูป วางงานให้แล้ว — ลากจุดส้มปรับมุมได้ถ้ายังไม่ตรง' : 'หาบัตรในรูปไม่เจอ ลากจุดส้มให้ตรงมุมบัตรในรูป');
        sync();
      })
      .catch(function () {
        toast('อ่านรูปนี้ไม่ได้ ลองบันทึกเป็น JPG แล้วเลือกใหม่');
      });
  }
  $('handFile').addEventListener('change', function (e) {
    setHandFile(e.target.files[0]);
    e.target.value = '';
  });
  // ตอนเปิดแอป: รูปมือของร้านที่เก็บไว้ หรือรูปมาตรฐานของแอป
  function bootHand() {
    var get = NS.jobs ? NS.jobs.get(HAND_ID).catch(function () { return null; }) : Promise.resolve(null);
    return get
      .then(function (rec) {
        var cards = rec ? C.normalizeCards(rec.cards) : null;
        if (rec && rec.blob) {
          return handFromBlob(rec.blob).then(function (p) {
            p.turn = rec.turn | 0;
            if (cards) {
              p.cards = cards;
              p.ref = rec.ref > 0 ? rec.ref : 240;
              p.split = C.handSplit(cards);
            } else handFind(p);
            return p;
          });
        }
        return loadBuiltinHand(rec && rec.builtin ? cards : null, rec && rec.builtin ? rec.turn : 0);
      })
      .then(function (p) {
        handPhoto = p;
        buildScenes();
        sync();
      })
      .catch(function () {});
  }
  bootHand();
  function handSync() {
    var on = st.scene === 'handPhoto';
    $('handField').hidden = !on;
    if (!on) return;
    var ready = handReady();
    var n = ready ? handPhoto.cards.length : 0;
    $('handViewSeg').hidden = n < 2;
    $('handCountSeg').hidden = !ready;
    ['handEdit', 'handTurn', 'handFind'].forEach(function (id) {
      $(id).hidden = !ready;
    });
    var own = ready && !handPhoto.builtin;
    $('handDel').hidden = !own;
    $('handFind').textContent = ready && handPhoto.builtin ? 'จัดมุมบัตรใหม่' : 'หาบัตรในรูปใหม่';
    $('handAll').hidden = n < 2;
    $('handChange').textContent = own ? 'เปลี่ยนรูปมือ' : '+ ใช้รูปมือของร้านเอง';
    pressed('#handViewSeg button', 'hview', st.handView);
    pressed('#handCountSeg button', 'hcount', String(n));
    $('handEdit').setAttribute('aria-pressed', String(handEdit));
    $('handEdit').textContent = handEdit ? 'เสร็จ ซ่อนจุดมุม' : 'ปรับมุมบัตร';
    $('handInfo').textContent = ready
      ? (handPhoto.builtin ? 'รูปมาตรฐานของแอป · ' : 'รูปของร้าน · ') + 'บัตรในรูป ' + n + ' ใบ' + (handEdit ? ' · ลากจุดส้มที่มุมให้ตรงมุมบัตร (ลากกลางบัตร = ย้ายทั้งใบ)' : ' · งานวางบนบัตรพร้อมเงาตามรูปจริง')
      : 'กำลังโหลดรูปมือ…';
  }
  document.querySelectorAll('#handViewSeg button').forEach(function (b) {
    b.addEventListener('click', function () {
      st.handView = b.dataset.hview;
      save();
      sync();
    });
  });
  document.querySelectorAll('#handCountSeg button').forEach(function (b) {
    b.addEventListener('click', function () {
      if (!handReady()) return;
      var n = +b.dataset.hcount;
      var cards = handPhoto.cards.slice(0, n);
      if (cards.length < n) {
        var g = C.geometry(st.type, st.w, st.h);
        var def = C.handDefaults(2, handPhoto.w, handPhoto.h, g.w, g.h);
        var cx = (cards[0][0].x + cards[0][2].x) / 2;
        cards.push(cx < 0.5 ? def[1] : def[0]);
        cards = C.normalizeCards(cards);
        handEdit = true;
      }
      handPhoto.cards = cards;
      handPhoto.split = C.handSplit(cards);
      if (n < 2) st.handView = 'both';
      saveHand();
      save();
      sync();
    });
  });
  $('handEdit').addEventListener('click', function () {
    handEdit = !handEdit;
    sync();
  });
  $('handTurn').addEventListener('click', function () {
    if (!handReady()) return;
    handPhoto.turn = ((handPhoto.turn | 0) + 1) % 4;
    saveHand();
    draw();
  });
  $('handFind').addEventListener('click', function () {
    if (!handReady()) return;
    if (handPhoto.builtin) {
      // รูปมาตรฐาน: กลับไปตำแหน่งบัตรที่วัดไว้
      handPhoto.cards = C.HAND_BUILTIN.cards.map(function (q) {
        return q.map(function (c) {
          return { x: c.x, y: c.y };
        });
      });
      handPhoto.split = C.handSplit(handPhoto.cards);
      saveHand();
      sync();
      return;
    }
    var n = handFind(handPhoto, handPhoto.cards.length);
    handEdit = true;
    saveHand();
    toast(n ? 'พบบัตร ' + n + ' ใบในรูป' : 'หาบัตรในรูปไม่เจอ ลากจุดส้มให้ตรงมุมบัตร');
    sync();
  });
  $('handChange').addEventListener('click', function () {
    $('handFile').click();
  });
  var handDelArmed = 0;
  $('handDel').addEventListener('click', function () {
    if (Date.now() - handDelArmed > 3000) {
      handDelArmed = Date.now();
      $('handDel').textContent = 'กดอีกครั้งเพื่อลบ';
      setTimeout(function () {
        $('handDel').textContent = 'ลบรูปของร้าน';
      }, 3000);
      return;
    }
    handDelArmed = 0;
    $('handDel').textContent = 'ลบรูปของร้าน';
    handEdit = false;
    // กลับไปใช้รูปมาตรฐานของแอป
    (NS.jobs ? NS.jobs.del(HAND_ID).catch(function () {}) : Promise.resolve()).then(function () {
      handPhoto = null;
      st.handView = 'both';
      return bootHand();
    });
    toast('ลบรูปของร้านแล้ว กลับไปใช้รูปมาตรฐาน');
  });
  // บันทึกครบ 3 ภาพ: สองมือ + มือซ้าย + มือขวา (มือถือ: แชร์ทีเดียว 3 รูป · คอมพิวเตอร์: ดาวน์โหลด 3 ไฟล์)
  $('handAll').addEventListener('click', function () {
    if (!handReady() || handPhoto.cards.length < 2) return;
    var btn = $('handAll');
    btn.disabled = true;
    var views = ['both', 'left', 'right'];
    Promise.all(
      views.map(function (v) {
        var c = document.createElement('canvas');
        R.render(c, renderState({ handView: v, handEdit: false }), { scale: 1.5, preview: false });
        return toBlob(c, 'image/jpeg', 0.92).then(function (b) {
          return new File([b], fileName('mockup-' + (v === 'both' ? 'two-hands' : v + '-hand'), 'jpg'), { type: 'image/jpeg' });
        });
      })
    )
      .then(function (files) {
        if (navigator.canShare && navigator.canShare({ files: files }) && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
          return navigator.share({ files: files, title: 'ภาพจำลองบัตร' }).catch(function () {});
        }
        files.forEach(function (f, i) {
          setTimeout(function () {
            var a = document.createElement('a');
            a.href = URL.createObjectURL(f);
            a.download = f.name;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(function () {
              URL.revokeObjectURL(a.href);
            }, 4000);
          }, i * 400);
        });
        toast('บันทึก 3 ภาพ: สองมือ · มือซ้าย · มือขวา');
      })
      .then(function () {
        btn.disabled = false;
      }, function () {
        btn.disabled = false;
        toast('บันทึกไม่สำเร็จ ลองอีกครั้ง');
      });
  });
  // ลากมุมบัตร / ย้ายทั้งใบ (เฉพาะตอนกด "ปรับมุมบัตร")
  view.addEventListener('pointerdown', function (e) {
    if (st.scene !== 'handPhoto' || !handReady() || !handEdit || !lastOut || !lastOut.cards) return;
    var p = toCanvas(e);
    var best = null;
    var bestD = 42 * lastOut.U * Math.max(1, lastOut.W / view.getBoundingClientRect().width / 1.6);
    lastOut.cards.forEach(function (c) {
      c.q.forEach(function (pt, j) {
        var d = Math.hypot(pt.x - p.x, pt.y - p.y);
        if (d < bestD) {
          bestD = d;
          best = { card: c.i, corner: j };
        }
      });
    });
    if (!best) {
      lastOut.cards.forEach(function (c) {
        if (!best && C.pointInQuad(p, c.q)) best = { card: c.i, corner: -1 };
      });
    }
    if (!best) return;
    e.preventDefault();
    hdrag = {
      card: best.card,
      corner: best.corner,
      start: p,
      cr: C.handCrop(st.handView, handPhoto.cards, handPhoto.split),
      orig: handPhoto.cards[best.card].map(function (c) {
        return { x: c.x, y: c.y };
      }),
    };
    view.setPointerCapture(e.pointerId);
    view.classList.add('dragging');
  });
  view.addEventListener('pointermove', function (e) {
    if (!hdrag) return;
    var p = toCanvas(e);
    var dx = ((p.x - hdrag.start.x) / lastOut.W) * hdrag.cr.w;
    var dy = ((p.y - hdrag.start.y) / lastOut.H) * hdrag.cr.h;
    var lim = function (v) {
      return Math.max(-0.2, Math.min(1.2, v));
    };
    handPhoto.cards[hdrag.card] = hdrag.orig.map(function (c, i) {
      if (hdrag.corner >= 0 && i !== hdrag.corner) return c;
      return { x: lim(c.x + dx), y: lim(c.y + dy) };
    });
    draw();
  });
  function endHandDrag() {
    if (!hdrag) return;
    hdrag = null;
    view.classList.remove('dragging');
    saveHand();
    if ((lastOut.cards || []).some(function (c) { return !C.isConvex(c.q); })) toast('มุมบัตรไขว้กันอยู่ ลากมุมให้เป็นสี่เหลี่ยมก่อน');
  }
  view.addEventListener('pointerup', endHandDrag);
  view.addEventListener('pointercancel', endHandDrag);

  /* ---------- ขั้น 4: ราคา / ร้าน ---------- */
  $('rate').addEventListener('input', function (e) {
    var v = C.num(e.target.value);
    if (v > 0) st.rates[st.type] = v;
    else delete st.rates[st.type];
    save();
    draw();
  });
  $('qty').addEventListener('input', function (e) {
    var v = Math.floor(C.num(e.target.value));
    st.qty = v >= 1 ? Math.min(v, 99999) : 1;
    save();
    draw();
  });
  $('customer').addEventListener('input', function (e) {
    customer = e.target.value;
    autosaveSoon();
    draw();
  });
  ['shopName', 'shopPhone'].forEach(function (id) {
    $(id).addEventListener('input', function (e) {
      st[id] = e.target.value;
      save();
      draw();
    });
  });
  document.querySelectorAll('#aspectSeg button').forEach(function (b) {
    b.addEventListener('click', function () {
      st.aspect = b.dataset.aspect;
      sync();
    });
  });

  // แถวโลโก้: โลโก้ที่อัปโหลด > โลโก้ร้าน NATTAPRON > ไม่มีโลโก้
  function syncLogoRow() {
    var brand = !logoImg && st.brandLogo;
    var any = !!logoImg || brand;
    $('logoThumb').hidden = !any;
    if (logoImg) $('logoThumb').src = st.logo;
    else if (brand) $('logoThumb').src = BRAND.mark;
    $('logoClear').hidden = !any;
    $('logoBrand').hidden = any;
    $('logoBtnText').textContent = any ? 'เปลี่ยนโลโก้' : 'ใส่โลโก้ร้าน';
  }
  function setLogo(dataUrl) {
    if (!dataUrl) {
      logoImg = null;
      syncLogoRow();
      draw();
      return;
    }
    var img = new Image();
    img.onload = function () {
      logoImg = img;
      syncLogoRow();
      draw();
    };
    img.src = dataUrl;
  }
  function loadBrand() {
    ['full', 'mark', 'mascot'].forEach(function (k) {
      var img = new Image();
      img.onload = function () {
        brandImg[k] = img;
        if (k === 'mascot') R.setMascot(img);
        footCache = null;
        draw();
      };
      img.src = BRAND[k];
    });
  }
  $('logoFile').addEventListener('change', function (e) {
    var f = e.target.files[0];
    e.target.value = '';
    if (!isImage(f)) {
      if (f) toast('โลโก้ต้องเป็น JPG หรือ PNG');
      return;
    }
    loadImage(f).then(function (img) {
      // ย่อเก็บไว้ในเครื่อง (สูงไม่เกิน 240 px) จะได้ไม่ต้องใส่ใหม่ทุกครั้ง
      var f2 = Math.min(1, 240 / (img.naturalHeight || img.height));
      var c = document.createElement('canvas');
      c.width = Math.max(1, Math.round((img.naturalWidth || img.width) * f2));
      c.height = Math.max(1, Math.round((img.naturalHeight || img.height) * f2));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      var url = c.toDataURL('image/png');
      st.logo = url;
      save();
      setLogo(url);
    });
  });
  $('logoClear').addEventListener('click', function () {
    st.logo = '';
    st.brandLogo = false;
    save();
    setLogo('');
  });
  $('logoBrand').addEventListener('click', function () {
    st.logo = '';
    st.brandLogo = true;
    save();
    setLogo('');
  });

  /* ---------- ส่งออก: รูป JPG / PNG · ใบเสนอราคา PDF · ไฟล์ 3 มิติ .glb ---------- */
  var exp = { fmt: 'jpg', blob: null, name: '', url: '', purl: '', canvas: null, job: 0 };
  function stamp() {
    var d = new Date();
    var p = function (n) {
      return (n < 10 ? '0' : '') + n;
    };
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes());
  }
  // ชื่อไฟล์ใช้ตัวอังกฤษ/ตัวเลขเท่านั้น (ชื่อไทยบางเบราว์เซอร์กลายเป็น "download")
  function fileName(prefix, ext) {
    var who = customer.trim().replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
    return prefix + '-' + (who ? who + '-' : '') + stamp() + '.' + ext;
  }
  function imageFmt() {
    return st.fmt === 'png' ? 'png' : 'jpg';
  }
  function toBlob(c, type, q) {
    return new Promise(function (resolve, reject) {
      c.toBlob(
        function (b) {
          if (b) resolve(b);
          else reject(new Error('ภาพใหญ่เกินไป'));
        },
        type,
        q
      );
    });
  }
  function blobBytes(b) {
    return (b.arrayBuffer ? b.arrayBuffer() : new Response(b).arrayBuffer()).then(function (ab) {
      return new Uint8Array(ab);
    });
  }
  // ภาพจำลองความละเอียด k เท่า (3 มิติ: จากมุมกล้องที่เห็นอยู่ + เส้นบอกขนาด) withFooter = มีแถบรายละเอียดใต้ภาพ
  function mockupCanvas(k, withFooter) {
    var c = document.createElement('canvas');
    if (is3d() && L3) {
      var F = withFooter ? L3.F : 0;
      var H = Math.round(L3.H * k);
      c.width = Math.round(L3.W * k);
      c.height = Math.round((L3.H + F) * k);
      var cx = c.getContext('2d');
      stage.renderAt(c.width, H, function (gl, pr) {
        cx.drawImage(gl, 0, 0, c.width, H);
        cx.setTransform(k, 0, 0, k, 0, 0);
        R.overlay3d(cx, pr, L3.g, L3.W, L3.H, L3.U, { dims: st.dims, person: st.person });
        if (F) R.footer(cx, L3.W, L3.H, F, L3.U, footerInfo());
      });
    } else R.render(c, renderState(withFooter ? null : { info: false }), { scale: k, preview: false });
    return c;
  }

  var DISP = '"Kanit", "Noto Sans Thai", "Leelawadee UI", Tahoma, sans-serif';
  var BODY = '"IBM Plex Sans Thai", "Noto Sans Thai", "Leelawadee UI", Tahoma, sans-serif';
  function font(x, w, px, fam) {
    x.font = w + ' ' + px + 'px ' + fam;
  }
  // เขียนข้อความไม่ให้เกินความกว้าง (ย่อตัวอักษรลงจนพอดี)
  function fitText(x, text, tx, ty, maxW, w, px, fam) {
    var size = px;
    font(x, w, size, fam);
    while (size > 12 && x.measureText(text).width > maxW) {
      size -= 1;
      font(x, w, size, fam);
    }
    x.fillText(text, tx, ty);
  }
  function rrect(x, rx, ry, rw, rh, r) {
    x.beginPath();
    x.moveTo(rx + r, ry);
    x.arcTo(rx + rw, ry, rx + rw, ry + rh, r);
    x.arcTo(rx + rw, ry + rh, rx, ry + rh, r);
    x.arcTo(rx, ry + rh, rx, ry, r);
    x.arcTo(rx, ry, rx + rw, ry, r);
    x.closePath();
  }

  /* ใบเสนอราคา A4 (1240 × 1754 จุด = 150 dpi): หัวร้าน · ลูกค้า · ภาพจำลอง · ตารางราคา · ยอดตัวหนังสือ · ช่องเซ็น */
  function quotePage(mock) {
    var W = 1240;
    var H = 1754;
    var M = 84;
    var CW = W - M * 2;
    var NAVY = '#1f2a4d';
    var ORANGE = '#d9622b';
    var INK = '#18203a';
    var INK2 = '#565e75';
    var INK3 = '#868c9e';
    var LINE = '#e0dcd4';
    var c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    var x = c.getContext('2d');
    var now = new Date();
    var t = C.TYPES[st.type];
    var q = quoteNow();
    var unit = unitWord();
    x.fillStyle = '#ffffff';
    x.fillRect(0, 0, W, H);

    // หัวกระดาษ: โลโก้ร้าน (ซ้าย) · ใบเสนอราคา (ขวา) · เส้นกรมท่า-ส้ม
    var qLogo = logoImg || (st.brandLogo ? brandImg.full : null);
    x.textBaseline = 'alphabetic';
    x.textAlign = 'left';
    var shopLine = [st.shopName.trim(), st.shopPhone.trim() ? C.phoneText(st.shopPhone) : ''].filter(Boolean).join('  ·  ');
    if (qLogo) {
      var lh = 116;
      var lw = (lh * (qLogo.naturalWidth || qLogo.width)) / (qLogo.naturalHeight || qLogo.height);
      if (lw > 600) {
        lh = (lh * 600) / lw;
        lw = 600;
      }
      x.drawImage(qLogo, M - 6, 40 + (116 - lh) / 2, lw, lh);
      x.fillStyle = INK2;
      if (shopLine) fitText(x, shopLine, M, 192, 640, 400, 22, BODY);
    } else {
      x.fillStyle = NAVY;
      fitText(x, st.shopName.trim() || 'ร้านป้าย', M, 112, 620, 600, 50, DISP);
      x.fillStyle = INK2;
      if (st.shopPhone.trim()) fitText(x, C.phoneText(st.shopPhone), M, 156, 620, 400, 26, BODY);
    }
    x.textAlign = 'right';
    x.fillStyle = NAVY;
    font(x, 600, 56, DISP);
    x.fillText('ใบเสนอราคา', W - M, 106);
    x.fillStyle = INK3;
    font(x, 500, 22, BODY);
    x.fillText('QUOTATION', W - M, 144);
    x.fillStyle = NAVY;
    x.fillRect(M, 210, CW, 5);
    x.fillStyle = ORANGE;
    x.fillRect(M, 210, 150, 5);

    // ลูกค้า / เลขที่ / วันที่
    var y = 272;
    x.textAlign = 'left';
    x.fillStyle = INK3;
    font(x, 500, 22, BODY);
    x.fillText('ลูกค้า', M, y);
    x.fillStyle = INK;
    if (customer.trim()) fitText(x, customer.trim(), M, y + 46, CW * 0.58, 600, 34, DISP);
    else {
      x.strokeStyle = LINE;
      x.lineWidth = 2;
      x.setLineDash([4, 6]);
      x.beginPath();
      x.moveTo(M, y + 48);
      x.lineTo(M + CW * 0.5, y + 48);
      x.stroke();
      x.setLineDash([]);
    }
    x.textAlign = 'right';
    x.fillStyle = INK3;
    font(x, 500, 22, BODY);
    x.fillText('เลขที่', W - M - 250, y);
    x.fillText('วันที่', W - M - 250, y + 44);
    x.fillStyle = INK;
    font(x, 600, 26, BODY);
    x.fillText(C.quoteNo(now), W - M, y);
    x.fillText(C.thaiDate(now), W - M, y + 44);

    // ภาพจำลอง (เตี้ยลงเมื่อมีรายการเพิ่ม/ยอดหลายบรรทัด)
    var T = C.billTotals(q, st.bill);
    var nx = Math.min(T.extras.length, 6);
    var by = 352;
    var bh = Math.max(300, 600 - nx * 52 - (T.plain ? 0 : 40) - (T.deposit && T.deposit < 100 ? 30 : 0));
    x.fillStyle = '#f3f1ec';
    rrect(x, M, by, CW, bh, 18);
    x.fill();
    var sc0 = Math.min((CW - 24) / mock.width, (bh - 24) / mock.height);
    var iw = mock.width * sc0;
    var ih = mock.height * sc0;
    var ix = M + (CW - iw) / 2;
    var iy = by + (bh - ih) / 2;
    x.save();
    rrect(x, ix, iy, iw, ih, 10);
    x.clip();
    x.drawImage(mock, ix, iy, iw, ih);
    x.restore();

    // ตารางรายการ: ป้าย + ค่าใช้จ่ายเพิ่ม
    var ty = by + bh + 32;
    var col = { item: M + 22, size: M + 470, qty: M + 742, per: M + 905, total: W - M - 22 };
    x.fillStyle = NAVY;
    rrect(x, M, ty, CW, 54, 10);
    x.fill();
    x.fillStyle = '#ffffff';
    font(x, 600, 22, BODY);
    x.textAlign = 'left';
    x.fillText('รายการ', col.item, ty + 36);
    x.fillText('ขนาด / รายละเอียด', col.size, ty + 36);
    x.textAlign = 'center';
    x.fillText('จำนวน', col.qty, ty + 36);
    x.textAlign = 'right';
    x.fillText('ราคา/หน่วย', col.per, ty + 36);
    x.fillText('รวม (บาท)', col.total, ty + 36);
    var ry = ty + 54;
    var rh = 120;
    x.textAlign = 'left';
    x.fillStyle = INK;
    fitText(x, '1. ' + t.name, col.item, ry + 42, 420, 600, 28, DISP);
    x.fillStyle = INK2;
    fitText(x, t.desc, col.item, ry + 76, 420, 400, 19, BODY);
    if (q.has && t.unit === 'sqm') {
      x.fillStyle = INK3;
      fitText(x, 'คิดจาก ' + C.fmtAreaExact(st.w, st.h) + ' × ' + C.baht(q.rate) + ' บาท/ตร.ม.', col.item, ry + 105, 420, 400, 18, BODY);
    }
    x.fillStyle = INK;
    font(x, 600, 25, BODY);
    x.fillText(C.fmtCm(st.w) + ' × ' + C.fmtCm(st.h) + ' ซม.', col.size, ry + 42);
    x.fillStyle = INK2;
    font(x, 400, 19, BODY);
    if (t.unit === 'sqm') x.fillText('พื้นที่ ' + C.fmtArea(st.w, st.h), col.size, ry + 76);
    else {
      var note = st.type === 'cnc' ? (C.cncPosts(st.steel) ? 'รวมเสาเหล็ก 2 ต้น' : 'ติดผนัง ไม่มีเสา') : st.type === 'stand' ? 'รวมโครงเหล็ก + ฐาน' : bt() === 'rollup' || bt() === 'xstand' ? 'รวมขาตั้ง + กระเป๋า' : C.lookNote(bt(), st.look);
      if (runNow()) note = 'เลข ' + C.runText(st.run, 0) + (q.qty > 1 ? '–' + C.runText(st.run, q.qty - 1) : '');
      var shn = C.shapeNote(st.type, st.shape);
      if (shn) note = note ? shn + ' · ' + note : shn;
      if (note) fitText(x, note, col.size, ry + 76, col.qty - col.size - 70, 400, 19, BODY);
    }
    x.textAlign = 'center';
    x.fillStyle = INK;
    font(x, 600, 25, BODY);
    x.fillText(q.qty + ' ' + unit, col.qty, ry + 42);
    x.textAlign = 'right';
    x.fillText(q.has ? C.baht(q.per) : '—', col.per, ry + 42);
    x.fillText(q.has ? C.baht(q.total) : '—', col.total, ry + 42);
    x.strokeStyle = LINE;
    x.lineWidth = 2;
    var line = function (yy) {
      x.beginPath();
      x.moveTo(M, yy);
      x.lineTo(W - M, yy);
      x.stroke();
    };
    line(ry + rh);
    var ey = ry + rh;
    T.extras.slice(0, 6).forEach(function (e, i) {
      x.textAlign = 'left';
      x.fillStyle = INK;
      fitText(x, i + 2 + '. ' + (e.name || 'รายการเพิ่ม'), col.item, ey + 35, 600, 500, 24, BODY);
      x.textAlign = 'center';
      font(x, 500, 23, BODY);
      x.fillText('1', col.qty, ey + 35);
      x.textAlign = 'right';
      x.fillText(C.money(e.amount), col.per, ey + 35);
      x.fillText(C.money(e.amount), col.total, ey + 35);
      ey += 52;
      line(ey);
    });

    // ยอดรวม (ขวา): รวม · ส่วนลด · VAT · รวมทั้งสิ้น (ตัวหนังสือ) · มัดจำ/คงค้าง
    var sy = ey + 24;
    var tw = 470;
    var lines2 = [];
    if (!T.plain) {
      lines2.push(['รวมเป็นเงิน', C.money(T.subtotal)]);
      if (T.discount) lines2.push(['ส่วนลด', '−' + C.money(T.discount)]);
      if (T.vatOn) lines2.push(['ภาษีมูลค่าเพิ่ม 7%', C.money(T.vat)]);
    }
    var dep = T.deposit && T.deposit < 100 ? [['มัดจำ ' + T.deposit + '%', C.money(T.depositAmt)], ['คงค้างวันรับงาน', C.money(T.balance)]] : T.deposit === 100 ? [['ชำระเต็มจำนวน', C.money(T.grand)]] : [];
    var boxH = 24 + lines2.length * 34 + 128 + dep.length * 32 + (dep.length ? 10 : 0);
    x.fillStyle = '#fbe8dc';
    rrect(x, W - M - tw, sy, tw, boxH, 16);
    x.fill();
    var ly = sy + 40;
    lines2.forEach(function (l) {
      x.textAlign = 'left';
      x.fillStyle = INK2;
      font(x, 500, 21, BODY);
      x.fillText(l[0], W - M - tw + 24, ly);
      x.textAlign = 'right';
      x.fillStyle = INK;
      x.fillText(l[1] + ' บาท', W - M - 24, ly);
      ly += 34;
    });
    x.textAlign = 'left';
    x.fillStyle = INK2;
    font(x, 600, 22, BODY);
    x.fillText('รวมทั้งสิ้น', W - M - tw + 24, ly + 4);
    x.textAlign = 'right';
    if (T.has) {
      x.fillStyle = '#b8491a';
      fitText(x, C.money(T.grand) + ' บาท', W - M - 24, ly + 56, tw - 48, 600, 46, DISP);
      x.fillStyle = INK2;
      fitText(x, '(' + C.bahtText(T.grand) + ')', W - M - 24, ly + 90, tw - 48, 400, 18, BODY);
    } else {
      x.fillStyle = INK3;
      font(x, 500, 26, BODY);
      x.fillText('ยังไม่ได้ใส่ราคา', W - M - 24, ly + 56);
    }
    ly += 128;
    dep.forEach(function (l) {
      x.textAlign = 'left';
      x.fillStyle = INK2;
      font(x, 500, 21, BODY);
      x.fillText(l[0], W - M - tw + 24, ly);
      x.textAlign = 'right';
      x.fillStyle = INK;
      font(x, 600, 22, BODY);
      x.fillText(l[1] + ' บาท', W - M - 24, ly);
      ly += 32;
    });
    x.textAlign = 'left';
    x.fillStyle = INK;
    font(x, 600, 22, BODY);
    x.fillText('หมายเหตุ', M, sy + 32);
    x.fillStyle = INK2;
    var notes = [];
    if (st.bill.due) notes.push('นัดรับงาน: ' + C.dueText(st.bill.due));
    if (st.bill.note) notes.push(st.bill.note);
    notes.push('ภาพจำลองเพื่อประกอบการตัดสินใจ สีและรายละเอียดจริงอาจต่างจากหน้าจอเล็กน้อย');
    notes.push('กรุณาตรวจข้อความ ตัวสะกด เบอร์โทร และขนาด ก่อนยืนยันสั่งผลิต');
    var sc = steelNow();
    if (sc) {
      var so2 = sc.opts;
      notes.push('โครงเหล็กกล่อง ' + C.tubeText(so2) + ' · ' + (so2.cut === 'miter' ? 'ตัดเข้ามุม 45°' : 'ตัดตรงชน') + (sc.kind === 'stand' ? ' · สูงรวม ' + C.fmtCm(so2.total) + ' ซม. · ฐานลึก ' + C.fmtCm(so2.depth) + ' ซม.' : '') + ' · เหล็กรวม ' + C.fmtCm(sc.total) + ' ซม.');
    } else notes.push(t.name + ': ' + C.depthText(st.type));
    notes.slice(0, 6).forEach(function (n, i) {
      fitText(x, '• ' + n, M, sy + 66 + i * 32, CW - tw - 40, 400, 18, BODY);
    });

    // ช่องเซ็นชื่อ
    var gy = H - 220;
    [['ผู้เสนอราคา', M], ['ลูกค้า / ผู้อนุมัติ', W - M - 400]].forEach(function (s2) {
      x.strokeStyle = INK3;
      x.lineWidth = 1.5;
      x.beginPath();
      x.moveTo(s2[1], gy);
      x.lineTo(s2[1] + 400, gy);
      x.stroke();
      x.textAlign = 'center';
      x.fillStyle = INK2;
      font(x, 500, 21, BODY);
      x.fillText(s2[0], s2[1] + 200, gy + 34);
      x.fillStyle = INK3;
      font(x, 400, 19, BODY);
      x.fillText('วันที่ ......../......../........', s2[1] + 200, gy + 68);
    });

    // ท้ายกระดาษ
    x.fillStyle = LINE;
    x.fillRect(M, H - 82, CW, 2);
    x.textAlign = 'center';
    x.fillStyle = INK3;
    font(x, 400, 18, BODY);
    var foot = [st.shopName.trim(), st.shopPhone.trim() ? C.phoneText(st.shopPhone) : '', 'จัดทำด้วย นัดพอน Sign Mockup'].filter(Boolean).join('  ·  ');
    x.fillText(foot, W / 2, H - 46);
    return c;
  }

  /* ไฟล์พิมพ์บัตร: PDF จัดเต็มแผ่น (เผื่อตัดตก 2 มม. + เส้นตัด) เลขรันเป็นตัวอักษรเวกเตอร์ทุกใบ */
  function buildPrint() {
    var plan = C.printPlan(st.w, st.h, quoteNow().qty, st.sheet, st.run);
    if (!plan.perSheet) return Promise.reject(new Error('too_big'));
    var d = currentDesign();
    var r = runNow();
    var L = plan.layout;
    // รูปบัตร 300 dpi (ใหญ่สุด 4000 จุด) รวมตัดตก ใส่คำนำหน้าไว้ในรูป ตัวเลขไปใส่ใน PDF
    var k = Math.min(300 / 2.54, 4000 / (Math.max(st.w, st.h) + 2 * L.bleed));
    var split = st.mode !== 'image';
    var art = R.cardArt(d, st.w, st.h, st.fit, r, { k: k, bleed: L.bleed, digits: false, split: split });
    // ภาพตัวอย่างแผ่นแรก (ย่อ) มีเลขจริงทุกช่อง
    var prev = R.sheetPreview(plan, function (i) {
      return R.cardArt(d, st.w, st.h, st.fit, r, { k: (900 / L.sw) * 1.25, bleed: L.bleed, index: i, split: split }).canvas;
    }, 900);
    return toBlob(art.canvas, 'image/jpeg', 0.93).then(function (jpg) {
      return blobBytes(jpg).then(function (bytes) {
        var pdf = C.pdfRun({
          sheet: plan.sheet,
          layout: L,
          card: { w: st.w, h: st.h },
          art: { jpeg: bytes, pw: art.canvas.width, ph: art.canvas.height },
          qty: plan.qty,
          run: r,
          labels: art.labels,
          color: r ? r.color : '#000000',
          note: C.fmtCm(st.w) + ' x ' + C.fmtCm(st.h) + ' cm  ' + plan.perSheet + '-up  bleed 2 mm',
        });
        return toBlob(prev, 'image/jpeg', 0.88).then(function (pj) {
          return { blob: new Blob([pdf], { type: 'application/pdf' }), name: fileName('print', 'pdf'), preview: pj, canvas: prev, plan: plan };
        });
      });
    });
  }

  /* ไฟล์ HTML พรีวิว 3 มิติ: โมเดล .glb + ตัวดู (three.js) + รูปตัวอย่าง + โลโก้ ฝังในไฟล์เดียว
   * ลูกค้าเปิดไฟล์ในเบราว์เซอร์ได้ทุกเครื่อง ไม่ต้องลงแอป ไม่ต้องต่อเน็ต */
  function fetchText(path) {
    return fetch(path).then(function (r) {
      if (!r.ok) throw new Error(path);
      return r.text();
    });
  }
  function b64of(dataUrl) {
    return String(dataUrl).slice(String(dataUrl).indexOf(',') + 1);
  }
  function logoDataUrl() {
    if (st.logo && /^data:image\//.test(st.logo)) return Promise.resolve(st.logo);
    if (!st.brandLogo) return Promise.resolve('');
    return fetch(BRAND.mark)
      .then(function (r) {
        return r.blob();
      })
      .then(blobToDataUrl)
      .catch(function () {
        return '';
      });
  }
  function buildHtml() {
    var poster = mockupCanvas(0.6, false);
    var title = C.TYPES[st.type].name;
    return Promise.all([
      stage.exportGLB().then(function (ab) {
        return blobToDataUrl(new Blob([ab], { type: 'model/gltf-binary' }));
      }),
      fetchText('vendor/viewer3d.standalone.js'),
      fetchText('viewer3d.css'),
      toBlob(poster, 'image/jpeg', 0.82).then(blobToDataUrl),
      logoDataUrl(),
    ]).then(function (a) {
      var html = C.viewerFile({
        title: title,
        size: C.sizeText(st.w, st.h),
        customer: customer.trim(),
        shop: st.shopName.trim(),
        phone: st.shopPhone.trim(),
        logo: a[4],
        css: a[2],
        viewerJs: a[1],
        glb: b64of(a[0]),
        poster: b64of(a[3]),
        name: fileName('sign3d', 'png').replace(/\.png$/, ''),
      });
      var blob = new Blob([html], { type: 'text/html' });
      return {
        blob: blob,
        name: fileName('sign3d', 'html'),
        preview: null,
        canvas: null,
        info: 'ไฟล์ HTML พรีวิว 3 มิติ · ' + kb(blob.size) + ' · ' + title + ' ' + C.sizeText(st.w, st.h) + ' · เปิดในเบราว์เซอร์ได้ทุกเครื่อง',
      };
    });
  }

  /* ---------- แบบให้ลูกค้าเลือก: เก็บภาพจำลอง 2 แบบ แล้วทำหน้าเทียบ (A4 แนวตั้ง แบบละครึ่งหน้า) ----------
   * ภาพที่เก็บไว้อยู่ใน IndexedDB ('opt-cmp-0/1') ปิดแอป/อัปเดตรุ่นแล้วยังอยู่ */
  var cmp = [null, null]; // { img, blob, title, size, extra, price, scene }
  function cmpMeta() {
    var q = quoteNow();
    var extra = [];
    var sc = C.SCENES[st.scene];
    if (sc && st.scene !== 'photo') extra.push('ฉาก' + sc.name);
    if (st.mode === 'text' && R.themes()[st.text.theme]) extra.push('ชุดสี ' + R.themes()[st.text.theme].name);
    if (q.qty > 1) extra.push(q.qty + ' ' + unitWord());
    if (runNow()) extra.push('เลข ' + C.runText(st.run, 0) + (q.qty > 1 ? '–' + C.runText(st.run, q.qty - 1) : ''));
    return {
      title: C.TYPES[st.type].name,
      size: C.sizeText(st.w, st.h),
      extra: extra.join(' · '),
      price: q.has ? C.baht(q.total) + ' บาท' : '',
    };
  }
  function cmpShow(i) {
    var c = cmp[i];
    var th = $('cmpThumb' + i);
    th.classList.toggle('has', !!c);
    th.style.backgroundImage = c ? 'url(' + c.url + ')' : '';
    $('cmpInfo' + i).textContent = c ? [c.title + ' ' + c.size, c.price].filter(Boolean).join(' · ') : 'ยังว่าง';
    $('cmpSet' + i).textContent = (c ? 'เปลี่ยนเป็นภาพนี้' : 'เก็บภาพนี้เป็นแบบที่ ' + (i + 1));
    $('cmpDel' + i).hidden = !c;
    $('cmpMake').disabled = !(cmp[0] || cmp[1]);
  }
  function cmpLoadImg(blob) {
    return new Promise(function (ok, bad) {
      var im = new Image();
      im.onload = function () {
        ok(im);
      };
      im.onerror = bad;
      im.src = URL.createObjectURL(blob);
    });
  }
  function cmpPut(i, rec) {
    if (cmp[i] && cmp[i].url) URL.revokeObjectURL(cmp[i].url);
    cmp[i] = rec;
    if (rec) rec.url = rec.img.src;
    cmpShow(i);
  }
  [0, 1].forEach(function (i) {
    $('cmpSet' + i).addEventListener('click', function () {
      var c = mockupCanvas(1, false);
      var meta = cmpMeta();
      toBlob(c, 'image/jpeg', 0.9)
        .then(function (blob) {
          return cmpLoadImg(blob).then(function (img) {
            cmpPut(i, Object.assign({ img: img, blob: blob }, meta));
            toast('เก็บเป็นแบบที่ ' + (i + 1) + ' แล้ว' + (cmp[1 - i] ? ' — กด “ทำหน้าเทียบ 2 แบบ” ได้เลย' : ' — ปรับงานแล้วเก็บเป็นแบบที่ ' + (2 - i)));
            if (NS.jobs) NS.jobs.put(Object.assign({ id: 'opt-cmp-' + i, at: Date.now(), blob: blob }, meta)).catch(function () {});
          });
        })
        .catch(function () {
          toast('เก็บภาพไม่สำเร็จ ลองใหม่อีกครั้ง');
        });
    });
    $('cmpDel' + i).addEventListener('click', function () {
      cmpPut(i, null);
      if (NS.jobs) NS.jobs.del('opt-cmp-' + i).catch(function () {});
    });
  });
  $('cmpMake').addEventListener('click', function () {
    openExport('compare');
  });
  function loadCmp() {
    cmpShow(0);
    cmpShow(1);
    if (!NS.jobs) return;
    [0, 1].forEach(function (i) {
      NS.jobs
        .get('opt-cmp-' + i)
        .then(function (r) {
          if (!r || !r.blob) return;
          return cmpLoadImg(r.blob).then(function (img) {
            cmpPut(i, { img: img, blob: r.blob, title: r.title || '', size: r.size || '', extra: r.extra || '', price: r.price || '' });
          });
        })
        .catch(function () {});
    });
  }
  // หน้าเทียบ: หัวร้าน · "แบบให้เลือก" · แบบละครึ่งหน้า (ป้ายเลข 1/2 + ภาพ + ชนิด ขนาด ราคา) · ช่องให้ลูกค้าติ๊กเลือก
  function comparePage() {
    var W = 1240;
    var H = 1754;
    var M = 70;
    var CW = W - M * 2;
    var NAVY = '#1f2a4d';
    var ORANGE = '#d9622b';
    var INK = '#18203a';
    var INK2 = '#565e75';
    var INK3 = '#868c9e';
    var LINE = '#e0dcd4';
    var c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    var x = c.getContext('2d');
    x.fillStyle = '#ffffff';
    x.fillRect(0, 0, W, H);
    // หัวกระดาษ
    var qLogo = logoImg || (st.brandLogo ? brandImg.full : null);
    var shopLine = [st.shopName.trim(), st.shopPhone.trim() ? C.phoneText(st.shopPhone) : ''].filter(Boolean).join('  ·  ');
    x.textBaseline = 'alphabetic';
    x.textAlign = 'left';
    if (qLogo) {
      var lh = 92;
      var lw = (lh * (qLogo.naturalWidth || qLogo.width)) / (qLogo.naturalHeight || qLogo.height);
      if (lw > 480) {
        lh = (lh * 480) / lw;
        lw = 480;
      }
      x.drawImage(qLogo, M - 4, 34 + (92 - lh) / 2, lw, lh);
      x.fillStyle = INK2;
      if (shopLine) fitText(x, shopLine, M, 156, 560, 400, 21, BODY);
    } else {
      x.fillStyle = NAVY;
      fitText(x, st.shopName.trim() || 'ร้านป้าย', M, 96, 560, 600, 46, DISP);
      x.fillStyle = INK2;
      if (st.shopPhone.trim()) fitText(x, C.phoneText(st.shopPhone), M, 138, 560, 400, 24, BODY);
    }
    x.textAlign = 'right';
    x.fillStyle = NAVY;
    font(x, 600, 52, DISP);
    x.fillText('แบบให้เลือก', W - M, 92);
    x.fillStyle = INK2;
    fitText(x, (customer.trim() ? 'ลูกค้า: ' + customer.trim() + ' · ' : '') + C.thaiDate(new Date()), W - M, 132, 560, 500, 22, BODY);
    x.fillStyle = NAVY;
    x.fillRect(M, 176, CW, 5);
    x.fillStyle = ORANGE;
    x.fillRect(M, 176, 150, 5);
    // 2 แบบ
    var top = 206;
    var foot = 196;
    var bh = (H - top - foot - 24) / 2;
    [0, 1].forEach(function (i) {
      var s = cmp[i];
      var by = top + i * (bh + 24);
      // กรอบ
      x.fillStyle = '#f7f5f1';
      roundRect(x, M, by, CW, bh, 22);
      x.fill();
      // ป้ายเลขแบบ
      x.fillStyle = i ? ORANGE : NAVY;
      x.beginPath();
      x.arc(M + 46, by + 48, 28, 0, Math.PI * 2);
      x.fill();
      x.fillStyle = '#ffffff';
      x.textAlign = 'center';
      font(x, 600, 32, DISP);
      x.fillText(String(i + 1), M + 46, by + 60);
      x.textAlign = 'left';
      x.fillStyle = INK;
      font(x, 600, 32, DISP);
      x.fillText('แบบที่ ' + (i + 1), M + 90, by + 60);
      if (!s) {
        x.fillStyle = INK3;
        font(x, 400, 24, BODY);
        x.textAlign = 'center';
        x.fillText('— ยังไม่ได้เก็บแบบนี้ —', W / 2, by + bh / 2);
        x.textAlign = 'left';
        return;
      }
      if (s.price) {
        x.textAlign = 'right';
        x.fillStyle = ORANGE;
        font(x, 600, 34, DISP);
        x.fillText(s.price, M + CW - 28, by + 62);
        x.textAlign = 'left';
      }
      // ภาพ (พอดีกรอบ ไม่ตัด)
      var ix = M + 24;
      var iy = by + 92;
      var iw = CW - 48;
      var ih = bh - 92 - 78;
      var r = C.containRect(s.img.naturalWidth || s.img.width, s.img.naturalHeight || s.img.height, iw, ih);
      x.save();
      roundRect(x, ix + r.dx, iy + r.dy, r.dw, r.dh, 14);
      x.clip();
      x.drawImage(s.img, ix + r.dx, iy + r.dy, r.dw, r.dh);
      x.restore();
      x.fillStyle = INK;
      fitText(x, s.title + '  ' + s.size, M + 28, by + bh - 42, CW - 56, 600, 27, DISP);
      x.fillStyle = INK2;
      if (s.extra) fitText(x, s.extra, M + 28, by + bh - 12, CW - 56, 400, 20, BODY);
    });
    // ให้ลูกค้าเลือก
    var fy = H - foot + 34;
    x.fillStyle = INK;
    font(x, 600, 28, DISP);
    x.fillText('ลูกค้าเลือก', M, fy + 6);
    [0, 1].forEach(function (i) {
      var bx = M + 190 + i * 230;
      x.strokeStyle = INK2;
      x.lineWidth = 2.5;
      roundRect(x, bx, fy - 22, 32, 32, 6);
      x.stroke();
      x.fillStyle = INK;
      font(x, 500, 26, BODY);
      x.fillText('แบบที่ ' + (i + 1), bx + 46, fy + 4);
    });
    x.fillStyle = INK2;
    font(x, 400, 21, BODY);
    x.fillText('หรือพิมพ์ตอบ “แบบ 1” / “แบบ 2” ทาง LINE ได้เลย · อยากแก้ตรงไหนบอกร้านได้', M, fy + 54);
    x.fillStyle = LINE;
    x.fillRect(M, H - 82, CW, 2);
    x.textAlign = 'center';
    x.fillStyle = INK3;
    font(x, 400, 18, BODY);
    x.fillText([st.shopName.trim(), st.shopPhone.trim() ? C.phoneText(st.shopPhone) : '', 'ภาพจำลอง สีจริงอาจต่างจากหน้าจอเล็กน้อย'].filter(Boolean).join('  ·  '), W / 2, H - 46);
    return c;
  }
  function roundRect(x, rx, ry, rw, rh, rr) {
    x.beginPath();
    x.moveTo(rx + rr, ry);
    x.arcTo(rx + rw, ry, rx + rw, ry + rh, rr);
    x.arcTo(rx + rw, ry + rh, rx, ry + rh, rr);
    x.arcTo(rx, ry + rh, rx, ry, rr);
    x.arcTo(rx, ry, rx + rw, ry, rr);
    x.closePath();
  }
  /* ---------- ใบสั่งผลิต (ส่งช่าง): สเปกงาน วัสดุ งานตกแต่ง ไฟล์ ความละเอียด นัดรับ ขั้นตอน ---------- */
  function specRows() {
    var t = C.TYPES[st.type];
    var b = bt();
    var q = quoteNow();
    var rows = [];
    rows.push(['ชนิดงาน', t.name + (t.mine ? ' (ชนิดของร้าน แบบ' + C.TYPES[b].name + ')' : '')]);
    rows.push(['ขนาดงาน', C.sizeText(st.w, st.h) + (t.unit === 'sqm' ? ' · พื้นที่ ' + C.fmtArea(st.w, st.h) : '')]);
    rows.push(['จำนวน', q.qty + ' ' + unitWord()]);
    rows.push(['วัสดุ / โครงสร้าง', C.depthText(st.type)]);
    var fin = '';
    var sc = steelNow();
    if (b === 'vinyl') fin = 'เจาะตาไก่ ' + C.eyelets(st.w, st.h).length + ' ตัว (ห่างขอบ 2.5 ซม. ระยะห่าง ≤ 50 ซม.)';
    else if (b === 'acrylic') fin = 'เจาะรูหมุดสแตนเลส 4 มุม ลอยจากผนัง 2.5 ซม.';
    else if (b === 'lightbox') fin = 'กล่องอะลูมิเนียม 12 ซม. + ไฟ LED ด้านใน + ขอบ 4 ซม.';
    else if (b === 'foam') fin = 'พิมพ์ติดโฟมบอร์ด 5 มม. ตัดขอบตรง';
    else if (b === 'sticker') fin = 'พิมพ์สติ๊กเกอร์ เคลือบ ไดคัทตามขนาด';
    else if (b === 'cnc') fin = (C.cncPosts(st.steel) ? 'เสาเหล็กกล่อง 10×10 ซม. 2 ต้น + ฐานปูน ขอบล่างสูง 80 ซม.' : 'ติดผนัง (ขายึดหลังแผ่น)') + ' · อักษรนูนตัด CNC 1.5 ซม.';
    else if (b === 'rollup' || b === 'xstand') fin = 'ขาตั้ง + กระเป๋าใส่';
    else if (b === 'card') {
      var r = runNow();
      fin = r ? 'รันนัมเบอร์ ' + C.runText(r, 0) + '–' + C.runText(r, q.qty - 1) + (C.runSlots(r, st.w, st.h).stub ? ' · ต้นขั้ว ' + C.fmtCm(r.stub) + ' ซม. + ปรุ' : '') + ' · สีเลข ' + r.color : 'ตัดตามขนาด (ไม่มีเลขรัน)';
    } else fin = C.lookNote(b, st.look);
    var shn2 = C.shapeNote(st.type, st.shape);
    if (shn2) fin = shn2 + (fin ? ' · ' + fin : '');
    if (sc) fin = (fin ? fin + ' · ' : '') + 'เหล็กกล่อง ' + C.tubeText(sc.opts) + ' ' + sc.pieces + ' ชิ้น รวม ' + C.fmtCm(sc.total) + ' ซม. (' + (sc.opts.cut === 'miter' ? 'เข้ามุม 45°' : 'ตัดตรงชน') + ')';
    if (fin) rows.push(['งานตกแต่ง / อุปกรณ์', fin]);
    if (st.mode === 'image' && imgDesign) {
      var m = /(\d+)\D+(\d+)/.exec(imgDesign.px || '');
      rows.push(['ไฟล์งาน', (imgDesign.name || 'ไฟล์รูป') + (imgDesign.px ? ' (' + imgDesign.px + ')' : '') + ' · ' + (st.fit === 'contain' ? 'วางพอดี เว้นขอบ' : 'ขยายเต็มป้าย')]);
      if (m) {
        var v = C.dpiVerdict(C.printDpi(+m[1], +m[2], st.w, st.h, st.fit), st.w, st.h);
        rows.push([v.ok ? 'ความละเอียดตอนพิมพ์' : '⚠ ความละเอียดตอนพิมพ์', v.text]);
      }
      if (C.ratioMismatch(st.w, st.h, imgDesign.w, imgDesign.h)) rows.push(['⚠ ตรวจไฟล์', 'สัดส่วนรูปไม่ตรงขนาดงาน — ' + (st.fit === 'contain' ? 'จะมีขอบเว้นว่าง' : 'ขอบรูปจะถูกตัด')]);
    } else {
      var th = R.themes()[st.text.theme];
      rows.push(['ไฟล์งาน', 'พิมพ์ข้อความในแอป' + (th ? ' (ชุดสี ' + th.name + ')' : '') + ' — ส่งออกไฟล์ JPG/PNG/ไฟล์พิมพ์จากแอป']);
    }
    if (st.bill.due) rows.push(['นัดรับงาน', C.dueText(st.bill.due)]);
    return rows;
  }
  function jobPage(mock) {
    var W = 1240;
    var H = 1754;
    var M = 70;
    var CW = W - M * 2;
    var NAVY = '#1f2a4d';
    var ORANGE = '#d9622b';
    var INK = '#18203a';
    var INK2 = '#565e75';
    var INK3 = '#868c9e';
    var LINE = '#e0dcd4';
    var c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    var x = c.getContext('2d');
    var now = new Date();
    x.fillStyle = '#ffffff';
    x.fillRect(0, 0, W, H);
    x.textBaseline = 'alphabetic';
    // หัวกระดาษ
    x.textAlign = 'left';
    x.fillStyle = NAVY;
    font(x, 600, 50, DISP);
    x.fillText('ใบสั่งผลิต', M, 96);
    x.fillStyle = INK3;
    font(x, 500, 20, BODY);
    x.fillText('JOB ORDER · ส่งช่าง / ฝ่ายผลิต', M, 130);
    x.textAlign = 'right';
    x.fillStyle = INK;
    font(x, 600, 26, BODY);
    x.fillText('เลขที่ ' + C.quoteNo(now).replace(/^Q/, 'J'), W - M, 80);
    x.fillStyle = INK2;
    font(x, 500, 22, BODY);
    x.fillText('สั่งงาน ' + C.thaiDate(now), W - M, 114);
    if (st.bill.due) {
      x.fillStyle = '#b8491a';
      font(x, 600, 24, BODY);
      x.fillText('นัดรับ ' + C.dueText(st.bill.due), W - M, 148);
    }
    x.fillStyle = NAVY;
    x.fillRect(M, 172, CW, 5);
    x.fillStyle = ORANGE;
    x.fillRect(M, 172, 150, 5);
    // ลูกค้า
    x.textAlign = 'left';
    x.fillStyle = INK3;
    font(x, 500, 21, BODY);
    x.fillText('ลูกค้า', M, 224);
    x.fillStyle = INK;
    fitText(x, customer.trim() || '—', M + 90, 226, CW - 90, 600, 30, DISP);
    // ภาพงาน
    var by = 252;
    var bh = 520;
    x.fillStyle = '#f3f1ec';
    rrect(x, M, by, CW, bh, 18);
    x.fill();
    var s0 = Math.min((CW - 24) / mock.width, (bh - 24) / mock.height);
    var iw = mock.width * s0;
    var ih = mock.height * s0;
    x.save();
    rrect(x, M + (CW - iw) / 2, by + (bh - ih) / 2, iw, ih, 10);
    x.clip();
    x.drawImage(mock, M + (CW - iw) / 2, by + (bh - ih) / 2, iw, ih);
    x.restore();
    // สเปก
    var y = by + bh + 26;
    var rows = specRows();
    rows.forEach(function (r, i) {
      var warn = /^⚠/.test(r[0]);
      if (i % 2 === 0) {
        x.fillStyle = '#f7f5f1';
        x.fillRect(M, y, CW, 46);
      }
      x.textAlign = 'left';
      x.fillStyle = warn ? '#b8491a' : INK3;
      font(x, 500, 20, BODY);
      x.fillText(r[0], M + 16, y + 31);
      x.fillStyle = warn ? '#b8491a' : INK;
      fitText(x, r[1], M + 290, y + 31, CW - 306, 500, 22, BODY);
      y += 46;
    });
    // หมายเหตุถึงช่าง
    y += 18;
    x.fillStyle = INK;
    font(x, 600, 22, BODY);
    x.fillText('หมายเหตุถึงช่าง', M, y + 6);
    x.strokeStyle = LINE;
    x.lineWidth = 2;
    rrect(x, M, y + 20, CW, 92, 12);
    x.stroke();
    x.fillStyle = INK2;
    if (st.bill.work) fitText(x, st.bill.work, M + 18, y + 72, CW - 36, 500, 22, BODY);
    // ขั้นตอนผลิต (ติ๊ก + ชื่อ/วันที่)
    y += 140;
    var steps = ['ตรวจไฟล์', 'พิมพ์ / ตัด', 'เคลือบ / ประกอบ', 'QC ตรวจงาน', 'ส่งมอบ / ติดตั้ง'];
    var sw = CW / steps.length;
    steps.forEach(function (stp, i) {
      var sx = M + i * sw;
      x.strokeStyle = INK2;
      x.lineWidth = 2.5;
      rrect(x, sx, y, 30, 30, 6);
      x.stroke();
      x.fillStyle = INK;
      font(x, 600, 21, BODY);
      x.textAlign = 'left';
      fitText(x, stp, sx + 40, y + 23, sw - 50, 600, 21, BODY);
      x.strokeStyle = LINE;
      x.lineWidth = 1.5;
      x.beginPath();
      x.moveTo(sx, y + 74);
      x.lineTo(sx + sw - 16, y + 74);
      x.stroke();
      x.fillStyle = INK3;
      font(x, 400, 16, BODY);
      x.fillText('ชื่อ / วันที่', sx, y + 96);
    });
    // ท้ายกระดาษ
    x.fillStyle = LINE;
    x.fillRect(M, H - 82, CW, 2);
    x.textAlign = 'center';
    x.fillStyle = INK3;
    font(x, 400, 18, BODY);
    x.fillText([st.shopName.trim(), st.shopPhone.trim() ? C.phoneText(st.shopPhone) : '', 'ใบสั่งผลิตภายในร้าน — ไม่ใช่ใบเสร็จ'].filter(Boolean).join('  ·  '), W / 2, H - 46);
    return c;
  }
  function buildJob() {
    var page = jobPage(mockupCanvas(1.2, false));
    return toBlob(page, 'image/jpeg', 0.9).then(function (jpg) {
      return blobBytes(jpg).then(function (bytes) {
        return { blob: new Blob([C.pdfFromJpeg(bytes, page.width, page.height)], { type: 'application/pdf' }), name: fileName('joborder', 'pdf'), preview: jpg, canvas: page };
      });
    });
  }
  function buildCompare() {
    if (!cmp[0] && !cmp[1]) return Promise.reject(new Error('empty'));
    var page = comparePage();
    return toBlob(page, 'image/jpeg', 0.9).then(function (jpg) {
      if (st.cmpOut !== 'pdf') return { blob: jpg, name: fileName('choose', 'jpg'), preview: jpg, canvas: page };
      return blobBytes(jpg).then(function (bytes) {
        return { blob: new Blob([C.pdfFromJpeg(bytes, page.width, page.height)], { type: 'application/pdf' }), name: fileName('choose', 'pdf'), preview: jpg, canvas: page };
      });
    });
  }

  function buildExport(fmt) {
    if (fmt === 'compare') return buildCompare();
    if (fmt === 'job') return buildJob();
    if (fmt === 'print') return buildPrint();
    if (fmt === 'html') return buildHtml();
    if (fmt === 'reel') return buildReel();
    if (fmt === 'glb') {
      return stage.exportGLB().then(function (ab) {
        var blob = new Blob([ab], { type: 'model/gltf-binary' });
        return { blob: blob, name: fileName('sign3d', 'glb'), preview: null, canvas: null };
      });
    }
    return new Promise(function (resolve) {
      // ให้หน้าจอวาด "กำลังเตรียมไฟล์" ก่อนเริ่มงานหนัก
      setTimeout(resolve, 30);
    }).then(function () {
      if (fmt === 'pdf') {
        var page = quotePage(mockupCanvas(1.2, false));
        return toBlob(page, 'image/jpeg', 0.9).then(function (jpg) {
          return blobBytes(jpg).then(function (bytes) {
            var pdf = new Blob([C.pdfFromJpeg(bytes, page.width, page.height)], { type: 'application/pdf' });
            return { blob: pdf, name: fileName('quote', 'pdf'), preview: jpg, canvas: page };
          });
        });
      }
      var c = mockupCanvas(1.5, true);
      var png = fmt === 'png';
      return toBlob(c, png ? 'image/png' : 'image/jpeg', 0.92).then(function (b) {
        return { blob: b, name: fileName('mockup', png ? 'png' : 'jpg'), preview: b, canvas: c };
      });
    });
  }
  /* ---------- วิดีโอ Reels (แนวตั้ง 9:16) ----------
   * 3 มิติ: กล้องส่ายรอบป้าย ซูมเข้านิด ๆ · ป้ายมีไฟ: กลางวัน → ค่อย ๆ เป็นกลางคืนกลางคลิป
   * 2 มิติ/รูปถ่าย: ภาพเต็มกว้าง ซูมช้า ๆ บนฉากหลังเบลอ · มือจับ (รูปถ่ายจริง) 2 ใบ: สองมือ → มือซ้าย → มือขวา
   * ทับด้วยชื่อร้าน ชนิด ขนาด ราคา + หน้าปิดท้ายเบอร์โทร (reels.js) */
  function litNow() {
    var b = bt();
    var L = st.look;
    return b === 'lightbox' || b === 'neon' || (b === 'letters' && L.light !== 'none') || ((b === 'blade' || b === 'billboard') && L.lit);
  }
  function reelInfo() {
    var q = quoteNow();
    var T = C.billTotals(q, st.bill);
    var price = T.plain ? (q.has ? 'ราคา ' + C.baht(q.total) + ' บาท' : '') : T.has ? 'ราคา ' + C.money(T.grand) + ' บาท' : '';
    var note = [C.shapeNote(st.type, st.shape), bt() === 'window' ? C.FILMS[st.look.film] : C.lookNote(bt(), st.look)].filter(Boolean).join(' · ');
    return {
      shop: st.shopName.trim(),
      phone: st.shopPhone.trim() ? C.phoneText(st.shopPhone) : '',
      title: C.TYPES[st.type].name,
      size: C.sizeText(st.w, st.h),
      price: price,
      note: note,
      logo: logoImg || (st.brandLogo ? brandImg.mark : null),
    };
  }
  function fontsReady() {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    return Promise.all([document.fonts.load('600 66px Kanit'), document.fonts.load('700 84px Kanit'), document.fonts.load('500 44px "IBM Plex Sans Thai"')]).catch(function () {});
  }
  function reel3d(RL) {
    var base = Object.assign({}, lastStage);
    var lit = litNow() && !st.night;
    var nightOn = !!st.night;
    var setNight = function (n) {
      if (n === nightOn) return;
      nightOn = n;
      stage.update(Object.assign({}, base, { night: n }));
    };
    stage.beginVideo(RL.W, RL.H);
    return {
      frame: function (x, i, N) {
        var t = i / (N - 1);
        var k = lit ? RL.ease((t - 0.42) / 0.14) : 0;
        if (k < 1) {
          setNight(false || !!st.night);
          x.drawImage(stage.videoFrame(t), 0, 0, RL.W, RL.H);
        }
        if (k > 0) {
          setNight(true);
          x.globalAlpha = k;
          x.drawImage(stage.videoFrame(t), 0, 0, RL.W, RL.H);
          x.globalAlpha = 1;
        }
      },
      done: function () {
        stage.endVideo();
        if (nightOn !== !!st.night) stage.update(Object.assign({}, base, { night: !!st.night }));
        draw();
      },
    };
  }
  function reel2d(RL) {
    var views = st.scene === 'handPhoto' && handReady() && handPhoto.cards.length > 1 ? ['both', 'left', 'right'] : [null];
    var shots = views.map(function (v) {
      var c = document.createElement('canvas');
      var over = { info: false, dims: false, handEdit: false, aspect: 'portrait' };
      if (v) over.handView = v;
      R.render(c, renderState(over), { scale: 1.2, preview: false });
      return c;
    });
    var span = RL.SEC - RL.END + 0.5; // ภาพสุดท้ายโชว์ก่อนหน้าปิดท้าย
    return {
      frame: function (x, i) {
        var sec = i / RL.FPS;
        var n = shots.length;
        var seg = Math.min(0.9999, sec / span) * n;
        var k = Math.min(n - 1, Math.floor(seg));
        var local = seg - k;
        RL.placeFlat(x, shots[k], 1 + 0.08 * RL.ease(local), 0, 0);
        if (k < n - 1 && local > 0.84) {
          x.globalAlpha = (local - 0.84) / 0.16;
          RL.placeFlat(x, shots[k + 1], 1, 0, 0);
          x.globalAlpha = 1;
        }
      },
      done: function () {},
    };
  }
  function buildReel() {
    var RL = NS.reels;
    if (!RL) return Promise.reject(new Error('reel'));
    var info = reelInfo();
    var N = RL.frames;
    var out = document.createElement('canvas');
    out.width = RL.W;
    out.height = RL.H;
    var x = out.getContext('2d');
    var job = exp.job;
    var src = null;
    return fontsReady()
      .then(function () {
        src = is3d() ? reel3d(RL) : reel2d(RL);
        return RL.encode({
          frames: N,
          fps: RL.FPS,
          draw: function (i) {
            x.globalAlpha = 1;
            src.frame(x, i, N);
            RL.overlay(x, i / RL.FPS, info);
            return out;
          },
          progress: function (p) {
            if (job === exp.job) $('dlStatus').textContent = 'กำลังทำวิดีโอ ' + Math.round(p * 100) + '% — รอสักครู่ ไม่ต้องปิดหน้านี้';
          },
          cancelled: function () {
            return job !== exp.job || !$('exportDlg').open;
          },
        });
      })
      .then(
        function (r) {
          if (src) src.done();
          return { blob: r.blob, name: fileName('reel', r.ext), ext: r.ext, preview: null, canvas: null };
        },
        function (e) {
          if (src) src.done();
          throw e;
        }
      );
  }
  function kb(n) {
    return n >= 1048576 ? (Math.round((n / 1048576) * 10) / 10).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
  }
  var FMT_HINT = {
    jpg: 'มือถือ: กดค้างที่รูปแล้วเลือก “บันทึกรูปภาพ” · คอมพิวเตอร์: คลิกขวาที่รูป หรือกดดาวน์โหลด',
    png: 'PNG คมชัดที่สุด ไม่มีรอยบีบอัด (ไฟล์ใหญ่กว่า JPG) เหมาะกับงานที่มีตัวหนังสือเล็ก',
    pdf: 'ใบเสนอราคา A4 พร้อมภาพจำลอง ราคา และช่องเซ็นชื่อ ส่งทาง LINE หรือสั่งพิมพ์ได้เลย',
    glb: 'กด “สร้างลิงก์ดู 3 มิติ” ส่งลิงก์ให้ลูกค้าเปิดหมุนดูในมือถือได้เลย (ไม่ต้องลงแอป) · หรือดาวน์โหลดไฟล์ .glb เปิดใน 3D Viewer / ส่งทีมออกแบบ',
    print: 'ไฟล์ PDF ส่งโรงพิมพ์/เครื่องพิมพ์: จัดบัตรเต็มแผ่น เผื่อตัดตก 2 มม. มีเส้นตัด เลขรันเรียงทุกใบ',
    job: 'ใบสั่งผลิต A4 สำหรับช่าง: สเปกงาน วัสดุ งานตกแต่ง (ตาไก่/โครงเหล็ก/เลขรัน) ไฟล์ + ความละเอียดตอนพิมพ์ นัดรับ หมายเหตุถึงช่าง และช่องติ๊กขั้นตอนผลิต',
    compare: 'แบบละครึ่งหน้า พร้อมชนิด ขนาด ราคา และช่องให้ลูกค้าติ๊กเลือก — ส่งเข้า LINE ให้ลูกค้าตอบ “แบบ 1” หรือ “แบบ 2”',
    reel: 'วิดีโอแนวตั้ง 9:16 (1080×1920) ยาว 9 วินาที มีชื่อร้าน ขนาด ราคา และหน้าปิดท้ายเบอร์โทร — โพสต์ลง Facebook / Instagram Reels, TikTok, YouTube Shorts ได้เลย · ใส่เพลงในแอปตอนโพสต์',
    html: 'ไฟล์เดียวจบ: ส่งทาง LINE / อีเมล / แฟลชไดรฟ์ ลูกค้าแตะหรือดับเบิลคลิกเปิดในเบราว์เซอร์ (Chrome / Safari / Edge) หมุนดูป้าย 3 มิติได้เลย ไม่ต้องลงแอป ไม่ต้องต่อเน็ต · มีปุ่มบันทึกรูปมุมที่ดู',
  };
  function planText(p) {
    var t = p.perSheet + ' ใบ/แผ่น ' + p.sheet.name + (p.layout.rot ? ' (หมุนบัตร)' : '') + ' · ใช้ ' + p.sheets + ' แผ่น';
    if (p.spare) t += ' (แผ่นสุดท้ายว่าง ' + p.spare + ' ช่อง)';
    if (p.first) t += ' · ' + p.first + (p.qty > 1 ? ' – ' + p.last : '');
    return t;
  }
  function openExport(fmt) {
    if (st.scene === 'photo' && photo && !C.isConvex((lastOut && lastOut.quad) || [])) {
      toast('มุมป้ายไขว้กันอยู่ จัดมุมให้เป็นสี่เหลี่ยมก่อนบันทึก');
      return;
    }
    if (st.scene === 'handPhoto' && handReady() && lastOut && (lastOut.cards || []).some(function (c) { return !C.isConvex(c.q); })) {
      toast('มุมบัตรไขว้กันอยู่ กด “ปรับมุมบัตร” แล้วจัดมุมให้เป็นสี่เหลี่ยมก่อนบันทึก');
      return;
    }
    if ((fmt === 'glb' || fmt === 'html') && !is3d()) fmt = 'jpg';
    if (fmt === 'print' && !isCard()) fmt = 'jpg';
    exp.fmt = fmt;
    if ((fmt === 'jpg' || fmt === 'png') && st.fmt !== fmt) {
      st.fmt = fmt;
      save();
    }
    pressed('#fmtSeg button', 'fmt', fmt);
    $('fmtGlb').hidden = !is3d();
    $('fmtHtml').hidden = !is3d() || inFrame; // หน้าพรีวิวโหลดตัวดูมาฝังไม่ได้
    $('fmtPrint').hidden = !isCard();
    $('sheetBar').hidden = fmt !== 'print';
    $('cmpBar').hidden = fmt !== 'compare';
    pressed('#cmpOutSeg button', 'cout', st.cmpOut);
    pressed('#sheetSeg button', 'sheet', st.sheet);
    $('exportTitle').textContent = fmt === 'reel' ? 'วิดีโอ Reels (แนวตั้ง 9:16)' : fmt === 'pdf' ? 'ใบเสนอราคา' : fmt === 'glb' ? 'ไฟล์ 3 มิติ' : fmt === 'html' ? 'ไฟล์ HTML พรีวิว 3 มิติ' : fmt === 'print' ? 'ไฟล์พิมพ์บัตร' : fmt === 'compare' ? 'แบบให้ลูกค้าเลือก' : fmt === 'job' ? 'ใบสั่งผลิต' : 'รูปพร้อมส่งลูกค้า';
    $('dlHint').textContent = inFrame && fmt !== 'glb' && fmt !== 'html' ? 'มือถือ: กดค้างที่รูปแล้วเลือก “บันทึกรูปภาพ” · คอมพิวเตอร์: คลิกขวาที่รูป แล้วเลือกบันทึกรูป' : FMT_HINT[fmt];
    $('dlStatus').textContent = fmt === 'reel' ? 'กำลังเตรียมวิดีโอ…' : 'กำลังเตรียมไฟล์…';
    if (fmt === 'reel') {
      // ระหว่างทำวิดีโอ ยังไม่มีภาพตัวอย่าง
      $('dlgImg').hidden = true;
      $('dlgFile').hidden = true;
    }
    ['dlShare', 'dlCopy', 'dlSave'].forEach(function (id) {
      $(id).disabled = true;
    });
    var job = ++exp.job;
    if (!$('exportDlg').open) openDialog($('exportDlg'));
    buildExport(fmt)
      .then(function (r) {
        if (job === exp.job) showExport(r);
      })
      .catch(function (e) {
        if (job !== exp.job) return;
        if (fmt === 'reel') {
          $('dlStatus').textContent = e && e.message === 'cancel' ? 'ยกเลิกการทำวิดีโอแล้ว' : 'ทำวิดีโอไม่สำเร็จ — ลองเปิดแอปใน Chrome / Edge / Safari รุ่นใหม่ แล้วลองอีกครั้ง';
          return;
        }
        $('dlStatus').textContent =
          fmt === 'glb' || fmt === 'html' ? 'สร้างไฟล์ 3 มิติไม่สำเร็จ ลองใหม่อีกครั้ง (ไฟล์ HTML ต้องเปิดแอปจากเซิร์ฟเวอร์ร้านอย่างน้อยครั้งแรก)' : fmt === 'print' && e && e.message === 'too_big' ? 'บัตรใหญ่เกินกระดาษนี้ ลองเลือกกระดาษใหญ่ขึ้น' : fmt === 'compare' && e && e.message === 'empty' ? 'ยังไม่ได้เก็บแบบ — ไปขั้น 4 กด “เก็บภาพนี้เป็นแบบที่ 1” ก่อน' : 'บันทึกไฟล์ไม่สำเร็จ ลองลดขนาดรูปที่ใส่แล้วลองใหม่';
      });
  }
  function showExport(r) {
    if (exp.url) URL.revokeObjectURL(exp.url);
    if (exp.purl) URL.revokeObjectURL(exp.purl);
    exp.blob = r.blob;
    exp.name = r.name;
    exp.canvas = r.canvas;
    exp.url = URL.createObjectURL(r.blob);
    exp.purl = r.preview && r.preview !== r.blob ? URL.createObjectURL(r.preview) : '';
    var vid = $('exportVid');
    var isVid = exp.fmt === 'reel';
    $('dlgImg').hidden = !r.preview && !isVid;
    $('dlgFile').hidden = !!r.preview || isVid;
    $('exportImg').hidden = isVid;
    vid.hidden = !isVid;
    if (isVid) {
      vid.src = exp.url;
      vid.play().catch(function () {});
    } else if (vid.getAttribute('src')) {
      vid.pause();
      vid.removeAttribute('src');
      vid.load();
    }
    if (r.preview) $('exportImg').src = exp.purl || exp.url;
    else {
      $('dlgFileName').textContent = r.name;
      $('dlgFileInfo').textContent = r.info || 'ไฟล์ 3 มิติ (glTF Binary) · ' + kb(r.blob.size) + ' · ' + C.TYPES[st.type].name + ' ' + C.sizeText(st.w, st.h);
    }
    var file = new File([r.blob], r.name, { type: r.blob.type });
    var canShare = false;
    try {
      canShare = !!(navigator.canShare && navigator.canShare({ files: [file] }));
    } catch (e) {}
    // เปิดอยู่ในกรอบของเว็บอื่น (พรีวิว) ดาวน์โหลด/แชร์/คัดลอกถูกปิด เหลือกดค้าง/คลิกขวาที่รูป
    $('dlShare').hidden = inFrame || !canShare;
    $('dlCopy').hidden = inFrame || !r.canvas || exp.fmt === 'print' || !(window.ClipboardItem && navigator.clipboard && navigator.clipboard.write);
    if (isVid) $('dlHint').textContent = kb(r.blob.size) + ' · ' + (r.ext === 'mp4' ? 'MP4' : 'WebM (Facebook/TikTok รับได้ · Instagram อาจไม่รับ ลองเปิดแอปใน Chrome/Safari รุ่นใหม่)') + ' — ' + FMT_HINT.reel;
    if (r.plan) $('dlHint').textContent = planText(r.plan) + ' · ' + kb(r.blob.size) + ' — ' + FMT_HINT.print;
    $('dlSave').hidden = inFrame;
    $('dlCopy').textContent = exp.fmt === 'pdf' ? 'คัดลอกเป็นรูป' : 'คัดลอกรูป';
    ['dlShare', 'dlCopy', 'dlSave'].forEach(function (id) {
      $(id).disabled = false;
    });
    $('dlStatus').textContent = inFrame && (exp.fmt === 'glb' || exp.fmt === 'html') ? 'หน้าพรีวิวดาวน์โหลดไฟล์/สร้างลิงก์ไม่ได้ เปิดแอปจริงที่ /sign/ เพื่อใช้งาน' : '';
    $('share3d').hidden = exp.fmt !== 'glb' || inFrame;
    $('linkBox').hidden = true;
    $('mkLink').disabled = false;
    exp.link = '';
  }

  /* ---------- ลิงก์ดู 3 มิติ: อัปโหลดไฟล์ .glb ขึ้นเซิร์ฟเวอร์ร้าน แล้วได้ลิงก์ส่งลูกค้า ---------- */
  // เรียก /sign/api/ping ทุก 3 วิ จนเซิร์ฟเวอร์ตอบ (สูงสุด ms) → true = ตื่นแล้ว
  function wakeServer(ms) {
    var until = Date.now() + ms;
    function once() {
      return fetch('api/ping', { cache: 'no-store' })
        .then(function (r) {
          return r.ok;
        })
        .catch(function () {
          return false;
        })
        .then(function (ok) {
          if (ok) return true;
          if (Date.now() > until) return false;
          return new Promise(function (r) {
            setTimeout(r, 3000);
          }).then(once);
        });
    }
    return once();
  }
  function showLink(url) {
    exp.link = url;
    $('linkUrl').value = url;
    $('linkOpen').href = url;
    $('linkBox').hidden = false;
    $('linkShare').hidden = !navigator.share;
  }
  $('mkLink').addEventListener('click', function () {
    if (exp.fmt !== 'glb' || !exp.blob) return;
    if (exp.link) return showLink(exp.link);
    var btn = $('mkLink');
    if (location.protocol === 'file:') {
      $('dlStatus').textContent = 'เปิดแอปจากไฟล์ในเครื่อง สร้างลิงก์ไม่ได้ — เปิดแอปจริงที่ https://muang-jod-flex-bot.onrender.com/sign/ แล้วกดใหม่';
      return;
    }
    btn.disabled = true;
    $('dlStatus').textContent = 'กำลังสร้างลิงก์…';
    var poster = mockupCanvas(0.5, false);
    Promise.all([blobToDataUrl(exp.blob), toBlob(poster, 'image/jpeg', 0.82).then(blobToDataUrl)])
      .then(function (r) {
        var body = JSON.stringify({
          glb: r[0],
          poster: r[1],
          meta: { title: C.TYPES[st.type].name, size: C.sizeText(st.w, st.h), customer: customer.trim(), shop: st.shopName.trim(), phone: st.shopPhone.trim(), w: st.w, h: st.h },
        });
        var send = function () {
          return fetch('api/share', { method: 'POST', headers: { 'content-type': 'application/json' }, body: body });
        };
        // ส่งไม่ถึงเซิร์ฟเวอร์ (หลับอยู่/กำลังอัปเดตรุ่น) → ปลุกจนตื่น แล้วส่งใหม่อีกครั้ง
        return send().catch(function () {
          if (navigator.onLine === false) throw new Error('ไม่มีอินเทอร์เน็ต');
          $('dlStatus').textContent = 'กำลังปลุกเซิร์ฟเวอร์ร้าน (ไม่ได้ใช้นานจะหลับ หรือกำลังอัปเดตรุ่น) รอสักครู่…';
          return wakeServer(90000).then(function (up) {
            if (!up) throw new Error('ติดต่อเซิร์ฟเวอร์ร้านไม่ได้ ลองใหม่อีกครั้งใน 1–2 นาที');
            $('dlStatus').textContent = 'เซิร์ฟเวอร์พร้อมแล้ว กำลังสร้างลิงก์…';
            return send();
          });
        });
      })
      .then(function (res) {
        return res
          .json()
          .catch(function () {
            return {};
          })
          .then(function (j) {
            if (!res.ok || !j.url) throw new Error(j.message || 'เซิร์ฟเวอร์ไม่ตอบ');
            return j;
          });
      })
      .then(function (j) {
        showLink(j.url);
        $('dlStatus').textContent = 'ได้ลิงก์แล้ว ส่งให้ลูกค้าเปิดหมุนดูในมือถือได้เลย (ลิงก์ใช้ได้ 1 ปี)';
      })
      .catch(function (e) {
        btn.disabled = false;
        $('dlStatus').textContent = 'สร้างลิงก์ไม่สำเร็จ: ' + (navigator.onLine === false ? 'ไม่มีอินเทอร์เน็ต' : e.message || 'ลองใหม่อีกครั้ง');
      });
  });
  $('linkCopy').addEventListener('click', function () {
    var done = function () {
      $('dlStatus').textContent = 'คัดลอกลิงก์แล้ว วางในแชต LINE ได้เลย';
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(exp.link).then(done, function () {
      $('linkUrl').select();
    });
    else $('linkUrl').select();
  });
  $('linkShare').addEventListener('click', function () {
    navigator.share({ title: C.TYPES[st.type].name + ' ' + C.sizeText(st.w, st.h), text: 'ดูป้ายแบบ 3 มิติ หมุนดูได้ทุกมุม', url: exp.link }).catch(function () {});
  });
  $('exportBtn').addEventListener('click', function () {
    openExport(imageFmt());
  });
  $('quoteBtn').addEventListener('click', function () {
    openExport('pdf');
  });
  document.querySelectorAll('#cmpOutSeg button').forEach(function (b) {
    b.addEventListener('click', function () {
      if (st.cmpOut === b.dataset.cout && exp.blob) return;
      st.cmpOut = b.dataset.cout;
      save();
      openExport('compare');
    });
  });
  document.querySelectorAll('#sheetSeg button').forEach(function (b) {
    b.addEventListener('click', function () {
      if (st.sheet === b.dataset.sheet && exp.blob) return;
      st.sheet = b.dataset.sheet;
      save();
      openExport('print');
    });
  });
  document.querySelectorAll('#fmtSeg button').forEach(function (b) {
    b.addEventListener('click', function () {
      if (b.dataset.fmt !== exp.fmt || !exp.blob) openExport(b.dataset.fmt);
    });
  });
  $('dlSave').addEventListener('click', function () {
    if (!exp.url) return;
    var a = document.createElement('a');
    a.href = exp.url;
    a.download = exp.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    $('dlStatus').textContent = 'กำลังดาวน์โหลด ' + exp.name + (exp.fmt === 'jpg' || exp.fmt === 'png' ? ' — ถ้าไม่มีอะไรเกิดขึ้น ให้กดค้าง/คลิกขวาที่รูปเพื่อบันทึก' : '');
  });
  $('dlShare').addEventListener('click', function () {
    if (!exp.blob) return;
    var file = new File([exp.blob], exp.name, { type: exp.blob.type });
    navigator
      .share({ files: [file], title: exp.fmt === 'reel' ? 'วิดีโอป้าย' : exp.fmt === 'pdf' ? 'ใบเสนอราคา' : exp.fmt === 'compare' ? 'แบบให้เลือก' : exp.fmt === 'job' ? 'ใบสั่งผลิต' : 'ภาพจำลองป้าย' })
      .then(function () {
        $('dlStatus').textContent = 'เปิดหน้าแชร์แล้ว';
      })
      .catch(function (e) {
        if (e && e.name === 'AbortError') return;
        $('dlStatus').textContent = 'แชร์ไม่ได้ในเบราว์เซอร์นี้ ใช้ดาวน์โหลด หรือกดค้างที่รูปแทน';
      });
  });
  $('dlCopy').addEventListener('click', function () {
    if (!exp.canvas) return;
    var png = toBlob(exp.canvas, 'image/png');
    navigator.clipboard
      .write([new ClipboardItem({ 'image/png': png })])
      .then(function () {
        $('dlStatus').textContent = 'คัดลอกแล้ว ไปกดวาง (Ctrl+V) ในแชต LINE ได้เลย';
      })
      .catch(function () {
        $('dlStatus').textContent = 'คัดลอกรูปไม่ได้ในเบราว์เซอร์นี้ ใช้ดาวน์โหลดแทน';
      });
  });

  function openDialog(d) {
    if (d.showModal) d.showModal();
    else d.setAttribute('open', '');
  }
  document.querySelectorAll('dialog').forEach(function (d) {
    d.addEventListener('click', function (e) {
      if (e.target === d || (e.target.closest && e.target.closest('[data-close]'))) closeDialog(d);
    });
  });

  function closeDialog(d) {
    if (d.close) d.close();
    else d.removeAttribute('open');
  }

  /* ---------- ค้นหาชนิดป้าย / ฉาก ---------- */
  var KEYWORDS = {
    vinyl: 'vinyl banner ป้ายผ้า ไวนิว ตาไก่ ประตู',
    frame: 'frame โครงเหล็ก ขึงตึง ป้ายโครง',
    foam: 'foam board โฟม ฟิวเจอร์บอร์ด บอร์ด',
    sticker: 'sticker สติกเกอร์ สติ้กเกอร์ ติดกระจก ฟิล์ม ประตู ไดคัท die cut วงกลม มุมมน ฉลาก โลโก้',
    acrylic: 'acrylic อะคริลิก อคริลิค ใส หมุด',
    lightbox: 'lightbox กล่องไฟ ไฟ led กลางคืน',
    stand: 'stand ขาตั้ง โครงเหล็ก เหล็กกล่อง ป้ายตั้ง ตั้งพื้น รายการตัด ตัดเหล็ก โครง เชื่อม',
    cnc: 'cnc ซีเอ็นซี ป้ายโครงการ โครงการ หมู่บ้าน ป้ายหน้าโครงการ อักษรนูน ตัวนูน ตัวอักษร อะลูมิเนียม คอมโพสิต acp ตั้งเสา เสาคู่ ไม่มีเสา ติดผนัง ติดอาคาร',
    letters: 'letters ตัวอักษร ตัวหนังสือ ป้ายตัวอักษร อักษรนูน ตัวอักษรสแตนเลส ตัวอักษรอะคริลิค ตัวอักษรทอง ไฟส่องหลัง halo ไฟ led ติดผนัง หน้าร้าน โลโก้',
    neon: 'neon นีออน ไฟนีออน led flex ป้ายไฟ ป้ายไฟวิ่ง คาเฟ่ ร้านกาแฟ กลางคืน',
    blade: 'blade ป้ายยื่น ป้ายแขวน สองหน้า ป้ายกล่องไฟสองหน้า ตั้งฉาก ยื่นออกจากผนัง',
    flag: 'flag ธง ธงญี่ปุ่น ธงริมทาง ธงหน้าร้าน งานอีเวนต์ ธงโฆษณา',
    backdrop: 'backdrop แบ็คดรอป แบคดรอป ฉากหลัง เวที บูธ ทรัส truss อีเวนต์ งานแต่ง มุมถ่ายรูป',
    billboard: 'billboard บิลบอร์ด ป้ายใหญ่ ริมถนน ป้ายโฆษณา เสาเดี่ยว ป้ายทางหลวง',
    poster: 'poster โปสเตอร์ ใบปลิว แผ่นพับ flyer a4 a3 a5 กระดาษ แจก',
    standee: 'standee สแตนดี้ ไดคัท ตั้งพื้น คนยืน ตัวการ์ตูน มาสคอต ฟิวเจอร์บอร์ด ตัดตามรูป ถ่ายรูป หน้าร้าน งานอีเวนต์',
    window: 'window glass กระจก ติดกระจก สติ๊กเกอร์ติดกระจก ฟิล์ม ฟิล์มฝ้า ฝ้า ฟิล์มขุ่น one way วันเวย์ มองทางเดียว ตาข่าย หน้าร้าน ประตูกระจก ตู้กระจก',
    tablestand: 'table ป้ายตั้งโต๊ะ เมนู เมนูตั้งโต๊ะ อะคริลิค สแตนดี้ ตั้งเคาน์เตอร์ qr code',
    card: 'card บัตร การ์ด คูปอง coupon voucher ticket บัตรสมนาคุณ บัตรกำนัล ส่วนลด นามบัตร รันนัมเบอร์ รันเบอร์ เลขรัน running number ต้นขั้ว บัตรคิว บัตรเชิญ สมาชิก',
    rollup: 'roll up rollup โรลอัพ ขาตั้ง',
    xstand: 'x-stand xstand เอ็กซ์สแตนด์ ขาตั้ง',
    studio: 'studio สตูดิโอ พื้นหลัง',
    wall: 'wall ผนัง ปูน ในร้าน',
    brick: 'brick อิฐ ร้านกาแฟ คาเฟ่',
    shop: 'shop หน้าร้าน ตึกแถว อาคาร ร้านค้า',
    fence: 'fence รั้ว กลางแจ้ง ขายที่ดิน',
    classDoor: 'school โรงเรียน ประตู ห้องเรียน ครู',
    officeDoor: 'office ออฟฟิศ สำนักงาน ประตู ห้องประชุม',
    classroom: 'classroom ห้องเรียน กระดาน โรงเรียน',
    photo: 'photo รูป ถ่ายรูป รูปลูกค้า หน้าร้านจริง',
  };
  function filterCards(sel, attr, table, q, emptyId) {
    q = String(q || '').trim().toLowerCase();
    var n = 0;
    document.querySelectorAll(sel).forEach(function (b) {
      var k = b.dataset[attr];
      var t = table[k] || {};
      var hay = (k + ' ' + (t.name || '') + ' ' + (t.desc || '') + ' ' + (KEYWORDS[k] || '')).toLowerCase();
      var ok = !q || hay.indexOf(q) >= 0;
      b.hidden = !ok;
      if (ok) n++;
    });
    $(emptyId).hidden = n > 0;
  }
  $('typeSearch').addEventListener('input', function (e) {
    filterCards('#types .card', 'type', C.TYPES, e.target.value, 'typeEmpty');
  });
  $('sceneSearch').addEventListener('input', function (e) {
    filterCards('#scenes .scene', 'scene', C.SCENES, e.target.value, 'sceneEmpty');
  });

  /* ---------- โหมดสว่าง / มืด ---------- */
  var THEME_KEY = 'np-sign-theme';
  var darkMq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function curTheme() {
    return document.documentElement.dataset.theme || (darkMq && darkMq.matches ? 'dark' : 'light');
  }
  function applyTheme(t) {
    if (t) document.documentElement.dataset.theme = t;
    else delete document.documentElement.dataset.theme;
    var m = curTheme();
    $('themeBtn').dataset.mode = m;
    $('themeBtn').title = m === 'dark' ? 'เปลี่ยนเป็นโหมดสว่าง' : 'เปลี่ยนเป็นโหมดมืด';
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', m === 'dark' ? '#0d1326' : '#1f2a4d');
  }
  $('themeBtn').addEventListener('click', function () {
    var t = curTheme() === 'dark' ? 'light' : 'dark';
    applyTheme(t);
    try {
      localStorage.setItem(THEME_KEY, t);
    } catch (e) {}
  });
  if (darkMq && darkMq.addEventListener)
    darkMq.addEventListener('change', function () {
      applyTheme(document.documentElement.dataset.theme || '');
    });

  /* ---------- แผงตั้งค่าซ้าย / ขวา ---------- */
  function applySide() {
    var left = st.panel === 'left';
    document.querySelector('.work').classList.toggle('panel-left', left);
    $('sideBtn').setAttribute('aria-pressed', String(left));
    $('sideBtn').title = left ? 'ย้ายแผงตั้งค่าไปขวา' : 'ย้ายแผงตั้งค่าไปซ้าย';
  }
  $('sideBtn').addEventListener('click', function () {
    st.panel = st.panel === 'left' ? 'right' : 'left';
    applySide();
    save();
    fitView();
    draw();
  });

  /* ---------- รีเซ็ตมุมกล้อง / เต็มจอ ---------- */
  var stageEl = document.querySelector('.stage');
  function isFull() {
    return document.fullscreenElement === stageEl || document.webkitFullscreenElement === stageEl || stageEl.classList.contains('is-max');
  }
  function onFull() {
    var on = isFull();
    $('fullBtn').setAttribute('aria-pressed', String(on));
    $('fullBtn').querySelector('span').textContent = on ? 'ออกเต็มจอ' : 'เต็มจอ';
    document.body.classList.toggle('stage-max', on);
    setTimeout(function () {
      fitView();
      draw();
    }, 60);
  }
  function setMax(on) {
    stageEl.classList.toggle('is-max', on);
    onFull();
  }
  $('fullBtn').addEventListener('click', function () {
    if (isFull()) {
      if (document.fullscreenElement || document.webkitFullscreenElement) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      else setMax(false);
      return;
    }
    var req = stageEl.requestFullscreen || stageEl.webkitRequestFullscreen;
    var p = null;
    try {
      p = req ? req.call(stageEl) : null;
    } catch (e) {
      req = null;
    }
    // iPhone ขยายเต็มจอแบบจริงไม่ได้ → ขยายเต็มหน้าเว็บแทน
    if (!req) setMax(true);
    else if (p && p.catch)
      p.catch(function () {
        setMax(true);
      });
  });
  document.addEventListener('fullscreenchange', onFull);
  document.addEventListener('webkitfullscreenchange', onFull);
  $('resetViewBtn').addEventListener('click', function () {
    if (!stage) return;
    stage.resetView();
    syncViewbar();
  });

  /* ---------- งานของฉัน (บันทึกงานไว้ในเครื่อง) ---------- */
  function defaultJobName() {
    return customer.trim() || C.TYPES[st.type].name + ' ' + C.fmtCm(st.w) + '×' + C.fmtCm(st.h);
  }
  function jobThumb() {
    try {
      var tw = 360;
      var th = Math.max(1, Math.round((tw * view.height) / view.width));
      var c = document.createElement('canvas');
      c.width = tw;
      c.height = th;
      c.getContext('2d').drawImage(view, 0, 0, tw, th);
      return c.toDataURL('image/jpeg', 0.8);
    } catch (e) {
      return '';
    }
  }
  function jobState() {
    var o = JSON.parse(JSON.stringify(st));
    delete o.panel;
    return o;
  }
  function saveJob(name) {
    if (!NS.jobs) return Promise.reject(new Error('no db'));
    name = String(name || '').trim() || defaultJobName();
    var id = curJob && curJob.name === name ? curJob.id : newId('job');
    flushSave();
    var j = {
      id: id,
      name: name,
      customer: customer,
      updated: Date.now(),
      st: jobState(),
      thumb: jobThumb(),
      label: C.TYPES[st.type].name + ' · ' + C.sizeText(st.w, st.h),
      design: imgDesign && imgDesign.blob ? { blob: imgDesign.blob, name: imgDesign.name } : null,
      photo: photo && photo.blob ? { blob: photo.blob, quad: copyQuad(photo.quad), touched: photo.touched } : null,
    };
    return NS.jobs.put(j).then(function () {
      curJob = { id: id, name: name };
      autosaveSoon();
      toast('บันทึกงาน “' + name + '” แล้ว');
    });
  }
  // เปิดงานที่บันทึกไว้ (รูปงาน/รูปหน้าร้านโหลดกลับมาด้วย)
  function applyJob(j) {
    var none = function () {
      return null;
    };
    return Promise.all([
      j.design && j.design.blob ? designFromBlob(j.design.blob, j.design.name).catch(none) : null,
      j.photo && j.photo.blob ? photoFromBlob(j.photo.blob).catch(none) : null,
    ]).then(function (r) {
      var keep = { panel: st.panel };
      st = normalize(j.st);
      st.panel = keep.panel;
      imgDesign = r[0];
      photo = r[1];
      if (photo) {
        photo.quad = copyQuad(j.photo.quad);
        photo.touched = !!j.photo.touched;
        if (!photo.quad) refreshPhotoQuad(true);
      }
      if (st.mode === 'image' && !imgDesign) st.mode = 'text';
      if (st.scene === 'photo' && !photo) st.scene = DEF.scene;
      customer = j.customer || '';
      $('customer').value = customer;
      setLogo(st.logo || '');
      showFileCard();
      if (stage && st.view) stage.setView(st.view);
      sync();
    });
  }
  function fmtWhen(ms) {
    var d = new Date(ms);
    var p = function (n) {
      return (n < 10 ? '0' : '') + n;
    };
    return C.thaiDate(d) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  var jobsCache = [];
  function renderJobs() {
    var box = $('jobList');
    var q = $('jobSearch').value.trim().toLowerCase();
    box.innerHTML = '';
    var list = jobsCache.filter(function (j) {
      return !q || (j.name + ' ' + (j.customer || '') + ' ' + (j.label || '')).toLowerCase().indexOf(q) >= 0;
    });
    if (!list.length) {
      var p = document.createElement('p');
      p.className = 'jobs-empty';
      p.textContent = jobsCache.length ? 'ไม่พบงานที่ค้นหา' : 'ยังไม่มีงานที่บันทึกไว้ ตั้งชื่องานแล้วกด “บันทึกงานปัจจุบัน”';
      box.appendChild(p);
      return;
    }
    list.forEach(function (j) {
      var row = document.createElement('div');
      row.className = 'job' + (curJob && curJob.id === j.id ? ' on' : '');
      var img = document.createElement('img');
      img.alt = '';
      if (j.thumb) img.src = j.thumb;
      var meta = document.createElement('div');
      meta.className = 'job-meta';
      var b = document.createElement('b');
      b.textContent = j.name;
      var sm = document.createElement('small');
      sm.textContent = (j.label || '') + ' · ' + fmtWhen(j.updated);
      meta.appendChild(b);
      meta.appendChild(sm);
      var act = document.createElement('div');
      act.className = 'job-act';
      var open = document.createElement('button');
      open.type = 'button';
      open.className = 'btn-ghost small';
      open.textContent = 'เปิด';
      open.addEventListener('click', function () {
        NS.jobs
          .get(j.id)
          .then(function (full) {
            if (!full) throw new Error('gone');
            return applyJob(full).then(function () {
              curJob = { id: full.id, name: full.name };
              autosaveSoon();
              closeDialog($('jobsDlg'));
              toast('เปิดงาน “' + full.name + '” แล้ว');
            });
          })
          .catch(function () {
            toast('เปิดงานนี้ไม่ได้');
          });
      });
      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'btn-ghost small danger';
      del.textContent = 'ลบ';
      var armed = 0;
      del.addEventListener('click', function () {
        if (!armed) {
          del.textContent = 'กดอีกครั้งเพื่อลบ';
          armed = setTimeout(function () {
            armed = 0;
            del.textContent = 'ลบ';
          }, 3000);
          return;
        }
        clearTimeout(armed);
        NS.jobs.del(j.id).then(function () {
          if (curJob && curJob.id === j.id) curJob = null;
          loadJobs();
        });
      });
      act.appendChild(open);
      act.appendChild(del);
      row.appendChild(img);
      row.appendChild(meta);
      row.appendChild(act);
      box.appendChild(row);
    });
  }
  function loadJobs() {
    if (!NS.jobs) {
      $('jobList').innerHTML = '<p class="jobs-empty">เครื่องนี้เก็บงานไม่ได้</p>';
      return;
    }
    NS.jobs
      .list()
      .then(function (list) {
        jobsCache = list;
        renderJobs();
      })
      .catch(function () {
        $('jobList').innerHTML = '<p class="jobs-empty">เบราว์เซอร์นี้เก็บงานไม่ได้ (โหมดไม่ระบุตัวตน?)</p>';
      });
  }
  function openJobs(focusName) {
    $('jobName').value = curJob ? curJob.name : defaultJobName();
    $('jobSearch').value = '';
    loadJobs();
    if (!$('jobsDlg').open) openDialog($('jobsDlg'));
    if (focusName)
      setTimeout(function () {
        $('jobName').focus();
        $('jobName').select();
      }, 30);
  }
  $('jobsBtn').addEventListener('click', function () {
    openJobs(false);
  });
  $('saveJobBtn').addEventListener('click', function () {
    openJobs(true);
  });
  $('jobSearch').addEventListener('input', renderJobs);
  function doSaveJob() {
    saveJob($('jobName').value)
      .then(loadJobs)
      .catch(function () {
        toast('บันทึกงานไม่ได้ในเบราว์เซอร์นี้');
      });
  }
  $('jobSave').addEventListener('click', doSaveJob);
  $('jobName').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      doSaveJob();
    }
  });

  /* ---------- บันทึกงานปัจจุบันอัตโนมัติ (ปิดแอป/อัปเดตแล้วเปิดใหม่ งานยังอยู่ครบ) ---------- */
  var auto = { timer: 0, designId: null, photoId: null, ready: false };
  function autosaveSoon() {
    if (!auto.ready) return;
    clearTimeout(auto.timer);
    auto.timer = setTimeout(autosave, 800);
  }
  function autosave() {
    clearTimeout(auto.timer);
    if (!auto.ready || !NS.jobs) return Promise.resolve();
    var J = NS.jobs;
    var ops = [
      J.put({
        id: 'current',
        customer: customer,
        curJob: curJob,
        mode: st.mode,
        scene: st.scene,
        quad: photo ? copyQuad(photo.quad) : null,
        touched: photo ? photo.touched : false,
        updated: Date.now(),
      }),
    ];
    // ไฟล์ใหญ่ เขียนเฉพาะตอนเปลี่ยนไฟล์
    var did = imgDesign ? imgDesign.id : '';
    if (did !== auto.designId) {
      ops.push(imgDesign && imgDesign.blob ? J.put({ id: 'current-design', blob: imgDesign.blob, name: imgDesign.name }) : J.del('current-design'));
      auto.designId = did;
    }
    var pid = photo ? photo.id : '';
    if (pid !== auto.photoId) {
      ops.push(photo && photo.blob ? J.put({ id: 'current-photo', blob: photo.blob }) : J.del('current-photo'));
      auto.photoId = pid;
    }
    return Promise.all(ops).catch(function () {});
  }
  function restoreCurrent() {
    var done = function () {
      auto.ready = true;
      hist.list = [];
      hist.i = -1;
      flushSave();
    };
    if (!NS.jobs) return done();
    var J = NS.jobs;
    var none = function () {
      return null;
    };
    Promise.all([J.get('current'), J.get('current-design'), J.get('current-photo')])
      .then(function (r) {
        var cur = r[0];
        if (!cur) return;
        customer = cur.customer || '';
        $('customer').value = customer;
        curJob = cur.curJob || null;
        return Promise.all([
          r[1] && r[1].blob ? designFromBlob(r[1].blob, r[1].name).catch(none) : null,
          r[2] && r[2].blob ? photoFromBlob(r[2].blob).catch(none) : null,
        ]).then(function (x) {
          if (x[0]) {
            imgDesign = x[0];
            showFileCard();
            if (want.mode === 'image') st.mode = 'image';
          }
          if (x[1]) {
            photo = x[1];
            if (cur.quad) {
              photo.quad = copyQuad(cur.quad);
              photo.touched = !!cur.touched;
            } else refreshPhotoQuad(true);
            if (want.scene === 'photo') st.scene = 'photo';
          }
          auto.designId = imgDesign ? imgDesign.id : '';
          auto.photoId = photo ? photo.id : '';
          sync();
        });
      })
      .catch(function () {})
      .then(done);
  }
  function flushAll() {
    flushSave();
    return autosave();
  }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') flushAll();
  });
  window.addEventListener('pagehide', flushAll);

  /* ---------- คีย์ลัด ---------- */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && stageEl.classList.contains('is-max') && !document.querySelector('dialog[open]')) {
      setMax(false);
      return;
    }
    var mod = e.ctrlKey || e.metaKey;
    if (!mod || e.altKey) return;
    var k = (e.key || '').toLowerCase();
    if (k === 's') {
      e.preventDefault();
      openJobs(true);
      return;
    }
    var el = document.activeElement;
    var typing = el && (el.isContentEditable || (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) && !/^(checkbox|range|button|file)$/.test(el.type)));
    if (typing || document.querySelector('dialog[open]')) return;
    if (k === 'z' && !e.shiftKey) {
      e.preventDefault();
      undo();
    } else if (k === 'y' || (k === 'z' && e.shiftKey)) {
      e.preventDefault();
      redo();
    }
  });
  $('undoBtn').addEventListener('click', undo);
  $('redoBtn').addEventListener('click', redo);

  /* ---------- ตัวเลือกของร้าน: ชุดสี สีผนัง ฟอนต์ ขนาดประจำ ชนิด/ฉากที่ใช้ สำรอง/ย้ายเครื่อง ---------- */
  var opts = C.normalizeOptions(null);
  var shopFonts = []; // ฟอนต์ที่อัปโหลด { id, name, family, face }
  function loadOpts() {
    try {
      opts = C.normalizeOptions(JSON.parse(localStorage.getItem(OPT_KEY) || 'null'));
    } catch (e) {
      opts = C.normalizeOptions(null);
    }
    applyOpts();
  }
  function applyOpts() {
    R.setThemes(opts.themes);
    C.applyTones(opts.tones);
    C.applyTypes(opts.types);
  }
  function optsChanged() {
    opts = C.normalizeOptions(opts);
    try {
      localStorage.setItem(OPT_KEY, JSON.stringify(opts));
    } catch (e) {}
    applyOpts();
    if (!C.TYPES[st.type]) {
      // ชนิดงานของร้านที่ใช้อยู่ถูกลบ → กลับไปไวนิล ขนาดมาตรฐาน
      st.type = DEF.type;
      st.w = DEF.w;
      st.h = DEF.h;
      save();
    }
    if (!R.themes()[st.text.theme]) st.text.theme = 'brand';
    if (!C.WALL_TONES[st.tone]) st.tone = 'pink';
    textCache = { key: '', design: null };
    buildThemes();
    $('tones').innerHTML = '';
    buildTypes();
    buildScenes();
    buildFontSelects();
    sync();
    if ($('optDlg').open) renderOptDlg();
  }
  function uid2(p) {
    return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  // ---- ชุดสีของร้าน ----
  var themeEditing = null;
  var TH_FIELDS = [['thBg', 'bg'], ['thBg2', 'bg2'], ['thTitle', 'title'], ['thSub', 'sub'], ['thPill', 'pillBg'], ['thPillFg', 'pillFg']];
  function themeFromForm() {
    var t = { id: themeEditing || 'c-new', name: $('thName').value.trim() || 'ชุดสีของร้าน' };
    TH_FIELDS.forEach(function (f) {
      t[f[1]] = $(f[0]).value;
    });
    return t;
  }
  function themePreview() {
    var t = themeFromForm();
    R.setThemes(opts.themes.filter(function (x) { return x.id !== t.id; }).concat([t]));
    var d = R.textDesign(Object.assign({}, st.text, { theme: t.id }), 200, 100);
    R.setThemes(opts.themes);
    var c = $('thPreview');
    var x = c.getContext('2d');
    x.clearRect(0, 0, c.width, c.height);
    x.drawImage(d.src, 0, 0, c.width, c.height);
  }
  function openThemeEditor(id) {
    var all = R.themes();
    var mine = opts.themes.filter(function (t) { return t.id === id; })[0];
    var base = mine || all[st.text.theme] || all.brand;
    themeEditing = mine ? mine.id : null;
    $('themeTitle').textContent = mine ? 'แก้ไขชุดสี' : 'ชุดสีใหม่ของร้าน';
    $('thName').value = mine ? mine.name : 'ชุดสีของร้าน ' + (opts.themes.length + 1);
    TH_FIELDS.forEach(function (f) {
      $(f[0]).value = base[f[1]];
    });
    $('thDelete').hidden = !mine;
    themePreview();
    openDialog($('themeDlg'));
  }
  TH_FIELDS.forEach(function (f) {
    $(f[0]).addEventListener('input', themePreview);
  });
  $('thName').addEventListener('input', themePreview);
  $('thSave').addEventListener('click', function () {
    var t = themeFromForm();
    if (themeEditing) {
      opts.themes = opts.themes.map(function (x) {
        return x.id === themeEditing ? t : x;
      });
    } else {
      t.id = uid2('c-');
      opts.themes.push(t);
    }
    st.text.theme = t.id;
    st.mode = 'text';
    closeDialog($('themeDlg'));
    optsChanged();
    toast('บันทึกชุดสี “' + t.name + '” แล้ว');
  });
  $('thDelete').addEventListener('click', function () {
    if (!themeEditing) return;
    removeTheme(themeEditing);
    closeDialog($('themeDlg'));
  });
  function removeTheme(id) {
    opts.themes = opts.themes.filter(function (t) {
      return t.id !== id;
    });
    if (st.text.theme === id) st.text.theme = 'brand';
    optsChanged();
  }
  $('themeEdit').addEventListener('click', function () {
    openThemeEditor(st.text.theme);
  });

  // ---- สีผนังของร้าน ----
  function tonePreview() {
    $('toPreview').style.background = 'linear-gradient(180deg,' + $('toUpper').value + ' 0 58%,' + $('toLower').value + ' 58% 100%)';
  }
  function openToneEditor() {
    $('toName').value = 'สีผนังของร้าน ' + (opts.tones.length + 1);
    tonePreview();
    openDialog($('toneDlg'));
  }
  $('toUpper').addEventListener('input', tonePreview);
  $('toLower').addEventListener('input', tonePreview);
  $('toSave').addEventListener('click', function () {
    var t = { id: uid2('t-'), name: $('toName').value.trim() || 'สีผนังของร้าน', upper: $('toUpper').value, lower: $('toLower').value };
    opts.tones.push(t);
    st.tone = t.id;
    closeDialog($('toneDlg'));
    optsChanged();
    toast('บันทึกสีผนัง “' + t.name + '” แล้ว');
  });

  // ---- ฟอนต์ ----
  var fontReady = {};
  function ensureFont(name) {
    if (!name || fontReady[name] || !document.fonts) return Promise.resolve();
    var url = C.fontCssUrl(name);
    // ไฟล์ CSS ของฟอนต์ต้องโหลดเสร็จก่อน เบราว์เซอร์ถึงจะรู้จักชื่อฟอนต์
    var css = Promise.resolve();
    if (url && !document.querySelector('link[data-font="' + name + '"]')) {
      var l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = url;
      l.dataset.font = name;
      css = new Promise(function (ok) {
        l.onload = ok;
        l.onerror = ok;
        setTimeout(ok, 4000);
      });
      document.head.appendChild(l);
    }
    var sample = 'กขคง ABC 0123';
    return Promise.race([
      css
        .then(function () {
          return Promise.all([document.fonts.load('700 40px "' + name + '"', sample), document.fonts.load('500 40px "' + name + '"', sample)]);
        })
        .then(function () {
          fontReady[name] = true;
        }),
      new Promise(function (ok) {
        setTimeout(ok, 6000);
      }),
    ]).then(function () {
      textCache = { key: '', design: null };
      faceCache = { key: '', canvas: null };
      draw();
    });
  }
  function buildFontSelects() {
    ['fontTitle', 'fontSub'].forEach(function (id) {
      var sel = $(id);
      var html = '<option value="">Kanit (ค่าเริ่มต้น)</option>';
      if (shopFonts.length) {
        html += '<optgroup label="ฟอนต์ของร้าน">' + shopFonts.map(function (f) {
          return '<option value="' + esc(f.family) + '">' + esc(f.name) + '</option>';
        }).join('') + '</optgroup>';
      }
      html += '<optgroup label="ฟอนต์ไทย (Google Fonts)">' + C.FONTS.filter(function (f) {
        return f[0] !== 'Kanit';
      }).map(function (f) {
        return '<option value="' + esc(f[0]) + '">' + esc(f[0]) + '</option>';
      }).join('') + '</optgroup>';
      sel.innerHTML = html;
    });
    syncFontSelects();
  }
  function syncFontSelects() {
    var known = function (v) {
      return !v || shopFonts.some(function (f) { return f.family === v; }) || C.FONTS.some(function (f) { return f[0] === v; });
    };
    $('fontTitle').value = known(st.text.font) ? st.text.font || '' : '';
    $('fontSub').value = known(st.text.font2) ? st.text.font2 || '' : '';
  }
  [['fontTitle', 'font'], ['fontSub', 'font2']].forEach(function (f) {
    $(f[0]).addEventListener('change', function (e) {
      st.text[f[1]] = e.target.value;
      st.mode = 'text';
      ensureFont(e.target.value);
      sync();
    });
  });
  function registerFont(rec) {
    var buf = rec.blob.arrayBuffer ? rec.blob.arrayBuffer() : new Response(rec.blob).arrayBuffer();
    return buf.then(function (ab) {
      var ff = new FontFace(rec.family, ab);
      return ff.load().then(function () {
        document.fonts.add(ff);
        fontReady[rec.family] = true;
        shopFonts = shopFonts.filter(function (f) { return f.id !== rec.id; }).concat([{ id: rec.id, name: rec.name, family: rec.family, face: ff }]);
      });
    });
  }
  function loadShopFonts() {
    if (!NS.jobs || !window.FontFace || !document.fonts) return;
    NS.jobs
      .byPrefix('opt-font-')
      .then(function (list) {
        return Promise.all(list.map(function (r) {
          return registerFont(r).catch(function () {});
        }));
      })
      .then(function () {
        buildFontSelects();
        textCache = { key: '', design: null };
        faceCache = { key: '', canvas: null };
        draw();
      })
      .catch(function () {});
  }
  function addFontFile(file, quiet) {
    if (!file) return Promise.resolve();
    if (!window.FontFace || !NS.jobs) {
      toast('เบราว์เซอร์นี้ใส่ฟอนต์เองไม่ได้');
      return Promise.resolve();
    }
    if (file.size > 8 * 1024 * 1024) {
      toast('ไฟล์ฟอนต์ใหญ่เกิน 8 MB');
      return Promise.resolve();
    }
    var id = uid2('opt-font-');
    var name = String(file.name || 'ฟอนต์ของร้าน').replace(/\.(ttf|otf|woff2?)$/i, '').slice(0, 40) || 'ฟอนต์ของร้าน';
    var rec = { id: id, name: name, family: 'NPShop-' + id.slice(9), blob: file };
    return registerFont(rec)
      .then(function () {
        return NS.jobs.put(rec);
      })
      .then(function () {
        if (!quiet) {
          st.text.font = rec.family;
          st.mode = 'text';
          toast('เพิ่มฟอนต์ “' + name + '” แล้ว ตั้งเป็นฟอนต์ข้อความหลักให้');
        }
        textCache = { key: '', design: null };
        buildFontSelects();
        sync();
        if ($('optDlg').open) renderOptDlg();
      })
      .catch(function () {
        toast('อ่านไฟล์ฟอนต์นี้ไม่ได้ ใช้ไฟล์ .ttf .otf หรือ .woff');
      });
  }
  $('fontFile').addEventListener('change', function (e) {
    addFontFile(e.target.files[0]);
    e.target.value = '';
  });
  function removeFont(id) {
    var f = shopFonts.filter(function (x) { return x.id === id; })[0];
    if (!f) return;
    if (f.face && document.fonts.delete) document.fonts.delete(f.face);
    shopFonts = shopFonts.filter(function (x) { return x.id !== id; });
    if (st.text.font === f.family) st.text.font = '';
    if (st.text.font2 === f.family) st.text.font2 = '';
    NS.jobs.del(id).catch(function () {});
    textCache = { key: '', design: null };
    buildFontSelects();
    sync();
    renderOptDlg();
  }

  // ---- หน้าต่างตัวเลือกของร้าน ----
  function row(swatch, name, buttons, style) {
    var d = document.createElement('div');
    d.className = 'opt-row';
    if (swatch) {
      var i = document.createElement('i');
      i.className = 'sw';
      i.style.background = swatch;
      d.appendChild(i);
    }
    var n = document.createElement('span');
    n.className = 'nm';
    n.textContent = name;
    if (style) n.style.fontFamily = style;
    d.appendChild(n);
    buttons.forEach(function (b) {
      var bt = document.createElement('button');
      bt.type = 'button';
      bt.className = 'btn-ghost small' + (b[2] ? ' danger' : '');
      bt.textContent = b[0];
      bt.addEventListener('click', b[1]);
      d.appendChild(bt);
    });
    return d;
  }
  function renderOptDlg() {
    var box = $('optThemes');
    box.innerHTML = '';
    opts.themes.forEach(function (t) {
      box.appendChild(row('linear-gradient(135deg,' + t.bg + ' 0 62%,' + t.pillBg + ' 62% 100%)', t.name, [
        ['แก้ไข', function () { openThemeEditor(t.id); }],
        ['ลบ', function () { removeTheme(t.id); }, true],
      ]));
    });
    box = $('optTones');
    box.innerHTML = '';
    opts.tones.forEach(function (t) {
      box.appendChild(row('linear-gradient(180deg,' + t.upper + ' 0 55%,' + t.lower + ' 55% 100%)', t.name, [
        ['ลบ', function () {
          opts.tones = opts.tones.filter(function (x) { return x.id !== t.id; });
          optsChanged();
        }, true],
      ]));
    });
    box = $('optFonts');
    box.innerHTML = '';
    shopFonts.forEach(function (f) {
      box.appendChild(row('', f.name + ' — กขค ป้ายสวย 0123', [['ลบ', function () { removeFont(f.id); }, true]], '"' + f.family + '"'));
    });
    box = $('optMyTypes');
    box.innerHTML = '';
    opts.types.forEach(function (t) {
      var u = t.unit === 'sqm' ? 'คิดต่อ ตร.ม.' : 'คิดต่อ' + t.word;
      box.appendChild(row('', t.name + ' — แบบ' + C.TYPES[t.base].name + ' · ' + u, [
        ['แก้ไข', function () { openTypeEditor(t.id); }],
        ['ลบ', function () { removeType(t.id); }, true],
      ]));
    });
    box = $('optPresets');
    box.innerHTML = '';
    Object.keys(opts.presets).forEach(function (k) {
      var d = row('', C.TYPES[k].name + ': ' + opts.presets[k].map(function (p) { return C.fmtCm(p[0]) + '×' + C.fmtCm(p[1]); }).join(', '), [
        ['ล้าง', function () {
          delete opts.presets[k];
          optsChanged();
        }, true],
      ]);
      box.appendChild(d);
    });
    var checks = function (id, order, table, hidden) {
      var el = $(id);
      el.innerHTML = '';
      order.forEach(function (k) {
        var l = document.createElement('label');
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = hidden.indexOf(k) < 0;
        cb.addEventListener('change', function () {
          var list = id === 'optTypes' ? opts.hideTypes : opts.hideScenes;
          var i = list.indexOf(k);
          if (cb.checked && i >= 0) list.splice(i, 1);
          if (!cb.checked && i < 0) list.push(k);
          if (id === 'optTypes' && list.length >= C.TYPE_ORDER.length) {
            list.splice(list.indexOf(k), 1);
            cb.checked = true;
            toast('ต้องเหลือชนิดป้ายอย่างน้อย 1 ชนิด');
            return;
          }
          optsChanged();
        });
        l.appendChild(cb);
        l.appendChild(document.createTextNode(table[k].name));
        el.appendChild(l);
      });
    };
    checks('optTypes', C.TYPE_ORDER, C.TYPES, opts.hideTypes);
    checks('optScenes', C.SCENE_ORDER, C.SCENES, opts.hideScenes);
    $('optExport').hidden = inFrame;
  }
  $('optBtn').addEventListener('click', function () {
    $('optStatus').textContent = '';
    renderOptDlg();
    openDialog($('optDlg'));
  });
  $('optAddTheme').addEventListener('click', function () {
    openThemeEditor(null);
  });
  $('optAddTone').addEventListener('click', openToneEditor);

  // ---- สำรอง / นำเข้า ----
  function blobToDataUrl(b) {
    return new Promise(function (ok, bad) {
      var r = new FileReader();
      r.onload = function () {
        ok(r.result);
      };
      r.onerror = bad;
      r.readAsDataURL(b);
    });
  }
  $('optExport').addEventListener('click', function () {
    var fontsP = NS.jobs ? NS.jobs.byPrefix('opt-font-').catch(function () { return []; }) : Promise.resolve([]);
    fontsP
      .then(function (list) {
        return Promise.all(list.map(function (r) {
          return blobToDataUrl(r.blob).then(function (data) {
            return { name: r.name, data: data };
          });
        }));
      })
      .then(function (fonts) {
        var out = {
          app: 'np-sign-mockup',
          kind: 'options',
          v: 1,
          saved: new Date().toISOString(),
          options: opts,
          shop: { shopName: st.shopName, shopPhone: st.shopPhone, logo: st.logo, brandLogo: st.brandLogo, rates: st.rates },
          fonts: fonts,
        };
        var blob = new Blob([JSON.stringify(out)], { type: 'application/json' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'np-sign-options-' + stamp().slice(0, 8) + '.json';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () {
          URL.revokeObjectURL(a.href);
        }, 4000);
        $('optStatus').textContent = 'บันทึกไฟล์ ' + a.download + ' แล้ว — เปิดแอปในเครื่องอื่นแล้วกด “นำเข้าไฟล์ตัวเลือก”';
      });
  });
  $('optImport').addEventListener('change', function (e) {
    var f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > 40 * 1024 * 1024) {
      $('optStatus').textContent = 'ไฟล์ใหญ่เกินไป';
      return;
    }
    new Response(f)
      .text()
      .then(function (txt) {
        var data = JSON.parse(txt);
        if (!data || data.app !== 'np-sign-mockup' || data.kind !== 'options') throw new Error('not options');
        var inc = C.normalizeOptions(data.options);
        // รวมกับของเดิม (id ซ้ำ = ใช้ของที่นำเข้า)
        var merge = function (a, b) {
          var ids = b.map(function (x) { return x.id; });
          return a.filter(function (x) { return ids.indexOf(x.id) < 0; }).concat(b);
        };
        opts.themes = merge(opts.themes, inc.themes);
        opts.tones = merge(opts.tones, inc.tones);
        Object.keys(inc.presets).forEach(function (k) {
          opts.presets[k] = (opts.presets[k] || []).concat(inc.presets[k]);
        });
        opts.hideTypes = inc.hideTypes;
        opts.hideScenes = inc.hideScenes;
        var sh = data.shop || {};
        if (typeof sh.shopName === 'string') st.shopName = sh.shopName.slice(0, 80);
        if (typeof sh.shopPhone === 'string') st.shopPhone = sh.shopPhone.slice(0, 40);
        if (typeof sh.logo === 'string' && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(sh.logo) && sh.logo.length < 3e6) st.logo = sh.logo;
        if (typeof sh.brandLogo === 'boolean') st.brandLogo = sh.brandLogo;
        if (sh.rates && typeof sh.rates === 'object') {
          Object.keys(C.TYPES).forEach(function (k) {
            var v = C.num(sh.rates[k]);
            if (v > 0) st.rates[k] = v;
          });
        }
        setLogo(st.logo || '');
        optsChanged();
        var fonts = Array.isArray(data.fonts) ? data.fonts.slice(0, 20) : [];
        return fonts
          .reduce(function (p, fo) {
            return p.then(function () {
              if (!fo || typeof fo.data !== 'string' || fo.data.indexOf('data:') !== 0) return;
              return fetch(fo.data)
                .then(function (r) {
                  return r.blob();
                })
                .then(function (b) {
                  var name = String(fo.name || 'ฟอนต์ของร้าน').slice(0, 40);
                  if (shopFonts.some(function (x) { return x.name === name; })) return;
                  return addFontFile(new File([b], name + '.ttf'), true);
                })
                .catch(function () {});
            });
          }, Promise.resolve())
          .then(function () {
            $('optStatus').textContent = 'นำเข้าตัวเลือกแล้ว: ชุดสี ' + opts.themes.length + ' · สีผนัง ' + opts.tones.length + ' · ฟอนต์ ' + shopFonts.length;
          });
      })
      .catch(function () {
        $('optStatus').textContent = 'ไฟล์นี้ไม่ใช่ไฟล์ตัวเลือกของแอปนี้';
      });
  });

  // ---- สีโครงเหล็ก / เสา ----
  var metalInput = null;
  // ตัวเลือกหน้าตาป้าย: ตัวอักษร (วัสดุ/ไฟ) · นีออน (สีไฟ) · ป้ายยื่น/บิลบอร์ด (เปิดไฟ)
  var neonInput = null;
  function buildLook() {
    var b = bt();
    $('lookMatField').hidden = b !== 'letters';
    $('lookLightField').hidden = b !== 'letters';
    $('neonField').hidden = b !== 'neon';
    $('lookLitRow').hidden = b !== 'blade' && b !== 'billboard';
    $('lookLitText').textContent = b === 'blade' ? 'กล่องไฟ (มีไฟในกล่อง สว่างตอนกลางคืน)' : 'ไฟส่องป้ายตอนกลางคืน';
    pressed('#lookMat button', 'mat', st.look.mat);
    pressed('#lookLight button', 'light', st.look.light);
    $('lookLit').checked = st.look.lit;
    if (b !== 'neon') return;
    var box = $('neonColors');
    if (!box.children.length) {
      C.NEON_COLORS.forEach(function (n) {
        var el = document.createElement('button');
        el.type = 'button';
        el.className = 'swatch';
        el.dataset.neon = n[0];
        var bg = n[0] === 'design' ? 'conic-gradient(#ff5fa8,#ffd23f,#7dff6a,#4fd6ff,#ff5fa8)' : n[0];
        el.innerHTML = '<i style="background:' + bg + ';box-shadow:0 0 6px ' + (n[0] === 'design' ? '#fff' : n[0]) + ',inset 0 0 0 1px rgba(0,0,0,.15)"></i>' + esc(n[1]);
        el.addEventListener('click', function () {
          setLook('neon', n[0]);
        });
        box.appendChild(el);
      });
      var l = document.createElement('label');
      l.className = 'metal-custom';
      neonInput = document.createElement('input');
      neonInput.type = 'color';
      neonInput.setAttribute('aria-label', 'เลือกสีไฟเอง');
      neonInput.addEventListener('input', function (e) {
        setLook('neon', e.target.value);
      });
      l.appendChild(neonInput);
      l.appendChild(document.createElement('span')).textContent = 'สีอื่น';
      box.appendChild(l);
    }
    pressed('#neonColors .swatch', 'neon', st.look.neon);
    if (neonInput && st.look.neon !== 'design' && document.activeElement !== neonInput) neonInput.value = st.look.neon;
  }
  function setLook(k, v) {
    var o = {};
    o[k] = v;
    st.look = C.normalizeLook(Object.assign({}, st.look, o));
    save();
    buildLook();
    summary();
    draw();
  }
  document.querySelectorAll('#lookMat button').forEach(function (b) {
    b.addEventListener('click', function () {
      setLook('mat', b.dataset.mat);
    });
  });
  document.querySelectorAll('#lookLight button').forEach(function (b) {
    b.addEventListener('click', function () {
      setLook('light', b.dataset.light);
      if (b.dataset.light !== 'none' && !st.night) toast('ไฟเห็นชัดตอนกลางคืน — กดปุ่ม “กลางคืน” เหนือภาพเพื่อดู');
    });
  });
  $('lookLit').addEventListener('change', function (e) {
    setLook('lit', e.target.checked);
  });

  // ---- รูปทรงชิ้นงาน (มุมมน / วงกลม / ไดคัท) · ชนิดฟิล์มติดกระจก ----
  var FILM_HINT = {
    print: 'พิมพ์สีลงสติ๊กเกอร์ติดกระจกด้านนอก สีสด ทึบแสง',
    frost: 'ฟิล์มฝ้าขาวขุ่นเต็มชิ้น ตัวอักษร/ลายในงานตัดเป็นช่องใส (เห็นทะลุเข้าร้าน) — งานที่มีพื้นสีเดียวจะได้ลายคมสุด',
    oneway: 'พิมพ์บนสติ๊กเกอร์ตาข่ายรูพรุน ข้างนอกเห็นงาน ในร้านมองออกมาเห็นข้างนอก (ภาพจะทึบลงนิดหน่อยตามจริง)',
  };
  function buildShape() {
    var b = bt();
    var on = C.SHAPE_TYPES.indexOf(b) >= 0;
    $('shapeField').hidden = !on;
    $('filmField').hidden = b !== 'window';
    if (b === 'window') {
      pressed('#filmSeg button', 'film', st.look.film);
      $('filmHint').textContent = FILM_HINT[st.look.film] || '';
    }
    if (!on) return;
    var kind = shapeNow();
    pressed('#shapeSeg button', 'shape', kind);
    // สแตนดี้ไดคัทเสมอ (ไม่มีแบบสี่เหลี่ยม)
    $('shapeSeg').querySelector('[data-shape="rect"]').hidden = b === 'standee';
    $('shapeOpts').hidden = kind !== 'cut' && kind !== 'round';
    $('shapeBorderRow').hidden = kind !== 'cut';
    $('shapeRadiusRow').hidden = kind !== 'round';
    setVal('shapeBorder', C.fmtCm(st.shape.border));
    setVal('shapeRadius', String(st.shape.radius));
    var alpha = st.mode === 'image' && imgDesign && R.hasAlpha(imgDesign.src);
    $('shapeHint').textContent =
      kind === 'cut'
        ? alpha
          ? 'ไฟล์พื้นใส — ตัดตามรูปในไฟล์ + ขอบขาวรอบนอก'
          : 'ตัดตามลาย/ตัวอักษร เก็บสีพื้นงานรอบลายไว้ + ขอบขาวรอบนอก · ใช้ไฟล์ PNG พื้นใสจะได้ขอบตามรูปเป๊ะ'
        : kind === 'circle'
          ? 'ตัดเป็นวงกลม (ขนาดกว้าง = สูง) หรือวงรีตามขนาดที่ตั้ง'
          : kind === 'round'
            ? 'ลบมุมทั้ง 4 มุม (% ของด้านสั้น)'
            : '';
  }
  function setShape(k, v) {
    var o = {};
    o[k] = v;
    st.shape = C.normalizeShape(Object.assign({}, st.shape, o));
    save();
    buildShape();
    summary();
    draw();
  }
  document.querySelectorAll('#shapeSeg button').forEach(function (b) {
    b.addEventListener('click', function () {
      setShape('kind', b.dataset.shape);
    });
  });
  [
    ['shapeBorder', 'border'],
    ['shapeRadius', 'radius'],
  ].forEach(function (f) {
    $(f[0]).addEventListener('input', function (e) {
      if (String(e.target.value).trim() === '') return;
      var v = C.num(e.target.value);
      if (!isFinite(v)) return;
      setShape(f[1], v);
    });
    $(f[0]).addEventListener('blur', buildShape);
  });
  document.querySelectorAll('#filmSeg button').forEach(function (b) {
    b.addEventListener('click', function () {
      setLook('film', b.dataset.film);
      buildShape();
    });
  });

  function buildMetals() {
    buildLook();
    buildShape();
    handSync();
    var cnc = st.type === 'cnc';
    $('cncPostField').hidden = !cnc;
    if (cnc) pressed('#cncPostSeg button', 'posts', C.cncPosts(st.steel) ? '1' : '0');
    // ป้าย CNC แบบไม่มีเสา ไม่ต้องเลือกสีเสา
    var show = st.type === 'stand' || (cnc && C.cncPosts(st.steel));
    $('metalField').hidden = !show;
    if (!show) return;
    $('metalLabel').textContent = cnc ? 'สีเสา' : 'สีโครงเหล็ก';
    var box = $('metals');
    if (!box.children.length) {
      C.METALS.forEach(function (m) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'swatch';
        b.dataset.metal = m[0];
        var bg = m[0] === 'inox' ? 'linear-gradient(90deg,#f4f5f7,#aeb4bc 55%,#8a9099)' : m[0];
        b.innerHTML = '<i style="background:' + bg + ';box-shadow:inset 0 0 0 1px rgba(0,0,0,.15)"></i>' + esc(m[1]);
        b.addEventListener('click', function () {
          setSteel('color', m[0]);
        });
        box.appendChild(b);
      });
      var l = document.createElement('label');
      l.className = 'metal-custom';
      metalInput = document.createElement('input');
      metalInput.type = 'color';
      metalInput.setAttribute('aria-label', 'เลือกสีเอง');
      metalInput.addEventListener('input', function (e) {
        setSteel('color', e.target.value);
      });
      l.appendChild(metalInput);
      l.appendChild(document.createElement('span')).textContent = 'สีอื่น';
      box.appendChild(l);
    }
    var cur = C.metalColor((st.steel && st.steel.color) || '#1f2125');
    pressed('#metals .swatch', 'metal', cur);
    if (cur !== 'inox' && document.activeElement !== metalInput) metalInput.value = cur;
  }

  // ---- ค่าใช้จ่ายเพิ่ม · ส่วนลด · VAT 7% · มัดจำ · นัดรับ · หมายเหตุ (ขั้น 4) ----
  function billNow() {
    return C.billTotals(quoteNow(), st.bill);
  }
  function setBill(k, v, quiet) {
    var o = {};
    o[k] = v;
    st.bill = C.normalizeBill(Object.assign({}, st.bill, o));
    save();
    if (!quiet) billSync();
    else billReadout();
    footCache = null;
    draw();
  }
  var billRows = -1;
  function billSync() {
    var b = st.bill;
    var box = $('billExtras');
    if (billRows !== b.extras.length) {
      billRows = b.extras.length;
      box.innerHTML = '';
      b.extras.forEach(function (e, i) {
        var row = document.createElement('div');
        row.className = 'bill-row';
        var nm = document.createElement('input');
        nm.type = 'text';
        nm.maxLength = 40;
        nm.placeholder = 'ชื่อรายการ';
        nm.setAttribute('aria-label', 'ชื่อรายการเพิ่ม ' + (i + 1));
        nm.dataset.i = i;
        nm.dataset.k = 'name';
        var af = document.createElement('span');
        af.className = 'affix';
        var am = document.createElement('input');
        am.type = 'text';
        am.inputMode = 'decimal';
        am.placeholder = '0';
        am.setAttribute('aria-label', 'จำนวนเงิน ' + (i + 1));
        am.dataset.i = i;
        am.dataset.k = 'amount';
        af.appendChild(am);
        af.appendChild(document.createElement('i')).textContent = 'บาท';
        var del = document.createElement('button');
        del.type = 'button';
        del.className = 'btn-ghost small';
        del.textContent = '×';
        del.setAttribute('aria-label', 'ลบรายการ ' + (i + 1));
        del.addEventListener('click', function () {
          var ex = st.bill.extras.slice();
          ex.splice(i, 1);
          setBill('extras', ex);
        });
        [nm, am].forEach(function (inp) {
          inp.addEventListener('input', function () {
            var ex = st.bill.extras.map(function (x) {
              return { name: x.name, amount: x.amount };
            });
            ex[+inp.dataset.i][inp.dataset.k] = inp.dataset.k === 'amount' ? C.num(inp.value) || 0 : inp.value;
            setBill('extras', ex, true);
          });
        });
        row.appendChild(nm);
        row.appendChild(af);
        row.appendChild(del);
        box.appendChild(row);
      });
    }
    box.querySelectorAll('input').forEach(function (inp) {
      var e = b.extras[+inp.dataset.i];
      if (!e || document.activeElement === inp) return;
      inp.value = inp.dataset.k === 'amount' ? (e.amount ? String(e.amount) : '') : e.name;
    });
    $('billAdd').querySelectorAll('button').forEach(function (bt2) {
      bt2.disabled = b.extras.length >= 8;
    });
    setVal('billDiscount', b.discount ? String(b.discount) : '');
    setVal('billDue', b.due);
    setVal('billNote', b.note);
    setVal('billWork', b.work);
    $('billVat').checked = b.vat;
    pressed('#billDeposit button', 'dep', String(b.deposit));
    billReadout();
  }
  function billReadout() {
    var t = billNow();
    var el = $('billReadout');
    if (t.plain && !t.deposit) {
      el.innerHTML = '';
      el.hidden = true;
      return;
    }
    el.hidden = false;
    var rows = [];
    var add = function (a, b2, strong) {
      rows.push('<span' + (strong ? ' class="strong"' : '') + '><em>' + esc(a) + '</em><b>' + esc(b2) + '</b></span>');
    };
    add('ค่าป้าย', C.money(t.main) + ' บาท');
    t.extras.forEach(function (e) {
      add(e.name || 'รายการเพิ่ม', C.money(e.amount) + ' บาท');
    });
    if (t.discount) add('ส่วนลด', '−' + C.money(t.discount) + ' บาท');
    if (t.vatOn) add('VAT 7%', C.money(t.vat) + ' บาท');
    add('รวมทั้งสิ้น', C.money(t.grand) + ' บาท', true);
    if (t.deposit && t.deposit < 100) {
      add('มัดจำ ' + t.deposit + '%', C.money(t.depositAmt) + ' บาท');
      add('คงค้างวันรับงาน', C.money(t.balance) + ' บาท');
    } else if (t.deposit === 100) add('ชำระเต็มจำนวน', C.money(t.grand) + ' บาท');
    el.innerHTML = rows.join('');
  }
  $('billAdd').querySelectorAll('button').forEach(function (b) {
    b.addEventListener('click', function () {
      if (st.bill.extras.length >= 8) return;
      setBill('extras', st.bill.extras.concat([{ name: b.dataset.add, amount: 0 }]));
      var last = $('billExtras').lastElementChild;
      if (last) last.querySelector(b.dataset.add ? 'input[data-k="amount"]' : 'input').focus();
    });
  });
  $('billDiscount').addEventListener('input', function (e) {
    setBill('discount', C.num(e.target.value) || 0, true);
  });
  $('billDue').addEventListener('change', function (e) {
    setBill('due', e.target.value, true);
  });
  $('billNote').addEventListener('input', function (e) {
    setBill('note', e.target.value, true);
  });
  $('billWork').addEventListener('input', function (e) {
    setBill('work', e.target.value, true);
  });
  $('billVat').addEventListener('change', function (e) {
    setBill('vat', e.target.checked);
  });
  document.querySelectorAll('#billDeposit button').forEach(function (b) {
    b.addEventListener('click', function () {
      setBill('deposit', +b.dataset.dep);
    });
  });

  // ---- ชนิดงานของร้าน: ชื่อ หน้าตา (ยืมชนิดมาตรฐาน) วิธีคิดราคา หน่วย ขนาดที่ใช้บ่อย ----
  var tyEdit = null; // id ที่กำลังแก้ (null = เพิ่มใหม่)
  var tyUnit = 'sqm';
  function openTypeEditor(id) {
    var t = id ? opts.types.filter(function (x) { return x.id === id; })[0] : null;
    tyEdit = t ? t.id : null;
    var sel = $('tyBase');
    if (!sel.options.length) {
      C.LOOK_TYPES.forEach(function (k) {
        var o = document.createElement('option');
        o.value = k;
        o.textContent = C.TYPES[k].name;
        sel.appendChild(o);
      });
    }
    $('tyName').value = t ? t.name : '';
    sel.value = t ? t.base : 'foam';
    tyUnit = t ? t.unit : C.TYPES[sel.value].unit;
    pressed('#tyUnit button', 'unit', tyUnit);
    $('tyWord').value = t ? t.word : '';
    $('tySizes').value = t ? t.presets.map(function (p) { return C.fmtCm(p[0]) + 'x' + C.fmtCm(p[1]); }).join(', ') : '';
    $('tyDesc').value = t ? t.desc : '';
    $('tyDelete').hidden = !t;
    $('typeTitle').textContent = t ? 'แก้ไขชนิดงาน' : 'เพิ่มชนิดงานของร้าน';
    $('tyStatus').textContent = '';
    openDialog($('typeDlg'));
    if (!t) $('tyName').focus();
  }
  $('tyBase').addEventListener('change', function () {
    if (tyEdit) return;
    tyUnit = C.TYPES[$('tyBase').value].unit; // ชนิดใหม่: วิธีคิดราคาตามหน้าตาที่เลือก (แก้ได้)
    pressed('#tyUnit button', 'unit', tyUnit);
  });
  document.querySelectorAll('#tyUnit button').forEach(function (b) {
    b.addEventListener('click', function () {
      tyUnit = b.dataset.unit;
      pressed('#tyUnit button', 'unit', tyUnit);
    });
  });
  $('tySave').addEventListener('click', function () {
    var name = $('tyName').value.trim();
    if (!name) {
      $('tyStatus').textContent = 'ใส่ชื่อชนิดงานก่อน';
      $('tyName').focus();
      return;
    }
    var base = $('tyBase').value;
    var sizes = C.parseSizes($('tySizes').value);
    if ($('tySizes').value.trim() && !sizes.length) {
      $('tyStatus').textContent = 'อ่านขนาดไม่ออก พิมพ์แบบ 60x90, 120x240';
      return;
    }
    // ไม่ใส่ขนาด = ใช้ขนาดมาตรฐานของหน้าตาที่เลือก
    if (!sizes.length) sizes = C.TYPES[base].presets.slice(0, 4).map(function (p) { return [p[0], p[1]]; });
    var def = { id: tyEdit || uid2('u-'), name: name, base: base, unit: tyUnit, word: $('tyWord').value.trim(), desc: $('tyDesc').value.trim(), presets: sizes };
    var isNew = !tyEdit;
    opts.types = isNew ? opts.types.concat([def]) : opts.types.map(function (x) { return x.id === def.id ? def : x; });
    optsChanged();
    closeDialog($('typeDlg'));
    var saved = opts.types.filter(function (x) { return x.id === def.id; })[0];
    if (isNew && saved) {
      setType(saved.id);
      toast('เพิ่มชนิดงาน “' + saved.name + '” แล้ว อยู่ท้ายรายการชนิดในขั้น 2');
    } else toast('บันทึกชนิดงานแล้ว');
  });
  function removeType(id) {
    opts.types = opts.types.filter(function (x) { return x.id !== id; });
    delete opts.presets[id];
    opts.hideTypes = opts.hideTypes.filter(function (k) { return k !== id; });
    optsChanged();
  }
  $('tyDelete').addEventListener('click', function () {
    if (!tyEdit) return;
    removeType(tyEdit);
    closeDialog($('typeDlg'));
    toast('ลบชนิดงานแล้ว');
  });
  $('optAddType').addEventListener('click', function () {
    openTypeEditor(null);
  });

  // ---- บัตร: รันนัมเบอร์ ----
  var RUN_COLORS = [['#c8102e', 'แดง'], ['#1a1a1a', 'ดำ'], ['#1f2a4d', 'กรมท่า'], ['#ffffff', 'ขาว'], ['#b8862b', 'ทอง']];
  var runColorInput = null;
  function runSync() {
    var card = isCard();
    $('runPane').hidden = !card;
    if (!card) return;
    var r = st.run;
    $('runOn').checked = r.on;
    $('runOpts').hidden = !r.on;
    setVal('runPrefix', r.prefix);
    setVal('runStart', String(r.start));
    setVal('runDigits', String(r.digits));
    setVal('runStub', r.stub ? C.fmtCm(r.stub) : '0');
    pressed('#runPos button', 'pos', r.pos);
    pressed('#runSize button', 'size', r.size);
    var box = $('runColors');
    if (!box.children.length) {
      RUN_COLORS.forEach(function (c) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'swatch';
        b.dataset.color = c[0];
        b.innerHTML = '<i style="background:' + c[0] + ';box-shadow:inset 0 0 0 1px rgba(0,0,0,.18)"></i>' + esc(c[1]);
        b.addEventListener('click', function () {
          setRun('color', c[0]);
        });
        box.appendChild(b);
      });
      var l = document.createElement('label');
      l.className = 'metal-custom';
      runColorInput = document.createElement('input');
      runColorInput.type = 'color';
      runColorInput.setAttribute('aria-label', 'เลือกสีเลขเอง');
      runColorInput.addEventListener('input', function (e) {
        setRun('color', e.target.value);
      });
      l.appendChild(runColorInput);
      l.appendChild(document.createElement('span')).textContent = 'สีอื่น';
      box.appendChild(l);
    }
    pressed('#runColors .swatch', 'color', r.color);
    if (runColorInput && document.activeElement !== runColorInput) runColorInput.value = r.color;
    var q = quoteNow();
    $('runInfo').textContent = r.on
      ? 'จำนวน ' + q.qty + ' ใบ (ขั้น 4) → ' + C.runText(r, 0) + (q.qty > 1 ? ' ถึง ' + C.runText(r, q.qty - 1) : '') + ' · ส่งออก "ไฟล์พิมพ์" ได้ PDF จัดเต็มแผ่นพร้อมเลขทุกใบ'
      : 'ไม่ใส่เลข · ส่งออก "ไฟล์พิมพ์" ได้ PDF จัดเต็มแผ่นพร้อมเส้นตัด';
  }
  function setRun(k, v) {
    var o = {};
    o[k] = v;
    st.run = C.normalizeRun(Object.assign({}, st.run, o));
    save();
    runSync();
    draw();
  }
  $('runOn').addEventListener('change', function (e) {
    setRun('on', e.target.checked);
  });
  [
    ['runPrefix', 'prefix'],
    ['runStart', 'start'],
    ['runDigits', 'digits'],
    ['runStub', 'stub'],
  ].forEach(function (f) {
    $(f[0]).addEventListener('input', function (e) {
      var v = e.target.value;
      if (f[1] !== 'prefix') {
        if (String(v).trim() === '') return; // กำลังลบเพื่อพิมพ์ใหม่
        v = C.num(v);
        if (!isFinite(v)) return;
      }
      setRun(f[1], v);
    });
    $(f[0]).addEventListener('blur', runSync);
  });
  document.querySelectorAll('#runPos button').forEach(function (b) {
    b.addEventListener('click', function () {
      setRun('pos', b.dataset.pos);
    });
  });
  document.querySelectorAll('#runSize button').forEach(function (b) {
    b.addEventListener('click', function () {
      setRun('size', b.dataset.size);
    });
  });

  /* ---------- ติดตั้งเป็นแอป ---------- */
  var standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var installPrompt = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    installPrompt = e;
    $('installBtn').hidden = false;
  });
  if (!standalone && !inFrame && isIOS) $('installBtn').hidden = false;
  $('installBtn').addEventListener('click', function () {
    if (installPrompt) {
      installPrompt.prompt();
      installPrompt.userChoice.then(function (r) {
        installPrompt = null;
        if (r && r.outcome === 'accepted') $('installBtn').hidden = true;
      });
    } else {
      openDialog($('installDlg'));
    }
  });
  window.addEventListener('appinstalled', function () {
    $('installBtn').hidden = true;
    toast('ติดตั้งแล้ว เปิดได้จากไอคอนบนหน้าจอ');
  });
  /* ---------- อัปเดตอัตโนมัติ ----------
   * แอปเช็กรุ่นใหม่ทุก 10 นาที + ทุกครั้งที่กลับมาเปิดหน้า เจอแล้วเก็บงานปัจจุบันแล้วโหลดรุ่นใหม่เอง (ไม่ต้องลบแอปติดตั้งใหม่) */
  var UPDATED_KEY = 'np-sign-updated';
  function safeToReload() {
    if (document.visibilityState === 'hidden') return true;
    var el = document.activeElement;
    var typing = el && /^(INPUT|TEXTAREA)$/.test(el.tagName) && !/^(checkbox|range|file|button)$/.test(el.type);
    return !typing && !drag && !document.querySelector('dialog[open]') && !(stage && stage.showing);
  }
  var reloading = false;
  function reloadWhenSafe() {
    if (!safeToReload()) {
      setTimeout(reloadWhenSafe, 2500);
      return;
    }
    flushAll().then(function () {
      try {
        sessionStorage.setItem(UPDATED_KEY, '1');
      } catch (e) {}
      location.reload();
    });
  }
  if ('serviceWorker' in navigator && !inFrame && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    var hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker
      .register('sw.js')
      .then(function (reg) {
        var check = function () {
          if (navigator.onLine !== false) reg.update().catch(function () {});
        };
        setInterval(check, 10 * 60 * 1000);
        document.addEventListener('visibilitychange', function () {
          if (document.visibilityState === 'visible') check();
        });
        window.addEventListener('online', check);
      })
      .catch(function () {});
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      // ติดตั้งครั้งแรกไม่ต้องโหลดใหม่ — โหลดใหม่เฉพาะตอนรุ่นใหม่มาแทนรุ่นเดิม
      if (!hadController) {
        hadController = true;
        return;
      }
      if (reloading) return;
      reloading = true;
      toast('มีรุ่นใหม่ กำลังอัปเดต… งานที่ทำอยู่ไม่หาย');
      setTimeout(reloadWhenSafe, 1200);
    });
  }

  /* ---------- เริ่ม ---------- */
  try {
    applyTheme(localStorage.getItem(THEME_KEY) || '');
  } catch (e) {
    applyTheme('');
  }
  applySide();
  $('verLabel').textContent = 'v' + APP_VERSION;
  loadOpts();
  if (!R.themes()[st.text.theme]) st.text.theme = 'brand';
  if (!C.WALL_TONES[st.tone]) st.tone = 'pink';
  buildFontSelects();
  ensureFont(st.text.font);
  ensureFont(st.text.font2);
  loadShopFonts();
  buildTypes();
  buildThemes();
  buildScenes();
  loadBrand();
  if (st.logo) setLogo(st.logo);
  else syncLogoRow();
  go(1);
  sync();
  restoreCurrent();
  loadCmp();
  try {
    if (sessionStorage.getItem(UPDATED_KEY)) {
      sessionStorage.removeItem(UPDATED_KEY);
      setTimeout(function () {
        toast('อัปเดตเป็นรุ่นใหม่แล้ว (v' + APP_VERSION + ') งานเดิมอยู่ครบ');
      }, 600);
    }
  } catch (e) {}
  // ฟอนต์ไทยมาช้ากว่าหน้า — โหลดเสร็จแล้ววาดข้อความใหม่ให้ใช้ฟอนต์จริง
  if (document.fonts && document.fonts.load) {
    var sample = 'กขคง ABC 0123';
    var wait = Promise.all([
      document.fonts.load('700 40px Kanit', sample),
      document.fonts.load('600 40px Kanit', sample),
      document.fonts.load('500 40px Kanit', sample),
      document.fonts.load('400 20px "IBM Plex Sans Thai"', sample),
      document.fonts.load('600 20px "IBM Plex Sans Thai"', sample),
    ]);
    Promise.race([wait, new Promise(function (r) {
      setTimeout(r, 3000);
    })]).then(function () {
      textCache = { key: '', design: null };
      faceCache = { key: '', canvas: null };
      footCache = null;
      draw();
    });
  }

  /* ---------- โครงเหล็ก + รายการตัดเหล็ก (ป้ายขาตั้งโครงเหล็ก / ไวนิลขึงโครง) ---------- */
  function steelKind() {
    return st.type === 'stand' ? 'stand' : bt() === 'frame' ? 'wall' : null;
  }
  function steelNow() {
    var kind = steelKind();
    return kind ? C.steelCut(kind, st.w, st.h, st.steel) : null;
  }
  // (ประกาศแบบ function ให้ใช้ได้ตั้งแต่ตอนเริ่มหน้า — โค้ดส่วนนี้อยู่หลังส่วนเริ่มต้น)
  function fmt1(v) {
    return C.fmtCm(v);
  }
  function steelDiagram(cut) {
    var o = cut.opts;
    var stand = cut.kind === 'stand';
    var W = st.w;
    var Ht = stand ? o.total : st.h;
    var T = o.T;
    var pad = Math.max(W, Ht) * 0.06;
    var sc = 200 / Math.max(W + pad * 2, Ht + pad * 2);
    var vw = Math.round((W + pad * 2) * sc);
    var vh = Math.round((Ht + pad * 2) * sc);
    var r = [];
    var bar = function (x, y, w, h, c) {
      r.push('<rect x="' + ((x + pad) * sc).toFixed(1) + '" y="' + ((y + pad) * sc).toFixed(1) + '" width="' + Math.max(1, w * sc).toFixed(1) + '" height="' + Math.max(1, h * sc).toFixed(1) + '" fill="' + c + '"/>');
    };
    var F = '#3b4048';
    if (stand) {
      bar(0, 0, T, o.total, F);
      bar(W - T, 0, T, o.total, F);
      if (o.base === 'rect') bar(0, o.total - T, W, T, F);
      else {
        bar(-T * 0.5, o.total - T, T * 2, T, F);
        bar(W - T * 1.5, o.total - T, T * 2, T, F);
      }
    } else {
      bar(0, 0, T, st.h, F);
      bar(W - T, 0, T, st.h, F);
    }
    bar(0, 0, W, T, F);
    bar(0, st.h - T, W, T, F); // คานกรอบล่าง (ขอบล่างป้าย)
    var innerW = W - 2 * T;
    var innerH = st.h - 2 * T;
    var segH = (innerH - o.nh * T) / (o.nh + 1);
    var segW = (innerW - o.nv * T) / (o.nv + 1);
    for (var i = 0; i < o.nh; i++) bar(T, T + (i + 1) * segH + i * T, innerW, T, '#2f9e62');
    for (var j = 0; j < o.nv; j++) bar(T + (j + 1) * segW + j * T, T, T, innerH, '#3a6fd8');
    var label = fmt1(st.w) + ' × ' + fmt1(st.h) + ' ซม.' + (stand ? ' · สูงรวม ' + fmt1(o.total) : '');
    return '<p class="dlabel">' + esc(label) + '</p><svg viewBox="0 0 ' + vw + ' ' + vh + '" width="' + vw + '" height="' + vh + '" role="img" aria-label="ผังโครงเหล็ก ' + esc(label) + '">' + r.join('') + '</svg>';
  }
  function steelSync() {
    var kind = steelKind();
    $('steelPane').hidden = !kind;
    if (!kind) return;
    var cut = steelNow();
    var o = cut.opts;
    var stand = kind === 'stand';
    $('steelKind').textContent = stand ? 'ขาตั้ง' : 'กรอบติดผนัง';
    $('steelStandRow').hidden = !stand;
    $('steelBaseField').hidden = !stand;
    $('stFrameOnlyRow').hidden = !stand;
    var tube = $('stTube');
    if (!tube.options.length) {
      C.TUBES.forEach(function (t) {
        var op = document.createElement('option');
        op.value = t[0];
        op.textContent = t[0] + '×' + t[0] + ' มม. (' + t[1] + ')';
        tube.appendChild(op);
      });
      C.WALLS.forEach(function (t) {
        var op = document.createElement('option');
        op.value = t;
        op.textContent = t + ' มม.';
        $('stWall').appendChild(op);
      });
    }
    tube.value = String(o.tube);
    $('stWall').value = String(o.wall);
    var auto = function (id, isAuto, v) {
      var el = $(id);
      el.placeholder = 'อัตโนมัติ (' + fmt1(v) + ')';
      if (document.activeElement !== el) el.value = isAuto ? '' : fmt1(v);
    };
    auto('stTotal', o.autoTotal, o.total);
    auto('stDepth', o.autoDepth, o.depth);
    auto('stNh', o.autoNh, o.nh);
    auto('stNv', o.autoNv, o.nv);
    if (document.activeElement !== $('stPrice')) $('stPrice').value = o.price ? String(o.price) : '';
    pressed('#stBase button', 'base', o.base);
    pressed('#stCut button', 'cut', o.cut);
    $('stFrameOnly').checked = o.frameOnly;
    $('stDiagram').innerHTML = steelDiagram(cut);
    var bay = $('stBay');
    bay.textContent = 'ช่องโครงใหญ่สุด กว้าง × สูง: ' + fmt1(o.bayW) + ' × ' + fmt1(o.bayH) + ' ซม.' + (o.wide ? ' — กว้างเกินเกณฑ์ (คร่าวนอนห่าง ≤ 60 · คร่าวตั้งห่าง ≤ 100 ซม.) ลองเพิ่มคร่าว' : '');
    bay.classList.toggle('warn', o.wide);
    var stats = [
      ['ความยาวเหล็กรวม', fmt1(cut.total), 'ซม.'],
      ['จำนวนชิ้นรวม', cut.pieces, 'ชิ้น'],
      ['เหล็กเส้นยาว 6 ม.', cut.pack.count, 'เส้น · เศษ ' + fmt1(cut.pack.waste) + ' ซม.'],
      ['น้ำหนักโดยประมาณ', cut.kg, 'กก.'],
    ];
    if (cut.cost) stats.push(['ค่าเหล็ก', C.baht(cut.cost), 'บาท']);
    $('stStats').innerHTML = stats
      .map(function (s) {
        return '<div><small>' + esc(s[0]) + '</small><b>' + esc(String(s[1])) + '</b><em>' + esc(s[2]) + '</em></div>';
      })
      .join('');
    var rows = cut.parts
      .map(function (p) {
        return '<tr><td>' + esc(p.name) + '<small>' + esc(p.note) + '</small></td><td class="n">' + p.qty + '</td><td class="n"><b>' + esc(fmt1(p.len)) + '</b></td></tr>';
      })
      .join('');
    $('stTable').innerHTML =
      '<caption>หน้าตัด ' + esc(C.tubeText(o)) + '<span>' + cut.pieces + ' ชิ้น</span></caption>' +
      '<thead><tr><th>ส่วนของโครง</th><th class="n">ชิ้น</th><th class="n">ยาว/ชิ้น (ซม.)</th></tr></thead><tbody>' +
      rows +
      '</tbody><tfoot><tr><td colspan="2">ความยาวรวม</td><td class="n">' + esc(fmt1(cut.total)) + ' ซม.</td></tr></tfoot>' +
      (cut.pack.over.length ? '<tfoot><tr><td colspan="3">มีชิ้นยาวเกิน 6 ม. ' + cut.pack.over.length + ' ชิ้น ต้องต่อเหล็ก</td></tr></tfoot>' : '');
  }
  function setSteel(k, v) {
    st.steel = Object.assign({}, st.steel);
    st.steel[k] = v;
    save();
    buildMetals();
    steelSync();
    summary();
    draw();
  }
  [
    ['stTotal', 'total', 0],
    ['stDepth', 'depth', 0],
    ['stNh', 'nh', -1],
    ['stNv', 'nv', -1],
    ['stPrice', 'price', 0],
  ].forEach(function (f) {
    $(f[0]).addEventListener('input', function (e) {
      var raw = e.target.value.trim();
      var v = raw === '' ? f[2] : C.num(raw);
      if (raw !== '' && !(v >= 0)) return;
      setSteel(f[1], v);
    });
    $(f[0]).addEventListener('change', function () {
      steelSync();
    });
  });
  $('stTube').addEventListener('change', function (e) {
    setSteel('tube', +e.target.value);
  });
  $('stWall').addEventListener('change', function (e) {
    setSteel('wall', +e.target.value);
  });
  document.querySelectorAll('#cncPostSeg button').forEach(function (b) {
    b.addEventListener('click', function () {
      var on = b.dataset.posts === '1';
      if (C.cncPosts(st.steel) === on) return;
      setSteel('posts', on);
      // ไม่มีเสา = ยึดผนัง ความสูงตามฉาก (ผนัง/หน้าร้าน/รั้ว)
      toast(on ? 'ป้ายตั้งเสาคู่บนฐานปูน ขอบล่างสูงจากพื้น 80 ซม.' : 'ป้ายไม่มีเสา ยึดติดผนัง/รั้ว/อาคาร (ลองฉากผนัง หน้าร้าน หรือรั้ว)');
    });
  });
  document.querySelectorAll('#stBase button').forEach(function (b) {
    b.addEventListener('click', function () {
      setSteel('base', b.dataset.base);
    });
  });
  document.querySelectorAll('#stCut button').forEach(function (b) {
    b.addEventListener('click', function () {
      setSteel('cut', b.dataset.cut);
    });
  });
  $('stFrameOnly').addEventListener('change', function (e) {
    setSteel('frameOnly', e.target.checked);
  });

  // รายการตัดเป็นข้อความ (หน่วย มม.) — ส่งช่างตัดเหล็กได้เลย
  function cutListText(cut) {
    var o = cut.opts;
    var mm = function (cm) {
      return String(Math.round(cm * 10));
    };
    var pad = function (s, n, right) {
      s = String(s);
      var len = s.replace(/[ัิ-ฺ็-๎]/g, '').length; // สระบน/ล่าง วรรณยุกต์ไม่กินที่
      var sp = new Array(Math.max(1, n - len + 1)).join(' ');
      return right ? sp + s : s + sp;
    };
    var L = [];
    var t = C.TYPES[st.type];
    L.push('รายการตัดเหล็ก — ' + t.name + ' ' + mm(st.w) + ' × ' + mm(st.h) + ' มม.');
    var spec = ['เหล็กกล่อง ' + C.tubeText(o), o.cut === 'miter' ? 'ตัดเข้ามุม 45°' : 'ตัดตรงชน'];
    if (cut.kind === 'stand') spec.unshift('สูงรวม ' + mm(o.total) + ' มม.', 'ฐานลึก ' + mm(o.depth) + ' มม. (' + (o.base === 'rect' ? 'ฐานสี่เหลี่ยม' : 'ขาตัว T') + ')');
    L.push(spec.join(' · '));
    var who = [customer.trim() ? 'ลูกค้า: ' + customer.trim() : '', st.shopName.trim(), C.thaiDate(new Date())].filter(Boolean);
    L.push(who.join(' · '));
    L.push('');
    L.push(pad('ส่วนของโครง', 22) + pad('ชิ้น', 6, true) + pad('ยาว/ชิ้น (มม.)', 16, true) + '   มุมตัด');
    L.push(new Array(70).join('-'));
    cut.parts.forEach(function (p) {
      L.push(pad(p.name, 22) + pad(p.qty, 6, true) + pad(mm(p.len), 16, true) + '   ' + p.note);
    });
    L.push(new Array(70).join('-'));
    L.push('รวม ' + cut.pieces + ' ชิ้น · ความยาวรวม ' + mm(cut.total) + ' มม. · น้ำหนักโดยประมาณ ' + cut.kg + ' กก.');
    L.push('ช่องโครงใหญ่สุด ' + mm(o.bayW) + ' × ' + mm(o.bayH) + ' มม. · คร่าวนอน ' + o.nh + ' เส้น · คร่าวตั้ง ' + o.nv + ' ต่อแถว');
    L.push('');
    L.push('แผนตัดจากเหล็กเส้นยาว ' + mm(C.STOCK) + ' มม. (เผื่อคมเลื่อย ' + mm(C.KERF) + ' มม./รอยตัด) ใช้ ' + cut.pack.count + ' เส้น');
    cut.pack.bars.forEach(function (b, i) {
      L.push('  เส้นที่ ' + (i + 1) + ': ' + b.cuts.map(mm).join(' + ') + '  → เหลือ ' + mm(b.left) + ' มม.');
    });
    if (cut.pack.over.length) L.push('  ชิ้นยาวเกินเส้น (ต้องต่อเหล็ก): ' + cut.pack.over.map(mm).join(', ') + ' มม.');
    if (cut.cost) L.push('ค่าเหล็กโดยประมาณ ' + C.baht(cut.cost) + ' บาท (' + cut.pack.count + ' เส้น × ' + C.baht(o.price) + ' บาท)');
    L.push('');
    L.push('หมายเหตุ: ความยาวชิ้นที่ตัดเข้ามุม 45° วัดด้านยาว · คร่าวชนกลางตัดตรง');
    L.push('ค่าเบื้องต้นสำหรับจัดแบบ ต้องตรวจวัสดุ แรงลม และจุดยึดก่อนผลิต');
    L.push('จัดทำด้วย นัดพอน Sign Mockup v' + APP_VERSION);
    return L.join('\r\n');
  }
  var cutFile = { text: '', name: '' };
  $('stCutBtn').addEventListener('click', function () {
    var cut = steelNow();
    if (!cut) return;
    cutFile.text = cutListText(cut);
    cutFile.name = fileName('cutlist', 'txt');
    $('cutTxt').textContent = cutFile.text;
    $('cutStatus').textContent = '';
    $('cutSave').hidden = inFrame;
    openDialog($('cutDlg'));
  });
  $('cutSave').addEventListener('click', function () {
    var blob = new Blob(['﻿' + cutFile.text], { type: 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = cutFile.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 4000);
    $('cutStatus').textContent = 'กำลังดาวน์โหลด ' + cutFile.name;
  });
  $('cutCopy').addEventListener('click', function () {
    var done = function () {
      $('cutStatus').textContent = 'คัดลอกแล้ว วางในแชต LINE หรือโน้ตได้เลย';
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(cutFile.text).then(done, selectCut);
    else selectCut();
  });
  function selectCut() {
    var r = document.createRange();
    r.selectNodeContents($('cutTxt'));
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
    $('cutStatus').textContent = 'เลือกข้อความให้แล้ว กด Ctrl+C (หรือกดค้างแล้วคัดลอก)';
  }

  /* ---------- 3 มิติ ---------- */
  function syncViewbar() {
    var on = is3d();
    $('viewbar').hidden = !on;
    if (!on) return;
    pressed('#viewSeg button', 'view', stage.view);
    $('fullBtn').setAttribute('aria-pressed', String(isFull()));
    $('showBtn').setAttribute('aria-pressed', String(stage.showing));
    $('nightBtn').setAttribute('aria-pressed', String(!!st.night));
  }
  document.querySelectorAll('#viewSeg button').forEach(function (b) {
    b.addEventListener('click', function () {
      if (!stage) return;
      stage.setView(b.dataset.view);
      st.view = b.dataset.view;
      save();
      syncViewbar();
    });
  });
  $('showBtn').addEventListener('click', function () {
    if (!stage) return;
    if (stage.showing) stage.stopShow();
    else stage.startShow();
    syncViewbar();
  });
  $('nightBtn').addEventListener('click', function () {
    st.night = !st.night;
    save();
    draw();
  });
  // แตะภาพระหว่างหมุนโชว์ = หยุดหมุน แล้วหมุนเองต่อได้เลย
  view.addEventListener(
    'pointerdown',
    function () {
      if (stage && stage.showing) {
        stage.stopShow();
        syncViewbar();
      }
    },
    true
  );

  function init3d() {
    if (stage || !window.SignMockup.createStage3d) return;
    try {
      stage = window.SignMockup.createStage3d({ eventsEl: view, onFrame: composite3d });
      if (st.view && st.view !== 'angle') stage.setView(st.view);
      window.SignMockup.stage = stage; // ใช้ทดสอบ/ปรับแสง
      window.SignMockup.faceTexture = function () {
        return faceCache.canvas;
      };
    } catch (e) {
      stage = null; // เครื่องนี้ใช้ 3 มิติไม่ได้ → ใช้ภาพ 2 มิติต่อ
      return;
    }
    $('zoomRow').hidden = true;
    draw();
  }
  window.addEventListener('signmockup-3d', function () {
    // ฟอนต์ต้องพร้อมก่อน ไม่งั้นหน้าป้ายในเท็กซ์เจอร์ใช้ฟอนต์สำรอง
    setTimeout(init3d, 0);
  });
  init3d();
})();
