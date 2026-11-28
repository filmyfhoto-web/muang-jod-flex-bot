// From the customer's LINE message to the back office page and back, through the real bot (src/server.js, started as a process) on a real
// PostgreSQL (migrations 002 + 003). LINE is a stand-in that can be told to accept, refuse, fail or say "already accepted":
//   customer writes → the bot records it in the page's chat (text, picture, sticker; once) and answers the customer exactly as before →
//   staff queue a reply (as a signed-in staff member, through the same RPC the page calls) → the bot pushes it to LINE with the queue's
//   retry key → the page learns "sent" only from LINE's acceptance · a refusal says why · a LINE error is tried again with the same key ·
//   "already accepted" counts as sent · off / pilot / no database / a broken database each do what they should and never stop the bot.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { openSaleDb } from '../helpers/sale-db.js';
import { asService, STAFF } from '../helpers/shop-db.js';
import { startPgRest, staffJwt } from '../helpers/pg-rest.js';
import { startLine, startBot, textEvent, imageEvent, sendEvents, until, settle, JPEG } from '../helpers/bot-harness.js';

const SERVICE = 'svc-service-key';
const SECRET = 'secret-main-oa';
const TOKEN = 'token-main-oa';
const user = (c) => 'U' + c.repeat(32);
const NAMES = {
  [user('1')]: 'ปู่',
  [user('2')]: 'ครูสมศรี',
  [user('3')]: 'คุณมะลิ',
  [user('4')]: 'คุณเอ',
  [user('5')]: 'คุณบี',
  [user('6')]: 'คุณซี',
  [user('7')]: 'คุณดี',
  [user('8')]: 'คุณอี',
  [user('9')]: 'คุณเอฟ',
  [user('a')]: 'ผู้ทดลอง',
  [user('b')]: 'คนนอกรายชื่อ',
};

let db;
let pg;
let line;
let pushN = 0;
let script = () => null; // (call) → { status, headers, body } to answer a staff reply push in a special way, or null for “accepted”

const started = (async () => {
  db = await openSaleDb({ line: true });
  pg = await startPgRest({ db, serviceKey: SERVICE });
  line = await startLine({
    names: NAMES,
    respond: (call) => {
      if (call.path === '/v2/bot/message/quota') return { body: { type: 'limited', value: 300 } };
      if (call.path === '/v2/bot/message/quota/consumption') return { body: { totalUsage: 120 } };
      // the bridge’s own pushes carry LINE’s retry key; the bot’s other pushes (cards to the admins) do not and are always accepted
      if (call.path === '/v2/bot/message/push') return (call.retryKey && script(call)) || { status: 200, headers: { 'x-line-request-id': `line-req-${++pushN}` }, body: {} };
      return null;
    },
  });
})();
after(async () => {
  await line?.close();
  await pg?.close();
  await db?.close();
});

const rows = (sql, params = []) => asService(db, (tx) => tx.query(sql, params)).then((r) => r.rows);
const one = async (sql, params = []) => (await rows(sql, params))[0];
const rpc = async (name, args, jwt = staffJwt(STAFF)) => {
  const res = await fetch(`${pg.url}/rest/v1/rpc/${name}`, { method: 'POST', headers: { 'content-type': 'application/json', apikey: 'anon', authorization: `Bearer ${jwt}` }, body: JSON.stringify(args) });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
};
let tokenN = 0;
const reply = (thread, text, token = `chain-${++tokenN}`) => rpc('sale_line_send', { p_thread: thread, p_text: text, p_token: token, p_by: 'ฟิล์ม', p_order: null });
const retryOf = (outId) => rpc('sale_line_retry', { p_out: outId, p_by: 'ฟิล์ม' });
const myPushes = (text) => line.calls.filter((c) => c.path === '/v2/bot/message/push' && c.retryKey && (!text || c.body?.messages?.[0]?.text === text));
// the test gives every message an id that starts with the customer’s letter; a reply carries only its reply token, rt-<message id>
const mid = (uid, id) => `${uid[1]}-${id}`;
const customerReplies = (uid) => line.calls.filter((c) => c.path === '/v2/bot/message/reply' && c.body?.replyToken?.startsWith(`rt-${uid[1]}-`));
const outOf = (id) => one('select * from sale_line_out where id = $1', [id]);
const threadOf = (uid) => one("select t.* from sale_threads t join sale_line_links k on k.thread_id = t.id where k.line_user_id = $1 and k.channel_key = 'main'", [uid]);
const msgOf = (id) => one('select * from sale_msgs where id = $1', [id]);

