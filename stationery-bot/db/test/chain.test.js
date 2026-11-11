// From the LINE message to the picking list, through the real bot (src/server.js, started as a process) on a real PostgreSQL:
//   LINE webhook (the shop's OA, and a second OA on its own webhook) → drafts CH-0001/CH-0002 → the admins' cards and the
//   app's push → a photo kept → the back office confirms (RPC as a signed-in staff member) → the order NT-… → the customer is
//   told once → the POS sale takes the stock once. LINE and the AI providers are stand-ins; everything else is the real code.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openShopDb, asService, STAFF } from '../helpers/shop-db.js';
import { startPgRest, staffJwt } from '../helpers/pg-rest.js';
import { seedBotTables } from '../helpers/app-seed.js';
import { startLine, startBot, textEvent, imageEvent, sendEvents, until, settle, JPEG } from '../helpers/bot-harness.js';

const shop = JSON.parse(readFileSync(new URL('../../data/shop.json', import.meta.url), 'utf8'));
const ADMINS = shop.contact.people.map((p) => p.userId).filter(Boolean);

const SERVICE = 'svc-service-key';
const CUSTOMER = 'U' + '1'.repeat(32);
const OTHER = 'U' + '2'.repeat(32);
const SECOND_OA_CUSTOMER = 'U' + '3'.repeat(32);
const LATE_CUSTOMER = 'U' + '4'.repeat(32);
const MAIN_SECRET = 'secret-main-oa';
const MAIN_TOKEN = 'token-main-oa';
const SECOND_SECRET = 'secret-second-oa';
const SECOND_TOKEN = 'token-second-oa';
const STORE = '22222222-2222-4222-8222-222222222222';
const P1 = '33333333-3333-4333-8333-333333333331'; // ไม้ถูพื้น 55 บาท สต็อก 10
const P2 = '33333333-3333-4333-8333-333333333332'; // น้ำยาล้างจาน 60 บาท สต็อก 5
const P3 = '33333333-3333-4333-8333-333333333333'; // ปากกาลูกลื่นน้ำเงิน 0.5 · 5 บาท · สต็อก 20
const ACK = 'ได้รับรายการสั่งซื้อแล้วค่ะ ร้านกำลังดำเนินการจัดสินค้า';

const LIST = 'ไม้ถูพื้น=10\nน้ำยาล้างจาน=1แกลอน\nไม้กวาดทางมะพร้าว=10';
const SECOND_LIST = 'ไม้ถูพื้น=2\nน้ำยาล้างจาน=1แกลลอน';

let db;
let pg;
let line;
let bot;

async function seed() {
  await seedBotTables(db);
  await db.query("insert into stores (id, name, vat_rate, doc_prefix) values ($1, 'นัฐภรณ์ คัลเลอร์แล็ป', 7, 'RC-CL')", [STORE]);
  await db.query(
    `insert into products (id, code, name, unit, price, stock_qty) values
       ($1, 'A1', 'ไม้ถูพื้น', 'อัน', 55, 10),
       ($2, 'A2', 'น้ำยาล้างจาน', 'ขวด', 60, 5),
       ($3, 'A3', 'ปากกาลูกลื่นน้ำเงิน 0.5', 'ด้าม', 5, 20)`,
    [P1, P2, P3],
  );
  await db.query(
    "insert into line_channels (key, name, shop_label, channel_secret, channel_token, enabled) values ('second', 'OA ที่ 2', 'ร้านที่สอง', $1, $2, true)",
    [SECOND_SECRET, SECOND_TOKEN],
  );
}

before(async () => {
  db = await openShopDb();
  await seed();
  pg = await startPgRest({ db, serviceKey: SERVICE });
  line = await startLine({ names: { [CUSTOMER]: 'ปู่', [SECOND_OA_CUSTOMER]: 'ครูสมศรี', [LATE_CUSTOMER]: 'คุณทดสอบ' } });
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
});
after(async () => {
  if (process.env.CHAIN_VERBOSE) process.stderr.write(bot.logs() + '\nreplies: ' + JSON.stringify(customerReplies().map((c) => c.body?.messages)) + '\n');
  bot?.stop();
  await line?.close();
  await pg?.close();
  await db?.close();
});

