/* นัดพอน Sign Mockup — ใช้ได้แม้ไม่มีเน็ต + อัปเดตทันทีที่มีรุ่นใหม่
 * ไฟล์แอป: ขอจากเซิร์ฟเวอร์ก่อน (ได้รุ่นล่าสุดเสมอ) เน็ตหลุดค่อยใช้ของในเครื่อง
 * three.js / ไอคอน / โลโก้: ใช้ของในเครื่องก่อน (ไม่เปลี่ยนบ่อย เปิดเร็ว)
 * เปลี่ยนไฟล์แอปเมื่อไหร่ ให้เลื่อน VERSION ให้ตรงกับ APP_VERSION ใน app.js (มีเทสต์เช็ก) */
var VERSION = 'sign-mockup-4.0.0';
var APP = [
  './',
  'index.html',
  'app.css',
  'core.js',
  'render.js',
  'jobs.js',
  'app.js',
  'scene3d.js',
  'vendor/three.module.min.js',
  'vendor/addons/controls/OrbitControls.js',
  'vendor/addons/environments/RoomEnvironment.js',
  'vendor/addons/geometries/RoundedBoxGeometry.js',
  'vendor/addons/exporters/GLTFExporter.js',
  'vendor/addons/utils/TextureUtils.js',
  'vendor/viewer3d.standalone.js',
  'viewer3d.css',
  'brand/ntp-logo.png',
  'brand/ntp-mark.png',
  'brand/mascot.webp',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png'
];
var FONTS = 'sign-mockup-fonts';
var STATIC = /\/(vendor|icons|brand)\//;

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(VERSION).then(function (c) {
      return c.addAll(APP);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches
      .keys()
      .then(function (keys) {
        return Promise.all(
          keys.map(function (k) {
            if (k !== VERSION && k !== FONTS) return caches.delete(k);
          })
        );
      })
      .then(function () {
        return self.clients.claim();
      })
  );
});

function timeout(ms) {
  return new Promise(function (_, reject) {
    setTimeout(function () {
      reject(new Error('timeout'));
    }, ms);
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(
      caches.open(FONTS).then(function (c) {
        return c.match(req).then(function (hit) {
          if (hit) return hit;
          return fetch(req).then(function (res) {
            if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone());
            return res;
          });
        });
      })
    );
    return;
  }
  if (url.origin !== self.location.origin) return;
  // ลิงก์ดู 3 มิติ / API — ของสด ไม่เก็บในเครื่อง
  if (/\/sign\/(v|api)\//.test(url.pathname)) return;
  if (STATIC.test(url.pathname)) {
    e.respondWith(
      caches.open(VERSION).then(function (c) {
        return c.match(req, { ignoreSearch: true }).then(function (hit) {
          return (
            hit ||
            fetch(req).then(function (res) {
              if (res && res.ok) c.put(req, res.clone());
              return res;
            })
          );
        });
      })
    );
    return;
  }
  e.respondWith(
    caches.open(VERSION).then(function (c) {
      return Promise.race([fetch(req, { cache: 'no-cache' }), timeout(4000)])
        .then(function (res) {
          if (res && res.ok) c.put(req, res.clone());
          return res;
        })
        .catch(function () {
          return c.match(req, { ignoreSearch: true }).then(function (hit) {
            return hit || (req.mode === 'navigate' ? c.match('index.html') : Response.error());
          });
        });
    })
  );
});
