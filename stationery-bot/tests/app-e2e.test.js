// The real server (src/server.js) talking to stand-ins for LINE and for the shop's Supabase (REST + Storage), through the
// real @supabase/supabase-js. Checks the wiring end to end: signature → app features → the Render bot's own answers.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createEmulator } from './helpers/postgrest-emulator.js';
import { sameAdmin } from '../src/app/names.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SECRET = 'test-channel-secret';
const CUSTOMER = 'U' + '1'.repeat(32);
const BUYER = 'U' + '2'.repeat(32);
const shopFile = JSON.parse(readFileSync(new URL('../data/shop.json', import.meta.url), 'utf8'));
const piin = shopFile.contact.people.find((p) => sameAdmin(p.name, 'เจ้ปิ่น'));

let emu;
let lineSrv;
let server;
let port;
const lineCalls = [];
let logs = '';

const settings = { enabled: true, relay: true, menu_card: true, admin_pick: true, docs: true, menu_style: 'both', admins: [{ name: 'เจ้ปิ่น', note: 'ร้านเครื่องเขียน' }, { name: 'หญิง', note: '' }, { name: 'ฟิล์ม', note: '' }] };

async function startLine() {
  lineSrv = createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    let body = null;
    try {
      body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : null;
    } catch {
      body = null;
    }
    lineCalls.push({ method: req.method, path: req.url, body });
    res.writeHead(200, { 'content-type': 'application/json' });
    if (req.url.startsWith('/v2/bot/profile/')) return res.end(JSON.stringify({ displayName: 'ลูกค้า', pictureUrl: 'https://example.com/p.png' }));
    if (req.url === '/v2/bot/info') return res.end(JSON.stringify({ userId: 'U' + '9'.repeat(32), basicId: '@test' }));
    res.end('{}');
  });
  await new Promise((r) => lineSrv.listen(0, '127.0.0.1', r));
  return lineSrv.address().port;
}

async function boot({ withApp, badDb = false }) {
  const linePort = await startLine();
  emu = createEmulator({
    tables: {
      app_config: [{ key: 'line_bot', value: settings }],
      app_secrets: [{ key: 'line_notify', value: JSON.stringify([{ id: 'U' + '7'.repeat(32), name: 'พนักงาน' }]) }, { key: 'push_hook_key', value: 'hook-secret' }],
      orders: [{ id: 'o1', order_no: 'NT-0044', status: 'new', line_user_id: BUYER, line_notify: '', orderer_name: 'ครูสมชาย', org: 'โรงเรียนทดสอบ', project: 'โครงการ', total: 150, school_id: null }],
      order_items: [{ order_id: 'o1', name: 'ปากกา', qty: 2, product_id: 'p1', sort: 1, line_total: 30 }],
    },
  });
  const emuPort = await emu.listen();
  const env = {
    ...process.env,
    PORT: '0',
    LINE_CHANNEL_ACCESS_TOKEN: 'test-token',
    LINE_CHANNEL_SECRET: SECRET,
    TEST_LINE_BASE: `http://127.0.0.1:${linePort}`,
    RENDER_GIT_COMMIT: 'abc1234def5678',
    SETTINGS_TTL_MS: '300',
    SETTINGS_TIMEOUT_MS: '500',
    NODE_OPTIONS: `--import ${fileURLToPath(new URL('./helpers/redirect-fetch.mjs', import.meta.url))}`,
  };
  if (withApp) {
    env.SUPABASE_URL = badDb ? 'http://127.0.0.1:9' : `http://127.0.0.1:${emuPort}`;
    env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
  } else {
    delete env.SUPABASE_URL;
    delete env.SUPABASE_SERVICE_ROLE_KEY;
  }
  // a fixed free port: ask the OS, then hand it over
  const probe = createServer();
  await new Promise((r) => probe.listen(0, '127.0.0.1', r));
  port = probe.address().port;
  await new Promise((r) => probe.close(r));
  env.PORT = String(port);
  server = spawn(process.execPath, ['src/server.js'], { cwd: ROOT, env });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('server did not start: ' + logs)), 8000);
    const on = (d) => {
      logs += d.toString();
      if (/listening on/.test(logs)) {
        clearTimeout(t);
        resolve();
      }
    };
    server.stdout.on('data', on);
    server.stderr.on('data', on);
  });
}

async function stop() {
  server?.kill();
  await new Promise((r) => lineSrv?.close(r));
  await emu?.close();
  lineCalls.length = 0;
  logs = '';
}

