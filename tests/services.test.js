import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMockSupabase } from './helpers/mockSupabase.js';

// Dummy env so config/supabase.js can construct (no network happens; every
// service call below is given the mock client explicitly).
process.env.SUPABASE_URL ||= 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-key';
process.env.LINE_CHANNEL_ACCESS_TOKEN ||= 'test-token';
process.env.LINE_CHANNEL_SECRET ||= 'test-secret';

const {
  createJob,
  getRecentJobs,
  getJobById,
  getTodaySummary,
  getPendingJobs,
  recordPayment,
  cancelJob,
  searchJobs,
} = await import('../src/services/jobService.js');
const { markEventProcessed } = await import('../src/services/webhookEventService.js');

const itemsFor = (price) => [
  { item_name: 'รายการ', size: null, quantity: 1, unit: null, unit_price: price, total: price },
];

function newJobPayload(total, extra = {}) {
  return { jobName: 'งานทดสอบ', items: itemsFor(total), subtotal: total, total, ...extra };
}

test('add job: saves with MJ job_number and items, defaults to pending', async () => {
  const db = createMockSupabase();
  const job = await createJob('userA', newJobPayload(150), db);
  assert.match(job.job_number, /^MJ-\d{8}-\d{4}$/);
  assert.equal(job.items.length, 1);
  assert.equal(job.payment_status, 'pending');
  assert.equal(Number(job.balance_due), 150);
});

test('add job: classifies the work from its items, and takes an explicit category', async () => {
  const db = createMockSupabase();

  const sign = await createJob('userA', { ...newJobPayload(150), items: [{ item_name: 'ป้ายไวนิล 60x100', quantity: 1, unit_price: 150, total: 150 }] }, db);
  assert.equal(sign.category, 'sign');
  assert.equal(sign.category_type, 'vinyl');

  const print = await createJob('userA', { ...newJobPayload(40), items: [{ item_name: 'ถ่ายเอกสาร 20 แผ่น', quantity: 1, unit_price: 40, total: 40 }] }, db);
  assert.equal(print.category, 'print');
  assert.equal(print.category_type, 'copy');

  const unknown = await createJob('userA', { ...newJobPayload(99), items: [{ item_name: 'ของแปลก', quantity: 1, unit_price: 99, total: 99 }] }, db);
  assert.equal(unknown.category, 'other');
  assert.equal(unknown.category_type, null);

  const forced = await createJob('userA', { ...newJobPayload(10), category: 'design', categoryType: 'artwork' }, db);
  assert.equal(forced.category, 'design');
  assert.equal(forced.category_type, 'artwork');
});

test('job_number increments per user per day', async () => {
  const db = createMockSupabase();
  const j1 = await createJob('userA', newJobPayload(100), db);
  const j2 = await createJob('userA', newJobPayload(100), db);
  assert.notEqual(j1.job_number, j2.job_number);
  assert.ok(j1.job_number.endsWith('0001'));
  assert.ok(j2.job_number.endsWith('0002'));
});

test('duplicate webhook event is ignored the second time', async () => {
  const db = createMockSupabase();
  const first = await markEventProcessed('evt-1', 'message', db);
  const second = await markEventProcessed('evt-1', 'message', db);
  assert.equal(first.isNew, true);
  assert.equal(second.isNew, false);
});

test('today summary aggregates total / paid / pending', async () => {
  const db = createMockSupabase();
  await createJob('userA', newJobPayload(100), db);
  await createJob('userA', newJobPayload(200, { paidAmount: 200 }), db);
  const s = await getTodaySummary('userA', db);
  assert.equal(s.jobCount, 2);
  assert.equal(s.total, 300);
  assert.equal(s.paid, 200);
  assert.equal(s.pending, 100);
});

test('pending payment lists pending + partial, not paid', async () => {
  const db = createMockSupabase();
  await createJob('userA', newJobPayload(100), db); // pending
  await createJob('userA', newJobPayload(200, { paidAmount: 50 }), db); // partial
  await createJob('userA', newJobPayload(300, { paidAmount: 300 }), db); // paid
  const pending = await getPendingJobs('userA', db);
  assert.equal(pending.length, 2);
  assert.ok(pending.every((j) => j.payment_status !== 'paid'));
});

test('partial payment updates paid_amount / balance / status', async () => {
  const db = createMockSupabase();
  const job = await createJob('userA', newJobPayload(400), db);

  let updated = await recordPayment('userA', job.id, 150, db);
  assert.equal(updated.payment_status, 'partial');
  assert.equal(Number(updated.paid_amount), 150);
  assert.equal(Number(updated.balance_due), 250);

  updated = await recordPayment('userA', job.id, 250, db);
  assert.equal(updated.payment_status, 'paid');
  assert.equal(Number(updated.balance_due), 0);
});

test('cancel (soft delete) hides the job from recent list', async () => {
  const db = createMockSupabase();
  const job = await createJob('userA', newJobPayload(100), db);
  await cancelJob('userA', job.id, db);
  const recent = await getRecentJobs('userA', 10, db);
  assert.equal(recent.find((j) => j.id === job.id), undefined);
});

test('user A cannot see user B data', async () => {
  const db = createMockSupabase();
  const a = await createJob('userA', newJobPayload(100), db);
  await createJob('userB', newJobPayload(999), db);

  const recentA = await getRecentJobs('userA', 10, db);
  assert.ok(recentA.length >= 1);
  assert.ok(recentA.every((j) => j.user_id === 'userA'));

  // B's job total must never appear in A's list
  assert.equal(recentA.find((j) => Number(j.total) === 999), undefined);

  // Fetching A's job as user B returns nothing
  assert.equal(await getJobById('userB', a.id, db), null);
});

test('search is scoped to the requesting user', async () => {
  const db = createMockSupabase();
  await createJob('userA', { jobName: 'ร้านกาแฟดอย', items: itemsFor(100), subtotal: 100, total: 100 }, db);
  await createJob('userB', { jobName: 'ร้านกาแฟดอย', items: itemsFor(100), subtotal: 100, total: 100 }, db);

  const foundA = await searchJobs('userA', 'กาแฟ', {}, db);
  assert.equal(foundA.length, 1);
  assert.ok(foundA.every((j) => j.user_id === 'userA'));

  const none = await searchJobs('userA', 'ไม่มีจริง', {}, db);
  assert.equal(none.length, 0);
});
