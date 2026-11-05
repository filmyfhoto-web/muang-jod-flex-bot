// "แชตและออเดอร์" with the LINE bridge, in a browser: the module from this repo in the stand-in shell, supabase-js talking to a real PostgreSQL
// (migrations 002 + 003) through the PostgREST stand-in. The bot's side is played by the test (the same database functions the bot calls).
// Covers: the "LINE OA" chip comes from the bot's heartbeat and nothing else; a customer's messages (text, picture, sticker, place) appear by
// themselves; typing and scrolling are not disturbed; a reply is "waiting" until the bot says LINE accepted it, and only then "sent";
// a refusal says why and can be sent again; the summary can go by LINE and the order's history gets the result; an in-shop chat stays honest.
// Screenshots go to $SALE_ORDERS_SHOTS (default: <tmp>/sale-orders-shots).
//   Run: cd stationery-bot/db && node --test test/sale-line-page.ui.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openSaleDb } from '../helpers/sale-db.js';
import { STAFF, asService, asStaff } from '../helpers/shop-db.js';
import { startPgRest, staffJwt } from '../helpers/pg-rest.js';
import { playwright, staffSession, routeOffline, PROJECT_REF } from '../helpers/back-office.js';
import { serveMiniShell } from '../helpers/mini-shell.js';

const MODULE = fileURLToPath(new URL('../../app-patches/sale-orders-page/saleorders.module.js', import.meta.url));
const SHOTS = process.env.SALE_ORDERS_SHOTS || join(tmpdir(), 'sale-orders-shots');
const SERVICE = 'svc-service-key';
const EMAIL = 'ying@natta.test';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const MANUAL = '66666666-6666-4666-8666-666666666601';
const UA = 'U' + 'a'.repeat(32); // คุณปู
const UB = 'U' + 'b'.repeat(32); // ครูสมศรี
const UC = 'U' + 'c'.repeat(32); // คุณเอ (a long chat)
const UD = 'U' + 'd'.repeat(32); // คนใหม่

const CHROMIUM = await (async () => {
  try {
    const b = await playwright().chromium.launch();
    await b.close();
    return true;
  } catch {
    return false;
  }
})();
const skipIt = CHROMIUM ? {} : { skip: 'Chromium (Playwright) is not available here' };

let db, pg, shell, browser, context, page;
let n = 0;
const pageErrors = [];
const svc = (sql, params = []) => asService(db, (tx) => tx.query(sql, params)).then((r) => r.rows);
const rows = (sql, params = []) => db.query(sql, params).then((r) => r.rows);
const one = async (sql, params = []) => (await rows(sql, params))[0];
async function until(fn, what, ms = 8000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error('timed out waiting for: ' + what);
    await new Promise((r) => setTimeout(r, 80));
  }
}
const shot = (name) => page.screenshot({ path: `${SHOTS}/${name}.png` });

// the customer writes (the bot's ingest function)
const customer = (user, name, over = {}) =>
  svc('select public.sale_line_ingest($1::jsonb) as r', [JSON.stringify({ channel_key: 'main', line_user_id: user, line_message_id: `M${++n}`, kind: 'text', body: 'สวัสดีค่ะ', name, ...over })]).then((r) => r[0].r);
// the bot's heartbeat, `ageSec` seconds ago
async function beat(mode, { ageSec = 0, detail = {} } = {}) {
  await svc(`select public.sale_line_beat('main', $1, 'abc1234', $2::jsonb)`, [mode, JSON.stringify(detail)]);
  if (ageSec) await db.query(`update sale_line_status set last_seen_at = now() - make_interval(secs => $1) where channel_key = 'main'`, [ageSec]);
}
// the bot takes what waits and reports LINE’s answer
async function bot(result, error = null, request = 'line-req') {
  const jobs = (await svc('select public.sale_line_claim(5, 90) as r'))[0].r;
  for (const j of jobs) await svc('select public.sale_line_finish($1::uuid, $2, $3, $4)', [j.id, result, error, request]);
  return jobs;
}
// what the page does on its own every few seconds, on demand
const refresh = async () => {
  await page.evaluate(() => window.NattaSaleOrders.line());
  await page.evaluate(() => window.NattaSaleOrders.tick());
};
const chips = () => page.locator('#so_chan .so-chip').allInnerTexts();
const openRow = (name) => page.locator('#so_items .so-row', { hasText: name }).click();
const chatTitle = () => page.locator('#so_chat .so-chn h2').innerText();
const msgsText = () => page.locator('#so_msgs').innerText();
const type = async (text) => {
  await page.locator('#so_txt').fill(text);
};
const waitText = (loc, re, what, ms = 10000) => until(async () => re.test(await page.locator(loc).innerText()), what, ms);