const sign = (body) => createHmac('sha256', SECRET).update(body).digest('base64');
let seq = 0;
const ev = (type, userId, message) => ({ type, mode: 'active', timestamp: Date.now(), replyToken: 'rt' + ++seq, source: { type: 'user', userId }, ...(message ? { message: { id: 'm' + seq, ...message } } : {}) });
const text = (t, userId = CUSTOMER) => ev('message', userId, { type: 'text', text: t, markAsReadToken: 'mr' + seq });
async function post(...events) {
  const body = JSON.stringify({ destination: 'U' + '0'.repeat(32), events });
  return fetch(`http://127.0.0.1:${port}/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-line-signature': sign(body) }, body });
}
async function until(cond, ms = 4000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = cond();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error('timed out waiting; server log:\n' + logs.slice(-600) + '\nLINE calls: ' + JSON.stringify(lineCalls.map((c) => c.path)));
}
const replies = () => lineCalls.filter((c) => c.path === '/v2/bot/message/reply');
const pushes = () => lineCalls.filter((c) => c.path === '/v2/bot/message/push');

test('with the app features on', async (t) => {
  await boot({ withApp: true });
  t.after(stop);

  await t.test('health says the app features are on; a wrong signature is refused', async () => {
    assert.deepEqual(await (await fetch(`http://127.0.0.1:${port}/health`)).json(), { ok: true, app: 'on', assist: 'ready', build: 'abc1234' });
    const r = await fetch(`http://127.0.0.1:${port}/webhook`, { method: 'POST', headers: { 'x-line-signature': 'nope' }, body: '{"events":[]}' });
    assert.equal(r.status, 401);
  });

  await t.test('order card: answered from the database, marked read, tagged "c:sent"', async () => {
    const r = await post(text('ขอใบสั่งซื้อ NT-0044', BUYER));
    assert.equal(r.status, 200);
    const reply = await until(() => replies().at(-1));
    assert.equal(reply.body.messages[0].type, 'flex');
    assert.match(reply.body.messages[0].altText, /NT-0044/);
    await until(() => lineCalls.some((c) => c.path === '/v2/bot/chat/markAsRead'));
    await until(() => /c:sent/.test(emu.db.orders[0].line_notify));
  });

  await t.test('follow: the menu card, and the customer is remembered in line_chat_state', async () => {
    const n = replies().length;
    await post(ev('follow', CUSTOMER));
    const reply = await until(() => replies().length > n && replies().at(-1));
    assert.deepEqual(reply.body.messages.map((m) => m.type), ['text', 'imagemap']);
    const row = await until(() => emu.db.line_chat_state?.find((r) => r.user_id === CUSTOMER));
    assert.ok(row.seen_ms && row.menu_ms);
  });

  await t.test('an ordinary question is answered by the Render bot itself, not with a second menu', async () => {
    const n = replies().length;
    await post(text('เวลาเปิดร้าน'));
    const reply = await until(() => replies().length > n && replies().at(-1));
    assert.equal(reply.body.messages.length, 1);
    assert.match(JSON.stringify(reply.body.messages[0]), /06\.30|เวลาเปิด/);
    assert.notEqual(reply.body.messages[0].type, 'imagemap');
  });

  await t.test('pick an admin: asked, confirmed, quiet afterwards, and the chosen person is told (push)', async () => {
    let n = replies().length;
    await post(text('คุยกับแอดมิน'));
    let reply = await until(() => replies().length > n && replies().at(-1));
    assert.equal(reply.body.messages[0].type, 'flex');
    n = replies().length;
    await post(text('คุยกับเจ้ปิ่น'));
    reply = await until(() => replies().length > n && replies().at(-1));
    assert.match(reply.body.messages[0].text, /เลือกคุยกับ เจ้ปิ่น/);
    const row = await until(() => emu.db.line_chat_state.find((r) => r.user_id === CUSTOMER && r.mode === 'admin'));
    assert.equal(row.admin_name, 'เจ้ปิ่น');
    const push = await until(() => pushes().find((p) => p.body.to === piin.userId));
    assert.equal(push.body.messages[0].type, 'flex');
    // quiet: a question in the window is not answered by anybody
    const before = replies().length;
    await post(text('เวลาเปิดร้าน'));
    await new Promise((r) => setTimeout(r, 400));
    assert.equal(replies().length, before);
  });

  await t.test('"ส่งเอกสารโครงการ" gives the link card', async () => {
    const n = replies().length;
    await post(text('ส่งเอกสารโครงการ', BUYER));
    const reply = await until(() => replies().length > n && replies().at(-1));
    assert.match(JSON.stringify(reply.body.messages), /pj\.html/);
  });
});

