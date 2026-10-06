import { test } from 'node:test';
import assert from 'node:assert/strict';
import { firstQuestion, applyAnswer, questionMessage } from '../src/actions/reviewJobs.js';
import { updateJob, getUnbookedJobs } from '../src/services/jobService.js';
import { jobStatus } from '../src/utils/jobState.js';
import { resolveMenuCommand } from '../src/utils/menuCommands.js';
import { missingColumn } from '../src/utils/dbErrors.js';

/* ร้านขอ "แก้ไขงานเก่าว่าอันไหนลงบัญชี ยังไม่จ่าย ไม่อยากหลายขั้นตอน"
 * — การ์ดใบละสามปุ่ม กดทีเดียวจบ
 */

const OLD = { id: 'j1', job_name: 'ป้ายไวนิล', customer_name: 'รร.สบกอน', job_date: '2026-09-01', total: 1000, paid_amount: 0, balance_due: 1000, payment_status: 'pending' };

const NOW = new Date('2026-10-06T03:00:00Z');
const run = (job, answers) => {
  // เดินคำถามตามคำตอบจนจบ เหมือนที่แชตทำทีละปุ่ม
  let cur = { ...job };
  let q = firstQuestion(cur);
  const asked = [];
  for (const a of answers) {
    asked.push(q);
    const step = applyAnswer(cur, q, a, NOW);
    assert.ok(step, `คำตอบ ${a} ของข้อ ${q} ใช้ไม่ได้`);
    if (step.patch) cur = { ...cur, ...step.patch };
    q = step.next;
    if (!q) break;
  }
  return { job: cur, asked, left: q };
};

test('คำถามแรกคือข้อที่ยังไม่รู้คำตอบ ไล่จากต้นทางของงาน', () => {
  assert.equal(firstQuestion(OLD), 'done');
  assert.equal(firstQuestion({ ...OLD, done_at: 'x' }), 'picked');
  assert.equal(firstQuestion({ ...OLD, done_at: 'x', picked_up_at: 'y' }), 'money');
  // จ่ายแล้วแต่ยังไม่ลงบัญชี = ถามช่องทาง เพื่อลงใบลงบัญชีให้ถูกกอง
  assert.equal(firstQuestion({ ...OLD, done_at: 'x', picked_up_at: 'y', paid_amount: 1000, balance_due: 0 }), 'method');
});

test('คุยจบแบบ: เสร็จ → รับแล้ว → ได้รับเงิน → จ่ายสด', () => {
  const { job, asked, left } = run(OLD, ['y', 'y', 'y', 'cash']);
  assert.deepEqual(asked, ['done', 'picked', 'money', 'method']);
  assert.equal(left, null);
  const s = jobStatus(job);
  assert.deepEqual([s.done, s.picked, s.money], [true, true, 'cash']);
  assert.ok(job.booked_at, 'จ่ายสดต้องลงใบลงบัญชีวันนี้');
});

test('คุยจบแบบ: รับของแล้วแต่ยังไม่ได้รับเงิน → ลงบัญชีไว้ก่อน', () => {
  const { job, asked } = run(OLD, ['y', 'y', 'n', 'y']);
  assert.deepEqual(asked, ['done', 'picked', 'money', 'account']);
  assert.equal(jobStatus(job).money, 'account');
  assert.equal(job.balance_due, 1000, 'ลงบัญชีแต่ยังไม่ได้รับเงิน ยอดค้างต้องอยู่');
  assert.ok(job.booked_at);
});

test('ยังไม่เสร็จ ข้ามเรื่องรับของ ไปถามเรื่องเงินเลย (มัดจำได้)', () => {
  const { asked, job } = run(OLD, ['n', 'n', 'n']);
  assert.deepEqual(asked, ['done', 'money', 'account']);
  assert.equal(jobStatus(job).money, 'unpaid');
  assert.equal(job.booked_at, null);
});

test('ตอบจ่ายสด/โอนเท่านั้นในข้อช่องทาง ค่าอื่นไม่รับ', () => {
  assert.equal(applyAnswer(OLD, 'method', 'y'), null);
  assert.equal(applyAnswer(OLD, 'nope', 'y'), null);
  assert.equal(applyAnswer(OLD, 'method', 'transfer', NOW).patch.pay_method, 'transfer');
});

