/* นัดพอน Sign Mockup — วิดีโอแนวตั้ง 9:16 สำหรับ Reels / TikTok / Shorts
 * ทำทีละเฟรม (ไม่อัดหน้าจอ) → เข้ารหัส H.264 ด้วย WebCodecs แล้วรวมเป็น .mp4 (vendor/mp4-muxer.min.js โหลดตอนใช้)
 * เครื่องที่ไม่มี WebCodecs ใช้ MediaRecorder แทน (ได้ .mp4 หรือ .webm ตามที่เบราว์เซอร์ทำได้)
 * ใช้ในเบราว์เซอร์เป็น window.SignMockup.reels และใน node (ทดสอบ) ด้วย require() */
(function (root) {
  'use strict';
  var NS = (root.SignMockup = root.SignMockup || {});
  var W = 1080;
  var H = 1920;
  var FPS = 30;
  var SEC = 9;
  var END = 1.7; // วินาทีท้าย: หน้าปิดท้าย ชื่อร้าน + เบอร์โทร
  var DISPLAY = "'Kanit', 'Noto Sans Thai', 'Leelawadee UI', Tahoma, sans-serif";
  var BODY = "'IBM Plex Sans Thai', 'Noto Sans Thai', 'Leelawadee UI', Tahoma, sans-serif";

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }
  function ease(t) {
    t = clamp(t, 0, 1);
    return t * t * (3 - 2 * t);
  }
  // ค่าความชัด 0..1 ของช่วงเวลา (ค่อย ๆ โผล่ in วินาที)
  function fadeIn(sec, at, dur) {
    return ease((sec - at) / (dur || 0.5));
  }

  /* ---------- ส่วนประกอบภาพ ---------- */
  function rr(x, px, py, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    x.beginPath();
    x.moveTo(px + r, py);
    x.arcTo(px + w, py, px + w, py + h, r);
    x.arcTo(px + w, py + h, px, py + h, r);
    x.arcTo(px, py + h, px, py, r);
    x.arcTo(px, py, px + w, py, r);
    x.closePath();
  }
  function fit(x, text, maxW, px, weight, fam) {
    var size = px;
    x.font = weight + ' ' + size + 'px ' + fam;
    while (size > 18 && x.measureText(text).width > maxW) {
      size -= 2;
      x.font = weight + ' ' + size + 'px ' + fam;
    }
    return size;
  }
  /* ข้อความทับภาพ (พื้นที่ปลอดภัยของ Reels: บน ~220 จุด / ล่าง ~420 จุด / ขวา ~160 จุด เป็นปุ่มของแอป)
   * info = { shop, phone, title, size, price, note, logo (รูป/ผืนภาพ) } · sec = วินาทีปัจจุบัน */
  function overlay(x, sec, info) {
    var total = SEC;
    var endAt = total - END;
    // ไล่สีเข้มล่าง ให้ตัวหนังสืออ่านง่ายบนทุกฉาก
    var g = x.createLinearGradient(0, H * 0.58, 0, H);
    g.addColorStop(0, 'rgba(12,16,32,0)');
    g.addColorStop(0.55, 'rgba(12,16,32,0.55)');
    g.addColorStop(1, 'rgba(12,16,32,0.82)');
    x.fillStyle = g;
    x.fillRect(0, H * 0.58, W, H * 0.42);
    var gt = x.createLinearGradient(0, 0, 0, 420);
    gt.addColorStop(0, 'rgba(12,16,32,0.45)');
    gt.addColorStop(1, 'rgba(12,16,32,0)');
    x.fillStyle = gt;
    x.fillRect(0, 0, W, 420);
    // หัว: โลโก้ + ชื่อร้าน
    var a = fadeIn(sec, 0.15, 0.6) * (1 - fadeIn(sec, endAt, 0.4));
    if (a > 0.01) {
      x.save();
      x.globalAlpha = a;
      x.translate(0, (1 - a) * -30);
      var name = info.shop || '';
      var tw = 0;
      if (name) {
        fit(x, name, 600, 44, 600, DISPLAY);
        tw = x.measureText(name).width;
      }
      var lw = info.logo ? Math.round((info.logo.width / info.logo.height) * 76) : 0;
      var bw = (lw ? lw + 28 : 0) + (tw ? tw + 44 : 0) + 28;
      if (bw > 60) {
        x.fillStyle = 'rgba(255,255,255,0.94)';
        rr(x, 70, 236, bw, 104, 52);
        x.fill();
        var cx = 70 + 28;
        if (info.logo) {
          x.drawImage(info.logo, cx, 250, lw, 76);
          cx += lw + 28;
        }
        if (name) {
          x.fillStyle = '#1f2a4d';
          x.textBaseline = 'middle';
          x.fillText(name, cx, 290);
        }
      }
      x.restore();
    }
    // การ์ดล่าง: ชนิดงาน ขนาด ราคา
    var b = fadeIn(sec, 0.4, 0.7) * (1 - fadeIn(sec, endAt, 0.4));
    if (b > 0.01) {
      x.save();
      x.globalAlpha = b;
      x.translate(0, (1 - b) * 40);
      x.textBaseline = 'alphabetic';
      x.fillStyle = '#ffffff';
      fit(x, info.title || '', 860, 66, 600, DISPLAY);
      x.fillText(info.title || '', 70, 1330);
      x.fillStyle = '#ffd7b5';
      fit(x, info.size || '', 860, 44, 500, BODY);
      x.fillText(info.size || '', 70, 1400);
      var y = 1430;
      if (info.price) {
        x.font = '600 46px ' + DISPLAY;
        var pw = x.measureText(info.price).width + 56;
        x.fillStyle = '#e07a3f';
        rr(x, 70, y, pw, 78, 39);
        x.fill();
        x.fillStyle = '#ffffff';
        x.textBaseline = 'middle';
        x.fillText(info.price, 98, y + 41);
        y += 96;
      }
      if (info.note) {
        x.textBaseline = 'alphabetic';
        x.fillStyle = 'rgba(255,255,255,0.78)';
        fit(x, info.note, 860, 34, 400, BODY);
        x.fillText(info.note, 70, y + 40);
      }
      x.restore();
    }
    // หน้าปิดท้าย
    var c = fadeIn(sec, endAt, 0.45);
    if (c > 0.01) {
      x.save();
      x.globalAlpha = c;
      x.fillStyle = 'rgba(15,20,40,0.78)';
      x.fillRect(0, 0, W, H);
      x.textBaseline = 'alphabetic';
      var yy = 700;
      if (info.logo) {
        var lh = 170;
        var lw2 = Math.min(560, (info.logo.width / info.logo.height) * lh);
        lh = (lw2 * info.logo.height) / info.logo.width;
        x.fillStyle = 'rgba(255,255,255,0.96)';
        rr(x, W / 2 - lw2 / 2 - 40, yy - 40, lw2 + 80, lh + 80, 36);
        x.fill();
        x.drawImage(info.logo, W / 2 - lw2 / 2, yy, lw2, lh);
        yy += lh + 130;
      } else yy = 820;
      // ข้อความกึ่งกลางวาดเป็นภาพย่อย (Safari บน iPhone จัดกลางเพี้ยน)
      drawLine(x, textSprite({ text: 'สั่งทำป้ายแบบนี้ได้ที่', size: 48, weight: 500, family: BODY, fill: 'rgba(255,255,255,0.85)', maxW: 900 }), W / 2, yy, 1, 'rise', 1);
      drawLine(x, textSprite({ text: info.shop || 'ร้านป้าย', size: 84, weight: 700, family: DISPLAY, fill: '#ffffff', maxW: 900 }), W / 2, yy + 104, 1, 'rise', 1);
      if (info.phone) {
        var ps = textSprite({ text: info.phone, size: 60, weight: 600, family: DISPLAY, fill: '#ffffff', maxW: 800 });
        var phw = (ps ? ps.inkW : 360) + 120;
        x.fillStyle = '#e07a3f';
        rr(x, W / 2 - phw / 2, yy + 160, phw, 104, 52);
        x.fill();
        if (ps) x.drawImage(ps.c, W / 2 - ps.w / 2, yy + 212 - ps.h / 2);
      }
      drawLine(x, textSprite({ text: 'ทักแชต / โทรสั่งได้เลย', size: 40, weight: 400, family: BODY, fill: 'rgba(255,255,255,0.8)', maxW: 900 }), W / 2, yy + (info.phone ? 350 : 190), 1, 'rise', 1);
      x.restore();
    }
  }
  /* ---------- วิดีโอโปรโมท 5 ฉาก (16 วินาที) ----------
   * plan = { shots: [[บรรทัด, …] × 5], shop, phone, logo, cuts, theme (คีย์ PROMO_THEMES), font (ชื่อฟอนต์), weight, anim ('rise' | 'pop' | 'wipe') }
   * หัวเรื่องกลางบน: บรรทัดท้ายของแต่ละฉากเป็นตัวไล่สีตามธีม · เปลี่ยนฉากมืด/สว่างวูบสั้น ๆ
   * ฉากสุดท้าย: การ์ดชื่อร้าน + โลโก้ + เบอร์โทร (เหนือแถบปุ่มของแอป ~420 จุดล่าง)
   * ตัวหนังสือทุกตัววาดเป็นภาพย่อย (sprite) ชิดซ้ายแล้ววัดขอบหมึกจริงจากพิกเซล — ไม่พึ่ง textAlign/measureText/ไล่สีบนตัวอักษร
   * (Safari บน iPhone วาดข้อความจัดกลาง + ไล่สีเพี้ยน: ตัวหนังสือเลื่อนไปขวาและโดนตัดครึ่ง) */
  var PROMO_SEC = 16;
  var PROMO_CUTS = [0, 3, 6.2, 9.6, 12.8, 16];
  // ธีมสีฉาก: bg = ฉากหลัง (กลาง → ขอบ) · floor = พื้น · rim/kick = ไฟขอบหลัง/ไฟข้าง · grad = ตัวไล่สี · ink = ตัวหนังสือหลัก · light = ฉากสว่าง
  var PROMO_THEMES = {
    neon: { name: 'ม่วงนีออน', bg: ['#6a4aa8', '#261d45', '#07060c'], floor: '#0b0a12', rim: '#b9a8ff', kick: '#ffa3d2', grad: ['#ff6fb1', '#c063ff', '#7f8cff'], ink: '#ffffff', glow: 'rgba(170,90,255,0.6)', pillInk: '#ffffff' },
    gold: { name: 'ทองหรู', bg: ['#8a6a2c', '#2a200f', '#070605'], floor: '#0d0b07', rim: '#ffdf9a', kick: '#ffb46b', grad: ['#fff3c4', '#f2c14e', '#b98a2c'], ink: '#ffffff', glow: 'rgba(242,193,78,0.55)', pillInk: '#2b1d05' },
    ocean: { name: 'ฟ้าเทค', bg: ['#2084c2', '#0d2c52', '#030812'], floor: '#060b14', rim: '#86e8ff', kick: '#5b8cff', grad: ['#86fbff', '#3fb6ff', '#5d6bff'], ink: '#ffffff', glow: 'rgba(63,182,255,0.6)', pillInk: '#ffffff' },
    fire: { name: 'แดงร้อนแรง', bg: ['#b8381f', '#3d110b', '#090303'], floor: '#0e0706', rim: '#ffb680', kick: '#ff5f6d', grad: ['#ffd56b', '#ff7a3d', '#ff3d6e'], ink: '#ffffff', glow: 'rgba(255,96,60,0.55)', pillInk: '#ffffff' },
    emerald: { name: 'เขียวมรกต', bg: ['#2a9a73', '#0e3529', '#030b09'], floor: '#06100d', rim: '#a3ffd9', kick: '#ffe08a', grad: ['#dcff8f', '#4fe3a1', '#14b3a5'], ink: '#ffffff', glow: 'rgba(79,227,161,0.55)', pillInk: '#05261d' },
    white: { name: 'ขาวมินิมอล', light: true, bg: ['#ffffff', '#eef0f5', '#cfd4de'], floor: '#f3f4f7', rim: '#ffffff', kick: '#d6e4ff', grad: ['#1f3b8f', '#3f7bff', '#16b3c8'], ink: '#141a2e', glow: 'rgba(63,123,255,0.22)', pillInk: '#ffffff' },
    pastel: { name: 'ชมพูพาสเทล', light: true, bg: ['#fff6fa', '#ffdbe8', '#f1b6cd'], floor: '#fdeaf2', rim: '#ffffff', kick: '#ffc2dc', grad: ['#ff4f96', '#c45bff', '#7b6bff'], ink: '#3b1630', glow: 'rgba(255,79,150,0.28)', pillInk: '#ffffff' },
  };
  var PROMO_THEME_ORDER = ['neon', 'gold', 'ocean', 'fire', 'emerald', 'white', 'pastel'];
  var PROMO_ANIMS = { rise: 'เลื่อนขึ้น', pop: 'เด้งขยาย', wipe: 'กวาดเปิด' };
  function promoTheme(k) {
    return PROMO_THEMES[k] || PROMO_THEMES.neon;
  }
  function promoShotAt(sec, cuts) {
    var i = 0;
    while (i < cuts.length - 2 && sec >= cuts[i + 1]) i++;
    return { i: i, local: sec - cuts[i], dur: cuts[i + 1] - cuts[i] };
  }
  function fam(font, fallback) {
    return font ? '"' + String(font).replace(/["\\]/g, '') + '", ' + fallback : fallback;
  }
  /* ภาพตัวหนังสือ 1 บรรทัด: วาดชิดซ้าย → หาขอบหมึกจริง → ระบายสี (สีเดียว/ไล่สี) แบบ source-in → ใส่แสงเรือง แล้วตัดเหลือแค่ตัวหนังสือ
   * o = { text, size, weight, family, fill (สี หรือ [สี, สี, สี]), glow, maxW } → { c, w, h, g (ขอบเผื่อแสง), top (ขอบบนหมึกเทียบเส้นฐาน), inkW } */
  var spriteCache = {};
  var spriteCount = 0;
  function textSprite(o) {
    var key = [o.text, o.size, o.weight, o.family, String(o.fill), o.glow || '', o.maxW || 0].join('|');
    if (spriteCache[key]) return spriteCache[key];
    if (spriteCount > 80) {
      spriteCache = {};
      spriteCount = 0;
    }
    var s = drawSprite(o, o.size);
    // กว้างเกิน → ทำใหม่ที่ขนาดเล็กลงพอดี
    if (o.maxW && s && s.inkW > o.maxW) s = drawSprite(o, Math.max(16, Math.floor((o.size * o.maxW) / s.inkW))) || s;
    spriteCache[key] = s;
    spriteCount++;
    return s;
  }
  function resetSprites() {
    spriteCache = {};
    spriteCount = 0;
  }
  function drawSprite(o, size) {
    var text = String(o.text || '');
    if (!text) return null;
    var pad = Math.ceil(size * 0.7);
    var cw = Math.min(4096, Math.ceil(text.length * size * 1.05 + pad * 2));
    var ch = Math.ceil(size * 2.3 + pad * 2);
    var base = Math.round(pad + size * 1.25);
    var tc = makeCanvas(cw, ch);
    var t = tc.getContext('2d');
    t.font = (o.weight || 700) + ' ' + size + 'px ' + o.family;
    t.textAlign = 'left';
    t.textBaseline = 'alphabetic';
    t.fillStyle = '#ffffff';
    t.fillText(text, pad, base);
    // ขอบหมึกจริง (ไม่เชื่อ measureText)
    var d = t.getImageData(0, 0, cw, ch).data;
    var x0 = cw;
    var x1 = -1;
    var y0 = ch;
    var y1 = -1;
    for (var y = 0; y < ch; y++) {
      var row = y * cw * 4;
      for (var x = 0; x < cw; x++) {
        if (d[row + x * 4 + 3] > 10) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    if (x1 < 0) return null;
    var iw = x1 - x0 + 1;
    var ih = y1 - y0 + 1;
    // ระบายสีเฉพาะตัวหนังสือ
    t.globalCompositeOperation = 'source-in';
    if (Array.isArray(o.fill)) {
      var g = t.createLinearGradient(x0, 0, x1 + 1, 0);
      g.addColorStop(0, o.fill[0]);
      g.addColorStop(0.55, o.fill[1]);
      g.addColorStop(1, o.fill[2] || o.fill[1]);
      t.fillStyle = g;
    } else t.fillStyle = o.fill || '#ffffff';
    t.fillRect(0, 0, cw, ch);
    t.globalCompositeOperation = 'source-over';
    var gl = o.glow ? Math.ceil(size * 0.45) : 2;
    var out = makeCanvas(iw + gl * 2, ih + gl * 2);
    var ox = out.getContext('2d');
    if (o.glow) {
      ox.shadowColor = o.glow;
      ox.shadowBlur = Math.round(size * 0.3);
    }
    ox.drawImage(tc, x0, y0, iw, ih, gl, gl, iw, ih);
    tc.width = tc.height = 0; // คืนหน่วยความจำ (iPhone จำกัดหน่วยความจำผืนภาพรวม)
    return { c: out, w: out.width, h: out.height, g: gl, top: y0 - base, inkW: iw, inkH: ih, size: size };
  }
  // วางภาพตัวหนังสือกึ่งกลางแนวนอน: เส้นฐานอยู่ที่ base · a = ความคืบหน้าของลูกเล่น (0..1)
  function drawLine(x, s, cx, base, a, anim, out) {
    if (!s || a <= 0.01) return;
    var left = cx - s.w / 2;
    var top = base + s.top - s.g;
    x.save();
    if (anim === 'pop') {
      var k = 0.55 + 0.45 * backOut(a);
      x.globalAlpha = Math.min(1, a * 2.2) * out;
      x.translate(cx, top + s.h / 2);
      x.scale(k, k);
      x.drawImage(s.c, -s.w / 2, -s.h / 2);
    } else if (anim === 'wipe') {
      // กวาดเปิดจากซ้ายไปขวา ขอบนำหน้านุ่ม ๆ (ค่อย ๆ จาง 8 ชั้น)
      var F = Math.min(90, s.w * 0.25);
      var rw = Math.round((s.w + F) * a) - F;
      if (rw > 0) {
        x.globalAlpha = out;
        x.drawImage(s.c, 0, 0, Math.min(rw, s.w), s.h, left, top, Math.min(rw, s.w), s.h);
      }
      for (var k2 = 0; k2 < 8; k2++) {
        var sx = rw + (F * k2) / 8;
        var sw = F / 8;
        if (sx + sw <= 0 || sx >= s.w) continue;
        var cx0 = Math.max(0, sx);
        var cw0 = Math.min(s.w, sx + sw) - cx0;
        if (cw0 <= 0) continue;
        x.globalAlpha = out * (1 - (k2 + 0.5) / 8);
        x.drawImage(s.c, cx0, 0, cw0, s.h, left + cx0, top, cw0, s.h);
      }
    } else {
      x.globalAlpha = a * out;
      x.drawImage(s.c, left, top + (1 - a) * 56);
    }
    x.restore();
  }
  function backOut(t) {
    t = clamp(t, 0, 1);
    var c = 1.70158;
    return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
  }
  function promoOverlay(x, sec, plan) {
    plan = plan || {};
    var cuts = plan.cuts || PROMO_CUTS;
    var T = promoTheme(plan.theme);
    var S = promoShotAt(sec, cuts);
    var last = S.i === cuts.length - 2;
    var lines = (plan.shots || [])[S.i] || [];
    var font = fam(plan.font, DISPLAY);
    var wt = plan.weight || 700;
    var anim = PROMO_ANIMS[plan.anim] ? plan.anim : 'rise';
    var shade = T.light ? '255,255,255' : '6,5,12';
    x.save();
    // ไล่เงาด้านบน ให้หัวเรื่องอ่านง่าย (ฉากสว่างไล่ขาว)
    var gt = x.createLinearGradient(0, 0, 0, 900);
    gt.addColorStop(0, 'rgba(' + shade + ',' + (T.light ? 0.7 : 0.62) + ')');
    gt.addColorStop(0.55, 'rgba(' + shade + ',' + (T.light ? 0.3 : 0.25) + ')');
    gt.addColorStop(1, 'rgba(' + shade + ',0)');
    x.fillStyle = gt;
    x.fillRect(0, 0, W, 900);
    // ชื่อร้านเล็ก ๆ ด้านบน (ฉาก 1–4)
    if (!last && plan.shop) {
      var ss = textSprite({ text: plan.shop, size: 34, weight: 500, family: BODY, fill: T.light ? 'rgba(20,26,46,0.75)' : 'rgba(255,255,255,0.8)', maxW: 640 });
      drawLine(x, ss, W / 2, 262, fadeIn(sec, 0.3, 0.6), 'rise', 1);
    }
    // หัวเรื่อง
    var out = last ? 1 : 1 - ease((S.local - (S.dur - 0.28)) / 0.24);
    var y = 410;
    var big = S.i === 0 || last ? 118 : 104;
    for (var j = 0; j < lines.length; j++) {
      var grad = j === lines.length - 1;
      var size = grad ? big : Math.round(big * 0.82);
      var sp = textSprite({ text: lines[j], size: size, weight: wt, family: font, fill: grad ? T.grad : T.ink, glow: grad ? T.glow : T.light ? '' : 'rgba(0,0,0,0.45)', maxW: 940 });
      var used = sp ? sp.size : size;
      var a = anim === 'wipe' ? clamp((S.local - 0.15 - j * 0.22) / 0.55, 0, 1) : ease((S.local - 0.18 - j * 0.16) / 0.42);
      drawLine(x, sp, W / 2, y + used * 0.82, a, anim, out);
      y += Math.round(used * 1.2);
    }
    // ขีดเส้นไล่สีใต้หัวเรื่อง
    if (lines.length) {
      var la = ease((S.local - 0.5) / 0.4) * out;
      if (la > 0.01) {
        var lw = 220 * la;
        var lg = x.createLinearGradient(W / 2 - lw / 2, 0, W / 2 + lw / 2, 0);
        lg.addColorStop(0, T.grad[0]);
        lg.addColorStop(1, T.grad[2]);
        x.fillStyle = lg;
        rr(x, W / 2 - lw / 2, y + 22, lw, 10, 5);
        x.fill();
      }
    }
    if (last) promoCard(x, S.local, plan, T);
    // เปลี่ยนฉาก: เริ่มคลิปค่อย ๆ ชัด · ต้นฉากถัดไปวูบ 0.18 วินาที
    var dark = S.i === 0 ? 1 - ease(S.local / 0.45) : 1 - ease(S.local / 0.18);
    if (dark > 0.01) {
      x.globalAlpha = dark;
      x.fillStyle = T.light ? '#ffffff' : '#05040a';
      x.fillRect(0, 0, W, H);
    }
    x.restore();
  }
  function promoCard(x, local, plan, T) {
    var a = ease((local - 0.55) / 0.5);
    if (a <= 0.01) return;
    var shop = plan.shop || 'ร้านป้าย';
    x.save();
    x.globalAlpha = a;
    x.translate(0, (1 - a) * 70);
    var top = 1180;
    var h = plan.phone ? 300 : 210;
    x.fillStyle = T.light ? '#161b2e' : 'rgba(255,255,255,0.96)';
    x.shadowColor = 'rgba(0,0,0,0.35)';
    x.shadowBlur = 40;
    rr(x, 80, top, W - 160, h, 44);
    x.fill();
    x.shadowBlur = 0;
    var cx = W / 2;
    var maxName = 820;
    if (plan.logo && plan.logo.width) {
      var lh = 96;
      var lw = Math.min(220, (plan.logo.width / plan.logo.height) * lh);
      lh = (lw * plan.logo.height) / plan.logo.width;
      if (T.light) {
        x.fillStyle = '#ffffff';
        rr(x, 110, top + 26, lw + 20, 112, 18);
        x.fill();
      }
      x.drawImage(plan.logo, 120, top + 34 + (96 - lh) / 2, lw, lh);
      cx = 120 + lw + (W - 120 - lw - 120) / 2 + 10;
      maxName = 600;
    }
    var name = textSprite({ text: shop, size: 64, weight: plan.weight || 700, family: fam(plan.font, DISPLAY), fill: T.light ? '#ffffff' : '#1d1730', maxW: maxName });
    drawLine(x, name, cx, top + 92, 1, 'rise', 1);
    var sub = textSprite({ text: 'ทักแชต / โทรสั่งทำได้เลย', size: 34, weight: 500, family: BODY, fill: T.light ? 'rgba(255,255,255,0.72)' : '#6b6680', maxW: maxName });
    drawLine(x, sub, cx, top + 144, 1, 'rise', 1);
    if (plan.phone) {
      var ph = textSprite({ text: plan.phone, size: 58, weight: 600, family: DISPLAY, fill: T.pillInk || '#ffffff', maxW: W - 340 });
      var pw = Math.min(W - 240, (ph ? ph.inkW : 300) + 130);
      var py = top + h - 116;
      var g = x.createLinearGradient(W / 2 - pw / 2, 0, W / 2 + pw / 2, 0);
      g.addColorStop(0, T.grad[0]);
      g.addColorStop(1, T.grad[1]);
      x.fillStyle = g;
      rr(x, W / 2 - pw / 2, py, pw, 88, 44);
      x.fill();
      if (ph) x.drawImage(ph.c, W / 2 - ph.w / 2, py + 44 - ph.h / 2);
    }
    x.restore();
  }

  /* ภาพ 2 มิติ (สัดส่วนใดก็ได้) วางในเฟรมแนวตั้ง: เต็มความกว้าง + ฉากหลังเบลอจากภาพเดียวกัน · zoom = ซูมเข้า (1 = พอดีกว้าง) */
  var blurCache = { src: null, c: null };
  function placeFlat(x, src, zoom, panX, panY) {
    if (blurCache.src !== src) {
      var sw = 108;
      var sh = Math.round((sw * H) / W);
      var c = makeCanvas(sw, sh);
      var cx = c.getContext('2d');
      var k = Math.max(sw / src.width, sh / src.height);
      cx.drawImage(src, (sw - src.width * k) / 2, (sh - src.height * k) / 2, src.width * k, src.height * k);
      blurCache = { src: src, c: c };
    }
    x.save();
    x.imageSmoothingEnabled = true;
    x.imageSmoothingQuality = 'high';
    x.drawImage(blurCache.c, 0, 0, W, H);
    x.fillStyle = 'rgba(10,12,20,0.35)';
    x.fillRect(0, 0, W, H);
    var k2 = Math.min(W / src.width, (H * 0.8) / src.height) * (zoom || 1);
    var dw = src.width * k2;
    var dh = src.height * k2;
    var dx = (W - dw) / 2 + (panX || 0) * dw;
    var dy = (H - dh) / 2 - H * 0.04 + (panY || 0) * dh;
    x.shadowColor = 'rgba(0,0,0,0.35)';
    x.shadowBlur = 40;
    x.drawImage(src, dx, dy, dw, dh);
    x.restore();
  }
  function makeCanvas(w, h) {
    var c = root.document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  /* ---------- เข้ารหัสวิดีโอ ---------- */
  var muxerP = null;
  function loadMuxer(src) {
    if (root.Mp4Muxer) return Promise.resolve(root.Mp4Muxer);
    if (!muxerP) {
      muxerP = new Promise(function (resolve, reject) {
        var s = root.document.createElement('script');
        s.src = src || 'vendor/mp4-muxer.min.js';
        s.onload = function () {
          resolve(root.Mp4Muxer);
        };
        s.onerror = function () {
          muxerP = null;
          reject(new Error('mux'));
        };
        root.document.head.appendChild(s);
      });
    }
    return muxerP;
  }
  // ลำดับรหัสที่ลอง: H.264 (ทุกแอปรับ) → VP9 (บางเครื่องไม่มี H.264)
  var CODECS = [
    ['avc', 'avc1.640028'],
    ['avc', 'avc1.4d0028'],
    ['avc', 'avc1.42e028'],
    ['vp9', 'vp09.00.40.08'],
  ];
  /* ความคมชัดของไฟล์: 16 Mbps (เดิม 6) — ตัวหนังสือเล็กบนป้ายยังคมตอนกล้องเคลื่อน และเผื่อเอาไปตัดต่อ/ใส่ข้อความซ้ำ
   * เครื่องที่ไม่รับ 16 ลองที่ 8 Mbps ก่อนถอยไปอัดหน้าจอ */
  var BITRATE = 16000000;
  var BITRATE_LOW = 8000000;
  function pickCodec(w, h, fps, bitrate) {
    if (typeof root.VideoEncoder !== 'function' || typeof root.VideoFrame !== 'function') return Promise.resolve(null);
    var tries = [];
    [bitrate, Math.min(bitrate, BITRATE_LOW)].forEach(function (br, k, all) {
      if (k && br === all[0]) return;
      CODECS.forEach(function (c) {
        tries.push([c, br]);
      });
    });
    var i = 0;
    function next() {
      if (i >= tries.length) return Promise.resolve(null);
      var c = tries[i][0];
      var br = tries[i++][1];
      var cfg = { codec: c[1], width: w, height: h, bitrate: br, framerate: fps, latencyMode: 'quality' };
      if (c[0] === 'avc') cfg.avc = { format: 'avc' };
      return root.VideoEncoder.isConfigSupported(cfg)
        .then(function (r) {
          return r && r.supported ? { kind: c[0], cfg: cfg } : next();
        })
        .catch(next);
    }
    return next();
  }
  function tick() {
    return new Promise(function (r) {
      setTimeout(r, 0);
    });
  }
  /* o = { frames, fps, draw(i) → ผืนภาพ (หรือ Promise), progress(0..1), cancelled() }
   * → Promise<{ blob, ext, codec }> */
  function encode(o) {
    var fps = o.fps || FPS;
    var N = o.frames || fps * SEC;
    var bitrate = o.bitrate || BITRATE;
    return pickCodec(W, H, fps, bitrate).then(function (pick) {
      if (!pick) return record(o, fps, N);
      return loadMuxer(o.muxerSrc).then(function (M) {
        var muxer = new M.Muxer({ target: new M.ArrayBufferTarget(), video: { codec: pick.kind, width: W, height: H, frameRate: fps }, fastStart: 'in-memory' });
        var failed = null;
        var enc = new root.VideoEncoder({
          output: function (chunk, meta) {
            muxer.addVideoChunk(chunk, meta);
          },
          error: function (e) {
            failed = e;
          },
        });
        enc.configure(pick.cfg);
        var i = 0;
        function step() {
          if (failed) return Promise.reject(failed);
          if (o.cancelled && o.cancelled()) {
            try {
              enc.close();
            } catch (e) {}
            return Promise.reject(new Error('cancel'));
          }
          if (i >= N) return enc.flush();
          return Promise.resolve(o.draw(i)).then(function (canvas) {
            var vf = new root.VideoFrame(canvas, { timestamp: Math.round((i * 1e6) / fps), duration: Math.round(1e6 / fps) });
            enc.encode(vf, { keyFrame: i % (fps * 2) === 0 });
            vf.close();
            i++;
            if (o.progress) o.progress(i / N);
            // รอให้ตัวเข้ารหัสตามทัน ไม่กินหน่วยความจำ
            var wait = enc.encodeQueueSize > 4 ? new Promise(function (r) {
              var t = setInterval(function () {
                if (enc.encodeQueueSize <= 2 || failed) {
                  clearInterval(t);
                  r();
                }
              }, 5);
            }) : tick();
            return wait.then(step);
          });
        }
        return step().then(function () {
          if (failed) throw failed;
          muxer.finalize();
          enc.close();
          return { blob: new Blob([muxer.target.buffer], { type: 'video/mp4' }), ext: 'mp4', codec: pick.cfg.codec };
        });
      });
    });
  }
  // สำรอง: อัดจากผืนภาพตามเวลาจริง (เครื่องที่ไม่มี WebCodecs)
  function record(o, fps, N) {
    if (typeof root.MediaRecorder !== 'function') return Promise.reject(new Error('unsupported'));
    var types = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
    var type = '';
    for (var i = 0; i < types.length; i++) {
      if (root.MediaRecorder.isTypeSupported && root.MediaRecorder.isTypeSupported(types[i])) {
        type = types[i];
        break;
      }
    }
    var out = makeCanvas(W, H);
    var ox = out.getContext('2d');
    var stream = out.captureStream(fps);
    var rec = new root.MediaRecorder(stream, type ? { mimeType: type, videoBitsPerSecond: o.bitrate || BITRATE } : undefined);
    var parts = [];
    rec.ondataavailable = function (e) {
      if (e.data && e.data.size) parts.push(e.data);
    };
    return new Promise(function (resolve, reject) {
      rec.onstop = function () {
        var mt = (rec.mimeType || type || 'video/webm').split(';')[0];
        resolve({ blob: new Blob(parts, { type: mt }), ext: /mp4/.test(mt) ? 'mp4' : 'webm', codec: mt });
      };
      rec.start();
      var i = 0;
      var t0 = performance.now();
      function step() {
        if (o.cancelled && o.cancelled()) {
          rec.stop();
          return reject(new Error('cancel'));
        }
        if (i >= N) return rec.stop();
        Promise.resolve(o.draw(i)).then(function (canvas) {
          ox.drawImage(canvas, 0, 0, W, H);
          i++;
          if (o.progress) o.progress(i / N);
          var due = t0 + (i * 1000) / fps;
          setTimeout(step, Math.max(0, due - performance.now()));
        }, reject);
      }
      step();
    });
  }

  NS.reels = { W: W, H: H, FPS: FPS, BITRATE: BITRATE, BITRATE_LOW: BITRATE_LOW, pickCodec: pickCodec, SEC: SEC, END: END, frames: FPS * SEC, ease: ease, overlay: overlay, placeFlat: placeFlat, encode: encode, loadMuxer: loadMuxer, CODECS: CODECS, PROMO_SEC: PROMO_SEC, PROMO_CUTS: PROMO_CUTS, promoFrames: FPS * PROMO_SEC, promoOverlay: promoOverlay, promoShotAt: promoShotAt, PROMO_THEMES: PROMO_THEMES, PROMO_THEME_ORDER: PROMO_THEME_ORDER, PROMO_ANIMS: PROMO_ANIMS, promoTheme: promoTheme, textSprite: textSprite, resetSprites: resetSprites };
  if (typeof module === 'object' && module.exports) module.exports = NS.reels;
})(typeof self !== 'undefined' ? self : this);
