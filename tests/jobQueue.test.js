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
  // เลขคิวแทนไอคอนหมวด ส่วนวันนัดรับอยู่บนหัวข้อวันที่คั่นแต่ละกลุ่ม
  assert.match(dashboard, /ic\.className = 'ic qn'/, 'no queue number on the row');
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

// ร้านบอกว่า "แยกงานรับแล้วกับค้างงาน ทำคิวงานตามลำดับวันให้หน่อยค่ะ" — คิวที่
// เอางานที่เก็บเงินแล้วมาปนกับงานที่ยังค้าง แล้วไล่วันปนกันทั้งกอง อ่านไม่ออกว่า
// วันนี้ต้องทำอะไร

test('the queue is two piles, each in day order', () => {
  const q = dashboard.slice(dashboard.indexOf('function renderQueue'), dashboard.indexOf('async function loadReport'));
  assert.match(q, /section\('💰 ค้างรับ', owed/, 'ค้างรับ is not its own pile');
  assert.match(q, /section\('✅ รับเงินแล้ว', paid/, 'paid jobs are still mixed in');
  assert.ok(
    q.indexOf("'💰 ค้างรับ'") < q.indexOf("'✅ รับเงินแล้ว'"),
    'the money still owed must come first — that is the work'
  );
  // เรียงซ้ำฝั่งหน้าเว็บ ไม่ฝากความถูกต้องไว้กับลำดับที่เซิร์ฟเวอร์ส่งมา
  assert.match(q, /\[\.\.\.list\]\.sort\(byDue\)/, 'the section trusts whatever order it was handed');

  const split = dashboard.slice(dashboard.indexOf('async function loadQueue'), dashboard.indexOf('function dayLabel'));
  assert.match(split, /payment_status !== 'paid'/);
  assert.match(split, /ค้างรับ ' \+ owed\.length/, 'the summary line does not say how the queue splits');
});

test('a day says what it means, and a late one says so twice', () => {
  const d = dashboard.slice(dashboard.indexOf('function dayLabel'), dashboard.indexOf('function renderQueue'));
  assert.match(d, /เลยกำหนด/, 'an overdue day looks like any other');
  assert.match(d, /'วันนี้'/);
  assert.match(d, /พรุ่งนี้/);
  assert.match(d, /ยังไม่ได้นัดวัน/);
  // งานที่เลยกำหนดและยังไม่ได้เงิน ต้องเห็นบนแถวของมันเองด้วย ไม่ใช่แค่บนหัวข้อวัน
  assert.match(dashboard, /job\.due_date < opts\.today && !opts\.done/);
  assert.match(dashboard, /เลยกำหนดแล้ว/);
});

// ร้านบอกว่า "ข้างบนเป็นชื่องาน ข้างล่างเป็นชื่อลูกค้า อยากได้ชื่อลูกค้าเป็นเหมือน
// สีเน้นคำว่าค้างรับ แต่เป็นสีของเฉพาะหมวดงาน ไม่ซ้ำกัน" — ชื่อลูกค้าเคยเป็นตัว
// จาง ๆ ปนอยู่กับวันที่และเลขงาน ทั้งที่เป็นสิ่งที่ร้านกวาดตาหาก่อนเพื่อน

test('the customer name is a chip in that category\'s own colour', () => {
  assert.match(dashboard, /\.who \{/, 'ไม่มีสไตล์ของชิปชื่อลูกค้า');
  assert.match(dashboard, /function colorOf\(job\)/, 'หน้าเว็บไม่รู้สีของหมวด');
  assert.match(dashboard, /function customerChip\(job\)/);

  // พื้นจาง ตัวหนังสือสีเต็ม — ใช้สีเต็มเป็นพื้นแล้วตัวหนังสือจะจมหายไปกับสีอ่อน
  const chip = dashboard.slice(dashboard.indexOf('function customerChip'), dashboard.indexOf('function statTile'));
  assert.match(chip, /el\.style\.color = color;/);
  assert.match(chip, /el\.style\.background = color \+ '26';/);
  // ไม่มีชื่อลูกค้าก็ไม่มีชิปเปล่า ๆ ลอยอยู่
  assert.match(chip, /if \(!name\) return null;/);
  // หมวดที่ไม่รู้จักได้สีเทากลาง ไม่ใช่ undefined ที่ทำให้ชิปไม่มีสี
  assert.match(dashboard, /\?\.color \|\| '#94A3B8'/);

  // แถวในรายการใช้ชิปจริง ไม่ใช่ยัดชื่อกลับไปเป็นข้อความจาง ๆ เหมือนเดิม
  const row = dashboard.slice(dashboard.indexOf('function jobRow'), dashboard.indexOf('function renderJobs'));
  assert.match(row, /const chip = customerChip\(job\);/);
  assert.ok(!/small\.textContent = \[job\.customer_name/.test(row), 'ชื่อลูกค้ายังถูกต่อเป็นข้อความธรรมดา');

  // สีต้องส่งมาจากเซิร์ฟเวอร์ ไม่งั้นชิปเป็นเทาหมดทุกหมวด
  const api = readFileSync(new URL('../src/routes/api.js', import.meta.url), 'utf8');
  const config = api.slice(api.indexOf("router.get('/config'"), api.indexOf("// Auth for everything below."));
  assert.match(config, /color: g\.color/, '/api/config ไม่ได้ส่งสีของหมวดมา');
  assert.match(config, /color: OTHER_GROUP\.color/);
});

/* ร้านขอ "การแบ่งช่องหน้างาน ว่าอันไหนรับแล้ว หรืออันไหนยังไม่ได้รับ เพื่อจะได้
 * ส่งใบเสร็จออกให้ลูกค้าหรือคนลงบัญชีร้าน"
 *
 * สองกองมีอยู่แล้ว แต่กอง "รับเงินแล้ว" อยู่ใต้งานค้างรับสิบงาน — ในภาพที่ร้าน
 * ส่งมา ต้องเลื่อนผ่าน 14,840 บาทไปก่อนถึงจะเจอ ช่องที่กดสลับได้จึงคือสิ่งที่
 * ขาด ไม่ใช่การแบ่งกอง
 */

// ดึงฟังก์ชันจริงออกมาจากหน้าเว็บมารันในเทสต์ แบบเดียวกับที่ jotRate ทำ
function evalFromDashboard(...names) {
  const src = names
    .map((name) => {
      const start = dashboard.indexOf('function ' + name + '(');
      assert.notEqual(start, -1, 'หาฟังก์ชัน ' + name + ' ในหน้าเว็บไม่เจอ');
      // นับวงเล็บปีกกาจนปิดครบ จะได้ตัวฟังก์ชันทั้งก้อนพอดี
      let depth = 0;
      for (let i = dashboard.indexOf('{', start); i < dashboard.length; i++) {
        if (dashboard[i] === '{') depth++;
        else if (dashboard[i] === '}' && --depth === 0) return dashboard.slice(start, i + 1);
      }
      throw new Error('ฟังก์ชัน ' + name + ' ปิดไม่ครบ');
    })
    .join('\n');
  return new Function(src + '\nreturn { ' + names.join(', ') + ' };')();
}

test('งานที่รับเงินแล้ว ไม่มีป้ายแดง "เลยกำหนด"', () => {
  const { dayLabel } = evalFromDashboard('shortThaiDate', 'dayLabel');
  const today = '2026-09-20';

  // งานค้างรับที่เลยวันนัดมาแล้ว ต้องแดงเหมือนเดิม นั่นคือเงินที่ยังไม่ได้
  const owed = dayLabel('2026-09-13', today, false);
  assert.equal(owed.cls, 'late');
  assert.match(owed.text, /^เลยกำหนด · /);

  // งานเดียวกันแต่รับเงินไปแล้ว วันที่ผ่านมาคือประวัติ ไม่ใช่เรื่องค้าง
  const done = dayLabel('2026-09-13', today, true);
  assert.equal(done.cls, '');
  assert.equal(done.text, owed.text.replace('เลยกำหนด · ', ''));

  // ป้ายแดงทั้งกองบนงานที่จบแล้ว ทำให้สีแดงบนงานที่ค้างจริงหมดความหมาย
  assert.equal(dayLabel(today, today, true).cls, '');
  assert.equal(dayLabel('2026-09-30', today, true).cls, '');
  assert.equal(dayLabel(null, today, true).text, 'ยังไม่ได้นัดวัน');

  // และของเดิมต้องยังทำงานอยู่
  assert.equal(dayLabel(today, today, false).text, 'วันนี้');
  assert.equal(dayLabel('2026-09-21', today, false).cls, 'today');
});

test('คิวงานมีช่องให้กดสลับ ค้างรับ / รับแล้ว', () => {
  assert.match(dashboard, /id="t-queue-filter"/, 'ไม่มีช่องสลับในคิวงาน');
  for (const v of ['all', 'owed', 'paid']) {
    assert.match(dashboard, new RegExp('data-v="' + v + '"'), 'ไม่มีปุ่ม ' + v);
  }

  // กดแล้วต้องกรองจากข้อมูลชุดเดิม ไม่ใช่ยิง API ใหม่ทุกครั้งที่กด
  const paint = dashboard.slice(dashboard.indexOf('function paintQueue'), dashboard.indexOf('function dayLabel'));
  assert.match(paint, /renderQueue\(\$\('t-recent'\), owed, paid, queueFilter\)/);
  assert.ok(!/await api\(/.test(paint), 'การสลับช่องไปโหลดข้อมูลใหม่');

  // เลือกช่องไหนไว้ เปิดมาใหม่ต้องอยู่ช่องเดิม — ร้านลงบัญชีทีละหลายงาน
  assert.match(dashboard, /QUEUE_FILTER_KEY/);
  assert.match(dashboard, /localStorage\.setItem\(QUEUE_FILTER_KEY/);

  // กรองแล้วไม่เหลือสักงาน ต้องบอกว่าเกิดอะไรขึ้น ไม่ใช่ช่องว่างให้เดาเอง
  const render = dashboard.slice(dashboard.indexOf('function renderQueue'), dashboard.indexOf('async function loadReport'));
  assert.match(render, /filter === 'owed' && !owed\.length/);
  assert.match(render, /filter === 'paid' && !paid\.length/);
  assert.match(render, /if \(filter !== 'paid'\) section\('💰 ค้างรับ'/);
  assert.match(render, /if \(filter !== 'owed'\) section\('✅ รับเงินแล้ว'/);
});
