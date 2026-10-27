// The overview screen "ภาพรวม" in the real back office: the live shell and the live weborders module (NATTA_LIVE_DIR), the
// overview module from this repo (installed with its apply.sql, then switched on), the chat-orders module (for its card),
// supabase-js, and the database (PGlite) through the PostgREST stand-in. Run with:
//   NATTA_LIVE_DIR=<folder with files/admin and modules> npm run test:ui
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openShopDb, asService, asStaff, STAFF } from '../helpers/shop-db.js';
import { startPgRest, staffJwt } from '../helpers/pg-rest.js';
import { liveDir, playwright, serveShell, staffSession, routeOffline, PROJECT_REF } from '../helpers/back-office.js';
import { seedShopCatalogue, seedBackOffice, STORE, P1, P3 } from '../helpers/back-office-db.js';

const LIVE = liveDir();
const MIG = fileURLToPath(new URL('../migrations/002_home_summary.sql', import.meta.url));
const MODULE_DIR = fileURLToPath(new URL('../../app-patches/home-module/', import.meta.url));
const STUB = fileURLToPath(new URL('../fixtures/skin-nav.stub.js', import.meta.url)); // the live skin module's menus (seq 20)
const SHOTS = process.env.OVERVIEW_SHOTS || join(tmpdir(), 'overview-shots');
const SERVICE = 'svc-service-key';
// the first moment of today in Bangkok: the "today" orders are at this moment plus a few minutes
const TODAY0 = "(date_trunc('day', now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok')";

let db, pg, shell, browser, context, page;
const pageErrors = [];

const summary = () => asStaff(db, async (tx) => (await tx.query('select public.home_summary() as s')).rows[0].s);
const baht = (n) => '฿' + Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const num = (n) => Number(n || 0).toLocaleString('th-TH');
const shot = (name) => page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });

before(async () => {
  if (!LIVE) return;
  mkdirSync(SHOTS, { recursive: true });
  db = await openShopDb(); // the shop's schema, with the chat-to-order tables (001)
  await db.exec(readFileSync(MIG, 'utf8')); // home_summary() (002)
  await seedShopCatalogue(db);
  await seedBackOffice(db, { weborders: LIVE + '/modules/weborders.js' }); // app_modules, pick_slips, weborders, chatorders (on)
  await db.query("insert into app_modules (name, code, seq, enabled) values ('skin-nav-stub', $1, 20, true)", [readFileSync(STUB, 'utf8')]);
  await db.exec(readFileSync(MODULE_DIR + 'apply.sql', 'utf8')); // the overview module: installed switched off …
  await db.query("update app_modules set enabled = true where name = 'overview'"); // … then switched on, as the owner does
  await asService(db, async (tx) => {
    await tx.query('update products set reorder_point = 10 where id = $1', [P1]);
    await tx.query('update products set reorder_point = 25 where id = $1', [P3]);
    await tx.query(`insert into orders (order_no, status, total, created_at, orderer_name, school_name) values
      ('NT-0001', 'pending', 300, ${TODAY0} + interval '1 minute', 'คุณครูสุดา', null),
      ('NT-0002', 'done', 700, ${TODAY0} + interval '2 minutes', null, 'โรงเรียนบ้านสวน'),
      ('NT-0003', 'cancelled', 999, ${TODAY0} + interval '3 minutes', 'คุณลุงดำ', null),
      ('NT-0004', 'done', 150, now() - interval '40 days', 'คุณป้าแดง', null)`);
    await tx.query(
      `insert into sales (store_id, sale_no, total, status, created_at, paid_at) values ($1, 'POS-1', 200, 'paid', ${TODAY0} + interval '1 minute', ${TODAY0} + interval '1 minute')`,
      [STORE],
    );
    await tx.query(`insert into pick_slips (order_no, archived_at) values ('NT-0001', null), ('NT-0002', null), ('NT-0004', now())`);
  });
  // a draft from the chat, so the chat card shows one
  await asStaff(db, (tx) =>
    tx.query('select public.chat_draft_manual($1::jsonb, $2, $3, $4, $5, $6) as r', [
      JSON.stringify([{ name: 'ไม้ถูพื้น', qty: 2, unit: '', product_id: P1, raw: 'ไม้ถูพื้น 2' }]),
      'คุณครูสุดา', null, null, null, 'staff:สมชาย',
    ]),
  );

  pg = await startPgRest({ db, serviceKey: SERVICE });
  shell = await serveShell();
  browser = await playwright().chromium.launch();
  context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const jwt = staffJwt(STAFF, 'staff@test.local');
  await routeOffline(context, pg.url);
  await context.addInitScript(
    ({ key, session }) => {
      try {
        localStorage.setItem(key, JSON.stringify(session));
      } catch (_) {
        /* about:blank has no storage */
      }
    },
    { key: `sb-${PROJECT_REF}-auth-token`, session: staffSession(jwt, STAFF, 'staff@test.local') },
  );
  page = await context.newPage();
  page.on('pageerror', (e) => pageErrors.push(String(e.message || e)));
});

after(async () => {
  if (!LIVE) return;
  await browser?.close();
  await shell?.close();
  await pg?.close();
  await db?.close();
});

const skipIt = LIVE ? {} : { skip: 'set NATTA_LIVE_DIR to a folder with files/admin and modules/weborders.js (a copy of the live back office)' };

