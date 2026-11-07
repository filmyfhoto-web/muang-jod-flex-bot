// An order typed in the chat, end to end: the real server (src/server.js) with stand-ins for LINE, for the shop's Supabase
// (REST) and for the AI providers. Checks what a customer, the admins and the shop's app each see — and that with the
// switch off, or the database gone, nothing changes for anybody.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createHmac } from 'node:crypto';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEmulator, PROJECT_DOCS } from './helpers/postgrest-emulator.js';
import { dayToDate } from '../src/picklist.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SECRET = 'test-channel-secret';
const CUSTOMER = 'U' + '1'.repeat(32);
const PILOT = 'U' + '3'.repeat(32);
const base = JSON.parse(readFileSync(new URL('../data/shop.json', import.meta.url), 'utf8'));
const adminIds = base.contact.people.map((p) => p.userId).filter(Boolean);
const ACK = 'ได้รับรายการสั่งซื้อแล้วค่ะ ร้านกำลังดำเนินการจัดสินค้า';

const LIST = ['ไม้กวาดทางมะพร้าว=10', 'ไม้กวาดหยักใย=2', 'ไม้ถูพื้น=10', 'แปรงขัดห้องน้ำ=10', 'ขันน้ำ=10', 'น้ำยาล้างห้องน้ำ=2แพค', 'น้ำยาล้างจาน=1แกลอน'].join('\n');
const PRODUCTS = [
  { id: 'p1', code: 'A1', name: 'ไม้ถูพื้น', unit: 'อัน', price: 55 },
  { id: 'p2', code: 'A2', name: 'แปรงขัดห้องน้ำ', unit: 'อัน', price: 25 },
  { id: 'p3', code: 'B1', name: 'ปากกาลูกลื่นน้ำเงิน 0.5', unit: 'ด้าม', price: 5 },
];

