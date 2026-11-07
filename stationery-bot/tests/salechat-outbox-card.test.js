// A staff reply that belongs to an order goes to the customer as that order's card; any other reply goes as its text (src/salechat/outbox.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSaleOutbox } from '../src/salechat/outbox.js';

const CARD = {
  order: { id: 'o1', order_no: 'ORD-2569-00001', order_date: '2026-11-04', customer_name: 'คุณสมชาย', subtotal: 100, vat_rate: 0, vat_amount: 0, total: 100, fulfil: 'pickup', created_at: '2026-11-04T11:00:00Z' },
  items: [{ seq: 1, name: 'ดินสอ 2B', qty: 2, unit: 'แท่ง', unit_price: 50, line_total: 100 }],
};

function fake({ jobs, orderIdFor = () => null, card = CARD, cardError = null }) {
  const finished = [];
  return {
    finished,
    store: {
      async claim() {
        return jobs.splice(0);
      },
      async finish(id, result, error = null, requestId = null) {
        finished.push({ id, result, error, requestId });
      },
      async outboxOrderId(id) {
        return orderIdFor(id);
      },
      async orderCard(orderId) {
        if (cardError) throw new Error(cardError);
        return orderId === 'o1' ? card : null;
      },
    },
  };
}

const cfg = { mode: 'pilot', pilotUserIds: ['Uc'], card: { mode: 'on', payNote: 'พร้อมเพย์ 081-234-5678' } };
const job = (over = {}) => ({ id: 'j1', channel_key: 'main', line_user_id: 'Uc', body: 'สรุปใบสั่งงาน ORD-2569-00001 ยอดรวม 100 บาท', retry_key: 'rk-1', ...over });

test('a reply that belongs to an order goes as the order card, not as its text', async () => {
  const { store, finished } = fake({ jobs: [job()], orderIdFor: (id) => (id === 'j1' ? 'o1' : null) });
  const sent = [];
  const outbox = createSaleOutbox({
    store,
    push: async (to, messages, token, key) => {
      sent.push({ to, messages, token, key });
      return { ok: true, status: 200, requestId: 'line-1' };
    },
    tokenFor: () => 't',
    getConfig: () => cfg,
    shopName: () => 'ร้านทดสอบ',
    log: { error() {} },
  });
  assert.deepEqual(await outbox.tick(), { jobs: 1, sent: 1 });
  assert.equal(sent[0].messages.length, 1);
  assert.equal(sent[0].messages[0].type, 'flex');
  assert.match(sent[0].messages[0].altText, /ยืนยันคำสั่งซื้อ ORD-2569-00001/);
  assert.equal(sent[0].key, 'rk-1', 'the same retry key as before');
  assert.deepEqual(finished, [{ id: 'j1', result: 'sent', error: null, requestId: 'line-1' }]);
});

test('a reply that is not about an order goes as its text, as before', async () => {
  const { store } = fake({ jobs: [job({ body: 'ขอบคุณค่ะ' })], orderIdFor: () => null });
  const sent = [];
  const outbox = createSaleOutbox({
    store,
    push: async (to, messages) => {
      sent.push(messages);
      return { ok: true, status: 200 };
    },
    tokenFor: () => 't',
    getConfig: () => cfg,
    log: { error() {} },
  });
  await outbox.tick();
  assert.deepEqual(sent[0], [{ type: 'text', text: 'ขอบคุณค่ะ' }]);
});

test('when the card cannot be built, the text is sent instead, and the problem is logged', async () => {
  const { store } = fake({ jobs: [job()], orderIdFor: () => 'o1', cardError: 'database busy' });
  const sent = [];
  const errors = [];
  const outbox = createSaleOutbox({
    store,
    push: async (to, messages) => {
      sent.push(messages);
      return { ok: true, status: 200 };
    },
    tokenFor: () => 't',
    getConfig: () => cfg,
    log: { error: (...a) => errors.push(a.join(' ')) },
  });
  await outbox.tick();
  assert.deepEqual(sent[0], [{ type: 'text', text: job().body }]);
  assert.ok(errors.some((e) => /database busy/.test(e)));
});

test('a customer outside the pilot list still gets no message, card or not', async () => {
  const { store, finished } = fake({ jobs: [job({ line_user_id: 'Ustranger' })], orderIdFor: () => 'o1' });
  let pushed = 0;
  const outbox = createSaleOutbox({
    store,
    push: async () => {
      pushed++;
      return { ok: true, status: 200 };
    },
    tokenFor: () => 't',
    getConfig: () => cfg,
    log: { error() {} },
  });
  await outbox.tick();
  assert.equal(pushed, 0);
  assert.equal(finished[0].result, 'failed');
});

test('while the customer card is switched off, even an order reply goes as its text, and the database is not asked about it', async () => {
  const { store } = fake({ jobs: [job()], orderIdFor: () => 'o1' });
  let asked = 0;
  store.outboxOrderId = async () => {
    asked++;
    return 'o1';
  };
  const sent = [];
  const outbox = createSaleOutbox({
    store,
    push: async (to, messages) => {
      sent.push(messages);
      return { ok: true, status: 200 };
    },
    tokenFor: () => 't',
    getConfig: () => ({ mode: 'pilot', pilotUserIds: ['Uc'], card: { mode: 'off' } }),
    log: { error() {} },
  });
  await outbox.tick();
  assert.deepEqual(sent[0], [{ type: 'text', text: job().body }]);
  assert.equal(asked, 0);
});
