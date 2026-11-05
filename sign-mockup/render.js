/* นัดพอน Sign Mockup — วาดภาพจำลองบน <canvas>
 * ฉากวาดด้วยโค้ดทั้งหมด (ไม่มีรูปฉากให้โหลด) ตามขนาดจริงเป็นเซนติเมตร
 * ป้ายวาดลงผืนแยกก่อน แล้วค่อยวางลงฉาก (ฉากสำเร็จรูป) หรือบิดตามมุม 4 จุด (รูปหน้าร้านลูกค้า) */
(function (root) {
  'use strict';
  var NS = (root.SignMockup = root.SignMockup || {});
  var C = NS.core;
  var DISPLAY = "'Kanit', 'Noto Sans Thai', 'Leelawadee UI', Tahoma, sans-serif";
  var BODY = "'IBM Plex Sans Thai', 'Noto Sans Thai', 'Leelawadee UI', Tahoma, sans-serif";
  var NAVY = '#1f2a4d';
  var BRICK = '#d9622b';

  /* ---------- เครื่องมือเล็ก ๆ ---------- */
  function mk(w, h) {
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w));
    c.height = Math.max(1, Math.ceil(h));
    return c;
  }
  function ctx2d(c) {
    var x = c.getContext('2d');
    x.imageSmoothingEnabled = true;
    x.imageSmoothingQuality = 'high';
    return x;
  }
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash(a, b) {
    var h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }
  function rr(x, px, py, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    x.moveTo(px + r, py);
    x.arcTo(px + w, py, px + w, py + h, r);
    x.arcTo(px + w, py + h, px, py + h, r);
    x.arcTo(px, py + h, px, py, r);
    x.arcTo(px, py, px + w, py, r);
    x.closePath();
  }
  function circle(x, cx, cy, r) {
    x.beginPath();
    x.arc(cx, cy, r, 0, Math.PI * 2);
  }
  function rgb(c, f) {
    f = f == null ? 1 : f;
    return 'rgb(' + Math.round(clamp(c[0] * f, 0, 255)) + ',' + Math.round(clamp(c[1] * f, 0, 255)) + ',' + Math.round(clamp(c[2] * f, 0, 255)) + ')';
  }

  var noiseTile = null;
  function noiseCanvas() {
    if (noiseTile) return noiseTile;
    var c = mk(256, 256);
    var x = c.getContext('2d');
    var d = x.createImageData(256, 256);
    var r = rng(11);
    for (var i = 0; i < d.data.length; i += 4) {
      var v = 128 + (r() - 0.5) * 200;
      d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
      d.data[i + 3] = 255;
    }
    x.putImageData(d, 0, 0);
    noiseTile = c;
    return c;
  }
  // เนื้อผิวหยาบ ๆ ให้ผนัง/พื้นไม่เรียบแบนเหมือนกระดาษ
  function grain(x, px, py, w, h, alpha, scale) {
    if (w <= 0 || h <= 0) return;
    x.save();
    x.globalAlpha = alpha;
    x.globalCompositeOperation = 'overlay';
    var p = x.createPattern(noiseCanvas(), 'repeat');
    if (scale && scale !== 1 && p.setTransform && typeof DOMMatrix !== 'undefined') p.setTransform(new DOMMatrix().scale(scale));
    x.fillStyle = p;
    x.fillRect(px, py, w, h);
    x.restore();
  }
  function vignette(x, W, H, a) {
    var g = x.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.3, W / 2, H * 0.45, Math.hypot(W, H) * 0.62);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,' + a + ')');
    x.fillStyle = g;
    x.fillRect(0, 0, W, H);
  }
  function topLight(x, W, H, cx, a) {
    var g = x.createRadialGradient(cx, -H * 0.2, 0, cx, -H * 0.2, H * 1.25);
    g.addColorStop(0, 'rgba(255,250,240,' + a + ')');
    g.addColorStop(1, 'rgba(255,250,240,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, W, H);
  }
  function fitText(x, text, maxW) {
    if (x.measureText(text).width <= maxW) return text;
    var t = text;
    while (t.length > 1 && x.measureText(t + '…').width > maxW) t = t.slice(0, -1);
    return t + '…';
  }

  /* ---------- พิกัดฉาก: x ซม. จากขอบซ้ายชิ้นงาน, y ซม. จากพื้นขึ้นไป ---------- */
  function X(cam, x) {
    return cam.left + x * cam.s;
  }
  function Y(cam, y) {
    return cam.floorY - y * cam.s;
  }

  /* พื้นเปอร์สเปกทีฟ: เส้นกระเบื้องวิ่งเข้าจุดลับตาที่ระดับสายตา 150 ซม. */
  function floor(x, cam, c1, c2, tile, lineA) {
    var W = cam.W;
    var H = cam.H;
    var fy = cam.floorY;
    if (fy >= H) return;
    var g = x.createLinearGradient(0, fy, 0, H);
    g.addColorStop(0, c1);
    g.addColorStop(1, c2);
    x.fillStyle = g;
    x.fillRect(0, fy, W, H - fy);
    grain(x, 0, fy, W, H - fy, 0.12);
    var s = cam.s;
    var eye = 150 * s;
    var vpX = W / 2;
    var vpY = fy - eye;
    var step = tile * s;
    x.save();
    x.beginPath();
    x.rect(0, fy, W, H - fy);
    x.clip();
    x.strokeStyle = 'rgba(0,0,0,' + lineA + ')';
    x.lineWidth = clamp(s * 0.3, 1, 3);
    x.beginPath();
    if (step > 6) {
      var k = (H - vpY) / (fy - vpY);
      for (var px = cam.left - Math.ceil(cam.left / step) * step; px <= W + step; px += step) {
        x.moveTo(px, fy);
        x.lineTo(vpX + (px - vpX) * k, H);
      }
      var d0 = (1.2 * W) / s;
      for (var z = tile; z < d0; z += tile) {
        var yy = vpY + (eye * d0) / (d0 - z);
        if (yy > H) break;
        x.moveTo(0, yy);
        x.lineTo(W, yy);
      }
    }
    x.stroke();
    // เงาตรงมุมผนังชนพื้น
    var hh = Math.max(6, 14 * s);
    var sh = x.createLinearGradient(0, fy, 0, fy + hh);
    sh.addColorStop(0, 'rgba(0,0,0,0.22)');
    sh.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = sh;
    x.fillRect(0, fy, W, hh);
    x.restore();
  }

  /* ---------- ฉาก ---------- */
  function sceneStudio(x, cam) {
    var W = cam.W;
    var H = cam.H;
    var g = x.createRadialGradient(W * 0.5, H * 0.42, 0, W * 0.5, H * 0.42, Math.hypot(W, H) * 0.62);
    g.addColorStop(0, '#f8f6f2');
    g.addColorStop(0.55, '#ebe7e0');
    g.addColorStop(1, '#d3cdc3');
    x.fillStyle = g;
    x.fillRect(0, 0, W, H);
    grain(x, 0, 0, W, H, 0.05);
  }

  function sceneWall(x, cam, g) {
    var W = cam.W;
    var H = cam.H;
    var fy = Math.min(cam.floorY, H);
    var bg = x.createLinearGradient(0, 0, 0, fy);
    bg.addColorStop(0, '#efebe4');
    bg.addColorStop(1, '#ddd6ca');
    x.fillStyle = bg;
    x.fillRect(0, 0, W, fy);
    grain(x, 0, 0, W, fy, 0.1, 1.5);
    topLight(x, W, H, X(cam, g.bw / 2), 0.55);
    if (cam.floorY < H) {
      var bt = Y(cam, 10);
      x.fillStyle = 'rgba(0,0,0,0.08)';
      x.fillRect(0, bt - Math.max(2, 0.8 * cam.s), W, Math.max(2, 0.8 * cam.s));
      x.fillStyle = '#d2c9bb';
      x.fillRect(0, bt, W, cam.floorY - bt);
      x.fillStyle = 'rgba(255,255,255,0.6)';
      x.fillRect(0, bt, W, Math.max(1, 0.4 * cam.s));
      floor(x, cam, '#b4ab9e', '#958c7f', 60, 0.1);
    }
    vignette(x, W, H, 0.22);
  }

  function sceneBrick(x, cam, g) {
    var W = cam.W;
    var H = cam.H;
    var s = cam.s;
    var fy = Math.min(cam.floorY, H);
    x.fillStyle = '#c9c0b3';
    x.fillRect(0, 0, W, fy);
    var rowH = 7.5;
    var len = 22.5;
    var mortar = Math.max(1, 1.1 * s);
    var yTop = cam.floorY / s;
    var xMin = -cam.left / s;
    var xMax = (W - cam.left) / s;
    var r0 = Math.max(0, Math.floor((cam.floorY - H) / s / rowH));
    var hpx = rowH * s - mortar;
    var bevel = hpx > 12;
    for (var r = r0; r * rowH < yTop; r++) {
      var off = (r % 2) * (len / 2);
      var k0 = Math.floor((xMin - off) / len) - 1;
      var k1 = Math.ceil((xMax - off) / len) + 1;
      var y0 = Y(cam, (r + 1) * rowH) + mortar / 2;
      for (var k = k0; k <= k1; k++) {
        var a = hash(k, r);
        var b = hash(r * 7 + 3, k * 13 + 1);
        var bx = X(cam, off + k * len) + mortar / 2;
        var bw = len * s - mortar;
        x.fillStyle = 'hsl(' + (10 + b * 10).toFixed(1) + ',' + (36 + a * 16).toFixed(1) + '%,' + (32 + a * 13).toFixed(1) + '%)';
        x.fillRect(bx, y0, bw, hpx);
        if (bevel) {
          x.fillStyle = 'rgba(255,255,255,0.10)';
          x.fillRect(bx, y0, bw, Math.max(1, hpx * 0.1));
          x.fillStyle = 'rgba(0,0,0,0.14)';
          x.fillRect(bx, y0 + hpx * 0.86, bw, hpx * 0.14);
        }
      }
    }
    grain(x, 0, 0, W, fy, 0.14);
    topLight(x, W, H, X(cam, g.bw / 2), 0.35);
    if (cam.floorY < H) floor(x, cam, '#a5a097', '#87827a', 80, 0.09);
    vignette(x, W, H, 0.3);
  }

  function shutter(x, cam, x0, x1, top) {
    var s = cam.s;
    var L = X(cam, x0);
    var R = X(cam, x1);
    var T = Y(cam, top);
    var B = Y(cam, 0);
    if (R < 0 || L > cam.W || T > cam.H) return;
    var g = x.createLinearGradient(L, 0, R, 0);
    g.addColorStop(0, '#b6bbc1');
    g.addColorStop(0.5, '#dadde1');
    g.addColorStop(1, '#b2b7bd');
    x.fillStyle = g;
    x.fillRect(L, T, R - L, B - T);
    var pitch = 7.5 * s;
    var bar = 14 * s;
    if (pitch >= 3) {
      var lw = Math.max(1, pitch * 0.14);
      x.beginPath();
      for (var y = B - bar - pitch; y > T; y -= pitch) x.rect(L, y, R - L, lw);
      x.fillStyle = 'rgba(55,62,70,0.30)';
      x.fill();
      x.beginPath();
      for (var y2 = B - bar - pitch; y2 > T; y2 -= pitch) x.rect(L, y2 + lw, R - L, lw);
      x.fillStyle = 'rgba(255,255,255,0.40)';
      x.fill();
    }
    x.fillStyle = '#8e949b';
    x.fillRect(L, B - bar, R - L, bar);
    x.fillStyle = 'rgba(255,255,255,0.35)';
    x.fillRect(L, B - bar, R - L, Math.max(1, 0.8 * s));
    var lockW = 12 * s;
    x.fillStyle = '#5d636b';
    x.fillRect((L + R) / 2 - lockW / 2, B - bar * 0.75, lockW, bar * 0.45);
    x.fillStyle = '#767c84';
    x.fillRect(L, T, 4 * s, B - T);
    x.fillRect(R - 4 * s, T, 4 * s, B - T);
    var sh = x.createLinearGradient(0, T, 0, T + 45 * s);
    sh.addColorStop(0, 'rgba(0,0,0,0.30)');
    sh.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = sh;
    x.fillRect(L, T, R - L, 45 * s);
    grain(x, L, T, R - L, B - T, 0.06);
  }

  // ตึกแถวไทย: ห้องละ 4 เมตร เสา ประตูม้วน ชั้นบนมีหน้าต่าง ป้ายแขวนเหนือประตูม้วน
  function sceneShop(x, cam, g) {
    var W = cam.W;
    var H = cam.H;
    var s = cam.s;
    var fy = Math.min(cam.floorY, H);
    var cx = g.bw / 2;
    var mod = 400;
    var pil = 36;
    x.fillStyle = '#e6dac3';
    x.fillRect(0, 0, W, fy);
    grain(x, 0, 0, W, fy, 0.09, 1.4);
    var xMin = -cam.left / s;
    var xMax = (W - cam.left) / s;
    var k0 = Math.floor((xMin - cx) / mod) - 1;
    var k1 = Math.ceil((xMax - cx) / mod) + 1;
    for (var k = k0; k <= k1; k++) {
      var mx = cx + k * mod;
      var b = mx - mod / 2;
      // กันสาดชั้นสอง
      var ly = Y(cam, 414);
      x.fillStyle = '#d6c8ad';
      x.fillRect(X(cam, b), ly, mod * s, 14 * s);
      var ls = x.createLinearGradient(0, ly + 14 * s, 0, ly + 40 * s);
      ls.addColorStop(0, 'rgba(0,0,0,0.18)');
      ls.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = ls;
      x.fillRect(X(cam, b), ly + 14 * s, mod * s, 26 * s);
      // หน้าต่างชั้นสอง
      var wx = X(cam, mx - 100);
      var wy = Y(cam, 650);
      var ww = 200 * s;
      var wh = 190 * s;
      if (wy < H && wy + wh > 0) {
        x.fillStyle = '#c9baa0';
        x.fillRect(wx, wy, ww, wh);
        var gl = x.createLinearGradient(wx, wy, wx + ww * 0.4, wy + wh);
        gl.addColorStop(0, '#71849a');
        gl.addColorStop(1, '#2e3a48');
        x.fillStyle = gl;
        x.fillRect(wx + 7 * s, wy + 7 * s, ww - 14 * s, wh - 14 * s);
        x.fillStyle = 'rgba(255,255,255,0.10)';
        x.beginPath();
        x.moveTo(wx + ww * 0.15, wy + 7 * s);
        x.lineTo(wx + ww * 0.42, wy + 7 * s);
        x.lineTo(wx + ww * 0.12, wy + wh - 7 * s);
        x.lineTo(wx + 7 * s, wy + wh - 7 * s);
        x.closePath();
        x.fill();
        x.fillStyle = '#c9baa0';
        x.fillRect(wx + ww / 2 - 3 * s, wy, 6 * s, wh);
      }
      // ประตูม้วน
      shutter(x, cam, b + pil / 2, b + mod - pil / 2, 270);
      x.fillStyle = 'rgba(0,0,0,0.07)';
      x.fillRect(X(cam, b), Y(cam, 284), mod * s, 14 * s);
    }
    // เสา
    for (var p = k0; p <= k1 + 1; p++) {
      var bx = cx + p * mod - mod / 2;
      var L = X(cam, bx - pil / 2);
      var pw = pil * s;
      x.fillStyle = '#ddcfb5';
      x.fillRect(L, 0, pw, fy);
      x.fillStyle = 'rgba(255,255,255,0.18)';
      x.fillRect(L, 0, pw * 0.3, fy);
      x.fillStyle = 'rgba(0,0,0,0.12)';
      x.fillRect(L + pw * 0.82, 0, pw * 0.18, fy);
    }
    topLight(x, W, H, X(cam, cx), 0.3);
    if (cam.floorY < H) floor(x, cam, '#bdb6aa', '#9c958a', 40, 0.12);
    vignette(x, W, H, 0.24);
  }

  // รั้วตาข่ายกลางแจ้ง: ฟ้า แนวไม้ หญ้า เสาเหล็กทุก 2.5 เมตร
  function sceneFence(x, cam, g) {
    var W = cam.W;
    var H = cam.H;
    var s = cam.s;
    var fy = cam.floorY;
    var hz = Y(cam, 150);
    if (hz > 0) {
      var sky = x.createLinearGradient(0, 0, 0, Math.min(hz, H));
      sky.addColorStop(0, '#8cb6da');
      sky.addColorStop(1, '#dce8ee');
      x.fillStyle = sky;
      x.fillRect(0, 0, W, Math.min(hz, H));
    }
    if (hz < fy) {
      var far = x.createLinearGradient(0, hz, 0, fy);
      far.addColorStop(0, '#b7c99c');
      far.addColorStop(1, '#8ea96a');
      x.fillStyle = far;
      x.fillRect(0, Math.max(0, hz), W, Math.min(fy, H) - Math.max(0, hz));
    }
    if (hz > -H * 0.2 && hz < H) {
      var r = rng(5);
      var layers = [['#9db58a', 0.05], ['#77985f', 0.035], ['#5d824e', 0.02]];
      for (var li = 0; li < layers.length; li++) {
        x.fillStyle = layers[li][0];
        x.beginPath();
        for (var i = 0; i < 46; i++) {
          var tx = r() * W * 1.1 - W * 0.05;
          var tr = H * (layers[li][1] + r() * 0.035);
          var ty = hz - tr * 0.2 - r() * H * 0.03 + li * H * 0.012;
          x.moveTo(tx + tr, ty);
          x.arc(tx, ty, tr, 0, Math.PI * 2);
        }
        x.rect(0, hz - 1, W, H * 0.012 * (li + 1) + 2);
        x.fill();
      }
    }
    if (fy < H) {
      var gr = x.createLinearGradient(0, fy, 0, H);
      gr.addColorStop(0, '#7f9d58');
      gr.addColorStop(1, '#5b7b3c');
      x.fillStyle = gr;
      x.fillRect(0, fy, W, H - fy);
      grain(x, 0, fy, W, H - fy, 0.2);
    }
    grain(x, 0, 0, W, Math.min(fy, H), 0.05);
    // ตาข่าย
    var F = Math.max(180, cam.top + 15);
    var T = Y(cam, F);
    var B = Y(cam, 3);
    x.save();
    x.beginPath();
    x.rect(0, T, W, B - T);
    x.clip();
    var d = 6 * s;
    if (d >= 4) {
      x.strokeStyle = 'rgba(78,86,94,0.55)';
      x.lineWidth = clamp(0.3 * s, 0.8, 3);
      x.beginPath();
      var hgt = B - T;
      for (var c = -hgt; c < W + hgt; c += d) {
        x.moveTo(c, T);
        x.lineTo(c + hgt, B);
        x.moveTo(c + hgt, T);
        x.lineTo(c, B);
      }
      x.stroke();
    } else {
      x.fillStyle = 'rgba(78,86,94,0.22)';
      x.fillRect(0, T, W, B - T);
    }
    x.restore();
    function pipe(px, py, pw, ph, vertical) {
      var pg = vertical ? x.createLinearGradient(px, 0, px + pw, 0) : x.createLinearGradient(0, py, 0, py + ph);
      pg.addColorStop(0, '#7f868d');
      pg.addColorStop(0.45, '#d4d8dc');
      pg.addColorStop(1, '#6f767d');
      x.fillStyle = pg;
      x.fillRect(px, py, pw, ph);
    }
    pipe(0, T - 2 * s, W, Math.max(2, 4.5 * s), false);
    var cx = g.bw / 2;
    var xMin = -cam.left / s;
    var xMax = (W - cam.left) / s;
    for (var k = Math.floor((xMin - cx) / 250) - 1; k <= Math.ceil((xMax - cx) / 250) + 1; k++) {
      var pxw = Math.max(3, 6 * s);
      pipe(X(cam, cx + 125 + k * 250) - pxw / 2, T - 6 * s, pxw, B - T + 9 * s, true);
    }
    vignette(x, W, H, 0.18);
  }

  var SCENE_DRAW = { studio: sceneStudio, wall: sceneWall, brick: sceneBrick, shop: sceneShop, fence: sceneFence };

  /* ---------- คนยืนเทียบขนาด 170 ซม. ---------- */
  function person(x, cam, U) {
    var s = cam.s;
    var cx = cam.personX;
    var fy = cam.floorY;
    function R(px, py, w, h, r) {
      rr(x, cx + px * s, fy - (py + h) * s, w * s, h * s, r * s);
    }
    x.save();
    var sh = x.createRadialGradient(0, 0, 0, 0, 0, 1);
    sh.addColorStop(0, 'rgba(0,0,0,0.25)');
    sh.addColorStop(1, 'rgba(0,0,0,0)');
    x.translate(cx, fy);
    x.scale(34 * s, 5 * s);
    x.fillStyle = sh;
    circle(x, 0, 0, 1);
    x.fill();
    x.restore();
    x.save();
    x.fillStyle = '#2e3954';
    x.beginPath();
    R(-11.5, 2, 10.5, 88, 4);
    R(1, 2, 10.5, 88, 4);
    R(-14, 0, 13, 5, 2.5);
    R(1, 0, 13, 5, 2.5);
    R(-16.5, 84, 33, 62, 9);
    R(-22.5, 80, 7.5, 62, 3.8);
    R(15, 80, 7.5, 62, 3.8);
    R(-4.5, 140, 9, 10, 3);
    x.fill();
    x.beginPath();
    x.ellipse(cx, fy - 158.5 * s, 9.5 * s, 11.5 * s, 0, 0, Math.PI * 2);
    x.fill();
    var label = 'คนสูง 170 ซม.';
    x.font = '500 ' + Math.round(17 * U) + 'px ' + BODY;
    var lw = x.measureText(label).width + 18 * U;
    var lh = 26 * U;
    var ly = fy - 172 * s - 10 * U - lh;
    x.beginPath();
    rr(x, cx - lw / 2, ly, lw, lh, lh / 2);
    x.fillStyle = 'rgba(255,255,255,0.88)';
    x.fill();
    x.fillStyle = '#2e3954';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(label, cx, ly + lh / 2 + U);
    x.restore();
  }

  /* ---------- ตัวป้าย ---------- */
  function paintDesign(x, d, px, py, w, h, fit) {
    if (!d || !d.src) {
      x.fillStyle = '#f4f2ee';
      x.fillRect(px, py, w, h);
      return;
    }
    if (fit === 'contain') {
      x.fillStyle = d.bg ? rgb(d.bg) : '#ffffff';
      x.fillRect(px, py, w, h);
      var r = C.containRect(d.w, d.h, w, h);
      x.drawImage(d.src, px + r.dx, py + r.dy, r.dw, r.dh);
    } else {
      var c = C.coverCrop(d.w, d.h, w, h);
      x.drawImage(d.src, c.sx, c.sy, c.sw, c.sh, px, py, w, h);
    }
  }

  // รอยตึงจากตาไก่ที่มุม ให้ดูเป็นผ้าใบจริง (จาง ๆ ไม่บังงาน)
  function vinylWaves(x, px, py, w, h) {
    var L = Math.min(w, h);
    var n = Math.SQRT1_2;
    var corners = [[px, py, 1, 1], [px + w, py, -1, 1], [px, py + h, 1, -1], [px + w, py + h, -1, -1]];
    for (var i = 0; i < 4; i++) {
      var c = corners[i];
      for (var j = 0; j < 2; j++) {
        var len = L * (0.28 + 0.14 * j);
        var off = L * (0.03 + 0.05 * j) * (j ? 1 : -1);
        var dx = c[2] * n;
        var dy = c[3] * n;
        var nx = -dy;
        var ny = dx;
        var sx = c[0] + nx * off;
        var sy = c[1] + ny * off;
        var half = L * 0.07;
        var gr = x.createLinearGradient(sx - nx * half, sy - ny * half, sx + nx * half, sy + ny * half);
        gr.addColorStop(0, 'rgba(255,255,255,0)');
        gr.addColorStop(0.42, 'rgba(255,255,255,0.07)');
        gr.addColorStop(0.58, 'rgba(0,0,0,0.05)');
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        x.beginPath();
        x.moveTo(sx - nx * half, sy - ny * half);
        x.lineTo(sx + nx * half, sy + ny * half);
        x.lineTo(sx + dx * len, sy + dy * len);
        x.closePath();
        x.fillStyle = gr;
        x.fill();
      }
    }
  }

  function gloss(x, px, py, w, h) {
    x.save();
    x.beginPath();
    x.moveTo(px, py);
    x.lineTo(px + w * 0.55, py);
    x.lineTo(px + w * 0.2, py + h);
    x.lineTo(px, py + h);
    x.closePath();
    var g = x.createLinearGradient(px, py, px + w * 0.4, py + h * 0.6);
    g.addColorStop(0, 'rgba(255,255,255,0.30)');
    g.addColorStop(1, 'rgba(255,255,255,0.03)');
    x.fillStyle = g;
    x.fill();
    x.beginPath();
    x.moveTo(px + w * 0.62, py);
    x.lineTo(px + w * 0.68, py);
    x.lineTo(px + w * 0.33, py + h);
    x.lineTo(px + w * 0.27, py + h);
    x.closePath();
    x.fillStyle = 'rgba(255,255,255,0.10)';
    x.fill();
    x.restore();
  }

  function faceShade(x, px, py, w, h) {
    var g = x.createLinearGradient(px, py, px + w * 0.3, py + h);
    g.addColorStop(0, 'rgba(255,255,255,0.06)');
    g.addColorStop(1, 'rgba(0,0,0,0.07)');
    x.fillStyle = g;
    x.fillRect(px, py, w, h);
  }

  // ความหนาด้านขวา/ล่าง (มองเฉียงจากล่างขวานิด ๆ)
  function extrusion(x, g, px, py, w, h, ex, d) {
    var side;
    var bottom;
    if (g.type === 'foam') {
      side = '#eeece6';
      bottom = '#d9d6ce';
    } else if (g.type === 'lightbox') {
      side = '#c3c8ce';
      bottom = '#9da3aa';
    } else if (g.type === 'acrylic') {
      side = 'rgba(176,212,222,0.92)';
      bottom = 'rgba(146,188,202,0.92)';
    } else {
      var base = (d && d.bg) || [130, 130, 130];
      side = rgb(base, 0.78);
      bottom = rgb(base, 0.6);
    }
    x.beginPath();
    x.moveTo(px + w, py);
    x.lineTo(px + w + ex, py + ex);
    x.lineTo(px + w + ex, py + h + ex);
    x.lineTo(px + w, py + h);
    x.closePath();
    x.fillStyle = side;
    x.fill();
    x.beginPath();
    x.moveTo(px, py + h);
    x.lineTo(px + w, py + h);
    x.lineTo(px + w + ex, py + h + ex);
    x.lineTo(px + ex, py + h + ex);
    x.closePath();
    x.fillStyle = bottom;
    x.fill();
    if (g.type === 'acrylic') {
      x.strokeStyle = 'rgba(255,255,255,0.75)';
      x.lineWidth = 1;
      x.beginPath();
      x.moveTo(px + w + ex, py + ex);
      x.lineTo(px + w + ex, py + h + ex);
      x.lineTo(px + ex, py + h + ex);
      x.stroke();
    }
  }

  function metal(x, cx, cy, r) {
    var gr = x.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.05, cx, cy, r);
    gr.addColorStop(0, '#ffffff');
    gr.addColorStop(0.45, '#d5d8dc');
    gr.addColorStop(1, '#868c93');
    x.fillStyle = gr;
    circle(x, cx, cy, r);
    x.fill();
  }

  function eyeletDots(x, g, k, px, py) {
    var pts = C.eyelets(g.w, g.h);
    var r = Math.max(1.3 * k, 2.2);
    for (var i = 0; i < pts.length; i++) {
      var cx = px + pts[i].x * k;
      var cy = py + pts[i].y * k;
      if (r < 3) {
        x.fillStyle = 'rgba(150,154,160,0.95)';
        circle(x, cx, cy, r);
        x.fill();
        continue;
      }
      metal(x, cx, cy, r);
      x.strokeStyle = 'rgba(0,0,0,0.28)';
      x.lineWidth = Math.max(0.6, r * 0.08);
      x.stroke();
      x.fillStyle = 'rgba(28,28,28,0.62)';
      circle(x, cx, cy, r * 0.48);
      x.fill();
    }
  }

  function standoffs(x, g, k, px, py) {
    var inset = Math.max(2.5, Math.min(g.w, g.h) * 0.07) * k;
    var r = Math.max(1.25 * k, 3);
    var pts = [[px + inset, py + inset], [px + g.w * k - inset, py + inset], [px + inset, py + g.h * k - inset], [px + g.w * k - inset, py + g.h * k - inset]];
    for (var i = 0; i < 4; i++) {
      x.fillStyle = 'rgba(0,0,0,0.25)';
      circle(x, pts[i][0] + r * 0.18, pts[i][1] + r * 0.28, r * 1.02);
      x.fill();
      metal(x, pts[i][0], pts[i][1], r);
      x.strokeStyle = 'rgba(0,0,0,0.2)';
      x.lineWidth = Math.max(0.6, r * 0.07);
      circle(x, pts[i][0], pts[i][1], r * 0.62);
      x.stroke();
    }
  }

  function rollupHardware(x, g, k) {
    var fx = g.fx * k;
    var fw = g.w * k;
    var bw = g.bw * k;
    var rh = Math.max(g.rail * k, 2);
    var rail = x.createLinearGradient(0, 0, 0, rh);
    rail.addColorStop(0, '#f2f4f6');
    rail.addColorStop(1, '#8d949c');
    x.fillStyle = rail;
    x.fillRect(fx - 0.6 * k, 0, fw + 1.2 * k, rh);
    x.fillStyle = '#4a4f57';
    x.fillRect(fx - 0.6 * k, 0, Math.max(1.5, 1.2 * k), rh);
    x.fillRect(fx + fw - 0.6 * k, 0, Math.max(1.5, 1.2 * k), rh);
    var cy = (g.fy + g.h - 1) * k;
    var ch = g.base * k;
    var cg = x.createLinearGradient(0, cy, 0, cy + ch);
    cg.addColorStop(0, '#f3f5f7');
    cg.addColorStop(0.4, '#cbd0d6');
    cg.addColorStop(0.85, '#9aa1a9');
    cg.addColorStop(1, '#7a818a');
    x.beginPath();
    rr(x, 0, cy, bw, ch, Math.min(ch * 0.35, 3 * k));
    x.fillStyle = cg;
    x.fill();
    x.fillStyle = 'rgba(0,0,0,0.45)';
    x.fillRect(fx - 0.5 * k, cy + 0.6 * k, fw + k, Math.max(1, 0.45 * k));
    x.fillStyle = '#4a4f57';
    x.beginPath();
    rr(x, 0, cy, Math.max(3 * k, 3), ch, Math.min(ch * 0.35, 3 * k));
    rr(x, bw - Math.max(3 * k, 3), cy, Math.max(3 * k, 3), ch, Math.min(ch * 0.35, 3 * k));
    x.fill();
    var fh = Math.max(g.feet * k, 1.5);
    x.fillStyle = '#3a3f46';
    x.beginPath();
    rr(x, 1.5 * k, cy + ch - 0.5 * k, 16 * k, fh + 0.5 * k, Math.min(fh / 2, 0.8 * k));
    rr(x, bw - 17.5 * k, cy + ch - 0.5 * k, 16 * k, fh + 0.5 * k, Math.min(fh / 2, 0.8 * k));
    x.fill();
  }

  function xstandHardware(x, g, k) {
    var fx = g.fx * k;
    var fw = g.w * k;
    var fh = g.h * k;
    var B = (g.h + g.lift) * k;
    var lw = Math.max(1.4 * k, 2);
    x.save();
    x.lineCap = 'round';
    x.strokeStyle = '#3b4048';
    x.lineWidth = lw;
    x.beginPath();
    x.moveTo(fx, fh);
    x.lineTo(lw / 2, B - lw / 2);
    x.moveTo(fx + fw, fh);
    x.lineTo(g.bw * k - lw / 2, B - lw / 2);
    x.stroke();
    x.strokeStyle = 'rgba(255,255,255,0.35)';
    x.lineWidth = Math.max(0.6, lw * 0.25);
    x.stroke();
    x.fillStyle = '#23272d';
    var hw = Math.max(2.6 * k, 4);
    var hh = Math.max(1.2 * k, 2);
    var corners = [[fx, 0], [fx + fw, 0], [fx, fh], [fx + fw, fh]];
    x.beginPath();
    for (var i = 0; i < 4; i++) rr(x, corners[i][0] - hw / 2, corners[i][1] - hh / 2, hw, hh, hh / 2);
    x.fill();
    x.beginPath();
    rr(x, 0, B - Math.max(1.2 * k, 2), Math.max(4 * k, 5), Math.max(1.2 * k, 2), 1);
    rr(x, g.bw * k - Math.max(4 * k, 5), B - Math.max(1.2 * k, 2), Math.max(4 * k, 5), Math.max(1.2 * k, 2), 1);
    x.fill();
    x.restore();
  }

  /* วาดชิ้นงานทั้งชิ้น (หน้าป้าย + ขาตั้ง/อุปกรณ์) ลงผืนแยก 1 ซม. = k พิกเซล */
  var PAD = 6;
  function objectCanvas(g, k, d, fit) {
    var c = mk(g.bw * k + PAD * 2, g.bh * k + PAD * 2);
    var x = ctx2d(c);
    x.translate(PAD, PAD);
    var px = g.fx * k;
    var py = g.fy * k;
    var w = g.w * k;
    var h = g.h * k;
    if (g.depth) extrusion(x, g, px, py, w, h, Math.max(g.ex * k, 2.5), d);
    x.save();
    x.beginPath();
    x.rect(px, py, w, h);
    x.clip();
    paintDesign(x, d, px, py, w, h, fit);
    if (g.type === 'vinyl') vinylWaves(x, px, py, w, h);
    if (g.type === 'acrylic') gloss(x, px, py, w, h);
    faceShade(x, px, py, w, h);
    x.restore();
    if (g.type === 'lightbox') {
      var rim = Math.max(2, g.rim * k);
      x.strokeStyle = '#cfd3d8';
      x.lineWidth = rim;
      x.strokeRect(px + rim / 2, py + rim / 2, w - rim, h - rim);
      x.strokeStyle = 'rgba(0,0,0,0.18)';
      x.lineWidth = 1;
      x.strokeRect(px + rim, py + rim, w - rim * 2, h - rim * 2);
    }
    if (g.type === 'foam') {
      x.strokeStyle = 'rgba(0,0,0,0.10)';
      x.lineWidth = 1;
      x.strokeRect(px + 0.5, py + 0.5, w - 1, h - 1);
    }
    if (g.type === 'vinyl') eyeletDots(x, g, k, px, py);
    else if (g.type === 'acrylic') standoffs(x, g, k, px, py);
    else if (g.type === 'rollup') rollupHardware(x, g, k);
    else if (g.type === 'xstand') xstandHardware(x, g, k);
    return c;
  }

  /* ---------- เส้นบอกขนาด ---------- */
  function pill(x, text, cx, cy, U) {
    x.font = '600 ' + Math.round(19 * U) + 'px ' + BODY;
    var tw = x.measureText(text).width;
    var ph = 32 * U;
    var pw = tw + 24 * U;
    x.beginPath();
    rr(x, cx - pw / 2, cy - ph / 2, pw, ph, ph / 2);
    x.fillStyle = NAVY;
    x.fill();
    x.fillStyle = '#ffffff';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(text, cx, cy + U);
  }

  // เส้นวัดจาก a ไป b เยื้องออกไปทางทิศ (nx,ny)
  function measure(x, a, b, nx, ny, off, text, U) {
    var ax = a.x + nx * off;
    var ay = a.y + ny * off;
    var bx = b.x + nx * off;
    var by = b.y + ny * off;
    var L = Math.hypot(bx - ax, by - ay) || 1;
    var ux = (bx - ax) / L;
    var uy = (by - ay) / L;
    var tick = 9 * U;
    var ah = 11 * U;
    x.save();
    x.beginPath();
    x.moveTo(ax, ay);
    x.lineTo(bx, by);
    x.moveTo(a.x + nx * (off - tick), a.y + ny * (off - tick));
    x.lineTo(a.x + nx * (off + tick), a.y + ny * (off + tick));
    x.moveTo(b.x + nx * (off - tick), b.y + ny * (off - tick));
    x.lineTo(b.x + nx * (off + tick), b.y + ny * (off + tick));
    x.lineCap = 'round';
    x.strokeStyle = 'rgba(255,255,255,0.85)';
    x.lineWidth = 5.5 * U;
    x.stroke();
    x.strokeStyle = BRICK;
    x.fillStyle = BRICK;
    x.lineWidth = 2.2 * U;
    x.stroke();
    x.beginPath();
    x.moveTo(ax, ay);
    x.lineTo(ax + ux * ah + nx * ah * 0.45, ay + uy * ah + ny * ah * 0.45);
    x.lineTo(ax + ux * ah - nx * ah * 0.45, ay + uy * ah - ny * ah * 0.45);
    x.closePath();
    x.moveTo(bx, by);
    x.lineTo(bx - ux * ah + nx * ah * 0.45, by - uy * ah + ny * ah * 0.45);
    x.lineTo(bx - ux * ah - nx * ah * 0.45, by - uy * ah - ny * ah * 0.45);
    x.closePath();
    x.fill();
    x.restore();
    pill(x, text, (ax + bx) / 2, (ay + by) / 2, U);
  }

  function dimsRect(x, fr, g, W, U) {
    var off = 30 * U;
    var wText = C.fmtCm(g.w) + ' ซม.';
    var hText = C.fmtCm(g.h) + ' ซม.';
    if (fr.y - off > 26 * U) measure(x, { x: fr.x, y: fr.y }, { x: fr.x + fr.w, y: fr.y }, 0, -1, off, wText, U);
    else measure(x, { x: fr.x, y: fr.y + fr.h + fr.ex }, { x: fr.x + fr.w, y: fr.y + fr.h + fr.ex }, 0, 1, off, wText, U);
    var right = fr.x + fr.w + fr.ex;
    if (right + off + 60 * U < W) measure(x, { x: right, y: fr.y }, { x: right, y: fr.y + fr.h }, 1, 0, off, hText, U);
    else measure(x, { x: fr.x, y: fr.y }, { x: fr.x, y: fr.y + fr.h }, -1, 0, off, hText, U);
  }

  function dimsQuad(x, q, g, U) {
    var mx = (q[0].x + q[1].x + q[2].x + q[3].x) / 4;
    var my = (q[0].y + q[1].y + q[2].y + q[3].y) / 4;
    function edge(a, b, text) {
      var ex = b.x - a.x;
      var ey = b.y - a.y;
      var L = Math.hypot(ex, ey) || 1;
      var nx = -ey / L;
      var ny = ex / L;
      var cx = (a.x + b.x) / 2;
      var cy = (a.y + b.y) / 2;
      if (nx * (cx - mx) + ny * (cy - my) < 0) {
        nx = -nx;
        ny = -ny;
      }
      measure(x, a, b, nx, ny, 26 * U, text, U);
    }
    edge(q[0], q[1], C.fmtCm(g.w) + ' ซม.');
    edge(q[1], q[2], C.fmtCm(g.h) + ' ซม.');
  }

  // หน้าป้ายจริง (ไม่รวมขาตั้ง) บนรูปลูกค้า
  function faceQuad(q, g) {
    var H = C.homography(q);
    var u0 = g.fx / g.bw;
    var v0 = g.fy / g.bh;
    var u1 = (g.fx + g.w) / g.bw;
    var v1 = (g.fy + g.h) / g.bh;
    return [C.project(H, u0, v0), C.project(H, u1, v0), C.project(H, u1, v1), C.project(H, u0, v1)];
  }

  /* ---------- บิดภาพตามสี่เหลี่ยมใด ๆ (แบ่งสามเหลี่ยมย่อย) ---------- */
  function tri(x, img, s0, s1, s2, d0, d1, d2, cell) {
    var ux = s1.x - s0.x;
    var uy = s1.y - s0.y;
    var vx = s2.x - s0.x;
    var vy = s2.y - s0.y;
    var det = ux * vy - vx * uy;
    if (Math.abs(det) < 1e-9) return;
    var px = d1.x - d0.x;
    var py = d1.y - d0.y;
    var qx = d2.x - d0.x;
    var qy = d2.y - d0.y;
    var a = (px * vy - qx * uy) / det;
    var c = (qx * ux - px * vx) / det;
    var b = (py * vy - qy * uy) / det;
    var d = (qy * ux - py * vx) / det;
    var e = d0.x - a * s0.x - c * s0.y;
    var f = d0.y - b * s0.x - d * s0.y;
    var mx = (d0.x + d1.x + d2.x) / 3;
    var my = (d0.y + d1.y + d2.y) / 3;
    function grow(p) {
      var dx = p.x - mx;
      var dy = p.y - my;
      var L = Math.hypot(dx, dy) || 1;
      return { x: p.x + (dx / L) * 0.9, y: p.y + (dy / L) * 0.9 };
    }
    var e0 = grow(d0);
    var e1 = grow(d1);
    var e2 = grow(d2);
    x.save();
    x.beginPath();
    x.moveTo(e0.x, e0.y);
    x.lineTo(e1.x, e1.y);
    x.lineTo(e2.x, e2.y);
    x.closePath();
    x.clip();
    x.transform(a, b, c, d, e, f);
    var sx = Math.max(0, cell.x - 2);
    var sy = Math.max(0, cell.y - 2);
    var sw = Math.min(img.width - sx, cell.w + 4);
    var sh = Math.min(img.height - sy, cell.h + 4);
    if (sw > 0 && sh > 0) x.drawImage(img, sx, sy, sw, sh, sx, sy, sw, sh);
    x.restore();
  }

  function warp(x, img, src, quad, n) {
    var H = C.homography(quad);
    var P = [];
    for (var j = 0; j <= n; j++) for (var i = 0; i <= n; i++) P.push(C.project(H, i / n, j / n));
    for (var jj = 0; jj < n; jj++) {
      for (var ii = 0; ii < n; ii++) {
        var x0 = src.x + (src.w * ii) / n;
        var x1 = src.x + (src.w * (ii + 1)) / n;
        var y0 = src.y + (src.h * jj) / n;
        var y1 = src.y + (src.h * (jj + 1)) / n;
        var p00 = P[jj * (n + 1) + ii];
        var p10 = P[jj * (n + 1) + ii + 1];
        var p01 = P[(jj + 1) * (n + 1) + ii];
        var p11 = P[(jj + 1) * (n + 1) + ii + 1];
        var cell = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
        tri(x, img, { x: x0, y: y0 }, { x: x1, y: y0 }, { x: x0, y: y1 }, p00, p10, p01, cell);
        tri(x, img, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }, p10, p11, p01, cell);
      }
    }
  }

  /* ---------- แถบรายละเอียดใต้ภาพ (ส่งลูกค้า) ---------- */
  function footer(x, W, y0, F, U, info) {
    x.save();
    x.fillStyle = NAVY;
    x.fillRect(0, y0, W, F);
    x.fillStyle = BRICK;
    x.fillRect(0, y0, W, Math.max(2, 4 * U));
    var pad = 34 * U;
    var left = pad;
    if (info.logo && info.logo.width) {
      var lh = F - 46 * U;
      var lw = Math.min((lh * info.logo.width) / info.logo.height, lh * 2.6);
      var lhh = (lw * info.logo.height) / info.logo.width;
      x.fillStyle = '#ffffff';
      x.beginPath();
      rr(x, left, y0 + (F - lhh) / 2 - 8 * U + 2 * U, lw + 16 * U, lhh + 16 * U, 10 * U);
      x.fill();
      x.drawImage(info.logo, left + 8 * U, y0 + (F - lhh) / 2 + 2 * U, lw, lhh);
      left += lw + 16 * U + 22 * U;
    }
    var right = W - pad;
    var priceW = 0;
    x.textBaseline = 'alphabetic';
    if (info.price) {
      x.textAlign = 'right';
      x.font = '600 ' + Math.round(48 * U) + 'px ' + DISPLAY;
      x.fillStyle = '#f39a62';
      x.fillText(info.price, right, y0 + F * 0.72);
      priceW = x.measureText(info.price).width;
      x.font = '500 ' + Math.round(17 * U) + 'px ' + BODY;
      x.fillStyle = '#b8c1d8';
      x.fillText(info.priceNote || '', right, y0 + F * 0.33);
      priceW = Math.max(priceW, x.measureText(info.priceNote || '').width);
    }
    var maxW = right - (priceW ? priceW + 34 * U : 0) - left;
    x.textAlign = 'left';
    x.font = '600 ' + Math.round(29 * U) + 'px ' + DISPLAY;
    x.fillStyle = '#ffffff';
    x.fillText(fitText(x, info.title || '', maxW), left, y0 + F * 0.38);
    x.font = '400 ' + Math.round(19 * U) + 'px ' + BODY;
    x.fillStyle = '#d6dcea';
    x.fillText(fitText(x, info.line2 || '', maxW), left, y0 + F * 0.62);
    x.font = '400 ' + Math.round(16 * U) + 'px ' + BODY;
    x.fillStyle = '#97a3c2';
    x.fillText(fitText(x, info.line3 || '', maxW), left, y0 + F * 0.84);
    x.restore();
  }

  function handles(x, q, U) {
    x.save();
    x.setLineDash([10 * U, 7 * U]);
    x.lineWidth = 2 * U;
    x.strokeStyle = '#ffffff';
    x.beginPath();
    x.moveTo(q[0].x, q[0].y);
    for (var i = 1; i < 4; i++) x.lineTo(q[i].x, q[i].y);
    x.closePath();
    x.stroke();
    x.setLineDash([]);
    for (var j = 0; j < 4; j++) {
      x.beginPath();
      x.arc(q[j].x, q[j].y, 15 * U, 0, Math.PI * 2);
      x.fillStyle = 'rgba(255,255,255,0.95)';
      x.fill();
      x.lineWidth = 4 * U;
      x.strokeStyle = BRICK;
      x.stroke();
    }
    x.restore();
  }

  /* ---------- วาดทั้งภาพ ----------
   * st: { design, fit, type, w, h, scene, photo, person, dims, zoom, aspect, brightness, info, footer }
   * opt: { scale (ตัวคูณความละเอียดตอนส่งออก), preview (วาดจุดลากมุม) } */
  function render(canvas, st, opt) {
    opt = opt || {};
    var scale = opt.scale || 1;
    var g = C.geometry(st.type, st.w, st.h);
    var photo = st.scene === 'photo' && st.photo && st.photo.img ? st.photo : null;
    var size = C.canvasSize(st.aspect, g, photo);
    var W = size.W;
    var H = size.H;
    var U = C.unitScale(W, H);
    var F = st.info ? Math.round(132 * U) : 0;
    var cw = Math.round(W * scale);
    var ch = Math.round((H + F) * scale);
    if (canvas.width !== cw) canvas.width = cw;
    if (canvas.height !== ch) canvas.height = ch;
    var x = ctx2d(canvas);
    x.setTransform(scale, 0, 0, scale, 0, 0);
    x.clearRect(0, 0, W, H + F);
    var out = { W: W, H: H, F: F, U: U, scale: scale, g: g, quad: null };
    x.save();
    x.beginPath();
    x.rect(0, 0, W, H);
    x.clip();
    if (photo) drawPhoto(x, st, g, W, H, U, scale, opt, out);
    else drawScene(x, st, g, W, H, U, scale, out);
    x.restore();
    if (F) footer(x, W, H, F, U, st.footer || {});
    return out;
  }

  function drawScene(x, st, g, W, H, U, scale, out) {
    var scene = SCENE_DRAW[st.scene] ? st.scene : 'studio';
    var cam = C.camera({ scene: scene, g: g, W: W, H: H, person: st.person, zoom: st.zoom });
    out.cam = cam;
    SCENE_DRAW[scene](x, cam, g);
    var s = cam.s;
    var oc = objectCanvas(g, s * scale, st.design, st.fit);
    var ox = cam.left;
    var oy = cam.floorY - cam.top * s;
    if (g.mount === 'floor') {
      x.save();
      var sh = x.createRadialGradient(0, 0, 0, 0, 0, 1);
      sh.addColorStop(0, 'rgba(0,0,0,0.38)');
      sh.addColorStop(1, 'rgba(0,0,0,0)');
      x.translate(ox + (g.bw * s) / 2, cam.floorY);
      x.scale((g.bw * s) / 2 + 10 * s, Math.max(4, 6 * s));
      x.fillStyle = sh;
      circle(x, 0, 0, 1);
      x.fill();
      x.restore();
    }
    x.save();
    if (g.mount === 'floor') {
      x.shadowColor = 'rgba(0,0,0,0.16)';
      x.shadowBlur = 28 * U * scale;
      x.shadowOffsetX = 12 * U * scale;
      x.shadowOffsetY = -2 * U * scale;
    } else {
      x.shadowColor = 'rgba(0,0,0,0.32)';
      x.shadowBlur = clamp(3 + g.gap * s * 1.8, 3, 42) * scale;
      x.shadowOffsetX = clamp(1 + g.gap * s * 0.35, 1, 14) * scale;
      x.shadowOffsetY = clamp(2 + g.gap * s * 0.8, 2, 30) * scale;
    }
    x.drawImage(oc, ox - PAD / scale, oy - PAD / scale, oc.width / scale, oc.height / scale);
    x.restore();
    if (scene === 'fence' && g.type === 'vinyl') ties(x, g, s, ox, oy);
    if (cam.person) person(x, cam, U);
    var fr = { x: ox + g.fx * s, y: oy + g.fy * s, w: g.w * s, h: g.h * s, ex: g.ex * s };
    out.face = fr;
    if (st.dims) dimsRect(x, fr, g, W, U);
  }

  // เคเบิลไทร์ร้อยตาไก่กับรั้ว
  function ties(x, g, s, ox, oy) {
    var pts = C.eyelets(g.w, g.h);
    var dir = { top: [0, -1], bottom: [0, 1], left: [-1, 0], right: [1, 0] };
    x.save();
    x.strokeStyle = '#1d1f22';
    x.lineCap = 'round';
    x.lineWidth = Math.max(1.5, 0.8 * s);
    x.beginPath();
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i];
      var d = dir[p.side];
      var cx = ox + (g.fx + p.x) * s;
      var cy = oy + (g.fy + p.y) * s;
      x.moveTo(cx - d[0] * 0.5 * s, cy - d[1] * 0.5 * s);
      x.lineTo(cx + d[0] * 4 * s, cy + d[1] * 4 * s);
    }
    x.stroke();
    x.restore();
  }

  function adjustBrightness(c, b) {
    if (!(b > 0) || Math.abs(b - 1) < 0.005) return;
    var x = c.getContext('2d');
    x.save();
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalCompositeOperation = 'source-atop';
    x.fillStyle = b < 1 ? 'rgba(0,0,0,' + (1 - b) + ')' : 'rgba(255,255,255,' + Math.min(0.6, b - 1) + ')';
    x.fillRect(0, 0, c.width, c.height);
    x.restore();
  }

  function drawPhoto(x, st, g, W, H, U, scale, opt, out) {
    var ph = st.photo;
    x.drawImage(ph.img, 0, 0, W, H);
    var q = ph.quad.map(function (p) {
      return { x: p.x * W, y: p.y * H };
    });
    out.quad = q;
    if (!C.isConvex(q)) {
      if (opt.preview) handles(x, q, U);
      return;
    }
    var maxSide = (opt.preview ? 1100 : 2000) * Math.min(scale, 1.5);
    var k = maxSide / Math.max(g.bw, g.bh);
    var oc = objectCanvas(g, k, st.design, st.fit);
    adjustBrightness(oc, st.brightness);
    var layer = mk(W * scale, H * scale);
    var lx = ctx2d(layer);
    lx.setTransform(scale, 0, 0, scale, 0, 0);
    warp(lx, oc, { x: PAD, y: PAD, w: g.bw * k, h: g.bh * k }, q, opt.preview ? 10 : 22);
    x.save();
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.shadowColor = 'rgba(0,0,0,0.35)';
    x.shadowBlur = 14 * U * scale;
    x.shadowOffsetX = 3 * U * scale;
    x.shadowOffsetY = 6 * U * scale;
    x.drawImage(layer, 0, 0);
    x.restore();
    if (st.dims) dimsQuad(x, faceQuad(q, g), g, U);
    if (opt.preview) handles(x, q, U);
  }

  /* ---------- งานพิมพ์ข้อความเร็ว (ยังไม่มีไฟล์งาน) ---------- */
  var THEMES = {
    brand: { name: 'กรมส้ม', bg: '#1f2a4d', bg2: '#2d3d6b', title: '#ffffff', sub: '#f4a46e', pillBg: '#d9622b', pillFg: '#ffffff' },
    promo: { name: 'แดงเหลือง', bg: '#d3222a', bg2: '#a8161d', title: '#ffd43b', sub: '#ffffff', pillBg: '#ffd43b', pillFg: '#a8161d' },
    clean: { name: 'ขาวดำ', bg: '#ffffff', bg2: '#ece9e2', title: '#15181f', sub: '#555c6b', pillBg: '#15181f', pillFg: '#ffffff' },
    fresh: { name: 'เขียว', bg: '#167244', bg2: '#0d5532', title: '#ffffff', sub: '#d9f2a6', pillBg: '#ffffff', pillFg: '#167244' },
  };

  function textDesign(t, wcm, hcm) {
    var long = 1500;
    var W = wcm >= hcm ? long : Math.round((long * wcm) / hcm);
    var H = wcm >= hcm ? Math.round((long * hcm) / wcm) : long;
    var c = mk(W, H);
    var x = ctx2d(c);
    var th = THEMES[t.theme] || THEMES.brand;
    var bg = x.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, th.bg);
    bg.addColorStop(1, th.bg2);
    x.fillStyle = bg;
    x.fillRect(0, 0, W, H);
    x.fillStyle = 'rgba(255,255,255,0.06)';
    circle(x, W * 0.95, H * 0.02, Math.min(W, H) * 0.55);
    x.fill();
    x.fillStyle = th.pillBg;
    x.globalAlpha = 0.9;
    x.fillRect(0, H - Math.min(W, H) * 0.035, W, Math.min(W, H) * 0.035);
    x.globalAlpha = 1;
    var m = Math.min(W, H) * 0.08;
    var aw = W - 2 * m;
    var ah = H - 2 * m;
    var lines = String(t.title || '')
      .split(/\n/)
      .map(function (s) {
        return s.trim();
      })
      .filter(Boolean)
      .slice(0, 3);
    var sub = String(t.sub || '').trim();
    var phone = C.phoneText(t.phone);
    function fit(text, weight, maxW) {
      x.font = weight + ' 100px ' + DISPLAY;
      var w = x.measureText(text).width || 1;
      return (100 * maxW) / w;
    }
    var n = lines.length;
    var ts = 0;
    if (n) {
      ts = (ah * (sub || phone ? 0.56 : 0.86)) / (n * 1.25);
      for (var i = 0; i < n; i++) ts = Math.min(ts, fit(lines[i], 700, aw));
    }
    var ss = sub ? Math.min(ah * 0.14, fit(sub, 500, aw), ts ? ts * 0.5 : 1e9) : 0;
    var ps = phone ? Math.min(ah * 0.1, fit(phone, 600, aw * 0.78), ts ? ts * 0.4 : 1e9) : 0;
    var gap = Math.max(ts, ss * 2, ps * 2.5) * 0.22;
    var total = n * ts * 1.25 + (ss ? gap + ss * 1.4 : 0) + (ps ? gap + ps * 2.1 : 0);
    var y = (H - total) / 2;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    for (var j = 0; j < n; j++) {
      x.font = '700 ' + ts + 'px ' + DISPLAY;
      x.fillStyle = th.title;
      x.fillText(lines[j], W / 2, y + ts * 0.66);
      y += ts * 1.25;
    }
    if (ss) {
      y += gap;
      x.font = '500 ' + ss + 'px ' + DISPLAY;
      x.fillStyle = th.sub;
      x.fillText(sub, W / 2, y + ss * 0.72);
      y += ss * 1.4;
    }
    if (ps) {
      y += gap;
      x.font = '600 ' + ps + 'px ' + DISPLAY;
      var pw = x.measureText(phone).width + ps * 1.6;
      var phh = ps * 2.1;
      x.beginPath();
      rr(x, W / 2 - pw / 2, y, pw, phh, phh / 2);
      x.fillStyle = th.pillBg;
      x.fill();
      x.fillStyle = th.pillFg;
      x.fillText(phone, W / 2, y + phh * 0.53);
    }
    return { src: c, w: W, h: H, bg: hexRgb(th.bg2) };
  }

  function hexRgb(h) {
    var v = parseInt(h.slice(1), 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }

  // สีเฉลี่ยรอบขอบงาน — ใช้เป็นสีขอบโครงที่ห่อไวนิล และสีพื้นตอน "ย่อทั้งรูป"
  function borderColor(src, w, h) {
    try {
      var c = mk(16, 16);
      var x = c.getContext('2d');
      x.fillStyle = '#ffffff';
      x.fillRect(0, 0, 16, 16);
      x.drawImage(src, 0, 0, w, h, 0, 0, 16, 16);
      var d = x.getImageData(0, 0, 16, 16).data;
      var r = 0;
      var gg = 0;
      var b = 0;
      var n = 0;
      for (var yy = 0; yy < 16; yy++) {
        for (var xx = 0; xx < 16; xx++) {
          if (xx > 0 && xx < 15 && yy > 0 && yy < 15) continue;
          var i = (yy * 16 + xx) * 4;
          r += d[i];
          gg += d[i + 1];
          b += d[i + 2];
          n++;
        }
      }
      return [r / n, gg / n, b / n];
    } catch (e) {
      return [255, 255, 255];
    }
  }

  // รูปจากไฟล์ → ย่อเหลือด้านยาวไม่เกิน maxSide (ไฟล์งานพิมพ์ใหญ่มาก วาดซ้ำ ๆ จะหน่วง)
  function prepareImage(img, maxSide) {
    var w = img.naturalWidth || img.width;
    var h = img.naturalHeight || img.height;
    var src = img;
    var f = Math.min(1, maxSide / Math.max(w, h));
    if (f < 1) {
      var c = mk(w * f, h * f);
      var x = ctx2d(c);
      x.drawImage(img, 0, 0, c.width, c.height);
      src = c;
      w = c.width;
      h = c.height;
    }
    return { src: src, w: w, h: h, bg: borderColor(src, w, h) };
  }

  /* ---------- ตัวช่วยของเวที 3 มิติ ---------- */
  // หน้าป้าย: วาดงานลงผืนตามสัดส่วนป้ายจริง (เต็มป้าย / เห็นทั้งรูป) ใช้เป็นเท็กซ์เจอร์
  function faceCanvas(d, wcm, hcm, fit, maxSide) {
    var long = maxSide || 2048;
    var W = wcm >= hcm ? long : Math.max(1, Math.round((long * wcm) / hcm));
    var H = wcm >= hcm ? Math.max(1, Math.round((long * hcm) / wcm)) : long;
    var c = mk(W, H);
    paintDesign(ctx2d(c), d, 0, 0, W, H, fit);
    return c;
  }

  // เส้นบอกขนาดและป้าย "คนสูง 170 ซม." จากจุดที่ฉาย (−1..1) ลงภาพขนาด W×H
  function overlay3d(x, pr, g, W, H, U, opt) {
    if (!pr) return;
    var px = function (p) {
      return { x: ((p.x + 1) / 2) * W, y: ((1 - p.y) / 2) * H };
    };
    if (opt.dims && pr.visible) dimsQuad(x, pr.face.map(px), g, U);
    if (opt.person && pr.head) {
      var h = px(pr.head);
      var label = 'คนสูง 170 ซม.';
      x.save();
      x.font = '500 ' + Math.round(17 * U) + 'px ' + BODY;
      var lw = x.measureText(label).width + 18 * U;
      var lh = 26 * U;
      x.beginPath();
      rr(x, h.x - lw / 2, h.y - lh - 6 * U, lw, lh, lh / 2);
      x.fillStyle = 'rgba(255,255,255,0.9)';
      x.fill();
      x.fillStyle = '#2e3954';
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.fillText(label, h.x, h.y - lh / 2 - 6 * U + U);
      x.restore();
    }
  }

  NS.render = {
    render: render,
    faceCanvas: faceCanvas,
    overlay3d: overlay3d,
    footer: footer,
    textDesign: textDesign,
    prepareImage: prepareImage,
    THEMES: THEMES,
    fonts: { display: DISPLAY, body: BODY },
  };
})(typeof self !== 'undefined' ? self : this);
