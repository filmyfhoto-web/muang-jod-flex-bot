// From a LINE message to the pick slip, through the real pieces: the customer's list reaches the bot's webhook; the bot makes the draft;
// the staff check it in the back office (the live shell and the live weborders module) and confirm it; the customer is told once after
// the confirmation; the pick slip prints from the order list; the POS sale takes the stock once. LINE and the shell's Supabase host
// and CDN script are stand-ins. The bot, the database functions and the back-office code are the real ones.
// Run with:  NATTA_LIVE_DIR=<folder with files/admin and modules> npm run test:ui
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openShopDb, asService, asStaff, STAFF } from '../helpers/shop-db.js';
import { startPgRest, staffJwt } from '../helpers/pg-rest.js';
import { seedBotTables } from '../helpers/app-seed.js';
import { startLine, startBot, textEvent, sendEvents, until, settle } from '../helpers/bot-harness.js';
import { liveDir, playwright, serveShell, staffSession, routeOffline, PROJECT_REF } from '../helpers/back-office.js';
import { seedShopCatalogue, seedBackOffice, STORE, P1, P3 } from '../helpers/back-office-db.js';

const LIVE = liveDir();
const SERVICE = 'svc-service-key';
const CUSTOMER = 'U' + '7'.repeat(32);
const MAIN_SECRET = 'secret-main-oa';
const MAIN_TOKEN = 'token-main-oa';
const ACK = 'ได้รับรายการสั่งซื้อแล้วค่ะ ร้านกำลังดำเนินการจัดสินค้า';
const P4 = '33333333-3333-4333-8333-333333333334'; // ไม้กวาดทางมะพร้าว 45 บาท สต็อก 6 (the shop has it; the customer wrote a part of its name)
// the customer's list: "ไม้กวาด" is not a sure match (the bot offers the shop's product as a suggestion and waits for a check)
const LIST = 'ไม้ถูพื้น=2\nไม้กวาด=1\nปากกาลูกลื่นน้ำเงิน 0.5=3 ด้าม';

let db, pg, line, bot, shell, browser, page;
let orderNo = null;

const q = (sql, params = []) => asService(db, (tx) => tx.query(sql, params)).then((r) => r.rows);
const stockOf = async () => Object.fromEntries((await q(`select id, stock_qty from products where id in ('${P1}','${P3}','${P4}')`)).map((r) => [r.id, r.stock_qty]));
const wait = (cond, ms = 15000) => until(cond, { ms, logs: () => bot.logs() });
const ackTo = () => line.calls.filter((c) => c.path === '/v2/bot/message/push' && c.body?.to === CUSTOMER && JSON.stringify(c.body?.messages ?? []).includes(ACK));
const toasts = () => page.evaluate(() => document.querySelector('#toasts')?.innerText || '');

before(async () => {
  if (!LIVE) return;
  db = await openShopDb();
  await seedBotTables(db);
  await seedShopCatalogue(db);
  await db.query("insert into products (id, code, name, unit, price, stock_qty) values ($1, 'A4', 'ไม้กวาดทางมะพร้าว', 'ด้าม', 45, 6)", [P4]);
  await seedBackOffice(db, { weborders: LIVE + '/modules/weborders.js' });
  pg = await startPgRest({ db, serviceKey: SERVICE });
  line = await startLine({ names: { [CUSTOMER]: 'ปู่' } });
  bot = await startBot({
    env: {
      LINE_CHANNEL_ACCESS_TOKEN: MAIN_TOKEN,
      LINE_CHANNEL_SECRET: MAIN_SECRET,
      TEST_LINE_BASE: `http://127.0.0.1:${line.port}`,
      CHATDRAFTS_SUPABASE_URL: pg.url,
      CHATDRAFTS_SERVICE_ROLE_KEY: SERVICE,
      CHATDRAFTS_MODE: 'on',
      CHATDRAFTS_AI: 'off',
      CHATDRAFTS_ACK: 'on',
      CHATDRAFTS_ACK_TICK_MS: '200',
    },
  });
  shell = await serveShell();
  browser = await playwright().chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await routeOffline(context, pg.url);
  await context.addInitScript(
    ({ key, session }) => {
      try {
        localStorage.setItem(key, JSON.stringify(session));
      } catch (_) {
        /* about:blank has no storage */
      }
      window.print = () => {};
    },
    { key: `sb-${PROJECT_REF}-auth-token`, session: staffSession(staffJwt(STAFF, 'staff@test.local'), STAFF) },
  );
  page = await context.newPage();
});

after(async () => {
  if (!LIVE) return;
  await browser?.close();
  await shell?.close();
  bot?.stop();
  await line?.close();
  await pg?.close();
  await db?.close();
});

const skipIt = LIVE ? {} : { skip: 'set NATTA_LIVE_DIR to a folder with files/admin and modules/weborders.js (a copy of the live back office)' };

