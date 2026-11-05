import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createApiRouter } from '../src/routes/api.js';
import { accountKey } from '../src/utils/customerBook.js';

/* ร้านขอ "แยกใบแต่ละงานได้ หรือรวมได้ ใช้เลือกเป็นใบเสร็จ หรือ ใบลงบัญชี"
 * — ติ๊กเลือกงานในบัญชีของเจ้านั้น แล้วบอกว่าจะออกใบแบบไหน
 */

process.env.LIFF_ID = '1234567890-abcdefgh';
process.env.PUBLIC_BASE_URL = 'https://shop.example.com';

const JOBS = [
  { id: 'j1', customer_name: 'รร.สบกอน', category: 'sign', job_name: 'ป้ายเกษียณ', job_date: '2026-09-25',
    status: 'active', total: 2448, paid_amount: 0, balance_due: 2448, bill_id: null, created_at: '2026-09-25T09:00:00Z' },
  { id: 'j2', customer_name: 'รร สบกอน', category: 'sign', job_name: 'โฟมบอร์ด', job_date: '2026-09-25',
    status: 'active', total: 2100, paid_amount: 0, balance_due: 2100, bill_id: null, created_at: '2026-09-25T09:05:00Z' },
  { id: 'j3', customer_name: 'รร.สบกอน', category: 'stamp', job_name: 'ตรายาง', job_date: '2026-08-12',
    status: 'active', total: 500, paid_amount: 500, balance_due: 0, bill_id: 'bill-old', created_at: '2026-08-12T10:00:00Z' },
  { id: 'j4', customer_name: 'น้าปิ่ม', category: 'sticker', job_name: 'สติ๊กเกอร์', job_date: '2026-09-30',
    status: 'active', total: 250, paid_amount: 250, balance_due: 0, bill_id: null, created_at: '2026-09-30T08:30:00Z' },
];

