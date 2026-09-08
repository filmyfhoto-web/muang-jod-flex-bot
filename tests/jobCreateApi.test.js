import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createApiRouter, decodeDataUrl } from '../src/routes/api.js';

// POST /api/jobs is the LIFF form's save button. The thing worth guarding is
// that the browser does not get to decide what a job costs: it sends rows, the
// server adds them up.

// The router refuses everything when LIFF is unconfigured — that guard has its
// own test in liff.test.js; here it just has to be out of the way.
process.env.LIFF_ID = '1234567890-abcdefgh';

// A 1x1 PNG, so the decoder gets real bytes rather than a made-up string.
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

// Spin the router up on a real port: it is the only way to exercise the body
// parser, the auth middleware and the handler the way express will run them.
async function serve(deps = {}) {
  const calls = { created: [], attached: [] };
  const app = express();
  app.use(
    '/api',
    createApiRouter({
      verify: async () => ({ userId: 'U-line' }),
      resolveProfile: async () => ({ id: 'user-1', line_user_id: 'U-line' }),
      createJob: async (userId, draft) => {
        calls.created.push({ userId, draft });
        return { id: 'job-1', job_number: 'MJ-0001', ...draft };
      },
      saveAttachment: async (userId, job, file) => {
        calls.attached.push({ userId, jobId: job.id, fileType: file.fileType, bytes: file.buffer.length });
        return { id: 'att-1' };
      },
      ...deps,
    })
  );
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;

  return {
    calls,
    post: async (body) => {
      const res = await fetch(`${base}/api/jobs`, {
        method: 'POST',
        headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return { status: res.status, body: await res.json().catch(() => ({})) };
    },
    close: () => new Promise((r) => server.close(r)),
  };
}

const AREA_ROW = { item_name: 'ไวนิล', size: '160x300 ซม.', quantity: 4.8, unit: 'ตร.ม.', unit_price: 165 };

test('the server adds the job up itself, ignoring any total the browser sends', async (t) => {
  const s = await serve();
  t.after(() => s.close());

  const res = await s.post({
    customerName: 'รพสต.บ้านชี',
    items: [AREA_ROW, { item_name: 'นามบัตร', quantity: 2, unit_price: 250 }],
    total: 999999, // ไม่ควรถูกใช้
    subtotal: 1,
  });

  assert.equal(res.status, 201);
  const { draft } = s.calls.created[0];
  assert.equal(draft.total, 1292, '4.8 × 165 = 792 บวก 2 × 250 = 500');
  assert.equal(draft.subtotal, 1292);
  assert.equal(draft.customerName, 'รพสต.บ้านชี');
  assert.equal(draft.items[0].total, 792, 'a row without a total gets one');
  assert.equal(draft.jobName, 'งานป้าย / ป้ายไวนิล', 'named from the items, as the chat flow does');
});

test('discount and deposit can never exceed the job', async (t) => {
  const s = await serve();
  t.after(() => s.close());

  await s.post({ items: [{ item_name: 'ป้าย', quantity: 1, unit_price: 100 }], discount: 500, paidAmount: 900 });
  const { draft } = s.calls.created[0];
  assert.equal(draft.discount, 100);
  assert.equal(draft.total, 0);
  assert.equal(draft.paidAmount, 0);
});

test('a job with no usable rows is refused, and the reason is in Thai', async (t) => {
  const s = await serve();
  t.after(() => s.close());

  const empty = await s.post({ items: [] });
  assert.equal(empty.status, 400);
  assert.match(empty.body.message, /อย่างน้อย 1 รายการ/);

  const zeroQty = await s.post({ items: [{ item_name: 'ป้าย', quantity: 0, unit_price: 10 }] });
  assert.equal(zeroQty.status, 400);

  assert.equal(s.calls.created.length, 0, 'nothing was saved');
});

test('a photo rides along with the job, and a bad one is refused before saving', async (t) => {
  const s = await serve();
  t.after(() => s.close());

  const ok = await s.post({ items: [{ item_name: 'ป้าย', quantity: 1, unit_price: 100 }], images: [PNG] });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.attached, 1);
  assert.equal(s.calls.attached[0].fileType, 'image/png');
  assert.equal(s.calls.attached[0].jobId, 'job-1');

  const bad = await s.post({ items: [{ item_name: 'ป้าย', quantity: 1, unit_price: 100 }], image: 'not-a-data-url' });
  assert.equal(bad.status, 400);
  assert.equal(s.calls.created.length, 1, 'the job was not saved with an unusable attachment');
});

test('a failed upload never loses the job that was already saved', async (t) => {
  const s = await serve({
    saveAttachment: async () => {
      throw new Error('storage down');
    },
  });
  t.after(() => s.close());

  const res = await s.post({ items: [{ item_name: 'ป้าย', quantity: 1, unit_price: 100 }], images: [PNG] });
  assert.equal(res.status, 201, 'the job is still created');
  assert.equal(res.body.attached, 0);
  assert.equal(res.body.attachmentsFailed, 1, 'and the caller is told');
});

test('decodeDataUrl accepts only the two image types storage knows', () => {
  assert.equal(decodeDataUrl(PNG).fileType, 'image/png');
  assert.ok(decodeDataUrl(PNG).buffer.length > 0);

  assert.match(decodeDataUrl('data:application/pdf;base64,AAAA').error, /JPG หรือ PNG/);
  assert.match(decodeDataUrl('').error, /ไม่ถูกต้อง/);
  assert.match(decodeDataUrl('data:image/png;base64,').error, /ไม่ถูกต้อง/);

  // A photo straight off a phone, un-shrunk, is refused rather than stored.
  const huge = 'data:image/jpeg;base64,' + 'A'.repeat(8 * 1024 * 1024);
  assert.match(decodeDataUrl(huge).error, /5 MB/);
});