async function newContext(extra = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, ...extra });
  await routeOffline(ctx, pg.url);
  await ctx.addInitScript(
    ({ key, session }) => {
      try {
        localStorage.setItem(key, JSON.stringify(session));
      } catch (_) {
        /* about:blank has no storage */
      }
    },
    { key: `sb-${PROJECT_REF}-auth-token`, session: staffSession(staffJwt(STAFF, EMAIL), STAFF, EMAIL) },
  );
  return ctx;
}

before(async () => {
  if (!CHROMIUM) return;
  mkdirSync(SHOTS, { recursive: true });
  db = await openSaleDb({ line: true });
  await db.query(`insert into sale_threads (id, title, phone, source, stage, unread, last_text, last_at) values ($1, 'โรงเรียนบ้านตัวอย่าง', '053-000000', 'manual', 'talk', 0, 'เปิดในหลังร้าน', now() - interval '2 hours')`, [MANUAL]);
  pg = await startPgRest({ db, serviceKey: SERVICE });
  pg.storage.set('sale-order-files/line/main/IMG-A1.png', { bytes: PNG, contentType: 'image/png' });
  // a chat with several kinds of customer messages
  await customer(UA, 'คุณปู', { body: 'สวัสดีค่ะ อยากสั่งกระดาษ A4 ค่ะ', picture: 'https://example.invalid/p-a.png' });
  await customer(UA, 'คุณปู', { kind: 'image', body: '[รูปภาพ]', meta: { path: 'line/main/IMG-A1.png', name: 'รูปจากลูกค้า', size: PNG.length, type: 'image/png' } });
  await customer(UA, 'คุณปู', { kind: 'sticker', body: '[สติกเกอร์]', meta: { package_id: '1', sticker_id: '2' } });
  await customer(UA, 'คุณปู', { kind: 'location', body: '[ตำแหน่งที่ตั้ง] ร้านนัฐภรณ์ · เชียงกลาง', meta: { latitude: 19.3, longitude: 100.9 } });
  // a link with a full stop after it, and an HTML fragment that must stay plain text; a PDF the bot saved
  await customer(UA, 'คุณปู', { body: 'ดูที่ https://example.test/quote?id=7. และ <b>ตัวหนา</b> ค่ะ' });
  const PDF_BYTES = Buffer.from('%PDF-1.4\n% test\n', 'latin1');
  pg.storage.set('sale-order-files/line/main/PDF-A2.pdf', { bytes: PDF_BYTES, contentType: 'application/pdf' });
  await customer(UA, 'คุณปู', { kind: 'file', body: '[ไฟล์] ไวนิล.pdf', meta: { path: 'line/main/PDF-A2.pdf', name: 'ไวนิล.pdf', size: PDF_BYTES.length, type: 'application/pdf' } });
  await customer(UB, 'ครูสมศรี', { body: 'ขอใบเสนอราคาด้วยค่ะ' });
  shell = await serveMiniShell({ moduleCode: readFileSync(MODULE, 'utf8') });
  browser = await playwright().chromium.launch();
  context = await newContext();
  page = await context.newPage();
  page.on('pageerror', (e) => pageErrors.push(String(e.message || e)));
});
after(async () => {
  if (!CHROMIUM) return;
  await browser?.close();
  await shell?.close();
  await pg?.close();
  await db?.close();
});

