// The bot's own answers are kept in the customer's chat (src/botcontext.js → src/salechat/index.js recordBot → src/salechat/store.js botOut),
// and a card LINE refuses as malformed goes as its plain text (src/salechat/outbox.js pushWithTextFallback, also used by the team's card).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forCustomer, noteBotSent, setBotSentHook } from '../src/botcontext.js';
import { botText, createSaleChat } from '../src/salechat/index.js';
import { createSaleChatStore } from '../src/salechat/store.js';
import { createSaleOutbox, pushWithTextFallback, retryKeyFor } from '../src/salechat/outbox.js';
import { createTeamCards } from '../src/salechat/team.js';

const silent = { error() {}, log() {} };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const TEXT = [{ type: 'text', text: 'ขอบคุณค่ะ' }];
const CARD = { type: 'flex', altText: 'ยืนยันคำสั่งซื้อ ORD-1', contents: { type: 'bubble' } };
const ORDER = { id: 'o1', order_no: 'ORD-1', order_date: '2026-11-05', customer_name: 'คุณสมชาย', phone: '', subtotal: 100, vat_rate: 0, vat_amount: 0, total: 100, fulfil: 'pickup', note: '', need_date: null, created_at: '2026-11-05T11:50:00Z' };
const ITEMS = [{ seq: 1, name: 'ดินสอ 2B', qty: 2, unit: 'แท่ง', unit_price: 50, line_total: 100 }];
// LINE refuses a card (its layout), and accepts the plain text
const refusesCards = async (to, messages) =>
  messages[0].type === 'flex' ? { ok: false, status: 400, error: 'The request body has 1 or more property errors' } : { ok: true, status: 200, requestId: 'r-text' };

// ---- what the customer saw, as the chat's text ---------------------------------------------------------------------------------------------

test('botText: the text as it is; a card as its alt text; a picture, sticker or unknown kind as a short note', () => {
  assert.equal(botText([{ type: 'text', text: 'สวัสดีค่ะ' }, { type: 'text', text: 'มีอะไรให้ช่วยไหมคะ' }]), 'สวัสดีค่ะ\nมีอะไรให้ช่วยไหมคะ');
  assert.equal(botText([{ type: 'flex', altText: 'ยืนยันคำสั่งซื้อ ORD-1 ยอดรวม 100.00 บาท', contents: {} }]), '[การ์ด] ยืนยันคำสั่งซื้อ ORD-1 ยอดรวม 100.00 บาท');
  assert.equal(botText([{ type: 'image', originalContentUrl: 'https://example.test/a.jpg' }, { type: 'sticker', packageId: '1', stickerId: '1' }]), '[รูปภาพ]\n[สติกเกอร์]');
  assert.equal(botText([{ type: 'something-new' }]), '[ข้อความ]');
  assert.equal(botText([]), '');
  assert.equal(botText(undefined), '');
  assert.equal(botText([null, 'x']), '');
  assert.ok(botText([{ type: 'text', text: 'ก'.repeat(5000) }]).length <= 4000);
});

// ---- which customer an answer belongs to --------------------------------------------------------------------------------------------------

test('an answer is reported for the customer whose event it answers, and for nobody else', async () => {
  const seen = [];
  setBotSentHook((userId, messages) => seen.push({ userId, messages }));
  try {
    await forCustomer('Uc', async () => {
      await wait(5); // the customer stays attached across an await
      noteBotSent(undefined, TEXT); // a reply: always to this customer
      noteBotSent('Uc', TEXT); // a push to the same customer
      noteBotSent('Ustaff', TEXT); // a push to a staff member (an admin alert, the team's card): not the customer's chat
    });
    assert.deepEqual(seen, [{ userId: 'Uc', messages: TEXT }, { userId: 'Uc', messages: TEXT }]);
    seen.length = 0;
    noteBotSent(undefined, TEXT); // outside any customer's event (the page's queue, the team's card worker)
    await forCustomer(undefined, () => noteBotSent(undefined, TEXT)); // a batch of several customers' events: no one customer to attribute it to
    assert.equal(seen.length, 0);
  } finally {
    setBotSentHook(null);
  }
});

test('a failing hook never reaches the answer', () => {
  setBotSentHook(() => {
    throw new Error('boom');
  });
  try {
    assert.doesNotThrow(() => forCustomer('Uc', () => noteBotSent(undefined, TEXT)));
  } finally {
    setBotSentHook(null);
  }
});

// ---- recording into the chat --------------------------------------------------------------------------------------------------------------

