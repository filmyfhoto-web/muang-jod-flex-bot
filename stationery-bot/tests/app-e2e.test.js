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

async function boot({ withApp }) {
  const linePort = await startLine();
  emu = createEmulator({
    tables: {
      app_config: [{ key: 'line_bot', value: settings }],
      app_secrets: [{ key: 'line_notify', value: JSON.stringify([{ id: 'U' + '7'.repeat(32), name: 'พนักงาน' }]) }],
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
    NODE_OPTIONS: `--import ${fileURLToPath(new URL('./helpers/redirect-fetch.mjs', import.meta.url))}`,
  };
  if (withApp) {
    env.SUPABASE_URL = `http://127.0.0.1:${emuPort}`;
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
    assert.deepEqual(await (await fetch(`http://127.0.0.1:${port}/health`)).json(), { ok: true, app: 'on' });
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

test('without SUPABASE_URL the Render bot answers exactly as before', async (t) => {
  await boot({ withApp: false });
  t.after(stop);
  assert.deepEqual(await (await fetch(`http://127.0.0.1:${port}/health`)).json(), { ok: true, app: 'off' });
  await post(text('เวลาเปิดร้าน'));
  const reply = await until(() => replies().at(-1));
  assert.equal(reply.body.messages.length, 1);
  await post(text('ขอใบสั่งซื้อ NT-0044', BUYER));
  await new Promise((r) => setTimeout(r, 500));
  // today the Render bot reads this as an order and offers its own "who do you want to talk to" card — never an order card
  assert.ok(!JSON.stringify(replies().map((c) => c.body)).includes('NT-0044'), 'no order card without the app features');
});