test('no heartbeat from the bot: the page says LINE is not connected, shows the LINE chats with their kinds of message, and is honest about what a reply would do', skipIt, async () => {
  await page.goto(`${shell.url}/#saleorders`);
  await page.waitForSelector('#so_items .so-row');
  assert.deepEqual(await chips(), ['LINE OA: ยังไม่ได้เชื่อมต่อ', 'Facebook: ยังไม่ได้เชื่อมต่อ']);
  assert.equal(await page.locator('#so_items .so-row').count(), 3);
  const rowA = page.locator('#so_items .so-row', { hasText: 'คุณปู' });
  assert.equal(await rowA.locator('.so-src').innerText(), 'LINE');
  assert.equal(await page.locator('#so_items .so-row', { hasText: 'โรงเรียนบ้านตัวอย่าง' }).locator('.so-src').count(), 0, 'an in-shop chat has no LINE tag');
  // the LINE profile picture that cannot be loaded falls back to the initial
  await until(async () => (await rowA.locator('.so-av img').count()) === 0, 'the broken picture removed');
  assert.equal(await rowA.locator('.so-av').innerText(), 'ค');

  await openRow('คุณปู');
  await page.waitForSelector('#so_msgs .so-m');
  assert.match(await msgsText(), /อยากสั่งกระดาษ A4/);
  await page.waitForFunction(() => [...document.querySelectorAll('#so_msgs img.so-img')].some((i) => i.complete && i.naturalWidth > 0), null, { timeout: 10000 });
  assert.equal(await page.locator('#so_msgs .so-bub.ph', { hasText: '[สติกเกอร์]' }).count(), 1, 'a sticker is a faint note, not a message');
  assert.equal(await page.locator('#so_msgs a.so-file[href*="google.com/maps?q=19.3,100.9"]').count(), 1);
  // the link opens in a new tab and stops before the full stop; the HTML fragment is shown as typed, not as bold text
  const quote = page.locator('#so_msgs .so-bub a[href="https://example.test/quote?id=7"]');
  assert.equal(await quote.count(), 1, 'the link is clickable, without the full stop');
  assert.equal(await quote.getAttribute('target'), '_blank');
  assert.equal(await page.locator('#so_msgs .so-bub b').count(), 0, 'HTML in a message is never rendered');
  assert.match(await msgsText(), /<b>ตัวหนา<\/b>/);
  // a PDF from the customer is a button that opens it
  assert.equal(await page.locator('#so_msgs button.so-file', { hasText: 'ไวนิล.pdf' }).count(), 1, 'a PDF is a button to open it');
  assert.match(await page.locator('#so_chat .so-lnote').innerText(), /คำตอบของบอท.*LINE OA Manager.*ไม่ขึ้นเอง/);
  assert.equal(await page.locator('#so_lchip').innerText(), 'LINE OA: ยังไม่ได้เชื่อมต่อ');
  assert.match(await page.locator('#so_honest').innerText(), /ข้อความจะรอส่งได้ไม่เกิน 30 นาที/);
  await shot('line-1-not-connected');

  await openRow('โรงเรียนบ้านตัวอย่าง');
  await until(async () => (await chatTitle()) === 'โรงเรียนบ้านตัวอย่าง', 'the in-shop chat');
  assert.equal(await page.locator('#so_lchip').innerText(), 'บันทึกในระบบเท่านั้น');
  assert.match(await page.locator('#so_honest').innerText(), /แชตนี้ไม่ได้มาจาก LINE OA/);
  assert.equal(await page.locator('#so_chat .so-lnote').count(), 0);
  assert.deepEqual(pageErrors, []);
});

