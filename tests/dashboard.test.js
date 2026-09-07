import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMockSupabase } from './helpers/mockSupabase.js';
import { getDashboard, breakdownByCategory, trendVs } from '../src/services/dashboardService.js';
import { dashboardFlex } from '../src/flex/dashboardFlex.js';
import { todayISO } from '../src/utils/dates.js';

const USER = 'user-1';
const OTHER = 'user-2';
const today = todayISO();

function job(id, over = {}) {
  return {
    id,
    user_id: USER,
    job_number: `MJ-x-${id}`,
    job_name: 'ป้ายไวนิล',
    customer_name: 'พี่นก',
    job_date: today,
    total: 100,
    paid_amount: 0,
    balance_due: 100,
    payment_status: 'pending',
    status: 'active',
    created_at: `2026-09-07T0${id}:00:00.000Z`,
    ...over,
  };
}

function db() {
  return createMockSupabase({
    jobs: [
      job('1', { total: 300, paid_amount: 300, balance_due: 0, payment_status: 'paid' }),
      job('2', { total: 200, paid_amount: 50, balance_due: 150, payment_status: 'partial' }),
      job('3', { total: 100 }),
      job('4', { job_date: '2026-01-01', total: 999 }), // another day
      job('5', { status: 'cancelled', total: 500 }), // cancelled
      { ...job('6', { total: 777 }), user_id: OTHER }, // another user
    ],
    job_items: [{ id: 'i1', job_id: '3', item_name: 'ป้ายไวนิล', quantity: 1, unit_price: 100, total: 100 }],
  });
}

test('getDashboard: today only, this user only, cancelled excluded', async () => {
  const dash = await getDashboard(USER, {}, db());

  assert.equal(dash.date, today);
  assert.equal(dash.summary.jobCount, 3); // 1,2,3
  assert.equal(dash.summary.total, 600);
  assert.equal(dash.summary.paid, 350);
  assert.equal(dash.summary.pending, 250);
  assert.deepEqual(dash.counts, { paid: 1, partial: 1, pending: 1 });
});

test('getDashboard: recent list is limited and carries items; pending is opt-in', async () => {
  const client = db();
  const dash = await getDashboard(USER, { recentLimit: 2 }, client);
  assert.equal(dash.recent.length, 2);
  assert.ok(dash.recent.every((j) => Array.isArray(j.items)));
  assert.equal(dash.pending, undefined);

  const withPending = await getDashboard(USER, { includePending: true }, client);
  // pending + partial, any date, this user only
  assert.deepEqual(withPending.pending.map((j) => j.id).sort(), ['2', '3', '4']);
});

test('getDashboard: a user with no jobs gets zeroes, not a crash', async () => {
  const dash = await getDashboard('nobody', {}, db());
  assert.equal(dash.summary.jobCount, 0);
  assert.equal(dash.summary.total, 0);
  assert.deepEqual(dash.counts, { paid: 0, partial: 0, pending: 0 });
  assert.deepEqual(dash.recent, []);
});

test('breakdownByCategory: groups, money and shares, biggest first', () => {
  const rows = [
    { category: 'sign', total: 600 },
    { category: 'print', total: 300 },
    { category: 'print', total: 100 },
  ];
  const [first, second] = breakdownByCategory(rows);
  assert.equal(first.id, 'sign');
  assert.equal(first.count, 1);
  assert.equal(first.total, 600);
  assert.equal(first.percent, 60);
  assert.equal(second.id, 'print');
  assert.equal(second.count, 2);
  assert.equal(second.total, 400);
  assert.equal(second.percent, 40);

  // No stored category: classified from the items instead.
  const [only] = breakdownByCategory([{ total: 50, items: [{ item_name: 'ถ่ายเอกสาร' }] }]);
  assert.equal(only.id, 'print');
  assert.deepEqual(breakdownByCategory([]), []);
  assert.equal(breakdownByCategory([{ total: 0 }])[0].percent, 0); // no divide-by-zero
});

test('trendVs: compares with yesterday, and says nothing when there is no baseline', () => {
  assert.deepEqual(trendVs(1250, 1116), { percent: 12, direction: 'up', yesterday: 1116 });
  assert.equal(trendVs(50, 100).percent, -50);
  assert.equal(trendVs(100, 100).direction, 'flat');
  assert.equal(trendVs(500, 0).percent, null);
  assert.equal(trendVs(0, 0).direction, 'flat');
});

test('getDashboard: categories and the trend against yesterday', async () => {
  const client = db();
  client._store.tables.jobs.push(
    { ...job('7', { job_date: '2026-01-01' }), id: '7' } // different day, ignored by today's split
  );
  const dash = await getDashboard(USER, {}, client);
  assert.ok(Array.isArray(dash.categories));
  assert.equal(dash.categories.reduce((n, c) => n + c.count, 0), 3);
  assert.equal(dash.trend.percent, null); // nothing yesterday to compare against
});

test('dashboardFlex: headline, categories, shares and actions', async () => {
  const dash = await getDashboard(USER, {}, db());
  const msg = dashboardFlex(dash, { liffUrl: 'https://liff.line.me/1234567890-abcdefgh?tab=today' });

  assert.equal(msg.type, 'flex');
  assert.equal(msg.contents.type, 'bubble');
  const json = JSON.stringify(msg);
  assert.ok(json.includes('สรุปงานวันนี้'));
  assert.ok(json.includes('ยอดวันนี้'));
  assert.ok(json.includes('สัดส่วนงานวันนี้'));
  assert.ok(json.includes('รายการล่าสุด'));
  assert.ok(json.includes('฿600'));
  assert.ok(json.includes('action=pending_payment'));
  assert.ok(json.includes('https://liff.line.me/1234567890-abcdefgh?tab=today'));
  assert.ok(msg.altText.includes('3 งาน'));
});

test('dashboardFlex: empty day says so and omits the dashboard button without LIFF', async () => {
  const dash = await getDashboard('nobody', {}, db());
  const msg = dashboardFlex(dash, { liffUrl: null });
  const json = JSON.stringify(msg);
  assert.ok(json.includes('วันนี้ยังไม่มีงาน'));
  assert.ok(!json.includes('สัดส่วนงานวันนี้')); // nothing to split
  assert.ok(!json.includes('"type":"uri"'));
});
