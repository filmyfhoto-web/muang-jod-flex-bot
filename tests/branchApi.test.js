import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { readFileSync } from 'node:fs';
import { createApiRouter } from '../src/routes/api.js';

/* ทางฝั่งแดชบอร์ด: รายชื่อร้าน และการย้ายงานเข้าร้าน
 *
 * งานเก่าทั้งหมดถูกจดก่อนจะมีสองร้าน จึงขึ้นเป็น "ยังไม่ระบุร้าน" — หน้าแก้ไข
 * ต้องย้ายได้ และฐานข้อมูลที่ยังไม่รันไมเกรชัน 016 ต้องได้คำบอกตรง ๆ ว่าให้
 * ทำอะไร ไม่ใช่ error 500 เปล่า ๆ
 */

process.env.LIFF_ID = '1234567890-abcdefgh';

const BRANCHES = [
  { id: 'b1', name: 'นัฐภรณ์ ปริ้นงาน', slug: 'print', sort: 0 },
  { id: 'b2', name: 'นัฐภรณ์ เชียงกลาง', slug: 'chiangklang', sort: 1 },
];

async function serve(deps = {}) {
  const app = express();
  app.use(express.json());
  app.use(
    '/api',
    createApiRouter({
      verify: async () => ({ userId: 'U-line' }),
      resolveProfile: async () => ({ id: 'user-1', line_user_id: 'U-line' }),
      listBranches: async () => BRANCHES,
      getJobById: async (userId, id) => (id === 'j1' ? { id: 'j1', branch_id: deps.after ?? null } : null),
      setJobBranch: deps.setJobBranch,
    }),
  );
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (path, opts = {}) => {
    const res = await fetch(base + path, {
      ...opts,
      headers: { authorization: 'Bearer t', 'content-type': 'application/json', ...(opts.headers || {}) },
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  call.close = () => server.close();
  return call;
}

test('GET /branches ให้รายชื่อร้านของบัญชีนี้', async () => {
  const call = await serve();
  try {
    const res = await call('/branches');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.branches.map((b) => b.slug), ['print', 'chiangklang']);
  } finally {
    call.close();
  }
});

test('ย้ายงานเข้าร้าน และถอดออกเป็นยังไม่ระบุ', async () => {
  const moves = [];
  const call = await serve({
    setJobBranch: async (userId, jobId, want) => {
      moves.push({ userId, jobId, want });
      return { id: jobId, branch_id: want ? 'b2' : null };
    },
  });
  try {
    const moved = await call('/jobs/j1/branch', { method: 'POST', body: JSON.stringify({ branch: 'chiangklang' }) });
    assert.equal(moved.status, 200);
    assert.equal(moved.body.job.branch_id, 'b2');

    const cleared = await call('/jobs/j1/branch', { method: 'POST', body: JSON.stringify({ branch: null }) });
    assert.equal(cleared.status, 200);
    assert.equal(cleared.body.job.branch_id, null);

    assert.deepEqual(moves.map((m) => m.want), ['chiangklang', null]);
    assert.ok(moves.every((m) => m.userId === 'user-1'), 'ต้องผูกกับเจ้าของเสมอ');
  } finally {
    call.close();
  }
});

test('งานที่ไม่มี ได้ 404 · ร้านที่ไม่มี ได้ 400 ไม่ใช่เงียบ ๆ', async () => {
  const call = await serve({ setJobBranch: async () => null });
  try {
    assert.equal((await call('/jobs/none/branch', { method: 'POST', body: '{}' })).status, 404);
    const bad = await call('/jobs/j1/branch', { method: 'POST', body: JSON.stringify({ branch: 'ghost' }) });
    assert.equal(bad.status, 400);
  } finally {
    call.close();
  }
});

test('ยังไม่รันไมเกรชัน 016 → บอกชื่อไฟล์ที่ต้องรัน ไม่ใช่ 500', async () => {
  const call = await serve({
    setJobBranch: async () => {
      const err = new Error("Could not find the 'branch_id' column of 'jobs' in the schema cache");
      err.code = 'PGRST204';
      throw err;
    },
  });
  try {
    const res = await call('/jobs/j1/branch', { method: 'POST', body: JSON.stringify({ branch: 'print' }) });
    assert.equal(res.status, 503);
    assert.ok(res.body.message.includes('016_branches.sql'));
  } finally {
    call.close();
  }
});

test('หน้าแก้ไขมีช่องเลือกร้าน และส่งเฉพาะตอนที่เปลี่ยนจริง', () => {
  const dash = readFileSync(new URL('../public/liff/index.html', import.meta.url), 'utf8');
  assert.match(dash, /id="e-branch"/);
  assert.ok(dash.includes('ยังไม่ระบุร้าน'));
  // โหลดรายชื่อครั้งเดียว และล่มแล้วหน้าแก้ไขเดิมยังใช้ได้
  assert.match(dash, /api\('\/branches'\)/);
  assert.match(dash, /branches = \[\];/);
  // ส่งเฉพาะตอนเปลี่ยน
  assert.match(dash, /\$\('e-branch'\)\.value !== \(current\.branch_id \|\| ''\)/);
  assert.match(dash, /\/branch'/);
});
