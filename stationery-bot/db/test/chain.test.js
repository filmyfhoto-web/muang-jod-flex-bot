// From the LINE message to the picking list, through the real bot (src/server.js, started as a process) on a real PostgreSQL:
//   LINE webhook (the shop's OA, and a second OA on its own webhook) → drafts CH-0001/CH-0002 → the admins' cards and the
//   app's push → a photo kept → the back office confirms (RPC as a signed-in staff member) → the order NT-… → the customer is
//   told once → the POS sale takes the stock once. LINE and the AI providers are stand-ins; everything else is the real code.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openShopDb, asService, STAFF } from '../helpers/shop-db.js';
import { startPgRest, staffJwt } from '../helpers/pg-rest.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url)); // stationery-bot/
const PRELOAD = fileURLToPath(new URL('../../tests/helpers/redirect-fetch.mjs', import.meta.url));
const shop = JSON.parse(readFileSync(new URL('../../data/shop.json', import.meta.url), 'utf8'));
const ADMINS = shop.contact.people.map((p) => p.userId).filter(Boolean);

const SERVICE = 'svc-service-key';
const CUSTOMER = 'U' + '1'.repeat(32);
const OTHER = 'U' + '2'.repeat(32);
const SECOND_OA_CUSTOMER = 'U' + '3'.repeat(32);
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
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]);

let db;
let pg;
let line;
let lineSrv;
let bot;
let port;
let logs = '';
const lineCalls = [];

const sign = (body, secret) => createHmac('sha256', secret).update(body).digest('base64');

// the LINE API as a stand-in: profiles, the photo, and every message the bot sends (recorded for the assertions)
async function startLine() {
  lineSrv = createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks);
    let body = null;
    try {
      body = raw.length ? JSON.parse(raw.toString('utf8')) : null;
    } catch {
      body = null;
    }
    lineCalls.push({ method: req.method, path: req.url, auth: String(req.headers.authorization || ''), body });
    if (req.url.includes('/content')) {
      res.writeHead(200, { 'content-type': 'image/jpeg' });
      return res.end(JPEG);
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    if (req.url.startsWith('/v2/bot/profile/')) {
      const uid = decodeURIComponent(req.url.split('/').pop());
      const displayName = uid === CUSTOMER ? 'ปู่' : uid === SECOND_OA_CUSTOMER ? 'ครูสมศรี' : 'ลูกค้า';
      return res.end(JSON.stringify({ displayName, pictureUrl: 'https://example.com/p.png' }));
    }
    res.end('{}');
  });
  await new Promise((r) => lineSrv.listen(0, '127.0.0.1', r));
  return lineSrv.address().port;
}

// the shop's rows for this test, and the bot's own app tables (app_config, app_secrets, line_*), made as the database owner
async function seed() {
  await db.exec(`
    create table app_config (key text primary key, value jsonb, updated_at timestamptz default now());
    create table app_secrets (key text primary key, value text, updated_at timestamptz default now());
    create table line_chat_state (user_id text primary key, mode text not null default 'bot', admin_ms bigint, last_ms bigint,
      seen_ms bigint, menu_ms bigint, admin_name text, updated_at timestamptz not null default now());
    create table line_doc_state (line_user_id text primary key, step text, data jsonb, updated_at timestamptz default now());
    create table line_school_links (line_user_id text not null, school_id uuid not null, line_name text, friend boolean,
      first_at timestamptz not null default now(), last_at timestamptz not null default now(), visits integer not null default 0,
      primary key (line_user_id, school_id));
    grant all on app_config, app_secrets, line_chat_state, line_doc_state, line_school_links to service_role;
  `);
  await db.query("insert into app_config (key, value) values ('line_bot', $1::jsonb)", [
    JSON.stringify({ enabled: true, relay: true, menu_card: false, admin_pick: false, docs: false, menu_style: 'both' }),
  ]);
  await db.query("insert into app_secrets (key, value) values ('push_hook_key', 'hook-key')");
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

async function startBot() {
  line = await startLine();
  pg = await startPgRest({ db, serviceKey: SERVICE });
  const probe = createServer();
  await new Promise((r) => probe.listen(0, '127.0.0.1', r));
  port = probe.address().port;
  await new Promise((r) => probe.close(r));
  const env = {
    ...process.env,
    PORT: String(port),
    LINE_CHANNEL_ACCESS_TOKEN: MAIN_TOKEN,
    LINE_CHANNEL_SECRET: MAIN_SECRET,
    TEST_LINE_BASE: `http://127.0.0.1:${line}`,
    RENDER_GIT_COMMIT: 'chain0001',
    SETTINGS_TTL_MS: '300',
    SETTINGS_TIMEOUT_MS: '1500',
    SUPABASE_URL: pg.url,
    SUPABASE_SERVICE_ROLE_KEY: SERVICE,
    CHATDRAFTS_MODE: 'on',
    CHATDRAFTS_AI: 'off',
    CHATDRAFTS_ACK: 'on',
    CHATDRAFTS_ACK_TICK_MS: '200',
    NODE_OPTIONS: `--import ${PRELOAD}`,
  };
  delete env.GEMINI_API_KEY;
  delete env.ANTHROPIC_API_KEY;
  bot = spawn(process.execPath, ['src/server.js'], { cwd: ROOT, env });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('the bot did not start:\n' + logs)), 15000);
    const on = (d) => {
      logs += d.toString();
      if (/listening on/.test(logs)) {
        clearTimeout(t);
        resolve();
      }
    };
    bot.stdout.on('data', on);
    bot.stderr.on('data', on);
  });
}