test('the chip follows the bot’s heartbeat: connected, trial, switched off, gone quiet — and nothing else', skipIt, async () => {
  await openRow('คุณปู');
  await until(async () => (await chatTitle()) === 'คุณปู', 'the LINE chat');
  await beat('on', { detail: { quota: { type: 'limited', limit: 300, used: 120, at: new Date().toISOString() } } });
  await refresh();
  assert.deepEqual(await chips(), ['LINE OA: เชื่อมต่อแล้ว', 'Facebook: ยังไม่ได้เชื่อมต่อ']);
  assert.equal(await page.locator('#so_chan .so-chip.ok').count(), 1);
  assert.match(await page.locator('#so_chan .so-chip.ok').getAttribute('title'), /โควตาข้อความ LINE เหลือประมาณ 180 จาก 300/);
  assert.equal(await page.locator('#so_lchip').innerText(), 'LINE OA: เชื่อมต่อแล้ว', 'the chat header follows too');
  const note = await page.locator('#so_honest').innerText();
  assert.match(note, /จะถูกส่งถึงลูกค้าทาง LINE OA และนับเป็น 1 ข้อความจากโควตา \(เหลือประมาณ 180 ข้อความ\)/);
  assert.match(note, /ขึ้นว่า "ส่งถึง LINE แล้ว" ก็ต่อเมื่อ LINE รับข้อความแล้วเท่านั้น/);

  await beat('pilot');
  await refresh();
  assert.equal((await chips())[0], 'LINE OA: ทดลอง');
  await beat('off');
  await refresh();
  assert.equal((await chips())[0], 'LINE OA: ปิดการรับ-ส่ง');
  await beat('on', { ageSec: 600 });
  await refresh();
  assert.equal((await chips())[0], 'LINE OA: ขาดการติดต่อ', 'ten minutes without a heartbeat is not “connected”');
  assert.match(await page.locator('#so_chan .so-chip').first().getAttribute('title'), /รายงานตัวล่าสุด/);
  await beat('on', { detail: { quota: { type: 'limited', limit: 300, used: 120 } } });
  await refresh();
  assert.equal((await chips())[0], 'LINE OA: เชื่อมต่อแล้ว');
  await shot('line-2-connected');
});

test('what the customer writes appears by itself; typing, focus and the place being read are not disturbed; reading clears the unread count', skipIt, async () => {
  // typing in the open chat while a new message arrives
  await page.locator('#so_txt').click();
  await type('ตอบไม่เสร็จ พิมพ์ค้างไว้');
  await customer(UA, 'คุณปู', { body: 'ขอราคาด้วยนะคะ' });
  await refresh();
  await waitText('#so_msgs', /ขอราคาด้วยนะคะ/, 'the new message');
  assert.equal(await page.locator('#so_txt').inputValue(), 'ตอบไม่เสร็จ พิมพ์ค้างไว้', 'what was being typed is still there');
  assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.id), 'so_txt', 'and the cursor is still in the box');
  await until(async () => (await one(`select t.unread from sale_threads t join sale_line_links k on k.thread_id = t.id where k.line_user_id = $1`, [UA])).unread === 0, 'read');
  await type('');

  // another customer writes: their row shows the unread count and goes to the top; a customer never seen before gets a row
  await customer(UB, 'ครูสมศรี', { body: 'ส่งใบเสนอราคาให้หน่อยค่ะ' });
  await customer(UD, 'คุณใหม่', { body: 'ร้านเปิดกี่โมงคะ' });
  await refresh();
  await until(async () => (await page.locator('#so_items .so-row').count()) === 4, 'the new customer’s row');
  const first = page.locator('#so_items .so-row').first();
  assert.match(await first.innerText(), /คุณใหม่/, 'the newest conversation is on top');
  const rowB = page.locator('#so_items .so-row', { hasText: 'ครูสมศรี' });
  assert.equal(await rowB.locator('.so-unread').innerText(), '2');
  assert.deepEqual(await page.locator('#so_tabs .so-tab').allInnerTexts(), ['ทั้งหมด (4)', 'รอตอบ (2)', 'กำลังสั่งงาน (0)', 'เสร็จแล้ว (0)']);

  // reading older messages: a new message does not pull the screen to the bottom; at the bottom it follows
  for (let i = 1; i <= 40; i++) await customer(UC, 'คุณเอ', { body: `ข้อความที่ ${i} ของคุณเอ` });
  await refresh();
  await openRow('คุณเอ');
  await waitText('#so_msgs', /ข้อความที่ 40/, 'the long chat');
  await page.evaluate(() => { const m = document.getElementById('so_msgs'); m.scrollTop = m.scrollHeight; });
  await customer(UC, 'คุณเอ', { body: 'ข้อความท้ายสุด 1' });
  await refresh();
  await waitText('#so_msgs', /ข้อความท้ายสุด 1/, 'the new message at the bottom');
  assert.ok(await page.evaluate(() => { const m = document.getElementById('so_msgs'); return m.scrollHeight - m.scrollTop - m.clientHeight < 80; }), 'at the bottom: it follows the new message');
  await page.evaluate(() => { document.getElementById('so_msgs').scrollTop = 0; });
  await customer(UC, 'คุณเอ', { body: 'ข้อความท้ายสุด 2' });
  await refresh();
  await waitText('#so_msgs', /ข้อความท้ายสุด 2/, 'the second new message');
  assert.ok(await page.evaluate(() => document.getElementById('so_msgs').scrollTop < 80), 'reading from the top: the screen stays where it was');
  assert.deepEqual(pageErrors, []);
});