test('the Render bot\'s own commands are not taken by the app\'s cards: the menu command, pausing and resuming', async (t) => {
  await boot({ withApp: true });
  t.after(stop);
  const ask = async (said, userId) => {
    const n = replies().length;
    await post(text(said, userId));
    return (await until(() => replies().length > n && replies().at(-1))).body.messages;
  };
  const menuCalls = () => lineCalls.filter((c) => c.path.includes('richmenu'));

  // an admin's first message in ages is "ติดตั้งเมนู": the shop menu card (switched on) must not swallow it. The Render bot's
  // own answer is "not switched on" (shop.json richMenu.enabled is false: the shop's own menu in LINE is the one in use)
  let msgs = await ask('ติดตั้งเมนู', piin.userId);
  assert.match(msgs[0].text, /ยังไม่เปิดให้บอทติดตั้งเมนู/);
  assert.equal(menuCalls().length, 0, 'nothing was done to the menus');

  // a customer who types the same words is just a customer: the shop menu card
  msgs = await ask('ติดตั้งเมนู', CUSTOMER);
  assert.deepEqual(msgs.map((m) => m.type), ['text', 'imagemap']);

  // "ปิดบอท": customers get nothing; the admin's "เปิดบอท" still gets through, and then customers are answered again
  msgs = await ask('ปิดบอท 1', piin.userId);
  assert.match(msgs[0].text, /ปิดบอทชั่วคราว 1 ชั่วโมง/);
  const n = replies().length;
  await post(text('เวลาเปิดร้าน', BUYER));
  await new Promise((r) => setTimeout(r, 400));
  assert.equal(replies().length, n, 'paused: nobody is answered');
  msgs = await ask('เปิดบอท', piin.userId);
  assert.match(msgs[0].text, /เปิดบอทแล้ว/);
  assert.ok((await ask('เวลาเปิดร้าน', BUYER)).length >= 1, 'answered again');
});

const LIST = ['ไม้กวาดทางมะพร้าว=10', 'ไม้กวาดหยักใย=2', 'ไม้ถูพื้น=10', 'แปรงขัดห้องน้ำ=10', 'ขันน้ำ=10', 'น้ำยาล้างห้องน้ำ=2แพค', 'น้ำยาล้างจาน=1แกลอน'].join('\n');
const adminIds = shopFile.contact.people.map((p) => p.userId).filter(Boolean);
const listAlerts = () => pushes().filter((p) => String(p.body.messages?.[0]?.altText ?? '').includes('รายการสั่งจัดของ'));

test('an order written as a list: every admin gets a card, the web app a note, and the customer neither a menu nor a reply', async (t) => {
  await boot({ withApp: true }); // the shop menu is switched on here: as the customer's first message the list would have got the menu card
  t.after(stop);
  const n = replies().length;
  await post(text(LIST, CUSTOMER));
  await until(() => listAlerts().length >= adminIds.length);
  assert.deepEqual(listAlerts().map((p) => p.body.to).sort(), [...adminIds].sort());
  const card = listAlerts()[0].body.messages[0];
  assert.equal(card.altText, '📋 มีรายการสั่งจัดของ — ไลน์ชื่อ ลูกค้า (7 รายการ)');
  const json = JSON.stringify(card);
  for (const w of ['ไม้กวาดทางมะพร้าว', 'น้ำยาล้างห้องน้ำ', '2 แพค', 'https://www.nattagroup.com/#weborders']) assert.ok(json.includes(w), w);
  await until(() => emu.requests.includes('POST /functions/v1/push-notify'));
  assert.equal(replies().length, n, 'nothing was said to the customer');

  // the same list again: the admins already know
  const told = listAlerts().length;
  await post(text(LIST, CUSTOMER));
  await new Promise((r) => setTimeout(r, 400));
  assert.equal(listAlerts().length, told);

  // what the customer writes next, which the bot cannot answer, goes to the admins as one line each
  await post(text('ฝากจัดของตามนี้จิ่มเน้อครับ ประมาณวันที่28 ครูเขาจะแวะเอาครับ ลงไว้งบนอกครับ', CUSTOMER));
  const notes = () => pushes().filter((p) => String(p.body.messages?.[0]?.text ?? '').startsWith('📝 ข้อความต่อจากรายการสั่งจัดของ'));
  await until(() => notes().length >= adminIds.length);
  assert.match(notes()[0].body.messages[0].text, /ไลน์ชื่อ ลูกค้า[\s\S]*ประมาณวันที่28/);
  assert.equal(replies().length, n, 'still nothing said to the customer, and no menu card');
  assert.equal(notes().length, adminIds.length, 'told once, not twice');
});

test('without SUPABASE_URL an order list still reaches the admins\' LINE (the web app note needs the database)', async (t) => {
  await boot({ withApp: false });
  t.after(stop);
  await post(text(LIST, 'U' + '6'.repeat(32)));
  await until(() => listAlerts().length >= adminIds.length);
  assert.ok(!emu.requests.some((r) => r.includes('push-notify')));
  assert.equal(replies().length, 0);
});

