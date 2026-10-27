// The staff screen "ออเดอร์จากแชท" in the real back office: the live shell and the live weborders module (NATTA_LIVE_DIR), the
// chatorders module from this repo (installed with its apply.sql, then enabled), supabase-js, and the database (PGlite) through the
// PostgREST stand-in. Run with:  NATTA_LIVE_DIR=<folder with files/admin and modules> npm run test:ui
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openShopDb, asService, asStaff, STAFF } from '../helpers/shop-db.js';
import { startPgRest, staffJwt } from '../helpers/pg-rest.js';
import { liveDir, playwright, serveShell, staffSession, routeOffline, PROJECT_REF } from '../helpers/back-office.js';
import { seedShopCatalogue, seedBackOffice, STORE, P1, P2, P3 } from '../helpers/back-office-db.js';

const LIVE = liveDir();
const MODULE_DIR = fileURLToPath(new URL('../../app-patches/chat-drafts-module/', import.meta.url));
const SHOTS = process.env.STAFF_SCREEN_SHOTS || join(tmpdir(), 'staff-screen-shots');
const SERVICE = 'svc-service-key';

let db, pg, shell, browser, context, page;
const pageErrors = [];

const q = (sql, params = []) => asService(db, (tx) => tx.query(sql, params)).then((r) => r.rows);
const asStaffRows = (sql, params) => asStaff(db, (tx) => tx.query(sql, params)).then((r) => r.rows);

async function draftNo(no) {
  const [d] = await q('select id, draft_no, status, items, version, order_no, pos_sale_no, customer_name from chat_drafts where draft_no = $1', [no]);
  return d;
}

before(async () => {
  if (!LIVE) return;
  mkdirSync(SHOTS, { recursive: true });
  db = await openShopDb();
  await seedShopCatalogue(db);
  await seedBackOffice(db, { weborders: LIVE + '/modules/weborders.js' });

  // four drafts, one per tab, made the way the screen and the bot make them: as a signed-in staff member
  const made = async (items, name, extra = {}) =>
    (await asStaffRows('select public.chat_draft_manual($1::jsonb, $2, $3, $4, $5, $6) as r', [JSON.stringify(items), name, extra.phone ?? null, null, null, 'staff:สมชาย'])).map((x) => x.r)[0];
  const dTodo = await made(
    [
      { name: 'ไม้ถูพื้น', qty: 2, unit: '', product_id: P1, raw: 'ไม้ถูพื้น 2 อัน' },
      { name: 'น้ำยาล้าง', qty: 1, unit: 'แกลลอน', product_id: null, raw: 'น้ำยาล้าง=1แกลลอน', suggestions: [{ id: P2, name: 'น้ำยาล้างจาน', code: 'A2', unit: 'ขวด', price: 60 }] },
      { name: 'ไม้กวาดทางมะพร้าว', qty: 1, unit: '', product_id: null, raw: 'ไม้กวาดทางมะพร้าว 1' },
    ],
    'คุณครูสุดา',
    { phone: '0812345678' },
  );
  const dReady = await made([{ name: 'ไม้ถูพื้น', qty: 1, unit: '', product_id: P1, raw: 'ไม้ถูพื้น 1' }], 'คุณป้าแดง');
  const dOff = await made([{ name: 'สมุด', qty: 1, unit: '', product_id: null, raw: 'สมุด 1' }], 'คุณนิด');
  const dDone = await made([{ name: 'ปากกาลูกลื่นน้ำเงิน 0.5', qty: 4, unit: '', product_id: P3, raw: 'ปากกา 4' }], 'คุณลุงดำ');
  await asStaff(db, async (tx) => {
    const d = (await tx.query('select id, version, items from chat_drafts where id = $1', [dDone.draft_id])).rows[0];
    const saved = (await tx.query('select public.chat_draft_save($1, $2, $3::jsonb, $4, $5, $6, null, null, $7) as r', [d.id, d.version, JSON.stringify(d.items), 'คุณลุงดำ', null, null, 'staff:สมชาย'])).rows[0].r;
    await tx.query('select public.chat_draft_confirm($1, $2, $3) as r', [d.id, saved.version, 'staff:สมชาย']);
  });
  const [offV] = await q('select version from chat_drafts where id = $1', [dOff.draft_id]);
  await asStaff(db, (tx) => tx.query('select public.chat_draft_cancel($1, $2, $3, $4) as r', [dOff.draft_id, offV.version, 'staff:สมชาย', 'ไม่ได้สั่ง']));

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
      window.print = () => {}; // the pick slip is printed into #printArea; the browser print dialog is not opened here
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
const openScreen = async (hash = '#chatorders', query = '') => {
  await page.goto('about:blank'); // a new visit: the same address with a different state would not reload the page
  await page.goto(`${shell.url}/admin/index.html${query}${hash}`);
  await page.waitForSelector('.cd-tabs, .cd-top', { timeout: 15000 });
};
const tabText = (t) => page.locator('.cd-tab', { hasText: t }).innerText();
const shot = (name) => page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });

