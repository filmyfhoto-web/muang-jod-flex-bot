// "แชตและออเดอร์" in a browser: the module from this repo, in the stand-in shell (db/helpers/mini-shell.js — the same contract the
// live back office gives its modules), with supabase-js talking to a real PostgreSQL (PGlite, production-shaped, migration 002
// applied) through the PostgREST stand-in. Covers the owner's checks: switching customers, totals, a double save, a failed send,
// the summary's honest channels, closing with a balance due, a slip that does not mark the order paid, school prices,
// permissions, and the phone layout. Screenshots go to $SALE_ORDERS_SHOTS (default: <tmp>/sale-orders-shots).
//   Run: cd stationery-bot/db && node --test test/sale-orders-page.ui.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openSaleDb } from '../helpers/sale-db.js';
import { STAFF } from '../helpers/shop-db.js';
import { startPgRest, staffJwt } from '../helpers/pg-rest.js';
import { playwright, staffSession, routeOffline, PROJECT_REF } from '../helpers/back-office.js';
import { serveMiniShell } from '../helpers/mini-shell.js';

const MODULE = fileURLToPath(new URL('../../app-patches/sale-orders-page/saleorders.module.js', import.meta.url));
const SHOTS = process.env.SALE_ORDERS_SHOTS || join(tmpdir(), 'sale-orders-shots');
const SERVICE = 'svc-service-key';
const EMAIL = 'ying@natta.test';

const CL = '22222222-2222-4222-8222-2222222222c1';
const PR = '22222222-2222-4222-8222-2222222222b2';
const P1 = '33333333-3333-4333-8333-333333333301';
const P2 = '33333333-3333-4333-8333-333333333302';
const P3 = '33333333-3333-4333-8333-333333333303';
const P4 = '33333333-3333-4333-8333-333333333304';
const C1 = '44444444-4444-4444-8444-444444444401';
const C2 = '44444444-4444-4444-8444-444444444402';
const S1 = '55555555-5555-4555-8555-555555555501';
const S2 = '55555555-5555-4555-8555-555555555502';
const T = (n) => `66666666-6666-4666-8666-66666666660${n}`;

// The whole bot suite (npm test) runs this file too: without a Chromium it is skipped, not failed
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
const pageErrors = [];
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
const flashSays = (re) => page.waitForFunction((src) => [...document.querySelectorAll('#so_root .so-flash')].some((el) => new RegExp(src).test(el.innerText)), re.source, { timeout: 10000 });
const shot = (p, name) => p.screenshot({ path: `${SHOTS}/${name}.png` });
const chatTitle = () => page.locator('#so_chat .so-chn h2').innerText();
const openRow = (name) => page.locator('#so_items .so-row', { hasText: name }).click();
const ordRows = () => page.locator('#so_ord tbody tr:has([data-f="iname"])');
const openMore = async () => { const d = page.locator('#so_ord details.so-more').first(); if ((await d.count()) && !(await d.evaluate((el) => el.open))) await d.locator('summary').click(); };

// two product photos for the chat, drawn in the browser (the PostgREST stand-in keeps the files in memory)
async function drawPhotos(b) {
  const p = await b.newPage({ viewport: { width: 360, height: 300 } });
  const draw = async (html) => {
    await p.setContent(`<body style="margin:0"><div id="a" style="width:360px;height:300px;display:grid;place-items:center;background:linear-gradient(160deg,#f4efe6,#d9d2c4)">${html}</div></body>`);
    return p.locator('#a').screenshot({ type: 'png' });
  };
  const a4 = await draw(`<div style="position:relative;width:230px;height:150px;transform:rotate(-8deg)">
    <div style="position:absolute;inset:0;background:#fff;border-radius:8px;box-shadow:0 18px 30px rgba(0,0,0,.25)"></div>
    <div style="position:absolute;left:18px;top:26px;font:800 64px Arial;color:#1d3f8a">A4</div>
    <div style="position:absolute;left:22px;top:100px;font:600 20px Arial;color:#3d5ea8">80 gsm · 500</div></div>`);
  const pens = await draw(`<div style="display:flex;gap:14px;transform:rotate(-12deg)">${['#1f4fd1', '#1f4fd1', '#1f4fd1', '#d62a2a', '#d62a2a', '#d62a2a']
    .map((c) => `<div style="width:16px;height:220px;border-radius:8px;background:linear-gradient(90deg,rgba(255,255,255,.6),rgba(255,255,255,.15));border:2px solid ${c};position:relative"><div style="position:absolute;top:-6px;left:-2px;width:16px;height:46px;border-radius:6px;background:${c}"></div></div>`)
    .join('')}</div>`);
  await p.close();
  return { a4, pens };
}

async function newContext(extra = {}, { signedIn = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, permissions: ['clipboard-read', 'clipboard-write'], ...extra });
  await routeOffline(ctx, pg.url);
  if (signedIn) {
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
  }
  return ctx;
}

