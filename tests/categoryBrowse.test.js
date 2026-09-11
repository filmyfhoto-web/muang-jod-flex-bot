import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createMockSupabase } from './helpers/mockSupabase.js';
import { categoryBrowseFlex, categoryGroupsFlex } from '../src/flex/categoryPickerFlex.js';
import { getJobsByCategory } from '../src/services/jobService.js';
import { CATEGORY_GROUPS, OTHER_GROUP } from '../src/utils/category.js';

const dashboard = readFileSync(new URL('../public/liff/index.html', import.meta.url), 'utf8');
const url = (id) => `https://liff.line.me/1-a?tab=category&category=${id}`;

test('หมวดงาน from the menu opens the page for that kind of work', () => {
  // The shop asked: "ตอนเลือกงานแล้ว เปิดลิ้งค์หน้างานนั้นๆเลยได้มั้ย จะได้เห็น
  // ว่ามีใครสั่งอะไรไปบ้างแล้ว" — so a row here is a link, not a postback that
  // makes the bot fetch a card.
  const msg = categoryBrowseFlex(url);
  const rows = msg.contents.body.contents.slice(1);

  assert.equal(rows.length, CATEGORY_GROUPS.length + 1, 'every kind of work, plus the catch-all');
  for (const r of rows) {
    assert.equal(r.action.type, 'uri', `${r.action.label} still goes through the bot`);
    assert.match(r.action.uri, /tab=category&category=[a-z]+$/);
  }
  assert.ok(rows.some((r) => r.action.uri.endsWith('category=' + OTHER_GROUP.id)));
});

test('with no LIFF app there is no page, so there is no card pretending there is', () => {
  assert.equal(categoryBrowseFlex(() => null), null);
});

test('filing a job into a category is untouched — different question, same list', () => {
  // This one puts ONE job in a category. It must stay a postback: there is no
  // page that files a job.
  const rows = categoryGroupsFlex('job-1').contents.body.contents.slice(1);
  for (const r of rows) {
    assert.equal(r.action.type, 'postback');
    assert.match(r.action.data, /action=pick_category&group=[a-z]+&jobId=job-1/);
  }
});

test('a category lists that shop\'s jobs of that kind, and nobody else\'s', async () => {
  const job = (id, over = {}) => ({
    id, user_id: 'u1', job_name: 'งาน ' + id, category: 'sign', status: 'active',
    total: 100, created_at: `2026-09-1${id}T00:00:00.000Z`, ...over,
  });
  const client = createMockSupabase({
    jobs: [
      job('1'),
      job('2', { category: 'print' }),
      job('3', { status: 'cancelled' }),
      job('4', { user_id: 'u2' }),
      job('5'),
    ],
  });

  const jobs = await getJobsByCategory('u1', 'sign', 60, client);
  assert.deepEqual(jobs.map((j) => j.id).sort(), ['1', '5']);
  assert.ok(!jobs.some((j) => j.category !== 'sign'), 'another category leaked in');
  assert.ok(!jobs.some((j) => j.status === 'cancelled'), 'a cancelled job is not work you did');
});

test('the page has somewhere to put them, and says whose they are', () => {
  assert.ok(dashboard.includes('id="v-category"'), 'no category view');
  assert.ok(dashboard.includes('id="c-list"') && dashboard.includes('id="c-title"'));
  assert.match(dashboard, /async function loadCategory/);

  // The name comes back from the server with the jobs — the URL is something
  // anyone can type, so it must not be what the page believes.
  assert.match(dashboard, /category \? category\.icon \+ ' ' \+ category\.label/);

  // A row's date used to print as "2026-09-11" in the middle of a Thai line.
  assert.match(dashboard, /function shortThaiDate/);
  assert.match(dashboard, /opts\.showDate \? shortThaiDate\(job\.job_date\)/);
});
