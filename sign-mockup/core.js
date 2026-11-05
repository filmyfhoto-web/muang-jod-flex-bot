/* นัดพอน Sign Mockup — ตรรกะล้วน (ไม่แตะหน้าเว็บ) ทดสอบได้ด้วย node
 * หน่วยความยาวทั้งหมดเป็น "เซนติเมตร" ตามที่ร้านป้ายคุยกับลูกค้า
 * ใช้ในเบราว์เซอร์เป็น window.SignMockup.core และใน node ด้วย require() */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) {
    root.SignMockup = root.SignMockup || {};
    root.SignMockup.core = api;
  }
})(typeof self !== 'undefined' ? self : typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ชนิดป้าย — unit: 'sqm' คิดราคาต่อตารางเมตร, 'set' คิดต่อชุด (รวมขาตั้ง)
   * mount: 'wall' ติดผนัง/รั้ว, 'floor' ตั้งพื้น */
  var TYPES = {
    vinyl: {
      name: 'ไวนิล ตาไก่',
      desc: 'เจาะตาไก่รอบป้าย ผูกเชือกหรือยิงตะปู',
      unit: 'sqm',
      mount: 'wall',
      presets: [[100, 50], [150, 50], [200, 100], [300, 100], [240, 120], [400, 200], [80, 200, 'ประตู 80×200']],
    },
    frame: {
      name: 'ไวนิลขึงโครง',
      desc: 'ขึงตึงบนโครงเหล็ก หนา 3 ซม.',
      unit: 'sqm',
      mount: 'wall',
      presets: [[120, 60], [200, 100], [240, 120], [300, 150], [400, 100]],
    },
    foam: {
      name: 'โฟมบอร์ด',
      desc: 'พิมพ์ติดบอร์ดหนา 5 มม. เรียบ แข็ง',
      unit: 'sqm',
      mount: 'wall',
      presets: [[29.7, 42, 'A3'], [42, 59.4, 'A2'], [59.4, 84.1, 'A1'], [84.1, 118.9, 'A0'], [60, 90], [120, 240]],
    },
    sticker: {
      name: 'สติ๊กเกอร์',
      desc: 'พิมพ์ติดประตู ผนัง กระจก แนบเรียบ',
      unit: 'sqm',
      mount: 'wall',
      presets: [[30, 10], [40, 15], [60, 20], [60, 90], [100, 50], [80, 200, 'ประตู 80×200']],
    },
    acrylic: {
      name: 'ป้ายอะคริลิค',
      desc: 'แผ่นใสเงา ยึดหมุดสแตนเลส 4 มุม',
      unit: 'sqm',
      mount: 'wall',
      presets: [[30, 20], [40, 30], [60, 40], [90, 60], [120, 60]],
    },
    lightbox: {
      name: 'ป้ายกล่องไฟ',
      desc: 'กล่องอะลูมิเนียม หนา 12 ซม. มีไฟในตัว',
      unit: 'sqm',
      mount: 'wall',
      presets: [[60, 40], [100, 50], [120, 60], [200, 80], [300, 100]],
    },
    rollup: {
      name: 'โรลอัพ',
      desc: 'ขาตั้งม้วนเก็บได้ ตั้งพื้น',
      unit: 'set',
      mount: 'floor',
      presets: [[80, 200], [85, 200], [100, 200], [120, 200]],
    },
    xstand: {
      name: 'X-Stand',
      desc: 'ขาตั้งไขว้ น้ำหนักเบา ตั้งพื้น',
      unit: 'set',
      mount: 'floor',
      presets: [[60, 160], [80, 180]],
    },
  };
  var TYPE_ORDER = ['vinyl', 'frame', 'foam', 'sticker', 'acrylic', 'lightbox', 'rollup', 'xstand'];

  var SCENES = {
    studio: { name: 'พื้นเรียบ', desc: 'โชว์งานชัด ๆ' },
    wall: { name: 'ผนังปูน', desc: 'ในร้าน / ในอาคาร' },
    brick: { name: 'ผนังอิฐ', desc: 'ร้านกาแฟ / ร้านอาหาร' },
    shop: { name: 'หน้าร้าน', desc: 'ตึกแถว ประตูม้วน' },
    fence: { name: 'รั้วกลางแจ้ง', desc: 'ป้ายประกาศ / ขายที่' },
    classDoor: {
      name: 'ประตูห้องเรียน',
      desc: 'ป้ายเต็มบาน / ป้ายชื่อห้อง',
      spots: [['full', 'เต็มบานประตู'], ['door', 'บนประตู'], ['above', 'เหนือประตู'], ['beside', 'ข้างประตู']],
      canOpen: true,
      tones: true,
    },
    officeDoor: { name: 'ประตูห้อง', desc: 'ห้องทำงาน / ห้องประชุม', spots: [['full', 'เต็มบานประตู'], ['door', 'บนประตู'], ['above', 'เหนือประตู'], ['beside', 'ข้างประตู']] },
    classroom: { name: 'ในห้องเรียน', desc: 'เหนือกระดาน / ผนังห้อง', spots: [['above', 'เหนือกระดาน'], ['beside', 'ข้างกระดาน']], tones: true },
    photo: { name: 'รูปหน้าร้านลูกค้า', desc: 'อัปโหลดรูป แล้วลากมุมป้าย' },
  };
  var SCENE_ORDER = ['studio', 'wall', 'brick', 'shop', 'fence', 'classDoor', 'officeDoor', 'classroom', 'photo'];

  // ประตูมาตรฐาน 90 × 210 ซม. / กระดานไวท์บอร์ด 240 × 120 ซม. (ขอบล่างสูง 90)
  var DOOR = { w: 90, h: 210 };
  var BOARD = { w: 240, h: 120, y0: 90 };

  // สีผนังอาคารเรียน (ล่าง / บน) — ชมพู-ฟ้าตามรูปที่ร้านส่งมา
  var WALL_TONES = {
    pink: { name: 'ชมพู-ฟ้า', lower: '#b5d6cf', upper: '#f2bfd4' },
    green: { name: 'ครีม-เขียว', lower: '#9fc4a8', upper: '#f7f1df' },
    cream: { name: 'ครีม-น้ำตาล', lower: '#c9a27c', upper: '#f5ecd5' },
    white: { name: 'ขาว-เทา', lower: '#b9bec4', upper: '#f3f2ef' },
  };
  var TONE_ORDER = ['pink', 'green', 'cream', 'white'];

  // คนยืนเทียบขนาด
  var PERSON = { h: 170, w: 50, gap: 45 };

  var MIN_CM = 5;
  var MAX_CM = 2000;

  function num(v) {
    var x = typeof v === 'number' ? v : parseFloat(String(v == null ? '' : v).replace(/,/g, ''));
    return isFinite(x) ? x : NaN;
  }

  function clampCm(v, fallback) {
    var x = num(v);
    if (!(x > 0)) return fallback;
    x = Math.round(x * 10) / 10;
    return Math.min(MAX_CM, Math.max(MIN_CM, x));
  }

  // 29.7 → "29.7", 200 → "200"
  function fmtCm(v) {
    var r = Math.round(v * 10) / 10;
    return String(r);
  }

  // เซนติเมตร → เมตร ตัดศูนย์ท้าย: 85 → "0.85", 200 → "2", 118.9 → "1.19"
  function fmtM(cm) {
    var m = Math.round(cm) / 100;
    return String(Math.round(m * 100) / 100);
  }

  function sizeText(w, h) {
    var t = fmtCm(w) + ' × ' + fmtCm(h) + ' ซม.';
    if (Math.max(w, h) >= 100) t += ' (' + fmtM(w) + ' × ' + fmtM(h) + ' ม.)';
    return t;
  }

  function areaSqm(w, h) {
    return (w * h) / 10000;
  }

  function fmtArea(w, h) {
    var a = areaSqm(w, h);
    var r = a >= 10 ? Math.round(a * 10) / 10 : Math.round(a * 100) / 100;
    return String(r) + ' ตร.ม.';
  }

  function baht(v) {
    var r = Math.round(v);
    return String(r).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  // พื้นที่ละเอียดสำหรับบรรทัดคำนวณราคา: 6.075 (ไม่ปัดจนเลขคูณไม่ตรง)
  function fmtAreaExact(w, h) {
    return String(Math.round(areaSqm(w, h) * 10000) / 10000) + ' ตร.ม.';
  }

  /* ราคา: ป้ายแผ่นคิด พื้นที่ × ราคาต่อตร.ม. ปัดขึ้นเป็นบาทต่อชิ้น แล้วคูณจำนวน
   * โรลอัพ / X-Stand คิดต่อชุด ไม่ใส่ราคา → has:false (ไม่โชว์ราคาบนภาพ) */
  function quote(o) {
    var t = TYPES[o.type] || TYPES.vinyl;
    var qty = Math.floor(num(o.qty));
    if (!(qty >= 1)) qty = 1;
    var rate = num(o.rate);
    var area = areaSqm(o.w, o.h);
    var res = { unit: t.unit, qty: qty, area: area, rate: rate > 0 ? rate : 0, per: 0, total: 0, has: false };
    if (!(rate > 0)) return res;
    // ป้ายแผ่นปัดเศษขึ้นเป็นบาท (ไม่ขาดทุนเศษสตางค์)
    res.per = t.unit === 'sqm' ? Math.ceil(area * rate - 1e-9) : Math.round(rate);
    res.total = res.per * qty;
    res.has = true;
    return res;
  }

  /* ตาไก่: ห่างขอบ 2.5 ซม. มุมละตัว แล้วเฉลี่ยตามขอบทุก ๆ ไม่เกิน 50 ซม. (ตามที่ร้านทั่วไปเจาะ) */
  function eyelets(w, h, step) {
    step = step || 50;
    var inset = Math.min(2.5, Math.min(w, h) * 0.1);
    var x0 = inset;
    var x1 = w - inset;
    var y0 = inset;
    var y1 = h - inset;
    var nx = Math.max(1, Math.ceil((x1 - x0) / step - 1e-9));
    var ny = Math.max(1, Math.ceil((y1 - y0) / step - 1e-9));
    var pts = [];
    for (var i = 0; i <= nx; i++) {
      var x = x0 + ((x1 - x0) * i) / nx;
      pts.push({ x: x, y: y0, side: 'top' });
      pts.push({ x: x, y: y1, side: 'bottom' });
    }
    for (var j = 1; j < ny; j++) {
      var y = y0 + ((y1 - y0) * j) / ny;
      pts.push({ x: x0, y: y, side: 'left' });
      pts.push({ x: x1, y: y, side: 'right' });
    }
    return pts;
  }

  /* กรอบรวมของชิ้นงาน (ซม.) จุดเริ่มคือมุมซ้ายบนของกรอบรวม
   * fx,fy = ตำแหน่งหน้าป้ายในกรอบ, depth = ความหนาที่เห็นด้านข้าง, gap = ระยะห่างจากผนัง (เงา) */
  function geometry(type, w, h) {
    var t = TYPES[type] ? type : 'vinyl';
    var g = { type: t, w: w, h: h, fx: 0, fy: 0, bw: w, bh: h, depth: 0, gap: 0.4, mount: TYPES[t].mount };
    if (t === 'frame') {
      g.depth = 3;
      g.gap = 3;
    } else if (t === 'foam') {
      g.depth = 0.5;
      g.gap = 0.3;
    } else if (t === 'acrylic') {
      g.depth = 0.8;
      g.gap = 2.5;
    } else if (t === 'sticker') {
      g.gap = 0; // แนบผิว ไม่มีเงา ไม่มีความหนา
    } else if (t === 'lightbox') {
      g.depth = 12;
      g.gap = 12;
      g.rim = 4; // ขอบอะลูมิเนียมรอบหน้าป้าย
    } else if (t === 'rollup') {
      // ราวบน 1.5 ซม. — หน้าป้าย — ฐานม้วนสูง 9 ซม. (ป้ายจมลงฐาน 1 ซม.) — ขารอง 1.5 ซม.
      g.rail = 1.5;
      g.base = 9;
      g.feet = 1.5;
      g.fx = 4;
      g.fy = g.rail;
      g.bw = w + 8;
      g.bh = g.rail + h - 1 + g.base + g.feet;
    } else if (t === 'xstand') {
      // ป้ายลอยจากพื้น 18 ซม. ขาไขว้ต่อเลยมุมล่างลงพื้น เอียงตามแนวทแยงของป้าย
      g.lift = 18;
      g.spread = (w * g.lift) / h;
      g.fx = g.spread;
      g.bw = w + 2 * g.spread;
      g.bh = h + g.lift;
    }
    g.ex = Math.min(g.depth * 0.5, 3); // ความหนาเห็นเฉียงขวาล่าง (ภาพ 2 มิติ)
    g.bw += g.ex;
    g.bh += g.ex;
    return g;
  }

  /* ความสูงจากพื้นถึงขอบล่างของชิ้นงาน (ซม.) ตามฉาก */
  /* ตำแหน่งติดป้ายในฉากที่มีประตู/กระดาน — ไม่เลือก (auto) ป้ายเล็กติดบนประตู ป้ายใหญ่ติดเหนือประตู */
  function resolveSpot(scene, spot, g) {
    var sc = SCENES[scene];
    if (!sc || !sc.spots) return null;
    for (var i = 0; i < sc.spots.length; i++) if (sc.spots[i][0] === spot) return spot;
    if (scene === 'classroom') return 'above';
    if (g && g.w >= 55 && g.w <= 110 && g.h >= 150 && g.h <= 230) return 'full'; // ขนาดเท่าบานประตู
    return g && g.w <= 90 && g.h <= 60 ? 'door' : 'above';
  }

  // ขนาดบานประตู: ป้ายเต็มบาน → บานใหญ่กว่าป้ายนิดหน่อย (ขอบละ 1.5 ซม.) ไม่งั้นใช้ 90 × 210
  function doorSize(scene, spot, g) {
    if (resolveSpot(scene, spot, g) === 'full') return { w: Math.round((g.w + 3) * 10) / 10, h: Math.round((g.h + 4) * 10) / 10 };
    return { w: DOOR.w, h: DOOR.h };
  }

  function mountBottom(scene, g, spot) {
    if (g.mount === 'floor') return 0;
    var sp = resolveSpot(scene, spot, g);
    if (sp === 'full') return 2.5; // บานลอยจากพื้น 1 ซม. + ขอบ 1.5 ซม.
    if (sp === 'door') return Math.max(20, Math.min(150 - g.h / 2, DOOR.h - 8 - g.h)); // ระดับสายตาบนบานประตู
    if (sp === 'above') return scene === 'classroom' ? BOARD.y0 + BOARD.h + 15 : DOOR.h + 12; // เหนือวงกบ
    if (sp === 'beside') return Math.max(40, 150 - g.bh / 2);
    if (scene === 'shop') return 290; // เหนือประตูม้วน (สูง 270)
    if (scene === 'fence') return Math.max(25, 110 - g.bh / 2);
    return Math.max(40, 150 - g.bh / 2); // กลางป้ายระดับสายตา 150 ซม.
  }

  /* กล้อง: s = พิกเซลต่อเซนติเมตร, left = ขอบซ้ายของชิ้นงานบนจอ, floorY = เส้นพื้นบนจอ
   * o: { scene, g, W, H, person, zoom } */
  function camera(o) {
    var g = o.g;
    var W = o.W;
    var H = o.H;
    var zoom = o.zoom > 0 ? o.zoom : 1;
    var bottom = mountBottom(o.scene, g, o.spot);
    var top = bottom + g.bh;
    var wantPerson = !!o.person;
    var span = wantPerson ? PERSON.gap + PERSON.w : 0;
    var floorLine = H * 0.87;
    var topLine = H * 0.07;
    var s;
    if (o.scene === 'studio') {
      s = Math.min((W * 0.7) / (g.bw + span), (H * 0.66) / Math.max(g.bh, wantPerson ? PERSON.h - bottom : 0));
    } else {
      var tallest = Math.max(top, wantPerson ? PERSON.h : 0) + 15;
      s = Math.min((floorLine - topLine) / tallest, (W * 0.9) / (g.bw + span));
      // ป้ายเล็ก (เช่น A3) ซูมเข้าให้เห็นงาน ไม่ให้เหลือจุดเล็กกลางผนัง
      var sMin = Math.min((W * 0.32) / g.bw, (H * 0.36) / g.bh);
      if (s < sMin) s = sMin;
    }
    s *= zoom;

    var centerY = bottom + g.bh / 2;
    var floorY = floorLine;
    if (o.scene === 'studio' || floorY - top * s < topLine) floorY = H * 0.47 + centerY * s;

    var person = wantPerson && PERSON.h * s <= floorY - H * 0.02 && floorY <= H * 1.02;
    var groupW = (g.bw + (person ? span : 0)) * s;
    if (person && groupW > W * 0.96) {
      person = false;
      groupW = g.bw * s;
    }
    var left = (W - groupW) / 2;
    var personX = left + (g.bw + PERSON.gap + PERSON.w / 2) * s;
    return {
      s: s,
      left: left,
      floorY: floorY,
      bottom: bottom,
      top: top,
      person: person,
      personX: personX,
      W: W,
      H: H,
    };
  }

  /* ขนาดผืนภาพ (หน่วยตรรกะ) ตามสัดส่วนที่เลือก */
  function canvasSize(aspect, g, photo) {
    if (photo && photo.w > 0 && photo.h > 0) {
      if (photo.w >= photo.h) return { W: 1600, H: Math.round((1600 * photo.h) / photo.w) };
      return { W: Math.round((1600 * photo.w) / photo.h), H: 1600 };
    }
    var a = aspect;
    if (!a || a === 'auto') a = g && g.bh / g.bw > 1.25 ? 'portrait' : 'landscape';
    if (a === 'portrait') return { W: 1200, H: 1500 };
    if (a === 'square') return { W: 1300, H: 1300 };
    return { W: 1600, H: 1000 };
  }

  // ตัวคูณขนาดตัวหนังสือ/เส้น ให้ภาพทุกสัดส่วนดูเท่ากัน
  function unitScale(W, H) {
    return Math.sqrt(W * H) / 1265;
  }

  /* ความสูงป้ายให้ตรงสัดส่วนรูป (ปัดครึ่งเซนติเมตร) */
  function heightForImage(w, imgW, imgH) {
    if (!(imgW > 0 && imgH > 0)) return w;
    return Math.round(((w * imgH) / imgW) * 2) / 2;
  }

  function ratioMismatch(w, h, imgW, imgH) {
    if (!(imgW > 0 && imgH > 0)) return false;
    var a = w / h;
    var b = imgW / imgH;
    return Math.abs(a - b) / b > 0.02;
  }

  // ครอปกลางให้เต็มกรอบ
  function coverCrop(iw, ih, bw, bh) {
    var s = Math.max(bw / iw, bh / ih);
    var sw = bw / s;
    var sh = bh / s;
    return { sx: (iw - sw) / 2, sy: (ih - sh) / 2, sw: sw, sh: sh };
  }

  // ย่อให้เห็นทั้งรูป วางกลางกรอบ
  function containRect(iw, ih, bw, bh) {
    var s = Math.min(bw / iw, bh / ih);
    var dw = iw * s;
    var dh = ih * s;
    return { dx: (bw - dw) / 2, dy: (bh - dh) / 2, dw: dw, dh: dh };
  }

  /* โฮโมกราฟีจากสี่เหลี่ยมหน่วย (u,v ∈ [0,1]) ไปยังสี่เหลี่ยมใด ๆ
   * q = [ซ้ายบน, ขวาบน, ขวาล่าง, ซ้ายล่าง] แต่ละจุด {x,y} (Heckbert 1989) */
  function homography(q) {
    var x0 = q[0].x, y0 = q[0].y, x1 = q[1].x, y1 = q[1].y;
    var x2 = q[2].x, y2 = q[2].y, x3 = q[3].x, y3 = q[3].y;
    var sx = x0 - x1 + x2 - x3;
    var sy = y0 - y1 + y2 - y3;
    var a, b, c, d, e, f, gg, hh;
    if (Math.abs(sx) < 1e-9 && Math.abs(sy) < 1e-9) {
      a = x1 - x0; b = x3 - x0; c = x0;
      d = y1 - y0; e = y3 - y0; f = y0;
      gg = 0; hh = 0;
    } else {
      var dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2;
      var den = dx1 * dy2 - dx2 * dy1;
      if (Math.abs(den) < 1e-12) den = 1e-12;
      gg = (sx * dy2 - dx2 * sy) / den;
      hh = (dx1 * sy - sx * dy1) / den;
      a = x1 - x0 + gg * x1; b = x3 - x0 + hh * x3; c = x0;
      d = y1 - y0 + gg * y1; e = y3 - y0 + hh * y3; f = y0;
    }
    return [a, b, c, d, e, f, gg, hh];
  }

  function project(H, u, v) {
    var w = H[6] * u + H[7] * v + 1;
    return { x: (H[0] * u + H[1] * v + H[2]) / w, y: (H[3] * u + H[4] * v + H[5]) / w };
  }

  // สี่เหลี่ยมนูนหรือไม่ (ลากมุมไขว้กันจะวาดไม่ได้)
  function isConvex(q) {
    var sign = 0;
    for (var i = 0; i < 4; i++) {
      var a = q[i], b = q[(i + 1) % 4], c = q[(i + 2) % 4];
      var z = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
      if (Math.abs(z) < 1e-9) return false;
      var sg = z > 0 ? 1 : -1;
      if (!sign) sign = sg;
      else if (sg !== sign) return false;
    }
    return true;
  }

  function pointInQuad(p, q) {
    var inside = false;
    for (var i = 0, j = 3; i < 4; j = i++) {
      var a = q[i], b = q[j];
      if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
  }

  /* สี่เหลี่ยมตั้งต้นบนรูปลูกค้า (สัดส่วน 0..1 ของภาพ) — กว้าง 45% กลางภาพ ตามสัดส่วนชิ้นงาน */
  function defaultQuad(g, W, H) {
    var bw = W * 0.45;
    var bh = (bw * g.bh) / g.bw;
    if (bh > H * 0.7) {
      bh = H * 0.7;
      bw = (bh * g.bw) / g.bh;
    }
    var x0 = (W - bw) / 2;
    var y0 = (H - bh) / 2;
    return [
      { x: x0 / W, y: y0 / H },
      { x: (x0 + bw) / W, y: y0 / H },
      { x: (x0 + bw) / W, y: (y0 + bh) / H },
      { x: x0 / W, y: (y0 + bh) / H },
    ];
  }

  function presetLabel(p) {
    return p[2] ? p[2] : fmtCm(p[0]) + '×' + fmtCm(p[1]);
  }

  // "081-234-5678" → "โทร 081-234-5678" (ถ้ายังไม่มีคำว่าโทร)
  function phoneText(t) {
    var s = String(t || '').trim();
    if (!s) return '';
    return /^(โทร|tel|call)/i.test(s) ? s : 'โทร ' + s;
  }

  function thaiDate(d) {
    var months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    return d.getDate() + ' ' + months[d.getMonth()] + ' ' + (d.getFullYear() + 543);
  }

  return {
    TYPES: TYPES,
    TYPE_ORDER: TYPE_ORDER,
    SCENES: SCENES,
    SCENE_ORDER: SCENE_ORDER,
    PERSON: PERSON,
    num: num,
    clampCm: clampCm,
    fmtCm: fmtCm,
    fmtM: fmtM,
    sizeText: sizeText,
    areaSqm: areaSqm,
    fmtArea: fmtArea,
    fmtAreaExact: fmtAreaExact,
    baht: baht,
    quote: quote,
    eyelets: eyelets,
    geometry: geometry,
    mountBottom: mountBottom,
    resolveSpot: resolveSpot,
    doorSize: doorSize,
    WALL_TONES: WALL_TONES,
    TONE_ORDER: TONE_ORDER,
    DOOR: DOOR,
    BOARD: BOARD,
    camera: camera,
    canvasSize: canvasSize,
    unitScale: unitScale,
    heightForImage: heightForImage,
    ratioMismatch: ratioMismatch,
    coverCrop: coverCrop,
    containRect: containRect,
    homography: homography,
    project: project,
    isConvex: isConvex,
    pointInQuad: pointInQuad,
    defaultQuad: defaultQuad,
    presetLabel: presetLabel,
    phoneText: phoneText,
    thaiDate: thaiDate,
  };
});
