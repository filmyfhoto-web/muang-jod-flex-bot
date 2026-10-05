import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createMockSupabase } from './helpers/mockSupabase.js';
import { DEFAULT_BRANCHES, matchBranchStrict, stripBranch, parseBranchView } from '../src/utils/branch.js';
import { summarizeBranches, branchDetail, urgencyOrder, moneyOf } from '../src/utils/branchSummary.js';
import { branchOverviewFlex, branchDetailFlex } from '../src/flex/branchFlex.js';
import { listBranches } from '../src/services/branchService.js';
import { createJob } from '../src/services/jobService.js';
import { getDashboard } from '../src/services/dashboardService.js';
import { dashboardFlex } from '../src/flex/dashboardFlex.js';
import { round2 } from '../src/utils/currency.js';

const BRANCHES = DEFAULT_BRANCHES.map((b, i) => ({ ...b, id: `b${i + 1}` }));
const [PRINT, KLANG] = BRANCHES;

/* ร้านสั่งว่า "ห้ามนำงานมาปนกัน" — ด่านแรกของกติกานั้นคือห้ามจับชื่อร้าน
 * จากคำหลวม ๆ ในใบงาน
 */
test('ข้อความจดงานที่มีคำว่า "ปริ้นงาน" เป็นเนื้องาน ไม่ถูกตีเป็นร้าน', () => {
  // งานปริ้นเอกสารจริง ๆ ของลูกค้า — ถ้าจับเป็นร้าน ชื่องานจะถูกตัดหาย
  for (const text of [
    'ปริ้นงานเอกสาร 100 แผ่น 150 บาท',
    'ปริ้นสี A4 20 แผ่น 60 บาท',
    'ป้ายไวนิล โรงเรียนเชียงกลาง 1.2x2.4 900 บาท', // ลูกค้าชื่อตามอำเภอ
  ]) {
    assert.equal(matchBranchStrict(text, BRANCHES), null, text);
  }
});

test('บอกร้านแบบตั้งใจ จับได้และตัดชื่อร้านออกจากใบงาน', () => {
  const cases = [
    ['นัฐภรณ์ ปริ้นงาน ป้ายไวนิล 60x100 150 บาท', 'print', 'ป้ายไวนิล 60x100 150 บาท'],
    ['ลงร้านเชียงกลาง ตรายาง 2 อัน 300 บาท', 'chiangklang', 'ตรายาง 2 อัน 300 บาท'],
    ['ร้านปริ้น สติ๊กเกอร์ 50 ดวง 250', 'print', 'สติ๊กเกอร์ 50 ดวง 250'],
  ];
  for (const [text, slug, rest] of cases) {
    const hit = matchBranchStrict(text, BRANCHES);
    assert.equal(hit?.slug, slug, text);
    assert.equal(stripBranch(text, hit, BRANCHES), rest, text);
  }
});

test('"ดูงาน<ร้าน>" เป็นคำสั่งดู ไม่ใช่งาน และประโยคมีตัวเลขไม่มีทางเป็นคำสั่งดู', () => {
  assert.equal(parseBranchView('ดูงานนัฐภรณ์ ปริ้นงาน', BRANCHES)?.branch?.slug, 'print');
  assert.equal(parseBranchView('ดูงานนัฐภรณ์ เชียงกลาง', BRANCHES)?.branch?.slug, 'chiangklang');
  assert.equal(parseBranchView('ยอดเชียงกลาง', BRANCHES)?.branch?.slug, 'chiangklang');
  // กำกวม → สรุปให้ทั้งคู่ ไม่เดา
  assert.deepEqual(parseBranchView('ดูงานนัฐภรณ์', BRANCHES), { all: true });
  assert.deepEqual(parseBranchView('ดูงานทั้งสองร้าน', BRANCHES), { all: true });
  // มีตัวเลข = ใบงาน ไม่ใช่คำสั่งดู
  assert.equal(parseBranchView('ปริ้นงานเอกสาร 100 แผ่น 150 บาท', BRANCHES), null);
  // ไม่พูดถึงร้านเลย ก็ไม่เกี่ยวกับการ์ดร้าน
  assert.equal(parseBranchView('ดูงานค้าง', BRANCHES), null);
});