async function stopBot() {
  bot?.kill();
  await new Promise((r) => lineSrv?.close(r));
  await pg?.close();
}

let seq = 0;
const msg = (userId, text, id) => ({ type: 'message', mode: 'active', timestamp: Date.now(), replyToken: 'rt' + ++seq, source: { type: 'user', userId }, message: { id, type: 'text', text, markAsReadToken: 'mr' + seq } });
const img = (userId, id) => ({ type: 'message', mode: 'active', timestamp: Date.now(), replyToken: 'rt' + ++seq, source: { type: 'user', userId }, message: { id, type: 'image' } });

async function webhook(events, { oa = 'main' } = {}) {
  const body = JSON.stringify({ destination: 'U' + '0'.repeat(32), events });
  const path = oa === 'main' ? '/webhook' : `/webhook/ch/${oa}`;
  const secret = oa === 'main' ? MAIN_SECRET : SECOND_SECRET;
  return fetch(`http://127.0.0.1:${port}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-line-signature': sign(body, secret) },
    body,
  });
}

async function until(cond, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await cond();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 40));
  }
  throw new Error('timed out waiting; the bot said:\n' + logs.slice(-1200));
}
const settle = (ms = 500) => new Promise((r) => setTimeout(r, ms));

// one request to the database's REST API as a signed-in staff member (or with the service key)
async function api(path, { method = 'GET', body, jwt = staffJwt(STAFF), prefer = '' } = {}) {
  const res = await fetch(`${pg.url}${path}`, {
    method,
    headers: { 'content-type': 'application/json', apikey: 'anon', authorization: `Bearer ${jwt}`, ...(prefer ? { prefer } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

const rows = (sql) => asService(db, (tx) => tx.query(sql)).then((r) => r.rows);
const adminCards = () =>
  lineCalls.filter((c) => c.path === '/v2/bot/message/push' && ADMINS.includes(c.body?.to) && JSON.stringify(c.body?.messages ?? []).includes('ออเดอร์จากแชท'));
const customerReplies = () => lineCalls.filter((c) => c.path === '/v2/bot/message/reply');
const acksTo = (uid) => lineCalls.filter((c) => c.path === '/v2/bot/message/push' && c.body?.to === uid && JSON.stringify(c.body?.messages ?? []).includes(ACK));

before(async () => {
  db = await openShopDb();
  await seed();
  await startBot();
});
after(async () => {
  if (process.env.CHAIN_VERBOSE) process.stderr.write(logs + '\nreplies: ' + JSON.stringify(customerReplies().map((c) => c.body?.messages)) + '\n'); // what the bot logged and said during the run
  await stopBot();
  await db?.close();
});

test("the shop's OA: a list becomes the draft CH-0001 with its lines linked or waiting for a check, and the admins get one card", async () => {
  const before = customerReplies().length;
  await webhook([msg(CUSTOMER, LIST, 'm1')]);
  await until(async () => adminCards().length >= ADMINS.length);
  const [draft] = await rows("select * from chat_drafts where draft_no = 'CH-0001'");
  assert.equal(draft.status, 'open');
  assert.equal(draft.channel_key, 'main');
  assert.equal(draft.line_user_id, CUSTOMER);
  assert.equal(draft.customer_name, 'ปู่', 'a new customer starts with the LINE name');
  assert.equal(draft.items.length, 3);
  const [water, soap, broom] = draft.items;
  assert.equal(water.product_id, P1);
  assert.equal(soap.product_id, P2, 'น้ำยาล้างจาน is the shop\'s product, linked by its name');
  assert.equal(soap.unit, 'แกลลอน', 'the unit is written the way the shop writes it');
  assert.equal(broom.product_id, null, 'not in the shop: waits for a check, with the customer\'s words');
  assert.equal(broom.status, 'review');
  assert.equal(broom.name, 'ไม้กวาดทางมะพร้าว');
  assert.ok(draft.items.every((x) => x.price === null), 'no price is guessed');
  const card = JSON.stringify(adminCards()[0].body);
  assert.ok(card.includes('ออเดอร์จากแชท CH-0001'));
  assert.ok(card.includes('จาก นัฐภรณ์ เชียงกลาง'), 'the card names the OA the customer wrote to');
  assert.ok(card.includes('1 รายการรอตรวจสอบสินค้า'));
  assert.equal(customerReplies().length, before, 'the customer gets no reply while the order is gathered');
  await until(() => pg.functions.some((f) => f.path === '/functions/v1/push-notify' && String(f.body?.title).includes('CH-0001')));
  const note = pg.functions.find((f) => String(f.body?.title).includes('CH-0001')).body;
  assert.equal(note.url, '/#chatorders', 'the phone note opens the back office page the app accepts');
});

test('the same message again changes nothing: one message row, the same lines, no second card', async () => {
  const cards = adminCards().length;
  await webhook([msg(CUSTOMER, LIST, 'm1')]);
  await settle();
  const [draft] = await rows("select items from chat_drafts where draft_no = 'CH-0001'");
  assert.equal(draft.items.length, 3);
  assert.equal((await rows("select count(*)::int as n from chat_messages where line_message_id = 'm1'"))[0].n, 1);
  assert.equal(adminCards().length, cards);
});

test('a follow-up line joins the same draft; the admins are not sent a card again within the card interval', async () => {
  const cards = adminCards().length;
  await webhook([msg(CUSTOMER, 'ปากกาลูกลื่นน้ำเงิน=2โหล', 'm2')]);
  await until(async () => (await rows("select jsonb_array_length(items) as n from chat_drafts where draft_no = 'CH-0001'"))[0].n === 4);
  const [line4] = (await rows("select items->3 as x from chat_drafts where draft_no = 'CH-0001'")).map((r) => r.x);
  assert.equal(line4.product_id, P3);
  assert.equal(line4.unit, 'โหล');
  assert.equal(adminCards().length, cards, 'merged within three minutes: no card');
  const events = await rows("select action from chat_draft_events where draft_id = (select id from chat_drafts where draft_no = 'CH-0001') order by id");
  assert.ok(events.some((e) => e.action === 'merged'));
});

test('a general note from the same customer is kept in the draft; a greeting from someone without a draft creates nothing', async () => {
  await webhook([msg(CUSTOMER, 'ฝากจัดของตามนี้นะครับ วันที่ 28 ครูจะมารับ', 'm3')]);
  await until(async () => (await rows("select note from chat_drafts where draft_no = 'CH-0001'"))[0].note.includes('วันที่ 28'));
  const [d] = await rows("select need_date::text as need, note from chat_drafts where draft_no = 'CH-0001'");
  assert.match(d.need, /^\d{4}-\d{2}-28$/, 'the day in the message becomes the date needed');
  await webhook([msg(OTHER, 'ขอบคุณค่ะ', 'm4')]);
  await settle();
  assert.equal((await rows("select count(*)::int as n from chat_drafts where line_user_id = '" + OTHER + "'"))[0].n, 0);
  assert.equal((await rows("select count(*)::int as n from chat_messages where line_message_id = 'm4'"))[0].n, 0);
});

test('a photo sent while the order is open is kept in the private bucket, linked to the draft', async () => {
  const replies = customerReplies().length;
  await webhook([img(CUSTOMER, 'm5')]);
  await until(() => [...pg.storage.keys()].some((k) => k.startsWith('chat-media/main/CH-0001/m5')));
  const [m] = await rows("select kind, media_path from chat_messages where line_message_id = 'm5'");
  assert.equal(m.kind, 'image');
  assert.equal(m.media_path, 'main/CH-0001/m5.jpg');
  const stored = pg.storage.get('chat-media/main/CH-0001/m5.jpg');
  assert.equal(stored.contentType, 'image/jpeg');
  assert.equal(stored.bytes.length, JPEG.length);
  // the bot's own thank-you for a picture (once per pictureReplyMinutes) may follow; it must not carry the order
  await settle(400);
  const said = customerReplies().slice(replies).map((c) => JSON.stringify(c.body?.messages ?? []));
  assert.ok(said.every((s) => !s.includes('CH-0001') && !s.includes(ACK)), 'no order message goes to the customer while the order is open');
});

test("a second OA has its own webhook: its list becomes CH-0002 under that OA, with no reply sent to its customer", async () => {
  const r = await webhook([msg(SECOND_OA_CUSTOMER, SECOND_LIST, 'x1')], { oa: 'second' });
  assert.equal(r.status, 200);
  await until(async () => (await rows("select count(*)::int as n from chat_drafts where draft_no = 'CH-0002'"))[0].n === 1);
  const [d] = await rows("select channel_key, status, items from chat_drafts where draft_no = 'CH-0002'");
  assert.equal(d.channel_key, 'second');
  assert.equal(d.items.length, 2);
  assert.ok(d.items.every((x) => x.product_id), "both lines are the shop's products");
  await until(async () => adminCards().some((c) => JSON.stringify(c.body).includes('จาก ร้านที่สอง')));
  assert.ok(!lineCalls.some((c) => c.path === '/v2/bot/message/reply' && c.auth.includes(SECOND_TOKEN)), 'nothing is replied through the second OA');
});

test("a second OA's webhook refuses a wrong signature and an unknown OA", async () => {
  const body = JSON.stringify({ destination: 'U' + '0'.repeat(32), events: [msg(SECOND_OA_CUSTOMER, SECOND_LIST, 'x2')] });
  const bad = await fetch(`http://127.0.0.1:${port}/webhook/ch/second`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-line-signature': sign(body, 'not-the-secret') }, body });
  assert.equal(bad.status, 401);
  const unknown = await fetch(`http://127.0.0.1:${port}/webhook/ch/nowhere`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-line-signature': sign(body, SECOND_SECRET) }, body });
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
  const confirmed = await api('/rest/v1/rpc/chat_draft_confirm', {
    method: 'POST',
    body: { p_draft: d.id, p_version: saved.body.version, p_actor: 'staff:สมชาย' },
  });
  assert.equal(confirmed.body.ok, true, JSON.stringify(confirmed.body));
  assert.match(confirmed.body.order_no, /^NT-\d{4}$/);
  assert.equal(confirmed.body.total, 10 * 55 + 1 * 60 + 10 * 45 + 2 * 5, 'linked lines priced from the products, the hand-priced line as typed');
  const [order] = await rows(`select channel, status, line_user_id, total from orders where order_no = '${confirmed.body.order_no}'`);
  assert.deepEqual({ ...order, total: Number(order.total) }, { channel: 'line_chat', status: 'pending', line_user_id: CUSTOMER, total: 1070 });

  await until(() => acksTo(CUSTOMER).length === 1);
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
  const h = await (await fetch(`http://127.0.0.1:${port}/health`)).json();
  assert.equal(h.drafts, 'on');
  assert.equal(h.orders, 'off', 'the old project-document path stays off');
});