// ---- the harness -----------------------------------------------------------------------------------------------------------
async function harness({ chatOrders, ai = false, tick = false, closeDb = false, withApp = true, extraEnv = {} } = {}) {
  const h = { lineCalls: [], aiCalls: [], logs: '', dir: mkdtempSync(join(tmpdir(), 'chatorders-')) };
  const shop = { ...base, chatOrders: { ...base.chatOrders, mode: 'on', ...chatOrders } };
  writeFileSync(join(h.dir, 'shop.json'), JSON.stringify(shop));
  h.setShop = (over) => writeFileSync(join(h.dir, 'shop.json'), JSON.stringify({ ...shop, chatOrders: { ...shop.chatOrders, ...over } }));

  h.lineSrv = createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    let body = null;
    try {
      body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : null;
    } catch {
      body = null;
    }
    h.lineCalls.push({ method: req.method, path: req.url, body });
    res.writeHead(200, { 'content-type': 'application/json' });
    if (req.url.startsWith('/v2/bot/profile/')) return res.end(JSON.stringify({ displayName: 'ลูกค้า', pictureUrl: 'https://example.com/p.png' }));
    if (req.url === '/v2/bot/info') return res.end(JSON.stringify({ userId: 'U' + '9'.repeat(32), basicId: '@test' }));
    res.end('{}');
  });
  await new Promise((r) => h.lineSrv.listen(0, '127.0.0.1', r));

  // the AI provider: understands the one sentence these tests use, and invents a product to see it dropped
  h.aiSrv = createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    const said = body.messages?.[0]?.content ?? '';
    h.aiCalls.push({ path: req.url, said, key: req.headers['x-api-key'] });
    const reply = said.includes('ไม้กวาด')
      ? { order: true, items: [{ name: 'ไม้กวาด', qty: 10, unit: 'อัน' }, { name: 'น้ำยาล้างจาน', qty: 2, unit: 'แกลอน' }, { name: 'สบู่', qty: 3, unit: 'ก้อน' }], day: 28 }
      : { order: false, items: [], day: null };
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(reply) }] }));
  });
  await new Promise((r) => h.aiSrv.listen(0, '127.0.0.1', r));

  h.emu = createEmulator({
    defaults: { project_docs: PROJECT_DOCS },
    tables: {
      app_config: [{ key: 'line_bot', value: { enabled: true, relay: true, menu_card: false, admin_pick: false, docs: false, menu_style: 'both', admins: [] } }],
      app_secrets: [{ key: 'push_hook_key', value: 'hook-secret' }],
      products: PRODUCTS,
    },
  });
  const emuPort = await h.emu.listen();
  const env = {
    ...process.env,
    LINE_CHANNEL_ACCESS_TOKEN: 'test-token',
    LINE_CHANNEL_SECRET: SECRET,
    TEST_LINE_BASE: `http://127.0.0.1:${h.lineSrv.address().port}`,
    TEST_AI_BASE: `http://127.0.0.1:${h.aiSrv.address().port}`,
    SHOP_FILE: join(h.dir, 'shop.json'),
    RENDER_GIT_COMMIT: 'abc1234def5678',
    SETTINGS_TTL_MS: '300',
    SETTINGS_TIMEOUT_MS: '500',
    NODE_OPTIONS: `--import ${fileURLToPath(new URL('./helpers/redirect-fetch.mjs', import.meta.url))}`,
  };
  for (const k of ['CHATORDERS_MODE', 'CHATORDERS_ACK', 'CHATORDERS_AI', 'CHATORDERS_PILOT_IDS', 'GEMINI_API_KEY', 'ANTHROPIC_API_KEY']) delete env[k];
  Object.assign(env, extraEnv);
  if (ai) env.ANTHROPIC_API_KEY = 'test-ai-key';
  if (tick) env.CHATORDERS_ACK_TICK_MS = '150';
  if (withApp) {
    env.SUPABASE_URL = `http://127.0.0.1:${emuPort}`;
    env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
  } else {
    delete env.SUPABASE_URL;
    delete env.SUPABASE_SERVICE_ROLE_KEY;
  }
  const probe = createServer();
  await new Promise((r) => probe.listen(0, '127.0.0.1', r));
  h.port = probe.address().port;
  await new Promise((r) => probe.close(r));
  env.PORT = String(h.port);
  h.server = spawn(process.execPath, ['src/server.js'], { cwd: ROOT, env });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('server did not start: ' + h.logs)), 8000);
    const on = (d) => {
      h.logs += d.toString();
      if (/listening on/.test(h.logs)) {
        clearTimeout(t);
        resolve();
      }
    };
    h.server.stdout.on('data', on);
    h.server.stderr.on('data', on);
  });
  if (closeDb) {
    await h.emu.close();
    h.emuClosed = true;
  }

  let seq = 0;
  h.text = (t, userId = CUSTOMER) => ({ type: 'message', mode: 'active', timestamp: Date.now(), replyToken: 'rt' + ++seq, source: { type: 'user', userId }, message: { id: 'm' + h.port + '-' + seq, type: 'text', text: t, markAsReadToken: 'mr' + seq } });
  h.post = (...events) => {
    const body = JSON.stringify({ destination: 'U' + '0'.repeat(32), events });
    return fetch(`http://127.0.0.1:${h.port}/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-line-signature': createHmac('sha256', SECRET).update(body).digest('base64') }, body });
  };
  h.until = async (cond, ms = 5000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const v = cond();
      if (v) return v;
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error('timed out waiting; server log:\n' + h.logs.slice(-800) + '\nLINE calls: ' + JSON.stringify(h.lineCalls.map((c) => c.path)));
  };
  h.settle = (ms = 400) => new Promise((r) => setTimeout(r, ms));
  h.replies = () => h.lineCalls.filter((c) => c.path === '/v2/bot/message/reply');
  h.pushes = () => h.lineCalls.filter((c) => c.path === '/v2/bot/message/push');
  h.alerts = () => h.pushes().filter((p) => String(p.body.messages?.[0]?.altText ?? '').includes('รายการสั่งจัดของ'));
  h.docs = () => h.emu.db.project_docs ?? [];
  h.appNotes = () => h.emu.functions.filter((f) => f.path === '/functions/v1/push-notify');
  h.acks = () => h.pushes().filter((p) => p.body.to === CUSTOMER && String(p.body.messages?.[0]?.text ?? '').startsWith('ได้รับรายการสั่งซื้อแล้ว'));
  h.stop = async () => {
    h.server.kill();
    await new Promise((r) => h.lineSrv.close(r));
    await new Promise((r) => h.aiSrv.close(r));
    if (!h.emuClosed) await h.emu.close();
    rmSync(h.dir, { recursive: true, force: true });
  };
  return h;
}

// ---- tests -------------------------------------------------------------------------------------------------------------------
test('mode "on": the list becomes a job in the app, the admins get a card with its number, and the customer hears nothing', async (t) => {
  const h = await harness();
  t.after(h.stop);
  const quiet = h.replies().length;
  await h.post(h.text(LIST));
  await h.until(() => h.docs().length === 1 && h.alerts().length >= adminIds.length);

  // the job, as the app's own screens expect it
  const d = h.docs()[0];
  assert.equal(d.doc_no, 'PJ-0001');
  assert.equal(d.origin, 'chat');
  assert.equal(d.status, 'new');
  assert.equal(d.line_user_id, CUSTOMER);
  assert.equal(d.line_name, 'ลูกค้า');
  assert.equal(d.project_name, 'สั่งของทางแชท LINE');
  assert.equal(d.items.length, 7);
  assert.ok(d.items.every((i) => i.price === null), 'no price was written');
  assert.ok(d.note.startsWith('ข้อความจากแชท LINE:\nไม้กวาดทางมะพร้าว=10'));
  const byName = Object.fromEntries(d.items.map((i) => [i.name, i]));
  assert.equal(byName['ไม้ถูพื้น'].product_id, 'p1', 'a clear match with a product is linked');
  assert.equal(byName['แปรงขัดห้องน้ำ'].product_id, 'p2');
  assert.equal(byName['ไม้กวาดทางมะพร้าว'].review, true, 'not in the shop: the customer\'s words, to be checked');
  assert.equal(byName['ไม้กวาดทางมะพร้าว'].product_id, undefined);
  assert.equal(byName['น้ำยาล้างห้องน้ำ'].unit, 'แพ็ค');
  assert.deepEqual(h.emu.db.products, PRODUCTS, 'no product was touched');

  // the admins: one card each, naming the job and opening it
  assert.deepEqual(h.alerts().map((p) => p.body.to).sort(), [...adminIds].sort());
  const card = h.alerts()[0].body.messages[0];
  const json = JSON.stringify(card);
  for (const w of ['✅ บันทึกในแอปแล้ว PJ-0001', 'รอตรวจสอบสินค้า', 'เปิดใบ PJ-0001 ในแอป', 'https://admin.nattagroup.com/?doc=PJ-0001#projdocs']) assert.ok(json.includes(w), w);

  // the staff's phones
  await h.until(() => h.appNotes().length >= 1);
  const note = h.appNotes()[0].body;
  assert.equal(note.action, 'notify');
  assert.match(note.title, /PJ-0001/);
  assert.equal(note.url, '/#projdocs', 'the app\'s push-notify accepts only "/" or "/#word" as the page to open');

  // the customer: nothing at all
  assert.equal(h.replies().length, quiet);
  assert.ok(!h.pushes().some((p) => p.body.to === CUSTOMER), 'no push to the customer either');
});

test('mode "on": the rest of the same order joins the same job, and what the customer adds afterwards goes into its note and date', async (t) => {
  const h = await harness();
  t.after(h.stop);
  await h.post(h.text(LIST));
  await h.until(() => h.docs().length === 1 && h.alerts().length >= adminIds.length);
  const told = h.alerts().length;

  await h.post(h.text('ปากกาลูกลื่นน้ำเงิน=2โหล\nกระดาษ A4=5รีม'));
  await h.until(() => h.alerts().length >= told + adminIds.length);
  assert.equal(h.docs().length, 1, 'still one job');
  assert.equal(h.docs()[0].items.length, 9);
  assert.ok(JSON.stringify(h.alerts().at(-1).body.messages[0]).includes('✅ เพิ่มอีก 2 รายการในใบเดิม PJ-0001'));
  assert.ok(h.docs()[0].items.some((i) => i.product_id === 'p3' && i.said === 'ปากกาลูกลื่นน้ำเงิน'));

  await h.post(h.text('ฝากจัดของตามนี้จิ่มเน้อครับ ประมาณวันที่28 ครูเขาจะแวะเอาครับ ลงไว้งบนอกครับ'));
  await h.until(() => h.docs()[0].note.includes('ข้อความต่อมา:'));
  assert.equal(h.docs()[0].need_date, dayToDate(28));
  assert.equal(h.docs().length, 1);
});

test('mode "off" (the shop\'s file as it ships): the admins are told as before, nothing is written to the app', async (t) => {
  const h = await harness({ chatOrders: { mode: 'off' } });
  t.after(h.stop);
  await h.post(h.text(LIST));
  await h.until(() => h.alerts().length >= adminIds.length);
  assert.equal(h.docs().length, 0);
  const json = JSON.stringify(h.alerts()[0].body.messages[0]);
  assert.ok(!json.includes('PJ-') && !json.includes('บันทึกในแอปแล้ว'));
  assert.ok(json.includes('เปิดหน้าออเดอร์ในแอป') && json.includes('https://admin.nattagroup.com/#projdocs'));
  assert.equal(h.emu.requests.filter((r) => r.startsWith('POST /rest/v1/project_docs')).length, 0);
  assert.equal(JSON.parse(await (await fetch(`http://127.0.0.1:${h.port}/health`)).text()).orders, 'off');
});