/* เงินห้ามหายระหว่างหน้าสรุป: สองร้านบวกกองยังไม่ระบุ ต้องเท่ายอดรวมเป๊ะ */
test('ยอดสองร้าน + ยังไม่ระบุร้าน = ยอดรวม เสมอ', () => {
  const today = '2026-10-05';
  const jobs = [
    { id: 1, branch_id: 'b1', total: 150.25, paid_amount: 0, status: 'active', job_date: today },
    { id: 2, branch_id: 'b1', total: 900, paid_amount: 900, status: 'completed', job_date: '2026-10-01' },
    { id: 3, branch_id: 'b2', total: 2448, paid_amount: 1000, status: 'active', job_date: today },
    { id: 4, branch_id: null, total: 60.75, paid_amount: 0, status: 'active', job_date: today },
    // งานที่ยกเลิกไม่เข้าเงินที่ไหนเลย
    { id: 5, branch_id: 'b2', total: 999, paid_amount: 0, status: 'cancelled', job_date: today },
  ];
  const sum = summarizeBranches(jobs, BRANCHES, today);

  const together = round2(sum.shops[0].total + sum.shops[1].total + sum.unassigned.total);
  assert.equal(together, sum.combined.total);
  const owedTogether = round2(sum.shops[0].owed + sum.shops[1].owed + sum.unassigned.owed);
  assert.equal(owedTogether, sum.combined.owed);

  assert.equal(sum.shops[0].branch.slug, 'print');
  assert.equal(sum.shops[0].total, round2(150.25 + 900));
  assert.equal(sum.shops[0].owed, 150.25);
  assert.equal(sum.shops[1].owed, 1448);
  assert.equal(sum.unassigned.todayCount, 1);
  assert.equal(sum.combined.todayTotal, round2(150.25 + 2448 + 60.75));
});

test('ยกเลิกแล้วไม่นับเงิน และ moneyOf ไม่พังกับกองว่าง', () => {
  assert.equal(moneyOf([{ total: 100, status: 'cancelled' }]).total, 0);
  assert.deepEqual(moneyOf([]).total, 0);
});

/* "ช่วยเรียงลำดับว่างานไหนควรทำก่อนจากเวลานัดรับและความด่วน" */
test('คิวงาน: เลยนัดก่อน แล้วนัดใกล้ แล้วงานไม่มีนัดตามวันที่จด', () => {
  const jobs = [
    { id: 'no-due', status: 'active', job_date: '2026-10-01' },
    { id: 'due-far', status: 'active', due_date: '2026-10-20', job_date: '2026-10-03' },
    { id: 'overdue', status: 'active', due_date: '2026-10-02', job_date: '2026-10-01' },
    { id: 'done', status: 'completed', due_date: '2026-10-01' },
    { id: 'no-due-old', status: 'active', job_date: '2026-09-20' },
  ];
  assert.deepEqual(urgencyOrder(jobs, '2026-10-05').map((j) => j.id), [
    'overdue',
    'due-far',
    'no-due-old',
    'no-due',
  ]);
});

test('การ์ดรวม: มีชื่อทั้งสองร้าน ยอดรวม และปุ่มเจาะดูรายร้าน', () => {
  const today = '2026-10-05';
  const sum = summarizeBranches(
    [
      { id: 1, branch_id: 'b1', total: 150, paid_amount: 0, status: 'active', job_date: today },
      { id: 2, branch_id: null, total: 60, paid_amount: 0, status: 'active', job_date: today },
    ],
    BRANCHES,
    today,
  );
  const json = JSON.stringify(branchOverviewFlex(sum));
  assert.ok(json.includes('นัฐภรณ์ ปริ้นงาน'));
  assert.ok(json.includes('นัฐภรณ์ เชียงกลาง'));
  assert.ok(json.includes('ยังไม่ระบุร้าน'), 'งานที่ยังไม่ระบุร้านต้องไม่ถูกซ่อน');
  assert.ok(json.includes('action=branch_view&branch=print'));
  assert.ok(json.includes('action=branch_view&branch=chiangklang'));
});

test('การ์ดรายร้าน: งานวันนี้ คิวที่ควรทำก่อน และค้างเก็บของร้านนั้นเท่านั้น', () => {
  const today = '2026-10-05';
  const jobs = [
    { id: 1, branch_id: 'b1', job_name: 'ป้ายไวนิล', total: 150, paid_amount: 0, status: 'active', job_date: today },
    { id: 2, branch_id: 'b1', job_name: 'ตรายางด่วน', total: 300, paid_amount: 0, status: 'active', job_date: '2026-10-01', due_date: '2026-10-04' },
    { id: 3, branch_id: 'b2', job_name: 'งานของอีกร้าน', total: 999, paid_amount: 0, status: 'active', job_date: today },
  ];
  const detail = branchDetail(jobs, PRINT, today);
  assert.equal(detail.money.count, 2);

  const json = JSON.stringify(branchDetailFlex(PRINT, detail, { other: KLANG }));
  assert.ok(json.includes('ป้ายไวนิล'));
  assert.ok(json.includes('ตรายางด่วน'));
  assert.ok(!json.includes('งานของอีกร้าน'), 'งานของอีกร้านโผล่ในการ์ด = งานปนกัน');
  assert.ok(json.includes('action=branch_view&branch=chiangklang'), 'ไม่มีทางสลับไปดูอีกร้าน');
});

