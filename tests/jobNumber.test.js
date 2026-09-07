import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatJobNumber, summarizeJobs } from '../src/services/jobService.js';

test('formatJobNumber -> MJ-YYYYMMDD-XXXX', () => {
  assert.equal(formatJobNumber('2026-09-07', 1), 'MJ-20260907-0001');
  assert.equal(formatJobNumber('2026-09-07', 42), 'MJ-20260907-0042');
  assert.equal(formatJobNumber('2026-12-31', 1234), 'MJ-20261231-1234');
});

test('formatJobNumber matches the documented pattern', () => {
  assert.match(formatJobNumber('2026-01-05', 7), /^MJ-\d{8}-\d{4}$/);
});

test('summarizeJobs aggregates total / paid / pending', () => {
  const rows = [
    { total: 100, paid_amount: 0, balance_due: 100, payment_status: 'pending' },
    { total: 200, paid_amount: 50, balance_due: 150, payment_status: 'partial' },
    { total: 300, paid_amount: 300, balance_due: 0, payment_status: 'paid' },
  ];
  const s = summarizeJobs(rows, '2026-09-07');
  assert.equal(s.jobCount, 3);
  assert.equal(s.total, 600);
  assert.equal(s.paid, 350);
  assert.equal(s.pending, 250);
});

test('summarizeJobs falls back when paid_amount absent', () => {
  const rows = [
    { total: 100, payment_status: 'paid' },
    { total: 100, payment_status: 'pending' },
  ];
  const s = summarizeJobs(rows, '2026-09-07');
  assert.equal(s.paid, 100);
  assert.equal(s.pending, 100);
});
