import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMockSupabase } from './helpers/mockSupabase.js';
import { buildReport, getReport } from '../src/services/jobService.js';
import { buildReportCSV, generateReportCSV } from '../src/services/reportService.js';
import { todayISO } from '../src/utils/dates.js';

const at = (hhmm) => `${todayISO()}T${hhmm}:00+07:00`;

test('buildReport (daily): totals, cancelled, average, ordering', () => {
  const rows = [
    { id: '1', status: 'active', total: 100, paid_amount: 100, balance_due: 0, payment_status: 'paid', created_at: at('09:00'), job_name: 'A' },
    { id: '2', status: 'active', total: 300, paid_amount: 100, balance_due: 200, payment_status: 'partial', created_at: at('10:00'), job_name: 'B' },
    { id: '3', status: 'cancelled', total: 999, paid_amount: 0, balance_due: 999, payment_status: 'pending', created_at: at('11:00'), job_name: 'C' },
    { id: '4', status: 'active', total: 200, paid_amount: 0, balance_due: 200, payment_status: 'pending', created_at: at('08:00'), job_name: 'D' },
  ];
  const r = buildReport(rows, { label: 'วันนี้', period: 'daily' });

  assert.equal(r.jobCount, 3);
  assert.equal(r.cancelledCount, 1);
  assert.equal(r.totalSales, 600);
  assert.equal(r.paid, 200);
  assert.equal(r.pending, 400);
  assert.equal(r.avgPerBill, 200);
  assert.equal(r.recent[0].job_name, 'B'); // latest active
  assert.equal(r.top[0].job_name, 'B'); // highest value
  assert.equal(r.top[1].job_name, 'D');
});

test('buildReport: recent/top capped at 5; empty is safe', () => {
  const rows = Array.from({ length: 8 }, (_, i) => ({
    id: String(i),
    status: 'active',
    total: (i + 1) * 10,
    paid_amount: 0,
    balance_due: (i + 1) * 10,
    payment_status: 'pending',
    created_at: at(String(8 + i).padStart(2, '0') + ':00'),
    job_name: `job${i}`,
  }));
  const r = buildReport(rows, { period: 'monthly' });
  assert.equal(r.jobCount, 8);
  assert.equal(r.recent.length, 5);
  assert.equal(r.top.length, 5);
  assert.equal(r.top[0].total, 80); // highest first

  const empty = buildReport([], { period: 'daily' });
  assert.equal(empty.jobCount, 0);
  assert.equal(empty.avgPerBill, 0);
  assert.equal(empty.recent.length, 0);
});

test('getReport is scoped to the requesting user', async () => {
  const db = createMockSupabase({
    jobs: [
      { id: 'a1', user_id: 'userA', status: 'active', total: 100, paid_amount: 0, balance_due: 100, payment_status: 'pending', created_at: at('09:00'), job_name: 'A1' },
      { id: 'a2', user_id: 'userA', status: 'active', total: 200, paid_amount: 200, balance_due: 0, payment_status: 'paid', created_at: at('10:00'), job_name: 'A2' },
      { id: 'b1', user_id: 'userB', status: 'active', total: 9999, paid_amount: 0, balance_due: 9999, payment_status: 'pending', created_at: at('11:00'), job_name: 'B1' },
    ],
  });

  const rA = await getReport('userA', 'daily', db);
  assert.equal(rA.jobCount, 2);
  assert.equal(rA.totalSales, 300);
  assert.equal(rA.top.find((j) => j.total === 9999), undefined); // never sees B's job
});

test('buildReportCSV: header, BOM, and field escaping', () => {
  const csv = buildReportCSV([
    {
      job_number: 'MJ-20260907-0001',
      job_date: '2026-09-07',
      job_name: 'ป้าย, ไวนิล',
      customer_name: 'ร้าน "A"',
      status: 'active',
      payment_status: 'pending',
      subtotal: 150,
      discount: 0,
      total: 150,
      paid_amount: 0,
      balance_due: 150,
      created_at: at('09:00'),
    },
  ]);
  assert.ok(csv.startsWith('﻿job_number,job_date,job_name'));
  assert.ok(csv.includes('"ป้าย, ไวนิล"')); // comma triggers quoting
  assert.ok(csv.includes('"ร้าน ""A"""')); // quotes doubled
});

test('generateReportCSV: monthly filename + user isolation', async () => {
  const db = createMockSupabase({
    jobs: [
      { id: 'a1', user_id: 'userA', job_number: 'MJ-A-1', status: 'active', total: 100, created_at: at('09:00') },
      { id: 'a2', user_id: 'userA', job_number: 'MJ-A-2', status: 'active', total: 200, created_at: at('10:00') },
      { id: 'b1', user_id: 'userB', job_number: 'MJ-B-1', status: 'active', total: 300, created_at: at('11:00') },
    ],
  });

  const { filename, csv, rowCount } = await generateReportCSV('userA', 'monthly', db);
  assert.match(filename, /^muang-jod-report-\d{4}-\d{2}\.csv$/);
  assert.equal(rowCount, 2);
  assert.ok(csv.includes('MJ-A-1'));
  assert.ok(csv.includes('MJ-A-2'));
  assert.ok(!csv.includes('MJ-B-1')); // user B never leaks
});