test('สรุปงานวันนี้พกยอดแยกร้านไปด้วย และการ์ดวาดช่วง "แยกตามร้าน"', async () => {
  const today = new Date().toISOString().slice(0, 10);
  const db = createMockSupabase();
  const branches = await listBranches('user-1', db);
  await db.from('jobs').insert({
    user_id: 'user-1', branch_id: branches[0].id, total: 150, paid_amount: 0,
    status: 'active', payment_status: 'pending', job_date: today, job_name: 'ป้าย',
  });

  const dash = await getDashboard('user-1', {}, db);
  assert.equal(dash.shops.shops.length, 2);
  assert.equal(dash.shops.shops[0].todayCount, 1);

  const json = JSON.stringify(dashboardFlex(dash, { liffUrl: null, mascotImageUrl: null }));
  assert.ok(json.includes('แยกตามร้าน'));
  assert.ok(json.includes('นัฐภรณ์ ปริ้นงาน'));
});

test('createJob แสตมป์ร้านให้งาน และไม่พังเมื่อไม่ได้ส่งร้านมา', async () => {
  const db = createMockSupabase();
  const [print] = await listBranches('user-1', db);

  const withBranch = await createJob('user-1', {
    jobName: 'ป้าย', total: 100, items: [{ item_name: 'ป้าย', total: 100 }], branchId: print.id,
  }, db);
  assert.equal(withBranch.branch_id, print.id);

  const without = await createJob('user-1', {
    jobName: 'ป้าย2', total: 50, items: [{ item_name: 'ป้าย2', total: 50 }],
  }, db);
  assert.ok(!without.branch_id);
});

/* กติกาของบทสนทนา เช็คจากซอร์สแบบเดียวกับเทสต์ handler ตัวอื่นในโปรเจกต์ */
test('ไม่บอกร้าน → ถามตอนกดบันทึก ด้วยประโยคที่เจ้าของสั่งไว้คำต่อคำ', () => {
  const action = readFileSync(new URL('../src/actions/addJob.js', import.meta.url), 'utf8');
  assert.ok(action.includes('งานนี้ลงร้านไหนดีคะ? 💜'), 'ประโยคต้องตรงตามที่เจ้าของสั่ง');
  assert.match(action, /action=pick_branch&branch=/);
  // มีร้านเดียวไม่ต้องถาม และรายชื่อร้านพังต้องไม่พาการบันทึกล่ม
  assert.match(action, /branches\.length === 1 \? branches\[0\] : null/);
  assert.match(action, /listBranchesSafe/);
  // บันทึกแล้วบอกว่าเข้าร้านไหน
  assert.ok(action.includes('ลงบัญชีร้าน'));

  const handler = readFileSync(new URL('../src/handlers/messageHandler.js', import.meta.url), 'utf8');
  // จับร้านจากข้อความแบบเข้มเท่านั้น และตัดชื่อร้านก่อนอ่านงาน
  assert.match(handler, /matchBranchStrict\(text, DEFAULT_BRANCHES\)/);
  assert.match(handler, /stripBranch\(text, branch, DEFAULT_BRANCHES\)/);
  assert.match(handler, /branchSlug: branch\.slug/);

  const postback = readFileSync(new URL('../src/handlers/postbackHandler.js', import.meta.url), 'utf8');
  assert.match(postback, /case 'pick_branch':/);
  assert.match(postback, /case 'branch_view':/);
});

test('"วันนี้มีงานอะไรบ้าง" ไปที่สรุปสองร้าน ไม่ใช่คำทักทาย', async () => {
  const { TODAY_QUESTION } = await import('../src/utils/branch.js');
  for (const t of ['วันนี้มีงานอะไรบ้าง', 'มีงานอะไรบ้าง', 'วันนี้มีงานไหม']) {
    assert.ok(TODAY_QUESTION.test(t), t);
  }
  // กำลังจดงาน ไม่ใช่คำถาม
  const handler = readFileSync(new URL('../src/handlers/messageHandler.js', import.meta.url), 'utf8');
  assert.match(handler, /TODAY_QUESTION\.test\(text\) && !HAS_NUMBER\.test\(text\)/);
  assert.match(handler, /return branchView\(\{ replyToken, profile \}, null\);/);
});