test('a reply: “waiting” until the bot says LINE accepted it, and only then “sent”; a double click is one message; nothing says it was sent before', skipIt, async () => {
  await openRow('คุณปู');
  await until(async () => (await chatTitle()) === 'คุณปู', 'the chat');
  const flashSays = (re) => page.waitForFunction((src) => [...document.querySelectorAll('#so_root .so-flash')].some((el) => new RegExp(src).test(el.innerText)), re.source, { timeout: 10000 });
  await type('รับทราบค่ะ เดี๋ยวแจ้งราคาให้นะคะ');
  await page.locator('#so_chat [data-a="send"]').dblclick();
  await flashSays(/เข้าคิวส่งทาง LINE แล้ว/);
  assert.equal(await page.locator('#so_txt').inputValue(), '');
  const q = await rows(`select o.*, m.meta from sale_line_out o join sale_msgs m on m.id = o.msg_id where o.body = 'รับทราบค่ะ เดี๋ยวแจ้งราคาให้นะคะ'`);
  assert.equal(q.length, 1, 'one message, however many clicks');
  assert.deepEqual([q[0].status, q[0].meta.delivery, q[0].created_by], ['queued', 'queued', 'ying']);
  const bubble = page.locator('#so_msgs .so-m.out', { hasText: 'รับทราบค่ะ เดี๋ยวแจ้งราคาให้นะคะ' });
  assert.match(await bubble.locator('.so-dl.wait').innerText(), /รอส่งทาง LINE… ยังไม่ถือว่าส่งถึงลูกค้า/);
  assert.doesNotMatch(await msgsText(), /ส่งถึง LINE แล้ว|ส่งสำเร็จ|ส่งแล้ว/, 'no message claims a send that has not been confirmed');
  assert.doesNotMatch(await page.locator('#so_root .so-flashbox').first().innerText(), /ส่งถึง LINE แล้ว|ส่งสำเร็จ|ส่งแล้ว/);
  await shot('line-3-waiting');

  await bot('sent', null, 'line-req-77');
  await refresh();
  await until(async () => /ส่งถึง LINE แล้ว \(LINE รับข้อความแล้ว\)/.test(await bubble.innerText()), 'confirmed');
  assert.equal(await bubble.locator('.so-dl.ok').count(), 1);
  assert.equal(await bubble.locator('button').count(), 0, 'nothing to send again');
  assert.equal((await one('select line_request_id from sale_line_out where id = $1', [q[0].id])).line_request_id, 'line-req-77');
  await shot('line-4-sent');
});