test('without SUPABASE_URL the Render bot answers exactly as before', async (t) => {
  await boot({ withApp: false });
  t.after(stop);
  assert.deepEqual(await (await fetch(`http://127.0.0.1:${port}/health`)).json(), { ok: true, app: 'off', assist: 'off', build: 'abc1234' });
  await post(text('เวลาเปิดร้าน'));
  const reply = await until(() => replies().at(-1));
  assert.equal(reply.body.messages.length, 1);
  await post(text('ขอใบสั่งซื้อ NT-0044', BUYER));
  await new Promise((r) => setTimeout(r, 500));
  // today the Render bot reads this as an order and offers its own "who do you want to talk to" card — never an order card
  assert.ok(!JSON.stringify(replies().map((c) => c.body)).includes('NT-0044'), 'no order card without the app features');
  // the shop's rich menu has a "คุยกับแอดมิน" button: with the app's admin picker off, the Render bot's own "who?" card answers it
  const n = replies().length;
  await post(text('คุยกับแอดมิน', 'U' + '8'.repeat(32)));
  const card = await until(() => replies().length > n && replies().at(-1));
  assert.match(JSON.stringify(card.body.messages), /ต้องการติดต่อใครคะ/);
});

test('the Studio\'s engine: faq_bot.mode "all" answers everybody with the rules saved in the Studio; "admins" only the admins', async (t) => {
  await boot({ withApp: true });
  t.after(stop);
  const rules = [{ id: 'r1', name: 'เวลา', enabled: true, match: 'contains', keywords: ['เวลาเปิดร้าน'], replies: [{ type: 'text', text: 'ข้อความจากหน้า Studio' }], quick: true }];
  const setMode = (mode) => {
    const row = emu.db.app_config.find((r) => r.key === 'faq_bot');
    const value = { mode, admins: [{ name: 'เจ้ปิ่น', userId: piin.userId }, { name: 'หญิง', userId: 'U' + '5'.repeat(32) }, { name: 'ฟิล์ม', userId: 'U' + '6'.repeat(32) }], content: { rules } };
    if (row) row.value = value;
    else emu.db.app_config.push({ key: 'faq_bot', value });
  };
  const ask = async (userId) => {
    const n = replies().length;
    await post(text('เวลาเปิดร้าน', userId));
    const reply = await until(() => replies().length > n && replies().at(-1));
    return reply.body.messages[0];
  };
  // the app's settings: nothing switched on, so everything unclaimed reaches the answering engines
  emu.db.app_config.find((r) => r.key === 'line_bot').value = { enabled: true, menu_card: false, admin_pick: false, docs: false, admins: settings.admins };

  setMode('off');
  assert.equal((await ask(CUSTOMER)).type, 'flex', 'off: the Render bot\'s own card');
  setMode('admins');
  await new Promise((r) => setTimeout(r, 450)); // the settings are re-read after SETTINGS_TTL_MS
  assert.equal((await ask('U' + '3'.repeat(32))).type, 'flex', 'admins mode: a customer still gets the Render bot\'s card');
  assert.equal((await ask(piin.userId)).text, 'ข้อความจากหน้า Studio', 'admins mode: an admin is answered by the Studio rule');
  setMode('all');
  await new Promise((r) => setTimeout(r, 450));
  assert.equal((await ask('U' + '4'.repeat(32))).text, 'ข้อความจากหน้า Studio', 'all: everybody');

  // an admin's "ปิดบอท" is the Render bot's own and silences everybody, in the trial mode too; "เปิดบอท" brings it back
  setMode('admins');
  await new Promise((r) => setTimeout(r, 450));
  const n = replies().length;
  await post(text('ปิดบอท 1', piin.userId));
  assert.match((await until(() => replies().length > n && replies().at(-1))).body.messages[0].text, /ปิดบอทชั่วคราว 1 ชั่วโมง/);
  const m = replies().length;
  await post(text('เวลาเปิดร้าน', 'U' + '3'.repeat(32)));
  await new Promise((r) => setTimeout(r, 400));
  assert.equal(replies().length, m, 'paused: a customer gets nothing');
  const k = replies().length;
  await post(text('เปิดบอท', piin.userId));
  assert.match((await until(() => replies().length > k && replies().at(-1))).body.messages[0].text, /เปิดบอทแล้ว/);
  assert.equal((await ask('U' + '8'.repeat(32))).type, 'flex', 'resumed: customers are answered again (by the Render bot: the trial mode is for admins only)');
});

test('a database address or key that does not work: /health says no-db and the Render bot still answers', async (t) => {
  await boot({ withApp: true, badDb: true });
  t.after(stop);
  assert.deepEqual(await (await fetch(`http://127.0.0.1:${port}/health`)).json(), { ok: true, app: 'no-db', assist: 'ready', build: 'abc1234' });
  await post(text('เวลาเปิดร้าน'));
  const reply = await until(() => replies().at(-1));
  assert.equal(reply.body.messages.length, 1);
  assert.equal(pushes().length, 0);
});