function bridge({ cfg = { mode: 'on' }, botOut = async () => ({ thread_id: 'T1' }) } = {}) {
  const calls = [];
  const errors = [];
  const store = {
    botOut: async (...args) => {
      calls.push(args);
      return botOut(...args);
    },
  };
  const sc = createSaleChat({
    db: {},
    store,
    getConfig: () => cfg,
    lineApi: {},
    push: async () => ({ ok: true }),
    tokenFor: () => 't',
    log: { error: (...a) => errors.push(a.join(' ')), log() {} },
  });
  return { sc, calls, errors };
}

test('the answer is recorded in the chat of each customer the bridge takes: everyone in "on", the pilot list in "pilot"', async () => {
  const on = bridge({ cfg: { mode: 'on' } });
  await on.sc.recordBot('Uc', TEXT);
  assert.equal(on.calls.length, 1);
  assert.equal(on.calls[0][0], 'main');
  assert.equal(on.calls[0][1], 'Uc');
  assert.equal(on.calls[0][2], 'ขอบคุณค่ะ');
  assert.match(on.calls[0][3], /^\d{4}-\d{2}-\d{2}T/);

  const pilot = bridge({ cfg: { mode: 'pilot', pilotUserIds: ['Uc'] } });
  await pilot.sc.recordBot('Uc', TEXT);
  await pilot.sc.recordBot('Ustranger', TEXT);
  assert.equal(pilot.calls.length, 1, 'only the pilot list');
});

test('nothing is recorded while the bridge is off, for an empty answer, or without a customer', async () => {
  const off = bridge({ cfg: { mode: 'off' } });
  await off.sc.recordBot('Uc', TEXT);
  const on = bridge({ cfg: { mode: 'on' } });
  await on.sc.recordBot('Uc', []);
  await on.sc.recordBot(undefined, TEXT);
  assert.equal(off.calls.length + on.calls.length, 0);
});

test('a database problem is logged and never thrown back into the answer', async () => {
  const b = bridge({
    botOut: async () => {
      throw new Error('bot answer: boom');
    },
  });
  await assert.doesNotReject(b.sc.recordBot('Uc', TEXT));
  assert.ok(b.errors.some((e) => /boom/.test(e)));
});

// ---- the write itself (store.botOut), against a stand-in for the database's REST interface -----------------------------------------------

function fakeRest(links = []) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    const u = new URL(url);
    const table = u.pathname.replace('/rest/v1/', '');
    const method = (init.method || 'GET').toUpperCase();
    calls.push({ table, method, query: Object.fromEntries(u.searchParams), body: init.body ? JSON.parse(init.body) : null });
    if (method === 'GET' && table === 'sale_line_links') {
      const eq = (k) => String(u.searchParams.get(k) || '').replace(/^eq\./, '');
      const rows = links.filter((l) => l.channel_key === eq('channel_key') && l.line_user_id === eq('line_user_id'));
      return new Response(JSON.stringify(rows), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response(null, { status: method === 'POST' ? 201 : 204 });
  };
  return { calls, fetch };
}

test('botOut writes the answer as the bot’s, into the customer’s chat, and moves that chat’s last line', async () => {
  const rest = fakeRest([{ channel_key: 'main', line_user_id: 'Uc', thread_id: 'T1' }]);
  const store = createSaleChatStore({ url: 'https://example.supabase.co', key: 'service-key', fetch: rest.fetch });
  const r = await store.botOut('main', 'Uc', 'ขอบคุณค่ะ', '2026-11-05T10:00:00.000Z');
  assert.deepEqual(r, { thread_id: 'T1' });
  const msg = rest.calls.find((c) => c.table === 'sale_msgs');
  assert.equal(msg.method, 'POST');
  assert.deepEqual(msg.body, {
    thread_id: 'T1',
    dir: 'out',
    kind: 'text',
    body: 'ขอบคุณค่ะ',
    by_name: 'บอท',
    meta: { src: 'bot', delivery: 'sent', delivery_at: '2026-11-05T10:00:00.000Z' },
  });
  const th = rest.calls.find((c) => c.table === 'sale_threads');
  assert.equal(th.method, 'PATCH');
  assert.equal(th.query.id, 'eq.T1');
  assert.deepEqual(th.body, { last_text: 'ขอบคุณค่ะ', last_at: '2026-11-05T10:00:00.000Z', updated_at: '2026-11-05T10:00:00.000Z' });
});

test('a customer without a chat is not recorded, and nothing is written', async () => {
  const rest = fakeRest([]);
  const store = createSaleChatStore({ url: 'https://example.supabase.co', key: 'service-key', fetch: rest.fetch });
  assert.deepEqual(await store.botOut('main', 'Uc', 'ขอบคุณค่ะ', '2026-11-05T10:00:00.000Z'), { skipped: 'no-chat' });
  assert.equal(rest.calls.filter((c) => c.method !== 'GET').length, 0);
});

