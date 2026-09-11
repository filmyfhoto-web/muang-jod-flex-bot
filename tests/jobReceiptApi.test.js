import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createApiRouter } from '../src/routes/api.js';

// The shop finishes a job on the edit screen and wants the receipt from there.
// Until now a receipt could only be raised from the chat, so that screen —
// the one they are actually on — had no way to print one.

process.env.LIFF_ID = '1234567890-abcdefgh';
process.env.PUBLIC_BASE_URL = 'https://shop.example.com';

async function serve(deps = {}) {
  const calls = { billed: [] };
  const app = express();
  app.use(
    '/api',
    createApiRouter({
      verify: async () => ({ userId: 'U-line' }),
      resolveProfile: async () => ({ id: 'user-1', line_user_id: 'U-line' }),
      getJobById: async (userId, id) =>
        id === 'job-1' ? { id: 'job-1', customer_name: 'พี่นก', bill_id: null, total: 930 } :
        id === 'job-billed' ? { id: 'job-billed', customer_name: 'พี่นก', bill_id: 'bill-9', total: 930 } : null,
      createBill: async (userId, ids, opts) => {
        calls.billed.push({ userId, ids, opts });
        return { id: 'bill-1', bill_number: 'MJ-B-0001', share_token: 'tok-new', total: 930 };
      },
      getBillById: async (userId, id) => ({ id, bill_number: 'MJ-B-0009', share_token: 'tok-old', total: 930 }),
      ...deps,
    })
  );
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    calls,
    receipt: async (id) => {
      const res = await fetch(`${base}/api/jobs/${id}/receipt`, {
        method: 'POST',
        headers: { Authorization: 'Bearer t' },
      });
      return { status: res.status, body: await res.json().catch(() => ({})) };
    },
    close: () => new Promise((r) => server.close(r)),
  };
}

test('a job with no bill gets one, and comes back as a link to open', async () => {
  const s = await serve();
  try {
    const { status, body } = await s.receipt('job-1');
    assert.equal(status, 200);
    assert.equal(body.url, 'https://shop.example.com/r/tok-new');
    assert.equal(body.reused, false);
    assert.deepEqual(s.calls.billed, [{ userId: 'user-1', ids: ['job-1'], opts: { customerName: 'พี่นก' } }]);
  } finally {
    await s.close();
  }
});

test('a job already billed opens that bill, rather than raising a second one', async () => {
  const s = await serve();
  try {
    const { status, body } = await s.receipt('job-billed');
    assert.equal(status, 200);
    assert.equal(body.url, 'https://shop.example.com/r/tok-old', 'a new bill was raised for billed work');
    assert.equal(body.reused, true);
    assert.deepEqual(s.calls.billed, [], 'createBill was called anyway');
  } finally {
    await s.close();
  }
});

test("somebody else's job is not found, so no bill is raised for it", async () => {
  const s = await serve();
  try {
    const { status } = await s.receipt('job-someone-else');
    assert.equal(status, 404);
    assert.deepEqual(s.calls.billed, []);
  } finally {
    await s.close();
  }
});

test('a bill that could not be raised says so instead of half-opening', async () => {
  const s = await serve({ createBill: async () => null });
  try {
    const { status, body } = await s.receipt('job-1');
    assert.equal(status, 409);
    assert.ok(body.message, 'no message for the shop to read');
  } finally {
    await s.close();
  }
});

test('with no public address there is no link, and it says which is missing', async () => {
  const had = process.env.PUBLIC_BASE_URL;
  delete process.env.PUBLIC_BASE_URL;
  const hadRender = process.env.RENDER_EXTERNAL_URL;
  delete process.env.RENDER_EXTERNAL_URL;
  const s = await serve();
  try {
    const { status, body } = await s.receipt('job-1');
    assert.equal(status, 503);
    assert.ok(body.message);
  } finally {
    await s.close();
    process.env.PUBLIC_BASE_URL = had;
    if (hadRender !== undefined) process.env.RENDER_EXTERNAL_URL = hadRender;
  }
});
