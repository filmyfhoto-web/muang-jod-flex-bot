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
      desc: 'อักษรนูนตัด CNC บนแผ่นอะลูมิเนียมคอมโพสิต ตั้งเสาคู่หรือติดผนัง',
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
    // บัตรสมนาคุณ / คูปอง / บัตรคิว / นามบัตร — รันนัมเบอร์ได้ ส่งออกไฟล์พิมพ์จัดหน้าเต็มแผ่น
    card: {
      name: 'บัตร / บัตรสมนาคุณ',
      desc: 'อาร์ตการ์ด รันนัมเบอร์ได้ มีต้นขั้วฉีก จัดหน้าพิมพ์ให้',
      unit: 'pcs',
      word: 'ใบ',
      mount: 'wall',
      small: true,
      presets: [[18, 7, 'บัตรสมนาคุณ'], [20, 8, 'คูปอง + ต้นขั้ว'], [9, 5.5, 'นามบัตร'], [8.6, 5.4, 'บัตรสมาชิก'], [10, 15, 'บัตรเชิญ'], [7, 10, 'บัตรคิว']],
    },
  };
  // ---- ป้ายหน้าร้าน / อีเวนต์ / งานพิมพ์เพิ่มเติม ----
  TYPES.letters = {
    name: 'ป้ายตัวอักษร (ติดผนัง)',
    desc: 'ตัวอักษรอะคริลิค/สแตนเลส/ทอง ลอยจากผนัง มีไฟได้',
    unit: 'set',
    mount: 'wall',
    presets: [[200, 50], [300, 60], [150, 40], [400, 80], [120, 30]],
  };
  TYPES.neon = {
    name: 'ป้ายไฟนีออน LED',
    desc: 'นีออนเฟล็กซ์ดัดตามตัวอักษร บนแผ่นอะคริลิคใส',
    unit: 'set',
    mount: 'wall',
    presets: [[60, 40], [80, 50], [100, 60], [120, 60], [150, 80]],
  };
  TYPES.blade = {
    name: 'ป้ายยื่น (แขวนสองหน้า)',
    desc: 'กล่องป้ายสองหน้ายื่นจากผนัง แขนเหล็กยึด มีไฟได้',
    unit: 'set',
    mount: 'wall',
    presets: [[60, 60], [50, 80], [80, 40], [60, 90], [40, 120]],
  };
  TYPES.flag = {
    name: 'ธงญี่ปุ่น',
    desc: 'ธงผ้าทรงยาวบนเสา ฐานถ่วงน้ำ ตั้งหน้าร้าน/งานอีเวนต์',
    unit: 'set',
    mount: 'floor',
    presets: [[60, 180], [70, 200], [80, 240], [60, 150], [90, 300]],
  };
  TYPES.backdrop = {
    name: 'ฉากแบ็คดรอป (อีเวนต์)',
    desc: 'ไวนิลบนโครงทรัส ตั้งพื้น เวที บูธ มุมถ่ายรูป',
    unit: 'sqm',
    mount: 'floor',
    presets: [[300, 200], [400, 250], [500, 300], [600, 300], [240, 240]],
  };
  TYPES.billboard = {
    name: 'บิลบอร์ด (ริมถนน)',
    desc: 'ป้ายใหญ่บนเสาเดี่ยว ทางเดินซ่อมบำรุง ไฟส่อง',
    unit: 'sqm',
    mount: 'floor',
    presets: [[600, 300], [800, 400], [1200, 500], [1000, 300], [400, 200]],
  };
  TYPES.poster = {
    name: 'โปสเตอร์ / ใบปลิว',
    desc: 'พิมพ์กระดาษอาร์ต A5–A2 แจก ติดบอร์ด แปะหน้าร้าน',
    unit: 'pcs',
    word: 'แผ่น',
    mount: 'wall',
    small: true,
    base: 'card', // หน้าตาแบบงานกระดาษ (ไม่มีเลขรัน)
    run: false,
    presets: [[21, 29.7, 'A4'], [29.7, 42, 'A3'], [14.8, 21, 'A5'], [42, 59.4, 'A2'], [10, 21, 'ใบปลิว DL']],
  };
  TYPES.tablestand = {
    name: 'ป้ายตั้งโต๊ะ / เมนู',
    desc: 'อะคริลิคใสเสียบกระดาษ ตั้งบนโต๊ะ เคาน์เตอร์',
    unit: 'pcs',
    word: 'อัน',
    mount: 'floor',
    small: true,
    presets: [[14.8, 21, 'A5'], [21, 29.7, 'A4'], [10, 15, '4×6 นิ้ว'], [9.9, 21, 'DL']],
  };
  var TYPE_ORDER = ['vinyl', 'frame', 'foam', 'sticker', 'acrylic', 'lightbox', 'letters', 'neon', 'blade', 'stand', 'cnc', 'billboard', 'backdrop', 'flag', 'rollup', 'xstand', 'card', 'poster', 'tablestand'];
  var BASE_TYPES = TYPE_ORDER.slice(); // ชนิดมาตรฐาน (ชนิดของร้านเพิ่มต่อท้าย)
  // ชนิดของร้านใช้หน้าตาของชนิดมาตรฐานเหล่านี้ได้ (ขาตั้งเหล็ก/CNC มีโครงสร้างเฉพาะ ไม่เปิดให้ยืม)
  var LOOK_TYPES = ['vinyl', 'frame', 'foam', 'sticker', 'acrylic', 'lightbox', 'letters', 'neon', 'blade', 'flag', 'backdrop', 'billboard', 'rollup', 'xstand', 'card', 'tablestand'];
  // ชนิดหน้าตาที่ใช้วาด (ชนิดของร้าน → ชนิดมาตรฐานที่ยืมหน้าตามา)
  function baseType(type) {
    var t = TYPES[type];
    if (!t) return 'vinyl';
    return t.base && TYPES[t.base] ? t.base : type;
  }

  /* ฉาก — small: เฉพาะงานชิ้นเล็ก (บัตร) · big: เฉพาะป้าย (บัตรไม่ต้องโชว์ฉากนี้) */
  var SCENES = {
    paper: { name: 'บนกระดาษ', desc: 'วางบัตรบนกระดาษ ภาพสินค้า', small: true, papers: true, wallOnly: true },
    hand: { name: 'มือถือบัตร', desc: 'ยื่นบัตรให้ลูกค้าดู', small: true, wallOnly: true },
    table: { name: 'บนโต๊ะ / เคาน์เตอร์', desc: 'ตั้งบนโต๊ะในร้าน', small: true },
    event: { name: 'ห้องจัดงาน', desc: 'เวที บูธ งานอีเวนต์', big: true },
    road: { name: 'ริมถนน', desc: 'บิลบอร์ด ธง ป้ายตั้งพื้นกลางแจ้ง', big: true, floorOnly: true },
    studio: { name: 'พื้นเรียบ', desc: 'โชว์งานชัด ๆ' },
    wall: { name: 'ผนังปูน', desc: 'ในร้าน / ในอาคาร' },
    brick: { name: 'ผนังอิฐ', desc: 'ร้านกาแฟ / ร้านอาหาร' },
    shop: { name: 'หน้าร้าน', desc: 'ตึกแถว ประตูม้วน', big: true },
    fence: { name: 'รั้วกลางแจ้ง', desc: 'ป้ายประกาศ / ขายที่', big: true },
    classDoor: {
      name: 'ประตูห้องเรียน',
      desc: 'ป้ายเต็มบาน / ป้ายชื่อห้อง',
      spots: [['full', 'เต็มบานประตู'], ['door', 'บนประตู'], ['above', 'เหนือประตู'], ['beside', 'ข้างประตู']],
      canOpen: true,
      tones: true,
      big: true,
    },
    officeDoor: { name: 'ประตูห้อง', desc: 'ห้องทำงาน / ห้องประชุม', spots: [['full', 'เต็มบานประตู'], ['door', 'บนประตู'], ['above', 'เหนือประตู'], ['beside', 'ข้างประตู']], big: true },
    classroom: { name: 'ในห้องเรียน', desc: 'เหนือกระดาน / ผนังห้อง', spots: [['above', 'เหนือกระดาน'], ['beside', 'ข้างกระดาน']], tones: true, big: true },
    photo: { name: 'รูปหน้าร้านลูกค้า', desc: 'อัปโหลดรูป แล้วลากมุมป้าย' },
  };
  var SCENE_ORDER = ['paper', 'hand', 'table', 'studio', 'wall', 'brick', 'shop', 'fence', 'road', 'event', 'classDoor', 'officeDoor', 'classroom', 'photo'];
  var TABLE_H = 75; // ความสูงโต๊ะ/เคาน์เตอร์ (ซม.)
  // ฉากนี้ใช้กับชนิดงานนี้ได้ไหม (บัตร ↔ ป้าย) · ฉากเริ่มต้นของชนิดงาน
  function sceneFits(scene, type) {
    var sc = SCENES[scene];
    var t = TYPES[type];
    if (!sc || !t) return false;
    if (sc.small && !t.small) return false;
    if (sc.big && t.small) return false;
    if (sc.wallOnly && TYPES[baseType(type)].mount === 'floor') return false; // ป้ายตั้งโต๊ะไม่วางบนกระดาษ/ไม่ถือในมือ
    if (sc.floorOnly && TYPES[baseType(type)].mount !== 'floor') return false; // ริมถนนไม่มีผนังให้ติด
    return true;
  }
  function defaultScene(type) {
    var t = TYPES[type];
    if (!t) return 'shop';
    if (t.small) return TYPES[baseType(type)].mount === 'floor' ? 'table' : 'paper';
    var b = baseType(type);
    if (b === 'backdrop') return 'event';
    if (b === 'billboard' || b === 'flag') return 'road';
    if (b === 'neon') return 'brick';
    return 'shop';
  }
  // สีกระดาษรองบัตร (ฉาก "บนกระดาษ")
  var PAPERS = {
    white: { name: 'ขาว', color: '#f2f0ea' },
    kraft: { name: 'คราฟท์', color: '#c9a476' },
    black: { name: 'ดำ', color: '#2c2c30' },
    pink: { name: 'ชมพู', color: '#f1d6d8' },
    mint: { name: 'มิ้นท์', color: '#d3e8de' },
  };
  var PAPER_ORDER = ['white', 'kraft', 'black', 'pink', 'mint'];

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

  // ป้าย CNC มีเสาไหม (ค่าเริ่มต้น = มีเสา ตั้งพื้น) — posts: false = ไม่มีเสา ติดผนัง
  function cncPosts(steel) {
    return !(steel && steel.posts === false);
  }

  /* กรอบรวมของชิ้นงาน (ซม.) จุดเริ่มคือมุมซ้ายบนของกรอบรวม
   * fx,fy = ตำแหน่งหน้าป้ายในกรอบ, depth = ความหนาที่เห็นด้านข้าง, gap = ระยะห่างจากผนัง (เงา) */
  function geometry(type, w, h, steel) {
    var t = baseType(type);
    var g = { type: t, kind: TYPES[type] ? type : t, w: w, h: h, fx: 0, fy: 0, bw: w, bh: h, depth: 0, gap: 0.4, mount: TYPES[t].mount };
    if (t === 'frame') {
      g.depth = 3;
      g.gap = 3;
    } else if (t === 'foam') {
      g.depth = 0.5;
      g.gap = 0.3;
    } else if (t === 'acrylic') {
      g.depth = 0.8;
      g.gap = 2.5;
    } else if (t === 'card') {
      g.depth = 0.035; // อาร์ตการ์ด 300–350 แกรม หนา ~0.35 มม.
      g.gap = 0.25;
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
      // แผ่น ACP บนโครงเหล็กหนา 5 ซม. อักษรนูน 1.5 ซม.
      g.depth = 5;
      g.relief = 1.5;
      if (!cncPosts(steel)) {
        // ไม่มีเสา: ยึดผนัง/รั้ว/อาคาร ลอยจากผนัง 1 ซม. (ขายึดหลังแผ่น) ความสูงตามฉาก
        g.mount = 'wall';
        g.noPosts = true;
        g.post = g.cap = g.lift = 0;
        g.gap = 6;
      } else {
        // ตั้งเสาเหล็กกล่อง 10 ซม. ซ้าย/ขวา ยื่นเหนือแผ่น 4 ซม. · ขอบล่างแผ่นสูงจากพื้น 80 ซม.
        g.gap = 0;
        g.post = 10;
        g.cap = 4;
        g.lift = 80;
        g.fx = g.post;
        g.fy = g.cap;
        g.bw = w + 2 * g.post;
        g.bh = g.cap + h + g.lift;
      }
    } else if (t === 'letters') {
      // ตัวอักษรหนา 3 ซม. ลอยจากผนัง 2.5 ซม. (ไม่มีแผ่นพื้น)
      g.depth = 3;
      g.gap = 2.5;
      g.relief = 3;
    } else if (t === 'neon') {
      // หลอดนีออน 1.5 ซม. บนอะคริลิคใสลอยจากผนัง 3 ซม.
      g.depth = 1.5;
      g.gap = 3;
    } else if (t === 'blade') {
      // กล่องสองหน้าหนา 12 ซม. ตั้งฉากกับผนัง แขนยื่น 15 ซม.
      g.depth = 12;
      g.gap = 0;
      g.arm = 15;
      g.fx = g.arm;
      g.fy = 8; // แขนเหล็กเหนือกล่อง
      g.bw = w + g.arm;
      g.bh = h + g.fy;
    } else if (t === 'flag') {
      // เสาข้างซ้าย 4 ซม. ราวบน 12 ซม. ชายธงลอยจากพื้น 30 ซม.
      g.pole = 4;
      g.cap = 12;
      g.lift = 30;
      g.gap = 0;
      g.fx = 24; // เสา + ครึ่งฐานถ่วงน้ำ (ภาพ 2 มิติ)
      g.fy = g.cap;
      g.bw = w + g.fx + 2;
      g.bh = g.cap + h + g.lift;
    } else if (t === 'backdrop') {
      // ทรัสสี่เหลี่ยม 30 ซม. สองข้าง + บน · ไวนิลลอยจากพื้น 10 ซม.
      g.post = 30;
      g.lift = 10;
      g.depth = 30;
      g.gap = 0;
      g.fx = g.post;
      g.fy = g.post;
      g.bw = w + 2 * g.post;
      g.bh = g.post + h + g.lift;
    } else if (t === 'billboard') {
      // เสาเดี่ยว ขอบล่างป้ายสูงจากพื้น ≥ 4 ม. · ไฟส่องยื่นเหนือป้าย 60 ซม.
      g.lift = Math.max(400, Math.round(h * 1.3));
      g.cap = 60;
      g.depth = 40;
      g.gap = 0;
      g.fy = g.cap;
      g.bh = g.cap + h + g.lift;
    } else if (t === 'tablestand') {
      // อะคริลิคพับ L ฐานลึก 7 ซม. หนา 0.5 ซม.
      g.lift = 0.5;
      g.depth = 7;
      g.gap = 0;
      g.bh = h + g.lift;
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
    if (scene === 'table') return TABLE_H; // ตั้ง/พิงบนโต๊ะ
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
    card: 'อาร์ตการ์ด 300–350 แกรม',
    letters: 'ตัวอักษรหนา 3 ซม. ลอยจากผนัง 2.5 ซม.',
    neon: 'นีออน 1.5 ซม. + อะคริลิคใส',
    blade: 'กล่องสองหน้า 12 ซม. + แขนยื่น',
    flag: 'เสาข้าง + ฐานถ่วงน้ำ',
    backdrop: 'โครงทรัส 30 ซม.',
    billboard: 'เสาเดี่ยว + ทางเดิน + ไฟส่อง',
    poster: 'กระดาษอาร์ต 160 แกรม',
    tablestand: 'อะคริลิคใส ฐานลึก 7 ซม.',
  };
  function depthText(type) {
    return DEPTH[type] || DEPTH[baseType(type)] || '';
  }

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

  /* ---------- บัตรรันนัมเบอร์ ----------
   * เลขรัน = คำนำหน้า (เช่น No. / เลขที่) + ตัวเลขเติม 0 ให้ครบหลัก  เริ่มที่ start นับไปทีละ 1 ตามจำนวนใบ
   * ตำแหน่งเลข: มุมขวาบน/ขวาล่าง/ซ้ายบน/ซ้ายล่าง ห่างขอบ 5 มม. · ต้นขั้ว (ฝั่งซ้าย) ใส่เลขเดียวกันอีกที่ */
  var PT = 2.54 / 72; // 1 pt = กี่ ซม.
  var RUN_SIZES = { s: 9, m: 12, l: 16 }; // ขนาดตัวเลข (pt)
  var RUN_POS = ['tr', 'br', 'tl', 'bl'];
  var DIGIT_EM = 0.556; // ความกว้างตัวเลข Helvetica/Arial ตัวหนา (ทุกตัวกว้างเท่ากัน)
  function normalizeRun(r) {
    r = r && typeof r === 'object' ? r : {};
    var start = Math.floor(num(r.start));
    var digits = Math.floor(num(r.digits));
    var stub = num(r.stub);
    return {
      on: r.on !== false,
      prefix: String(r.prefix == null ? 'No.' : r.prefix)
        .replace(/[\u0000-\u001f\u007f<>()\\]/g, '')
        .slice(0, 12),
      start: start >= 0 && start <= 9999999 ? start : 1,
      digits: digits >= 1 && digits <= 7 ? digits : 4,
      pos: RUN_POS.indexOf(r.pos) >= 0 ? r.pos : 'tr',
      size: RUN_SIZES[r.size] ? r.size : 'm',
      color: cleanHex(r.color, '#c8102e'),
      stub: stub > 0 ? Math.min(Math.round(stub * 10) / 10, 30) : 0,
    };
  }
  function runDigits(r, i) {
    var n = String(r.start + (i || 0));
    while (n.length < r.digits) n = '0' + n;
    return n;
  }
  function runText(r, i) {
    return r.prefix + runDigits(r, i);
  }
  // ช่องเลขบนบัตร (ซม. จากมุมซ้ายบนของบัตร): anchor = จุดยึดของทั้งข้อความ, y = เส้นฐาน, size = ความสูงตัวอักษร (ซม.)
  function runSlots(r, w, h) {
    var size = RUN_SIZES[r.size] * PT;
    var m = Math.min(0.5, Math.min(w, h) * 0.08);
    var top = r.pos.charAt(0) === 't';
    var right = r.pos.charAt(1) === 'r';
    var stub = r.stub > 0 && r.stub <= w - 2 ? r.stub : 0;
    var y = top ? m + size * 0.72 : h - m;
    var slots = [{ anchor: right ? 'right' : 'left', x: right ? w - m : stub + m, y: y, size: size }];
    if (stub) slots.push({ anchor: 'center', x: stub / 2, y: y, size: size, stub: true });
    return { slots: slots, stub: stub };
  }
  // วางข้อความเลขตามช่อง: prefixW = ความกว้างคำนำหน้า (ซม. วัดจากฟอนต์จริง) → จุดเริ่มคำนำหน้า / จุดเริ่มตัวเลข
  function runLabel(slot, prefixW, nDigits) {
    var total = prefixW + nDigits * DIGIT_EM * slot.size;
    var left = slot.anchor === 'right' ? slot.x - total : slot.anchor === 'center' ? slot.x - total / 2 : slot.x;
    return { left: left, digitsX: left + prefixW, width: total };
  }

  // ขนาดกระดาษพิมพ์ (ซม.)
  var SHEETS = {
    a4: { name: 'A4', w: 21, h: 29.7 },
    a3: { name: 'A3', w: 29.7, h: 42 },
    s13: { name: '13×19 นิ้ว', w: 33.02, h: 48.26 },
  };
  var SHEET_ORDER = ['a4', 'a3', 's13'];
  /* จัดหน้าพิมพ์: บัตร cw×ch ซม. บนกระดาษ sw×sh — เผื่อตัดตก (bleed) ข้างละ 2 มม. บัตรห่างกัน 4 มม. (ตัดตกชนกันพอดี)
   * ขอบกระดาษ 1.2 ซม. (ที่จับกระดาษ + เส้นตัด) · ลองทั้งแนวตั้ง/หมุน 90° เลือกแบบที่ได้มากกว่า · จัดกลางแผ่น */
  function impose(cw, ch, sw, sh, o) {
    o = o || {};
    var bleed = o.bleed != null ? o.bleed : 0.2;
    var gap = 2 * bleed;
    var margin = o.margin != null ? o.margin : 1.2;
    var fit = function (w, h) {
      var cols = Math.max(0, Math.floor((sw - 2 * margin + gap + 1e-9) / (w + gap)));
      var rows = Math.max(0, Math.floor((sh - 2 * margin + gap + 1e-9) / (h + gap)));
      return { cols: cols, rows: rows, n: cols * rows, w: w, h: h };
    };
    var a = fit(cw, ch);
    var b = fit(ch, cw);
    var rot = b.n > a.n;
    var best = rot ? b : a;
    var gw = best.cols * best.w + Math.max(0, best.cols - 1) * gap;
    var gh = best.rows * best.h + Math.max(0, best.rows - 1) * gap;
    var x0 = (sw - gw) / 2;
    var y0 = (sh - gh) / 2;
    var cells = [];
    for (var r = 0; r < best.rows; r++) for (var c = 0; c < best.cols; c++) cells.push({ x: x0 + c * (best.w + gap), y: y0 + r * (best.h + gap) });
    return { rot: rot, cols: best.cols, rows: best.rows, n: best.n, w: best.w, h: best.h, bleed: bleed, gap: gap, x0: x0, y0: y0, gw: gw, gh: gh, sw: sw, sh: sh, cells: cells };
  }
  // เส้นตัด (crop marks) รอบนอกกลุ่มบัตร ตรงแนวตัดทุกเส้น: [x1, y1, x2, y2] ซม.
  function cropMarks(L) {
    var off = L.bleed + 0.15;
    var len = 0.5;
    var lines = [];
    var top = L.y0;
    var bot = L.y0 + L.gh;
    var left = L.x0;
    var right = L.x0 + L.gw;
    for (var c = 0; c < L.cols; c++) {
      var x = L.x0 + c * (L.w + L.gap);
      [x, x + L.w].forEach(function (v) {
        lines.push([v, top - off - len, v, top - off], [v, bot + off, v, bot + off + len]);
      });
    }
    for (var r = 0; r < L.rows; r++) {
      var y = L.y0 + r * (L.h + L.gap);
      [y, y + L.h].forEach(function (v) {
        lines.push([left - off - len, v, left - off, v], [right + off, v, right + off + len, v]);
      });
    }
    return lines;
  }
  // แผนพิมพ์: ได้กี่ใบต่อแผ่น ใช้กี่แผ่น เลขแรก–เลขสุดท้าย
  function printPlan(w, h, qty, sheetKey, run) {
    var sh = SHEETS[sheetKey] || SHEETS.a4;
    var L = impose(w, h, sh.w, sh.h);
    qty = Math.max(1, Math.floor(num(qty)) || 1);
    var r = run ? normalizeRun(run) : null;
    return {
      sheet: sh,
      layout: L,
      qty: qty,
      perSheet: L.n,
      sheets: L.n ? Math.ceil(qty / L.n) : 0,
      spare: L.n ? Math.ceil(qty / L.n) * L.n - qty : 0,
      first: r && r.on ? runText(r, 0) : '',
      last: r && r.on ? runText(r, qty - 1) : '',
    };
  }

  /* PDF ไฟล์ส่งพิมพ์ (หลายหน้า): รูปบัตรรวมตัดตก (JPEG) ฝังครั้งเดียว วางซ้ำทุกช่อง + ตัวเลขรันเป็นตัวอักษรเวกเตอร์ (Helvetica-Bold)
   * + เส้นตัดรอบนอก + บรรทัดเล็กใต้แผ่น (หน้า / ช่วงเลข) — ไม่ต้องใช้ไลบรารี
   * o: { sheet:{w,h}, layout (impose), card:{w,h}, art:{jpeg,pw,ph}, qty, run (normalizeRun หรือ null),
   *      labels:[{ digitsX, y, size }] ซม. บนบัตร, color:'#rrggbb', note: ข้อความ ASCII ใต้แผ่น } */
  function pdfRun(o) {
    var K = 72 / 2.54;
    var L = o.layout;
    var pageW = o.sheet.w * K;
    var pageH = o.sheet.h * K;
    var per = Math.max(1, L.n);
    var qty = Math.max(1, Math.floor(o.qty) || 1);
    var pages = Math.ceil(qty / per);
    var b = L.bleed;
    var aw = o.card.w + 2 * b;
    var ah = o.card.h + 2 * b;
    var f = function (v) {
      return String(Math.round(v * 1000) / 1000);
    };
    var hex = cleanHex(o.color, '#000000');
    var rgbs = [1, 3, 5]
      .map(function (i) {
        return f(parseInt(hex.substr(i, 2), 16) / 255);
      })
      .join(' ');
    var marks = cropMarks(L);
    var run = o.run && o.run.on ? o.run : null;
    var labels = run ? o.labels || [] : [];
    var contents = [];
    for (var p = 0; p < pages; p++) {
      var s = [];
      for (var k = 0; k < per && p * per + k < qty; k++) {
        var cell = L.cells[k];
        var idx = p * per + k;
        var boxL = cell.x - b;
        var boxT = cell.y - b;
        // จุดบนบัตร (ซม. จากมุมซ้ายบนของรูปรวมตัดตก) → จุดบนหน้ากระดาษ PDF (pt, y ขึ้นบน)
        var at;
        if (!L.rot) {
          s.push('q ' + f(aw * K) + ' 0 0 ' + f(ah * K) + ' ' + f(boxL * K) + ' ' + f(pageH - (boxT + ah) * K) + ' cm /Im0 Do Q');
          at = function (u, v) {
            return [(boxL + u) * K, pageH - (boxT + v) * K];
          };
        } else {
          // หมุน 90°: ความกว้างบัตรวิ่งขึ้นบน หัวบัตรอยู่ซ้าย
          var boxB = o.sheet.h - (boxT + aw);
          s.push('q 0 ' + f(aw * K) + ' ' + f(-ah * K) + ' 0 ' + f((boxL + ah) * K) + ' ' + f(boxB * K) + ' cm /Im0 Do Q');
          at = function (u, v) {
            return [(boxL + v) * K, (boxB + u) * K];
          };
        }
        if (labels.length) {
          var digits = runDigits(run, idx);
          labels.forEach(function (lb) {
            var q = at(lb.digitsX + b, lb.y + b);
            var tm = L.rot ? '0 1 -1 0 ' : '1 0 0 1 ';
            s.push('BT /F1 ' + f(lb.size * K) + ' Tf ' + rgbs + ' rg ' + tm + f(q[0]) + ' ' + f(q[1]) + ' Tm (' + digits + ') Tj ET');
          });
        }
      }
      s.push('0 0 0 RG 0.3 w');
      marks.forEach(function (m) {
        s.push(f(m[0] * K) + ' ' + f(pageH - m[1] * K) + ' m ' + f(m[2] * K) + ' ' + f(pageH - m[3] * K) + ' l S');
      });
      var from = p * per;
      var to = Math.min(qty, from + per) - 1;
      var info = 'p.' + (p + 1) + '/' + pages + (run ? '   ' + runDigits(run, from) + ' - ' + runDigits(run, to) : '') + '   ' + (o.note || '');
      s.push('BT /F2 7 Tf 0.45 0.45 0.45 rg 1 0 0 1 ' + f(0.6 * K) + ' ' + f(0.45 * K) + ' Tm (' + info.replace(/[^\x20-\x7e]/g, '').replace(/[()\\]/g, '') + ') Tj ET');
      contents.push(s.join('\n'));
    }

    var enc = function (str) {
      var a = new Uint8Array(str.length);
      for (var i = 0; i < str.length; i++) a[i] = str.charCodeAt(i) & 0xff;
      return a;
    };
    var parts = [];
    var offsets = [];
    var pos = 0;
    var push = function (u8) {
      parts.push(u8);
      pos += u8.length;
    };
    var obj = function (n, body, stream) {
      offsets[n] = pos;
      if (stream) {
        push(enc(n + ' 0 obj\n' + body + '\nstream\n'));
        push(stream);
        push(enc('\nendstream\nendobj\n'));
      } else push(enc(n + ' 0 obj\n' + body + '\nendobj\n'));
    };
    // 1 แคตตาล็อก · 2 หน้าทั้งหมด · 3–4 ฟอนต์ · 5 รูปบัตร · 6.. หน้า + เนื้อหา
    var kids = [];
    for (var i = 0; i < pages; i++) kids.push(6 + i * 2 + ' 0 R');
    push(enc('%PDF-1.4\n%âãÏÓ\n'));
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
    obj(2, '<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + pages + ' >>');
    obj(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    obj(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    obj(5, '<< /Type /XObject /Subtype /Image /Width ' + o.art.pw + ' /Height ' + o.art.ph + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + o.art.jpeg.length + ' >>', o.art.jpeg);
    var res = '<< /Font << /F1 3 0 R /F2 4 0 R >> /XObject << /Im0 5 0 R >> /ProcSet [/PDF /Text /ImageC] >>';
    contents.forEach(function (c, i) {
      var n = 6 + i * 2;
      obj(n, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + f(pageW) + ' ' + f(pageH) + '] /Resources ' + res + ' /Contents ' + (n + 1) + ' 0 R >>');
      obj(n + 1, '<< /Length ' + c.length + ' >>', enc(c));
    });
    var count = 6 + pages * 2;
    var xref = pos;
    var x = 'xref\n0 ' + count + '\n0000000000 65535 f \n';
    for (var n = 1; n < count; n++) x += ('0000000000' + offsets[n]).slice(-10) + ' 00000 n \n';
    x += 'trailer\n<< /Size ' + count + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
    push(enc(x));
    var out = new Uint8Array(pos);
    var at2 = 0;
    for (var j = 0; j < parts.length; j++) {
      out.set(parts[j], at2);
      at2 += parts[j].length;
    }
    return out;
  }

  /* ไฟล์ HTML พรีวิว 3 มิติ (ไฟล์เดียวจบ เปิดได้ทุกเครื่องโดยไม่ต้องใช้เน็ต)
   * o: { title, size, customer, shop, phone, logo (data URL / ''), css, viewerJs (vendor/viewer3d.standalone.js),
   *      glb (base64), poster (base64 JPEG / ''), name (ชื่อไฟล์ตอนบันทึกรูป) } */
  function escHtml(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function viewerFile(o) {
    var B64 = /^[A-Za-z0-9+/=]*$/;
    var glb = String(o.glb || '');
    var poster = String(o.poster || '');
    if (!B64.test(glb) || !B64.test(poster)) throw new Error('bad base64');
    var logo = /^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(o.logo || '') ? o.logo : '';
    var title = [o.title, o.size].filter(Boolean).join(' ');
    var phone = String(o.phone || '').replace(/^โทร\s*/, '');
    var tel = phone.replace(/[^0-9+]/g, '');
    var js = String(o.viewerJs || '').replace(/<\/(script)/gi, '<\\/$1');
    var css = String(o.css || '').replace(/<\//g, '<\\/');
    var name = JSON.stringify(String(o.name || 'sign-3d')).replace(/</g, '\\u003c');
    return (
      '<!doctype html>\n<html lang="th">\n<head>\n<meta charset="utf-8">\n' +
      '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n' +
      '<title>' + escHtml(title || 'ป้าย') + ' — ภาพ 3 มิติ</title>\n' +
      '<meta name="theme-color" content="#1f2a4d">\n' +
      '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' +
      '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;500;600&family=Kanit:wght@500;600&display=swap">\n' +
      '<style>\n' + css + '\n</style>\n</head>\n<body>\n' +
      '<header class="v-top">' +
      (logo ? '<img src="' + logo + '" alt="" height="34">' : '') +
      '<div class="v-shop"><b>' + escHtml(o.shop || 'NATTAPRON') + '</b><small>' + escHtml(phone ? 'โทร ' + phone : 'Color Lab & Printing') + '</small></div>' +
      (tel ? '<a class="v-call" href="tel:' + escHtml(tel) + '">โทรสั่งทำ</a>' : '') +
      '</header>\n' +
      '<main class="v-stage" id="stage">' +
      (poster ? '<img class="v-poster" id="poster" src="data:image/jpeg;base64,' + poster + '" alt="รูปตัวอย่างป้าย" hidden>' : '') +
      '<canvas id="c" aria-label="ภาพ 3 มิติของป้าย หมุนดูได้"></canvas>' +
      '<p class="v-load" id="load">กำลังเปิดภาพ 3 มิติ…</p>' +
      '<p class="v-hint" id="hint">ลากเพื่อหมุน · ถ่างนิ้วหรือเลื่อนล้อเมาส์เพื่อซูม</p></main>\n' +
      '<section class="v-info"><h1>' + escHtml(o.title || 'ป้าย') + '</h1><p>' + escHtml([o.size, o.customer ? 'ลูกค้า: ' + o.customer : ''].filter(Boolean).join(' · ')) + '</p></section>\n' +
      '<nav class="v-bar"><button type="button" id="spin" aria-pressed="true">หมุนอัตโนมัติ</button>' +
      '<button type="button" id="reset">มุมเริ่มต้น</button><button type="button" id="full">เต็มจอ</button>' +
      '<button type="button" id="shot">บันทึกรูปมุมนี้</button></nav>\n' +
      '<p class="v-foot">ภาพจำลอง 3 มิติจาก ' + escHtml(o.shop || 'NATTAPRON') + ' · เปิดได้โดยไม่ต้องต่อเน็ต · สีจริงอาจต่างจากหน้าจอเล็กน้อย</p>\n' +
      '<script type="application/octet-stream" id="glb">' + glb + '</script>\n' +
      '<script>\n' + js + '\n</script>\n' +
      '<script>(function () {\n' +
      "  try {\n    var s = atob(document.getElementById('glb').textContent.trim());\n" +
      '    var u = new Uint8Array(s.length);\n    for (var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);\n' +
      '    NTPViewer.mount({ glb: u.buffer, name: ' + name + ' });\n' +
      "  } catch (e) {\n    var l = document.getElementById('load');\n    if (l) l.textContent = 'เปิดภาพ 3 มิติไม่ได้ — ดูรูปตัวอย่างแทน';\n" +
      "    var p = document.getElementById('poster');\n    if (p) p.hidden = false;\n  }\n})();</script>\n" +
      '</body>\n</html>\n'
    );
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
    // ชนิดงานของร้าน: ยืมหน้าตาชนิดมาตรฐาน + ชื่อ/หน่วย/ขนาด/วิธีคิดราคาของร้านเอง
    var seen = {};
    var types = (Array.isArray(o.types) ? o.types : []).slice(0, 30).map(function (t) {
      t = t || {};
      var base = LOOK_TYPES.indexOf(t.base) >= 0 ? t.base : 'foam';
      var unit = t.unit === 'sqm' || t.unit === 'pcs' || t.unit === 'set' ? t.unit : TYPES[base].unit;
      var id = cleanId(t.id, 'u-');
      while (seen[id]) id = cleanId('', 'u-');
      seen[id] = 1;
      var list = [];
      (Array.isArray(t.presets) ? t.presets : []).slice(0, 8).forEach(function (p) {
        if (!Array.isArray(p)) return;
        var w = clampCm(p[0], 0);
        var h = clampCm(p[1], 0);
        if (w > 0 && h > 0 && !list.some(function (q) { return q[0] === w && q[1] === h; })) list.push([w, h]);
      });
      return {
        id: id,
        name: cleanName(t.name, 'งานของร้าน'),
        base: base,
        unit: unit,
        word: cleanName(t.word, unit === 'sqm' ? 'แผ่น' : unit === 'pcs' ? 'ชิ้น' : 'ชุด').slice(0, 8),
        desc: cleanName(t.desc, '').slice(0, 60),
        presets: list,
      };
    });
    var known = {};
    BASE_TYPES.forEach(function (k) {
      known[k] = 1;
    });
    types.forEach(function (t) {
      known[t.id] = 1;
    });
    var presets = {};
    var src = o.presets && typeof o.presets === 'object' ? o.presets : {};
    Object.keys(known).forEach(function (k) {
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
    var hideTypes = pick(o.hideTypes, known);
    var nTypes = BASE_TYPES.length + types.length;
    if (hideTypes.length >= nTypes) hideTypes = hideTypes.slice(0, nTypes - 1); // ต้องเหลืออย่างน้อย 1 ชนิด
    return { v: 1, themes: themes, tones: tones, types: types, presets: presets, hideTypes: hideTypes, hideScenes: pick(o.hideScenes, SCENES) };
  }
  // ใส่ชนิดงานของร้านต่อท้ายชนิดมาตรฐาน (ลบชุดเก่าของร้านออกก่อน)
  function applyTypes(list) {
    Object.keys(TYPES).forEach(function (k) {
      if (BASE_TYPES.indexOf(k) < 0) delete TYPES[k];
    });
    TYPE_ORDER.length = 0;
    BASE_TYPES.forEach(function (k) {
      TYPE_ORDER.push(k);
    });
    (list || []).forEach(function (t) {
      var b = TYPES[t.base] ? t.base : 'foam';
      TYPES[t.id] = {
        name: t.name,
        desc: t.desc || 'แบบ' + TYPES[b].name,
        unit: t.unit || TYPES[b].unit,
        word: t.word,
        base: b,
        mount: TYPES[b].mount,
        small: TYPES[b].small,
        presets: t.presets && t.presets.length ? t.presets.slice() : TYPES[b].presets.slice(0, 4),
        mine: true,
      };
      TYPE_ORDER.push(t.id);
    });
  }
  // ข้อความขนาดที่ใช้บ่อย "60x90, 120×240" → [[60,90],[120,240]]
  function parseSizes(text) {
    var out = [];
    String(text || '')
      .split(/[,;\n]+/)
      .forEach(function (part) {
        var m = part.match(/(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)/i);
        if (!m) return;
        var w = clampCm(m[1], 0);
        var h = clampCm(m[2], 0);
        if (w > 0 && h > 0 && out.length < 8 && !out.some(function (q) { return q[0] === w && q[1] === h; })) out.push([w, h]);
      });
    return out;
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

  /* ตัวเลือกหน้าตาป้าย: ตัวอักษร (วัสดุ/ไฟ) · นีออน (สีไฟ) · ป้ายยื่น/บิลบอร์ด (เปิดไฟ) */
  var LETTER_MATS = { color: 'สีตามงาน', inox: 'สแตนเลส', gold: 'สแตนเลสทอง', black: 'ดำด้าน', white: 'ขาว' };
  var LIGHTS = { none: 'ไม่มีไฟ', halo: 'ไฟส่องหลัง', front: 'ไฟหน้า' };
  var NEON_COLORS = [['design', 'ตามงาน'], ['#fff1d6', 'ขาววอร์ม'], ['#ff5fa8', 'ชมพู'], ['#4fd6ff', 'ฟ้า'], ['#ffd23f', 'เหลือง'], ['#7dff6a', 'เขียว'], ['#ff4b3e', 'แดง']];
  function normalizeLook(o) {
    o = o && typeof o === 'object' ? o : {};
    var neonOk = o.neon === 'design' || HEX.test(String(o.neon || ''));
    return {
      mat: LETTER_MATS[o.mat] ? o.mat : 'color',
      light: LIGHTS[o.light] ? o.light : 'none',
      neon: neonOk ? String(o.neon).toLowerCase() : 'design',
      lit: o.lit !== false,
    };
  }
  function lookNote(base, look) {
    look = normalizeLook(look);
    if (base === 'letters') return 'ตัวอักษร' + LETTER_MATS[look.mat] + ' · ' + LIGHTS[look.light];
    if (base === 'neon') return 'นีออน LED + อะคริลิคใส + อะแดปเตอร์';
    if (base === 'blade') return look.lit ? 'กล่องไฟสองหน้า + แขนเหล็ก' : 'สองหน้า + แขนเหล็ก';
    if (base === 'flag') return 'รวมเสา + ฐาน';
    if (base === 'backdrop') return 'รวมโครงทรัส';
    if (base === 'billboard') return look.lit ? 'รวมโครงสร้าง + ไฟส่อง' : 'รวมโครงสร้าง';
    if (base === 'tablestand') return 'อะคริลิค + งานพิมพ์';
    return '';
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
    cncPosts: cncPosts,
    baseType: baseType,
    BASE_TYPES: BASE_TYPES,
    LOOK_TYPES: LOOK_TYPES,
    applyTypes: applyTypes,
    parseSizes: parseSizes,
    depthText: depthText,
    normalizeRun: normalizeRun,
    runDigits: runDigits,
    runText: runText,
    runSlots: runSlots,
    runLabel: runLabel,
    RUN_SIZES: RUN_SIZES,
    DIGIT_EM: DIGIT_EM,
    SHEETS: SHEETS,
    SHEET_ORDER: SHEET_ORDER,
    impose: impose,
    cropMarks: cropMarks,
    printPlan: printPlan,
    pdfRun: pdfRun,
    viewerFile: viewerFile,
    TYPE_ORDER: TYPE_ORDER,
    SCENES: SCENES,
    SCENE_ORDER: SCENE_ORDER,
    TABLE_H: TABLE_H,
    sceneFits: sceneFits,
    defaultScene: defaultScene,
    PAPERS: PAPERS,
    PAPER_ORDER: PAPER_ORDER,
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
    LETTER_MATS: LETTER_MATS,
    LIGHTS: LIGHTS,
    NEON_COLORS: NEON_COLORS,
    normalizeLook: normalizeLook,
    lookNote: lookNote,
    metalColor: metalColor,
    FONTS: FONTS,
    fontCssUrl: fontCssUrl,
  };
});