test('the tabs count the drafts: to check, ready to confirm, confirmed, cancelled', skipIt, async () => {
  await openScreen();
  assert.match(await tabText('รอตรวจ'), /รอตรวจ\s*1/);
  assert.match(await tabText('พร้อมยืนยัน'), /พร้อมยืนยัน\s*1/);
  assert.match(await tabText('ยืนยันแล้ว'), /ยืนยันแล้ว\s*1/);
  assert.match(await tabText('ยกเลิก'), /ยกเลิก\s*1/);
  assert.deepEqual(pageErrors, [], 'the page shows no error');
});

test('a draft opens with its customer and lines; a line the shop can match is linked from its suggestion and the save is in the history', skipIt, async () => {
  await page.locator('.cd-row', { hasText: 'คุณครูสุดา' }).click();
  await page.waitForSelector('#cd-save');
  await page.locator('.cd-line', { hasText: 'น้ำยาล้าง' }).locator('button', { hasText: 'ใช้ น้ำยาล้างจาน' }).click();
  await page.locator('.cd-line', { hasText: 'น้ำยาล้างจาน' }).first().waitFor();
  await page.locator('#cd-save').click();
  await page.waitForFunction(() => (document.querySelector('#toasts')?.innerText || '').includes('บันทึกแล้ว'));
  const d = await draftNo('CH-0001');
  assert.equal(d.items[1].product_id, P2, 'the line is linked to the shop’s product');
  assert.equal(d.items[1].said, 'น้ำยาล้าง', 'the customer’s words are kept');
  assert.equal(d.version, 3, 'the paste is version 2 (created and saved once), this save is version 3');
  await page.locator('details.cd-hist summary').click();
  assert.match(await page.locator('details.cd-hist').innerText(), /แก้ไขโดยพนักงาน/);
  assert.match(await page.locator('details.cd-hist').innerText(), /สต\.?|staff|สมชาย|staff:/, 'the history names who changed it');
});

test('confirm refuses while a line waits for a check and says which; after the check it becomes order NT-…', skipIt, async () => {
  await page.locator('#cd-save').waitFor();
  await page.locator('button[data-act="confirm"]').click();
  await page.waitForSelector('#cd-err:not(:empty)');
  assert.match(await page.locator('#cd-err').innerText(), /มี 1 รายการรอตรวจสินค้า/);
  assert.equal((await draftNo('CH-0001')).status, 'open', 'nothing is confirmed yet');
  // the staff accept the words and price the line
  const line = page.locator('.cd-line', { hasText: 'ไม้กวาดทางมะพร้าว' });
  await line.locator('input[data-f="staff_ok"]').check();
  await line.locator('input[data-f="price"]').fill('45');
  await page.locator('button[data-act="confirm"]').click();
  await page.waitForFunction(() => /ยืนยันเป็นออเดอร์ NT-\d{4}/.test(document.querySelector('#toasts')?.innerText || ''), null, { timeout: 15000 });
  const d = await draftNo('CH-0001');
  assert.equal(d.status, 'confirmed');
  assert.match(d.order_no, /^NT-\d{4}$/);
  const [order] = await q('select channel, status, total, line_user_id from orders where order_no = $1', [d.order_no]);
  assert.equal(order.channel, 'line_chat');
  assert.equal(Number(order.total), 2 * 55 + 1 * 60 + 1 * 45, 'lines priced from the shop, and the price typed by staff for the line the shop does not have');
  const [stock] = await q('select stock_qty from products where id = $1', [P1]);
  assert.equal(stock.stock_qty, 10, 'confirming does not take stock');
});