// ---- a card LINE refuses as malformed goes as its plain text -------------------------------------------------------------------------------

test('a card LINE refuses as malformed (400) goes again as its plain text, under a retry key of its own', async () => {
  const sent = [];
  const answer = await pushWithTextFallback(
    async (to, messages, token, key) => {
      sent.push({ to, messages, key });
      return refusesCards(to, messages);
    },
    'Uc',
    [CARD],
    TEXT,
    't',
    'rk-1',
    silent,
  );
  assert.deepEqual(answer, { ok: true, status: 200, requestId: 'r-text' });
  assert.deepEqual(
    sent.map((s) => s.key),
    ['rk-1', retryKeyFor('text', 'rk-1')],
  );
  assert.notEqual(sent[1].key, 'rk-1');
  assert.deepEqual(sent[1].messages, TEXT);
  assert.match(sent[1].key, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/, 'a UUID, as LINE wants');
});

test('an answer that is not about the card is returned as it is: blocked, quota, server error, or a text LINE refuses — one try only', async () => {
  for (const [messages, answer] of [
    [[CARD], { ok: false, status: 403, error: 'blocked' }],
    [[CARD], { ok: false, status: 429, error: 'quota' }],
    [[CARD], { ok: false, status: 500, error: 'oops' }],
    [TEXT, { ok: false, status: 400, error: 'bad text' }],
  ]) {
    let n = 0;
    const got = await pushWithTextFallback(
      async () => {
        n++;
        return answer;
      },
      'Uc',
      messages,
      TEXT,
      't',
      'rk-1',
      silent,
    );
    assert.deepEqual(got, answer);
    assert.equal(n, 1, `status ${answer.status}: one try`);
  }
});

test('a customer whose order card LINE refuses gets the staff text instead, and the reply is marked sent', async () => {
  const finished = [];
  const job = { id: 'j1', channel_key: 'main', line_user_id: 'Uc', body: 'สรุปใบสั่งงาน ORD-1 ยอดรวม 100 บาท', retry_key: 'rk-1' };
  const store = {
    async claim() {
      return [job];
    },
    async finish(id, result, error = null, requestId = null) {
      finished.push({ id, result, error, requestId });
    },
    async outboxOrderId() {
      return 'o1';
    },
    async orderCard() {
      return { order: ORDER, items: ITEMS };
    },
  };
  const sent = [];
  const outbox = createSaleOutbox({
    store,
    push: async (to, messages, token, key) => {
      sent.push({ messages, key });
      return refusesCards(to, messages);
    },
    tokenFor: () => 't',
    getConfig: () => ({ mode: 'pilot', pilotUserIds: ['Uc'], card: { mode: 'on', payNote: '' } }),
    log: silent,
  });
  assert.deepEqual(await outbox.tick(), { jobs: 1, sent: 1 });
  assert.equal(sent[0].messages[0].type, 'flex');
  assert.deepEqual(sent[1].messages, [{ type: 'text', text: job.body }]);
  assert.deepEqual(finished, [{ id: 'j1', result: 'sent', error: null, requestId: 'r-text' }]);
});

test('a team card LINE refuses goes to each person as its one-line text instead, and the order is marked sent', async () => {
  const marks = [];
  const sent = [];
  const errors = [];
  const worker = createTeamCards({
    store: {
      async teamPending() {
        return [{ id: 'o1' }];
      },
      async orderCard() {
        return { order: ORDER, items: ITEMS };
      },
      async markTeamSent(id) {
        marks.push(id);
      },
    },
    push: async (to, messages, token, key) => {
      sent.push({ to, messages, key });
      return refusesCards(to, messages);
    },
    tokenFor: () => 't',
    getConfig: () => ({ teamCard: { mode: 'on' } }),
    teamIds: () => ['Ua'],
    shopName: () => 'ร้านทดสอบ',
    log: { error: (...a) => errors.push(a.join(' ')), log() {} },
    now: () => Date.parse('2026-11-05T12:00:00Z'),
  });
  assert.deepEqual(await worker.tick(), { pending: 1, sent: 1 });
  assert.equal(sent.length, 2, 'the card, then its text');
  assert.equal(sent[1].messages[0].type, 'text');
  assert.match(sent[1].messages[0].text, /คำสั่งงานใหม่ ORD-1/);
  assert.equal(sent[1].key, retryKeyFor('text', sent[0].key));
  assert.deepEqual(marks, ['o1']);
  assert.equal(errors.length, 1, 'the refused card is logged once, for whoever looks at the log');
  assert.match(errors[0], /the text is sent instead/);
});