test('ข้อความคำถาม: บอกงาน ถามสั้น ๆ มีปุ่มตอบกับข้ามใบนี้ และ postback พกครบ', () => {
  const m = questionMessage(OLD, 'done', 3);
  assert.match(m.text, /ป้ายไวนิล · รร\.สบกอน · ฿1,000/);
  assert.match(m.text, /ทำเสร็จแล้วใช่ไหมคะ/);
  const items = m.quickReply.items;
  assert.deepEqual(items.map((i) => i.action.label), ['✓ เสร็จแล้ว', 'ยังไม่เสร็จ', 'ข้ามใบนี้']);
  const first = new URLSearchParams(items[0].action.data);
  assert.deepEqual([first.get('action'), first.get('jobId'), first.get('q'), first.get('a'), first.get('o')], ['rv', 'j1', 'done', 'y', '3']);
  // ตอบแล้วขึ้นในแชตเป็นคำพูดของร้าน ไม่ใช่ป้ายปุ่มที่มีอิโมจิ
  assert.equal(items[0].action.displayText, 'เสร็จแล้ว');
  assert.ok(items.every((i) => i.action.label.length <= 20 && i.action.data.length < 300));

  const method = questionMessage(OLD, 'method', 0);
  assert.deepEqual(method.quickReply.items.map((i) => i.action.label), ['💵 จ่ายสด', '🏦 โอน', 'ข้ามใบนี้']);
});

test('updateJob เขียน booked_at / done_at / pay_method จริง (เดิมถูกทิ้งเงียบ ๆ)', async () => {
  let written;
  const client = {
    from: () => ({
      update: (row) => {
        written = row;
        return { eq: () => ({ eq: () => ({ select: () => ({ maybeSingle: async () => ({ data: { id: 'j1', ...row }, error: null }) }) }) }) };
      },
    }),
  };
  await updateJob('u1', 'j1', { booked_at: '2026-10-05T00:00:00Z', done_at: '2026-10-04T00:00:00Z', pay_method: 'cash', bogus: 1 }, client);
  assert.equal(written.booked_at, '2026-10-05T00:00:00Z');
  assert.equal(written.done_at, '2026-10-04T00:00:00Z');
  assert.equal(written.pay_method, 'cash');
  assert.equal(written.bogus, undefined);
});

test('getUnbookedJobs: ขอเกินหนึ่งใบเพื่อรู้ว่ามีหน้าถัดไป และเรียงเก่าสุดก่อน', async () => {
  const seen = {};
  const rows = Array.from({ length: 9 }, (_, i) => ({ id: `j${i}` }));
  const q = {
    select: () => q,
    eq: () => q,
    in: () => q,
    is: (col, val) => ((seen.is = [col, val]), q),
    order: (col, o) => ((seen.order = [col, o.ascending]), q),
    range: async (a, b) => ((seen.range = [a, b]), { data: rows, error: null }),
  };
  const out = await getUnbookedJobs('u1', { offset: 0, limit: 8 }, { from: () => q });
  assert.equal(out.jobs.length, 8);
  assert.equal(out.hasMore, true);
  assert.deepEqual(seen.is, ['booked_at', null]);
  assert.deepEqual(seen.order, ['created_at', true]);
  assert.deepEqual(seen.range, [0, 8]);

  const broken = { from: () => ({ select: () => ({ eq: () => ({ in: () => ({ is: () => ({ order: () => ({ range: async () => ({ data: null, error: { message: 'column jobs.booked_at does not exist' } }) }) }) }) }) }) }) };
  assert.equal(await getUnbookedJobs('u1', {}, broken), null);
});

test('คำสั่งพิมพ์ + missingColumn ใช้ร่วมกันได้', () => {
  for (const t of ['ตรวจงานเก่า', 'งานเก่า', 'แก้สถานะ']) assert.equal(resolveMenuCommand(t), 'review_jobs', t);
  assert.equal(missingColumn({ code: '42703', message: 'column booked_at does not exist' }, 'booked_at'), true);
});