async function serve(deps = {}) {
  const calls = { billed: [] };
  const app = express();
  app.use(express.json());
  app.use(
    '/api',
    createApiRouter({
      verify: async () => ({ userId: 'U-line' }),
      resolveProfile: async () => ({ id: 'user-1', line_user_id: 'U-line' }),
      getBookJobs: async () => JOBS,
      createBill: async (userId, ids, opts) => {
        calls.billed.push({ ids: [...ids], opts });
        const jobs = JOBS.filter((j) => ids.includes(j.id) && !j.bill_id);
        if (!jobs.length) return null;
        return {
          id: `bill-${calls.billed.length}`,
          bill_number: `MJ-B-000${calls.billed.length}`,
          customer_name: opts?.customerName ?? jobs[0].customer_name,
          share_token: `tok-${calls.billed.length}`,
          total: jobs.reduce((n, j) => n + j.total, 0),
          jobs,
        };
      },
      ...deps,
    })
  );
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, init) => {
    const res = await fetch(`${base}${path}`, {
      ...init,
      headers: { Authorization: 'Bearer t', 'content-type': 'application/json', ...(init?.headers || {}) },
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };
  return {
    calls,
    book: () => call('/api/book'),
    account: (key) => call(`/api/book/account?key=${encodeURIComponent(key)}`),
    bill: (body) => call('/api/bills', { method: 'POST', body: JSON.stringify(body) }),
    close: () => new Promise((r) => server.close(r)),
  };
}

test('สมุดลูกค้า: โรงเรียนเป็นบัญชีรายเจ้า งานหน้าร้านเป็นหมวดงาน', async () => {
  const s = await serve();
  try {
    const { status, body } = await s.book();
    assert.equal(status, 200);
    assert.deepEqual(body.orgs.map((o) => [o.name, o.jobCount, o.owed]), [['รร.สบกอน', 3, 4548]]);
    assert.deepEqual(body.walkins.map((c) => c.label), ['สติ๊กเกอร์']);
    assert.equal(body.totals.orgOwed, 4548);
  } finally {
    await s.close();
  }
});

test('เปิดบัญชีเจ้าหนึ่ง เห็นงานทุกใบ แยกหมวด และรู้ว่าใบไหนออกบิลไปแล้ว', async () => {
  const s = await serve();
  try {
    const { status, body } = await s.account(accountKey('รร.สบกอน'));
    assert.equal(status, 200);
    assert.equal(body.account.name, 'รร.สบกอน');
    assert.deepEqual(body.account.groups.map((g) => [g.label, g.jobs.length]), [['งานป้าย', 2], ['ตรายาง', 1]]);

    const stamp = body.account.groups[1].jobs[0];
    assert.equal(stamp.billed, true);

    // เจ้าที่ไม่มีงาน ไม่ใช่บัญชีเปล่า
    assert.equal((await s.account('ไม่มีเจ้านี้')).status, 404);
    // ไม่บอกว่าเป็นบัญชีของใคร = คำขอไม่ครบ
    assert.equal((await s.account('')).status, 400);
  } finally {
    await s.close();
  }
});

test('รวมเป็นใบเดียว = บิลใบเดียว · แยกใบละงาน = บิลใบละงาน', async () => {
  const s = await serve();
  try {
    const merged = await s.bill({ jobIds: ['j1', 'j2'], mode: 'merge', customerName: 'รร.สบกอน' });
    assert.equal(merged.status, 201);
    assert.equal(merged.body.bills.length, 1);
    assert.equal(merged.body.bills[0].total, 4548);
    assert.equal(merged.body.bills[0].url, 'https://shop.example.com/r/tok-1');
    assert.deepEqual(s.calls.billed, [{ ids: ['j1', 'j2'], opts: { customerName: 'รร.สบกอน' } }]);
  } finally {
    await s.close();
  }

  const s2 = await serve();
  try {
    const split = await s2.bill({ jobIds: ['j1', 'j2'], mode: 'split' });
    assert.equal(split.status, 201);
    assert.equal(split.body.bills.length, 2);
    assert.deepEqual(split.body.bills.map((b) => b.total), [2448, 2100]);
    assert.deepEqual(s2.calls.billed.map((c) => c.ids), [['j1'], ['j2']]);
  } finally {
    await s2.close();
  }
});

test('งานที่ออกบิลไปแล้ว ออกซ้ำไม่ได้ และบอกไปตรง ๆ ว่าทำไม', async () => {
  const s = await serve();
  try {
    const { status, body } = await s.bill({ jobIds: ['j3'], mode: 'merge' });
    assert.equal(status, 409);
    assert.equal(body.error, 'nothing_billed');
    assert.match(body.message, /ออกใบไปแล้ว/);
  } finally {
    await s.close();
  }
});

test('เลือกมาบางใบออกไม่ได้ ใบที่เหลือยังออก และบอกจำนวนที่ออกจริง', async () => {
  const s = await serve();
  try {
    // j3 ออกบิลไปแล้ว j1 ยังไม่ออก — ต้องได้บิลของ j1 ใบเดียว ไม่ใช่ล้มทั้งคำขอ
    const { status, body } = await s.bill({ jobIds: ['j1', 'j3'], mode: 'split' });
    assert.equal(status, 201);
    assert.equal(body.bills.length, 1);
    assert.equal(body.requested, 2);
    assert.equal(body.billed, 1);
  } finally {
    await s.close();
  }
});

test('ไม่เลือกงานเลย หรือเลือกทีเดียวเป็นร้อยใบ ไม่ผ่าน', async () => {
  const s = await serve();
  try {
    assert.equal((await s.bill({ jobIds: [] })).status, 400);
    assert.equal((await s.bill({})).status, 400);

    const many = await s.bill({ jobIds: Array.from({ length: 61 }, (_, i) => `x${i}`) });
    assert.equal(many.status, 400);
    assert.match(many.body.message, /ไม่เกิน 60/);
    assert.equal(s.calls.billed.length, 0);
  } finally {
    await s.close();
  }
});

test('เลือกงานใบเดิมซ้ำ นับเป็นใบเดียว ไม่ออกบิลสองรอบ', async () => {
  const s = await serve();
  try {
    const { status, body } = await s.bill({ jobIds: ['j1', 'j1', 'j1'], mode: 'split' });
    assert.equal(status, 201);
    assert.equal(body.bills.length, 1);
    assert.deepEqual(s.calls.billed.map((c) => c.ids), [['j1']]);
  } finally {
    await s.close();
  }
});
