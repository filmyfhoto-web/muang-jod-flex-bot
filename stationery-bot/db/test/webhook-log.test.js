// LINE's webhook events written down before LINE is answered (migration 010), on a real PostgreSQL, and through the real bot (src/server.js started as a process):
//  · the functions behind the log: a new event is written once, a repeat is not, done stops it, and the fifth failure makes it dead
//  · only the service role may use the table and the functions: a visitor with the public key gets nothing
//  · WEBHOOK_LOG_MODE=on: a repeated event is answered once; when the event cannot be written down, LINE gets a 500 and the bot answers nothing;
//    off (the default) writes nothing and answers as before
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { openSaleDb, asAnon } from '../helpers/sale-db.js';
import { asService } from '../helpers/shop-db.js';
import { startPgRest } from '../helpers/pg-rest.js';
import { startLine, startBot, textEvent, sendEvents, settle } from '../helpers/bot-harness.js';

const SERVICE = 'svc-service-key';
const SECRET = 'secret-main-oa';
const TOKEN = 'token-main-oa';
const USER = 'U' + 'f'.repeat(32);
const ev = (id) => ({ ...textEvent(USER, 'เมนู', 'm' + id), webhookEventId: 'WE-' + id });

let db;
let pg;
let line;
const started = (async () => {
  db = await openSaleDb({ line: true, webhook: true });
  pg = await startPgRest({ db, serviceKey: SERVICE });
  line = await startLine({ names: { [USER]: 'คุณทดสอบ' } });
})();
after(async () => {
  await line?.close();
  await pg?.close();
  await db?.close();
});

const rows = (sql, params = []) => asService(db, (tx) => tx.query(sql, params)).then((r) => r.rows);
const waitFor = async (fn, ms = 8000) => {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > ms) throw new Error('timed out waiting');
    await settle(50);
  }
};
const replies = (id) => line.calls.filter((c) => c.path === '/v2/bot/message/reply' && c.body?.replyToken === 'rt-m' + id);

test('a new event is written once; a repeat of it is not, and the same id on another channel is another event', async () => {
  await started;
  const written = (channel, events) => rows('select line_webhook_record($1, $2::jsonb) as ids', [channel, JSON.stringify(events)]).then((r) => [...r[0].ids].sort());
  assert.deepEqual(await written('main', [ev('1'), ev('2')]), ['WE-1', 'WE-2']);
  assert.deepEqual(await written('main', [ev('1'), ev('3')]), ['WE-3']);
  assert.deepEqual(await written('main', [ev('1')]), []);
  assert.deepEqual(await written('other', [ev('1')]), ['WE-1']);
});

test('a failure is counted, the fifth one makes the event dead, and done does not revive it', async () => {
  await started;
  await rows('select line_webhook_record($1, $2::jsonb)', ['main', JSON.stringify([ev('10')])]);
  const state = async () => (await rows("select status, attempts, last_error from line_webhook_events where webhook_event_id = 'WE-10'"))[0];
  for (let i = 1; i <= 4; i++) await rows("select line_webhook_failed('main', '[\"WE-10\"]'::jsonb, $1)", ['boom ' + i]);
  assert.deepEqual(await state(), { status: 'failed', attempts: 4, last_error: 'boom 4' });
  await rows("select line_webhook_failed('main', '[\"WE-10\"]'::jsonb, 'boom 5')");
  assert.equal((await state()).status, 'dead');
  await rows("select line_webhook_done('main', '[\"WE-10\"]'::jsonb)");
  assert.equal((await state()).status, 'dead');
});

test('done marks a received event done and stamps when it was finished', async () => {
  await started;
  await rows('select line_webhook_record($1, $2::jsonb)', ['main', JSON.stringify([ev('11')])]);
  await rows("select line_webhook_done('main', '[\"WE-11\"]'::jsonb)");
  assert.deepEqual(await rows("select status, processed_at is not null as stamped from line_webhook_events where webhook_event_id = 'WE-11'"), [{ status: 'done', stamped: true }]);
});

test('a visitor with the public key can neither read the table nor call the functions', async () => {
  await started;
  await assert.rejects(asAnon(db, (tx) => tx.query('select * from line_webhook_events')), /permission denied/);
  await assert.rejects(asAnon(db, (tx) => tx.query("select line_webhook_record('main', '[]'::jsonb)")), /permission denied/);
});

// starts the bot with these settings, runs fn, stops the bot
async function withBot(extra, fn) {
  await started;
  await db.query('delete from line_webhook_events');
  const env = {
    LINE_CHANNEL_ACCESS_TOKEN: TOKEN,
    LINE_CHANNEL_SECRET: SECRET,
    TEST_LINE_BASE: `http://127.0.0.1:${line.port}`,
    SALECHAT_SUPABASE_URL: pg.url,
    SALECHAT_SERVICE_ROLE_KEY: SERVICE,
    ...extra,
  };
  const bot = await startBot({ env });
  try {
    return await fn({ post: (events) => sendEvents(bot.port, { secret: SECRET, events }) });
  } finally {
    bot.stop();
  }
}

test('with WEBHOOK_LOG_MODE=on a repeated event is answered once and marked done', async () => {
  await withBot({ WEBHOOK_LOG_MODE: 'on' }, async ({ post }) => {
    assert.equal((await post([ev('a1')])).status, 200);
    await waitFor(() => replies('a1').length >= 1);
    assert.equal((await post([ev('a1')])).status, 200); // LINE sends the same event again
    await settle(1000);
    assert.equal(replies('a1').length, 1, 'answered once');
    await waitFor(async () => (await rows("select status from line_webhook_events where webhook_event_id = 'WE-a1'"))[0]?.status === 'done');
  });
});

test('with WEBHOOK_LOG_MODE=on, when a redelivery brings one new event, only the new one is answered', async () => {
  await withBot({ WEBHOOK_LOG_MODE: 'on' }, async ({ post }) => {
    assert.equal((await post([ev('a2')])).status, 200);
    await waitFor(() => replies('a2').length >= 1);
    await settle(6500); // the bot skips what comes within contact.burstSeconds (6 s) of its reply; a redelivery comes later than that
    assert.equal((await post([ev('a2'), ev('a3')])).status, 200);
    await waitFor(() => replies('a3').length >= 1);
    await settle(500);
    assert.equal(replies('a2').length, 1, 'the old one is not answered again');
    assert.equal(replies('a3').length, 1, 'the new one is answered');
  });
});

test('with WEBHOOK_LOG_MODE=on and no way to write an event down, LINE gets a 500 and the bot answers nothing', async () => {
  await withBot({ WEBHOOK_LOG_MODE: 'on', SALECHAT_SERVICE_ROLE_KEY: 'wrong-key' }, async ({ post }) => {
    assert.equal((await post([ev('c1')])).status, 500);
    await settle(500);
    assert.equal(replies('c1').length, 0);
  });
});

test('off (the default) writes nothing and the bot answers as before', async () => {
  await withBot({}, async ({ post }) => {
    assert.equal((await post([ev('d1')])).status, 200);
    await waitFor(() => replies('d1').length >= 1);
    assert.deepEqual(await rows('select count(*)::int as n from line_webhook_events'), [{ n: 0 }]);
  });
});