const BASE_ENV = () => ({
  LINE_CHANNEL_ACCESS_TOKEN: TOKEN,
  LINE_CHANNEL_SECRET: SECRET,
  TEST_LINE_BASE: `http://127.0.0.1:${line.port}`,
  SALECHAT_SUPABASE_URL: pg.url,
  SALECHAT_SERVICE_ROLE_KEY: SERVICE,
  SALECHAT_TICK_MS: '100',
  SALECHAT_BEAT_MS: '200',
});

// starts the bot with the given settings, runs fn, stops the bot
async function withBot(env, fn) {
  await started;
  await db.query('delete from sale_line_status');
  script = () => null;
  const bot = await startBot({ env: { ...BASE_ENV(), ...env } });
  const wait = (cond, ms = 8000) => until(cond, { ms, logs: bot.logs });
  const post = (events) => sendEvents(bot.port, { secret: SECRET, events });
  const say = (uid, text, id) => post([textEvent(uid, text, mid(uid, id))]);
  const health = async () => (await fetch(`http://127.0.0.1:${bot.port}/health`)).json();
  try {
    return await fn({ bot, wait, post, say, health });
  } finally {
    bot.stop();
  }
}

// what the bot answers a hello when the page is not involved at all — the baseline the other scenarios are held to
async function helloBaseline() {
  const who = user('3');
  let answer;
  await withBot({ SALECHAT_MODE: 'off' }, async ({ wait, say }) => {
    await say(who, 'สวัสดีค่ะ', 'base-1');
    await wait(() => customerReplies(who).length > 0);
    answer = JSON.stringify(customerReplies(who)[0].body.messages);
  });
  return answer;
}

test('off (the database key is there, the switch is not): the page gets nothing, /health looks as it always did, the bot answers as ever, the heartbeat says “off”, queued replies wait', async () => {
  await withBot({ SALECHAT_MODE: 'off' }, async ({ wait, say, health }) => {
    assert.deepEqual(await health(), { ok: true, app: 'off', assist: 'off', orders: 'off', drafts: 'off', build: 'chain00' }, 'not even a new key in /health');
    const me = user('4');
    assert.equal((await say(me, 'สวัสดีค่ะ', 'off-1')).status, 200);
    await wait(() => customerReplies(me).length > 0);
    await settle(400);
    assert.equal((await one("select count(*)::int n from sale_threads where source = 'line'")).n, 0, 'nothing recorded');
    const beat = await wait(() => one("select mode, build from sale_line_status where channel_key = 'main'"));
    assert.deepEqual([beat.mode, beat.build], ['off', 'chain00']);

    // a reply queued before the switch was turned off is not sent while it is off
    const seeded = await asService(db, (tx) => tx.query(`select public.sale_line_ingest($1::jsonb) as r`, [JSON.stringify({ channel_key: 'main', line_user_id: user('5'), line_message_id: 'seed-off-1', name: 'คุณบี', body: 'ทักไว้ก่อน' })]));
    const q = await reply(seeded.rows[0].r.thread_id, 'ตอบตอนปิดอยู่');
    assert.equal(q.status, 200);
    await settle(800);
    assert.equal((await outOf(q.body.out_id)).status, 'queued');
    assert.equal(myPushes().length, 0, 'nothing reached LINE');
  });
});

