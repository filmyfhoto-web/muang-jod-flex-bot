/* นัดพอน Sign Mockup — หน้าจอ: 4 ขั้น (งาน → ชนิด/ขนาด → ฉาก → ราคา/ส่งออก) + ติดตั้งเป็นแอป */
(function () {
  'use strict';
  var C = window.SignMockup.core;
  var R = window.SignMockup.render;
  var KEY = 'np-sign-mockup-v1';

  var UNIT_WORD = { vinyl: 'ผืน', frame: 'ผืน', foam: 'แผ่น', acrylic: 'แผ่น', rollup: 'ชุด', xstand: 'ชุด' };

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
  var imgDesign = null; // งานจากไฟล์ (ไม่เก็บลงเครื่อง ไฟล์ใหญ่)
  var textCache = { key: '', design: null };
  var photo = null; // { img, w, h, quad, touched }
  var logoImg = null;
  var customer = '';
  var lastOut = null;

  function load() {
    var s = JSON.parse(JSON.stringify(DEF));
    try {
      var saved = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (saved && typeof saved === 'object') {
        Object.keys(DEF).forEach(function (k) {
          if (saved[k] !== undefined && typeof saved[k] === typeof DEF[k]) s[k] = saved[k];
        });
        s.text = Object.assign({}, DEF.text, saved.text || {});
      }
    } catch (e) {}
    if (!C.TYPES[s.type]) s.type = DEF.type;
    if (!C.SCENES[s.scene] || s.scene === 'photo') s.scene = DEF.scene;
    s.mode = 'text'; // ไฟล์งานไม่ได้เก็บไว้ เปิดใหม่เริ่มที่ข้อความ
    s.w = C.clampCm(s.w, DEF.w);
    s.h = C.clampCm(s.h, DEF.h);
    return s;
  }
  var saveTimer = 0;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try {
        localStorage.setItem(KEY, JSON.stringify(st));
      } catch (e) {}
    }, 300);
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
  var queued = false;
  function draw() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () {
      queued = false;
      lastOut = R.render(view, renderState(), { preview: true });
      fitView();
      view.classList.toggle('editable', st.scene === 'photo' && !!photo);
      summary();
      thumbsSoon();
    });
  }

  // ย่อภาพให้พอดีกรอบเสมอ (ภาพแนวตั้งไม่ล้นจอ) — มือถือสูงไม่เกิน 36% ของจอ
  var phone = window.matchMedia ? window.matchMedia('(max-width: 900px)') : { matches: false };
  function fitView() {
    var box = $('canvasBox');
    var bw = box.clientWidth;
    var bh = phone.matches ? window.innerHeight * 0.36 : box.clientHeight;
    if (!(bw > 0 && bh > 0)) return;
    var a = view.width / view.height;
    var w = bw;
    var h = w / a;
    if (h > bh) {
      h = bh;
      w = h * a;
    }
    view.style.width = Math.floor(w) + 'px';
    view.style.height = Math.floor(h) + 'px';
  }
  window.addEventListener('resize', fitView);

  function summary() {
    var t = C.TYPES[st.type];
    var q = quoteNow();
    var html = '<b>' + esc(t.name) + '</b><span>' + esc(C.sizeText(st.w, st.h)) + '</span>';
    if (t.unit === 'sqm') html += '<span class="area">' + esc(C.fmtArea(st.w, st.h)) + '</span>';
    if (q.has) html += '<span class="price">' + esc(C.baht(q.total)) + ' บาท</span>';
    $('summary').innerHTML = html;
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
    else exportImage();
  });

  /* ---------- ไอคอนชนิดป้าย ---------- */
  var TYPE_ICON = {
    vinyl:
      '<svg viewBox="0 0 44 34"><rect x="4" y="6" width="36" height="22" rx="1"/><circle cx="7" cy="9" r="1.3"/><circle cx="22" cy="9" r="1.3"/><circle cx="37" cy="9" r="1.3"/><circle cx="7" cy="25" r="1.3"/><circle cx="22" cy="25" r="1.3"/><circle cx="37" cy="25" r="1.3"/></svg>',
    frame: '<svg viewBox="0 0 44 34"><rect x="4" y="5" width="34" height="22" rx="1"/><path d="M38 5l3 3v22H7l-3-3"/></svg>',
    foam: '<svg viewBox="0 0 44 34"><rect x="5" y="5" width="34" height="24" rx="1"/><path d="M39 6.5h1.5V30.5H6.5V29"/><path d="M11 12h16M11 17h22M11 22h12"/></svg>',
    acrylic:
      '<svg viewBox="0 0 44 34"><rect x="5" y="5" width="34" height="24" rx="2"/><circle cx="9" cy="9" r="1.6"/><circle cx="35" cy="9" r="1.6"/><circle cx="9" cy="25" r="1.6"/><circle cx="35" cy="25" r="1.6"/><path d="M16 26l9-18M21 26l6-12"/></svg>',
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
    thumbTimer = setTimeout(drawThumbs, 450);
  }
  function drawThumbs() {
    document.querySelectorAll('.scene').forEach(function (b) {
      var k = b.dataset.scene;
      var c = b.querySelector('canvas');
      if (!c) {
        if (k === 'photo' && photo) {
          var holder = b.querySelector('.thumb');
          holder.innerHTML = '<canvas width="16" height="10"></canvas>';
          c = holder.querySelector('canvas');
        } else return;
      }
      var s = renderState({ scene: k, info: false, dims: false, aspect: 'landscape', zoom: 1 });
      if (k !== 'photo') s.photo = null;
      R.render(c, s, { scale: 0.16 });
    });
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
    $('zoomRow').hidden = isPhoto;
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
    save();
    draw();
  }

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
  function setDesignFile(file) {
    if (!file) return;
    if (!isImage(file)) {
      toast('ไฟล์นี้เปิดไม่ได้ ใช้ JPG หรือ PNG (ไฟล์ PDF/AI ให้ Export เป็น JPG ก่อน)');
      return;
    }
    loadImage(file)
      .then(function (img) {
        imgDesign = R.prepareImage(img, 3000);
        $('fileThumb').src = img.src;
        $('fileName').textContent = file.name || 'รูปที่วาง';
        $('fileInfo').textContent = (img.naturalWidth || img.width) + ' × ' + (img.naturalHeight || img.height) + ' px';
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
    loadImage(file)
      .then(function (img) {
        var p = R.prepareImage(img, 2400);
        var size = C.canvasSize('auto', null, { w: p.w, h: p.h });
        var g = C.geometry(st.type, st.w, st.h);
        photo = { img: p.src, w: p.w, h: p.h, quad: C.defaultQuad(g, size.W, size.H), touched: false };
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

  /* ---------- ส่งออก ---------- */
  var lastBlob = null;
  var lastName = '';
  var lastUrl = '';
  var lastCanvas = null;
  function fileName() {
    var d = new Date();
    var p = function (n) {
      return (n < 10 ? '0' : '') + n;
    };
    // ชื่อไฟล์ใช้ตัวอังกฤษ/ตัวเลขเท่านั้น (ชื่อไทยบางเบราว์เซอร์กลายเป็น "download")
    var who = customer.trim().replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
    return 'mockup-' + (who ? who + '-' : '') + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + '.jpg';
  }
  function exportImage() {
    if (st.scene === 'photo' && photo && !C.isConvex((lastOut && lastOut.quad) || [])) {
      toast('มุมป้ายไขว้กันอยู่ จัดมุมให้เป็นสี่เหลี่ยมก่อนบันทึก');
      return;
    }
    var c = document.createElement('canvas');
    R.render(c, renderState(), { scale: 1.5, preview: false });
    lastCanvas = c;
    c.toBlob(
      function (blob) {
        if (!blob) {
          toast('บันทึกรูปไม่สำเร็จ ลองลดขนาดรูปที่ใส่แล้วลองใหม่');
          return;
        }
        if (lastUrl) URL.revokeObjectURL(lastUrl);
        lastBlob = blob;
        lastName = fileName();
        lastUrl = URL.createObjectURL(blob);
        $('exportImg').src = lastUrl;
        $('dlStatus').textContent = '';
        var file = new File([blob], lastName, { type: 'image/jpeg' });
        var canShare = false;
        try {
          canShare = !!(navigator.canShare && navigator.canShare({ files: [file] }));
        } catch (e) {}
        $('dlShare').hidden = !canShare;
        $('dlCopy').hidden = !(window.ClipboardItem && navigator.clipboard && navigator.clipboard.write);
        openDialog($('exportDlg'));
      },
      'image/jpeg',
      0.92
    );
  }
  $('exportBtn').addEventListener('click', exportImage);
  $('dlSave').addEventListener('click', function () {
    if (!lastUrl) return;
    var a = document.createElement('a');
    a.href = lastUrl;
    a.download = lastName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    $('dlStatus').textContent = 'กำลังดาวน์โหลด ' + lastName + ' — ถ้าไม่มีอะไรเกิดขึ้น ให้กดค้าง/คลิกขวาที่รูปเพื่อบันทึก';
  });
  $('dlShare').addEventListener('click', function () {
    if (!lastBlob) return;
    var file = new File([lastBlob], lastName, { type: 'image/jpeg' });
    navigator
      .share({ files: [file], title: 'ภาพจำลองป้าย' })
      .then(function () {
        $('dlStatus').textContent = 'เปิดหน้าแชร์แล้ว';
      })
      .catch(function (e) {
        if (e && e.name === 'AbortError') return;
        $('dlStatus').textContent = 'แชร์ไม่ได้ในเบราว์เซอร์นี้ ใช้ดาวน์โหลด หรือกดค้างที่รูปแทน';
      });
  });
  $('dlCopy').addEventListener('click', function () {
    if (!lastCanvas) return;
    var png = new Promise(function (resolve, reject) {
      lastCanvas.toBlob(function (b) {
        if (b) resolve(b);
        else reject(new Error('png'));
      }, 'image/png');
    });
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
      if (e.target === d || (e.target.closest && e.target.closest('[data-close]'))) {
        if (d.close) d.close();
        else d.removeAttribute('open');
      }
    });
  });

  /* ---------- ติดตั้งเป็นแอป ---------- */
  var inFrame = false;
  try {
    inFrame = window.top !== window.self;
  } catch (e) {
    inFrame = true;
  }
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
  if ('serviceWorker' in navigator && !inFrame && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }

  /* ---------- เริ่ม ---------- */
  buildTypes();
  buildThemes();
  buildScenes();
  if (st.logo) setLogo(st.logo);
  go(1);
  sync();
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
      draw();
    });
  }
})();
