import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import express from 'express';
import { queueOrder } from '../src/services/jobService.js';
import { createApiRouter } from '../src/routes/api.js';

const dashboard = readFileSync(new URL('../public/liff/index.html', import.meta.url), 'utf8');

// ร้านบอกว่า "หน้าล่าสุดฉันอยากได้เป็นงานรันคิวงาน" — สิ่งที่ต้องรู้ไม่ใช่ "จด
// อะไรไปล่าสุด" แต่คือ "งานไหนต้องเสร็จก่อน"

process.env.LIFF_ID = '1234567890-abcdefgh';

test('the queue is ordered by the day it was promised, not the day it was jotted', () => {
  const jobs = [
    { id: 'c', due_date: null, created_at: '2026-09-01T00:00:00Z' },
    { id: 'a', due_date: '2026-09-13', created_at: '2026-09-11T00:00:00Z' },
    { id: 'b', due_date: '2026-09-20', created_at: '2026-09-02T00:00:00Z' },
  ];
  assert.deepEqual(queueOrder(jobs).map((j) => j.id), ['a', 'b', 'c'], 'ไม่ได้เรียงตามวันนัดรับ');

  // งานที่ยังไม่ได้นัดวันไปท้ายแถว ไม่ใช่ต้นแถว — ไม่มีกำหนดส่งคือยังไม่เร่ง
  assert.equal(queueOrder(jobs).at(-1).id, 'c');

  // นัดวันเดียวกัน ใครสั่งก่อนได้ก่อน
  const sameDay = [
    { id: 'late', due_date: '2026-09-13', created_at: '2026-09-11T09:00:00Z' },
    { id: 'early', due_date: '2026-09-13', created_at: '2026-09-11T08:00:00Z' },
  ];
  assert.deepEqual(queueOrder(sameDay).map((j) => j.id), ['early', 'late']);

  // ไม่แก้ของเดิม — รายการที่ส่งเข้ามาต้องไม่ถูกจัดใหม่คามือ
  const input = [{ id: 'x', due_date: '2026-09-20' }, { id: 'y', due_date: '2026-09-13' }];
  queueOrder(input);
  assert.deepEqual(input.map((j) => j.id), ['x', 'y']);

  assert.deepEqual(queueOrder(), []);
});

test('the dashboard can ask for the queue, and gets it', async () => {
  const calls = [];
  const app = express();
  app.use(
    '/api',
    createApiRouter({
      verify: async () => ({ userId: 'U-line' }),
      resolveProfile: async () => ({ id: 'user-1', line_user_id: 'U-line' }),
      getQueueJobs: async (userId, limit) => {
        calls.push({ userId, limit });
        return [{ id: 'j1', job_name: 'ป้ายไวนิล', due_date: '2026-09-13' }];
      },
    })
  );
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const res = await fetch(`${base}/api/jobs?scope=queue`, { headers: { Authorization: 'Bearer t' } });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.deepEqual(body.jobs.map((j) => j.id), ['j1']);
    assert.equal(calls.length, 1, 'the queue was never asked for');
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test('the home tab shows a queue, numbered and dated', () => {
  assert.match(dashboard, /<h2>คิวงาน/, 'the card is still called รายการล่าสุด');
  assert.match(dashboard, /api\('\/jobs\?scope=queue'\)/, 'nothing fetches the queue');
  // เลขคิวแทนไอคอนหมวด และบรรทัดใต้ชื่อบอกวันนัดรับ ไม่ใช่วันที่จด
  assert.match(dashboard, /ic\.className = 'ic qn'/, 'no queue number on the row');
  assert.match(dashboard, /📅 นัดรับ ' \+ shortThaiDate\(job\.due_date\)/);
  assert.match(dashboard, /ยังไม่ได้นัดวัน/, 'a job with no date says nothing about it');
});

test('every tile and every legend row goes somewhere', () => {
  // "อยากให้กดได้ทุกปุ่มค่ะ"
  assert.match(dashboard, /function statTile\(\{ icon, label, big, sub, trend, onTap \}\)/);
  assert.match(dashboard, /role', 'button'/);

  // ไทล์บนหน้าสรุปครบทั้งสี่ใบ
  const report = dashboard.slice(dashboard.indexOf('async function loadReport'), dashboard.indexOf('async function loadPending'));
  assert.equal((report.match(/onTap:/g) || []).length, 4, 'a tile on the report has nowhere to go');
  assert.match(report, /onTap: \(\) => show\('pending'\)/, 'ค้างรับ does not open the pending tab');

  // ชิ้นส่วนในวงกลมพาไปดูงานของหมวดนั้น
  const legend = dashboard.slice(dashboard.indexOf('function renderLegend'), dashboard.indexOf('function shortThaiDate'));
  assert.match(legend, /openCategory\(c\.id\)/, 'the legend rows are not tappable');
  assert.match(dashboard, /function openCategory\(id\)/);
});