test('on: the customer’s text, picture and sticker become one chat, once each, and the bot answers the customer exactly as it would without the page', async () => {
  const baseline = await helloBaseline();
  assert.ok(baseline, 'the bot answers a hello');
  await withBot({ SALECHAT_MODE: 'on' }, async ({ wait, post, say, health }) => {
    assert.equal((await health()).salechat, 'on');
    const me = user('1');
    await say(me, 'สวัสดีค่ะ', 'on-1');
    await wait(() => customerReplies(me).length > 0);
    assert.equal(JSON.stringify(customerReplies(me)[0].body.messages), baseline, 'the same answer as without the page');

    const thread = await wait(() => threadOf(me));
    assert.deepEqual([thread.source, thread.title, thread.stage, thread.unread, thread.customer_id], ['line', 'ปู่', 'talk', 1, null]);
    // the bot's own answer is kept in the chat as the bot's (not as staff's), a moment after LINE accepted it; it is then the last line
    const botLine = await wait(() => one("select * from sale_msgs where thread_id = $1 and by_name = 'บอท'", [thread.id]));
    assert.deepEqual([botLine.dir, botLine.meta.src], ['out', 'bot']);
    await wait(async () => (await one('select last_text from sale_threads where id = $1', [thread.id])).last_text === botLine.body.slice(0, 120));
    const link = await one('select * from sale_line_links where thread_id = $1', [thread.id]);
    assert.deepEqual([link.channel_key, link.line_user_id, link.line_name, link.picture_url], ['main', me, 'ปู่', 'https://example.com/p.png']);
    const m = await one("select * from sale_msgs where thread_id = $1 and kind = 'text' and dir = 'in'", [thread.id]);
    assert.deepEqual([m.dir, m.body, m.by_name, m.meta.line_message_id], ['in', 'สวัสดีค่ะ', 'ปู่', mid(me, 'on-1')]);

    // a picture: the very bytes LINE gave, in the page's private bucket; the chat shows kind=image with meta.path
    await post([imageEvent(me, mid(me, 'img-1'))]);
    const img = await wait(() => one("select * from sale_msgs where thread_id = $1 and kind = 'image'", [thread.id]));
    assert.equal(img.meta.path, `line/main/${mid(me, 'img-1')}.jpg`);
    assert.ok(pg.storage.get(`sale-order-files/line/main/${mid(me, 'img-1')}.jpg`).bytes.equals(JPEG));
    assert.deepEqual([img.meta.type, img.meta.size, img.dir, img.body], ['image/jpeg', JPEG.length, 'in', '[รูปภาพ]']);

    // a sticker: a readable note
    await post([{ type: 'message', timestamp: Date.now(), replyToken: 'rt-st', source: { type: 'user', userId: me }, message: { id: mid(me, 'st-1'), type: 'sticker', packageId: '1', stickerId: '2', keywords: ['hi'] } }]);
    assert.equal((await wait(() => one("select * from sale_msgs where thread_id = $1 and kind = 'sticker'", [thread.id]))).body, '[สติกเกอร์]');

    // LINE delivers the first message again (it does when it does not get an answer in time): nothing doubles
    await say(me, 'สวัสดีค่ะ', 'on-1');
    await settle(500);
    assert.equal((await one("select count(*)::int n from sale_msgs where thread_id = $1 and meta ->> 'line_message_id' = $2", [thread.id, mid(me, 'on-1')])).n, 1);
    assert.equal((await one('select unread from sale_threads where id = $1', [thread.id])).unread, 3, 'text + picture + sticker, each counted once');

    // the heartbeat: “on”, which build, the LINE quota, and when the last customer message came
    const beat = await wait(() => one("select * from sale_line_status where channel_key = 'main' and detail ? 'quota'"));
    assert.deepEqual([beat.mode, beat.build], ['on', 'chain00']);
    assert.deepEqual([beat.detail.quota.type, beat.detail.quota.limit, beat.detail.quota.used], ['limited', 300, 120]);
    assert.ok(beat.last_in_at);
  });
});

test('a staff reply is pushed to the customer with the queue’s retry key, becomes “sent” only after LINE accepted it, and then the bot keeps quiet for that customer until they ask for the menu', async () => {
  await withBot({ SALECHAT_MODE: 'on' }, async ({ wait, say }) => {
    const me = user('2');
    await say(me, 'ขอราคากระดาษ A4 หน่อยค่ะ', 'rep-1');
    const thread = await wait(() => threadOf(me));
    const q = await reply(thread.id, 'รับทราบค่ะ เดี๋ยวแจ้งราคาให้นะคะ');
    assert.equal(q.status, 200);
    assert.equal(q.body.status, 'queued');
    const out = await wait(async () => {
      const o = await outOf(q.body.out_id);
      return o.status === 'sent' && o;
    });
    assert.equal(out.line_request_id.startsWith('line-req-'), true, 'LINE’s own request id is kept');
    const [push] = myPushes('รับทราบค่ะ เดี๋ยวแจ้งราคาให้นะคะ');
    assert.equal(myPushes('รับทราบค่ะ เดี๋ยวแจ้งราคาให้นะคะ').length, 1, 'once');
    assert.deepEqual([push.body.to, push.body.messages, push.auth, push.retryKey], [me, [{ type: 'text', text: 'รับทราบค่ะ เดี๋ยวแจ้งราคาให้นะคะ' }], `Bearer ${TOKEN}`, out.retry_key]);
    const m = await msgOf(q.body.msg_id);
    assert.deepEqual([m.meta.delivery, m.dir, m.by_name], ['sent', 'out', 'ฟิล์ม']);

    // a person is with this customer now: the bot does not answer their next words…
    const before = customerReplies(me).length;
    await say(me, 'สวัสดีค่ะ', 'rep-2');
    await settle(700);
    assert.equal(customerReplies(me).length, before, 'quiet');
    assert.equal((await rows("select * from sale_msgs where thread_id = $1 and body = 'สวัสดีค่ะ'", [thread.id])).length, 1, 'but the page still gets the message');
    // …until the customer asks for the menu
    await say(me, 'เมนู', 'rep-3');
    await wait(() => customerReplies(me).length > before);
  });
});

