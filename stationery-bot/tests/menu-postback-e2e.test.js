// The first rich-menu button ("ต้องการพิมพ์คุย กดเลย") is a postback so that LINE opens the keyboard at once and shows the customer's
// own bubble. The bot gets a postback event (no text): this runs the real server (src/server.js) against a stand-in for LINE and checks
// that such a tap is answered like the words it stands for — the "who do you want to talk to?" card — and nothing else is.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createHmac } from 'node:crypto';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRichMenu } from '../src/richmenu.js';
import { postbackAsMessage } from '../src/postback.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SECRET = 'test-channel-secret';
const CUSTOMER = 'U' + '1'.repeat(32);
const shop = JSON.parse(readFileSync(new URL('../data/shop.json', import.meta.url), 'utf8'));
const names = shop.contact.people.map((p) => p.name);

async function harness() {
  const h = { lineCalls: [], logs: '', dir: mkdtempSync(join(tmpdir(), 'menupb-')) };
  writeFileSync(join(h.dir, 'shop.json'), JSON.stringify(shop));
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
    res.end('{}');
  });
  await new Promise((r) => h.lineSrv.listen(0, '127.0.0.1', r));
  const env = {
    ...process.env,
    LINE_CHANNEL_ACCESS_TOKEN: 'test-token',
    LINE_CHANNEL_SECRET: SECRET,
    TEST_LINE_BASE: `http://127.0.0.1:${h.lineSrv.address().port}`,
    SHOP_FILE: join(h.dir, 'shop.json'),
    NODE_OPTIONS: `--import ${fileURLToPath(new URL('./helpers/redirect-fetch.mjs', import.meta.url))}`,
  };
  for (const k of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'CHATORDERS_MODE', 'CHATDRAFTS_MODE', 'GEMINI_API_KEY', 'ANTHROPIC_API_KEY', 'BOT_PAUSED']) delete env[k];
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
  let seq = 0;
  const base = (userId) => ({ mode: 'active', timestamp: Date.now(), replyToken: 'rt' + ++seq, webhookEventId: 'ev' + h.port + '-' + seq, source: { type: 'user', userId } });
  h.text = (t, userId = CUSTOMER) => ({ ...base(userId), type: 'message', message: { id: 'm' + seq, type: 'text', text: t } });
  h.postback = (data, userId = CUSTOMER) => ({ ...base(userId), type: 'postback', postback: { data } });
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
    throw new Error('timed out; server log:\n' + h.logs.slice(-600) + '\nLINE calls: ' + JSON.stringify(h.lineCalls.map((c) => c.path)));
  };
  h.settle = (ms = 500) => new Promise((r) => setTimeout(r, ms));
  h.replies = () => h.lineCalls.filter((c) => c.path === '/v2/bot/message/reply');
  h.stop = async () => {
    h.server.kill();
    await new Promise((r) => h.lineSrv.close(r));
    rmSync(h.dir, { recursive: true, force: true });
  };
  return h;
}

test('the first menu button is a postback that opens the keyboard and shows the customer\'s own bubble', () => {
  const a = buildRichMenu(shop).areas[0].action;
  assert.deepEqual(a, { type: 'postback', label: 'คุยกับแอดมิน', data: 'talk-admin', displayText: 'ต้องการคุยกับแอดมิน', inputOption: 'openKeyboard' });
  assert.ok([...a.label].length <= 20 && a.data.length <= 300 && [...a.displayText].length <= 300);
});

test('postback buttons: the keyboard and the bubble text are optional, other columns are untouched', () => {
  const menu = (areas) => buildRichMenu({ richMenu: { areas } });
  const m = menu([{ label: 'พิมพ์', postback: 'go', displayText: 'ขอพิมพ์', openKeyboard: true, fillInText: 'สอบถาม ' }, { text: 'สั่งของ' }]);
  assert.deepEqual(m.areas[0].action, { type: 'postback', label: 'พิมพ์', data: 'go', displayText: 'ขอพิมพ์', inputOption: 'openKeyboard', fillInText: 'สอบถาม ' });
  assert.deepEqual(m.areas[1].action, { type: 'message', label: 'สั่งของ', text: 'สั่งของ' });
  // without openKeyboard no keyboard option is sent; without displayText no bubble text
  assert.deepEqual(menu([{ postback: 'x', label: 'x' }]).areas[0].action, { type: 'postback', label: 'x', data: 'x' });
  assert.throws(() => menu([{ postback: 'y'.repeat(301) }]), /300/);
});

test('a menu postback becomes the text it stands for; other postbacks and ordinary messages are left alone', () => {
  const ev = { type: 'postback', replyToken: 'r', webhookEventId: 'e1', source: { userId: 'U1' }, postback: { data: 'talk-admin' } };
  const m = postbackAsMessage(ev, shop);
  assert.equal(m.type, 'message');
  assert.equal(m.message.type, 'text');
  assert.equal(m.message.text, 'คุยกับแอดมิน');
  assert.equal(m.replyToken, 'r');
  assert.equal(m.source.userId, 'U1');
  const other = { ...ev, postback: { data: 'pd:cancel' } };
  assert.equal(postbackAsMessage(other, shop), other);
  const msg = { type: 'message', message: { type: 'text', text: 'สวัสดี' } };
  assert.equal(postbackAsMessage(msg, shop), msg);
  assert.equal(postbackAsMessage({ type: 'postback', postback: {} }, shop).type, 'postback');
});

test('real server: tapping the button gets the "who do you want to talk to?" card with every admin\'s name', async (t) => {
  const h = await harness();
  t.after(h.stop);
  const r = await h.post(h.postback('talk-admin'));
  assert.equal(r.status, 200);
  const reply = await h.until(() => h.replies()[0]);
  const json = JSON.stringify(reply.body.messages);
  assert.match(json, /ต้องการติดต่อใครคะ/);
  for (const n of names) assert.ok(json.includes(n), n);
  assert.equal(reply.body.replyToken.startsWith('rt'), true);
});

test('real server: a postback it does not know gets no answer', async (t) => {
  const h = await harness();
  t.after(h.stop);
  await h.post(h.postback('something-else'));
  await h.settle();
  assert.equal(h.replies().length, 0);
});

test('real server: after a name was tapped (an hour of quiet) the button still brings the card back', async (t) => {
  const h = await harness();
  t.after(h.stop);
  await h.post(h.text(names[0])); // the customer taps a name → the bot goes quiet for them
  await h.settle(700);
  const before = h.replies().length;
  await h.post(h.postback('talk-admin'));
  await h.until(() => h.replies().length > before);
  assert.match(JSON.stringify(h.replies().at(-1).body.messages), /ต้องการติดต่อใครคะ/);
});
