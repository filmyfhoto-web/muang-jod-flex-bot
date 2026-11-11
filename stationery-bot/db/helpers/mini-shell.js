// A stand-in for the back-office shell (admin.nattagroup.com), for browser tests of a module when no copy of the live shell is at
// hand (NATTA_LIVE_DIR). It copies the live shell's scope rules, read from the live files on 4 Nov 2569:
//   · admin1.js declares `const sb`, `const S`, `const ROUTES`, `const MOB`, `const VIEWS` and `function buildNav / router / go` at the
//     top level of a classic script — so ROUTES, VIEWS and sb are NOT properties of window (window.ROUTES is undefined);
//   · admin3.js `loadModules()` reads app_modules and adds each module's code as `<script>` with textContent, in global scope;
//   · the module must call buildNav() itself; the shell's router() draws the page for the hash.
// The page is served on 127.0.0.1; the Supabase host and the CDN script are answered locally (routeOffline in back-office.js).
import { createServer } from 'node:http';
import { SUPABASE_HOST } from './back-office.js';

export async function serveMiniShell({ moduleCode, anonKey = 'anon-test-key' }) {
  const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>หลังร้าน · ตัวแทนสำหรับทดสอบ</title>
<style>
  body{margin:0;font-family:'Noto Sans Thai','Loma',system-ui,sans-serif;background:#EEF2F7;color:#1B2433}
  #top{height:58px;background:#12335F;color:#fff;display:flex;align-items:center;gap:18px;padding:0 18px;overflow-x:auto}
  #top b{font-size:19px;letter-spacing:.3px;white-space:nowrap}
  #nav{display:flex;gap:6px}
  #nav a{color:#cfe0f5;text-decoration:none;white-space:nowrap;font-size:14px;padding:8px 12px;border-radius:10px}
  #nav a.on{color:#fff;font-weight:700;background:rgba(255,255,255,.14)}
  #view{min-height:calc(100vh - 58px)}
</style>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
</head><body>
<div id="top"><b>NATTA GROUP</b><nav id="nav"></nav></div>
<main id="view"></main>
<script>
const { createClient } = window.supabase
const sb = createClient(${JSON.stringify(SUPABASE_HOST)}, ${JSON.stringify(anonKey)})
const S = { loaded: true }
const $ = s => document.querySelector(s)
const num = n => Number(n || 0).toLocaleString('th-TH')
const ROUTES = [{ id: 'home', ic: 'home', name: 'หน้าหลัก' }, { id: 'salechat', ic: 'cart', name: 'แชทขายสินค้า' }, { id: 'weborders', ic: 'list', name: 'ออเดอร์ทั้งหมด' }]
const MOB = ['home']
const VIEWS = {}
VIEWS.home = function () { document.getElementById('view').innerHTML = '<p style="padding:20px">หน้าหลัก</p>' }
function buildNav() { document.getElementById('nav').innerHTML = ROUTES.map(function (r) { return '<a href="#' + r.id + '" data-r="' + r.id + '">' + r.name + '</a>' }).join('') }
function setActive(id) { document.querySelectorAll('#nav a').forEach(function (a) { a.classList.toggle('on', a.dataset.r === id) }) }
function router() {
  const id = location.hash.replace('#', '') || 'home'
  const r = ROUTES.find(function (x) { return x.id === id }) ? id : 'home'
  setActive(r)
  VIEWS[r]()
}
window.addEventListener('hashchange', router)
buildNav()
async function loadModules() {
  const r = await fetch('/module.js')
  const code = await r.text()
  const s = document.createElement('script')
  s.textContent = code
  document.body.appendChild(s)
}
loadModules().then(function () { window.__moduleLoaded = true; router() })
</script></body></html>`;
  const srv = createServer((req, res) => {
    const p = new URL(req.url, 'http://x').pathname;
    if (p === '/' || p === '/index.html') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(html);
    }
    if (p === '/module.js') {
      res.writeHead(200, { 'content-type': 'application/javascript; charset=utf-8' });
      return res.end(moduleCode);
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${srv.address().port}`, close: () => new Promise((r) => srv.close(r)) };
}