test('the list from LINE reaches the bot, which makes the draft; the customer gets nothing while the staff check it', skipIt, async () => {
  const r = await sendEvents(bot.port, { secret: MAIN_SECRET, events: [textEvent(CUSTOMER, LIST, 'c1')] });
  assert.equal(r.status, 200);
  const d = await wait(async () => (await q("select * from chat_drafts where line_user_id = $1 and status = 'open'", [CUSTOMER]))[0]);
  assert.equal(d.draft_no, 'CH-0001');
  assert.equal(d.items.length, 3);
  assert.equal(d.items[0].product_id, P1, 'the shop’s product is matched by its name');
  assert.equal(d.items[1].status, 'review', 'a part of a name the shop cannot tell apart waits for a check');
  assert.ok(d.items[1].suggestions.some((p) => p.id === P4), 'with the shop’s product offered as a suggestion');
  assert.equal(d.items[1].price, null, 'no price is guessed');
  assert.equal(d.items[2].product_id, P3);
  await settle(400);
  assert.equal(ackTo().length, 0, 'nothing goes to the customer before the staff confirm');
});

test('the staff check the line in the back office and confirm it: the order NT-… is made, and the customer is told once', skipIt, async () => {
  await page.goto('about:blank');
  await page.goto(`${shell.url}/admin/index.html#chatorders`);
  await page.waitForSelector('.cd-tabs');
  await page.locator('.cd-row', { hasText: 'ปู่' }).click();
  await page.waitForSelector('#cd-save');
  await page.locator('.cd-line', { hasText: 'ไม้กวาด' }).locator('button', { hasText: 'ใช้ ไม้กวาดทางมะพร้าว' }).click();
  await page.locator('#cd-save').click();
  await page.waitForFunction(() => (document.querySelector('#toasts')?.innerText || '').includes('บันทึกแล้ว'));
  await page.locator('button[data-act="confirm"]').click();
  await page.waitForFunction(() => /ยืนยันเป็นออเดอร์ NT-\d{4}/.test(document.querySelector('#toasts')?.innerText || ''), null, { timeout: 15000 });
  orderNo = (await toasts()).match(/NT-\d{4}/)[0];
  const [o] = await q('select channel, status, line_user_id, total from orders where order_no = $1', [orderNo]);
  assert.equal(o.channel, 'line_chat');
  assert.equal(o.status, 'pending');
  assert.equal(o.line_user_id, CUSTOMER, 'the order is linked to the LINE customer');
  assert.equal(Number(o.total), 2 * 55 + 1 * 45 + 3 * 5, 'every line priced from the shop’s products');
  const stock = await stockOf();
  assert.deepEqual([stock[P1], stock[P4], stock[P3]], [10, 6, 20], 'confirming takes no stock');
  await wait(() => ackTo().length === 1);
  await settle(600);
  assert.equal(ackTo().length, 1, 'told once, after the confirmation');
});

test('the pick slip prints from the order list of the back office, with the customer and the lines', skipIt, async () => {
  await page.locator('button[data-act="pick"]').click();
  await page.waitForFunction((no) => (document.getElementById('printArea')?.innerText || '').includes(no), orderNo, { timeout: 15000 });
  const slip = await page.locator('#printArea').innerText();
  assert.ok(slip.includes('ปู่'), 'the slip carries the customer');
  for (const name of ['ไม้ถูพื้น', 'ไม้กวาดทางมะพร้าว', 'ปากกาลูกลื่นน้ำเงิน 0.5']) assert.ok(slip.includes(name), `the slip lists ${name}`);
  const listed = await page.evaluate(async (no) => (await NattaWO.ensure()).rows.some((o) => o.order_no === no), orderNo);
  assert.equal(listed, true, 'the order is in the existing order list of the back office');
});

test('the POS sale takes the stock once, by each line’s quantity; a second sale is refused', skipIt, async () => {
  await page.locator('button[data-act="pos"]').click();
  await page.waitForFunction(() => /ขายผ่าน POS POS-/.test(document.querySelector('#toasts')?.innerText || ''), null, { timeout: 15000 });
  const s = await stockOf();
  assert.deepEqual([s[P1], s[P4], s[P3]], [10 - 2, 6 - 1, 20 - 3], 'each product went down by what was sold, once');
  const [d] = await q("select id from chat_drafts where draft_no = 'CH-0001'");
  const again = await asStaff(db, (tx) => tx.query('select public.chat_draft_pos($1, $2, $3, $4) as r', [d.id, STORE, 'เงินสด', 'staff:สมชาย']));
  assert.equal(again.rows[0].r.error, 'already_sold', 'a second sale is refused');
  const after = await stockOf();
  assert.deepEqual([after[P1], after[P4], after[P3]], [8, 5, 17], 'and it took nothing');
});

test('the draft’s history shows the whole path: created by the bot, edited, confirmed, told, and sold', skipIt, async () => {
  const ev = await q("select action, actor from chat_draft_events where draft_id = (select id from chat_drafts where draft_no = 'CH-0001') order by id");
  const actions = ev.map((e) => e.action);
  for (const a of ['created', 'edited', 'confirmed', 'ack_sent', 'pos_sold']) assert.ok(actions.includes(a), a);
  assert.equal(ev[0].action, 'created');
  assert.equal(ev[0].actor, 'bot', 'the bot made the draft');
  assert.ok(actions.indexOf('confirmed') < actions.indexOf('ack_sent'), 'the customer is told after the confirmation');
  assert.ok(actions.indexOf('confirmed') < actions.indexOf('pos_sold'));
});
