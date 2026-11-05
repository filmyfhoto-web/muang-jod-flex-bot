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
    stand: {
      name: 'ป้ายขาตั้งโครงเหล็ก',
      desc: 'เหล็กกล่องเชื่อม ตั้งพื้น มีรายการตัดเหล็ก',
      unit: 'set',
      mount: 'floor',
      presets: [[60, 90], [80, 120], [100, 150], [120, 80], [120, 180], [240, 120]],
    },
    cnc: {
      name: 'ป้ายโครงการ CNC',
      desc: 'อักษรนูนตัด CNC บนแผ่นอะลูมิเนียมคอมโพสิต ตั้งเสาคู่',
      unit: 'set',
      mount: 'floor',
      presets: [[120, 80], [150, 100], [200, 100], [240, 120], [300, 150], [400, 200]],
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
  var TYPE_ORDER = ['vinyl', 'frame', 'foam', 'sticker', 'acrylic', 'lightbox', 'stand', 'cnc', 'rollup', 'xstand'];

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

  /* ---------- โครงเหล็ก: ป้ายขาตั้งโครงเหล็ก / ไวนิลขึงโครง ----------
   * หน่วยความยาวเป็น ซม. (เหล็กกล่องเป็น มม.) — ค่าเบื้องต้นสำหรับจัดแบบ ต้องตรวจวัสดุ แรงลม จุดยึดก่อนผลิต */
  var TUBES = [
    [19, '¾ นิ้ว (6 หุน)'],
    [25, '1 นิ้ว'],
    [32, '1¼ นิ้ว'],
    [38, '1½ นิ้ว'],
    [50, '2 นิ้ว'],
  ];
  var WALLS = [1, 1.2, 1.5, 2, 2.3];
  var STEEL_DEF = { total: 0, depth: 0, tube: 25, wall: 1.2, nh: -1, nv: -1, cut: 'miter', base: 'rect', price: 0, frameOnly: false, color: '#1f2125' };
  var STOCK = 600; // เหล็กเส้นยาว 6 ม.
  var KERF = 0.3; // คมเลื่อย 3 มม.

  // ค่าที่ใช้จริง (0 / -1 = อัตโนมัติ) — ความสูงรวมเริ่มที่ ป้าย + 30 ซม. ฐานลึก 40% ของความสูงรวม
  // คร่าวนอนห่างไม่เกิน 60 ซม. คร่าวตั้งห่างไม่เกิน 100 ซม.
  function steelOpts(w, h, o) {
    o = o || {};
    var r = {};
    for (var k in STEEL_DEF) r[k] = o[k] !== undefined && o[k] !== null ? o[k] : STEEL_DEF[k];
    var tube = num(r.tube);
    r.tube = tube >= 10 && tube <= 100 ? tube : 25;
    var wall = num(r.wall);
    r.wall = wall > 0 && wall < r.tube / 2 ? wall : 1.2;
    var T = r.tube / 10;
    r.T = T;
    var total = num(r.total);
    r.autoTotal = !(total > 0);
    r.total = r.autoTotal ? h + 30 : Math.min(h + 300, Math.max(h + T, total));
    var depth = num(r.depth);
    r.autoDepth = !(depth > 0);
    r.depth = r.autoDepth ? Math.min(150, Math.max(40, Math.round((r.total * 0.4) / 5) * 5)) : Math.min(300, Math.max(T * 2 + 5, depth));
    var nh = Math.floor(num(r.nh));
    var nv = Math.floor(num(r.nv));
    r.autoNh = !(r.nh !== '' && r.nh >= 0);
    r.autoNv = !(r.nv !== '' && r.nv >= 0);
    r.nh = r.autoNh ? Math.max(0, Math.ceil((h - 2 * T) / 60) - 1) : Math.min(20, nh);
    r.nv = r.autoNv ? Math.max(0, Math.ceil((w - 2 * T) / 100) - 1) : Math.min(20, nv);
    r.cut = r.cut === 'butt' ? 'butt' : 'miter';
    r.base = r.base === 'feet' ? 'feet' : 'rect';
    r.price = Math.max(0, num(r.price) || 0);
    r.frameOnly = !!r.frameOnly;
    r.color = metalColor(r.color);
    // ช่องโครงใหญ่สุด (ภายในกรอบ หักคร่าว)
    r.bayW = Math.round(((w - 2 * T - r.nv * T) / (r.nv + 1)) * 10) / 10;
    r.bayH = Math.round(((h - 2 * T - r.nh * T) / (r.nh + 1)) * 10) / 10;
    r.wide = r.bayW > 100 || r.bayH > 60;
    return r;
  }

  function r1(v) {
    return Math.round(v * 10) / 10;
  }

  // เหล็กเส้นยาว 6 ม.: เรียงชิ้นยาวก่อน ใส่เส้นแรกที่ยังพอ (เผื่อคมเลื่อยทุกชิ้น)
  function packBars(lengths, stock, kerf) {
    stock = stock || STOCK;
    kerf = kerf == null ? KERF : kerf;
    var bars = [];
    var over = [];
    lengths
      .slice()
      .sort(function (a, b) {
        return b - a;
      })
      .forEach(function (L) {
        if (L > stock) {
          over.push(L);
          return;
        }
        for (var i = 0; i < bars.length; i++) {
          if (bars[i].left >= L + (bars[i].cuts.length ? kerf : 0)) {
            bars[i].left -= L + (bars[i].cuts.length ? kerf : 0);
            bars[i].cuts.push(L);
            return;
          }
        }
        bars.push({ cuts: [L], left: stock - L });
      });
    bars.forEach(function (b) {
      b.left = r1(b.left);
    });
    return { bars: bars, count: bars.length, waste: r1(bars.reduce(function (s, b) { return s + b.left; }, 0)), over: over };
  }

  // น้ำหนักเหล็กกล่องสี่เหลี่ยม (กก./ม.) = พื้นที่หน้าตัด (มม.²) × 7.85 / 1000
  function tubeKgPerM(a, t) {
    return ((4 * a * t - 4 * t * t) * 7.85) / 1000;
  }

  /* รายการตัดเหล็ก: kind 'stand' = ขาตั้ง (เสา 2 ต้นต่อจากกรอบลงพื้น + ฐาน) · 'wall' = กรอบติดผนังอย่างเดียว
   * ตัดเข้ามุม 45° ที่มุมกรอบนอก/มุมฐาน (วัดความยาวด้านยาว) · คร่าวชนกลางตัดตรง */
  function steelCut(kind, w, h, opts) {
    var o = steelOpts(w, h, opts);
    var T = o.T;
    var m = o.cut === 'miter';
    var parts = [];
    function add(name, qty, len, note) {
      if (qty > 0 && len > 0) parts.push({ name: name, qty: qty, len: r1(len), note: note });
    }
    var STRAIGHT = 'ตัดตรง 90°';
    if (kind === 'stand') {
      var baseT = T; // เสายืนบนเหล็กฐาน
      add('เสาและกรอบแนวตั้ง', 2, o.total - baseT, m ? '45° ปลายบน · วัดด้านยาว' : STRAIGHT);
      add('คานกรอบบน', 1, m ? w : w - 2 * T, m ? '45° สองปลาย · วัดด้านยาว' : STRAIGHT);
      add('คานกรอบล่าง', 1, w - 2 * T, STRAIGHT);
    } else {
      add('กรอบแนวตั้ง', 2, m ? h : h, m ? '45° สองปลาย · วัดด้านยาว' : STRAIGHT);
      add('กรอบแนวนอน', 2, m ? w : w - 2 * T, m ? '45° สองปลาย · วัดด้านยาว' : STRAIGHT);
    }
    add('คร่าวนอน', o.nh, w - 2 * T, STRAIGHT);
    add('คร่าวตั้ง', o.nv * (o.nh + 1), (h - 2 * T - o.nh * T) / (o.nh + 1), STRAIGHT);
    if (kind === 'stand') {
      if (o.base === 'rect') {
        add('ฐานแนวลึก', 2, o.depth, m ? '45° สองปลาย · วัดด้านยาว' : STRAIGHT);
        add('คานฐานแนวขวาง', 2, m ? w : w - 2 * T, m ? '45° สองปลาย · วัดด้านยาว' : STRAIGHT);
      } else {
        add('ขาฐาน (ตัว T)', 2, o.depth, STRAIGHT + ' · ปิดปลายด้วยจุกพลาสติก');
      }
    }
    var lengths = [];
    var total = 0;
    var pieces = 0;
    parts.forEach(function (p) {
      total += p.qty * p.len;
      pieces += p.qty;
      for (var i = 0; i < p.qty; i++) lengths.push(p.len);
    });
    var pack = packBars(lengths);
    var kgm = tubeKgPerM(o.tube, o.wall);
    return {
      kind: kind,
      opts: o,
      parts: parts,
      total: r1(total),
      pieces: pieces,
      pack: pack,
      kgPerM: Math.round(kgm * 1000) / 1000,
      kg: Math.round((total / 100) * kgm * 10) / 10,
      cost: o.price > 0 ? Math.round(pack.count * o.price) : 0,
    };
  }

  function tubeText(o) {
    return o.tube + '×' + o.tube + '×' + o.wall + ' มม.';
  }

  /* กรอบรวมของชิ้นงาน (ซม.) จุดเริ่มคือมุมซ้ายบนของกรอบรวม
   * fx,fy = ตำแหน่งหน้าป้ายในกรอบ, depth = ความหนาที่เห็นด้านข้าง, gap = ระยะห่างจากผนัง (เงา) */
  function geometry(type, w, h, steel) {
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
    } else if (t === 'stand') {
      // โครงเหล็กกล่อง: หน้าป้าย = กรอบนอก · เสาคือด้านข้างกรอบต่อลงพื้น · ฐานลึกตามตั้งค่า
      var so = steelOpts(w, h, steel);
      g.steel = so;
      g.T = so.T;
      g.total = so.total;
      g.lift = so.total - h;
      g.baseD = so.depth;
      g.depth = so.T;
      g.gap = 0;
      g.bh = so.total;
    } else if (t === 'cnc') {
      g.steel = { color: steel && steel.color ? metalColor(steel.color) : '' };
      // แผ่น ACP บนโครงเหล็กหนา 5 ซม. อักษรนูน 1.5 ซม. — เสาเหล็กกล่อง 10 ซม. ซ้าย/ขวา ยื่นเหนือแผ่น 4 ซม.
      // ขอบล่างแผ่นสูงจากพื้น 80 ซม.
      g.depth = 5;
      g.gap = 0;
      g.relief = 1.5;
      g.post = 10;
      g.cap = 4;
      g.lift = 80;
      g.fx = g.post;
      g.fy = g.cap;
      g.bw = w + 2 * g.post;
      g.bh = g.cap + h + g.lift;
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

  // ความหนา/ระยะยื่นจากผนัง (แกน Z) ของแต่ละชนิด — โชว์ในกล่องขนาดป้าย
  var DEPTH = {
    vinyl: 'ผ้าใบ 0.5 มม.',
    frame: 'โครงหนา 3 ซม.',
    foam: 'บอร์ดหนา 5 มม.',
    sticker: 'แนบผิว',
    acrylic: 'แผ่น 8 มม. + หมุด 2.5 ซม.',
    lightbox: 'กล่องหนา 12 ซม.',
    cnc: 'แผ่น 5 ซม. + อักษรนูน 1.5 ซม.',
    stand: 'เหล็กกล่อง + ฐาน',
    rollup: 'ฐานลึก 40 ซม.',
    xstand: 'ขากาง 45 ซม.',
  };

  // เลขที่ใบเสนอราคา: Q + ปี พ.ศ. 2 หลัก + เดือน วัน - ชั่วโมง นาที  เช่น Q691105-1430
  function quoteNo(d) {
    var p = function (n) {
      return (n < 10 ? '0' : '') + n;
    };
    return 'Q' + String(d.getFullYear() + 543).slice(-2) + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes());
  }

  /* PDF หน้าเดียวจากภาพ JPEG เต็มหน้า (ค่าเริ่มต้น A4 แนวตั้ง) — ไม่ต้องใช้ไลบรารี
   * jpeg: Uint8Array ของไฟล์ JPEG, w/h: ขนาดภาพเป็นพิกเซล → คืน Uint8Array ของไฟล์ PDF */
  function pdfFromJpeg(jpeg, w, h, pageW, pageH) {
    pageW = pageW || 595.28;
    pageH = pageH || 841.89;
    var enc = function (str) {
      var a = new Uint8Array(str.length);
      for (var i = 0; i < str.length; i++) a[i] = str.charCodeAt(i) & 0xff;
      return a;
    };
    var parts = [];
    var offsets = [];
    var pos = 0;
    function push(u8) {
      parts.push(u8);
      pos += u8.length;
    }
    function obj(n, body, stream) {
      offsets[n] = pos;
      if (stream) {
        push(enc(n + ' 0 obj\n' + body + '\nstream\n'));
        push(stream);
        push(enc('\nendstream\nendobj\n'));
      } else push(enc(n + ' 0 obj\n' + body + '\nendobj\n'));
    }
    push(enc('%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n'));
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
    obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
    obj(3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + pageW + ' ' + pageH + '] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>');
    obj(4, '<< /Type /XObject /Subtype /Image /Width ' + w + ' /Height ' + h + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + jpeg.length + ' >>', jpeg);
    var content = 'q ' + pageW + ' 0 0 ' + pageH + ' 0 0 cm /Im0 Do Q';
    obj(5, '<< /Length ' + content.length + ' >>', enc(content));
    var xref = pos;
    var x = 'xref\n0 6\n0000000000 65535 f \n';
    for (var n = 1; n <= 5; n++) x += ('0000000000' + offsets[n]).slice(-10) + ' 00000 n \n';
    x += 'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
    push(enc(x));
    var out = new Uint8Array(pos);
    var o = 0;
    for (var i = 0; i < parts.length; i++) {
      out.set(parts[i], o);
      o += parts[i].length;
    }
    return out;
  }

  // จำนวนเงินเป็นตัวหนังสือ (แบบใบเสนอราคา/ใบเสร็จ): 1520 → "หนึ่งพันห้าร้อยยี่สิบบาทถ้วน"
  var DIGIT = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
  var PLACE = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน'];
  function readGroup(x) {
    var str = String(x);
    var out = '';
    for (var i = 0; i < str.length; i++) {
      var d = +str[i];
      var p = str.length - i - 1;
      if (!d) continue;
      if (p === 1 && d === 1) out += 'สิบ';
      else if (p === 1 && d === 2) out += 'ยี่สิบ';
      else if (p === 0 && d === 1 && x > 10) out += 'เอ็ด';
      else out += DIGIT[d] + PLACE[p];
    }
    return out;
  }
  function readNumber(x) {
    if (x >= 1e6) {
      var lo = x % 1e6;
      return readNumber(Math.floor(x / 1e6)) + 'ล้าน' + (lo ? readGroup(lo) : '');
    }
    return readGroup(x);
  }
  function bahtText(v) {
    var n = Math.round(Math.abs(num(v)) * 100);
    var b = Math.floor(n / 100);
    var s = n % 100;
    if (!b && !s) return 'ศูนย์บาทถ้วน';
    return (b ? readNumber(b) + 'บาท' : '') + (s ? readNumber(s) + 'สตางค์' : 'ถ้วน');
  }

  /* ---------- ตัวเลือกของร้าน (ชุดสี สีผนัง ขนาดประจำ ชนิด/ฉากที่ใช้) ----------
   * เก็บในเครื่อง + ส่งออก/นำเข้าเป็นไฟล์ — ไฟล์ที่นำเข้าตรวจทุกช่อง (สีต้องเป็น #rrggbb เท่านั้น) */
  var HEX = /^#[0-9a-fA-F]{6}$/;
  function cleanHex(c, d) {
    return typeof c === 'string' && HEX.test(c) ? c.toLowerCase() : d;
  }
  function cleanName(s, d) {
    var t = String(s == null ? '' : s)
      .replace(/[\u0000-\u001f\u007f<>]/g, '')
      .trim()
      .slice(0, 40);
    return t || d;
  }
  function cleanId(s, prefix) {
    s = String(s || '');
    return s.indexOf(prefix) === 0 && /^[a-z0-9_-]{3,40}$/i.test(s) ? s : prefix + Math.random().toString(36).slice(2, 10);
  }
  function normalizeOptions(o) {
    o = o && typeof o === 'object' ? o : {};
    var themes = (Array.isArray(o.themes) ? o.themes : []).slice(0, 40).map(function (t) {
      t = t || {};
      return {
        id: cleanId(t.id, 'c-'),
        name: cleanName(t.name, 'ชุดสีของร้าน'),
        bg: cleanHex(t.bg, '#1f2a4d'),
        bg2: cleanHex(t.bg2, '#2d3d6b'),
        title: cleanHex(t.title, '#ffffff'),
        sub: cleanHex(t.sub, '#f4a46e'),
        pillBg: cleanHex(t.pillBg, '#d9622b'),
        pillFg: cleanHex(t.pillFg, '#ffffff'),
      };
    });
    var tones = (Array.isArray(o.tones) ? o.tones : []).slice(0, 40).map(function (t) {
      t = t || {};
      return { id: cleanId(t.id, 't-'), name: cleanName(t.name, 'สีผนังของร้าน'), upper: cleanHex(t.upper, '#f3f2ef'), lower: cleanHex(t.lower, '#b9bec4') };
    });
    var presets = {};
    var src = o.presets && typeof o.presets === 'object' ? o.presets : {};
    Object.keys(TYPES).forEach(function (k) {
      if (!Array.isArray(src[k])) return;
      var list = [];
      src[k].slice(0, 12).forEach(function (p) {
        if (!Array.isArray(p)) return;
        var w = clampCm(p[0], 0);
        var h = clampCm(p[1], 0);
        if (w > 0 && h > 0 && !list.some(function (q) { return q[0] === w && q[1] === h; })) list.push([w, h]);
      });
      if (list.length) presets[k] = list;
    });
    var pick = function (arr, table) {
      return (Array.isArray(arr) ? arr : []).filter(function (k, i, a) {
        return typeof k === 'string' && Object.prototype.hasOwnProperty.call(table, k) && a.indexOf(k) === i;
      });
    };
    var hideTypes = pick(o.hideTypes, TYPES);
    if (hideTypes.length >= TYPE_ORDER.length) hideTypes = hideTypes.slice(0, TYPE_ORDER.length - 1); // ต้องเหลืออย่างน้อย 1 ชนิด
    return { v: 1, themes: themes, tones: tones, presets: presets, hideTypes: hideTypes, hideScenes: pick(o.hideScenes, SCENES) };
  }
  // ใส่สีผนังของร้านต่อท้ายสีมาตรฐาน (ลบชุดเก่าของร้านออกก่อน)
  var BASE_TONES = TONE_ORDER.slice();
  function applyTones(list) {
    Object.keys(WALL_TONES).forEach(function (k) {
      if (BASE_TONES.indexOf(k) < 0) delete WALL_TONES[k];
    });
    TONE_ORDER.length = 0;
    BASE_TONES.forEach(function (k) {
      TONE_ORDER.push(k);
    });
    (list || []).forEach(function (t) {
      WALL_TONES[t.id] = { name: t.name, upper: t.upper, lower: t.lower, mine: true };
      TONE_ORDER.push(t.id);
    });
  }

  // สีโครงเหล็ก/เสา: 'inox' = สแตนเลส (โลหะเงา)
  var METALS = [
    ['#1f2125', 'ดำ'],
    ['#4b5058', 'เทาเข้ม'],
    ['#e9e8e4', 'ขาว'],
    ['inox', 'สแตนเลส'],
    ['#4a3426', 'น้ำตาล'],
  ];
  function metalColor(c) {
    return c === 'inox' ? 'inox' : cleanHex(c, '#1f2125');
  }

  // ฟอนต์ไทยจาก Google Fonts (w = น้ำหนักที่มีจริง ถ้าขอเกินจะโหลดไม่ขึ้น)
  var FONTS = [
    ['Kanit', '400;500;600;700'],
    ['Prompt', '400;500;600;700'],
    ['Mitr', '400;500;600;700'],
    ['Sarabun', '400;500;600;700'],
    ['Chakra Petch', '400;500;600;700'],
    ['Bai Jamjuree', '400;500;600;700'],
    ['K2D', '400;500;600;700'],
    ['Athiti', '400;500;600;700'],
    ['Niramit', '400;500;600;700'],
    ['Krub', '400;500;600;700'],
    ['Mali', '400;500;600;700'],
    ['Pridi', '400;500;600;700'],
    ['Taviraj', '400;500;600;700'],
    ['Charm', '400;700'],
    ['Itim', ''],
    ['Sriracha', ''],
    ['Chonburi', ''],
    ['Pattaya', ''],
  ];
  function fontCssUrl(name) {
    for (var i = 0; i < FONTS.length; i++) {
      if (FONTS[i][0] === name) {
        return 'https://fonts.googleapis.com/css2?family=' + name.replace(/ /g, '+') + (FONTS[i][1] ? ':wght@' + FONTS[i][1] : '') + '&display=swap';
      }
    }
    return '';
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
    DEPTH: DEPTH,
    quoteNo: quoteNo,
    pdfFromJpeg: pdfFromJpeg,
    bahtText: bahtText,
    TUBES: TUBES,
    WALLS: WALLS,
    STEEL_DEF: STEEL_DEF,
    STOCK: STOCK,
    KERF: KERF,
    steelOpts: steelOpts,
    steelCut: steelCut,
    packBars: packBars,
    tubeKgPerM: tubeKgPerM,
    tubeText: tubeText,
    normalizeOptions: normalizeOptions,
    applyTones: applyTones,
    METALS: METALS,
    metalColor: metalColor,
    FONTS: FONTS,
    fontCssUrl: fontCssUrl,
  };
});