test('LINE refuses: the page says so and why, never “sent”; staff send it again; a reply that waited too long says it was not sent', skipIt, async () => {
  await type('ลองตอบอีกข้อความ');
  await page.locator('#so_chat [data-a="send"]').click();
  const bubble = page.locator('#so_msgs .so-m.out', { hasText: 'ลองตอบอีกข้อความ' });
  await bubble.waitFor();
  await bot('failed', '429 You have reached your monthly limit.');
  await refresh();
  await until(async () => (await bubble.locator('.so-dl.bad').count()) === 1, 'the refusal');
  assert.match(await bubble.innerText(), /ส่งไม่สำเร็จ: 429 You have reached your monthly limit\./);
  assert.doesNotMatch(await bubble.innerText(), /ส่งถึง LINE แล้ว/);
  await shot('line-5-failed');
  await bubble.locator('button', { hasText: 'ส่งใหม่' }).click();
  await until(async () => (await bubble.locator('.so-dl.wait').count()) === 1, 'queued again');
  assert.equal((await one(`select status from sale_line_out where body = 'ลองตอบอีกข้อความ'`)).status, 'queued');
  await bot('sent', null, 'line-req-78');
  await refresh();
  await until(async () => (await bubble.locator('.so-dl.ok').count()) === 1, 'sent the second time');

  // 30 minutes without the bot taking it
  await type('ตอบช้าเกินไป');
  await page.locator('#so_chat [data-a="send"]').click();
  const late = page.locator('#so_msgs .so-m.out', { hasText: 'ตอบช้าเกินไป' });
  await late.waitFor();
  await db.query(`update sale_line_out set expires_at = now() - interval '1 minute' where body = 'ตอบช้าเกินไป'`);
  await bot('sent');
  await refresh();
  await until(async () => (await late.locator('.so-dl.bad').count()) === 1, 'expired');
  assert.match(await late.innerText(), /ไม่ได้ส่ง: รอเกิน 30 นาที/);
  assert.equal((await one(`select status from sale_line_out where body = 'ตอบช้าเกินไป'`)).status, 'expired');
});

test('a message the server refuses stays in the box and nothing is queued; an attachment in a LINE chat is kept as an internal note, not shown as sent', skipIt, async () => {
  const queued = (await one('select count(*)::int n from sale_line_out')).n;
  await type('ก'.repeat(5001));
  await page.locator('#so_chat [data-a="send"]').click();
  await page.waitForFunction(() => [...document.querySelectorAll('#so_root .so-flash.bad')].some((el) => /5,000/.test(el.innerText)), null, { timeout: 10000 });
  assert.equal((await page.locator('#so_txt').inputValue()).length, 5001, 'the text is still there');
  assert.equal((await one('select count(*)::int n from sale_line_out')).n, queued);
  await type('');

  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#so_chat [data-a="chatattach"]').click()]);
  await chooser.setFiles({ name: 'ตัวอย่าง.png', mimeType: 'image/png', buffer: PNG });
  await page.waitForFunction(() => [...document.querySelectorAll('#so_root .so-flash')].some((el) => /เป็นโน้ตภายใน — ไม่ได้ส่งถึงลูกค้า/.test(el.innerText)), null, { timeout: 10000 });
  const m = await one(`select dir, kind, meta from sale_msgs where body = 'ตัวอย่าง.png'`);
  assert.deepEqual([m.dir, m.kind], ['note', 'image']);
  assert.equal((await one('select count(*)::int n from sale_line_out')).n, queued, 'no send was queued for it');
});

