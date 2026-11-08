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

  /* ---------- ฉากในอาคาร (2 มิติ สำรอง) ---------- */
  // กึ่งกลางประตู/กระดาน (ซม. จากขอบซ้ายชิ้นงาน) ตามตำแหน่งติดป้าย — ตรงกับฉาก 3 มิติ
  function featureCx(scene, g, spot) {
    var half = scene === 'classroom' ? C.BOARD.w / 2 : C.doorSize(scene, spot, g).w / 2 + 7;
    if (g.mount === 'floor') return -(half + (scene === 'classroom' ? 50 : 45));
    var sp = C.resolveSpot(scene, spot, g);
    if (sp === 'beside') return -(half + (scene === 'classroom' ? 35 : 20));
    return g.bw / 2;
  }
  function twoTone(x, cam, lower, upper) {
    var W = cam.W;
    var fy = Math.min(cam.floorY, cam.H);
    var sy = Math.max(0, Math.min(fy, Y(cam, 100)));
    x.fillStyle = upper;
    x.fillRect(0, 0, W, sy);
    x.fillStyle = lower;
    x.fillRect(0, sy, W, fy - sy);
    x.fillStyle = '#5f7f68';
    x.fillRect(0, Y(cam, 100) - Math.max(1, 1.7 * cam.s), W, Math.max(2, 3.5 * cam.s));
    grain(x, 0, 0, W, fy, 0.08, 1.5);
  }
  function door2d(x, cam, cx, style, size) {
    var s = cam.s;
    var D = size || C.DOOR;
    var L = X(cam, cx - D.w / 2);
    var T = Y(cam, D.h);
    var w = D.w * s;
    var h = D.h * s;
    var fw = 7 * s;
    x.fillStyle = style === 'panel' ? '#5c3920' : '#efece6';
    x.fillRect(L - fw, T - fw, w + fw * 2, h + fw);
    var gr = x.createLinearGradient(L, 0, L + w, 0);
    gr.addColorStop(0, style === 'panel' ? '#7b4d2c' : '#c4a077');
    gr.addColorStop(1, style === 'panel' ? '#8f5d37' : '#d6b68c');
    x.fillStyle = gr;
    x.fillRect(L, T, w, h);
    if (style === 'panel') {
      x.strokeStyle = 'rgba(40,20,8,0.55)';
      x.lineWidth = Math.max(1, 0.6 * s);
      x.strokeRect(L + w * 0.16, T + h * 0.07, w * 0.68, h * 0.37);
      x.strokeRect(L + w * 0.16, T + h * 0.53, w * 0.68, h * 0.39);
    }
    x.fillStyle = '#d6d9dd';
    x.fillRect(L + w - 15 * s, Y(cam, 101), 12 * s, Math.max(2, 2.2 * s));
    circle(x, L + w - 8 * s, Y(cam, 100), Math.max(2, 2.8 * s));
    x.fill();
  }
  function louver2d(x, cam, cx, cy, w, h) {
    var s = cam.s;
    var L = X(cam, cx - w / 2);
    var T = Y(cam, cy + h / 2);
    x.fillStyle = '#e3eef2';
    x.fillRect(L, T, w * s, h * s);
    x.fillStyle = 'rgba(80,110,125,0.25)';
    for (var yy = 0; yy < h; yy += 9.5) x.fillRect(L, T + yy * s, w * s, Math.max(1, 1.2 * s));
    x.strokeStyle = '#4a4f57';
    x.lineWidth = Math.max(1.5, 3 * s);
    x.strokeRect(L, T, w * s, h * s);
    x.beginPath();
    x.moveTo(L + (w * s) / 2, T);
    x.lineTo(L + (w * s) / 2, T + h * s);
    x.stroke();
  }
  function tone(st) {
    return C.WALL_TONES[st && st.tone] || C.WALL_TONES.pink;
  }
  function sceneClassDoor(x, cam, g, spot, st) {
    twoTone(x, cam, tone(st).lower, tone(st).upper);
    var cx = featureCx('classDoor', g, spot);
    var D = C.doorSize('classDoor', spot, g);
    [-390, -230, 230, 390].forEach(function (o) {
      if (Math.abs(o) > D.w / 2 + 70) louver2d(x, cam, cx + o, 162, 120, 110);
    });
    door2d(x, cam, cx, 'panel', D);
    topLight(x, cam.W, cam.H, X(cam, cx), 0.3);
    if (cam.floorY < cam.H) floor(x, cam, '#8f4430', '#6f3424', 30, 0.18);
    vignette(x, cam.W, cam.H, 0.22);
  }
  function sceneOfficeDoor(x, cam, g, spot) {
    var fy = Math.min(cam.floorY, cam.H);
    x.fillStyle = '#e6e4df';
    x.fillRect(0, 0, cam.W, fy);
    grain(x, 0, 0, cam.W, fy, 0.08, 1.5);
    var cx = featureCx('officeDoor', g, spot);
    door2d(x, cam, cx, 'flush', C.doorSize('officeDoor', spot, g));
    topLight(x, cam.W, cam.H, X(cam, cx), 0.35);
    if (cam.floorY < cam.H) {
      x.fillStyle = '#f2f0ec';
      x.fillRect(0, Y(cam, 8), cam.W, 8 * cam.s);
      floor(x, cam, '#b48c63', '#93704c', 20, 0.12);
    }
    vignette(x, cam.W, cam.H, 0.22);
  }
  function sceneClassroom(x, cam, g, spot, st) {
    twoTone(x, cam, tone(st).lower, tone(st).upper);
    var cx = featureCx('classroom', g, spot);
    var s = cam.s;
    var B = C.BOARD;
    var L = X(cam, cx - B.w / 2);
    var T = Y(cam, B.y0 + B.h);
    x.fillStyle = '#c9cdd3';
    x.fillRect(L - 2.5 * s, T - 2.5 * s, (B.w + 5) * s, (B.h + 5) * s);
    x.fillStyle = '#f8f9f9';
    x.fillRect(L, T, B.w * s, B.h * s);
    x.fillStyle = '#c9cdd3';
    x.fillRect(L + B.w * 0.1 * s, Y(cam, B.y0) + s, B.w * 0.8 * s, Math.max(2, 3 * s));
    topLight(x, cam.W, cam.H, X(cam, cx), 0.3);
    if (cam.floorY < cam.H) floor(x, cam, '#8f4430', '#6f3424', 30, 0.18);
    vignette(x, cam.W, cam.H, 0.22);
  }

  /* ---------- ฉาก "มือถือบัตร": มือ (ภาพวาด) จับมุมซ้ายล่างของบัตร ----------
   * หน่วย ซม. จุดเริ่มที่มุมซ้ายล่างของบัตร แกน y ขึ้นบน · k = พิกเซลต่อ ซม. · cw/ch = ขนาดบัตร (ตัดเงานิ้วไม่ให้เลยบัตร)
   * คืน { back, front, x0, y1, wcm, hcm }: back = แขนเสื้อร้าน/ฝ่ามือ/นิ้วชี้ (อยู่หลังบัตร) · front = นิ้วโป้ง (ทับหน้าบัตร)
   * วาดแบบภาพเหมือน: ไม่มีเส้นขอบ ไล่แสงจากซ้ายบน เงาในขอบ ผิวละเอียด เล็บมีปลายขาว/จันทร์เสี้ยว เงานิ้วบนบัตร เงาบัตรบนฝ่ามือ */
  var handCache = { key: '', art: null };
  function handArt(k, cw, ch) {
    var hk = [Math.round(k * 10), cw, ch].join('|');
    if (handCache.key === hk) return handCache.art;
    handCache = { key: hk, art: drawHand(k, cw, ch) };
    return handCache.art;
  }
  function drawHand(k, cw, ch) {
    var X0 = -7.5, X1 = 6.5, Y1 = 5.5, Y0 = -14;
    var W = Math.ceil((X1 - X0) * k), H = Math.ceil((Y1 - Y0) * k);
    var P = function (x, y) { return [(x - X0) * k, (Y1 - y) * k]; };
    var mkc = function () { return mk(W, H); };
    // เส้นโค้งปิดผ่านจุด (Catmull-Rom → Bezier)
    function smooth(x, pts) {
      var n = pts.length;
      var q = pts.map(function (p) { return P(p[0], p[1]); });
      x.beginPath();
      x.moveTo(q[0][0], q[0][1]);
      for (var i = 0; i < n; i++) {
        var p0 = q[(i - 1 + n) % n], p1 = q[i], p2 = q[(i + 1) % n], p3 = q[(i + 2) % n];
        x.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
      }
      x.closePath();
    }
    // ผิว: ไล่แสงจากซ้ายบน + เงาในขอบ + แสงสะท้อน + ผิวละเอียด
    var SK = { hi: '#f4cfb3', mid: '#e3ac87', lo: '#c0815e', deep: '#9c5f43', blush: 'rgba(214,96,74,0.18)' };
    function skin(x, pts, a, b, opt) {
      opt = opt || {};
      x.save();
      smooth(x, pts);
      x.clip();
      var A = P(a[0], a[1]), B = P(b[0], b[1]);
      var g = x.createLinearGradient(A[0], A[1], B[0], B[1]);
      g.addColorStop(0, SK.hi); g.addColorStop(0.45, SK.mid); g.addColorStop(1, SK.lo);
      x.fillStyle = g; x.fillRect(0, 0, W, H);
      // เงาในขอบ (ด้านขวาล่าง) — วาดกรอบใหญ่เจาะรูเป็นรูปทรง แล้วให้เงาตกเข้าข้างใน
      x.shadowColor = 'rgba(110,52,30,0.55)';
      x.shadowBlur = (opt.edge || 0.5) * k;
      x.shadowOffsetX = -0.18 * k; x.shadowOffsetY = -0.22 * k;
      x.beginPath(); x.rect(-W, -H, W * 3, H * 3);
      smoothSub(x, pts);
      x.fillStyle = '#000'; x.fill('evenodd');
      x.shadowColor = 'rgba(255,236,220,0.55)';
      x.shadowOffsetX = 0.12 * k; x.shadowOffsetY = 0.14 * k; x.shadowBlur = 0.35 * k;
      x.beginPath(); x.rect(-W, -H, W * 3, H * 3); smoothSub(x, pts); x.fill('evenodd');
      x.shadowColor = 'transparent';
      // ผิวละเอียด
      if (noisePat) { x.globalAlpha = 0.5; x.fillStyle = x.createPattern(noisePat, 'repeat'); x.fillRect(0, 0, W, H); x.globalAlpha = 1; }
      x.restore();
    }
    function smoothSub(x, pts) {
      var n = pts.length;
      var q = pts.map(function (p) { return P(p[0], p[1]); });
      x.moveTo(q[0][0], q[0][1]);
      for (var i = 0; i < n; i++) {
        var p0 = q[(i - 1 + n) % n], p1 = q[i], p2 = q[(i + 1) % n], p3 = q[(i + 2) % n];
        x.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
      }
      x.closePath();
    }
    function blob(x, cx, cy, rx, ry, color, rot) {
      var c = P(cx, cy);
      x.save(); x.translate(c[0], c[1]); x.rotate(rot || 0); x.scale(1, ry / rx);
      var g = x.createRadialGradient(0, 0, 0, 0, 0, rx * k);
      g.addColorStop(0, color); g.addColorStop(1, color.replace(/[\d.]+\)$/, '0)'));
      x.fillStyle = g; x.beginPath(); x.arc(0, 0, rx * k, 0, Math.PI * 2); x.fill(); x.restore();
    }
    function crease(x, pts, alpha, wid) {
      x.save();
      x.strokeStyle = 'rgba(120,58,36,' + alpha + ')';
      x.lineWidth = Math.max(1, (wid || 0.045) * k);
      x.lineCap = 'round';
      x.filter = 'blur(' + Math.max(0.5, 0.02 * k) + 'px)';
      x.beginPath();
      var a = P(pts[0][0], pts[0][1]); x.moveTo(a[0], a[1]);
      for (var i = 1; i < pts.length; i += 2) { var c = P(pts[i][0], pts[i][1]), e = P(pts[i + 1][0], pts[i + 1][1]); x.quadraticCurveTo(c[0], c[1], e[0], e[1]); }
      x.stroke(); x.restore();
    }
    var noisePat = (function () {
      var c = document.createElement('canvas'); c.width = c.height = 64;
      var x = c.getContext('2d'), d = x.createImageData(64, 64), s = 9;
      for (var i = 0; i < d.data.length; i += 4) { s = (s * 16807) % 2147483647; var v = s % 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v > 127 ? 255 : 90; d.data[i + 3] = 10; }
      x.putImageData(d, 0, 0); return c;
    })();

    // ===== หลังบัตร =====
    var back = mkc(), b = back.getContext('2d');
    // แขนเสื้อ
    var sleeve = [[-6.6, -14.5], [-5.3, -9.6], [-3.1, -9.0], [0.2, -9.3], [2.9, -10.1], [3.6, -14.5]];
    b.save(); smooth(b, sleeve); b.clip();
    var sg = b.createLinearGradient(P(-6, 0)[0], 0, P(3.6, 0)[0], 0);
    sg.addColorStop(0, '#34437a'); sg.addColorStop(0.35, '#26325c'); sg.addColorStop(1, '#141b33');
    b.fillStyle = sg; b.fillRect(0, 0, W, H);
    // รอยยับผ้า
    [[-3.4, -12.5, 0.5, 2.2, 'rgba(0,0,0,0.25)'], [-1.0, -11.8, 0.4, 1.8, 'rgba(255,255,255,0.08)'], [1.6, -12.8, 0.6, 2.4, 'rgba(0,0,0,0.22)']].forEach(function (f) { blob(b, f[0], f[1], f[2], f[3], f[4], 0.25); });
    // ขอบแขนเสื้อ (ปลายแขนพับ)
    b.fillStyle = 'rgba(0,0,0,0.25)';
    var c1 = P(-6, -10.0), c2 = P(3.4, -10.9); b.fillRect(0, c1[1], W, 0.18 * k);
    b.restore();
    // ข้อมือ + ฝ่ามือ
    var palm = [[-4.6, -9.4], [-4.3, -6.6], [-3.9, -3.6], [-3.3, -1.0], [-2.6, 1.5], [1.5, 2.6], [4.1, 1.4], [4.0, -1.6], [3.3, -4.8], [2.4, -7.6], [2.2, -9.6], [-1.2, -9.8]];
    skin(b, palm, [-4, -2], [3.5, -6], { edge: 0.9 });
    b.save(); smooth(b, palm); b.clip();
    blob(b, -2.4, -3.8, 1.6, 2.6, 'rgba(255,225,205,0.35)', -0.3); // เนินโคนนิ้วโป้ง (แสง)
    blob(b, 2.6, -2.2, 1.2, 2.4, 'rgba(150,70,45,0.25)', 0.2); // ข้างฝ่ามือ (เงา)
    blob(b, -0.2, -8.6, 2.6, 0.8, 'rgba(150,70,45,0.28)', 0); // เงาข้อมือใต้แขนเสื้อ
    // เงาของบัตรตกบนฝ่ามือ ใต้ขอบบัตร
    b.save(); b.filter = 'blur(' + Math.max(1, 0.35 * k) + 'px)';
    var s0 = P(0, -0.05), s1 = P(Math.min(cw, 7), -0.75);
    b.fillStyle = 'rgba(70,30,15,0.45)'; b.fillRect(s0[0], s0[1], s1[0] - s0[0], s1[1] - s0[1]); b.restore();
    b.restore();
    // นิ้วชี้ งอรอบขอบบัตร (เห็นด้านข้าง)
    var index = [[-2.9, -1.2], [-3.05, 0.6], [-2.85, 2.4], [-2.3, 3.75], [-1.3, 4.35], [-0.2, 4.2], [0.3, 3.0], [0.3, -0.6]];
    skin(b, index, [-3, 3], [0.3, -0.5], { edge: 0.6 });
    b.save(); smooth(b, index); b.clip();
    blob(b, -2.2, 3.6, 0.8, 0.6, 'rgba(255,232,215,0.45)', 0);
    blob(b, -2.6, 1.0, 0.5, 1.2, 'rgba(214,96,74,0.18)', 0);
    b.restore();
    crease(b, [[-2.95, 2.25], [-2.4, 2.05], [-1.7, 2.35]], 0.38);
    crease(b, [[-2.95, 2.55], [-2.4, 2.4], [-1.8, 2.6]], 0.2, 0.03);
    crease(b, [[-3.0, 0.2], [-2.3, -0.05], [-1.5, 0.25]], 0.3);
    // ===== หน้าบัตร: นิ้วโป้ง =====
    var front = mkc(), f = front.getContext('2d');
    // แกนนิ้วโป้ง: โคน → ข้อ → ปลาย (งอเล็กน้อยที่ข้อ)
    var thumb = [[-2.6, -5.2], [-3.1, -3.2], [-2.55, -1.1], [-1.45, 0.75], [-0.1, 2.2], [1.2, 3.35], [2.3, 3.95], [3.35, 3.88], [3.85, 3.15], [3.55, 2.2], [2.6, 1.25], [1.85, 0.2], [1.5, -0.9], [1.3, -2.6], [0.8, -4.6], [-0.6, -5.6]];
    // เงานิ้วบนบัตร
    f.save();
    var q0 = P(0, ch), q1 = P(cw, 0);
    f.beginPath(); f.rect(q0[0], q0[1], q1[0] - q0[0], q1[1] - q0[1]); f.clip();
    f.filter = 'blur(' + Math.max(1, 0.25 * k) + 'px)';
    f.translate(0.16 * k, 0.24 * k);
    smooth(f, thumb); f.fillStyle = 'rgba(30,15,8,0.42)'; f.fill();
    f.filter = 'blur(' + Math.max(1, 0.8 * k) + 'px)';
    f.translate(0.25 * k, 0.35 * k);
    smooth(f, thumb); f.fillStyle = 'rgba(30,15,8,0.18)'; f.fill();
    f.restore();
    skin(f, thumb, [-1.5, 2.2], [2.0, -0.6], { edge: 0.7 });
    f.save(); smooth(f, thumb); f.clip();
    blob(f, -0.3, 1.0, 0.9, 2.2, 'rgba(255,236,222,0.42)', -0.65); // แสงสันนิ้ว
    blob(f, 2.6, 2.6, 1.2, 1.0, 'rgba(255,230,214,0.35)', -0.6); // ปลายนิ้ว
    blob(f, 1.5, 0.6, 0.7, 1.4, 'rgba(214,96,74,0.2)', -0.6); // ข้อนิ้วอมแดง
    blob(f, -1.4, -3.4, 1.4, 2.0, 'rgba(255,225,205,0.25)', -0.3);
    f.restore();
    // ข้อนิ้วโป้ง (รอยย่น)
    crease(f, [[0.15, 1.05], [0.75, 0.75], [1.2, 0.35]], 0.42, 0.05);
    crease(f, [[0.0, 1.35], [0.55, 1.15], [1.0, 0.85]], 0.22, 0.03);
    crease(f, [[-0.9, -4.6], [0.55, -3.6], [1.2, -1.7]], 0.22, 0.05); // ร่องเนินโคนนิ้ว
    // เล็บ
    f.save();
    var nc = P(2.95, 3.22); f.translate(nc[0], nc[1]); f.rotate(-0.6);
    var nl = 1.6 * k, nw = 1.3 * k;
    f.beginPath();
    f.moveTo(-nl * 0.5, -nw * 0.42);
    f.quadraticCurveTo(-nl * 0.62, 0, -nl * 0.5, nw * 0.42);
    f.lineTo(nl * 0.3, nw * 0.5);
    f.quadraticCurveTo(nl * 0.58, nw * 0.42, nl * 0.56, 0);
    f.quadraticCurveTo(nl * 0.58, -nw * 0.42, nl * 0.3, -nw * 0.5);
    f.closePath();
    var ng = f.createLinearGradient(0, -nw / 2, 0, nw / 2);
    ng.addColorStop(0, '#f6d3c6'); ng.addColorStop(0.5, '#eebfae'); ng.addColorStop(1, '#d99a87');
    f.fillStyle = ng; f.fill();
    f.save(); f.clip();
    f.fillStyle = 'rgba(255,248,242,0.75)'; f.fillRect(nl * 0.36, -nw, nl, nw * 2); // ปลายเล็บขาว
    var lg = f.createRadialGradient(-nl * 0.5, 0, 0, -nl * 0.5, 0, nw * 0.45);
    lg.addColorStop(0, 'rgba(255,245,240,0.8)'); lg.addColorStop(1, 'rgba(255,245,240,0)');
    f.fillStyle = lg; f.fillRect(-nl, -nw, nl, nw * 2); // จันทร์เสี้ยว
    f.restore();
    f.strokeStyle = 'rgba(150,80,60,0.45)'; f.lineWidth = Math.max(1, 0.035 * k); f.stroke();
    f.restore();
    // โคนนิ้วโป้งจางเข้าฝ่ามือ (ไม่เห็นรอยต่อ)
    f.save();
    f.globalCompositeOperation = 'destination-out';
    var fg = f.createLinearGradient(0, P(0, -3.0)[1], 0, P(0, -5.4)[1]);
    fg.addColorStop(0, 'rgba(0,0,0,0)'); fg.addColorStop(1, 'rgba(0,0,0,1)');
    f.fillStyle = fg; f.fillRect(0, P(0, -3.0)[1], W, H);
    f.restore();
    // แขนเสื้อจางที่ขอบล่าง
    b.save(); b.globalCompositeOperation = 'destination-out';
    var bf = b.createLinearGradient(0, P(0, -12.2)[1], 0, H);
    bf.addColorStop(0, 'rgba(0,0,0,0)'); bf.addColorStop(1, 'rgba(0,0,0,1)');
    b.fillStyle = bf; b.fillRect(0, P(0, -12.2)[1], W, H); b.restore();
    return { back: back, front: front, x0: X0, y1: Y1, wcm: X1 - X0, hcm: Y1 - Y0 };
  }

  /* ---------- ฉากบัตร (2 มิติ สำรอง) ---------- */
  // ใยกระดาษ (สุ่มแบบคงที่ ภาพไม่กระพริบ)
  var paperTexCache = {};
  function paperTex(color) {
    if (paperTexCache[color]) return paperTexCache[color];
    var c = mk(256, 256);
    var x = ctx2d(c);
    x.fillStyle = color;
    x.fillRect(0, 0, 256, 256);
    var r = rng(7);
    for (var i = 0; i < 900; i++) {
      var px = r() * 256;
      var py = r() * 256;
      var a = r() * Math.PI;
      var l = 2 + r() * 9;
      x.strokeStyle = r() < 0.5 ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.05)';
      x.lineWidth = 0.6 + r() * 0.6;
      x.beginPath();
      x.moveTo(px, py);
      x.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l);
      x.stroke();
    }
    paperTexCache[color] = c;
    return c;
  }
  function scenePaper(x, cam, g, spot, st) {
    var p = C.PAPERS[(st && st.paper) || 'white'] || C.PAPERS.white;
    x.fillStyle = x.createPattern(paperTex(p.color), 'repeat');
    x.fillRect(0, 0, cam.W, cam.H);
    var v = x.createRadialGradient(cam.W * 0.45, cam.H * 0.35, 0, cam.W * 0.5, cam.H * 0.5, Math.hypot(cam.W, cam.H) * 0.62);
    v.addColorStop(0, 'rgba(255,255,255,0.10)');
    v.addColorStop(1, 'rgba(0,0,0,0.16)');
    x.fillStyle = v;
    x.fillRect(0, 0, cam.W, cam.H);
  }
  function handAt(cam, g) {
    var s = cam.s;
    var art = handArt(Math.max(4, s), g.w, g.h);
    var ox = cam.left + g.fx * s;
    var oy = cam.floorY - cam.top * s + (g.fy + g.h) * s; // มุมซ้ายล่างของบัตรบนจอ
    return { art: art, x: ox + art.x0 * s, y: oy - art.y1 * s, w: art.wcm * s, h: art.hcm * s };
  }
  function sceneHand(x, cam, g) {
    sceneStudio(x, cam);
    var h = handAt(cam, g);
    x.drawImage(h.art.back, h.x, h.y, h.w, h.h);
  }
  function sceneHandAfter(x, cam, g) {
    var h = handAt(cam, g);
    x.drawImage(h.art.front, h.x, h.y, h.w, h.h);
  }

  // ฉากโต๊ะ/เคาน์เตอร์ และห้องจัดงาน (2 มิติ สำรอง)
  function sceneTable(x, cam) {
    var W = cam.W;
    var H = cam.H;
    var ty = Math.max(0, Math.min(H, Y(cam, C.TABLE_H)));
    var bg = x.createLinearGradient(0, 0, 0, ty);
    bg.addColorStop(0, '#ece4d8');
    bg.addColorStop(1, '#cbbba6');
    x.fillStyle = bg;
    x.fillRect(0, 0, W, ty);
    var t = x.createLinearGradient(0, ty, 0, H);
    t.addColorStop(0, '#a77650');
    t.addColorStop(1, '#7a5233');
    x.fillStyle = t;
    x.fillRect(0, ty, W, H - ty);
    x.fillStyle = 'rgba(255,230,200,0.25)';
    x.fillRect(0, ty, W, Math.max(1, 2 * cam.s));
  }
  function sceneEvent(x, cam) {
    var W = cam.W;
    var H = cam.H;
    var fy = Math.min(cam.floorY, H);
    x.fillStyle = '#2b3047';
    x.fillRect(0, 0, W, fy);
    for (var px = 0; px < W; px += Math.max(6, 18 * cam.s)) {
      x.fillStyle = 'rgba(0,0,0,0.18)';
      x.fillRect(px, 0, Math.max(2, 6 * cam.s), fy);
    }
    x.fillStyle = '#4c5466';
    x.fillRect(0, fy, W, H - fy);
    vignette(x, W, H, 0.3);
  }
  // ริมถนน: ท้องฟ้า ทุ่งหญ้า ทางเท้า + ถนนลาดยางด้านหน้า (ไม่มีรั้ว)
  function sceneRoad(x, cam) {
    var W = cam.W;
    var H = cam.H;
    var fy = Math.min(cam.floorY, H);
    var hz = Math.max(0, Math.min(fy, Y(cam, 150)));
    var sky = x.createLinearGradient(0, 0, 0, Math.max(1, hz));
    sky.addColorStop(0, '#8cb6da');
    sky.addColorStop(1, '#dce8ee');
    x.fillStyle = sky;
    x.fillRect(0, 0, W, hz);
    var far = x.createLinearGradient(0, hz, 0, fy);
    far.addColorStop(0, '#b7c99c');
    far.addColorStop(1, '#8ea96a');
    x.fillStyle = far;
    x.fillRect(0, hz, W, fy - hz);
    if (fy < H) {
      var walk = Math.min(H, fy + Math.max(6, 40 * cam.s));
      x.fillStyle = '#b9b4aa';
      x.fillRect(0, fy, W, walk - fy);
      x.fillStyle = '#e6e3dc';
      x.fillRect(0, walk, W, Math.max(2, 6 * cam.s));
      x.fillStyle = '#3b3e43';
      x.fillRect(0, walk + Math.max(2, 6 * cam.s), W, H - walk);
    }
  }
  // หน้าร้านกระจก: บานกระจกใหญ่กรอบอะลูมิเนียม เห็นในร้านลาง ๆ (ชั้นวางของ ไฟเพดาน) · ป้ายคาดด้านบน
  function glassInterior(x, x0, y0, w, h, seed) {
    var r = rng(seed);
    var bg = x.createLinearGradient(0, y0, 0, y0 + h);
    bg.addColorStop(0, '#5b5246');
    bg.addColorStop(0.55, '#3a352f');
    bg.addColorStop(1, '#25231f');
    x.fillStyle = bg;
    x.fillRect(x0, y0, w, h);
    // ไฟเพดาน
    for (var i = 0; i < 3; i++) {
      var lx = x0 + w * (0.2 + 0.3 * i);
      var g = x.createRadialGradient(lx, y0 + h * 0.06, 0, lx, y0 + h * 0.06, w * 0.22);
      g.addColorStop(0, 'rgba(255,236,200,0.55)');
      g.addColorStop(1, 'rgba(255,236,200,0)');
      x.fillStyle = g;
      x.fillRect(x0, y0, w, h * 0.5);
    }
    // ชั้นวางของ + ของบนชั้น
    var cols = ['#c9a36b', '#8fb0c4', '#d07a5a', '#e2d6bd', '#7d9a6b', '#b78db0'];
    for (var sx = 0; sx < 3; sx++) {
      var shx = x0 + w * (0.08 + sx * 0.31);
      var shw = w * 0.24;
      for (var row = 0; row < 4; row++) {
        var sy = y0 + h * (0.3 + row * 0.16);
        x.fillStyle = 'rgba(20,18,15,0.55)';
        x.fillRect(shx, sy, shw, h * 0.012);
        var px = shx + 2;
        while (px < shx + shw - 4) {
          var bw = shw * (0.06 + r() * 0.08);
          var bh = h * (0.05 + r() * 0.07);
          x.fillStyle = cols[Math.floor(r() * cols.length)];
          x.globalAlpha = 0.55;
          x.fillRect(px, sy - bh, Math.min(bw, shx + shw - px), bh);
          x.globalAlpha = 1;
          px += bw + shw * 0.015;
        }
      }
    }
    x.fillStyle = 'rgba(30,26,22,0.35)';
    x.fillRect(x0, y0 + h * 0.92, w, h * 0.08);
  }
  function sceneGlass(x, cam, g) {
    var W = cam.W;
    var H = cam.H;
    var s = cam.s;
    var fy = Math.min(cam.floorY, H);
    var cx = g.bw / 2;
    var mod = 400;
    var pil = 30;
    var gTop = 270;
    x.fillStyle = '#e4ddd0';
    x.fillRect(0, 0, W, fy);
    grain(x, 0, 0, W, fy, 0.09, 1.4);
    var xMin = -cam.left / s;
    var xMax = (W - cam.left) / s;
    var k0 = Math.floor((xMin - cx) / mod) - 1;
    var k1 = Math.ceil((xMax - cx) / mod) + 1;
    // ป้ายคาดหน้าร้าน (เหนือกระจก)
    x.fillStyle = '#2e3239';
    x.fillRect(0, Y(cam, gTop + 70), W, 70 * s);
    x.fillStyle = 'rgba(255,255,255,0.08)';
    x.fillRect(0, Y(cam, gTop + 70), W, Math.max(1, 3 * s));
    for (var k = k0; k <= k1; k++) {
      var b = cx + k * mod - mod / 2;
      var gx = X(cam, b + pil / 2);
      var gw = (mod - pil) * s;
      var gy = Y(cam, gTop);
      var gh = (gTop - 8) * s;
      if (gx > W || gx + gw < 0) continue;
      x.save();
      x.beginPath();
      x.rect(gx, gy, gw, gh);
      x.clip();
      // ในร้าน: วาดภาพเล็กแล้วขยาย = เบลอนุ่ม (มองผ่านกระจก ไม่แย่งสายตาจากงานบนกระจก)
      var lw = Math.max(8, Math.round(gw / 3));
      var lh = Math.max(8, Math.round(gh / 3));
      var lo = mk(lw, lh);
      glassInterior(ctx2d(lo), 0, 0, lw, lh, 31 + (k & 7));
      x.drawImage(lo, gx, gy, gw, gh);
      x.fillStyle = 'rgba(28,30,34,0.28)';
      x.fillRect(gx, gy, gw, gh);
      // สีกระจก + เงาสะท้อนเฉียง
      x.fillStyle = 'rgba(150,180,192,0.16)';
      x.fillRect(gx, gy, gw, gh);
      x.fillStyle = 'rgba(255,255,255,0.12)';
      x.beginPath();
      x.moveTo(gx + gw * 0.08, gy);
      x.lineTo(gx + gw * 0.36, gy);
      x.lineTo(gx + gw * 0.12, gy + gh);
      x.lineTo(gx - gw * 0.16, gy + gh);
      x.closePath();
      x.fill();
      x.fillStyle = 'rgba(255,255,255,0.07)';
      x.beginPath();
      x.moveTo(gx + gw * 0.46, gy);
      x.lineTo(gx + gw * 0.52, gy);
      x.lineTo(gx + gw * 0.28, gy + gh);
      x.lineTo(gx + gw * 0.22, gy + gh);
      x.closePath();
      x.fill();
      x.restore();
      // กรอบอะลูมิเนียม + ธรณีล่าง
      var fw = Math.max(2, 5 * s);
      x.strokeStyle = '#9ea4aa';
      x.lineWidth = fw;
      x.strokeRect(gx + fw / 2, gy + fw / 2, gw - fw, gh - fw);
      x.strokeStyle = 'rgba(0,0,0,0.25)';
      x.lineWidth = 1;
      x.strokeRect(gx + fw, gy + fw, gw - fw * 2, gh - fw * 2);
      x.fillStyle = '#7f858b';
      x.fillRect(gx, Y(cam, 8), gw, 8 * s);
    }
    for (var p = k0; p <= k1 + 1; p++) {
      var bx = cx + p * mod - mod / 2;
      var L = X(cam, bx - pil / 2);
      var pw = pil * s;
      x.fillStyle = '#d8d0c2';
      x.fillRect(L, Y(cam, gTop), pw, gTop * s);
      x.fillStyle = 'rgba(255,255,255,0.18)';
      x.fillRect(L, Y(cam, gTop), pw * 0.3, gTop * s);
      x.fillStyle = 'rgba(0,0,0,0.12)';
      x.fillRect(L + pw * 0.82, Y(cam, gTop), pw * 0.18, gTop * s);
    }
    topLight(x, W, H, X(cam, cx), 0.22);
    if (cam.floorY < H) floor(x, cam, '#bdb6aa', '#9c958a', 40, 0.12);
    vignette(x, W, H, 0.22);
  }
  var SCENE_AFTER = { hand: sceneHandAfter }; // วาดทับหลังตัวงาน (นิ้วโป้งทับหน้าบัตร)
  var SCENE_DRAW = { paper: scenePaper, hand: sceneHand, table: sceneTable, event: sceneEvent, road: sceneRoad, glass: sceneGlass, studio: sceneStudio, wall: sceneWall, brick: sceneBrick, shop: sceneShop, fence: sceneFence, classDoor: sceneClassDoor, officeDoor: sceneOfficeDoor, classroom: sceneClassroom };

  /* ---------- คนยืนเทียบขนาด 170 ซม. — รูปการ์ตูนเจ้าของร้าน (ยังโหลดรูปไม่เสร็จ ใช้เงาคนสีเทาแทน) ---------- */
  var mascot = null;
  function setMascot(img) {
    mascot = img;
  }
  function person(x, cam, U) {
    var s = cam.s;
    var cx = cam.personX;
    var fy = cam.floorY;
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
    if (mascot && mascot.width) {
      var h = 172 * s; // ปลายผมถึงพื้นรองเท้า
      var w = (h * mascot.width) / mascot.height;
      x.drawImage(mascot, cx - w / 2, fy - h, w, h);
    } else {
      x.fillStyle = '#2e3954';
      x.beginPath();
      var R = function (px, py, w2, h2, r) {
        rr(x, cx + px * s, fy - (py + h2) * s, w2 * s, h2 * s, r * s);
      };
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
    }
    var label = 'คนสูง 170 ซม.';
    x.font = '500 ' + Math.round(17 * U) + 'px ' + BODY;
    var lw = x.measureText(label).width + 18 * U;
    var lh = 26 * U;
    var ly = fy - 174 * s - 10 * U - lh;
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

  /* ปฏิทินตั้งโต๊ะ (ภาพหน้าตรง): ขอบขาตั้งสีเข้มโผล่ใต้หน้า + ห่วงลวดเรียงตามขอบบน (เว้นช่องกลางไว้แขวน) */
  function deskcalHardware(x, g, k, px, py, w, h) {
    var lift = Math.max(2, g.lift * k);
    var bg = x.createLinearGradient(0, py + h, 0, py + h + lift);
    bg.addColorStop(0, '#2b2f37');
    bg.addColorStop(1, '#15181e');
    x.fillStyle = bg;
    x.fillRect(px - 0.4 * k, py + h, w + 0.8 * k, lift);
    x.fillStyle = '#20242b';
    x.fillRect(px - 0.4 * k, py - 0.5 * k, w + 0.8 * k, Math.max(1.5, 0.6 * k));
    var pitch = 0.85 * k; // ห่วงละ ~8.5 มม.
    var rw = Math.max(1.2, 0.18 * k);
    var top = Math.max(1, (g.rings - 1.25) * k);
    var n = Math.max(6, Math.floor((g.w - 1.2) / 0.85));
    var gapAt = Math.floor(n / 2);
    var start = px + (w - (n - 1) * pitch) / 2;
    x.lineCap = 'round';
    for (var i = 0; i < n; i++) {
      if (n > 12 && Math.abs(i - gapAt) <= 1) continue; // ช่องกลางสำหรับแขวน
      var cx = start + i * pitch;
      var gr = x.createLinearGradient(cx - rw, 0, cx + rw, 0);
      gr.addColorStop(0, '#9aa0a8');
      gr.addColorStop(0.45, '#f5f6f8');
      gr.addColorStop(1, '#7c838c');
      x.strokeStyle = gr;
      x.lineWidth = rw;
      x.beginPath();
      x.moveTo(cx, py + 0.6 * k);
      x.bezierCurveTo(cx - 0.32 * k, py - 0.1 * k, cx - 0.3 * k, top, cx + 0.05 * k, top);
      x.stroke();
      x.fillStyle = 'rgba(20,24,30,0.55)';
      x.beginPath();
      x.arc(cx, py + 0.55 * k, Math.max(0.8, 0.12 * k), 0, Math.PI * 2);
      x.fill();
    }
  }

  /* หน้าปฏิทินรายเดือน: รูปด้านบน + ชื่อเดือน + ตารางวันที่ (อาทิตย์สีแดง) — ใช้ทำผิวหน้าปฏิทิน 3 มิติ/วิดีโอ
   * o = { photo (รูป/ผืนภาพ), month: C.calMonth(...), accent: '#rrggbb', W, H } */
  function calPage(o) {
    var W = o.W || 1024;
    var H = o.H || 768;
    var c = mk(W, H);
    var x = ctx2d(c);
    var M = o.month;
    var acc = o.accent || '#c0392b';
    x.fillStyle = '#ffffff';
    x.fillRect(0, 0, W, H);
    var land = W >= H;
    var ph = Math.round(H * (land ? 0.56 : 0.54));
    if (o.photo) {
      var iw = o.photo.naturalWidth || o.photo.width;
      var ih = o.photo.naturalHeight || o.photo.height;
      var s = Math.max(W / iw, ph / ih);
      x.drawImage(o.photo, (W - iw * s) / 2, (ph - ih * s) / 2, iw * s, ih * s);
    } else {
      x.fillStyle = '#e9e6e0';
      x.fillRect(0, 0, W, ph);
    }
    var pad = Math.round(Math.min(W, H) * 0.05);
    var gy = ph + pad * 0.8;
    var gh = H - gy - pad * 0.7;
    var gx = pad;
    var gw = W - pad * 2;
    if (land) {
      // ซ้าย: ชื่อเดือน + ปี · ขวา: ตาราง
      var lw = Math.round(W * 0.3);
      x.fillStyle = acc;
      x.font = '700 ' + Math.round(H * 0.085) + 'px ' + DISPLAY;
      x.textBaseline = 'top';
      x.textAlign = 'left';
      x.fillText(M.name, pad, gy);
      x.fillStyle = '#5b6170';
      x.font = '500 ' + Math.round(H * 0.045) + 'px ' + BODY;
      x.fillText(M.en + ' ' + M.year, pad, gy + H * 0.1);
      x.fillText('พ.ศ. ' + M.be, pad, gy + H * 0.16);
      gx = pad + lw;
      gw = W - gx - pad;
    } else {
      x.fillStyle = acc;
      x.font = '700 ' + Math.round(W * 0.07) + 'px ' + DISPLAY;
      x.textBaseline = 'top';
      x.textAlign = 'center';
      x.fillText(M.name + ' ' + M.be, W / 2, gy);
      gy += W * 0.1;
      gh = H - gy - pad * 0.6;
    }
    var rows = M.weeks.length + 1;
    var cw = gw / 7;
    var rh = gh / rows;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    var days = (NS.core && NS.core.TH_DAYS) || ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
    x.font = '600 ' + Math.round(rh * 0.5) + 'px ' + BODY;
    for (var d = 0; d < 7; d++) {
      x.fillStyle = d === 0 ? acc : '#3b4252';
      x.fillText(days[d], gx + cw * (d + 0.5), gy + rh * 0.5);
    }
    x.fillStyle = '#e3e0da';
    x.fillRect(gx, gy + rh * 0.95, gw, Math.max(1, rh * 0.04));
    x.font = '500 ' + Math.round(rh * 0.56) + 'px ' + BODY;
    M.weeks.forEach(function (wk, r) {
      wk.forEach(function (n, dd) {
        if (!n) return;
        x.fillStyle = dd === 0 ? acc : '#1f2633';
        x.fillText(String(n), gx + cw * (dd + 0.5), gy + rh * (r + 1.5));
      });
    });
    return c;
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

  /* ป้าย CNC: แยกส่วนที่สีต่างจากพื้นงาน (ตัวอักษร โลโก้ กรอบ) ออกเป็นตัวนูน — พื้นที่สีใกล้พื้นงานโปร่งใส
   * (ไล่ความต่างสี 85–135 ให้ขอบตัวอักษรนุ่ม และไม่นับสีไล่เฉดของพื้นหลังเป็นตัวนูน) */
  function letterMask(src, bg) {
    var w = src.width;
    var h = src.height;
    var c = mk(w, h);
    var x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(src, 0, 0, w, h);
    var img = x.getImageData(0, 0, w, h);
    var d = img.data;
    var r = bg[0];
    var g = bg[1];
    var b = bg[2];
    for (var i = 0; i < d.length; i += 4) {
      var dist = Math.abs(d[i] - r) + Math.abs(d[i + 1] - g) + Math.abs(d[i + 2] - b);
      var a = (dist - 85) / 50;
      d[i + 3] = a <= 0 ? 0 : a >= 1 ? 255 : Math.round(a * 255);
    }
    x.putImageData(img, 0, 0);
    return c;
  }
  function tinted(src, color) {
    var c = mk(src.width, src.height);
    var x = ctx2d(c);
    x.drawImage(src, 0, 0);
    x.globalCompositeOperation = 'source-atop';
    x.fillStyle = color;
    x.fillRect(0, 0, c.width, c.height);
    return c;
  }
  /* นีออน: หลอดตามขอบตัวอักษร (ตัวอักษรหนา = ขอบรอบตัว · เส้นบาง = ทั้งเส้น) · color 'design' = สีตามงาน
   * คืน { tube: หลอด (แกนกลางสว่าง), glow: แสงฟุ้งสีเดียวกัน } ขนาดเท่าภาพงาน */
  function neonArt(src, bg, color) {
    var L = letterMask(src, bg);
    var W = L.width;
    var H = L.height;
    var r = Math.max(2, Math.round(Math.min(W, H) * 0.0075));
    var er = mk(W, H);
    var ex = ctx2d(er);
    ex.drawImage(L, 0, 0);
    ex.globalCompositeOperation = 'destination-in';
    for (var a = 0; a < 8; a++) ex.drawImage(L, Math.cos((a * Math.PI) / 4) * r * 2, Math.sin((a * Math.PI) / 4) * r * 2);
    var ring = mk(W, H);
    var rx = ctx2d(ring);
    rx.drawImage(L, 0, 0);
    rx.globalCompositeOperation = 'destination-out';
    rx.drawImage(er, 0, 0);
    if (color && color !== 'design') {
      rx.globalCompositeOperation = 'source-in';
      rx.fillStyle = color;
      rx.fillRect(0, 0, W, H);
    }
    var tube = mk(W, H);
    var tx = ctx2d(tube);
    tx.drawImage(ring, 0, 0);
    tx.globalCompositeOperation = 'lighter';
    tx.globalAlpha = 0.45;
    tx.filter = 'blur(' + Math.max(0.5, r * 0.3) + 'px)';
    tx.drawImage(ring, 0, 0);
    tx.globalCompositeOperation = 'destination-in';
    tx.globalAlpha = 1;
    tx.filter = 'none';
    tx.drawImage(ring, 0, 0);
    var glow = mk(W, H);
    var gx = ctx2d(glow);
    gx.filter = 'blur(' + r * 3 + 'px)';
    gx.drawImage(ring, 0, 0);
    gx.drawImage(ring, 0, 0);
    return { tube: tube, glow: glow };
  }
  /* ---------- รูปทรงชิ้นงาน: มุมมน / วงกลม-วงรี / ไดคัทตามรูป (+ ขอบขาว) ---------- */
  // ไฟล์งานมีพื้นใส (PNG ตัดพื้น) ไหม — ดูจากภาพย่อ
  function hasAlpha(src) {
    try {
      var c = mk(48, 48);
      var x = c.getContext('2d', { willReadFrequently: true });
      x.drawImage(src, 0, 0, 48, 48);
      var d = x.getImageData(0, 0, 48, 48).data;
      var n = 0;
      for (var i = 3; i < d.length; i += 4) if (d[i] < 200) n++;
      return n > 20;
    } catch (e) {
      return false;
    }
  }
  /* เงาทึบรูปชิ้นงาน: ส่วนทึบของ fg ขยายออก r พิกเซล + อุดรูด้านใน (ไดคัทตัดแค่ขอบนอก)
   * คำนวณที่ภาพย่อ (ด้านยาว 360) แล้วขยายกลับแบบนุ่ม → ขอบโค้งเนียน · คืนผืนขาวทึบเท่า fg หรือ null ถ้าแทบไม่มีเนื้องาน */
  function cutSilhouette(fg, r, base) {
    var W = fg.width;
    var H = fg.height;
    var f = Math.min(1, 360 / Math.max(W, H));
    var P = 3;
    var mw = Math.max(1, Math.round(W * f));
    var mh = Math.max(1, Math.round(H * f));
    var cw = mw + P * 2;
    var ch = mh + P * 2;
    var m = mk(cw, ch);
    var mx = m.getContext('2d', { willReadFrequently: true });
    mx.drawImage(fg, P, P, mw, mh);
    var rs = r * f;
    var rings = rs > 0.4 ? Math.max(1, Math.ceil(rs / 1.5)) : 0;
    for (var q = 1; q <= rings; q++) {
      var rq = (rs * q) / rings;
      for (var a = 0; a < 16; a++) mx.drawImage(fg, P + Math.cos((a * Math.PI) / 8) * rq, P + Math.sin((a * Math.PI) / 8) * rq, mw, mh);
    }
    var img = mx.getImageData(0, 0, cw, ch);
    var d = img.data;
    var N = cw * ch;
    var inside = new Uint8Array(N);
    var cnt = 0;
    for (var i = 0; i < N; i++) {
      if (d[i * 4 + 3] > 90) {
        inside[i] = 1;
        cnt++;
      }
    }
    if (cnt < mw * mh * 0.004) return null;
    var out = new Uint8Array(N);
    var stack = [];
    var seed = function (p) {
      if (!inside[p] && !out[p]) {
        out[p] = 1;
        stack.push(p);
      }
    };
    for (var xx = 0; xx < cw; xx++) {
      seed(xx);
      seed((ch - 1) * cw + xx);
    }
    for (var yy = 0; yy < ch; yy++) {
      seed(yy * cw);
      seed(yy * cw + cw - 1);
    }
    while (stack.length) {
      var p = stack.pop();
      var px = p % cw;
      if (px > 0) seed(p - 1);
      if (px < cw - 1) seed(p + 1);
      if (p >= cw) seed(p - cw);
      if (p < N - cw) seed(p + cw);
    }
    // สแตนดี้: ฐานตัดตรงวางพื้นได้ — ส่วนล่างสุดของรูป (เท้า) ยืดลงถึงขอบล่าง + แผ่นเชื่อมฐานบาง ๆ
    if (base) {
      var lows = [];
      var ybot = -1;
      for (var bx = P; bx < cw - P; bx++) {
        var low = -1;
        for (var by = ch - 1; by >= 0; by--) {
          if (!out[by * cw + bx]) {
            low = by;
            break;
          }
        }
        lows.push(low);
        if (low > ybot) ybot = low;
      }
      if (ybot >= 0) {
        var band = Math.max(2, Math.round(mh * 0.04));
        var x0 = -1;
        var x1 = -1;
        for (var li = 0; li < lows.length; li++) {
          if (lows[li] >= 0 && lows[li] >= ybot - band) {
            if (x0 < 0) x0 = li;
            x1 = li;
            for (var fy2 = lows[li]; fy2 < ch - P; fy2++) out[fy2 * cw + li + P] = 0;
          }
        }
        var top = Math.max(0, ybot - Math.max(2, Math.round(mh * 0.03)));
        for (var ry = top; ry < ch - P; ry++) for (var rx = x0; rx <= x1; rx++) out[ry * cw + rx + P] = 0;
      }
    }
    for (var j = 0; j < N; j++) {
      d[j * 4] = d[j * 4 + 1] = d[j * 4 + 2] = 255;
      d[j * 4 + 3] = out[j] ? 0 : 255;
    }
    mx.putImageData(img, 0, 0);
    var s = mk(W, H);
    var sx = s.getContext('2d', { willReadFrequently: true });
    sx.imageSmoothingEnabled = true;
    sx.imageSmoothingQuality = 'high';
    sx.drawImage(m, P, P, mw, mh, 0, 0, W, H);
    var im = sx.getImageData(0, 0, W, H);
    var e = im.data;
    for (var k = 3; k < e.length; k += 4) {
      var v = (e[k] - 100) * 4.5;
      e[k] = v < 0 ? 0 : v > 255 ? 255 : v;
      e[k - 1] = e[k - 2] = e[k - 3] = 255;
    }
    sx.putImageData(im, 0, 0);
    return s;
  }
  /* src = งานเต็มชิ้นตามสัดส่วนจริง → ผืนเท่าเดิม นอกรูปทรงโปร่งใส
   * o = { radius: % ของด้านสั้น (มุมมน), border: ขอบขาว ซม. (ไดคัท), k: พิกเซลต่อ ซม., bg: สีพื้นงาน, alpha: ไฟล์พื้นใส }
   * ไดคัท: ไฟล์พื้นใส → ตัดตามรูป + ขอบขาว · ไฟล์มีพื้น → เก็บพื้นสีงานรอบลาย (ตามรูปตัวอักษร/โลโก้) แล้วขอบขาวรอบนอก */
  function shapeFace(src, kind, o) {
    o = o || {};
    var W = src.width;
    var H = src.height;
    var c = mk(W, H);
    var x = ctx2d(c);
    if (kind === 'cut') {
      var k = o.k > 0 ? o.k : W / 100;
      var b = Math.min(Math.max(0, o.border || 0) * k, Math.min(W, H) * 0.2);
      var pad = o.alpha ? 0 : Math.min(W, H) * 0.035;
      var ins = b + pad;
      var fg = mk(W, H);
      var fx = ctx2d(fg);
      var lm = o.alpha ? src : letterMask(src, o.bg || borderColor(src, W, H));
      fx.drawImage(lm, ins, ins, Math.max(1, W - 2 * ins), Math.max(1, H - 2 * ins));
      var outer = cutSilhouette(fg, ins, o.base);
      if (outer) {
        x.drawImage(outer, 0, 0);
        if (pad > 0) {
          var inner = cutSilhouette(fg, pad);
          if (inner) x.drawImage(tinted(inner, rgb(o.bg || [255, 255, 255])), 0, 0);
        }
        x.drawImage(fg, 0, 0);
        return c;
      }
      kind = 'round'; // แทบไม่มีเนื้องาน → มุมมนแทน
    }
    x.save();
    x.beginPath();
    if (kind === 'circle') x.ellipse(W / 2, H / 2, W / 2, H / 2, 0, 0, Math.PI * 2);
    else if (kind === 'round') rr(x, 0, 0, W, H, (Math.min(W, H) * clamp(o.radius || 10, 1, 50)) / 100);
    else x.rect(0, 0, W, H);
    x.clip();
    x.drawImage(src, 0, 0, W, H);
    x.restore();
    return c;
  }
  /* งานพร้อมรูปทรง (ใช้แทนงานเดิมทั้งภาพ 2 มิติ/3 มิติ) — วาดเต็มชิ้นตามสัดส่วนจริงก่อน แล้วตัดรูปทรง
   * fit 'contain' + ไฟล์พื้นใส = ไม่เติมพื้น (ไดคัทตามรูปได้) */
  function shapedDesign(d, wcm, hcm, fit, kind, sh, maxSide) {
    sh = sh || {};
    var long = maxSide || 1600;
    var W = wcm >= hcm ? long : Math.max(1, Math.round((long * wcm) / hcm));
    var H = wcm >= hcm ? Math.max(1, Math.round((long * hcm) / wcm)) : long;
    var src = mk(W, H);
    var x = ctx2d(src);
    var alpha = !!(d && d.src) && hasAlpha(d.src);
    if (alpha && kind === 'cut') fit = 'contain'; // ไดคัทจากไฟล์พื้นใส: เห็นทั้งรูป ขอบตัดตามรูปอยู่แล้ว
    if (d && d.src && alpha && fit === 'contain') {
      var r = C.containRect(d.w, d.h, W, H);
      // สแตนดี้: รูปชิดล่าง (เท้าวางพื้น) ไม่ลอยกลางแผ่น
      x.drawImage(d.src, r.dx, sh.base ? H - r.dh : r.dy, r.dw, r.dh);
    } else paintDesign(x, d, 0, 0, W, H, fit);
    var c = shapeFace(src, kind, { border: sh.border, radius: sh.radius, k: W / wcm, bg: d && d.bg, alpha: alpha, base: !!sh.base });
    return { src: c, w: W, h: H, bg: (d && d.bg) || [255, 255, 255], shaped: kind };
  }
  /* ฟิล์มติดกระจก: print = พิมพ์สีทึบ · frost = ฟิล์มฝ้าขาวขุ่น ลายในงานตัดเป็นช่องใส · oneway = งานพิมพ์บนตาข่ายรูพรุน (มองจากในร้านเห็นข้างนอก)
   * คืนผืนเท่าภาพงาน (frost มีความโปร่ง) */
  function filmArt(src, film, bg, k) {
    var W = src.width;
    var H = src.height;
    var c = mk(W, H);
    var x = ctx2d(c);
    if (film === 'frost') {
      x.drawImage(src, 0, 0);
      x.globalCompositeOperation = 'source-in';
      x.fillStyle = 'rgba(236,241,243,0.8)';
      x.fillRect(0, 0, W, H);
      grain(x, 0, 0, W, H, 0.08, 0.6);
      x.globalCompositeOperation = 'destination-in';
      x.drawImage(src, 0, 0);
      x.globalCompositeOperation = 'destination-out';
      x.drawImage(letterMask(src, bg || borderColor(src, W, H)), 0, 0);
      return c;
    }
    x.drawImage(src, 0, 0);
    if (film === 'oneway') {
      var step = Math.max(3, (k || W / 100) * 0.3);
      var rad = step * 0.32;
      x.globalCompositeOperation = 'source-atop';
      x.fillStyle = 'rgba(14,17,22,0.5)';
      x.beginPath();
      for (var py = step / 2; py < H; py += step) {
        for (var px = step / 2; px < W; px += step) {
          x.moveTo(px + rad, py);
          x.arc(px, py, rad, 0, Math.PI * 2);
        }
      }
      x.fill();
    }
    return c;
  }
  var MTL2D = { inox: '#d4d8dc', gold: '#d4ad55', black: '#202124', white: '#f3f2ee' };
  // 2 มิติ: ตัวอักษรลอยจากผนัง (เงาบนผนัง + ความหนาเฉียง + แสงส่องหลัง)
  function lettersFace(x, g, k, d, fit, look) {
    var w = Math.max(1, Math.round(g.w * k));
    var h = Math.max(1, Math.round(g.h * k));
    var art = mk(w, h);
    paintDesign(ctx2d(art), d, 0, 0, w, h, fit);
    var L = letterMask(art, (d && d.bg) || [31, 42, 77]);
    var mt = look && MTL2D[look.mat];
    var gap = g.gap * k;
    var rel = g.relief * k;
    x.save();
    if (look && look.light === 'halo') {
      x.filter = 'blur(' + Math.max(2, w * 0.015) + 'px)';
      x.globalAlpha = 0.55;
      x.drawImage(tinted(L, '#fff1d8'), 0, 0);
    }
    x.filter = 'blur(' + Math.max(1, gap * 0.5) + 'px)';
    x.globalAlpha = 0.42;
    x.drawImage(tinted(L, '#000000'), gap * 0.6, gap * 1.1);
    x.restore();
    var side = tinted(L, mt ? 'rgba(60,60,60,0.85)' : 'rgba(0,0,0,0.45)');
    for (var i = 3; i >= 1; i--) x.drawImage(side, (rel * 0.35 * i) / 3, (rel * 0.5 * i) / 3);
    x.drawImage(mt ? tinted(L, mt) : L, 0, 0);
  }
  // 2 มิติ: นีออนบนอะคริลิคใส
  function neonFace(x, g, k, d, fit, look) {
    var w = Math.max(1, Math.round(g.w * k));
    var h = Math.max(1, Math.round(g.h * k));
    var art = mk(w, h);
    paintDesign(ctx2d(art), d, 0, 0, w, h, fit);
    var a = neonArt(art, (d && d.bg) || [31, 42, 77], look ? look.neon : 'design');
    x.save();
    x.fillStyle = 'rgba(255,255,255,0.16)';
    x.strokeStyle = 'rgba(255,255,255,0.65)';
    x.lineWidth = Math.max(1, 0.3 * k);
    x.beginPath();
    rr(x, 0, 0, w, h, Math.min(w, h) * 0.03);
    x.fill();
    x.stroke();
    x.globalAlpha = 0.6;
    x.drawImage(a.glow, 0, 0);
    x.globalAlpha = 1;
    x.drawImage(a.tube, 0, 0);
    x.restore();
  }
  // อุปกรณ์ของป้ายแบบใหม่ (ภาพ 2 มิติ)
  function newHardware(x, g, k, look) {
    var px = g.fx * k;
    var py = g.fy * k;
    var w = g.w * k;
    var h = g.h * k;
    x.save();
    if (g.type === 'blade') {
      x.fillStyle = '#2b2f35';
      x.fillRect(0, py - 4 * k, px + w + 1 * k, 2.5 * k);
      x.fillRect(0, py - 8 * k, 1.2 * k, 14 * k);
      [px + w * 0.15, px + w * 0.85].forEach(function (hx) {
        x.fillRect(hx - 0.3 * k, py - 2 * k, 0.6 * k, 2 * k);
      });
    } else if (g.type === 'flag') {
      var pole = px - 2 * k;
      x.fillStyle = '#c9cdd3';
      x.fillRect(pole - 0.8 * k, py - 10 * k, 1.6 * k, h + g.lift * k + 8 * k);
      x.fillRect(pole, py - 1.6 * k, w + 2.6 * k, 1.2 * k);
      x.fillStyle = '#2b2f35';
      x.beginPath();
      x.ellipse(pole, py + h + g.lift * k - 6 * k, 22 * k, 6 * k, 0, 0, Math.PI * 2);
      x.fill();
    } else if (g.type === 'backdrop') {
      var T = g.post * k;
      var bw = (g.w + 2 * g.post) * k;
      var bh = (g.post + g.h + g.lift) * k;
      x.strokeStyle = '#b9bec6';
      x.lineWidth = Math.max(1, 1.6 * k);
      [[0, 0, T, bh], [bw - T, 0, T, bh], [0, 0, bw, T]].forEach(function (r) {
        x.strokeRect(r[0], r[1], r[2], r[3]);
        x.beginPath();
        var vert = r[3] > r[2];
        var n = Math.max(1, Math.round((vert ? r[3] : r[2]) / T));
        for (var i = 0; i < n; i++) {
          if (vert) {
            x.moveTo(r[0] + (i % 2 ? T : 0), r[1] + (i * r[3]) / n);
            x.lineTo(r[0] + (i % 2 ? 0 : T), r[1] + ((i + 1) * r[3]) / n);
          } else {
            x.moveTo(r[0] + (i * r[2]) / n, r[1] + (i % 2 ? T : 0));
            x.lineTo(r[0] + ((i + 1) * r[2]) / n, r[1] + (i % 2 ? 0 : T));
          }
        }
        x.stroke();
      });
    } else if (g.type === 'billboard') {
      var R = Math.min(45, 18 + g.w * 0.02) * k;
      var cx = px + w / 2;
      x.fillStyle = '#8b9097';
      x.fillRect(cx - R, py + h, R * 2, g.lift * k);
      x.fillStyle = '#5d6168';
      x.fillRect(px, py + h + 8 * k, w, 4 * k);
      x.strokeStyle = '#8b9097';
      x.lineWidth = Math.max(1, 2 * k);
      x.strokeRect(px, py + h - 80 * k + 12 * k, w, 80 * k);
      if (look && look.lit) {
        var nl = Math.max(2, Math.round(g.w / 250));
        for (var j = 0; j < nl; j++) {
          var lx = px + (w * (j + 0.5)) / nl;
          x.fillStyle = '#2b2f35';
          x.fillRect(lx - 1.5 * k, py - 50 * k, 3 * k, 50 * k);
          x.fillRect(lx - 17 * k, py - 55 * k, 34 * k, 12 * k);
        }
      }
    } else if (g.type === 'tablestand') {
      x.fillStyle = 'rgba(255,255,255,0.55)';
      x.fillRect(px - 0.6 * k, py + h, w + 1.2 * k, Math.max(1.5, g.lift * k + 1));
      x.strokeStyle = 'rgba(255,255,255,0.8)';
      x.lineWidth = Math.max(1, 0.4 * k);
      x.strokeRect(px - 0.6 * k, py - 0.4 * k, w + 1.2 * k, h + 0.8 * k);
    }
    x.restore();
  }
  function cncPosts(x, g, k) {
    if (g.noPosts) return; // แบบติดผนัง ไม่มีเสา
    var pw = g.post * k;
    var ph = (g.cap + g.h + g.lift) * k;
    var col = g.steel ? g.steel.color : '';
    [0, (g.fx + g.w) * k].forEach(function (px) {
      x.fillStyle = col ? metalGrad(x, px, px + pw, col) : (function () {
        var gr = x.createLinearGradient(px, 0, px + pw, 0);
        gr.addColorStop(0, '#5a5f68');
        gr.addColorStop(0.35, '#474c54');
        gr.addColorStop(1, '#2c3036');
        return gr;
      })();
      x.fillRect(px, 0, pw, ph);
      x.fillStyle = '#23262b';
      x.fillRect(px - 0.6 * k, 0, pw + 1.2 * k, Math.max(1.2 * k, 1.5));
    });
  }
  function cncFace(x, g, k, d, fit) {
    var px = g.fx * k;
    var py = g.fy * k;
    var w = Math.round(g.w * k);
    var h = Math.round(g.h * k);
    var bg = (d && d.bg) || [31, 42, 77];
    extrusion(x, { type: 'lightbox' }, px, py, w, h, Math.max(g.ex * k, 2.5), d);
    x.fillStyle = rgb(bg);
    x.fillRect(px, py, w, h);
    var art = mk(w, h);
    paintDesign(ctx2d(art), d, 0, 0, w, h, fit);
    var L = letterMask(art, bg);
    var rel = g.relief * k;
    x.save();
    x.beginPath();
    x.rect(px, py, w, h);
    x.clip();
    x.globalAlpha = 0.45;
    x.drawImage(tinted(L, '#000000'), px + rel * 0.7, py + rel * 1.1);
    x.globalAlpha = 1;
    var side = tinted(L, 'rgba(0,0,0,0.42)');
    for (var i = 3; i >= 1; i--) x.drawImage(side, px + (rel * 0.35 * i) / 3, py + (rel * 0.5 * i) / 3);
    x.drawImage(L, px, py);
    faceShade(x, px, py, w, h);
    x.restore();
    x.strokeStyle = 'rgba(255,255,255,0.35)';
    x.lineWidth = 1;
    x.strokeRect(px + 0.5, py + 0.5, w - 1, h - 1);
  }

  /* ป้ายขาตั้งโครงเหล็ก (มองหน้าตรง): เสา 2 ข้างต่อจากกรอบลงพื้น · ฐาน · หน้าป้ายติดหน้าโครง
   * โชว์เฉพาะโครง = เห็นคร่าวนอน/คร่าวตั้งข้างใน */
  // สีโครงเหล็ก: เข้มขึ้น/สว่างขึ้นเป็นเงา · สแตนเลสไล่เงาโลหะ
  function metalGrad(x, x0, x1, color) {
    var gr = x.createLinearGradient(x0, 0, x1, 0);
    if (color === 'inox') {
      gr.addColorStop(0, '#f4f5f7');
      gr.addColorStop(0.45, '#b9bec6');
      gr.addColorStop(1, '#8a9099');
    } else {
      var c = hexRgb(color || '#1f2125');
      gr.addColorStop(0, rgb(c, 1.35));
      gr.addColorStop(1, rgb(c, 0.85));
    }
    return gr;
  }
  function metalFlat(color) {
    return color === 'inox' ? '#a9aeb6' : color || '#25282e';
  }
  function standFrame(x, g, k, d, fit) {
    var o = g.steel;
    var STEEL = metalFlat(o.color);
    var T = Math.max(o.T * k, 1.5);
    var w = g.w * k;
    var h = g.h * k;
    var total = g.total * k;
    var bar = function (bx, by, bw, bh) {
      x.fillRect(bx, by, bw, bh);
    };
    x.save();
    // เสา + ฐาน (มองหน้าตรงเห็นคานฐานด้านหน้า)
    x.fillStyle = metalGrad(x, 0, T, o.color);
    bar(0, 0, T, total);
    x.fillStyle = metalGrad(x, w - T, w, o.color);
    bar(w - T, 0, T, total);
    x.fillStyle = STEEL;
    if (o.base === 'rect') bar(0, total - T, w, T);
    else {
      x.fillStyle = '#1b1d21';
      bar(-T * 0.2, total - T, T * 1.4, T);
      bar(w - T * 1.2, total - T, T * 1.4, T);
    }
    if (o.frameOnly) {
      x.fillStyle = STEEL;
      bar(0, 0, w, T);
      bar(0, h - T, w, T);
      var innerH = h - 2 * T;
      var innerW = w - 2 * T;
      var segH = (innerH - o.nh * T) / (o.nh + 1);
      x.fillStyle = '#2f9e62';
      for (var i = 0; i < o.nh; i++) bar(T, T + (i + 1) * segH + i * T, innerW, T);
      x.fillStyle = '#3a6fd8';
      var segW = (innerW - o.nv * T) / (o.nv + 1);
      for (var j = 0; j < o.nv; j++) bar(T + (j + 1) * segW + j * T, T, T, innerH);
    } else {
      extrusion(x, { type: 'lightbox' }, 0, 0, w, h, Math.max(g.ex * k, 1.5), d);
      x.beginPath();
      x.rect(0, 0, w, h);
      x.clip();
      paintDesign(x, d, 0, 0, w, h, fit);
      faceShade(x, 0, 0, w, h);
    }
    x.restore();
  }

  /* วาดชิ้นงานทั้งชิ้น (หน้าป้าย + ขาตั้ง/อุปกรณ์) ลงผืนแยก 1 ซม. = k พิกเซล */
  // 2 มิติ: ชิ้นงานรูปทรงพิเศษ (มุมมน/วงกลม/ไดคัท) — ความหนาเป็นเงาซ้อนตามรูป ไม่ใช่สี่เหลี่ยม
  function shapedFace(x, g, k, d) {
    var px = g.fx * k;
    var py = g.fy * k;
    var w = Math.max(1, g.w * k);
    var h = Math.max(1, g.h * k);
    var f = mk(w, h);
    var fx = ctx2d(f);
    fx.drawImage(d.src, 0, 0, f.width, f.height);
    fx.globalCompositeOperation = 'source-atop';
    if (g.type === 'acrylic') gloss(fx, 0, 0, f.width, f.height);
    faceShade(fx, 0, 0, f.width, f.height);
    var ex = g.depth ? Math.max(g.ex * k, g.type === 'card' ? 0.8 : 2) : 0;
    if (ex > 0) {
      var side = tinted(f, g.type === 'acrylic' ? 'rgba(176,212,222,0.95)' : '#d6d3cb');
      var n = Math.max(1, Math.ceil(ex));
      for (var i = n; i >= 1; i--) x.drawImage(side, px + (ex * i) / n, py + (ex * i) / n, w, h);
    } else {
      // สติ๊กเกอร์แนบผิว: เส้นขอบจาง ๆ ให้เห็นรูปทรงบนผนังสีอ่อน
      x.save();
      x.filter = 'blur(1px)';
      x.globalAlpha = 0.35;
      x.drawImage(tinted(f, '#000000'), px + 0.5, py + 1, w, h);
      x.restore();
    }
    x.drawImage(f, px, py, w, h);
    if (g.type === 'acrylic' && d.shaped === 'round') standoffs(x, g, k, px, py);
  }
  // 2 มิติ: ฟิล์ม/สติ๊กเกอร์ติดกระจก
  function windowFace(x, g, k, d, fit, look) {
    var px = g.fx * k;
    var py = g.fy * k;
    var w = Math.max(1, g.w * k);
    var h = Math.max(1, g.h * k);
    var f = mk(w, h);
    var fx = ctx2d(f);
    if (d && d.shaped) fx.drawImage(d.src, 0, 0, f.width, f.height);
    else paintDesign(fx, d, 0, 0, f.width, f.height, fit);
    var film = (look && look.film) || 'print';
    x.drawImage(filmArt(f, film, d && d.bg, k), px, py, w, h);
    // เงาสะท้อนกระจกทับฟิล์ม (ฟิล์มติดด้านนอก)
    x.save();
    x.globalAlpha = film === 'frost' ? 0.5 : 0.8;
    x.globalCompositeOperation = 'source-atop';
    gloss(x, px, py, w, h);
    x.restore();
  }
  var PAD = 6;
  function objectCanvas(g, k, d, fit, look) {
    var c = mk(g.bw * k + PAD * 2, g.bh * k + PAD * 2);
    var x = ctx2d(c);
    x.translate(PAD, PAD);
    if (g.type === 'letters') {
      lettersFace(x, g, k, d, fit, look);
      return c;
    }
    if (g.type === 'neon') {
      neonFace(x, g, k, d, fit, look);
      return c;
    }
    if (g.type === 'window') {
      windowFace(x, g, k, d, fit, look);
      return c;
    }
    if (d && d.shaped) {
      shapedFace(x, g, k, d);
      if (g.type === 'standee') newHardware(x, g, k, look);
      return c;
    }
    var px = g.fx * k;
    var py = g.fy * k;
    var w = g.w * k;
    var h = g.h * k;
    if (g.type === 'stand') {
      standFrame(x, g, k, d, fit);
      return c;
    }
    if (g.type === 'cnc') {
      cncPosts(x, g, k);
      cncFace(x, g, k, d, fit);
      return c;
    }
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
    else if (g.type === 'deskcal') deskcalHardware(x, g, k, px, py, w, h);
    else newHardware(x, g, k, look);
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

  // เส้นวัดจาก a ไป b เยื้องออกไปทางทิศ (nx,ny) — เส้นสั้นกว่าป้ายตัวเลข ย้ายตัวเลขออกไปข้างนอกไม่ให้ทับป้าย
  function measure(x, a, b, nx, ny, off, text, U) {
    x.font = '600 ' + Math.round(19 * U) + 'px ' + BODY;
    var need = x.measureText(text).width + 24 * U + 26 * U;
    var short = Math.hypot(b.x - a.x, b.y - a.y) < need;
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
    if (!short) x.fill();
    x.restore();
    if (short) pill(x, text, (ax + bx) / 2 + nx * 24 * U, (ay + by) / 2 + ny * 24 * U, U);
    else pill(x, text, (ax + bx) / 2, (ay + by) / 2, U);
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

  /* ---------- ฉาก "มือจับ (รูปของร้าน)" ----------
   * hp = { img, w, h, cards: [มุม 4 จุด 0..1], ref: ความสว่างหน้าบัตร, turn }
   * ชั้นช่วย (ทำครั้งเดียวต่อรูป): shade = ความสว่างของบัตรจริง (คูณทับงาน → เงา/แสงตามรูป) · occ = นิ้ว/มือที่บังบัตร (วาดทับงานอีกชั้น) */
  function handLayers(hp) {
    if (hp.layers && hp.layers.img === hp.img) return hp.layers;
    var W = hp.img.width;
    var H = hp.img.height;
    var c = mk(W, H);
    var x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(hp.img, 0, 0);
    var im = x.getImageData(0, 0, W, H);
    var d = im.data;
    var sh = x.createImageData(W, H);
    var oc = x.createImageData(W, H);
    var s = sh.data;
    var o = oc.data;
    var ref = clamp(hp.ref || 240, 160, 255);
    for (var i = 0; i < d.length; i += 4) {
      var r = d[i];
      var g = d[i + 1];
      var b = d[i + 2];
      var L = 0.299 * r + 0.587 * g + 0.114 * b;
      var ch = Math.max(r, g, b) - Math.min(r, g, b);
      var v = Math.min(255, (L * 255) / ref);
      s[i] = s[i + 1] = s[i + 2] = v;
      s[i + 3] = 255;
      // ผิว/นิ้ว (มีสี) หรือเงาเข้มมาก = ของที่บังบัตร
      var a = Math.max((ch - 18) / 14, (ref * 0.72 - L) / 40);
      o[i] = r;
      o[i + 1] = g;
      o[i + 2] = b;
      o[i + 3] = a <= 0 ? 0 : a >= 1 ? 255 : a * 255;
    }
    var shade = mk(W, H);
    shade.getContext('2d').putImageData(sh, 0, 0);
    var occ = mk(W, H);
    occ.getContext('2d').putImageData(oc, 0, 0);
    hp.layers = { img: hp.img, shade: shade, occ: occ };
    return hp.layers;
  }
  function handCanvasSize(st) {
    var hp = st.handPhoto;
    var cr = C.handCrop(st.handView, hp.cards, hp.split);
    return C.canvasSize('auto', null, { w: cr.w * hp.img.width, h: cr.h * hp.img.height });
  }
  function drawHandPhoto(x, st, g, W, H, U, scale, opt, out) {
    var hp = st.handPhoto;
    var iw = hp.img.width;
    var ih = hp.img.height;
    var cr = C.handCrop(st.handView, hp.cards, hp.split);
    var src = [cr.x * iw, cr.y * ih, cr.w * iw, cr.h * ih];
    x.drawImage(hp.img, src[0], src[1], src[2], src[3], 0, 0, W, H);
    var lay = handLayers(hp);
    var map = function (p) {
      return { x: ((p.x - cr.x) / cr.w) * W, y: ((p.y - cr.y) / cr.h) * H };
    };
    out.cards = [];
    var shown = C.handShown(st.handView, hp.cards.length);
    var long = (opt.preview ? 1000 : 1800) * Math.min(Math.max(scale, 1), 1.5);
    var art = null;
    shown.forEach(function (i) {
      var q = hp.cards[i].map(map);
      out.cards.push({ i: i, q: q });
      if (!C.isConvex(q)) return;
      // งานตามขนาดจริง แล้ววางพอดีบัตรในรูป ไม่ยืดงาน (สัดส่วนต่างกัน → เติมสีพื้นงาน)
      if (!art) art = faceCanvas(st.design, g.w, g.h, st.fit, long);
      var fq = C.fitQuad(q, g.w, g.h, hp.turn);
      var qw = (Math.hypot(fq[1].x - fq[0].x, fq[1].y - fq[0].y) + Math.hypot(fq[2].x - fq[3].x, fq[2].y - fq[3].y)) / 2;
      var qh = (Math.hypot(fq[3].x - fq[0].x, fq[3].y - fq[0].y) + Math.hypot(fq[2].x - fq[1].x, fq[2].y - fq[1].y)) / 2;
      var face = art;
      if (Math.abs(qw / Math.max(1, qh) / (g.w / g.h) - 1) > 0.03) {
        var fw = qw >= qh ? long : Math.max(1, Math.round((long * qw) / qh));
        var fh = qw >= qh ? Math.max(1, Math.round((long * qh) / qw)) : long;
        face = mk(fw, fh);
        var fx = ctx2d(face);
        if (!(st.design && st.design.shaped)) {
          fx.fillStyle = st.design && st.design.bg ? rgb(st.design.bg) : '#ffffff';
          fx.fillRect(0, 0, fw, fh);
        }
        var cr2 = C.containRect(art.width, art.height, fw, fh);
        fx.drawImage(art, cr2.dx, cr2.dy, cr2.dw, cr2.dh);
      }
      // มุมบัตรในรูปโค้ง → ลบมุมงานให้ตรงกัน
      if (hp.round > 0) {
        var rc = mk(face.width, face.height);
        var rx2 = ctx2d(rc);
        rx2.beginPath();
        rr(rx2, 0, 0, rc.width, rc.height, Math.min(rc.width, rc.height) * hp.round);
        rx2.clip();
        rx2.drawImage(face, 0, 0);
        face = rc;
      }
      var layer = mk(W * scale, H * scale);
      var lx = ctx2d(layer);
      lx.setTransform(scale, 0, 0, scale, 0, 0);
      warp(lx, face, { x: 0, y: 0, w: face.width, h: face.height }, fq, opt.preview ? 12 : 24);
      // แสงเงาจากบัตรจริงคูณทับงาน เฉพาะส่วนที่มีงาน
      lx.globalCompositeOperation = 'multiply';
      lx.drawImage(lay.shade, src[0], src[1], src[2], src[3], 0, 0, W, H);
      lx.globalCompositeOperation = 'destination-in';
      var mask = mk(W * scale, H * scale);
      var mx = ctx2d(mask);
      mx.setTransform(scale, 0, 0, scale, 0, 0);
      warp(mx, face, { x: 0, y: 0, w: face.width, h: face.height }, fq, opt.preview ? 12 : 24);
      lx.setTransform(1, 0, 0, 1, 0, 0);
      lx.drawImage(mask, 0, 0);
      x.save();
      x.setTransform(1, 0, 0, 1, 0, 0);
      x.drawImage(layer, 0, 0);
      x.restore();
    });
    // นิ้ว/มือที่บังบัตร วาดทับงานอีกชั้น (นอกบัตรเหมือนรูปเดิมอยู่แล้ว)
    x.drawImage(lay.occ, src[0], src[1], src[2], src[3], 0, 0, W, H);
    if (opt.preview && st.handEdit) {
      out.cards.forEach(function (c) {
        handles(x, c.q, U);
      });
    }
  }

  /* ---------- วาดทั้งภาพ ----------
   * st: { design, fit, type, w, h, scene, photo, person, dims, zoom, aspect, brightness, info, footer }
   * opt: { scale (ตัวคูณความละเอียดตอนส่งออก), preview (วาดจุดลากมุม) } */
  function render(canvas, st, opt) {
    opt = opt || {};
    var scale = opt.scale || 1;
    var g = C.geometry(st.type, st.w, st.h, st.steel);
    var photo = st.scene === 'photo' && st.photo && st.photo.img ? st.photo : null;
    var hand = st.scene === 'handPhoto' && st.handPhoto && st.handPhoto.img && st.handPhoto.cards ? st.handPhoto : null;
    var size = hand ? handCanvasSize(st) : C.canvasSize(st.aspect, g, photo);
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
    else if (hand) drawHandPhoto(x, st, g, W, H, U, scale, opt, out);
    else drawScene(x, st, g, W, H, U, scale, out);
    x.restore();
    if (F) footer(x, W, H, F, U, st.footer || {});
    return out;
  }

  function drawScene(x, st, g, W, H, U, scale, out) {
    var scene = SCENE_DRAW[st.scene] ? st.scene : 'studio';
    var cam = C.camera({ scene: scene, g: g, W: W, H: H, person: st.person, zoom: st.zoom, spot: st.spot });
    out.cam = cam;
    SCENE_DRAW[scene](x, cam, g, st.spot, st);
    var s = cam.s;
    var oc = objectCanvas(g, s * scale, st.design, st.fit, st.look);
    var ox = cam.left;
    var oy = cam.floorY - cam.top * s;
    if (g.mount === 'floor') {
      x.save();
      var sh = x.createRadialGradient(0, 0, 0, 0, 0, 1);
      sh.addColorStop(0, 'rgba(0,0,0,0.38)');
      sh.addColorStop(1, 'rgba(0,0,0,0)');
      x.translate(ox + (g.bw * s) / 2, oy + g.bh * s); // ใต้ชิ้นงาน (ฉากโต๊ะ: บนโต๊ะ)
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
      x.shadowColor = g.type === 'sticker' || g.type === 'window' ? 'rgba(0,0,0,0)' : 'rgba(0,0,0,0.32)';
      x.shadowBlur = clamp(3 + g.gap * s * 1.8, 3, 42) * scale;
      x.shadowOffsetX = clamp(1 + g.gap * s * 0.35, 1, 14) * scale;
      x.shadowOffsetY = clamp(2 + g.gap * s * 0.8, 2, 30) * scale;
    }
    x.drawImage(oc, ox - PAD / scale, oy - PAD / scale, oc.width / scale, oc.height / scale);
    x.restore();
    if (scene === 'fence' && g.type === 'vinyl') ties(x, g, s, ox, oy);
    if (SCENE_AFTER[scene]) SCENE_AFTER[scene](x, cam, g, st);
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
    var oc = objectCanvas(g, k, st.design, st.fit, st.look);
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
    if (st.person) photoPerson(x, st, g, q, W, H, U, out);
    if (st.dims) dimsQuad(x, faceQuad(q, g), g, U);
    if (opt.preview) handles(x, q, U);
  }
  /* คนยืนเทียบบนรูปหน้าร้านลูกค้า: ขนาดคิดจากป้ายในรูป (ป้ายกว้างจริง N ซม. = กี่พิกเซล) ยืนระยะเดียวกับป้าย
   * ตำแหน่งเท้า = st.photo.person (0..1 ลากย้ายได้) หรือข้างป้าย ระดับพื้นโดยประมาณ */
  function photoPerson(x, st, g, q, W, H, U, out) {
    var d = function (a, b) {
      return Math.hypot(a.x - b.x, a.y - b.y);
    };
    var s = ((d(q[0], q[1]) + d(q[3], q[2])) / 2 / g.bw + (d(q[0], q[3]) + d(q[1], q[2])) / 2 / g.bh) / 2;
    if (!(s > 0)) return;
    var P = C.PERSON;
    var feet;
    if (st.photo.person) feet = { x: st.photo.person.x * W, y: st.photo.person.y * H };
    else {
      var xs = q.map(function (p) {
        return p.x;
      });
      var bottom = Math.max(q[2].y, q[3].y);
      var fx = Math.max.apply(null, xs) + (P.gap + P.w / 2) * s;
      if (fx + (P.w / 2) * s > W) fx = Math.min.apply(null, xs) - (P.gap + P.w / 2) * s;
      var lift = g.mount === 'floor' ? 0 : Math.max(40, Math.min(300, 150 - g.bh / 2));
      feet = { x: fx, y: Math.min(H * 0.98, bottom + lift * s) };
    }
    person(x, { s: s, personX: feet.x, floorY: feet.y }, U);
    out.personBox = { x0: feet.x - 32 * s, x1: feet.x + 32 * s, y0: feet.y - 178 * s, y1: feet.y + 6 * s };
  }

  /* ---------- งานพิมพ์ข้อความเร็ว (ยังไม่มีไฟล์งาน) ---------- */
  var THEMES = {
    brand: { name: 'กรมส้ม', bg: '#1f2a4d', bg2: '#2d3d6b', title: '#ffffff', sub: '#f4a46e', pillBg: '#d9622b', pillFg: '#ffffff' },
    promo: { name: 'แดงเหลือง', bg: '#d3222a', bg2: '#a8161d', title: '#ffd43b', sub: '#ffffff', pillBg: '#ffd43b', pillFg: '#a8161d' },
    clean: { name: 'ขาวดำ', bg: '#ffffff', bg2: '#ece9e2', title: '#15181f', sub: '#555c6b', pillBg: '#15181f', pillFg: '#ffffff' },
    fresh: { name: 'เขียว', bg: '#167244', bg2: '#0d5532', title: '#ffffff', sub: '#d9f2a6', pillBg: '#ffffff', pillFg: '#167244' },
  };

  // ชุดสีของร้าน (ต่อท้ายชุดสีมาตรฐาน)
  var ALL_THEMES = Object.assign({}, THEMES);
  function setThemes(list) {
    ALL_THEMES = Object.assign({}, THEMES);
    (list || []).forEach(function (t) {
      ALL_THEMES[t.id] = { name: t.name, bg: t.bg, bg2: t.bg2, title: t.title, sub: t.sub, pillBg: t.pillBg, pillFg: t.pillFg, mine: true };
    });
  }
  function themes() {
    return ALL_THEMES;
  }
  // ฟอนต์ที่เลือก ("" = Kanit ตามเดิม) — ใส่ฟอนต์สำรองต่อท้ายเสมอ
  function fam(name) {
    return name ? '"' + String(name).replace(/["\\]/g, '') + '", ' + DISPLAY : DISPLAY;
  }
  function textDesign(t, wcm, hcm) {
    var long = 1500;
    var W = wcm >= hcm ? long : Math.round((long * wcm) / hcm);
    var H = wcm >= hcm ? Math.round((long * hcm) / wcm) : long;
    var c = mk(W, H);
    var x = ctx2d(c);
    var th = ALL_THEMES[t.theme] || THEMES.brand;
    var F1 = fam(t.font);
    var F2 = fam(t.font2);
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
    function fit(text, weight, maxW, F) {
      x.font = weight + ' 100px ' + (F || F1);
      var w = x.measureText(text).width || 1;
      return (100 * maxW) / w;
    }
    var n = lines.length;
    var ts = 0;
    if (n) {
      ts = (ah * (sub || phone ? 0.56 : 0.86)) / (n * 1.25);
      for (var i = 0; i < n; i++) ts = Math.min(ts, fit(lines[i], 700, aw));
    }
    var ss = sub ? Math.min(ah * 0.14, fit(sub, 500, aw, F2), ts ? ts * 0.5 : 1e9) : 0;
    var ps = phone ? Math.min(ah * 0.1, fit(phone, 600, aw * 0.78, F2), ts ? ts * 0.4 : 1e9) : 0;
    var gap = Math.max(ts, ss * 2, ps * 2.5) * 0.22;
    var total = n * ts * 1.25 + (ss ? gap + ss * 1.4 : 0) + (ps ? gap + ps * 2.1 : 0);
    var y = (H - total) / 2;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    for (var j = 0; j < n; j++) {
      x.font = '700 ' + ts + 'px ' + F1;
      x.fillStyle = th.title;
      x.fillText(lines[j], W / 2, y + ts * 0.66);
      y += ts * 1.25;
    }
    if (ss) {
      y += gap;
      x.font = '500 ' + ss + 'px ' + F2;
      x.fillStyle = th.sub;
      x.fillText(sub, W / 2, y + ss * 0.72);
      y += ss * 1.4;
    }
    if (ps) {
      y += gap;
      x.font = '600 ' + ps + 'px ' + F2;
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

  /* บัตรรันนัมเบอร์: วาดงาน + เส้นปรุต้นขั้ว + เลขรัน
   * o.k = พิกเซลต่อ ซม. · o.bleed = ตัดตก (ซม.) เติมด้วยสีพื้นงาน · o.digits = false → ใส่แค่คำนำหน้า (ตัวเลขไปใส่ใน PDF)
   * คืน { canvas, labels: [{ digitsX, y, size }] } ตำแหน่งตัวเลขเป็น ซม. จากมุมซ้ายบนของบัตร */
  function runFont(px) {
    return '700 ' + px + 'px Arial, "Liberation Sans", Helvetica, "Noto Sans Thai", sans-serif';
  }
  // ช่องเขียนบนต้นขั้ว (ชื่อ ..... / โทร ..... / วันที่ .....) เว้นแถบเลขรัน
  function stubLines(x, lay, run, bg, ox, oy, k, hcm) {
    var lum = (0.299 * bg[0] + 0.587 * bg[1] + 0.114 * bg[2]) / 255;
    var ink = lum < 0.55 ? 'rgba(255,255,255,0.78)' : 'rgba(0,0,0,0.62)';
    var sl = lay.slots[0];
    var top = run.pos.charAt(0) === 't';
    var y0 = top ? sl.y + 0.45 : 0.45;
    var y1 = top ? hcm - 0.4 : sl.y - sl.size - 0.35;
    var fs = Math.min(0.34, lay.stub * 0.085);
    var labels = ['ชื่อ', 'โทร', 'วันที่'];
    var n = Math.min(3, Math.floor((y1 - y0) / (fs * 2.1)));
    if (n < 1) return;
    var step = (y1 - y0) / n;
    x.save();
    x.fillStyle = ink;
    x.strokeStyle = ink;
    x.font = '500 ' + fs * k + 'px ' + BODY;
    x.textAlign = 'left';
    x.textBaseline = 'alphabetic';
    x.lineWidth = Math.max(1, 0.02 * k);
    x.setLineDash([0.04 * k, 0.07 * k]);
    for (var i = 0; i < n; i++) {
      var y = oy + (y0 + step * (i + 0.5) + fs * 0.35) * k;
      var x0 = ox + 0.35 * k;
      x.fillText(labels[i], x0, y);
      var tw = x.measureText(labels[i]).width;
      x.beginPath();
      x.moveTo(x0 + tw + 0.12 * k, y);
      x.lineTo(ox + (lay.stub - 0.35) * k, y);
      x.stroke();
    }
    x.restore();
  }
  function cardArt(d, wcm, hcm, fit, run, o) {
    o = o || {};
    var k = o.k || 100;
    var b = o.bleed || 0;
    var c = mk(Math.max(1, Math.round((wcm + 2 * b) * k)), Math.max(1, Math.round((hcm + 2 * b) * k)));
    var x = ctx2d(c);
    if (b) {
      x.fillStyle = d && d.bg ? rgb(d.bg) : '#ffffff';
      x.fillRect(0, 0, c.width, c.height);
    }
    var ox = b * k;
    var oy = b * k;
    var lay = run && run.on ? C.runSlots(run, wcm, hcm) : null;
    if (lay && lay.stub && o.split) {
      // งานพิมพ์ข้อความ: ต้นขั้วเป็นสีพื้นงาน มีช่องเขียน ชื่อ/โทร/วันที่ · งานจัดอยู่ฝั่งขวาของเส้นปรุ
      var bg = d && d.bg ? d.bg : [255, 255, 255];
      x.fillStyle = rgb(bg);
      x.fillRect(ox, oy, wcm * k, hcm * k);
      paintDesign(x, d, ox + lay.stub * k, oy, (wcm - lay.stub) * k, hcm * k, fit);
      stubLines(x, lay, run, bg, ox, oy, k, hcm);
    } else paintDesign(x, d, ox, oy, wcm * k, hcm * k, fit);
    var labels = [];
    if (lay) {
      if (lay.stub) {
        // เส้นปรุแบ่งต้นขั้ว
        var sx = Math.round(ox + lay.stub * k) + 0.5;
        x.save();
        x.strokeStyle = 'rgba(0,0,0,0.45)';
        x.lineWidth = Math.max(1, 0.025 * k);
        x.setLineDash([0.18 * k, 0.12 * k]);
        x.beginPath();
        x.moveTo(sx, oy);
        x.lineTo(sx, oy + hcm * k);
        x.stroke();
        x.restore();
      }
      lay.slots.forEach(function (sl) {
        x.font = runFont(sl.size * k);
        x.textAlign = 'left';
        x.textBaseline = 'alphabetic';
        x.fillStyle = run.color;
        var pw = run.prefix ? x.measureText(run.prefix).width / k : 0;
        var lab = C.runLabel(sl, pw, run.digits);
        if (run.prefix) x.fillText(run.prefix, ox + lab.left * k, oy + sl.y * k);
        if (o.digits !== false) x.fillText(C.runDigits(run, o.index || 0), ox + lab.digitsX * k, oy + sl.y * k);
        labels.push({ digitsX: lab.digitsX, y: sl.y, size: sl.size });
      });
    }
    return { canvas: c, labels: labels };
  }

  /* ตัวอย่างหน้ากระดาษพิมพ์แผ่นแรก (ย่อ): ช่องบัตร + เส้นตัด — ใช้โชว์ในหน้าต่างส่งออก
   * art = รูปบัตรรวมตัดตก หรือฟังก์ชัน (ลำดับใบ) → รูปบัตร (ให้เลขรันต่างกันทุกช่อง) */
  function sheetPreview(plan, art, maxW) {
    var L = plan.layout;
    var k = maxW / L.sw;
    var c = mk(Math.round(L.sw * k), Math.round(L.sh * k));
    var x = ctx2d(c);
    x.fillStyle = '#ffffff';
    x.fillRect(0, 0, c.width, c.height);
    var b = L.bleed;
    L.cells.forEach(function (cell, i) {
      if (i >= plan.qty) return;
      var img = typeof art === 'function' ? art(i) : art;
      x.save();
      if (L.rot) {
        x.translate((cell.x - b) * k, (cell.y - b + L.h + 2 * b) * k);
        x.rotate(-Math.PI / 2);
      } else x.translate((cell.x - b) * k, (cell.y - b) * k);
      var aw = (L.rot ? L.h : L.w) + 2 * b;
      var ah = (L.rot ? L.w : L.h) + 2 * b;
      x.drawImage(img, 0, 0, aw * k, ah * k);
      x.restore();
    });
    x.strokeStyle = '#000';
    x.lineWidth = 1;
    C.cropMarks(L).forEach(function (m) {
      x.beginPath();
      x.moveTo(m[0] * k, m[1] * k);
      x.lineTo(m[2] * k, m[3] * k);
      x.stroke();
    });
    return c;
  }

  // เส้นบอกขนาดและป้าย "คนสูง 170 ซม." จากจุดที่ฉาย (−1..1) ลงภาพขนาด W×H
  function overlay3d(x, pr, g, W, H, U, opt) {
    if (!pr) return;
    var px = function (p) {
      return { x: ((p.x + 1) / 2) * W, y: ((1 - p.y) / 2) * H };
    };
    if (opt.dims && pr.visible) {
      var q = pr.face.map(px);
      dimsQuad(x, q, g, U);
      // เส้นบอกขนาดเพิ่ม (เช่น ความสูงรวม ความลึกฐานของขาตั้ง) — เยื้องออกจากกลางป้าย
      var mx = (q[0].x + q[1].x + q[2].x + q[3].x) / 4;
      var my = (q[0].y + q[1].y + q[2].y + q[3].y) / 4;
      (pr.extra || []).forEach(function (e) {
        if (!(e.a.z < 1 && e.b.z < 1)) return;
        var a = px(e.a);
        var b = px(e.b);
        var L = Math.hypot(b.x - a.x, b.y - a.y);
        if (L < 24 * U) return;
        var nx = -(b.y - a.y) / L;
        var ny = (b.x - a.x) / L;
        if (nx * ((a.x + b.x) / 2 - mx) + ny * ((a.y + b.y) / 2 - my) < 0) {
          nx = -nx;
          ny = -ny;
        }
        measure(x, a, b, nx, ny, (e.off || 26) * U, e.text, U);
      });
    }
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
    cardArt: cardArt,
    handArt: handArt,
    neonArt: neonArt,
    hasAlpha: hasAlpha,
    shapeFace: shapeFace,
    shapedDesign: shapedDesign,
    filmArt: filmArt,
    handLayers: handLayers,
    glassInterior: glassInterior,
    calPage: calPage,
    paperTex: paperTex,
    sheetPreview: sheetPreview,
    runFont: runFont,
    overlay3d: overlay3d,
    footer: footer,
    textDesign: textDesign,
    prepareImage: prepareImage,
    setMascot: setMascot,
    setThemes: setThemes,
    themes: themes,
    letterMask: letterMask,
    THEMES: THEMES,
    fonts: { display: DISPLAY, body: BODY },
  };
})(typeof self !== 'undefined' ? self : this);