before(async () => {
  if (!CHROMIUM) return;
  mkdirSync(SHOTS, { recursive: true });
  db = await openSaleDb({ cards: true, assignee: true, tags: true, line: true, autolink: true });
  await db.query(`insert into stores (id, name, vat_rate, doc_prefix) values ($1, 'นัฐภรณ์ คัลเลอร์แล็ป', 7, 'RC-CL'), ($2, 'นัฐภรณ์ การพิมพ์', 0, 'RC-PR')`, [CL, PR]);
  await db.query(
    `insert into products (id, code, name, unit, price, stock_qty, tier_prices) values
      ($1, 'A4-80', 'กระดาษถ่ายเอกสาร A4 80 แกรม', 'รีม', 135, 50, '{"20s": 140}'),
      ($2, 'A4-C', 'กระดาษ A4 คละสี', 'รีม', 160, 20, null),
      ($3, 'GEL-B', 'ปากกาเจล สีน้ำเงิน', 'โหล', 120, 30, null),
      ($4, 'GEL-R', 'ปากกาเจล สีแดง', 'โหล', 120, 30, null)`,
    [P1, P2, P3, P4],
  );
  await db.query(`insert into customers (id, name, phone) values ($1, 'โรงเรียนบ้านตัวอย่าง', '053-000000'), ($2, 'โรงเรียนวัดใหม่', '053-111111')`, [C1, C2]);
  await db.query(`insert into schools (id, name, slug, markup_pct, round_to) values ($1, 'โรงเรียนบ้านตัวอย่าง', 'bantuayang', 10, 1), ($2, 'โรงเรียนวัดใหม่', 'watmai', 5, 1)`, [S1, S2]);
  const thread = (n, customer, title, phone, stage, unread, last, minsAgo) =>
    db.query(`insert into sale_threads (id, customer_id, title, phone, stage, unread, last_text, last_at) values ($1, $2, $3, $4, $5, $6, $7, now() - make_interval(mins => $8))`,
      [T(n), customer, title, phone, stage, unread, last, minsAgo]);
  await thread(1, C1, 'โรงเรียนบ้านตัวอย่าง', '053-000000', 'talk', 2, 'ขอใบเสนอราคาด้วยนะคะ ขอบคุณค่ะ', 6);
  await thread(2, C2, 'โรงเรียนวัดใหม่', '053-111111', 'talk', 1, 'สั่งพิมพ์เอกสารเพิ่มเติมค่ะ', 30);
  await thread(3, null, 'คุณสุภาวดี (ร้านหนังสือ)', null, 'talk', 1, 'มีปากกาเจลสีน้ำเงินแบบแพ็กไหมคะ', 45);
  await thread(4, null, 'บริษัท เอ.บี. เทรดดิ้ง จำกัด', null, 'quote', 0, 'ขอใบเสนอราคากระดาษ A4 10 รีมค่ะ', 60 * 26);
  await thread(5, null, 'โรงเรียนหนองไผ่', null, 'done', 0, 'งานพิมพ์ปกแบบฝึกหัด 200 เล่มค่ะ', 60 * 27);
  await thread(6, null, 'คุณกิตติ', null, 'talk', 0, 'รับของได้วันไหนครับ', 60 * 24 * 5);
  await db.query(`insert into sale_threads (id, title, source, stage, unread, last_text, last_at) values ($1, 'ริงโกลาเฟ009', 'line', 'talk', 1, 'สนใจค่ะ', now() - make_interval(mins => 2))`, [T(7)]);
  await db.query(`insert into sale_line_links (thread_id, channel_key, line_user_id, line_name) values ($1, 'main', 'U-ringolafe009', 'ริงโกลาเฟ009')`, [T(7)]);
  const msg = (n, dir, body, minsAgo, kind = 'text', meta = null, by = null) =>
    db.query(`insert into sale_msgs (thread_id, dir, kind, body, meta, by_name, created_at) values ($1, $2, $3, $4, $5, $6, now() - make_interval(secs => $7))`,
      [T(n), dir, kind, body, meta && JSON.stringify(meta), by, Math.round(minsAgo * 60)]);
  await msg(1, 'in', 'สวัสดีค่ะ ทางโรงเรียนต้องการสั่งซื้อเครื่องเขียนสำหรับใช้ในภาคเรียนใหม่ค่ะ', 25);
  await msg(1, 'in', 'รายการที่ต้องการมีดังนี้ค่ะ\n• กระดาษถ่ายเอกสาร A4 80 แกรม 10 รีม\n• กระดาษ A4 คละสี 5 รีม\n• ปากกาเจล สีน้ำเงิน 3 โหล\n• ปากกาเจล สีแดง 2 โหล\nไม่ทราบว่ามีของพร้อมส่งไหมคะ และขอใบเสนอราคาด้วยได้ไหมคะ', 24);
  await msg(1, 'in', 'a4.png', 23.5, 'image', { path: `chat/${T(1)}/a4.png`, name: 'a4.png', type: 'image/png' });
  await msg(1, 'in', 'pens.png', 23.4, 'image', { path: `chat/${T(1)}/pens.png`, name: 'pens.png', type: 'image/png' });
  await msg(1, 'out', 'สวัสดีค่ะ ขอบคุณที่ติดต่อ NATTA GROUP นะคะ สินค้าที่แจ้งมามีพร้อมส่งค่ะ เดี๋ยวแอดมินจัดทำใบเสนอราคาให้เลยนะคะ', 15, 'text', null, 'หญิง');
  await msg(1, 'in', 'ขอใบเสนอราคาด้วยนะคะ ขอบคุณค่ะ', 6);
  await msg(2, 'in', 'สั่งพิมพ์เอกสารเพิ่มเติมค่ะ', 30);
  await msg(6, 'in', 'รับของได้วันไหนครับ', 60 * 24 * 5);

  pg = await startPgRest({ db, serviceKey: SERVICE });
  shell = await serveMiniShell({ moduleCode: readFileSync(MODULE, 'utf8') });
  browser = await playwright().chromium.launch();
  const photos = await drawPhotos(browser);
  pg.storage.set(`sale-order-files/chat/${T(1)}/a4.png`, { bytes: photos.a4, contentType: 'image/png' });
  pg.storage.set(`sale-order-files/chat/${T(1)}/pens.png`, { bytes: photos.pens, contentType: 'image/png' });
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

test('the list shows the chats from the database with real counts, the menu entry, and the honest channel state', skipIt, async () => {
  await page.goto(`${shell.url}/#saleorders`);
  await page.waitForSelector('#so_items .so-row');
  assert.deepEqual(await page.evaluate(() => [typeof window.ROUTES, typeof window.VIEWS, typeof window.sb]), ['undefined', 'undefined', 'undefined'], 'as in the live shell, ROUTES / VIEWS / sb are const (not window properties) — and the page still works');
  assert.equal(await page.locator('#so_items .so-row').count(), 7);
  const tabs = await page.locator('#so_tabs .so-tab').allInnerTexts();
  assert.deepEqual(tabs, ['ทั้งหมด (7)', 'รอตอบ (4)', 'กำลังสั่งงาน (1)', 'เสร็จแล้ว (1)']);
  assert.deepEqual(await page.locator('.so-chan .so-chip').allInnerTexts(), ['LINE OA: ยังไม่ได้เชื่อมต่อ', 'Facebook: ยังไม่ได้เชื่อมต่อ']);
  assert.deepEqual(await page.locator('#nav a').allInnerTexts(), ['หน้าหลัก', 'แชทขายสินค้า', 'แชตและออเดอร์', 'ออเดอร์ทั้งหมด'], 'the page sits next to the old chat page, which stays');
  await page.locator('#so_q').fill('วัดใหม่');
  assert.equal(await page.locator('#so_items .so-row').count(), 1);
  await page.locator('#so_q').fill('');
  await page.locator('#so_tabs .so-tab', { hasText: 'รอตอบ' }).click();
  assert.equal(await page.locator('#so_items .so-row').count(), 4);
  await page.locator('#so_tabs .so-tab', { hasText: 'ทั้งหมด' }).click();
  assert.deepEqual(pageErrors, []);
});

test('opening a chat shows its messages and photos, clears its unread count, and opens a new order for that customer', skipIt, async () => {
  await openRow('โรงเรียนบ้านตัวอย่าง');
  await page.waitForSelector('#so_msgs .so-m');
  assert.match(await page.locator('#so_msgs').innerText(), /รายการที่ต้องการมีดังนี้ค่ะ/);
  await page.waitForFunction(() => [...document.querySelectorAll('#so_msgs img.so-img')].filter((i) => i.complete && i.naturalWidth > 0).length === 2, null, { timeout: 10000 });
  await until(async () => (await one('select unread from sale_threads where id = $1', [T(1)])).unread === 0, 'unread cleared');
  await page.waitForSelector('#so_cn');
  assert.equal(await page.locator('#so_cn').inputValue(), 'โรงเรียนบ้านตัวอย่าง');
  assert.equal(await page.locator('#so_ord input[data-f="phone"]').inputValue(), '053-000000');
  assert.match(await page.locator('#so_ord .so-ohd').innerText(), /ใบใหม่ ยังไม่บันทึก/);
  assert.equal(await page.locator('#so_ord [data-a="summary"]').isDisabled(), true, 'nothing to send before it is saved');
  await openMore();
  assert.equal(await page.locator('#so_ord .so-seg button.on').innerText(), 'สั่งเพื่อจัดสินค้า');
  assert.equal(await page.locator('#so_ord .so-dirty').count(), 0, 'a fresh order is not "unsaved changes"');
});

test('"สร้างรายการจากแชต" reads the customer’s list for the staff to check; nothing is saved until they add it and save', skipIt, async () => {
  await page.locator('#so_ord [data-a="parsechat"]').click();
  await page.waitForSelector('#so_modal');
  await page.waitForFunction(() => document.querySelectorAll('#so_modal .bound').length === 4, null, { timeout: 10000 });
  const names = await page.locator('#so_modal input[data-pf="name"]').evaluateAll((els) => els.map((e) => e.value));
  assert.deepEqual(names, ['กระดาษถ่ายเอกสาร A4 80 แกรม', 'กระดาษ A4 คละสี', 'ปากกาเจล สีน้ำเงิน', 'ปากกาเจล สีแดง']);
  const qty = await page.locator('#so_modal input[data-pf="qty"]').evaluateAll((els) => els.map((e) => e.value));
  assert.deepEqual(qty, ['10', '5', '3', '2']);
  assert.equal((await one('select count(*)::int n from sale_orders')).n, 0, 'nothing is created by reading the chat');
  await page.locator('#so_modal [data-a="parseadd"]').click();
  await until(async () => (await ordRows().count()) === 4, 'four lines in the order');
  assert.equal(await page.locator('[data-sum="sub"]').innerText(), '2,750.00');
  assert.equal(await page.locator('[data-sum="total"]').innerText(), '2,750.00 บาท');
  const vatOptions = await page.locator('#so_ord select[data-f="vat"] option').allInnerTexts();
  assert.deepEqual(vatOptions, ['ไม่คิด VAT', 'VAT 7% · นัฐภรณ์ คัลเลอร์แล็ป'], 'only the shop’s real VAT setting is offered');
  await page.locator('#so_ord select[data-f="vat"]').selectOption(CL);
  assert.equal(await page.locator('[data-sum="vat"]').innerText(), '192.50');
  assert.equal(await page.locator('[data-sum="total"]').innerText(), '2,942.50 บาท');
  assert.equal(await page.locator('#so_ord .so-dirty[role="status"]').count(), 1, 'unsaved changes are shown');
  assert.equal((await one('select count(*)::int n from sale_orders')).n, 0);
});

test('switching to another chat with unsaved changes asks first; the draft comes back with its own chat', skipIt, async () => {
  await openRow('คุณกิตติ');
  await page.waitForSelector('#so_modal');
  assert.match(await page.locator('#so_modal').innerText(), /ยังไม่ได้บันทึกใบสั่งงาน/);
  await page.locator('#so_modal button', { hasText: 'อยู่ต่อ' }).click();
  assert.equal(await chatTitle(), 'โรงเรียนบ้านตัวอย่าง');
  await openRow('คุณกิตติ');
  await page.locator('#so_modal button', { hasText: 'เก็บร่างแล้วย้าย' }).click();
  await until(async () => (await chatTitle()) === 'คุณกิตติ', 'the other chat');
  await page.waitForSelector('#so_cn');
  assert.equal(await page.locator('#so_cn').inputValue(), 'คุณกิตติ', 'its own customer, not the previous one');
  assert.equal(await ordRows().count(), 0);
  await openRow('โรงเรียนบ้านตัวอย่าง');
  await until(async () => (await chatTitle()) === 'โรงเรียนบ้านตัวอย่าง' && (await ordRows().count()) === 4, 'the draft back');
  assert.equal(await page.locator('[data-sum="total"]').innerText(), '2,942.50 บาท');
  assert.equal(await page.locator('#so_ord .so-dirty[role="status"]').count(), 1);
});

test('saving, even with a double click, makes one order whose totals the server worked out', skipIt, async () => {
  await page.locator('#so_ord [data-a="save"]').dblclick();
  await flashSays(/บันทึกแล้ว · ORD-\d{4}-00001/);
  const list = await rows('select * from sale_orders where thread_id = $1', [T(1)]);
  assert.equal(list.length, 1, 'one order only');
  const o = list[0];
  const { yr } = await one(`select (extract(year from now() at time zone 'Asia/Bangkok') + 543)::int as yr`);
  assert.equal(o.order_no, `ORD-${yr}-00001`);
  assert.deepEqual([Number(o.subtotal), Number(o.vat_rate), Number(o.vat_amount), Number(o.total)], [2750, 7, 192.5, 2942.5]);
  assert.equal(o.vat_store_id, CL);
  assert.equal(o.created_by, 'ying');
  assert.equal((await one('select count(*)::int n from sale_order_items where order_id = $1', [o.id])).n, 4);
  assert.equal((await one('select count(*)::int n from sale_order_events where order_id = $1', [o.id])).n, 1);
  assert.equal(await page.locator('#so_ord [data-a="summary"]').isDisabled(), false);
  assert.match(await page.locator('[data-sum="hint"]').innerText(), /ยอดตรวจและบันทึกฝั่งเซิร์ฟเวอร์แล้ว/);
  assert.equal(await page.locator('#so_ord .so-dirty').count(), 0);
  assert.match(await page.locator('#so_tabs').innerText(), /กำลังสั่งงาน \(2\)/, 'the open order counts in the tab');
  await page.locator('#so_items .so-row', { hasText: 'โรงเรียนบ้านตัวอย่าง' }).locator('.so-chip', { hasText: 'รอดำเนินการ' }).waitFor();
  await shot(page, 'desktop-1-order-saved');
});

test('a message that cannot be saved stays in the box and says so; a saved one says it has not reached the customer', skipIt, async () => {
  const before = (await one('select count(*)::int n from sale_msgs where thread_id = $1', [T(1)])).n;
  await db.exec('revoke insert on public.sale_msgs from authenticated');
  try {
    await page.locator('#so_txt').fill('รับทราบค่ะ เดี๋ยวส่งใบเสนอราคาให้นะคะ');
    await page.locator('#so_chat [data-a="send"]').click();
    await flashSays(/บันทึกไม่สำเร็จ ข้อความยังอยู่ในช่องพิมพ์/);
    assert.equal(await page.locator('#so_txt').inputValue(), 'รับทราบค่ะ เดี๋ยวส่งใบเสนอราคาให้นะคะ');
    assert.equal((await one('select count(*)::int n from sale_msgs where thread_id = $1', [T(1)])).n, before);
  } finally {
    await db.exec('grant insert on public.sale_msgs to authenticated');
  }
  await page.locator('#so_chat [data-a="send"]').click();
  await flashSays(/บันทึกข้อความแล้ว — ยังไม่ถูกส่งถึงลูกค้า/);
  assert.equal(await page.locator('#so_txt').inputValue(), '');
  const m = await one(`select dir, body, by_name from sale_msgs where thread_id = $1 order by created_at desc limit 1`, [T(1)]);
  assert.deepEqual(m, { dir: 'out', body: 'รับทราบค่ะ เดี๋ยวส่งใบเสนอราคาให้นะคะ', by_name: 'ying' });
  assert.match(await page.locator('#so_msgs .so-m.out').last().innerText(), /บันทึกในระบบ/);
  assert.doesNotMatch(await page.locator('#so_root').innerText(), /ส่งสำเร็จ|ส่งแล้ว|อ่านแล้ว/, 'never claims a send that did not happen');
});

test('the summary shows the receiver and only channels that really exist; copying is logged as copied, not as sent', skipIt, async () => {
  await page.locator('#so_ord [data-a="summary"]').click();
  await page.waitForSelector('#so_modal #so_sumtxt');
  const text = await page.locator('#so_modal').innerText();
  assert.match(text, /ผู้รับ: โรงเรียนบ้านตัวอย่าง · โทร 053-000000/);
  assert.match(text, /ส่งทาง LINE OA\s*แชตนี้ไม่ได้มาจาก LINE OA/, 'an in-shop chat is not a LINE chat: the page says so instead of offering a send that cannot happen');
  assert.match(text, /ส่งทาง Facebook\s*ยังไม่ได้เชื่อมต่อ/);
  const summary = await page.locator('#so_sumtxt').inputValue();
  assert.match(summary, /ORD-\d{4}-00001/);
  assert.match(summary, /1\) กระดาษถ่ายเอกสาร A4 80 แกรม × 10 รีม · 135\.00 = 1,350\.00 บาท/);
  assert.match(summary, /VAT 7% 192\.50 บาท/);
  assert.match(summary, /ยอดรวมทั้งสิ้น 2,942\.50 บาท/);
  await shot(page, 'desktop-2-summary');
  await page.locator('#so_modal [data-a="sumcopy"]').click();
  await page.locator('#so_modal .okx').waitFor();
  assert.match(await page.locator('#so_modal .okx').innerText(), /คัดลอกแล้ว/);
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), summary);
  const [order] = await rows('select id, version from sale_orders where thread_id = $1', [T(1)]);
  await until(async () => (await rows(`select 1 from sale_order_events where order_id = $1 and kind = 'send' and detail->>'channel' = 'copy' and (detail->>'ok')::boolean`, [order.id])).length === 1, 'the copy logged');
  await page.locator('#so_modal [data-a="setawait"]').click();
  await flashSays(/บันทึกแล้ว/);
  assert.equal((await one('select job_status, version from sale_orders where id = $1', [order.id])).job_status, 'awaiting');
  await page.locator('#so_ord [data-a="summary"]').click();
  await page.locator('#so_modal [data-a="sumchat"]').click();
  await flashSays(/บันทึกสรุปลงแชตแล้ว — ยังไม่ถูกส่งถึงลูกค้า/);
  const last = await one(`select dir, body from sale_msgs where thread_id = $1 order by created_at desc limit 1`, [T(1)]);
  assert.equal(last.dir, 'out');
  assert.match(last.body, /^สรุปใบสั่งงาน/);
  assert.equal((await rows(`select 1 from sale_order_events where order_id = $1 and detail->>'channel' = 'chat'`, [order.id])).length, 1);
});