test('the summary of an order can go by LINE: it waits for LINE, the order’s history gets the result once it is known, and when the bot is quiet the page offers no send', skipIt, async () => {
  await openRow('คุณปู');
  await until(async () => (await chatTitle()) === 'คุณปู', 'the chat');
  const t = (await one(`select thread_id from sale_line_links where line_user_id = $1`, [UA])).thread_id;
  const saved = await asStaff(db, (tx) => tx.query('select public.sale_order_save($1::jsonb) as r', [JSON.stringify({ thread_id: t, client_token: 'line-page-order-1', customer_name: 'คุณปู', by_name: 'ying', items: [{ name: 'กระดาษถ่ายเอกสาร A4 80 แกรม', qty: 10, unit: 'รีม', unit_price: 135 }] })])).then((r) => r.rows[0].r);
  const orderId = saved.order.id;
  await page.evaluate((id) => window.NattaSaleOrders.open(id, true), t);
  await page.waitForSelector('#so_ord [data-a="summary"]:not([disabled])');

  // the bot has gone quiet: nothing to press
  await beat('on', { ageSec: 900 });
  await refresh();
  await page.locator('#so_ord [data-a="summary"]').click();
  await page.waitForSelector('#so_modal #so_sumtxt');
  assert.match(await page.locator('#so_modal .chan').innerText(), /ส่งทาง LINE OA\s*ขาดการติดต่อ/);
  assert.equal(await page.locator('#so_modal [data-a="sumline"]').count(), 0);
  await page.locator('#so_modal [data-a="mclose"]').first().click();

  // connected: send it
  await beat('on');
  await refresh();
  await page.locator('#so_ord [data-a="summary"]').click();
  await page.waitForSelector('#so_modal [data-a="sumline"]');
  await page.locator('#so_modal [data-a="sumline"]').click();
  await page.waitForSelector('#so_modal .lstat.wait');
  assert.match(await page.locator('#so_modal .lstat').innerText(), /เข้าคิวส่งทาง LINE แล้ว — รอ LINE รับข้อความ \(ยังไม่ถือว่าส่งถึงลูกค้า\)/);
  const out = await one(`select * from sale_line_out where order_id = $1`, [orderId]);
  assert.equal(out.status, 'queued');
  assert.match(out.body, /สรุปใบสั่งงาน — นัฐภรณ์ เชียงกลาง/);
  assert.equal((await rows(`select 1 from sale_order_events where order_id = $1 and kind = 'send'`, [orderId])).length, 0, 'no history entry for a send that has not happened');
  assert.equal(await page.locator('#so_modal [data-a="setawait"]').count(), 0, 'and no “waiting for the customer” shortcut yet');
  await shot('line-6-summary-waiting');

  await bot('sent', null, 'line-req-sum');
  await refresh();
  await page.waitForSelector('#so_modal .lstat.ok');
  assert.match(await page.locator('#so_modal .lstat').innerText(), /ส่งถึง LINE แล้ว \(LINE รับข้อความแล้ว\)/);
  const ev = await rows(`select detail from sale_order_events where order_id = $1 and kind = 'send'`, [orderId]);
  assert.equal(ev.length, 1);
  assert.deepEqual([ev[0].detail.channel, ev[0].detail.ok, ev[0].detail.out_status], ['line', true, 'sent']);
  assert.equal(await page.locator('#so_modal [data-a="setawait"]').count(), 1, 'now the shortcut is offered');
  await shot('line-7-summary-sent');
});

