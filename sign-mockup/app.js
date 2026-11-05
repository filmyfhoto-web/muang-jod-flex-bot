/* นัดพอน Sign Mockup — หน้าจอ: 4 ขั้น (งาน → ชนิด/ขนาด → ฉาก → ราคา/ส่งออก) + ติดตั้งเป็นแอป */
(function () {
  'use strict';
  var NS = window.SignMockup;
  var C = NS.core;
  var R = NS.render;
  var KEY = 'np-sign-mockup-v1';
  // รุ่นของโปรแกรม — ต้องตรงกับ VERSION ใน sw.js (เลื่อนทั้งคู่ทุกครั้งที่ปล่อยรุ่นใหม่ แอปที่ติดตั้งไว้จะอัปเดตเอง)
  var APP_VERSION = '3.0.0';

  var UNIT_WORD = { vinyl: 'ผืน', frame: 'ผืน', foam: 'แผ่น', sticker: 'แผ่น', acrylic: 'แผ่น', lightbox: 'ป้าย', rollup: 'ชุด', xstand: 'ชุด' };

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
    panel: 'right', // แผงตั้งค่าอยู่ขวา/ซ้าย
    fmt: 'jpg', // ชนิดรูปที่ส่งออกล่าสุด (jpg / png)
    qty: 1,
    rates: {},
    shopName: 'นัดพอน',
    shopPhone: '',
    logo: '',
    text: { title: 'ก๋วยเตี๋ยวเรือ\nสูตรเจ้าเก่า', sub: 'เปิดทุกวัน 07:00 – 15:00', phone: '08X-XXX-XXXX', theme: 'brand' },
  };

  /* ---------- สถานะ ---------- */
  var st = load();
  var step = 1;
  var imgDesign = null; // งานจากไฟล์ { src, w, h, bg, id, blob, name, thumb, px } (ไฟล์เก็บใน IndexedDB)
  var textCache = { key: '', design: null };
  var photo = null; // { id, img, w, h, quad, touched, blob }
  var logoImg = null;
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
    }
    if (!C.TYPES[s.type]) s.type = DEF.type;
    if (!C.SCENES[s.scene]) s.scene = DEF.scene;
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
  var NOHIST = { panel: 1, view: 1, fmt: 1, logo: 1 };
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
    var key = [t.title, t.sub, t.phone, t.theme, st.w, st.h].join('|');
    if (textCache.key !== key) textCache = { key: key, design: R.textDesign(t, st.w, st.h) };
    return textCache.design;
  }

  function quoteNow() {
    return C.quote({ type: st.type, w: st.w, h: st.h, qty: st.qty, rate: st.rates[st.type] });
  }

  function footerInfo() {
    var t = C.TYPES[st.type];
    var q = quoteNow();
    var unit = UNIT_WORD[st.type];
    var line2 = [];
    if (t.unit === 'sqm') line2.push('พื้นที่ ' + C.fmtArea(st.w, st.h));
    line2.push('จำนวน ' + q.qty + ' ' + unit);
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
      price: q.has ? C.baht(q.total) + ' บาท' : '',
      priceNote: q.has ? (q.qty > 1 ? 'ราคารวม (' + unit + 'ละ ' + C.baht(q.per) + ' บาท)' : 'ราคา') : '',
      logo: logoImg,
    };
  }

  function renderState(over) {
    var s = {
      design: currentDesign(),
      fit: st.fit,
      type: st.type,
      w: st.w,
      h: st.h,
      scene: st.scene,
      spot: st.spot,
      tone: st.tone,
      photo: photo,
      person: st.person,
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
    return !!stage && !(st.scene === 'photo' && photo);
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
      view.classList.toggle('editable', st.scene === 'photo' && !!photo);
      syncViewbar();
      summary();
      thumbsSoon();
    });
  }

  // หน้าป้าย (เท็กซ์เจอร์) ตามสัดส่วนจริง — กล่องไฟเว้นขอบอะลูมิเนียม 4 ซม.
  function face3d() {
    var d = currentDesign();
    var lb = st.type === 'lightbox';
    var fw = lb ? Math.max(1, st.w - 8) : st.w;
    var fh = lb ? Math.max(1, st.h - 8) : st.h;
    var key = [d.id || textCache.key, st.fit, fw, fh].join('|');
    if (faceCache.key !== key) faceCache = { key: key, canvas: R.faceCanvas(d, fw, fh, st.fit, 2048), bg: d.bg };
    return faceCache;
  }

  function draw3d() {
    var g = C.geometry(st.type, st.w, st.h);
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
    stage.update({
      type: st.type,
      w: st.w,
      h: st.h,
      scene: st.scene === 'photo' ? 'studio' : st.scene,
      spot: st.spot,
      doorOpen: st.doorOpen,
      tone: st.tone,
      person: st.person,
      night: st.night,
      face: fc.canvas,
      faceKey: fc.key,
      edge: fc.bg,
    });
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
    if (q.has) html += '<span class="price">' + esc(C.baht(q.total)) + ' บาท</span>';
    $('summary').innerHTML = html;
    // กล่องขนาดป้ายมุมภาพ: กว้าง (X) / สูง (Y) / หนา (Z)
    $('ibW').textContent = C.fmtCm(st.w) + ' ซม.';
    $('ibH').textContent = C.fmtCm(st.h) + ' ซม.';
    $('ibD').textContent = C.DEPTH[st.type] || '';
    $('ibAreaRow').hidden = t.unit !== 'sqm';
    $('ibA').textContent = C.fmtArea(st.w, st.h);
    $('infoBox').hidden = false;
    $('sizeReadout').textContent = C.sizeText(st.w, st.h) + (t.unit === 'sqm' ? ' · พื้นที่ ' + C.fmtArea(st.w, st.h) : '');
    var unit = UNIT_WORD[st.type];
    $('qtyUnit').textContent = unit;
    $('rateLabel').textContent = t.unit === 'sqm' ? 'ราคาต่อ ตร.ม.' : 'ราคาต่อชุด';
    var pr = $('priceReadout');
    if (q.has) {
      var how =
        t.unit === 'sqm'
          ? C.fmtAreaExact(st.w, st.h) + ' × ' + C.baht(q.rate) + ' บาท = ' + unit + 'ละ ' + C.baht(q.per) + ' บาท' + (Math.abs(q.area * q.rate - q.per) > 1e-6 ? ' (ปัดเศษขึ้น)' : '')
          : 'ชุดละ ' + C.baht(q.per) + ' บาท';
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
    rollup: '<svg viewBox="0 0 44 34"><path d="M15 2h14"/><rect x="15.5" y="3" width="13" height="25"/><rect x="12" y="27" width="20" height="4" rx="1.5"/></svg>',
    xstand: '<svg viewBox="0 0 44 34"><rect x="15" y="2" width="14" height="24"/><path d="M15 26l-4 6M29 26l4 6"/></svg>',
  };

  function buildTypes() {
    var box = $('types');
    box.innerHTML = '';
    C.TYPE_ORDER.forEach(function (k) {
      var t = C.TYPES[k];
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'card';
      b.dataset.type = k;
      b.innerHTML = TYPE_ICON[k] + '<b>' + esc(t.name) + '</b><small>' + esc(t.desc) + '</small>';
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
    if (t.mount === 'floor' && (C.TYPES[was].mount !== 'floor' || was !== k)) {
      var p = t.presets[t.presets.length > 1 ? 1 : 0];
      st.w = p[0];
      st.h = p[1];
    } else if (t.mount === 'wall' && C.TYPES[was].mount === 'floor') {
      var q = t.presets[2] || t.presets[0];
      st.w = q[0];
      st.h = q[1];
      if (st.mode === 'image' && imgDesign) st.h = C.heightForImage(st.w, imgDesign.w, imgDesign.h);
    }
    refreshPhotoQuad();
    sync();
  }

  function buildPresets() {
    var box = $('presets');
    box.innerHTML = '';
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
  function buildScenes() {
    var box = $('scenes');
    box.innerHTML = '';
    C.SCENE_ORDER.forEach(function (k) {
      var sc = C.SCENES[k];
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'scene';
      b.dataset.scene = k;
      b.innerHTML = '<span class="thumb">' + (k === 'photo' ? CAMERA_ICON : '<canvas width="16" height="10"></canvas>') + '</span><b>' + esc(sc.name) + '</b><small>' + esc(sc.desc) + '</small>';
      b.addEventListener('click', function () {
        st.scene = k;
        if (k === 'photo' && !photo) $('photoFile').click();
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
      if (stage && b.dataset.scene !== 'photo') {
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
      var s = renderState({ scene: k, info: false, dims: false, aspect: 'landscape', zoom: 1 });
      if (k !== 'photo') s.photo = null;
      R.render(c, s, { scale: 0.16 });
    });
  }

  /* ---------- ตำแหน่งติดป้าย (ฉากประตู / ห้องเรียน) ---------- */
  function buildSpots() {
    var sc = C.SCENES[st.scene];
    var field = $('spotField');
    var box = $('spotSeg');
    if (!sc || !sc.spots || C.TYPES[st.type].mount === 'floor') {
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
        if (C.TYPES[st.type].mount === 'wall' && C.ratioMismatch(st.w, st.h, imgDesign.w, imgDesign.h)) {
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
    Object.keys(R.THEMES).forEach(function (k) {
      var th = R.THEMES[k];
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'swatch';
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
    st.qty = v >= 1 ? Math.min(v, 9999) : 1;
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

  function setLogo(dataUrl) {
    if (!dataUrl) {
      logoImg = null;
      $('logoThumb').hidden = true;
      $('logoClear').hidden = true;
      $('logoBtnText').textContent = 'ใส่โลโก้ร้าน';
      draw();
      return;
    }
    var img = new Image();
    img.onload = function () {
      logoImg = img;
      $('logoThumb').src = dataUrl;
      $('logoThumb').hidden = false;
      $('logoClear').hidden = false;
      $('logoBtnText').textContent = 'เปลี่ยนโลโก้';
      draw();
    };
    img.src = dataUrl;
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
    var unit = UNIT_WORD[st.type];
    x.fillStyle = '#ffffff';
    x.fillRect(0, 0, W, H);

    // หัวกระดาษ
    x.fillStyle = NAVY;
    x.fillRect(0, 0, W, 200);
    x.fillStyle = ORANGE;
    x.fillRect(0, 200, W, 8);
    var lx = M;
    if (logoImg) {
      var lh = 104;
      var lw = Math.min(240, (lh * (logoImg.naturalWidth || logoImg.width)) / (logoImg.naturalHeight || logoImg.height));
      x.fillStyle = '#ffffff';
      rrect(x, M - 10, 38, lw + 20, lh + 20, 14);
      x.fill();
      x.drawImage(logoImg, M, 48, lw, lh);
      lx = M + lw + 34;
    }
    x.textBaseline = 'alphabetic';
    x.textAlign = 'left';
    x.fillStyle = '#ffffff';
    fitText(x, st.shopName.trim() || 'ร้านป้าย', lx, 104, W / 2 + 40 - lx, 600, 46, DISP);
    x.fillStyle = '#aeb8d4';
    if (st.shopPhone.trim()) fitText(x, C.phoneText(st.shopPhone), lx, 148, W / 2 + 40 - lx, 400, 26, BODY);
    x.textAlign = 'right';
    x.fillStyle = '#ffffff';
    font(x, 600, 56, DISP);
    x.fillText('ใบเสนอราคา', W - M, 106);
    x.fillStyle = '#aeb8d4';
    font(x, 500, 22, BODY);
    x.fillText('QUOTATION', W - M, 144);

    // ลูกค้า / เลขที่ / วันที่
    var y = 268;
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

    // ภาพจำลอง
    var by = 352;
    var bh = 640;
    x.fillStyle = '#f3f1ec';
    rrect(x, M, by, CW, bh, 18);
    x.fill();
    var sc = Math.min((CW - 24) / mock.width, (bh - 24) / mock.height);
    var iw = mock.width * sc;
    var ih = mock.height * sc;
    var ix = M + (CW - iw) / 2;
    var iy = by + (bh - ih) / 2;
    x.save();
    rrect(x, ix, iy, iw, ih, 10);
    x.clip();
    x.drawImage(mock, ix, iy, iw, ih);
    x.restore();

    // ตารางรายการ
    var ty = by + bh + 40;
    var col = { item: M + 22, size: M + 470, qty: M + 742, per: M + 905, total: W - M - 22 };
    x.fillStyle = NAVY;
    rrect(x, M, ty, CW, 56, 10);
    x.fill();
    x.fillStyle = '#ffffff';
    font(x, 600, 22, BODY);
    x.textAlign = 'left';
    x.fillText('รายการ', col.item, ty + 37);
    x.fillText('ขนาด', col.size, ty + 37);
    x.textAlign = 'center';
    x.fillText('จำนวน', col.qty, ty + 37);
    x.textAlign = 'right';
    x.fillText(t.unit === 'sqm' ? 'ราคา/' + unit : 'ราคา/ชุด', col.per, ty + 37);
    x.fillText('รวม (บาท)', col.total, ty + 37);
    var ry = ty + 56;
    var rh = 132;
    x.textAlign = 'left';
    x.fillStyle = INK;
    fitText(x, t.name, col.item, ry + 46, 420, 600, 30, DISP);
    x.fillStyle = INK2;
    fitText(x, t.desc, col.item, ry + 82, 420, 400, 20, BODY);
    if (q.has && t.unit === 'sqm') {
      x.fillStyle = INK3;
      fitText(x, 'คิดจาก ' + C.fmtAreaExact(st.w, st.h) + ' × ' + C.baht(q.rate) + ' บาท/ตร.ม.', col.item, ry + 114, 420, 400, 19, BODY);
    }
    x.fillStyle = INK;
    font(x, 600, 26, BODY);
    x.fillText(C.fmtCm(st.w) + ' × ' + C.fmtCm(st.h) + ' ซม.', col.size, ry + 46);
    x.fillStyle = INK2;
    font(x, 400, 20, BODY);
    if (t.unit === 'sqm') x.fillText('พื้นที่ ' + C.fmtArea(st.w, st.h), col.size, ry + 82);
    else x.fillText('รวมขาตั้ง + กระเป๋า', col.size, ry + 82);
    x.textAlign = 'center';
    x.fillStyle = INK;
    font(x, 600, 26, BODY);
    x.fillText(q.qty + ' ' + unit, col.qty, ry + 46);
    x.textAlign = 'right';
    x.fillText(q.has ? C.baht(q.per) : '—', col.per, ry + 46);
    x.fillText(q.has ? C.baht(q.total) : '—', col.total, ry + 46);
    x.strokeStyle = LINE;
    x.lineWidth = 2;
    x.beginPath();
    x.moveTo(M, ry + rh);
    x.lineTo(W - M, ry + rh);
    x.stroke();

    // ยอดรวม (ขวา) + หมายเหตุ (ซ้าย)
    var sy = ry + rh + 30;
    var tw = 430;
    x.fillStyle = '#fbe8dc';
    rrect(x, W - M - tw, sy, tw, 150, 16);
    x.fill();
    x.textAlign = 'right';
    x.fillStyle = INK2;
    font(x, 500, 22, BODY);
    x.fillText('รวมทั้งสิ้น', W - M - 24, sy + 40);
    if (q.has) {
      x.fillStyle = '#b8491a';
      fitText(x, C.baht(q.total) + ' บาท', W - M - 24, sy + 96, tw - 48, 600, 50, DISP);
      x.fillStyle = INK2;
      fitText(x, '(' + C.bahtText(q.total) + ')', W - M - 24, sy + 132, tw - 48, 400, 19, BODY);
    } else {
      x.fillStyle = INK3;
      font(x, 500, 26, BODY);
      x.fillText('ยังไม่ได้ใส่ราคา', W - M - 24, sy + 96);
    }
    x.textAlign = 'left';
    x.fillStyle = INK;
    font(x, 600, 22, BODY);
    x.fillText('หมายเหตุ', M, sy + 32);
    x.fillStyle = INK2;
    var notes = [
      'ภาพจำลองเพื่อประกอบการตัดสินใจ สีและรายละเอียดจริงอาจต่างจากหน้าจอเล็กน้อย',
      'กรุณาตรวจข้อความ ตัวสะกด เบอร์โทร และขนาด ก่อนยืนยันสั่งผลิต',
      t.name + ': ' + (C.DEPTH[st.type] || ''),
    ];
    notes.forEach(function (n, i) {
      fitText(x, '• ' + n, M, sy + 68 + i * 34, CW - tw - 40, 400, 19, BODY);
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

  function buildExport(fmt) {
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
  function kb(n) {
    return n >= 1048576 ? (Math.round((n / 1048576) * 10) / 10).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
  }
  var FMT_HINT = {
    jpg: 'มือถือ: กดค้างที่รูปแล้วเลือก “บันทึกรูปภาพ” · คอมพิวเตอร์: คลิกขวาที่รูป หรือกดดาวน์โหลด',
    png: 'PNG คมชัดที่สุด ไม่มีรอยบีบอัด (ไฟล์ใหญ่กว่า JPG) เหมาะกับงานที่มีตัวหนังสือเล็ก',
    pdf: 'ใบเสนอราคา A4 พร้อมภาพจำลอง ราคา และช่องเซ็นชื่อ ส่งทาง LINE หรือสั่งพิมพ์ได้เลย',
    glb: 'ไฟล์ 3 มิติของตัวป้าย หมุนดูได้ทุกมุม เปิดด้วย 3D Viewer ใน Windows, แอปดูไฟล์ 3 มิติในมือถือ หรือส่งให้ทีมออกแบบ',
  };
  function openExport(fmt) {
    if (st.scene === 'photo' && photo && !C.isConvex((lastOut && lastOut.quad) || [])) {
      toast('มุมป้ายไขว้กันอยู่ จัดมุมให้เป็นสี่เหลี่ยมก่อนบันทึก');
      return;
    }
    if (fmt === 'glb' && !is3d()) fmt = 'jpg';
    exp.fmt = fmt;
    if ((fmt === 'jpg' || fmt === 'png') && st.fmt !== fmt) {
      st.fmt = fmt;
      save();
    }
    pressed('#fmtSeg button', 'fmt', fmt);
    $('fmtGlb').hidden = !is3d();
    $('exportTitle').textContent = fmt === 'pdf' ? 'ใบเสนอราคา' : fmt === 'glb' ? 'ไฟล์ 3 มิติ' : 'รูปพร้อมส่งลูกค้า';
    $('dlHint').textContent = inFrame && fmt !== 'glb' ? 'มือถือ: กดค้างที่รูปแล้วเลือก “บันทึกรูปภาพ” · คอมพิวเตอร์: คลิกขวาที่รูป แล้วเลือกบันทึกรูป' : FMT_HINT[fmt];
    $('dlStatus').textContent = 'กำลังเตรียมไฟล์…';
    ['dlShare', 'dlCopy', 'dlSave'].forEach(function (id) {
      $(id).disabled = true;
    });
    var job = ++exp.job;
    if (!$('exportDlg').open) openDialog($('exportDlg'));
    buildExport(fmt)
      .then(function (r) {
        if (job === exp.job) showExport(r);
      })
      .catch(function () {
        if (job !== exp.job) return;
        $('dlStatus').textContent = fmt === 'glb' ? 'สร้างไฟล์ 3 มิติไม่สำเร็จ ลองใหม่อีกครั้ง' : 'บันทึกไฟล์ไม่สำเร็จ ลองลดขนาดรูปที่ใส่แล้วลองใหม่';
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
    $('dlgImg').hidden = !r.preview;
    $('dlgFile').hidden = !!r.preview;
    if (r.preview) $('exportImg').src = exp.purl || exp.url;
    else {
      $('dlgFileName').textContent = r.name;
      $('dlgFileInfo').textContent = 'ไฟล์ 3 มิติ (glTF Binary) · ' + kb(r.blob.size) + ' · ' + C.TYPES[st.type].name + ' ' + C.sizeText(st.w, st.h);
    }
    var file = new File([r.blob], r.name, { type: r.blob.type });
    var canShare = false;
    try {
      canShare = !!(navigator.canShare && navigator.canShare({ files: [file] }));
    } catch (e) {}
    // เปิดอยู่ในกรอบของเว็บอื่น (พรีวิว) ดาวน์โหลด/แชร์/คัดลอกถูกปิด เหลือกดค้าง/คลิกขวาที่รูป
    $('dlShare').hidden = inFrame || !canShare;
    $('dlCopy').hidden = inFrame || !r.canvas || !(window.ClipboardItem && navigator.clipboard && navigator.clipboard.write);
    $('dlSave').hidden = inFrame;
    $('dlCopy').textContent = exp.fmt === 'pdf' ? 'คัดลอกเป็นรูป' : 'คัดลอกรูป';
    ['dlShare', 'dlCopy', 'dlSave'].forEach(function (id) {
      $(id).disabled = false;
    });
    $('dlStatus').textContent = inFrame && exp.fmt === 'glb' ? 'หน้าพรีวิวดาวน์โหลดไฟล์ไม่ได้ เปิดแอปจริงเพื่อดาวน์โหลด' : '';
  }
  $('exportBtn').addEventListener('click', function () {
    openExport(imageFmt());
  });
  $('quoteBtn').addEventListener('click', function () {
    openExport('pdf');
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
      .share({ files: [file], title: exp.fmt === 'pdf' ? 'ใบเสนอราคา' : 'ภาพจำลองป้าย' })
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
    sticker: 'sticker สติกเกอร์ สติ้กเกอร์ ติดกระจก ฟิล์ม ประตู',
    acrylic: 'acrylic อะคริลิก อคริลิค ใส หมุด',
    lightbox: 'lightbox กล่องไฟ ไฟ led กลางคืน',
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
  buildTypes();
  buildThemes();
  buildScenes();
  if (st.logo) setLogo(st.logo);
  go(1);
  sync();
  restoreCurrent();
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
