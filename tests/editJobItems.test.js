import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createMockSupabase } from './helpers/mockSupabase.js';
import { replaceJobItems, getJobById } from '../src/services/jobService.js';
import { safe, jobPatchSchema } from '../src/utils/validation.js';

const jot = readFileSync(new URL('../public/liff/jot/script.js', import.meta.url), 'utf8');
const dashboard = readFileSync(new URL('../public/liff/index.html', import.meta.url), 'utf8');

// The shop typed a job of two lines and could only edit one number: the
// dashboard's edit form has a single "จำนวนเงิน" box and no rows at all, and
// updateJob never touched job_items — the lines were write-once.

function world() {
  return createMockSupabase({
    jobs: [
      { id: 'j1', user_id: 'u1', job_name: 'งานป้าย', status: 'active', total: 930, discount: 0, created_at: '2026-09-11T00:00:00.000Z' },
      { id: 'j2', user_id: 'u2', job_name: 'ของคนอื่น', status: 'active', total: 50, created_at: '2026-09-11T00:00:00.000Z' },
    ],
    job_items: [
      { id: 'i1', job_id: 'j1', item_name: 'รูปหน้างานพร้อมกรอบ', quantity: 1, unit_price: 600, total: 600, created_at: '2026-09-11T00:00:00.000Z' },
      { id: 'i2', job_id: 'j1', item_name: 'ไวนิล หน้างาน', quantity: 1, unit_price: 330, total: 330, created_at: '2026-09-11T00:00:01.000Z' },
      { id: 'i3', job_id: 'j2', item_name: 'ของคนอื่น', quantity: 1, unit_price: 50, total: 50, created_at: '2026-09-11T00:00:00.000Z' },
    ],
  });
}

test('the lines inside a job can be changed at all', async () => {
  const client = world();
  const rows = await replaceJobItems('u1', 'j1', [
    { item_name: 'รูปหน้างานพร้อมกรอบ', quantity: 1, unit_price: 600, total: 600 },
    { item_name: 'ไวนิล หน้างาน', quantity: 1, unit_price: 400, total: 400 },
    { item_name: 'ค่าติดตั้ง', quantity: 1, unit_price: 200, total: 200 },
  ], client);

  assert.equal(rows.length, 3);
  const after = await getJobById('u1', 'j1', client);
  assert.deepEqual(after.items.map((i) => i.item_name), ['รูปหน้างานพร้อมกรอบ', 'ไวนิล หน้างาน', 'ค่าติดตั้ง']);
  assert.equal(after.items.find((i) => i.item_name === 'ไวนิล หน้างาน').unit_price, 400);
});

test('a line can be removed, which is what a shorter list means', async () => {
  const client = world();
  await replaceJobItems('u1', 'j1', [{ item_name: 'รูปหน้างานพร้อมกรอบ', quantity: 1, unit_price: 600, total: 600 }], client);
  const after = await getJobById('u1', 'j1', client);
  assert.equal(after.items.length, 1, 'the row that was dropped is still there');
});

test("another shop's job is not touched, and nothing of theirs is deleted", async () => {
  const client = world();
  assert.equal(await replaceJobItems('u1', 'j2', [{ item_name: 'x', quantity: 1, unit_price: 1 }], client), null);

  const theirs = await getJobById('u2', 'j2', client);
  assert.equal(theirs.items.length, 1, 'their line was deleted by a stranger');
  assert.equal(theirs.items[0].item_name, 'ของคนอื่น');
});

test('a missing line total is worked out, not stored as nothing', async () => {
  const client = world();
  await replaceJobItems('u1', 'j1', [{ item_name: 'ป้าย', quantity: 3, unit_price: 150 }], client);
  const [row] = (await getJobById('u1', 'j1', client)).items;
  assert.equal(row.total, 450, '3 × 150');
});

test('the patch endpoint accepts rows, and the form does not send a total with them', () => {
  // The rows are the money. A total sent alongside them could disagree with
  // the lines printed under it on the receipt.
  const ok = safe(jobPatchSchema, { items: [{ item_name: 'ป้าย', quantity: 1, unit_price: 100 }] });
  assert.equal(ok.ok, true, ok.error);
  assert.equal(safe(jobPatchSchema, { items: [] }).ok, false, 'a job of no lines is not a job');

  assert.match(jot, /method: 'PATCH'/, 'editing still creates a second job');
  assert.match(jot, /items: payload\.items/);
  const patchBody = /body: JSON\.stringify\(\{\s*items: payload\.items[\s\S]{0,220}?\}\),/.exec(jot);
  assert.ok(patchBody, 'cannot find what the edit sends');
  assert.ok(!/\btotal\b/.test(patchBody[0]), 'the browser is still stating the total');
});

test('the form knows it is editing, and the dashboard offers the way in', () => {
  assert.match(jot, /params\.get\('job'\)/, 'nothing reads ?job=');
  assert.match(jot, /editingJobId = jobId/);
  // A saved job must not be written over the draft the shop has going.
  const loader = /const jobId = \(params\.get\('job'\)[\s\S]*?^    \}$/m.exec(jot);
  assert.ok(loader && !/saveDraft\(\)/.test(loader[0]), 'opening a saved job overwrites the local draft');

  assert.ok(dashboard.includes('id="e-items"'), 'no way to reach the rows from the edit form');
  assert.match(dashboard, /\/app\/jot\?job=/);
  assert.match(dashboard, /แก้รายการย่อย \(\$\{rows\} รายการ\)/);
});