test('on a phone: the LINE chat list and room fit the screen and nothing scrolls sideways', skipIt, async () => {
  const ctx = await newContext({ viewport: { width: 390, height: 800 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  try {
    await p.goto(`${shell.url}/#saleorders`);
    await p.waitForSelector('#so_items .so-row');
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'the list does not scroll sideways');
    assert.ok((await p.locator('#so_items .so-row .so-src').count()) >= 3);
    await p.locator('#so_items .so-row', { hasText: 'คุณปู' }).click();
    await p.waitForSelector('#so_msgs .so-m');
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'neither does the room');
    assert.equal(await p.locator('#so_lchip').innerText(), 'LINE OA: เชื่อมต่อแล้ว');
    await p.screenshot({ path: `${SHOTS}/line-8-phone-room.png` });
  } finally {
    await ctx.close();
  }
});

test('a reply typed in LINE OA Manager is logged into the chat with one click: it shows as answered there, is not sent from the page and is not queued for LINE', skipIt, async () => {
  const text = 'แผ่นละ 50 บาทค่ะ (ตอบใน OA Manager)';
  await page.goto(`${shell.url}/#saleorders`);
  await page.reload(); // the earlier tests leave an order open on this page; start from the list
  await page.waitForSelector('#so_items .so-row');
  await openRow('คุณปู');
  await page.waitForSelector('#so_msgs .so-m');
  await page.locator('#so_chat [data-a="oalog"]').click();
  await page.locator('#so_txt').fill(text);
  assert.match(await page.locator('#so_honest').innerText(), /ไม่ถูกส่งถึงลูกค้าจากหน้านี้/, 'the hint under the box says it is not sent');
  await page.locator('#so_chat button.so-send').click();
  await page.waitForFunction(() => /ตอบใน LINE OA Manager/.test(document.querySelector('#so_msgs')?.innerText || ''), null, { timeout: 10000 });
  assert.match(await page.locator('#so_msgs').innerText(), /ไม่ได้ส่งจากหน้านี้/, 'the message says it was not sent from the page');
  assert.equal(await page.locator('#so_msgs .so-m.out', { hasText: text }).count(), 1, 'it is one message in the chat');
  const saved = await rows(`select meta->>'src' as src, meta->>'delivery' as d from sale_msgs where body = $1`, [text]);
  assert.deepEqual(saved.map((r) => [r.src, r.d]), [['oa_manager', 'logged']]);
  assert.equal((await rows(`select count(*)::int as n from sale_line_out where body = $1`, [text]))[0].n, 0, 'nothing is queued for LINE');
  await shot('line-9-log-oa-manager');
});

test('ยอดปิดงาน: closed orders are added up in total and by the person responsible; delivered-but-not-closed is shown apart', skipIt, async () => {
  const th = await one(`select id from sale_threads where title = 'คุณปู' limit 1`);
  const order = (no, total, job, assignee, closedDays) =>
    db.query(
      `insert into sale_orders (thread_id, order_no, customer_name, total, job_status, assignee, closed_at, client_token, created_by, order_date)
       values ($1, $2, 'คุณปู', $3, $4, $5, case when $6::int is null then null else now() - make_interval(days => $6::int) end, $2, 'หญิง', current_date)`,
      [th.id, no, total, job, assignee || null, closedDays],
    );
  await order('ORD-SUM-1', 1000, 'closed', 'หญิง', 0);
  await order('ORD-SUM-2', 2500, 'closed', 'ฟิล์ม', 0);
  await order('ORD-SUM-3', 300, 'closed', null, 40);
  await order('ORD-SUM-4', 700, 'delivered', 'หญิง', null);
  await page.goto(`${shell.url}/#saleorders`);
  await page.reload(); // start from the list
  await page.waitForSelector('#so_items .so-row');
  await page.locator('#so_root [data-a="closedsum"]').click();
  await page.waitForSelector('#so_modal .rcpt');
  assert.match(await page.locator('#so_modal .rcpt').innerText(), /ปิดงานแล้ว 2 ใบ · รวม 3,500\.00 บาท/, 'this month: two closed orders');
  const people = await page.locator('#so_modal table').first().locator('tbody tr').allInnerTexts();
  assert.deepEqual(people.map((t) => t.replace(/\s+/g, ' ').trim()), ['ฟิล์ม 1 2,500.00', 'หญิง 1 1,000.00'], 'per person, the largest first');
  assert.match(await page.locator('#so_modal').innerText(), /ส่งมอบแล้ว รอปิดงาน 1 ใบ · 700\.00 บาท/, 'delivered but not closed, shown apart');
  await page.locator('#so_modal [data-a="cspan"][data-p="all"]').click();
  await page.waitForFunction(() => /ปิดงานแล้ว 3 ใบ/.test(document.querySelector('#so_modal .rcpt')?.innerText || ''), null, { timeout: 10000 });
  const all = await page.locator('#so_modal table').first().locator('tbody tr').allInnerTexts();
  assert.deepEqual(all.map((t) => t.replace(/\s+/g, ' ').trim()), ['ฟิล์ม 1 2,500.00', 'หญิง 1 1,000.00', 'ไม่ระบุผู้รับผิดชอบ 1 300.00'], 'all time: the order without a person is listed too');
  await shot('line-10-closed-sum');
});