const wait = (cond, ms) => until(cond, { ms, logs: () => bot.logs() });
const api = async (path, { method = 'GET', body, jwt = staffJwt(STAFF), prefer = '' } = {}) => {
  const res = await fetch(`${pg.url}${path}`, {
    method,
    headers: { 'content-type': 'application/json', apikey: 'anon', authorization: `Bearer ${jwt}`, ...(prefer ? { prefer } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
};
const rows = (sql) => asService(db, (tx) => tx.query(sql)).then((r) => r.rows);
const adminCards = () =>
  line.calls.filter((c) => c.path === '/v2/bot/message/push' && ADMINS.includes(c.body?.to) && JSON.stringify(c.body?.messages ?? []).includes('ออเดอร์จากแชท'));
const customerReplies = () => line.calls.filter((c) => c.path === '/v2/bot/message/reply');
const acksTo = (uid) => line.calls.filter((c) => c.path === '/v2/bot/message/push' && c.body?.to === uid && JSON.stringify(c.body?.messages ?? []).includes(ACK));

test("the shop's OA: a list becomes the draft CH-0001 with its lines linked or waiting for a check, and the admins get one card", async () => {
  const repliesBefore = customerReplies().length;
  await sendEvents(bot.port, { secret: MAIN_SECRET, events: [textEvent(CUSTOMER, LIST, 'm1')] });
  await wait(async () => adminCards().length >= ADMINS.length);
  const [draft] = await rows("select * from chat_drafts where draft_no = 'CH-0001'");
  assert.equal(draft.status, 'open');
  assert.equal(draft.channel_key, 'main');
  assert.equal(draft.line_user_id, CUSTOMER);
  assert.equal(draft.customer_name, 'ปู่', 'a new customer starts with the LINE name');
  assert.equal(draft.items.length, 3);
  const [water, soap, broom] = draft.items;
  assert.equal(water.product_id, P1);
  assert.equal(soap.product_id, P2, "น้ำยาล้างจาน is the shop's product, linked by its name");
  assert.equal(soap.unit, 'แกลลอน', 'the unit is written the way the shop writes it');
  assert.equal(broom.product_id, null, "not in the shop: waits for a check, with the customer's words");
  assert.equal(broom.status, 'review');
  assert.equal(broom.name, 'ไม้กวาดทางมะพร้าว');
  assert.ok(draft.items.every((x) => x.price === null), 'no price is guessed');
  const card = JSON.stringify(adminCards()[0].body);
  assert.ok(card.includes('ออเดอร์จากแชท CH-0001'));
  assert.ok(card.includes('จาก นัฐภรณ์ เชียงกลาง'), 'the card names the OA the customer wrote to');
  assert.ok(card.includes('1 รายการรอตรวจสอบสินค้า'));
  assert.equal(customerReplies().length, repliesBefore, 'the customer gets no reply while the order is gathered');
  await wait(() => pg.functions.some((f) => f.path === '/functions/v1/push-notify' && String(f.body?.title).includes('CH-0001')));
  const note = pg.functions.find((f) => String(f.body?.title).includes('CH-0001')).body;
  assert.equal(note.url, '/#chatorders', 'the phone note opens the back office page the app accepts');
});

test('the same message again changes nothing: one message row, the same lines, no second card', async () => {
  const cards = adminCards().length;
  await sendEvents(bot.port, { secret: MAIN_SECRET, events: [textEvent(CUSTOMER, LIST, 'm1')] });
  await settle();
  const [draft] = await rows("select items from chat_drafts where draft_no = 'CH-0001'");
  assert.equal(draft.items.length, 3);
  assert.equal((await rows("select count(*)::int as n from chat_messages where line_message_id = 'm1'"))[0].n, 1);
  assert.equal(adminCards().length, cards);
});

test('a follow-up line joins the same draft; the admins are not sent a card again within the card interval', async () => {
  const cards = adminCards().length;
  await sendEvents(bot.port, { secret: MAIN_SECRET, events: [textEvent(CUSTOMER, 'ปากกาลูกลื่นน้ำเงิน=2โหล', 'm2')] });
  await wait(async () => (await rows("select jsonb_array_length(items) as n from chat_drafts where draft_no = 'CH-0001'"))[0].n === 4);
  const [line4] = (await rows("select items->3 as x from chat_drafts where draft_no = 'CH-0001'")).map((r) => r.x);
  assert.equal(line4.product_id, P3);
  assert.equal(line4.unit, 'โหล');
  assert.equal(adminCards().length, cards, 'merged within three minutes: no card');
  // the history row is written just after the items are (a moment later): wait for it rather than assume the order
  await until(async () => (await rows("select 1 from chat_draft_events where action = 'merged' and draft_id = (select id from chat_drafts where draft_no = 'CH-0001')")).length > 0, { ms: 8000, logs: () => bot.logs() });
});

test('a general note from the same customer is kept in the draft; a greeting from someone without a draft creates nothing', async () => {
  await sendEvents(bot.port, { secret: MAIN_SECRET, events: [textEvent(CUSTOMER, 'ฝากจัดของตามนี้นะครับ วันที่ 28 ครูจะมารับ', 'm3')] });
  await wait(async () => (await rows("select note from chat_drafts where draft_no = 'CH-0001'"))[0].note.includes('วันที่ 28'));
  const [d] = await rows("select need_date::text as need, note from chat_drafts where draft_no = 'CH-0001'");
  assert.match(d.need, /^\d{4}-\d{2}-28$/, 'the day in the message becomes the date needed');
  await sendEvents(bot.port, { secret: MAIN_SECRET, events: [textEvent(OTHER, 'ขอบคุณค่ะ', 'm4')] });
  await settle();
  assert.equal((await rows(`select count(*)::int as n from chat_drafts where line_user_id = '${OTHER}'`))[0].n, 0);
  assert.equal((await rows("select count(*)::int as n from chat_messages where line_message_id = 'm4'"))[0].n, 0);
});

test('a photo sent while the order is open is kept in the private bucket, linked to the draft', async () => {
  const repliesBefore = customerReplies().length;
  await sendEvents(bot.port, { secret: MAIN_SECRET, events: [imageEvent(CUSTOMER, 'm5')] });
  await wait(() => [...pg.storage.keys()].some((k) => k.startsWith('chat-media/main/CH-0001/m5')));
  const [m] = await rows("select kind, media_path from chat_messages where line_message_id = 'm5'");
  assert.equal(m.kind, 'image');
  assert.equal(m.media_path, 'main/CH-0001/m5.jpg');
  const stored = pg.storage.get('chat-media/main/CH-0001/m5.jpg');
  assert.equal(stored.contentType, 'image/jpeg');
  assert.equal(stored.bytes.length, JPEG.length);
  // the bot's own thank-you for a picture (once per pictureReplyMinutes) may follow; it must not carry the order
  await settle(400);
  const said = customerReplies().slice(repliesBefore).map((c) => JSON.stringify(c.body?.messages ?? []));
  assert.ok(said.every((s) => !s.includes('CH-0001') && !s.includes(ACK)), 'no order message goes to the customer while the order is open');
});

test("a second OA has its own webhook: its list becomes CH-0002 under that OA, with nothing replied through its token", async () => {
  const r = await sendEvents(bot.port, { path: '/webhook/ch/second', secret: SECOND_SECRET, events: [textEvent(SECOND_OA_CUSTOMER, SECOND_LIST, 'x1')] });
  assert.equal(r.status, 200);
  await wait(async () => (await rows("select count(*)::int as n from chat_drafts where draft_no = 'CH-0002'"))[0].n === 1);
  const [d] = await rows("select channel_key, status, items from chat_drafts where draft_no = 'CH-0002'");
  assert.equal(d.channel_key, 'second');
  assert.equal(d.items.length, 2);
  assert.ok(d.items.every((x) => x.product_id), "both lines are the shop's products");
  await wait(async () => adminCards().some((c) => JSON.stringify(c.body).includes('จาก ร้านที่สอง')));
  assert.ok(!line.calls.some((c) => c.path === '/v2/bot/message/reply' && c.auth.includes(SECOND_TOKEN)), 'nothing is replied through the second OA');
});

test("a second OA's webhook refuses a wrong signature and an unknown OA", async () => {
  const event = textEvent(SECOND_OA_CUSTOMER, SECOND_LIST, 'x2');
  const bad = await sendEvents(bot.port, { path: '/webhook/ch/second', secret: 'not-the-secret', events: [event] });
  assert.equal(bad.status, 401);
  const unknown = await sendEvents(bot.port, { path: '/webhook/ch/nowhere', secret: SECOND_SECRET, events: [event] });
  assert.equal(unknown.status, 404);
  assert.equal((await rows("select count(*)::int as n from chat_messages where line_message_id = 'x2'"))[0].n, 0);
});

test('the back office sees the drafts, but cannot write the tables by hand and cannot read the OA secrets', async () => {
  const list = await api('/rest/v1/chat_drafts?select=draft_no,status&order=draft_no.asc');
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.map((d) => d.draft_no), ['CH-0001', 'CH-0002']);
  const direct = await api('/rest/v1/chat_drafts', { method: 'POST', body: { draft_no: 'CH-9999', channel_key: 'main', line_user_id: 'Ux' }, prefer: 'return=representation' });
  assert.equal(direct.status, 403, 'writes go through the functions only');
  const secrets = await api('/rest/v1/line_channels?select=channel_secret');
  assert.equal(secrets.status, 403, 'the OA secrets are not visible to staff');
});

test('the staff save the draft (one line priced by hand), confirm it into an order NT-…, and the customer is told once', async () => {
  const [d] = (await api('/rest/v1/chat_drafts?select=id,version,items,note,need_date&draft_no=eq.CH-0001')).body;
  const items = d.items.map((x, i) => (i === 2 ? { ...x, staff_ok: true, price: 45 } : x)); // the broom: staff accept the words and price it
  const saved = await api('/rest/v1/rpc/chat_draft_save', {
    method: 'POST',
    body: { p_draft: d.id, p_version: d.version, p_items: items, p_name: 'ปู่', p_phone: '0812345678', p_school: 'โรงเรียนบ้านทดสอบ', p_need_date: d.need_date, p_note: d.note, p_actor: 'staff:สมชาย' },
  });
  assert.equal(saved.body.ok, true, JSON.stringify(saved.body));
  const confirmed = await api('/rest/v1/rpc/chat_draft_confirm', { method: 'POST', body: { p_draft: d.id, p_version: saved.body.version, p_actor: 'staff:สมชาย' } });
  assert.equal(confirmed.body.ok, true, JSON.stringify(confirmed.body));
  assert.match(confirmed.body.order_no, /^NT-\d{4}$/);
  assert.equal(confirmed.body.total, 10 * 55 + 1 * 60 + 10 * 45 + 2 * 5, 'linked lines priced from the products, the hand-priced line as typed');
  const [order] = await rows(`select channel, status, line_user_id, total from orders where order_no = '${confirmed.body.order_no}'`);
  assert.deepEqual({ ...order, total: Number(order.total) }, { channel: 'line_chat', status: 'pending', line_user_id: CUSTOMER, total: 1070 });

  await wait(() => acksTo(CUSTOMER).length === 1);
  await settle(700);
  assert.equal(acksTo(CUSTOMER).length, 1, 'once, never repeated');
  const [after] = await rows("select status, ack_sent_at is not null as told from chat_drafts where draft_no = 'CH-0001'");
  assert.deepEqual(after, { status: 'confirmed', told: true });
});

test("the second OA's order goes to the POS once: the stock goes down by what was sold, and a second sale is refused", async () => {
  const [d] = (await api('/rest/v1/chat_drafts?select=id,version,items&draft_no=eq.CH-0002')).body;
  const v = await api('/rest/v1/rpc/chat_draft_save', {
    method: 'POST',
    body: { p_draft: d.id, p_version: d.version, p_items: d.items, p_name: 'ครูสมศรี', p_phone: null, p_school: null, p_need_date: null, p_note: null, p_actor: 'staff:สมชาย' },
  });
  assert.equal(v.body.ok, true, JSON.stringify(v.body));
  const c = await api('/rest/v1/rpc/chat_draft_confirm', { method: 'POST', body: { p_draft: d.id, p_version: v.body.version, p_actor: 'staff:สมชาย' } });
  assert.equal(c.body.ok, true, JSON.stringify(c.body));
  const before = (await rows(`select id, stock_qty from products where id in ('${P1}','${P2}') order by id`)).map((r) => r.stock_qty);
  const sold = await api('/rest/v1/rpc/chat_draft_pos', { method: 'POST', body: { p_draft: d.id, p_store: STORE, p_method: 'เงินสด', p_actor: 'staff:สมชาย' } });
  assert.equal(sold.body.ok, true, JSON.stringify(sold.body));
  assert.match(sold.body.sale_no, /^POS-/);
  const after = (await rows(`select id, stock_qty from products where id in ('${P1}','${P2}') order by id`)).map((r) => r.stock_qty);
  assert.deepEqual(after.map((x, i) => before[i] - x), [2, 1], 'sold 2 ไม้ถูพื้น and 1 น้ำยาล้างจาน: taken once');
  const again = await api('/rest/v1/rpc/chat_draft_pos', { method: 'POST', body: { p_draft: d.id, p_store: STORE, p_method: 'เงินสด', p_actor: 'staff:สมชาย' } });
  assert.equal(again.body.error, 'already_sold');
  const stock2 = (await rows(`select id, stock_qty from products where id in ('${P1}','${P2}') order by id`)).map((r) => r.stock_qty);
  assert.deepEqual(stock2, after, 'the second attempt took nothing');
});

test('a person with the customer holds the acknowledgement; it goes out once they are done', async () => {
  await sendEvents(bot.port, { secret: MAIN_SECRET, events: [textEvent(LATE_CUSTOMER, 'ไม้ถูพื้น=1\nน้ำยาล้างจาน=1', 'm6')] });
  const d = await wait(async () => (await rows(`select id, version, items, note, need_date from chat_drafts where line_user_id = '${LATE_CUSTOMER}' and status = 'open'`))[0]);
  await db.query(
    "insert into line_chat_state (user_id, mode, last_ms) values ($1, 'admin', $2) on conflict (user_id) do update set mode = 'admin', last_ms = $2",
    [LATE_CUSTOMER, Date.now()],
  );
  const saved = await api('/rest/v1/rpc/chat_draft_save', {
    method: 'POST',
    body: { p_draft: d.id, p_version: d.version, p_items: d.items, p_name: 'คุณทดสอบ', p_phone: null, p_school: null, p_need_date: d.need_date, p_note: d.note, p_actor: 'staff:สมชาย' },
  });
  assert.equal(saved.body.ok, true, JSON.stringify(saved.body));
  const done = await api('/rest/v1/rpc/chat_draft_confirm', { method: 'POST', body: { p_draft: d.id, p_version: saved.body.version, p_actor: 'staff:สมชาย' } });
  assert.equal(done.body.ok, true, JSON.stringify(done.body));
  await settle(800); // several passes of the acknowledgement timer
  assert.equal(acksTo(LATE_CUSTOMER).length, 0, 'nothing is sent while a person is with the customer');
  await db.query("update line_chat_state set mode = 'bot' where user_id = $1", [LATE_CUSTOMER]); // the person is done
  await wait(() => acksTo(LATE_CUSTOMER).length === 1);
  await settle(500);
  assert.equal(acksTo(LATE_CUSTOMER).length, 1, 'and only once');
});

test('the draft keeps the whole history in order, written by the bot and by staff', async () => {
  const ev = await rows("select actor, action from chat_draft_events where draft_id = (select id from chat_drafts where draft_no = 'CH-0001') order by id");
  const actions = ev.map((e) => e.action);
  for (const a of ['created', 'merged', 'note', 'photo', 'edited', 'confirmed', 'ack_sent']) assert.ok(actions.includes(a), a);
  assert.ok(actions.indexOf('created') < actions.indexOf('edited'));
  assert.ok(actions.indexOf('edited') < actions.indexOf('confirmed'));
  assert.ok(actions.indexOf('confirmed') < actions.indexOf('ack_sent'));
  const sold = await rows("select actor, action from chat_draft_events where draft_id = (select id from chat_drafts where draft_no = 'CH-0002') order by id");
  assert.deepEqual(sold.map((e) => e.action), ['created', 'edited', 'confirmed', 'pos_sold']);
});

test('/health says the drafts are on', async () => {
  const h = await (await fetch(`http://127.0.0.1:${bot.port}/health`)).json();
  assert.equal(h.drafts, 'on');
  assert.equal(h.orders, 'off', 'the old project-document path stays off');
  assert.equal(h.app, 'off', 'the app answers stay off: the drafts have their own database settings and do not switch them on');
});