test('the pick slip of a confirmed order prints from the order list of the shop’s own back office (live weborders code)', skipIt, async () => {
  const d = await draftNo('CH-0001');
  await openScreen();
  await page.locator('.cd-tab', { hasText: 'ยืนยันแล้ว' }).click();
  await page.locator('.cd-row', { hasText: 'คุณครูสุดา' }).click();
  await page.locator('button[data-act="pick"]').click();
  await page.waitForFunction((no) => (document.getElementById('printArea')?.innerText || '').includes(no), d.order_no, { timeout: 15000 });
  const slip = await page.locator('#printArea').innerText();
  assert.ok(slip.includes(d.order_no), 'the slip carries the order number');
  assert.ok(slip.includes('คุณครูสุดา'), 'the slip carries the customer');
  assert.ok(slip.includes('ไม้ถูพื้น') && slip.includes('น้ำยาล้างจาน'), 'the slip lists the products');
  // and the order is in the shop’s existing order list (the weborders loader)
  const listed = await page.evaluate(async (no) => {
    const W = await NattaWO.ensure();
    return W.rows.some((o) => o.order_no === no);
  }, d.order_no);
  assert.equal(listed, true, 'the order is in the existing order list');
});

test('the POS sale takes the stock once, after confirmation; a line with no SKU is not sold through POS', skipIt, async () => {
  // CH-0001 has a line the shop has no product for: POS refuses it (there is no stock to take), and nothing changes
  await openScreen('#chatorders');
  await page.locator('.cd-tab', { hasText: 'ยืนยันแล้ว' }).click();
  await page.locator('.cd-row', { hasText: 'คุณครูสุดา' }).click();
  await page.locator('button[data-act="pos"]').click();
  await page.waitForFunction(() => !!document.querySelector('#cd-err')?.textContent, null, { timeout: 15000 });
  assert.match(await page.locator('#cd-err').innerText(), /ยังไม่ได้ผูกสินค้า/);
  assert.equal((await draftNo('CH-0001')).pos_sale_no, null, 'no sale was made');
  const [p1] = await q('select stock_qty from products where id = $1', [P1]);
  assert.equal(p1.stock_qty, 10, 'the stock is untouched');

  // CH-0002 (all lines matched) is confirmed and sold once
  await openScreen('#chatorders');
  await page.locator('.cd-tab', { hasText: 'พร้อมยืนยัน' }).click();
  await page.locator('.cd-row', { hasText: 'คุณป้าแดง' }).click();
  await page.locator('button[data-act="confirm"]').click();
  await page.waitForFunction(() => /ยืนยันเป็นออเดอร์ NT-\d{4}/.test(document.querySelector('#toasts')?.innerText || ''), null, { timeout: 15000 });
  await page.locator('button[data-act="pos"]').waitFor();
  await page.locator('button[data-act="pos"]').click();
  await page.waitForFunction(() => /ขายผ่าน POS POS-/.test(document.querySelector('#toasts')?.innerText || '') || !!document.querySelector('#cd-err')?.textContent, null, { timeout: 15000 });
  const said = await page.evaluate(() => (document.querySelector('#toasts')?.innerText || '') + ' | ' + (document.querySelector('#cd-err')?.textContent || ''));
  assert.match(said, /ขายผ่าน POS POS-/, 'the screen says the sale went through; it said: ' + said);
  const d = await draftNo('CH-0002');
  assert.match(d.pos_sale_no, /^POS-/);
  const [p1After] = await q('select stock_qty from products where id = $1', [P1]);
  assert.equal(p1After.stock_qty, 10 - 1, 'the stock went down by the quantity sold, once');
  await page.locator('button[data-act="pos"]').waitFor({ state: 'detached' });
  assert.equal(await page.locator('button[data-act="pos"]').count(), 0, 'the POS button is gone once it has sold');
  const again = await asStaff(db, (tx) => tx.query('select public.chat_draft_pos($1, $2, $3, $4) as r', [d.id, STORE, 'เงินสด', 'staff:สมชาย']));
  assert.equal(again.rows[0].r.error, 'already_sold', 'a second sale is refused by the database too');
});

