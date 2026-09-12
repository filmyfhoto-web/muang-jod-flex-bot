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

// ร้านบอกว่า "ตรงเข้าหน้าหมวดงาน ทำไมต้องมีหน้าให้กดเข้าไปอีก มันกดไปแล้วเจอเลย
// ไม่ได้เหรอ ถ้าเรียงหมวดงานเป็น 2 แถวได้ไหม ไม่ต้องยาวลงมา" — ปุ่มบนริชเมนูเคย
// ให้บอตตอบการ์ดรายชื่อหมวดมาในแชต แล้วต้องกดในการ์ดอีกทีถึงจะเปิดหน้าได้

test('the menu button opens the category page itself, not a card about it', () => {
  const menu = readFileSync(new URL('../scripts/create-rich-menu.js', import.meta.url), 'utf8');
  const button = menu.slice(menu.indexOf("label: 'หมวดงาน'"), menu.indexOf("label: 'ออกใบเสร็จ'"));
  assert.match(button, /page: 'category'/, 'หมวดงาน ยังเป็น postback ที่ต้องรอบอตตอบกลับ');
});

test('the category page opens on the categories themselves, two to a row', () => {
  assert.ok(dashboard.includes('id="c-grid"'), 'no grid to put the categories in');
  assert.match(dashboard, /\.cat-grid \{[^}]*grid-template-columns: 1fr 1fr/, 'หมวดงานยังเรียงลงมาแถวเดียว');

  // ไม่มีหมวดใน URL = โชว์หมวดทั้งหมดให้กดเลย ไม่ใช่หน้าว่าง ๆ หรือหน้าที่ error
  const load = dashboard.slice(dashboard.indexOf('async function loadCategory'), dashboard.indexOf('const LOADERS'));
  assert.match(load, /if \(!id\) return renderCategoryGrid\(\)/, 'ไม่ได้เลือกหมวดแล้วไม่มีอะไรให้กด');
  assert.match(load, /\$\('c-grid'\)\.hidden = true/, 'the grid stays up over the jobs');

  // ไทล์มาจาก /api/config เหมือนช่องเลือกหมวดในฟอร์ม ไม่ใช่รายชื่อที่พิมพ์ซ้ำไว้
  const grid = dashboard.slice(dashboard.indexOf('function renderCategoryGrid'), dashboard.indexOf('function openCategory'));
  assert.match(grid, /for \(const g of groups\)/, 'the tiles are a second, hand-written list');
  assert.match(grid, /openCategory\(g\.id\)/, 'a tile does not open its category');
  assert.match(grid, /ยังโหลดหมวดงานไม่สำเร็จ/, 'โหลดหมวดไม่ขึ้นแล้วหน้าว่างเปล่าเฉย ๆ');
});

test('a category opened from the grid can get back to it', () => {
  // ไม่งั้นต้องออกไปตั้งต้นที่ริชเมนูใหม่ทุกครั้งที่อยากดูอีกหมวด
  assert.match(dashboard, /\$\('c-title'\)\.onclick/, 'the heading is not the way back');
  assert.match(dashboard, /'‹ ' \+ \(category/, 'ไม่มีอะไรบอกว่าหัวข้อกดถอยกลับได้');
});