test('with the quiet option off, the bot goes on answering a customer staff have written to', async () => {
  await withBot({ SALECHAT_MODE: 'on', SALECHAT_QUIET: 'off' }, async ({ wait, say }) => {
    const me = user('6');
    await say(me, 'ขอราคากระดาษ A4 หน่อยค่ะ', 'q-1'); // (a message the bot does not answer, so its “wait a moment between answers” rule is not in play)
    const thread = await wait(() => threadOf(me));
    const q = await reply(thread.id, 'ยินดีค่ะ');
    await wait(async () => (await outOf(q.body.out_id)).status === 'sent');
    const before = customerReplies(me).length;
    await say(me, 'สวัสดีค่ะ', 'q-2');
    await wait(() => customerReplies(me).length > before);
  });
});

test('LINE refuses (the monthly quota is full): “failed” with the reason in Thai, not tried again by itself; staff send again and it goes with a new key', async () => {
  await withBot({ SALECHAT_MODE: 'on' }, async ({ wait, say }) => {
    const me = user('7');
    await say(me, 'สวัสดีค่ะ', 'f-1');
    const thread = await wait(() => threadOf(me));
    let refuse = true;
    script = (call) => (refuse && call.body.messages[0].text === 'โควตาเต็มไหมคะ' ? { status: 429, body: { message: 'You have reached your monthly limit.' } } : null);
    const q = await reply(thread.id, 'โควตาเต็มไหมคะ');
    const failed = await wait(async () => {
      const o = await outOf(q.body.out_id);
      return o.status === 'failed' && o;
    });
    assert.match(failed.error, /โควตา.*monthly limit/);
    assert.equal(failed.ambiguous, false);
    const m = await msgOf(q.body.msg_id);
    assert.deepEqual([m.meta.delivery, m.meta.error], ['failed', failed.error], 'the chat tells staff it did not go, and why');
    await settle(600);
    assert.equal(myPushes('โควตาเต็มไหมคะ').length, 1, 'not tried again by itself');

    refuse = false;
    assert.equal((await retryOf(q.body.out_id)).body.status, 'queued');
    const sent = await wait(async () => {
      const o = await outOf(q.body.out_id);
      return o.status === 'sent' && o;
    });
    const pushes = myPushes('โควตาเต็มไหมคะ');
    assert.equal(pushes.length, 2);
    assert.notEqual(pushes[0].retryKey, pushes[1].retryKey, 'LINE clearly refused the first, so the second is a new request');
    assert.equal(pushes[1].retryKey, sent.retry_key);
    assert.equal((await msgOf(q.body.msg_id)).meta.delivery, 'sent');
  });
});

test('LINE fails once (a 500): the bot tries again after a few seconds with the same retry key, and only then is it “sent”', async () => {
  await withBot({ SALECHAT_MODE: 'on' }, async ({ wait, say }) => {
    const me = user('8');
    await say(me, 'สวัสดีค่ะ', 'r-1');
    const thread = await wait(() => threadOf(me));
    let n = 0;
    script = (call) => (call.body.messages[0].text === 'ลองสองรอบ' && ++n === 1 ? { status: 500, body: { message: 'Internal error' } } : null);
    const q = await reply(thread.id, 'ลองสองรอบ');
    const waiting = await wait(async () => {
      const o = await outOf(q.body.out_id);
      return o.status === 'queued' && o.attempts === 1 && o;
    });
    assert.match(waiting.error, /ผิดพลาดชั่วคราว/);
    assert.equal((await msgOf(q.body.msg_id)).meta.delivery, 'queued', 'still not “sent”');
    const sent = await wait(async () => {
      const o = await outOf(q.body.out_id);
      return o.status === 'sent' && o;
    }, 15000);
    assert.equal(sent.attempts, 2);
    const pushes = myPushes('ลองสองรอบ');
    assert.equal(pushes.length, 2);
    assert.equal(pushes[0].retryKey, pushes[1].retryKey, 'the same key, so LINE cannot deliver it twice');
  });
});