async function openAt(hash, width = 390) {
  await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
  await page.goto('about:blank'); // a new visit: the same address with a different state would not reload the page
  await page.goto(`${shell.url}/admin/index.html${hash}`);
  await page.waitForSelector('.ov-hero', { timeout: 15000 });
}

test('on a phone the hero shows this month’s total, the screen fits the width, and the bottom bar has ภาพรวม', skipIt, async () => {
  await openAt('#overview', 390);
  const s = await summary();
  assert.equal(s.month.orders, 2, 'NT-0001 and NT-0002: not the cancelled NT-0003, not last month’s NT-0004');
  assert.equal((await page.locator('.ov-hero b').textContent()).trim(), baht(s.month.amount));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, 'no sideways scrolling');
  assert.equal(await page.locator('#mobnav a[data-r="overview"]').isVisible(), true, 'the bottom bar has ภาพรวม');
  await shot('overview-390');
  assert.deepEqual(pageErrors, []);
});

test('the cards and the lists show the numbers of the database', skipIt, async () => {
  await openAt('#overview', 390);
  const s = await summary();
  const cards = await page.locator('.ov-card').allTextContents();
  assert.equal(cards.length, 5, 'pending, slips not archived, low stock, POS of the month, the chat');
  assert.match(cards[0], new RegExp(`ออเดอร์รอดำเนินการ\\s*${num(s.pending_orders)}`));
  assert.match(cards[1], new RegExp(`ใบจัดของยังไม่เก็บ\\s*${num(s.unarchived_slips)}`));
  assert.match(cards[2], new RegExp(`สินค้าใกล้หมด\\s*${num(s.low_stock)}`));
  assert.match(cards[3], new RegExp(`ขายหน้าร้านเดือนนี้\\s*${baht(s.pos_month.amount)}`));
  assert.match(cards[4], new RegExp(`รอตรวจจากแชท\\s*${num(s.chat_open)}`));
  const lists = page.locator('.ov-list');
  assert.equal(await lists.count(), 2, 'the low stock list and the recent orders');
  const low = await lists.nth(0).locator('.ov-row').allTextContents();
  assert.equal(low.length, s.low_stock);
  assert.match(low[0], /ปากกาลูกลื่นน้ำเงิน 0\.5/, 'the most short first');
  const recent = await lists.nth(1).locator('.ov-row').allTextContents();
  assert.equal(recent.length, 4);
  assert.match(recent[0], /NT-0003/);
  assert.match(recent[0], /ยกเลิก/, 'a cancelled order shows its status');
  assert.match(recent[1], /โรงเรียนบ้านสวน/, 'a blank orderer name shows the school');
  assert.deepEqual(pageErrors, []);
});

test('tapping an action or a card opens its screen', skipIt, async () => {
  await openAt('#overview', 390);
  await page.locator('.ov-act', { hasText: 'ใบจัดของ' }).click();
  await page.waitForFunction(() => location.hash === '#weborders');
  await openAt('#overview', 390);
  await page.locator('.ov-card', { hasText: 'สินค้าใกล้หมด' }).click();
  await page.waitForFunction(() => location.hash === '#stock');
  assert.deepEqual(pageErrors, []);
});

test('on a desktop the cards sit in a grid, and the refresh button loads the numbers again', skipIt, async () => {
  await openAt('#overview', 1280);
  assert.equal(await page.locator('.ov-cards').evaluate((el) => getComputedStyle(el).display), 'grid');
  await page.locator('#ov-refresh').click();
  await page.waitForSelector('.ov-hero');
  assert.match(await page.locator('.ov-hero').innerText(), /ยอดออเดอร์เดือนนี้/);
  await shot('overview-1280');
  assert.deepEqual(pageErrors, []);
});

test('the start page is still หน้าหลัก: the overview opens only from its own tab', skipIt, async () => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('about:blank');
  await page.goto(`${shell.url}/admin/index.html`);
  await page.waitForSelector('#view > *', { timeout: 15000 });
  assert.equal(await page.locator('.ov-hero').count(), 0, 'the start page is not the overview');
  await page.goto('about:blank');
  await page.goto(`${shell.url}/admin/index.html#home`);
  await page.waitForSelector('#view > *', { timeout: 15000 });
  assert.equal(await page.locator('.ov-hero').count(), 0, 'the existing home screen is not replaced');
  assert.deepEqual(pageErrors, []);
});

test('the side menu and the bottom bar each have ภาพรวม once, and both open it', skipIt, async () => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('about:blank');
  await page.goto(`${shell.url}/admin/index.html#home`);
  await page.waitForSelector('#nav a[data-r="overview"]', { timeout: 15000 });
  assert.equal(await page.locator('#nav a[data-r="overview"]').count(), 1, 'one link in the side menu');
  await page.locator('#nav a[data-r="overview"]').click();
  await page.waitForSelector('.ov-hero', { timeout: 15000 });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('about:blank');
  await page.goto(`${shell.url}/admin/index.html#home`);
  await page.waitForSelector('#mobnav a[data-r="overview"]', { timeout: 15000 });
  assert.equal(await page.locator('#mobnav a[data-r="overview"]').count(), 1, 'one link in the bottom bar');
  await page.locator('#mobnav a[data-r="overview"]').click();
  await page.waitForSelector('.ov-hero', { timeout: 15000 });
  assert.deepEqual(pageErrors, []);
});