test('a message pasted from the chat becomes a draft with the lines it can read', skipIt, async () => {
  await openScreen();
  await page.locator('button[data-act="paste"]').click();
  // the exact product name is linked; a short name is not guessed at: it waits for a check, with the shop's match as a suggestion
  await page.locator('#cd-paste').fill('ไม้ถูพื้น 2 อัน\nปากกาลูกลื่นน้ำเงิน 0.5=3 ด้าม\nปากกาลูกลื่นน้ำเงิน=1 ด้าม\nขอบคุณครับ');
  await page.locator('#cd-pname').fill('คุณป้าแดง');
  await page.locator('button', { hasText: 'สร้างร่าง' }).click();
  await page.waitForSelector('#cd-save');
  const no = await page.locator('.cd-no').first().innerText();
  const d = await draftNo(no.trim());
  assert.equal(d.status, 'open');
  assert.equal(d.items.length, 3, 'the thank-you line is not an item');
  assert.equal(d.items[0].product_id, P1);
  assert.equal(d.items[1].product_id, P3, 'an exact product name is linked');
  assert.equal(Number(d.items[1].qty), 3);
  assert.equal(d.items[2].product_id, null, 'a short name is not guessed at');
  assert.equal(d.items[2].status, 'review');
  assert.ok(d.items[2].suggestions.some((p) => p.id === P3), 'the shop’s match is offered as a suggestion');
  const [ch] = await q('select channel_key from chat_drafts where id = $1', [d.id]);
  assert.equal(ch.channel_key, 'manual', 'it is marked as typed in the back office, not as a LINE message');
});

test('cancel asks for a reason and the draft moves to the cancelled tab', skipIt, async () => {
  await openScreen();
  await page.locator('.cd-row', { hasText: 'คุณป้าแดง' }).first().click();
  await page.locator('button[data-act="cancel"]').click();
  await page.locator('#cd-reason').fill('ซ้ำกับใบอื่น');
  await page.locator('button', { hasText: 'ยืนยันยกเลิกร่าง' }).click();
  await page.waitForSelector('.cd-tabs');
  const cancelled = await page.locator('.cd-tab', { hasText: 'ยกเลิก' }).innerText();
  assert.match(cancelled, /ยกเลิก\s*[2-9]/);
});

test('on a phone the screen fits the width and the action bar stays on the screen', skipIt, async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openScreen();
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  assert.equal(fits, true, 'no sideways scrolling on a phone');
  await shot('phone-list');
  await page.locator('.cd-tab', { hasText: 'ยืนยันแล้ว' }).click();
  await page.locator('.cd-row', { hasText: 'คุณครูสุดา' }).click();
  await page.waitForSelector('.cd-bar');
  const fitsDetail = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  assert.equal(fitsDetail, true, 'the detail page has no sideways scrolling either');
  await shot('phone-detail');
  await page.setViewportSize({ width: 1280, height: 900 });
});

test('a link from the LINE card opens the draft straight away', skipIt, async () => {
  await openScreen('#chatorders', '?chat=CH-0004');
  await page.waitForSelector('.cd-top');
  assert.match(await page.locator('.cd-no').first().innerText(), /CH-0004/);
  assert.equal(new URL(page.url()).search, '', 'the link parameter is removed from the address after opening');
  await shot('desktop-detail');
});
