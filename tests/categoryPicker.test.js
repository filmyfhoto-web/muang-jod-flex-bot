import { test } from 'node:test';
import assert from 'node:assert/strict';
import { categoryGroupsFlex, categoryTypesFlex } from '../src/flex/categoryPickerFlex.js';
import { buildJobBubble, jobPreviewMessage } from '../src/flex/jobCard.js';
import { CATEGORY_GROUPS } from '../src/utils/category.js';

test('picker step 1: every group is offered, and carries the job id through', () => {
  const json = JSON.stringify(categoryGroupsFlex('job-1'));
  for (const g of CATEGORY_GROUPS) {
    assert.ok(json.includes(g.label), `missing ${g.label}`);
    assert.ok(json.includes(`action=pick_category&group=${g.id}&jobId=job-1`), `missing action for ${g.id}`);
  }
  assert.ok(json.includes('งานทั่วไป')); // the catch-all

  // Without a job id the picker still works (it re-categorises the latest job).
  assert.ok(!JSON.stringify(categoryGroupsFlex()).includes('jobId='));
});

test('picker step 2: the chosen group\'s types, plus a way back', () => {
  const json = JSON.stringify(categoryTypesFlex('sign', 'job-1'));
  assert.ok(json.includes('งานป้าย'));
  assert.ok(json.includes('ป้ายไวนิล'));
  assert.ok(json.includes('โฟมบอร์ด'));
  assert.ok(json.includes('action=pick_category&group=sign&type=vinyl&jobId=job-1'));
  assert.ok(json.includes('เลือกประเภทงานใหม่'));
});

test('picker step 2: a group with no types can still be chosen', () => {
  const json = JSON.stringify(categoryTypesFlex('other', 'job-1'));
  assert.ok(json.includes('งานทั่วไป'));
  assert.ok(json.includes('action=pick_category&group=other&type=&jobId=job-1'));
});

const job = {
  job_name: 'งานป้าย / ป้ายไวนิล',
  job_date: '2026-09-08',
  payment_status: 'pending',
  total: 400,
  items: [
    { item_name: 'ป้ายไวนิล', size: '60x100', quantity: 1, total: 150 },
    { item_name: 'โฟมบอร์ด', size: '40x60', quantity: 1, total: 250 },
  ],
};

test('job card: items are numbered, saved jobs carry แก้ไข / ยกเลิก / หมวด', () => {
  const saved = JSON.stringify(buildJobBubble({ ...job, id: 'job-9' }));
  assert.ok(saved.includes('"text":"1"'));
  assert.ok(saved.includes('"text":"2"'));
  assert.ok(saved.includes('action=edit_job&jobId=job-9'));
  assert.ok(saved.includes('action=delete_job&jobId=job-9'));
  assert.ok(saved.includes('action=pick_category&jobId=job-9'));
});

test('job card: an unsaved draft gets the confirm footer, never edit/delete', () => {
  const preview = JSON.stringify(jobPreviewMessage({ ...job, id: 'should-be-ignored' }));
  assert.ok(preview.includes('action=confirm_add_job'));
  assert.ok(!preview.includes('action=edit_job'));
  assert.ok(!preview.includes('action=delete_job'));

  const draft = JSON.stringify(buildJobBubble(job));
  assert.ok(!draft.includes('action=edit_job'));
});