test('mode "pilot": only the people listed are recorded; everybody else is told to the admins exactly as in "off"', async (t) => {
  const h = await harness({ chatOrders: { mode: 'pilot', pilotUserIds: [PILOT] } });
  t.after(h.stop);
  assert.equal((await (await fetch(`http://127.0.0.1:${h.port}/health`)).json()).orders, 'pilot');
  await h.post(h.text(LIST, CUSTOMER));
  await h.until(() => h.alerts().length >= adminIds.length);
  assert.equal(h.docs().length, 0, 'an ordinary customer is not recorded');
  const told = h.alerts().length;
  await h.post(h.text(LIST.replace('=10', '=11'), PILOT));
  await h.until(() => h.alerts().length >= told + adminIds.length);
  assert.equal(h.docs().length, 1);
  assert.equal(h.docs()[0].line_user_id, PILOT);
});

test('switching the mode in shop.json takes effect on the next message, with no restart', async (t) => {
  const h = await harness({ chatOrders: { mode: 'off' } });
  t.after(h.stop);
  await h.post(h.text(LIST));
  await h.until(() => h.alerts().length >= adminIds.length);
  assert.equal(h.docs().length, 0);
  h.setShop({ mode: 'on' });
  await h.post(h.text(LIST.replace('=10', '=12')));
  await h.until(() => h.docs().length === 1);
  h.setShop({ mode: 'off' });
  await h.post(h.text(LIST.replace('=10', '=13'), PILOT));
  await h.settle(600);
  assert.equal(h.docs().length, 1);
});