test('LINE says the request was already accepted (an earlier try got through but its answer was lost): that is “sent”, with the first request’s id', async () => {
  await withBot({ SALECHAT_MODE: 'on' }, async ({ wait, say }) => {
    const me = user('9');
    await say(me, 'สวัสดีค่ะ', 'a-1');
    const thread = await wait(() => threadOf(me));
    script = (call) => (call.body.messages[0].text === 'ส่งไปแล้วรอบก่อน' ? { status: 409, headers: { 'x-line-accepted-request-id': 'earlier-req-7' }, body: { message: 'The retry key is already accepted' } } : null);
    const q = await reply(thread.id, 'ส่งไปแล้วรอบก่อน');
    const o = await wait(async () => {
      const x = await outOf(q.body.out_id);
      return x.status === 'sent' && x;
    });
    assert.equal(o.line_request_id, 'earlier-req-7');
  });
});

test('pilot: only the listed customer is recorded and answered through the page; a reply queued for anyone else is refused, not sent', async () => {
  await withBot({ SALECHAT_MODE: 'pilot', SALECHAT_PILOT_IDS: user('a') }, async ({ wait, say, health }) => {
    assert.equal((await health()).salechat, 'pilot');
    await say(user('b'), 'สวัสดีค่ะ', 'p-1');
    await say(user('a'), 'ทดลองระบบ', 'p-2');
    const thread = await wait(() => threadOf(user('a')));
    assert.equal(thread.title, 'ผู้ทดลอง');
    await settle(500);
    assert.equal(await threadOf(user('b')), undefined, 'the other customer is not recorded');
    const beat = await wait(() => one("select mode from sale_line_status where channel_key = 'main'"));
    assert.equal(beat.mode, 'pilot');

    const ok = await reply(thread.id, 'ตอบผู้ทดลอง');
    await wait(async () => (await outOf(ok.body.out_id)).status === 'sent');

    const stranger = await asService(db, (tx) => tx.query(`select public.sale_line_ingest($1::jsonb) as r`, [JSON.stringify({ channel_key: 'main', line_user_id: user('b'), line_message_id: 'seed-p-1', name: 'คนนอกรายชื่อ', body: 'ทักมาตอนเปิดเต็ม' })]));
    const no = await reply(stranger.rows[0].r.thread_id, 'ห้ามส่งถึงคนนอกรายชื่อ');
    const refused = await wait(async () => {
      const o = await outOf(no.body.out_id);
      return o.status === 'failed' && o;
    });
    assert.match(refused.error, /รายชื่อทดสอบ/);
    assert.equal(myPushes('ห้ามส่งถึงคนนอกรายชื่อ').length, 0, 'nothing reached LINE');
  });
});

test('on but with no database key: /health says no-db, nothing is recorded, and the bot answers customers as ever', async () => {
  const baseline = await helloBaseline();
  await withBot({ SALECHAT_MODE: 'on', SALECHAT_SUPABASE_URL: '', SALECHAT_SERVICE_ROLE_KEY: '' }, async ({ wait, say, health }) => {
    assert.equal((await health()).salechat, 'no-db');
    const me = user('3');
    const n = customerReplies(me).length;
    await say(me, 'สวัสดีค่ะ', 'nd-1');
    await wait(() => customerReplies(me).length > n);
    assert.equal(JSON.stringify(customerReplies(me).at(-1).body.messages), baseline);
  });
});

test('on but the database cannot be reached: the message is not recorded (it stays in LINE OA Manager), the bot answers the customer as ever and keeps running', async () => {
  const baseline = await helloBaseline();
  await withBot({ SALECHAT_MODE: 'on', SALECHAT_SUPABASE_URL: 'http://127.0.0.1:1' }, async ({ wait, say, health, bot }) => {
    const me = user('3');
    const n = customerReplies(me).length;
    await say(me, 'สวัสดีค่ะ', 'bd-1');
    await wait(() => customerReplies(me).length > n);
    assert.equal(JSON.stringify(customerReplies(me).at(-1).body.messages), baseline, 'the answer is the same');
    await settle(500);
    assert.equal((await health()).ok, true, 'still running');
    assert.match(bot.logs(), /\[salechat\] heartbeat/, 'the problem is in the log, once');
    assert.equal(bot.logs().match(/\[salechat\] heartbeat/g).length, 1);
  });
});
