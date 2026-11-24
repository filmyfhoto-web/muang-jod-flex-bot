/* NATTAPRON 8-BIT — app-shell cache. Bump CACHE on every release. */
const CACHE = 'np8-v4'; // v4: ใบจดงานจริงในเกม (จดเข้าม่วงจดจากหน้า ➕ ได้เลย)
const SHELL = [
  './', './index.html', './engine.js', './scene.js', './manifest.webmanifest', './icon-192.png', './icon-512.png',
  './art/scene-inside.png', './art/hd-printer.png', './art/hd-frames.png', './art/tab-queue.png', './art/tab-vinyl.png',
  './art/st-wait.png', './art/st-doing.png', './art/st-done.png',
  './art/nav-home.png', './art/nav-queue.png', './art/nav-report.png', './art/nav-set.png', './art/job-printer.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k.startsWith('np8-')).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* network-first for the shell (so updates arrive), cache fallback for offline */
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || !url.pathname.includes('/game')) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() =>
        caches.match(e.request).then((hit) => hit || (e.request.mode === 'navigate' ? caches.match('./index.html') : Response.error()))
      )
  );
});