test('closing an order that still has a balance due asks first, and the confirmation is kept in its history', skipIt, async () => {
  const [order] = await rows('select id from sale_orders where thread_id = $1', [T(1)]);
  await page.locator('#so_ord select[data-f="job_status"]').selectOption('closed');
  await page.locator('#so_ord [data-a="save"]').click();
  await page.waitForSelector('#so_modal');
  assert.match(await page.locator('#so_modal').innerText(), /ยังชำระไม่ครบ \(ยังไม่ชำระ\) และ ยังไม่ได้บันทึกว่า "ส่งมอบแล้ว"/);
  await page.locator('#so_modal button', { hasText: 'ยังก่อน' }).click();
  assert.equal((await one('select job_status from sale_orders where id = $1', [order.id])).job_status, 'awaiting');
  await page.locator('#so_ord [data-a="save"]').click();
  await page.locator('#so_modal button', { hasText: 'ยืนยันปิดออเดอร์' }).click();
  await flashSays(/บันทึกแล้ว/);
  const o = await one('select job_status, closed_at from sale_orders where id = $1', [order.id]);
  assert.equal(o.job_status, 'closed');
  assert.ok(o.closed_at);
  const ev = await one(`select detail from sale_order_events where order_id = $1 and kind = 'save' order by created_at desc limit 1`, [order.id]);
  assert.equal(ev.detail.force, true);
});

