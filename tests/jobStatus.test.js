import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createApiRouter } from '../src/routes/api.js';
import { statusPatch, jobStatus } from '../src/utils/jobState.js';
import { buildLedger } from '../src/utils/ledger.js';

/* ร้านขอ: "แก้ไข · ทำเสร็จ · ลูกค้ารับแล้ว · ได้รับเงิน (จ่ายสด) · ยังไม่ได้รับเงิน (ลงบัญชี)"
 * เลือกข้อไหนก็ไม่ลากข้ออื่นตาม
 */

process.env.LIFF_ID = '1234567890-abcdefgh';

const NOW = new Date('2026-10-06T03:00:00Z');
const job = (over = {}) => ({ id: 'j1', total: 1000, paid_amount: 0, balance_due: 1000, payment_status: 'pending', ...over });

test('ทำเสร็จ / ลูกค้ารับ เป็นอิสระจากเรื่องเงิน', () => {
  const done = statusPatch(job(), { done: true }, NOW);
  assert.ok(done.done_at);
  assert.equal(done.paid_amount, undefined); // ไม่แตะเงิน

  const picked = statusPatch(job(), { picked: true }, NOW);
  assert.ok(picked.picked_up_at);
  assert.ok(picked.done_at, 'รับของแล้วแปลว่าเสร็จแล้ว');
  assert.equal(picked.balance_due, undefined);

  const undone = statusPatch(job({ done_at: 'x', picked_up_at: 'y' }), { done: false }, NOW);
  assert.equal(undone.done_at, null);
  assert.equal(undone.picked_up_at, null, 'ยังไม่เสร็จ = ยังไม่ได้รับ');

  const unpicked = statusPatch(job({ done_at: 'x', picked_up_at: 'y' }), { picked: false }, NOW);
  assert.equal(unpicked.picked_up_at, null);
  assert.equal(unpicked.done_at, undefined, 'ถอยเรื่องรับ ไม่ทำให้งานกลับเป็นยังไม่เสร็จ');
});

test('ได้รับเงิน: จ่ายสด / โอน เก็บครบ + ลงบัญชีวันนี้ตามช่องทาง', () => {
  for (const method of ['cash', 'transfer']) {
    const p = statusPatch(job(), { money: method }, NOW);
    assert.equal(p.paid_amount, 1000);
    assert.equal(p.balance_due, 0);
    assert.equal(p.payment_status, 'paid');
    assert.equal(p.pay_method, method);
    assert.equal(p.booked_at, NOW.toISOString());
  }
  // กดซ้ำไม่ขยับเวลาลงบัญชีเดิม
  const again = statusPatch(job({ booked_at: '2026-10-01T00:00:00Z' }), { money: 'cash' }, NOW);
  assert.equal(again.booked_at, '2026-10-01T00:00:00Z');
});

test('ยังไม่ได้รับเงิน: ลงบัญชี = ค้างจ่ายที่บันทึกไว้ ไม่นับเป็นรายรับ', () => {
  const acct = statusPatch(job(), { money: 'account' }, NOW);
  assert.equal(acct.balance_due, 1000);
  assert.equal(acct.payment_status, 'pending');
  assert.equal(acct.booked_at, NOW.toISOString());
  assert.equal(acct.pay_method, null);

  const plain = statusPatch(job({ booked_at: 'x' }), { money: 'unpaid' }, NOW);
  assert.equal(plain.booked_at, null);
});

test('ยังไม่ได้รับเงิน: งานที่เคยจ่ายครบกลับเป็นศูนย์ แต่มัดจำที่รับไว้ไม่หาย', () => {
  const wasPaid = statusPatch(job({ paid_amount: 1000, balance_due: 0, payment_status: 'paid' }), { money: 'unpaid' }, NOW);
  assert.equal(wasPaid.paid_amount, 0);
  assert.equal(wasPaid.balance_due, 1000);

  const deposit = statusPatch(job({ paid_amount: 300, balance_due: 700, payment_status: 'partial' }), { money: 'unpaid' }, NOW);
  assert.equal(deposit.paid_amount, 300);
  assert.equal(deposit.balance_due, 700);
  assert.equal(deposit.payment_status, 'partial');
});

test('ค่าที่ไม่ถูกหรือไม่มีอะไรให้ทำ = null', () => {
  assert.equal(statusPatch(job(), {}), null);
  assert.equal(statusPatch(job(), { money: 'bitcoin' }), null);
  assert.equal(statusPatch(job(), { done: 'yes' }), null);
});

test('jobStatus อ่านกลับมาตรงกับที่เขียน', () => {
  const j = (change) => ({ ...job(), ...statusPatch(job(), change, NOW) });
  assert.equal(jobStatus(j({ money: 'cash' })).money, 'cash');
  assert.equal(jobStatus(j({ money: 'transfer' })).money, 'transfer');
  assert.equal(jobStatus(j({ money: 'account' })).money, 'account');
  assert.equal(jobStatus(j({ money: 'unpaid' })).money, 'unpaid');
  assert.equal(jobStatus({ ...job(), paid_amount: 1000, balance_due: 0 }).money, 'paid'); // งานเก่าไม่รู้ช่องทาง
  assert.equal(jobStatus({ ...job(), paid_amount: 300, balance_due: 700 }).money, 'partial');
  const s = jobStatus(j({ picked: true }));
  assert.deepEqual([s.done, s.picked], [true, true]);
});

test('ใบลงบัญชี: ลงบัญชีแต่ยังไม่จ่ายไม่ใช่รายรับ ไปอยู่ยอดยกไป', () => {
  const cash = { ...job({ id: 'a' }), ...statusPatch(job(), { money: 'cash' }, NOW) };
  const acct = { ...job({ id: 'b', total: 500, balance_due: 500 }), ...statusPatch(job({ total: 500, balance_due: 500 }), { money: 'account' }, NOW) };
  const ledger = buildLedger([cash, acct], '2026-10-06');
  assert.equal(ledger.total, 1000);
  assert.equal(ledger.jobCount, 1);
  assert.equal(ledger.carry.owed, 500);
  assert.equal(ledger.carry.jobCount, 1);
});

test('API: POST /jobs/:id/status เขียนจริงและตอบสถานะกลับ', async () => {
  const rows = { j1: job() };
  const app = express();
  app.use(express.json());
  app.use('/api', createApiRouter({
    verify: async () => ({ userId: 'U1' }),
    resolveProfile: async () => ({ id: 'user-1', line_user_id: 'U1' }),
    getJobById: async (_u, id) => rows[id] || null,
    updateJob: async (_u, id, patch) => ((rows[id] = { ...rows[id], ...patch }), rows[id]),
  }));
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const post = async (id, body) => {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/jobs/${id}/status`, {
      method: 'POST',
      headers: { Authorization: 'Bearer t', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };
  try {
    const a = await post('j1', { picked: true, money: 'cash' });
    assert.equal(a.status, 200);
    assert.deepEqual([a.body.status.done, a.body.status.picked, a.body.status.money], [true, true, 'cash']);
    assert.ok(rows.j1.booked_at);

    assert.equal((await post('j1', {})).status, 400);
    assert.equal((await post('j1', { money: 'x' })).status, 400);
    assert.equal((await post('nope', { done: true })).status, 404);
  } finally {
    server.close();
  }
});
