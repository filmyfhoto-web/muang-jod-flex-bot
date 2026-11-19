// Local test harness for the order page: serves pj.html, mocks LIFF + the doc-submit edge function, drives the UI, saves screenshots.
// usage: NODE_PATH=$(npm root -g) node harness.cjs <page.html> <outdir>   (needs Playwright; the ภาพ/รายการสินค้า below are SAMPLE data, the real page loads the shop catalogue)
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const [pageFile, outDir] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });

// ---- sample catalogue (SAMPLE DATA for the preview only — the real page loads the shop's own products) ----
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const CATS = {
  'สมุด': [['สมุดปกอ่อน 40 แผ่น', 'เล่ม'], ['สมุดปกอ่อน 60 แผ่น', 'เล่ม'], ['สมุดเรียงความ 100 แผ่น', 'เล่ม'], ['สมุดวาดเขียน A4', 'เล่ม'], ['สมุดบันทึกเล่มเล็ก', 'เล่ม'], ['สมุดตารางบัญชี', 'เล่ม'], ['สมุดโน้ตสันห่วง', 'เล่ม'], ['สมุดคัดไทย', 'เล่ม']],
  'เครื่องเขียน': [['ดินสอดำ 2B', 'แท่ง'], ['ดินสอ HB (กล่อง 12 แท่ง)', 'กล่อง'], ['ปากกาลูกลื่นสีน้ำเงิน', 'ด้าม'], ['ปากกาลูกลื่นสีแดง', 'ด้าม'], ['ปากกาเมจิก 12 สี', 'กล่อง'], ['ยางลบก้อนใหญ่', 'ก้อน'], ['ไม้บรรทัด 12 นิ้ว', 'อัน'], ['กบเหลาดินสอ', 'อัน'], ['กรรไกรนักเรียน', 'อัน'], ['กาวแท่ง', 'แท่ง'], ['สีไม้ 24 สี', 'กล่อง'], ['สีน้ำ 12 สี', 'กล่อง']],
  'กระดาษ': [['กระดาษ A4 80 แกรม (รีม)', 'รีม'], ['กระดาษ A4 70 แกรม (รีม)', 'รีม'], ['กระดาษการ์ดสี A4', 'แพ็ค'], ['กระดาษปรู๊ฟ', 'แผ่น'], ['กระดาษโปสเตอร์สี', 'แผ่น'], ['กระดาษถ่ายเอกสาร A3', 'รีม'], ['กระดาษคาร์บอน', 'แผ่น'], ['กระดาษสติกเกอร์ A4', 'แพ็ค']],
  'แฟ้ม/อุปกรณ์สำนักงาน': [['แฟ้มสันกว้าง 3 นิ้ว', 'เล่ม'], ['แฟ้มซองพลาสติก', 'ซอง'], ['คลิปหนีบกระดาษ', 'กล่อง'], ['ลวดเย็บกระดาษ เบอร์ 10', 'กล่อง'], ['เครื่องเย็บกระดาษ', 'อัน'], ['เทปใส 1 นิ้ว', 'ม้วน'], ['แท่นตัดเทป', 'อัน'], ['สมุดโฟลเดอร์เอกสาร', 'เล่ม'], ['กล่องใส่เอกสาร', 'ใบ'], ['ที่เจาะกระดาษ', 'อัน']],
  'อุปกรณ์การเรียน': [['กระเป๋านักเรียน', 'ใบ'], ['กล่องดินสอพลาสติก', 'กล่อง'], ['ชุดเครื่องเรขาคณิต', 'ชุด'], ['เครื่องคิดเลข 12 หลัก', 'เครื่อง'], ['ลูกโลกจำลอง', 'ลูก'], ['กระดานไวท์บอร์ดเล็ก', 'แผ่น'], ['ปากกาไวท์บอร์ด', 'ด้าม'], ['แปรงลบกระดาน', 'อัน']],
  'ของรางวัล/ของขวัญ': [['ถ้วยรางวัลเล็ก', 'ใบ'], ['เหรียญรางวัล', 'เหรียญ'], ['เกียรติบัตร A4', 'แผ่น'], ['กรอบรูปเกียรติบัตร', 'อัน'], ['ริบบิ้นสีสำหรับตกแต่ง', 'ม้วน'], ['ถุงของขวัญ', 'ใบ']],
};
const items = [];
let n = 1;
for (const [cat, list] of Object.entries(CATS)) for (const [name, unit] of list) items.push({ id: uuid(n++), n: name, u: unit, c: cat, i: '' });
const SCHOOLS = ['โรงเรียนบ้านกอก', 'โรงเรียนบ้านเชียงกลาง', 'โรงเรียนวัดดอนมูล', 'โรงเรียนอนุบาลบ้านหลวง'].map((name, i) => ({ id: uuid(900 + i), name }));

const ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" fill="#E2572B"/><rect x="28" y="32" width="44" height="40" rx="6" fill="#FBF6EE"/><rect x="36" y="22" width="28" height="14" rx="4" fill="#12335F"/></svg>';

let lastSubmit = null;
const server = http.createServer((req, res) => {
  if (req.url.startsWith('/pj.html')) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(pageFile)); return; }
  if (/\.(png|svg)$/.test(req.url)) { res.writeHead(200, { 'Content-Type': 'image/svg+xml' }); res.end(ICON); return; }
  res.writeHead(404); res.end();
});

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  const out = { errors: [], notes: [] };
  const run = async (name, width, body) => {
    const ctx = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'th-TH' });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => out.errors.push(`${name}: pageerror ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) out.errors.push(`${name}: console ${m.text()}`); });
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    await page.route('https://static.line-scdn.net/liff/edge/2/sdk.js', (r) => r.fulfill({
      contentType: 'text/javascript',
      body: `window.liff={init:async()=>{},isLoggedIn:()=>true,getAccessToken:()=>'mock-token',getProfile:async()=>({displayName:'ครูมะลิ (ร.ร.บ้านกอก)',pictureUrl:''}),getFriendship:async()=>({friendFlag:window.__friend!==false}),isInClient:()=>true,closeWindow(){},login(){},logout(){}}`,
    }));
    await page.route('https://mock-upload.local/**', (r) => r.fulfill({ status: 200, body: '{}' }));
    await page.route('**/functions/v1/doc-submit', async (route) => {
      const b = JSON.parse(route.request().postData() || '{}');
      const j = (o) => route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) });
      if (b.action === 'cfg') return j({ ok: true, liff_id: '2011814944-mock', oa: '' });
      if (b.action === 'me') return j({ ok: true, mode: process.env.MODE || 'on', line_name: 'ครูมะลิ (ร.ร.บ้านกอก)', teacher: { school_id: null, school_name: '', name: 'ครูมะลิ (ร.ร.บ้านกอก)', phone: '', saved: false }, schools: SCHOOLS, recent: [], chat: null, max_files: 20, max_size: 26214400, exts: ['jpg', 'jpeg', 'png', 'pdf', 'docx', 'xlsx'], max_items: 100 });
      if (b.action === 'products') return j({ ok: true, img: 'https://mock.local/img/', items });
      if (b.action === 'sign') return j({ ok: true, sess: 'abcdefgh12345678', uploads: (b.files || []).map((f, i) => ({ i, path: `web/k/abcdefgh12345678/${i}.${f.name.split('.').pop()}`, url: `https://mock-upload.local/put/${i}` })) });
      if (b.action === 'submit') {
        lastSubmit = b;
        return j({ ok: true, doc: { doc_no: 'PJ-0123', project_name: b.project.name, school_name: b.teacher.school_name, teacher_name: b.teacher.name, need: b.project.need_date || '', budget: b.project.budget ? Number(b.project.budget) : null, file_count: (b.files || []).length, items: (b.items || []).length, status: 'new' } });
      }
      return j({ error: 'bad_request' });
    });
    await page.goto(base + '/pj.html');
    await body(page);
    await ctx.close();
  };

  // ---------- 390px phone: the whole journey ----------
  await run('phone390', 390, async (page) => {
    await page.waitForSelector('#c1b input#tSchool');
    await page.screenshot({ path: path.join(outDir, '01-top.png') });

    // fill the orderer + project
    await page.fill('#tSchool', 'บ้านกอก');
    await page.click('#schL button[data-id]');
    await page.fill('#tPhone', '0812345678');
    await page.fill('#pName', 'โครงการวันวิทยาศาสตร์ 2569');
    await page.fill('#pBudget', '15000');
    await page.screenshot({ path: path.join(outDir, '02-filled.png') });

    // picker
    await page.waitForSelector('#prods button.pr[data-p]');
    await page.evaluate(() => document.querySelector('#c3').scrollIntoView());
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(outDir, '03-picker.png') });

    // choose a category, add some products, search, add a custom one
    await page.click('#cats button[data-g="เครื่องเขียน"]');
    const rows = await page.$$('#prods button.pr[data-p]');
    await rows[0].click(); await rows[2].click(); await rows[2].click(); await rows[5].click();
    await page.click('#cats button[data-g=""]');
    await page.fill('#qProd', 'สมุด');
    await page.waitForTimeout(250);
    const rows2 = await page.$$('#prods button.pr[data-p]');
    await rows2[0].click();
    await page.fill('#qProd', 'ผ้าม่านห้องประชุม');
    await page.waitForTimeout(250);
    await page.click('#prods button.pr.new');
    await page.waitForTimeout(100);
    // bump a quantity in the table
    await page.click('#tbl tr[data-i="0"] [data-d="1"]');
    await page.fill('#tbl tr[data-i="1"] input', '24');
    await page.dispatchEvent('#tbl tr[data-i="1"] input', 'input');
    await page.waitForTimeout(100);
    await page.evaluate(() => document.querySelector('#c3t').scrollIntoView());
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(outDir, '04-table.png') });
    await page.screenshot({ path: path.join(outDir, '05-full.png'), fullPage: true });

    // overflow check: nothing should be wider than the viewport
    const over = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    out.notes.push(`phone390 scrollWidth=${over.sw} clientWidth=${over.cw}`);
    if (over.sw > over.cw) out.errors.push(`phone390: horizontal overflow ${over.sw} > ${over.cw}`);

    // send
    await page.click('#go');
    await page.waitForSelector('.done .big');
    await page.screenshot({ path: path.join(outDir, '06-done.png'), fullPage: true });
  });

  // ---------- 320px (smallest phones): table must still fit ----------
  await run('phone320', 320, async (page) => {
    await page.waitForSelector('#prods button.pr[data-p]');
    const rows = await page.$$('#prods button.pr[data-p]');
    await rows[0].click(); await rows[1].click();
    await page.fill('#qProd', 'ผ้าม่านห้องประชุมขนาดใหญ่พิเศษสำหรับห้องประชุมใหญ่');
    await page.waitForTimeout(250);
    await page.click('#prods button.pr.new');
    await page.evaluate(() => document.querySelector('#c3t').scrollIntoView());
    await page.waitForTimeout(200);
    const over = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    out.notes.push(`phone320 scrollWidth=${over.sw} clientWidth=${over.cw}`);
    if (over.sw > over.cw) out.errors.push(`phone320: horizontal overflow ${over.sw} > ${over.cw}`);
    await page.screenshot({ path: path.join(outDir, '07-320-table.png') });
  });

  // ---------- not yet a friend of the shop: warning on the LINE bar ----------
  await run('notfriend', 390, async (page) => {
    await page.addInitScript(() => { window.__friend = false; });
    await page.reload();
    await page.waitForSelector('#lineBar');
    out.notes.push('notfriend bar: ' + (await page.textContent('#lineBar')).replace(/\s+/g, ' ').trim());
  });

  await browser.close();
  server.close();

  // ---------- assertions on what the page sent to the edge function ----------
  const b = lastSubmit;
  const checks = [];
  const ok = (c, msg) => checks.push(`${c ? 'PASS' : 'FAIL'}  ${msg}`);
  ok(!!b, 'submit was called');
  if (b) {
    ok(b.teacher.name === 'ครูมะลิ (ร.ร.บ้านกอก)' && b.teacher.phone === '0812345678' && b.teacher.school_name === 'โรงเรียนบ้านกอก', 'teacher block: LINE name pre-filled, phone, school from the list');
    ok(b.project.name === 'โครงการวันวิทยาศาสตร์ 2569' && String(b.project.budget) === '15000', 'project block: name + budget');
    ok(Array.isArray(b.items) && b.items.length === 5, `items: 5 lines (got ${b.items && b.items.length})`);
    const byName = Object.fromEntries((b.items || []).map((x) => [x.name, x]));
    ok(byName['ดินสอดำ 2B'] && byName['ดินสอดำ 2B'].qty === 2 && /^[0-9a-f-]{36}$/.test(byName['ดินสอดำ 2B'].id), 'catalogue item sent with its product id and bumped quantity');
    ok(byName['ปากกาลูกลื่นสีน้ำเงิน'] && byName['ปากกาลูกลื่นสีน้ำเงิน'].qty === 24, 'quantity typed into the table (24) is sent');
    ok(byName['ผ้าม่านห้องประชุม'] && byName['ผ้าม่านห้องประชุม'].id === undefined && byName['ผ้าม่านห้องประชุม'].qty === 1, 'custom (typed) item sent without id');
    ok(Array.isArray(b.files) && b.files.length === 0, 'no files needed when items are chosen');
  }
  ok(out.errors.length === 0, 'no page errors / horizontal overflow: ' + (out.errors.join(' | ') || 'none'));
  console.log(checks.join('\n'));
  console.log(out.notes.join('\n'));
  process.exit(checks.some((c) => c.startsWith('FAIL')) ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