test('a slip attached to an order does not change its payment state, and a file that is not an image or PDF is refused', skipIt, async () => {
  await openRow('โรงเรียนวัดใหม่');
  await until(async () => (await chatTitle()) === 'โรงเรียนวัดใหม่', 'the chat');
  await page.waitForSelector('#so_cn');
  await page.locator('#so_ord [data-a="prodtoggle"]').click();
  await page.locator('#so_pq').fill('ปากกา');
  await page.waitForFunction(() => document.querySelectorAll('#so_pres .pr').length === 2, null, { timeout: 10000 });
  await page.locator('#so_pres .pr', { hasText: 'สีน้ำเงิน' }).click();
  await until(async () => (await ordRows().count()) === 1, 'one line');
  assert.equal(await page.locator('#so_ord input[data-f="iprice"]').inputValue(), '120.00');
  await openMore();
  let [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#so_ord [data-a="ordattach"]').click()]);
  await chooser.setFiles({ name: 'page.html', mimeType: 'text/html', buffer: Buffer.from('<b>no</b>') });
  await flashSays(/รับเฉพาะรูป/);
  [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#so_ord [data-a="ordattach"]').click()]);
  const png = readFileSync(new URL('../../assets/richmenu.png', import.meta.url));
  await chooser.setFiles({ name: 'สลิปโอน.png', mimeType: 'image/png', buffer: png });
  await flashSays(/แนบไฟล์เข้าใบแล้ว/);
  assert.equal(await page.locator('#so_ord select[data-f="pay_status"]').inputValue(), 'unpaid');
  await page.locator('#so_ord [data-a="save"]').click();
  await flashSays(/บันทึกแล้ว · ORD-\d{4}-00002/);
  const o = await one('select pay_status, paid_amount, attach from sale_orders where thread_id = $1', [T(2)]);
  assert.equal(o.pay_status, 'unpaid');
  assert.equal(Number(o.paid_amount), 0);
  assert.equal(o.attach.length, 1);
  assert.ok(o.attach[0].path.startsWith(`order/${T(2)}/`));
  const stored = pg.storage.get(`sale-order-files/${o.attach[0].path}`);
  assert.ok(stored && Buffer.compare(Buffer.from(stored.bytes), png) === 0, 'the file stored is the slip itself');
});

test('school prices: choosing the school re-prices linked lines with the shop’s formula; the search shows both prices', skipIt, async () => {
  await openMore();
  await page.locator('#so_ord select[data-f="price_school"]').selectOption(S2);
  await page.waitForSelector('#so_modal');
  assert.match(await page.locator('#so_modal').innerText(), /ราคาโรงเรียน \(โรงเรียนวัดใหม่\)/);
  await page.locator('#so_modal button', { hasText: 'ปรับราคา' }).click();
  await flashSays(/ปรับราคาแล้ว 1 รายการ/);
  assert.equal(await page.locator('#so_ord input[data-f="iprice"]').inputValue(), '126.00', '120 + 5% = 126');
  await page.locator('#so_ord [data-a="prodtoggle"]').click();
  await page.locator('#so_pq').fill('กระดาษถ่าย');
  await page.waitForFunction(() => /ราคาโรงเรียน 142\.00 \(ปกติ 135\.00\)/.test(document.querySelector('#so_pres')?.innerText || ''), null, { timeout: 10000 });
  await page.locator('#so_pres .pr').first().click();
  await until(async () => (await ordRows().count()) === 2, 'two lines');
  await page.locator('#so_ord [data-a="save"]').click();
  await flashSays(/บันทึกแล้ว · ORD-\d{4}-00002/);
  const o = await one('select id, price_school_id, subtotal from sale_orders where thread_id = $1', [T(2)]);
  assert.equal(o.price_school_id, S2);
  const items = await rows('select name, unit_price from sale_order_items where order_id = $1 order by seq', [o.id]);
  assert.deepEqual(items.map((i) => [i.name, Number(i.unit_price)]), [['ปากกาเจล สีน้ำเงิน', 126], ['กระดาษถ่ายเอกสาร A4 80 แกรม', 142]]);
  assert.equal(Number(o.subtotal), 268);
});

test('a visitor who is not signed in sees no chats and cannot save an order', skipIt, async () => {
  const ctx = await newContext({}, { signedIn: false });
  try {
    const p = await ctx.newPage();
    await p.goto(`${shell.url}/#saleorders`);
    await p.waitForSelector('#so_items .so-empty');
    assert.equal(await p.locator('#so_items .so-row').count(), 0);
    const r = await p.evaluate(() => sb.rpc('sale_order_save', { p: { client_token: 'visitor-token-1', thread_id: '66666666-6666-4666-8666-666666666601' } }));
    assert.match(String(r.error && r.error.message), /permission denied/);
    const s = await p.evaluate(() => sb.from('sale_orders').select('id'));
    assert.match(String(s.error && s.error.message), /permission denied/);
  } finally {
    await ctx.close();
  }
});

test('on a phone: three tabs (รายชื่อแชต / แชต / ออเดอร์) and nothing scrolls sideways', skipIt, async () => {
  const ctx = await newContext({ ...playwright().devices['iPhone 13'] });
  try {
    const p = await ctx.newPage();
    p.on('pageerror', (e) => pageErrors.push(String(e.message || e)));
    // every visible box of the page fits the phone's width (position:fixed panes included, so visibility is by client rects)
    const noSideways = () => p.evaluate(() => {
      const boxes = [document.documentElement, ...document.querySelectorAll('#so_root .so-cols, #so_root .so-col, #so_root .so-ob, #so_root .so-tbw, #so_root .so-comp, #so_root .so-msgs')];
      return boxes.filter((el) => el.getClientRects().length && el.scrollWidth > el.clientWidth + 1).map((el) => `${el.className || el.tagName} ${el.scrollWidth}>${el.clientWidth}`);
    });
    await p.goto(`${shell.url}/#saleorders`);
    await p.waitForSelector('#so_items .so-row');
    assert.deepEqual(await p.locator('#so_mtabs button').allInnerTexts(), ['รายชื่อแชต', 'แชต', 'ออเดอร์']);
    assert.deepEqual(await noSideways(), []);
    await shot(p, 'phone-1-list');
    await p.locator('#so_items .so-row', { hasText: 'โรงเรียนบ้านตัวอย่าง' }).click();
    await p.waitForSelector('#so_chat .so-m');
    assert.equal(await p.locator('#so_mtabs button.on').innerText(), 'แชต');
    assert.equal(await p.locator('#so_chat').isVisible(), true);
    assert.equal(await p.locator('#so_items').isVisible(), false);
    await p.waitForFunction(() => [...document.querySelectorAll('#so_msgs img.so-img')].filter((i) => i.complete && i.naturalWidth > 0).length === 2, null, { timeout: 10000 });
    assert.deepEqual(await noSideways(), []);
    await shot(p, 'phone-2-chat');
    await p.locator('#so_mtabs button', { hasText: 'ออเดอร์' }).click();
    await p.waitForSelector('#so_ord .so-tb');
    assert.equal(await p.locator('#so_ord').isVisible(), true);
    assert.equal(await p.locator('#so_chat').isVisible(), false);
    assert.deepEqual(await noSideways(), []);
    await shot(p, 'phone-3-order');
    await p.locator('#so_ord input[data-f="iqty"]').first().fill('12');
    await p.waitForSelector('#so_mtabs .dot');
    await p.locator('#so_mtabs button', { hasText: 'รายชื่อแชต' }).click();
    assert.equal(await p.locator('#so_items').isVisible(), true);
  } finally {
    await ctx.close();
  }
  assert.deepEqual(pageErrors, [], 'no page errors anywhere');
});

test('the payment status list offers ลงบัญชี next to the others, and choosing it is allowed like any other status', skipIt, async () => {
  await openRow('โรงเรียนบ้านตัวอย่าง');
  await page.waitForSelector('#so_ord select[data-f="pay_status"]');
  const opts = await page.locator('#so_ord select[data-f="pay_status"] option').allInnerTexts();
  assert.deepEqual(opts, ['ยังไม่ชำระ', 'มัดจำแล้ว', 'ชำระบางส่วน', 'ชำระครบ', 'ลงบัญชี']);
  await page.locator('#so_ord select[data-f="pay_status"]').selectOption('account');
  assert.equal(await page.locator('#so_ord select[data-f="pay_status"]').inputValue(), 'account');
  assert.equal(await page.locator('#so_ord input[data-f="paid_amount"]').count(), 0, 'no amount is asked for: nothing has been received');
  await page.locator('#so_ord select[data-f="pay_status"]').selectOption('unpaid');
});

test('typing a customer name offers the customers that already exist; choosing one fills the name and the phone', skipIt, async () => {
  await openRow('โรงเรียนบ้านตัวอย่าง');
  await page.waitForSelector('#so_cn');
  await page.locator('#so_cn').fill('โรงเรียนวัด');
  await page.waitForSelector('#so_cnsug button');
  const offered = await page.locator('#so_cnsug button').allInnerTexts();
  assert.ok(offered.some((t) => t.includes('โรงเรียนวัดใหม่')), 'the existing customer is offered');
  await page.locator('#so_cnsug button', { hasText: 'โรงเรียนวัดใหม่' }).click();
  assert.equal(await page.locator('#so_cn').inputValue(), 'โรงเรียนวัดใหม่');
  assert.equal(await page.locator('#so_ord input[data-f="phone"]').inputValue(), '053-111111');
  assert.equal(await page.locator('#so_cnsug').isVisible(), false, 'the list closes after a choice');
});

test('quick-reply buttons show the five job-flow messages (v11); clicking one inserts its text without sending anything', skipIt, async () => {
  // the previous test left an unsaved customer pick on this chat's order (never saved, by design — it only checked the autocomplete) —
  // reload the page fresh so every test from here on starts clean, the same as a staff member opening the page new
  // (page.goto to the same URL+hash is a same-document no-op in this SPA; reload() forces an actual fresh load)
  await page.reload();
  await page.waitForSelector('#so_items .so-row');
  await openRow('โรงเรียนบ้านตัวอย่าง');
  await until(async () => (await chatTitle()) === 'โรงเรียนบ้านตัวอย่าง', 'the chat');
  const labels = await page.locator('#so_root .so-qa .so-tplb').allInnerTexts();
  assert.deepEqual(labels, ['รับรายละเอียดแล้ว', 'ขอไฟล์เพิ่ม', 'กำลังประเมินราคา', 'ส่งแบบให้ตรวจ', 'งานพร้อมรับ']);
  const before = (await one('select count(*)::int n from sale_msgs where thread_id = $1', [T(1)])).n;
  await page.locator('#so_txt').fill('');
  await page.locator('#so_root .so-qa .so-tplb', { hasText: 'กำลังประเมินราคา' }).click();
  assert.equal(await page.locator('#so_txt').inputValue(), 'กำลังประเมินราคาให้อยู่นะคะ เดี๋ยวแจ้งกลับเร็ว ๆ นี้ค่ะ');
  assert.equal((await one('select count(*)::int n from sale_msgs where thread_id = $1', [T(1)])).n, before, 'inserting a template saves and sends nothing');
  await page.locator('#so_txt').fill('');
});

test('the assignee pill (v11): three quick names, a free-text name, and "ไม่ระบุ" to clear — each writes sale_threads.assignee, logs a system note, and relabels the pill', skipIt, async () => {
  assert.equal(await page.locator('#so_chat [data-a="assignmenu"]').innerText(), 'ผู้รับผิดชอบ ▾');
  await page.locator('#so_chat [data-a="assignmenu"]').click();
  const names = await page.locator('#so_root .so-stgmenu [data-a="assign"]').allInnerTexts();
  assert.deepEqual(names, ['หญิง', 'ฟิล์ม', 'พี่ปิ่น', '✓ ไม่ระบุ'], 'no one is assigned yet, so "ไม่ระบุ" is the checked (current) choice — same convention as the stage menu');
  await page.locator('#so_root .so-stgmenu [data-a="assign"]', { hasText: 'ฟิล์ม' }).click();
  await flashSays(/มอบหมายให้ "ฟิล์ม" แล้ว/);
  assert.equal(await page.locator('#so_chat [data-a="assignmenu"]').innerText(), 'ฟิล์ม ▾');
  assert.equal((await one('select assignee from sale_threads where id = $1', [T(1)])).assignee, 'ฟิล์ม');
  let note = await one(`select body, kind from sale_msgs where thread_id = $1 order by created_at desc limit 1`, [T(1)]);
  assert.equal(note.kind, 'system');
  assert.match(note.body, /มอบหมายให้ "ฟิล์ม" ดูแล/);

  await page.locator('#so_chat [data-a="assignmenu"]').click();
  await page.locator('#so_root .so-stgmenu #so_assignc').fill('พี่แนน');
  await page.locator('#so_root .so-stgmenu [data-a="assigncustom"]').click();
  await flashSays(/มอบหมายให้ "พี่แนน" แล้ว/);
  assert.equal(await page.locator('#so_chat [data-a="assignmenu"]').innerText(), 'พี่แนน ▾');
  assert.equal((await one('select assignee from sale_threads where id = $1', [T(1)])).assignee, 'พี่แนน', 'a name outside the three shortcuts is accepted too');

  await page.locator('#so_chat [data-a="assignmenu"]').click();
  await page.locator('#so_root .so-stgmenu [data-a="assign"]', { hasText: 'ไม่ระบุ' }).click();
  await flashSays(/เอาผู้รับผิดชอบออกแล้ว/);
  assert.equal(await page.locator('#so_chat [data-a="assignmenu"]').innerText(), 'ผู้รับผิดชอบ ▾');
  assert.equal((await one('select assignee from sale_threads where id = $1', [T(1)])).assignee, null);
  note = await one(`select body, kind from sale_msgs where thread_id = $1 order by created_at desc limit 1`, [T(1)]);
  assert.equal(note.kind, 'system');
  assert.match(note.body, /เอาผู้รับผิดชอบออก/);
});

test('customer card (v11): an unlinked chat can be linked to an existing customer by search, and then shows that customer’s totals across every chat of theirs', skipIt, async () => {
  await openRow('คุณสุภาวดี');
  await until(async () => (await chatTitle()) === 'คุณสุภาวดี (ร้านหนังสือ)', 'the chat');
  await page.waitForSelector('#so_cn');
  assert.match(await page.locator('#so_ord').innerText(), /ยังไม่ผูกกับลูกค้าในระบบ/);
  assert.equal(await page.locator('#so_ord [data-a="custlinktoggle"]').count(), 1);
  assert.equal((await one('select customer_id from sale_threads where id = $1', [T(3)])).customer_id, null, 'seeded with no customer');

  await page.locator('#so_ord [data-a="custlinktoggle"]').click();
  await page.waitForSelector('#so_clq');
  await page.locator('#so_clq').fill('บ้านตัวอย่าง');
  await page.waitForSelector('#so_clsug button');
  const offered = await page.locator('#so_clsug button').allInnerTexts();
  assert.ok(offered.some((t) => t.includes('โรงเรียนบ้านตัวอย่าง')), 'the existing customer is offered by name search');
  await page.locator('#so_clsug button', { hasText: 'โรงเรียนบ้านตัวอย่าง' }).click();
  await flashSays(/ผูกกับลูกค้า "โรงเรียนบ้านตัวอย่าง" แล้ว/);

  assert.equal((await one('select customer_id from sale_threads where id = $1', [T(3)])).customer_id, C1);
  const note = await one(`select body, kind from sale_msgs where thread_id = $1 order by created_at desc limit 1`, [T(3)]);
  assert.equal(note.kind, 'system');
  assert.match(note.body, /ผูกแชตนี้กับลูกค้า "โรงเรียนบ้านตัวอย่าง"/);

  // the card now shows the customer and their totals across EVERY chat of theirs, not just this one: C1's only order
  // lives on thread 1 (ORD-xxxx-00001, closed, 2,942.50) — this chat (thread 3) never had an order of its own
  await page.waitForSelector('#so_ord [data-a="custlinktoggle"]', { state: 'detached' });
  const cardText = await page.locator('#so_ord').innerText();
  assert.match(cardText, /โรงเรียนบ้านตัวอย่าง/);
  assert.match(cardText, /053-000000/);
  assert.match(cardText, /1\s*งานทั้งหมด/);
  assert.match(cardText, /2,942\.50\s*ยอดซื้อรวม/);
  assert.match(cardText, /0\s*งานกำลังทำ/, 'the one order is closed, so none are "in progress"');
});

test('the tag row (v12): all four colors are always visible, one click sets a color, the same click again clears it, and the list row picks up the border', skipIt, async () => {
  await openRow('โรงเรียนบ้านตัวอย่าง');
  await until(async () => (await chatTitle()) === 'โรงเรียนบ้านตัวอย่าง', 'the chat');
  const labels = await page.locator('#so_root .so-tagrow .so-tagbtn').allInnerTexts();
  assert.deepEqual(labels, ['สอบถาม', 'ปัญหา', 'ด่วน', 'ตอบกลับภายหลัง'], 'all four are on screen at once — no button to open first');
  assert.equal(await page.locator('#so_root .so-tagrow .so-tagbtn.on').count(), 0, 'nothing is tagged yet, so none is highlighted');
  assert.equal((await one('select tag from sale_threads where id = $1', [T(1)])).tag, null);

  await page.locator('#so_root .so-tagrow .so-tagbtn', { hasText: 'ด่วน' }).click();
  await flashSays(/ติดป้าย "ด่วน" แล้ว/);
  assert.equal((await one('select tag from sale_threads where id = $1', [T(1)])).tag, 'urgent');
  let note = await one(`select body, kind from sale_msgs where thread_id = $1 order by created_at desc limit 1`, [T(1)]);
  assert.equal(note.kind, 'system');
  assert.match(note.body, /ติดป้าย "ด่วน"/);
  const onNow = page.locator('#so_root .so-tagrow .so-tagbtn.on');
  await assert.doesNotReject(onNow.waitFor());
  assert.equal(await onNow.innerText(), 'ด่วน', 'the active color is the only one highlighted');
  const row = page.locator('#so_items .so-row', { hasText: 'โรงเรียนบ้านตัวอย่าง' });
  assert.match((await row.getAttribute('class')) || '', /\btagged\b/);
  assert.match((await row.getAttribute('style')) || '', /--tc:#E8832A/, 'the list row carries this exact tag’s color, not just any color');

  await page.locator('#so_root .so-tagrow .so-tagbtn', { hasText: 'ด่วน' }).click();
  await flashSays(/เอาป้ายออกแล้ว/);
  assert.equal((await one('select tag from sale_threads where id = $1', [T(1)])).tag, null, 'clicking the already-active color again clears it — no separate "ไม่มีป้าย" button needed');
  assert.equal(await page.locator('#so_root .so-tagrow .so-tagbtn.on').count(), 0);
  note = await one(`select body, kind from sale_msgs where thread_id = $1 order by created_at desc limit 1`, [T(1)]);
  assert.match(note.body, /เอาป้ายออก/);
  assert.doesNotMatch((await row.getAttribute('class')) || '', /\btagged\b/);
});

test('typing in the message box survives tapping a tag button (v14): focus and the cursor position come back after the repaint', skipIt, async () => {
  // iOS Safari famously does NOT move focus to a tapped <button> the way desktop Chromium does — a tap there leaves the
  // textarea focused right up until paintChat() tears the DOM down and rebuilds it. We reproduce exactly that ordering with
  // a scripted (non-trusted) click event, which fires the same delegated handler without Chromium's own native
  // mousedown-driven focus-steal muddying what we're testing: whether paintChat() itself preserves focus when it finds it.
  await openRow('โรงเรียนบ้านตัวอย่าง');
  await until(async () => (await chatTitle()) === 'โรงเรียนบ้านตัวอย่าง', 'the chat');
  await page.locator('#so_txt').fill('สวัสดีค่ะ ขอบคุณที่อุดหนุนนะคะ');
  const before = await page.evaluate(() => {
    const ta = document.getElementById('so_txt');
    ta.focus();
    ta.setSelectionRange(8, 8); // mid-string, not the start or end — a reset would be easy to miss at either edge
    return { id: document.activeElement && document.activeElement.id, start: ta.selectionStart, end: ta.selectionEnd };
  });
  assert.deepEqual(before, { id: 'so_txt', start: 8, end: 8 }, 'test setup: the textarea is focused with the cursor mid-string before the tag is clicked');

  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('#so_root .so-tagrow .so-tagbtn')].find((b) => b.textContent.includes('สอบถาม'));
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
  await flashSays(/ติดป้าย "สอบถาม" แล้ว/);
  const after = await page.evaluate(() => {
    const ta = document.getElementById('so_txt');
    return { id: document.activeElement && document.activeElement.id, value: ta.value, start: ta.selectionStart, end: ta.selectionEnd };
  });
  assert.equal(after.id, 'so_txt', 'the (new) textarea has focus again after the repaint — a real phone keyboard stays open instead of flickering shut');
  assert.equal(after.value, 'สวัสดีค่ะ ขอบคุณที่อุดหนุนนะคะ', 'the draft text the repaint restores is unaffected');
  assert.equal(after.start, 8, 'the cursor position is restored, not reset to the start or end');
  assert.equal(after.end, 8);

  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('#so_root .so-tagrow .so-tagbtn')].find((b) => b.textContent.includes('สอบถาม'));
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
  await flashSays(/เอาป้ายออกแล้ว/);
  await page.locator('#so_txt').fill('');
});

test('a LINE chat with no customer yet is linked automatically, in the background, named after their LINE display name (v13)', skipIt, async () => {
  // this thread (T7, "ริงโกลาเฟ009") was seeded from LINE with no customer_id — the sweep runs after every list load,
  // including the very first one at the top of this file, so by now it may already be linked; either way this waits for it
  await until(async () => (await one('select customer_id from sale_threads where id = $1', [T(7)])).customer_id !== null, 'the background autolink');
  const { customer_id } = await one('select customer_id from sale_threads where id = $1', [T(7)]);
  const cust = await one('select name, line_name, phone, source from customers where id = $1', [customer_id]);
  assert.deepEqual(cust, { name: 'ริงโกลาเฟ009', line_name: 'ริงโกลาเฟ009', phone: null, source: 'LINE OA (เพิ่มเพื่อน)' });

  await openRow('ริงโกลาเฟ009');
  await until(async () => (await chatTitle()) === 'ริงโกลาเฟ009', 'the chat');
  await page.waitForSelector('#so_cn');
  const cardText = await page.locator('#so_ord').innerText();
  assert.match(cardText, /ริงโกลาเฟ009/, 'the card shows the auto-linked customer, not "ยังไม่ผูกกับลูกค้าในระบบ"');
  assert.doesNotMatch(cardText, /ยังไม่ผูกกับลูกค้าในระบบ/);
});
