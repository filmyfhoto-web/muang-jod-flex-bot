/* นัดพอน Sign Mockup — เก็บไฟล์แอปไว้ในเครื่อง เปิดได้แม้ไม่มีเน็ต
 * เปลี่ยนไฟล์แอปเมื่อไหร่ ให้เลื่อนเลข VERSION (มีเทสต์เช็กว่ารายการไฟล์ครบ) */
var VERSION = 'sign-mockup-2.1.0';
var APP = [
  './',
  'index.html',
  'app.css',
  'core.js',
  'render.js',
  'app.js',
  'scene3d.js',
  'vendor/three.module.min.js',
  'vendor/addons/controls/OrbitControls.js',
  'vendor/addons/environments/RoomEnvironment.js',
  'vendor/addons/geometries/RoundedBoxGeometry.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png'
];
var FONTS = 'sign-mockup-fonts';

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
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.map(function (k) {
          if (k !== VERSION && k !== FONTS) return caches.delete(k);
        })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  // ฟอนต์ Google: ใช้ของในเครื่องก่อน ไม่มีค่อยโหลด
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
  // ไฟล์แอป: ตอบจากเครื่องทันที แล้วแอบอัปเดตจากเซิร์ฟเวอร์ไว้รอบหน้า
  e.respondWith(
    caches.open(VERSION).then(function (c) {
      return c.match(req, { ignoreSearch: true }).then(function (hit) {
        var net = fetch(req)
          .then(function (res) {
            if (res && res.ok) c.put(req, res.clone());
            return res;
          })
          .catch(function () {
            return hit || (req.mode === 'navigate' ? c.match('index.html') : undefined);
          });
        return hit || net;
      });
    })
  );
});
