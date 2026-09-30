import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createApiRouter } from '../src/routes/api.js';

/* แตะช่องในตารางสี่ขั้น แล้วต้องบันทึกจริง
 *
 * ร้านเขียนมา: งานส่วนไหน เสร็จแล้ว *รับแล้ว *จ่ายแล้ว *ลงบัญชี
 */

process.env.LIFF_ID = '1234567890-abcdefgh';

function serve(rows, deps = {}) {
  const saved = [];
  const app = express();
  app.use(express.json());
  app.use(
    '/api',
    createApiRouter({
      verify: async () => ({ userId: 'U1' }),
      resolveProfile: async () => ({ id: 'user-1', line_user_id: 'U1' }),
      getJobById: async (userId, id) => rows[id] || null,
      updateJob: async (userId, id, patch) => {
        saved.push({ id, patch });
        rows[id] = { ...rows[id], ...patch };
        return rows[id];
      },
      ...deps,
    })
  );
  const server = app.listen(0);
  return { saved, rows, server, ready: new Promise((r) => server.once('listening', r)) };
}

async function post(s, id, body) {
  const res = await fetch(`http://127.0.0.1:${s.server.address().port}/api/jobs/${id}/stage`, {
    method: 'POST',
    headers: { Authorization: 'Bearer t', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

const job = (over = {}) => ({ id: 'j1', total: 960, paid_amount: 0, balance_due: 960, ...over });

test('แตะช่องแล้วงานเดินถึงขั้นนั้น และตอบกลับว่าอยู่ขั้นไหน', async () => {
  const s = serve({ j1: job() });
  await s.ready;
  try {
    const one = await post(s, 'j1', { stage: 1 });
    assert.equal(one.status, 200);
    assert.equal(one.body.stage, 1);
    assert.ok(s.rows.j1.done_at);
    assert.equal(s.rows.j1.picked_up_at, null);

    const three = await post(s, 'j1', { stage: 3 });
    assert.equal(three.body.stage, 3);
    assert.equal(s.rows.j1.balance_due, 0);
    assert.equal(s.rows.j1.payment_status, 'paid');

    // ชื่อสี่ขั้นส่งกลับไปด้วย หน้าจอจะได้เรียกเหมือนกันทุกที่
    assert.deepEqual(three.body.stages, ['ทำเสร็จ', 'ลูกค้ารับ', 'ได้เงิน', 'ลงบัญชี']);
  } finally {
    s.server.close();
  }
});

test('ถอยขั้นได้ และเงินที่เคยบอกว่าเก็บครบ กลับเป็นค้างจริง ๆ', async () => {
  const s = serve({ j1: job({ done_at: 'x', picked_up_at: 'y', paid_amount: 960, balance_due: 0, payment_status: 'paid' }) });
  await s.ready;
  try {
    const back = await post(s, 'j1', { stage: 2 });
    assert.equal(back.body.stage, 2);
    assert.equal(s.rows.j1.paid_amount, 0);
    assert.equal(s.rows.j1.balance_due, 960);
    assert.equal(s.rows.j1.payment_status, 'pending');
  } finally {
    s.server.close();
  }
});

test('ขั้นที่ไม่มีจริง หรือไม่ได้บอกขั้นมา ต้องไม่เขียนอะไรเลย', async () => {
  const s = serve({ j1: job({ done_at: 'x', picked_up_at: 'y' }) });
  await s.ready;
  try {
    for (const body of [{ stage: 9 }, { stage: -1 }, { stage: 'สอง' }, { stage: null }, {}]) {
      const res = await post(s, 'j1', body);
      assert.equal(res.status, 400, JSON.stringify(body));
    }
    // ไม่ได้บอกขั้นมา ต้องไม่กลายเป็นคำสั่งถอยกลับจุดเริ่มต้นแล้วลบเวลาทิ้ง
    assert.equal(s.saved.length, 0);
    assert.equal(s.rows.j1.done_at, 'x');
    assert.equal(s.rows.j1.picked_up_at, 'y');
  } finally {
    s.server.close();
  }
});

test('งานของคนอื่นหรืองานที่ไม่มีอยู่ ตอบ 404', async () => {
  const s = serve({ j1: job() });
  await s.ready;
  try {
    assert.equal((await post(s, 'ไม่มีงานนี้', { stage: 1 })).status, 404);
    assert.equal(s.saved.length, 0);
  } finally {
    s.server.close();
  }
});

test('ยังไม่ได้รัน migration 015 บอกไปตรง ๆ ว่าต้องทำอะไร ไม่ใช่ error เปล่า', async () => {
  const s = serve(
    { j1: job() },
    {
      updateJob: async () => {
        const err = new Error(`Could not find the 'done_at' column of 'jobs' in the schema cache`);
        err.code = 'PGRST204';
        throw err;
      },
    }
  );
  await s.ready;
  try {
    const res = await post(s, 'j1', { stage: 1 });
    assert.equal(res.status, 503);
    assert.equal(res.body.error, 'not_ready');
    assert.match(res.body.message, /015_job_stages\.sql/);
  } finally {
    s.server.close();
  }
});

test('บันทึกวิธีรับเงิน เงินสดหรือโอน คู่กับยอดที่รับ', async () => {
  const s = serve(
    { j1: job() },
    { recordPayment: async () => ({ id: 'j1', total: 960, paid_amount: 960, balance_due: 0 }) }
  );
  await s.ready;
  try {
    const res = await fetch(`http://127.0.0.1:${s.server.address().port}/api/jobs/j1/payments`, {
      method: 'POST',
      headers: { Authorization: 'Bearer t', 'content-type': 'application/json' },
      body: JSON.stringify({ amount: 960, method: 'transfer' }),
    });
    assert.equal(res.status, 200);
    assert.deepEqual(s.saved, [{ id: 'j1', patch: { pay_method: 'transfer' } }]);
  } finally {
    s.server.close();
  }
});

test('ไม่ได้บอกว่าจ่ายทางไหน ไม่เดาให้ และเงินที่รับมาต้องไม่หาย', async () => {
  const s = serve(
    { j1: job() },
    {
      recordPayment: async () => ({ id: 'j1', total: 960, paid_amount: 960, balance_due: 0 }),
      updateJob: async () => {
        // ยังไม่ได้รัน migration — การจดวิธีจ่ายพลาด ต้องไม่ทำให้ยอดที่รับมาหายไปด้วย
        const err = new Error(`Could not find the 'pay_method' column of 'jobs' in the schema cache`);
        err.code = 'PGRST204';
        throw err;
      },
    }
  );
  await s.ready;
  try {
    const base = `http://127.0.0.1:${s.server.address().port}/api/jobs/j1/payments`;
    const headers = { Authorization: 'Bearer t', 'content-type': 'application/json' };

    const plain = await fetch(base, { method: 'POST', headers, body: JSON.stringify({ amount: 960 }) });
    assert.equal(plain.status, 200);
    assert.equal(s.saved.length, 0, 'ไม่ได้บอกวิธีจ่าย ต้องไม่ไปเขียนอะไร');

    const withMethod = await fetch(base, { method: 'POST', headers, body: JSON.stringify({ amount: 960, method: 'cash' }) });
    assert.equal(withMethod.status, 200);
    assert.equal((await withMethod.json()).job.paid_amount, 960);
  } finally {
    s.server.close();
  }
});