test('the database gone: the admins still get their card, the customer is not affected, nothing is lost but the app\'s copy', async (t) => {
  const h = await harness({ closeDb: true });
  t.after(h.stop);
  await h.settle(500); // the settings copy expires
  const quiet = h.replies().length;
  await h.post(h.text(LIST));
  await h.until(() => h.alerts().length >= adminIds.length);
  const json = JSON.stringify(h.alerts()[0].body.messages[0]);
  assert.ok(!json.includes('PJ-'));
  assert.equal(h.replies().length, quiet);
});

test('without SUPABASE_URL "on" cannot save anything: /health says so, and the admins are still told', async (t) => {
  const h = await harness({ withApp: false });
  t.after(h.stop);
  assert.equal((await (await fetch(`http://127.0.0.1:${h.port}/health`)).json()).orders, 'no-db');
  await h.post(h.text(LIST));
  await h.until(() => h.alerts().length >= adminIds.length);
});

test('ack: once the staff pick the job up in the app the customer is told, once; never while a person is talking with them', async (t) => {
  const h = await harness({ tick: true, chatOrders: { ack: { enabled: true, text: ACK, maxAgeHours: 48 } } });
  t.after(h.stop);
  await h.post(h.text(LIST));
  await h.until(() => h.docs().length === 1);
  await h.settle(700);
  assert.equal(h.acks().length, 0, 'a new job is not announced');

  // the customer is mid-conversation with an admin (the app's own state): the staff pick the job up, the bot stays out of it
  h.emu.db.line_chat_state = [{ user_id: CUSTOMER, mode: 'admin', last_ms: Date.now(), admin_ms: Date.now() }];
  h.docs()[0].status = 'working';
  h.docs()[0].updated_at = new Date().toISOString();
  await h.settle(700);
  assert.equal(h.acks().length, 0, 'a person is talking with them');

  h.emu.db.line_chat_state = [];
  await h.until(() => h.acks().length === 1);
  assert.equal(h.acks()[0].body.messages[0].text, ACK);
  await h.settle(700);
  assert.equal(h.acks().length, 1, 'once');
  h.docs()[0].status = 'done';
  await h.settle(500);
  assert.equal(h.acks().length, 1);
});

