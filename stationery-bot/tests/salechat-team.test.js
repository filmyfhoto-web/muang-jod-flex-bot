// The team's card (src/salechat/team.js): a new order → one card to each person on the contact list, once per order.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTeamCards } from '../src/salechat/team.js';

const NOW = Date.parse('2026-11-04T12:00:00Z');
const CARD = (id) => ({
  order: { id, order_no: `ORD-${id}`, customer_name: 'ลูกค้า', phone: '', subtotal: 100, vat_rate: 0, vat_amount: 0, total: 100, fulfil: 'pickup', created_at: '2026-11-04T11:50:00Z' },
  items: [{ seq: 1, name: 'ดินสอ 2B', qty: 2, unit: 'แท่ง', unit_price: 50, line_total: 100 }],
});

function fakeStore({ pending = [], missing = [] } = {}) {
  const marks = [];
  const queries = [];
  return {
    marks,
    queries,
    async teamPending(limit) {
      queries.push({ limit });
      return pending.map((id) => ({ id }));
    },
    async orderCard(id) {
      return missing.includes(id) ? null : CARD(id);
    },
    async markTeamSent(id, at) {
      marks.push({ id, at });
    },
  };
}

// the answers LINE can give: ok, a refusal that a retry will not fix, or no answer at all
const OK = async () => ({ ok: true, status: 200, requestId: 'r' });
const REFUSED = async () => ({ ok: false, status: 400, error: 'bad' });
const NO_ANSWER = async () => ({ network: true });

function setup({ mode = 'on', ids = ['Ua', 'Ub'], token = 't', store, push, errors = [] }) {
  const pushes = [];
  const log = { error: (...a) => errors.push(a.join(' ')), log() {} };
  const worker = createTeamCards({
    store,
    push: async (to, messages, tok, key) => {
      pushes.push({ to, messages, tok, key });
      return push(to, key);
    },
    tokenFor: () => token,
    getConfig: () => ({ teamCard: { mode } }),
    teamIds: () => ids,
    shopName: () => 'ร้านทดสอบ',
    log,
    now: () => NOW,
  });
  return { worker, pushes };
}

test('while the team card is off, nothing is sent and nothing is marked', async () => {
  const store = fakeStore({ pending: ['o1'] });
  const { worker, pushes } = setup({ mode: 'off', store, push: OK });
  assert.deepEqual(await worker.tick(), { skipped: 'off' });
  assert.equal(pushes.length, 0);
  assert.equal(store.marks.length, 0);
});

test('with nobody on the contact list, or no channel token, nothing is sent', async () => {
  const store = fakeStore({ pending: ['o1'] });
  assert.deepEqual(await setup({ ids: [], store, push: OK }).worker.tick(), { skipped: 'no-team' });
  assert.deepEqual(await setup({ token: '', store, push: OK }).worker.tick(), { skipped: 'no-token' });
  assert.equal(store.marks.length, 0);
});

test('each new order goes once to each person on the list, and is then marked sent', async () => {
  const store = fakeStore({ pending: ['o1', 'o2'] });
  const { worker, pushes } = setup({ store, push: OK });
  const r = await worker.tick();
  assert.deepEqual(r, { pending: 2, sent: 2 });
  assert.equal(pushes.length, 4, 'two orders × two people');
  assert.deepEqual(pushes.map((p) => p.to), ['Ua', 'Ub', 'Ua', 'Ub']);
  assert.equal(pushes[0].messages[0].type, 'flex', 'the team gets the card, not plain text');
  assert.match(pushes[0].messages[0].altText, /คำสั่งงานใหม่ ORD-o1/);
  assert.deepEqual(store.marks.map((m) => m.id), ['o1', 'o2']);
  assert.equal(store.queries[0].limit, 5);
});

test('a card LINE did not answer for is tried again later with the same keys; once everyone has it, the order is marked', async () => {
  const store = fakeStore({ pending: ['o1'] });
  let answer = NO_ANSWER;
  const { worker, pushes } = setup({ store, push: (to, key) => answer(to, key) });
  await worker.tick();
  assert.equal(store.marks.length, 0, 'not marked while LINE has not answered');
  answer = OK;
  await worker.tick();
  assert.deepEqual(store.marks.map((m) => m.id), ['o1']);
  const keysFirst = pushes.slice(0, 2).map((p) => p.key);
  const keysAgain = pushes.slice(2, 4).map((p) => p.key);
  assert.deepEqual(keysAgain, keysFirst, 'the same retry keys, so LINE does not send it twice');
});

test('a card LINE never answers for is tried again every tick, forever — never marked sent on a guess', async () => {
  const store = fakeStore({ pending: ['o1'] });
  const { worker, pushes } = setup({ store, push: NO_ANSWER });
  for (let i = 0; i < 50; i++) await worker.tick();
  assert.equal(store.marks.length, 0, 'still not marked: LINE never actually said it arrived');
  assert.equal(pushes.length, 100, '50 ticks × two people, same retry keys each time');
  const keys = pushes.map((p) => p.key);
  assert.deepEqual(new Set(keys).size, 2, 'only two distinct keys across all 50 tries — one per person, never a new one');
});

test('a refusal that a retry will not fix is logged and the order is marked, so it is not tried forever', async () => {
  const store = fakeStore({ pending: ['o1'] });
  const errors = [];
  const { worker } = setup({ store, push: REFUSED, errors });
  await worker.tick();
  assert.deepEqual(store.marks.map((m) => m.id), ['o1']);
  assert.ok(errors.some((e) => /not delivered to Ua/.test(e)));
});

test('an order whose card cannot be read is marked (nothing to send), and no push is made for it', async () => {
  const store = fakeStore({ pending: ['gone'], missing: ['gone'] });
  const { worker, pushes } = setup({ store, push: OK });
  await worker.tick();
  assert.equal(pushes.length, 0);
  assert.deepEqual(store.marks.map((m) => m.id), ['gone']);
});
