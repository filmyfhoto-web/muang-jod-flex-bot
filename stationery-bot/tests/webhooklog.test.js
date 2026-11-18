// The bookkeeping of src/webhooklog.js against a stand-in database: what counts as a new event, what a repeat is, and what is sent for done and failed.
// The table and functions themselves are checked on PostgreSQL in db/test/webhook-log.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWebhookLog } from '../src/webhooklog.js';

function fakeDb(answer = () => ({ data: [], error: null })) {
  const calls = [];
  return {
    calls,
    rpc: async (name, args) => {
      calls.push({ name, args });
      return answer(name, args);
    },
  };
}

const ev = (id) => ({ type: 'message', webhookEventId: id, source: { type: 'user', userId: 'Ux' } });

test('an event without a webhookEventId is not written down and passes straight through', async () => {
  const db = fakeDb();
  const plain = { type: 'follow', source: { type: 'user', userId: 'Ux' } };
  assert.deepEqual(await createWebhookLog({ db }).receive('main', [plain]), [plain]);
  assert.equal(db.calls.length, 0);
});

test('only the events the database reports as new are handled; a repeat is left out', async () => {
  const db = fakeDb((name) => ({ data: name === 'line_webhook_record' ? ['WE-1'] : null, error: null }));
  const got = await createWebhookLog({ db }).receive('main', [ev('WE-1'), ev('WE-2')]);
  assert.deepEqual(got.map((e) => e.webhookEventId), ['WE-1']);
  assert.equal(db.calls[0].name, 'line_webhook_record');
  assert.equal(db.calls[0].args.p_channel, 'main');
  assert.deepEqual(db.calls[0].args.p_events.map((e) => e.webhookEventId), ['WE-1', 'WE-2']);
});

test('the same event twice in one body is handled once', async () => {
  const db = fakeDb(() => ({ data: ['WE-1'], error: null }));
  const got = await createWebhookLog({ db }).receive('main', [ev('WE-1'), ev('WE-1')]);
  assert.equal(got.length, 1);
});

test('a database error is thrown, so the webhook can answer LINE with a failure', async () => {
  const db = fakeDb(() => ({ data: null, error: { message: 'permission denied', code: '42501' } }));
  await assert.rejects(createWebhookLog({ db }).receive('main', [ev('WE-1')]), /permission denied/);
});

test('settle sends done for finished events and failed, with the reason, for the others; nothing to settle means no call', async () => {
  const db = fakeDb(() => ({ data: 1, error: null }));
  const log = createWebhookLog({ db });
  await log.settle('main', ['WE-1']);
  await log.settle('main', ['WE-2'], new Error('boom'));
  await log.settle('main', []);
  assert.deepEqual(db.calls.map((c) => c.name), ['line_webhook_done', 'line_webhook_failed']);
  assert.deepEqual(db.calls[1].args, { p_channel: 'main', p_ids: ['WE-2'], p_error: 'boom' });
});
