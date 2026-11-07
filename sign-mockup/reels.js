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
      x.textAlign = 'center';
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
      x.fillStyle = 'rgba(255,255,255,0.85)';
      x.font = '500 48px ' + BODY;
      x.fillText('สั่งทำป้ายแบบนี้ได้ที่', W / 2, yy);
      x.fillStyle = '#ffffff';
      fit(x, info.shop || 'ร้านป้าย', 900, 84, 700, DISPLAY);
      x.fillText(info.shop || 'ร้านป้าย', W / 2, yy + 104);
      if (info.phone) {
        x.font = '600 60px ' + DISPLAY;
        var phw = x.measureText(info.phone).width + 120;
        x.fillStyle = '#e07a3f';
        rr(x, W / 2 - phw / 2, yy + 160, phw, 104, 52);
        x.fill();
        x.fillStyle = '#ffffff';
        x.textBaseline = 'middle';
        x.fillText(info.phone, W / 2, yy + 214);
        x.textBaseline = 'alphabetic';
      }
      x.fillStyle = 'rgba(255,255,255,0.8)';
      x.font = '400 40px ' + BODY;
      x.fillText('ทักแชต / โทรสั่งได้เลย', W / 2, yy + (info.phone ? 350 : 190));
      x.restore();
    }
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
  function pickCodec(w, h, fps, bitrate) {
    if (typeof root.VideoEncoder !== 'function' || typeof root.VideoFrame !== 'function') return Promise.resolve(null);
    var i = 0;
    function next() {
      if (i >= CODECS.length) return Promise.resolve(null);
      var c = CODECS[i++];
      var cfg = { codec: c[1], width: w, height: h, bitrate: bitrate, framerate: fps };
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
    var bitrate = o.bitrate || 6000000;
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
    var rec = new root.MediaRecorder(stream, type ? { mimeType: type, videoBitsPerSecond: 6000000 } : undefined);
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

  NS.reels = { W: W, H: H, FPS: FPS, SEC: SEC, END: END, frames: FPS * SEC, ease: ease, overlay: overlay, placeFlat: placeFlat, encode: encode, loadMuxer: loadMuxer, CODECS: CODECS };
  if (typeof module === 'object' && module.exports) module.exports = NS.reels;
})(typeof self !== 'undefined' ? self : this);
