import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reviewJobsFlex, statusLine } from '../src/flex/reviewJobsFlex.js';
import { updateJob, getUnbookedJobs } from '../src/services/jobService.js';
import { stagePatch, pickupPatch, jobStage } from '../src/utils/jobState.js';
import { resolveMenuCommand } from '../src/utils/menuCommands.js';
import { missingColumn } from '../src/utils/dbErrors.js';

/* ร้านขอ "แก้ไขงานเก่าว่าอันไหนลงบัญชี ยังไม่จ่าย ไม่อยากหลายขั้นตอน"
 * — การ์ดใบละสามปุ่ม กดทีเดียวจบ
 */

const OLD = { id: 'j1', job_name: 'ป้ายไวนิล', customer_name: 'รร.สบกอน', job_date: '2026-09-01', total: 1000, paid_amount: 0, balance_due: 1000, payment_status: 'pending' };

test('สถานะบนการ์ด: ยังไม่จ่าย / จ่ายแล้ว / ลงบัญชีแล้ว', () => {
  assert.match(statusLine(OLD).text, /ยังไม่จ่าย ฿1,000/);
  const paid = { ...OLD, ...stagePatch(OLD, 3) };
  assert.match(statusLine(paid).text, /จ่ายแล้ว/);
  const booked = { ...OLD, ...stagePatch(OLD, 4) };
  assert.match(statusLine(booked).text, /ลงบัญชีแล้ว/);
});

test('การ์ดทบทวน: ใบละสามปุ่ม และปุ่มดูต่อเมื่อมีหน้าถัดไป', () => {
  const flex = reviewJobsFlex({ jobs: [OLD], hasMore: true, offset: 8 });
  const [card, more] = flex.contents.contents;
  const buttons = card.footer.contents.map((b) => b.action.data);
  assert.deepEqual(buttons.map((d) => new URLSearchParams(d).get('to')), ['paid', 'owed', 'booked']);
  assert.ok(buttons.every((d) => d.includes('action=job_mark') && d.includes('jobId=j1') && d.includes('o=8')));
  assert.equal(more.body.contents[1].action.data, 'action=review_jobs&offset=9');

  const last = reviewJobsFlex({ jobs: [OLD], hasMore: false });
  assert.equal(last.contents.contents.length, 1);
  for (const b of card.footer.contents) assert.ok(b.action.data.length < 300);
});

test('ปุ่มแต่ละปุ่มเขียนช่องที่ถูก: จ่ายแล้ว=ได้เงิน, ยังไม่จ่าย=รับของแล้วค้าง, ลงบัญชี=ครบสี่ขั้น', () => {
  const paid = { ...OLD, ...stagePatch(OLD, 3) };
  assert.equal(jobStage(paid), 3);
  assert.equal(paid.balance_due, 0);

  const owed = { ...OLD, ...pickupPatch(OLD, 'owed') };
  assert.ok(owed.picked_up_at);
  assert.equal(owed.balance_due, 1000);

  const booked = { ...OLD, ...stagePatch(OLD, 4) };
  assert.equal(jobStage(booked), 4);
  assert.ok(booked.booked_at);
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
