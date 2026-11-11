// node render.cjs <out.png>   (needs Playwright + the Loma font: NODE_PATH=$(npm root -g) node render.cjs ../../assets/richmenu.png)
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const out = path.resolve(process.argv[2] || 'richmenu-v4.png');
const types = { '.png': 'image/png', '.html': 'text/html; charset=utf-8' };
const srv = http.createServer((req, res) => { const f = path.join(__dirname, decodeURIComponent(req.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end(); } else { res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); res.end(d); } }); });
(async () => {
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 2500, height: 1301 }, deviceScaleFactor: 1 });
  await page.goto(`http://127.0.0.1:${srv.address().port}/menu.html`);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 2500, height: 1301 } });
  await b.close(); srv.close();
  const png = fs.readFileSync(out);
  console.log(out, png.length, 'bytes', png.readUInt32BE(16) + 'x' + png.readUInt32BE(20));
})();