test('ack stays silent unless the shop switched it on', async (t) => {
  const h = await harness({ tick: true });
  t.after(h.stop);
  await h.post(h.text(LIST));
  await h.until(() => h.docs().length === 1);
  h.docs()[0].status = 'working';
  await h.settle(800);
  assert.equal(h.acks().length, 0);
});

test('an order in a sentence is read by the AI when the shop switched that on; what it invents is dropped, and a chat that is not an order never leaves the server', async (t) => {
  const h = await harness({ ai: true, chatOrders: { ai: { mode: 'on' } } });
  t.after(h.stop);
  await h.post(h.text('ขอสั่งไม้กวาด 10 อัน แล้วก็น้ำยาล้างจาน 2 แกลอนนะคะ วันที่ 28'));
  await h.until(() => h.docs().length === 1 && h.alerts().length >= adminIds.length);
  const d = h.docs()[0];
  assert.deepEqual(d.items.map((i) => [i.name, i.qty, i.unit, i.src]), [['ไม้กวาด', 10, 'อัน', 'ai'], ['น้ำยาล้างจาน', 2, 'แกลลอน', 'ai']], 'the invented "สบู่" is gone');
  assert.ok(d.items.every((i) => i.price === null && i.review === true));
  assert.match(d.note, /แยกรายการด้วย AI/);
  assert.equal(d.need_date, dayToDate(28));
  assert.equal(h.aiCalls.length, 1);
  assert.equal(h.aiCalls[0].said, 'ขอสั่งไม้กวาด 10 อัน แล้วก็น้ำยาล้างจาน 2 แกลอนนะคะ วันที่ 28', 'only the message text is sent');
  assert.equal(h.aiCalls[0].key, 'test-ai-key');

  await h.post(h.text('สวัสดีค่ะ ขอถามราคาปากกาหน่อยค่ะ'));
  await h.post(h.text('ขอบคุณค่ะ'));
  await h.settle(500);
  assert.equal(h.aiCalls.length, 1, 'greetings and questions are not sent anywhere');
  assert.equal(h.docs().length, 1);
});

test('the AI stays out unless it is switched on, even with a key on the server', async (t) => {
  const h = await harness({ ai: true });
  t.after(h.stop);
  await h.post(h.text('ขอสั่งไม้กวาด 10 อัน แล้วก็น้ำยาล้างจาน 2 แกลอนนะคะ'));
  await h.settle(800);
  assert.equal(h.aiCalls.length, 0);
  assert.equal(h.docs().length, 0);
});

test('the Environment page of Render wins over the shop file: CHATORDERS_MODE=pilot with an id of its own, then nothing else is recorded', async (t) => {
  const h = await harness({ chatOrders: { mode: 'off' }, extraEnv: { CHATORDERS_MODE: 'pilot', CHATORDERS_PILOT_IDS: PILOT } });
  t.after(h.stop);
  assert.equal((await (await fetch(`http://127.0.0.1:${h.port}/health`)).json()).orders, 'pilot');
  await h.post(h.text(LIST, CUSTOMER));
  await h.until(() => h.alerts().length >= adminIds.length);
  assert.equal(h.docs().length, 0, 'the file says off, the environment says pilot, and this customer is not in the pilot');
  const told = h.alerts().length;
  await h.post(h.text(LIST.replace('=10', '=14'), PILOT));
  await h.until(() => h.alerts().length >= told + adminIds.length);
  assert.equal(h.docs().length, 1);
  assert.equal(h.docs()[0].line_user_id, PILOT);
});

test('CHATORDERS_MODE=off on Render switches it off whatever the file says', async (t) => {
  const h = await harness({ chatOrders: { mode: 'on' }, extraEnv: { CHATORDERS_MODE: 'off' } });
  t.after(h.stop);
  assert.equal((await (await fetch(`http://127.0.0.1:${h.port}/health`)).json()).orders, 'off');
  await h.post(h.text(LIST));
  await h.until(() => h.alerts().length >= adminIds.length);
  assert.equal(h.docs().length, 0);
});
