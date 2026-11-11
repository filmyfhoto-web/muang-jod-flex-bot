// The AI reads a conversation, not a single message: an order written over several messages is read together, and what it adds
// is held to the customer's own words (a product or a quantity the customer did not write is dropped). The bot runs as its own
// process; the AI provider is a stand-in that records what it was asked.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openShopDb, asService } from '../helpers/shop-db.js';
import { startPgRest } from '../helpers/pg-rest.js';
import { seedBotTables } from '../helpers/app-seed.js';
import { startLine, startAi, startBot, textEvent, sendEvents, until } from '../helpers/bot-harness.js';

const SERVICE = 'svc-service-key';
const CUSTOMER = 'U' + '6'.repeat(32);
const MAIN_SECRET = 'secret-main-oa';
const MAIN_TOKEN = 'token-main-oa';
const GEMINI_KEY = 'test-gemini-key';
const P1 = '33333333-3333-4333-8333-333333333331'; // ไม้ถูพื้น
const P2 = '33333333-3333-4333-8333-333333333332'; // น้ำยาล้างจาน

let db;
let pg;
let line;
let ai;
let bot;

// what the stand-in model answers: the order it reads from the thread (the last message decides which answer)
function answer(prompt) {
  if (prompt.includes('[4] ขอ 5 ชิ้นด้วยค่ะ')) return { order: true, items: [{ name: 'กระดาษ A4', qty: 5, unit: 'ชิ้น' }], day: null }; // invented
  if (prompt.includes('[3] ขอ 1 ขวดค่ะ')) return { order: true, items: [{ name: 'น้ำยาล้างจาน', qty: 1, unit: 'ขวด' }], day: null };
  return { order: false, items: [], day: null };
}

before(async () => {
  db = await openShopDb();
  await seedBotTables(db);
  await db.query(
    `insert into products (id, code, name, unit, price, stock_qty) values
       ($1, 'A1', 'ไม้ถูพื้น', 'อัน', 55, 10),
       ($2, 'A2', 'น้ำยาล้างจาน', 'ขวด', 60, 5)`,
    [P1, P2],
  );
  pg = await startPgRest({ db, serviceKey: SERVICE });
  line = await startLine({ names: { [CUSTOMER]: 'คุณลูกค้า' } });
  ai = await startAi(answer);
  bot = await startBot({
    env: {
      LINE_CHANNEL_ACCESS_TOKEN: MAIN_TOKEN,
      LINE_CHANNEL_SECRET: MAIN_SECRET,
      TEST_LINE_BASE: `http://127.0.0.1:${line.port}`,
      TEST_AI_BASE: `http://127.0.0.1:${ai.port}`,
      GEMINI_API_KEY: GEMINI_KEY,
      CHATDRAFTS_SUPABASE_URL: pg.url,
      CHATDRAFTS_SERVICE_ROLE_KEY: SERVICE,
      CHATDRAFTS_MODE: 'on',
      CHATDRAFTS_AI: 'on',
      CHATDRAFTS_ACK: 'off',
    },
  });
});
after(async () => {
  bot?.stop();
  await ai?.close();
  await line?.close();
  await pg?.close();
  await db?.close();
});

const wait = (cond, ms) => until(cond, { ms, logs: () => bot.logs() });
const rows = (sql) => asService(db, (tx) => tx.query(sql)).then((r) => r.rows);
const draft = async () => (await rows("select id, draft_no, items, note from chat_drafts where line_user_id = '" + CUSTOMER + "' and status = 'open'"))[0];

test('a clear single line is read by the rules alone: a draft with its product, and no call to the AI', async () => {
  await sendEvents(bot.port, { secret: MAIN_SECRET, events: [textEvent(CUSTOMER, 'ไม้ถูพื้น 2 อัน', 'a1')] });
  const d = await wait(draft);
  assert.equal(d.draft_no, 'CH-0001');
  assert.equal(d.items.length, 1);
  assert.equal(d.items[0].product_id, P1);
  assert.equal(d.items[0].qty, 2);
  assert.equal(ai.calls.length, 0, 'the AI is not asked about a line the rules already read');
});

test('a product with no quantity is kept in the note; the AI is not asked, since there is no number to read', async () => {
  await sendEvents(bot.port, { secret: MAIN_SECRET, events: [textEvent(CUSTOMER, 'น้ำยาล้างจาน', 'a2')] });
  await wait(async () => (await draft()).note?.includes('น้ำยาล้างจาน'));
  const d = await draft();
  assert.equal(d.items.length, 1, 'no line is made from it');
  assert.equal(ai.calls.length, 0);
});

test('the AI reads the open conversation together: the product from one message and the quantity from the next become one line', async () => {
  await sendEvents(bot.port, { secret: MAIN_SECRET, events: [textEvent(CUSTOMER, 'ขอ 1 ขวดค่ะ', 'a3')] });
  await wait(async () => (await draft()).items.length === 2);
  const call = ai.calls.at(-1);
  assert.equal(ai.calls.length, 1);
  assert.equal(call.key, GEMINI_KEY, 'the key goes to the provider in its header');
  assert.match(call.system, /LINE messages of ONE customer/, 'the conversation prompt is used');
  assert.equal(call.text, '[1] ไม้ถูพื้น 2 อัน\n[2] น้ำยาล้างจาน\n[3] ขอ 1 ขวดค่ะ', 'the open draft’s messages go in, oldest first');
  const d = await draft();
  const added = d.items[1];
  assert.equal(added.product_id, P2);
  assert.equal(added.qty, 1);
  assert.equal(added.unit, 'ขวด');
  const [merged] = await rows(`select detail from chat_draft_events where draft_id = '${d.id}' and action = 'merged' order by id desc limit 1`);
  assert.equal(merged.detail.via, 'ai', 'the history says the AI added it');
});

test('a line the customer did not write is dropped: the message stays a note, the draft does not change', async () => {
  await sendEvents(bot.port, { secret: MAIN_SECRET, events: [textEvent(CUSTOMER, 'ขอ 5 ชิ้นด้วยค่ะ', 'a4')] });
  await wait(async () => (await draft()).note?.includes('ขอ 5 ชิ้นด้วยค่ะ'));
  const d = await draft();
  assert.equal(ai.calls.length, 2, 'the AI was asked once for this message');
  assert.equal(d.items.length, 2, 'the invented paper is not on the order');
  assert.ok(!d.items.some((x) => String(x.name).includes('กระดาษ')));
});
