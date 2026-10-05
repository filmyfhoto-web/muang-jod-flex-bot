import { round2 } from './currency.js';
import { jobOwed } from './customerBook.js';
import { groupByBranch } from './branch.js';
import { todayISO } from './dates.js';

/* ตัวเลขของแต่ละร้าน — "ดูยอดเงินแยกแต่ละร้าน ดูยอดรวมของทั้ง 2 ร้าน"
 *
 * ทุกยอดคิดจากกองงานเดียวกันด้วยกติกาเดียวกัน แล้วค่อยแยกกอง — ยอดรวมของสอง
 * ร้านบวกกับยอดงานที่ยังไม่ระบุร้าน ต้องเท่ากับยอดของกองทั้งหมดเป๊ะ ๆ เสมอ
 * ไม่อย่างนั้นเงินจะ "หาย" ระหว่างหน้าสรุปสองหน้าโดยไม่มีใครอธิบายได้
 */

export function moneyOf(jobs = [], today = todayISO()) {
  let total = 0;
  let owed = 0;
  let todayCount = 0;
  let todayTotal = 0;
  let openCount = 0;

  for (const job of jobs) {
    if (job?.status === 'cancelled') continue;
    const amount = Number(job?.total) || 0;
    const due = jobOwed(job);
    total = round2(total + amount);
    owed = round2(owed + due);
    if (due > 0) openCount += 1;
    if (job?.job_date === today) {
      todayCount += 1;
      todayTotal = round2(todayTotal + amount);
    }
  }

  return { count: jobs.length, total, owed, openCount, todayCount, todayTotal };
}

// สรุปทั้งสองร้าน + กองที่ยังไม่ระบุร้าน + ยอดรวม
export function summarizeBranches(jobs = [], branches = [], today = todayISO()) {
  const { groups, unassigned } = groupByBranch(jobs, branches);
  return {
    date: today,
    shops: groups.map(({ branch, jobs: rows }) => ({ branch, ...moneyOf(rows, today) })),
    unassigned: moneyOf(unassigned, today),
    combined: moneyOf(jobs, today),
  };
}

/* เรียงว่างานไหนควรทำก่อน — "ช่วยเรียงลำดับว่างานไหนควรทำก่อนจากเวลานัดรับ
 * และความด่วน"
 *
 * กติกา: งานที่เลยนัดมาก่อนเสมอ (ด่วนที่สุดเพราะช้าไปแล้ว) ตามด้วยนัดใกล้สุด
 * งานไม่มีนัดอยู่ท้าย เรียงตามวันที่จด — เก่าก่อน เพราะรอมานานกว่า
 */
export function urgencyOrder(jobs = [], today = todayISO()) {
  const open = jobs.filter((j) => j?.status === 'active');
  return [...open].sort((a, b) => {
    const da = a.due_date || '';
    const db = b.due_date || '';
    if (da && db && da !== db) return da < db ? -1 : 1;
    if (da && !db) return -1;
    if (!da && db) return 1;
    const ja = a.job_date || '';
    const jb = b.job_date || '';
    if (ja !== jb) return ja < jb ? -1 : 1;
    return String(a.created_at || '').localeCompare(String(b.created_at || ''));
  });
}

// รายละเอียดของร้านเดียว: ตัวเลข งานวันนี้ งานด่วน และงานค้างเงิน
export function branchDetail(jobs = [], branch, today = todayISO()) {
  const mine = jobs.filter((j) => String(j?.branch_id ?? '') === String(branch?.id ?? ''));
  const money = moneyOf(mine, today);
  const todayJobs = mine.filter((j) => j?.job_date === today && j?.status !== 'cancelled');
  const queue = urgencyOrder(mine, today);
  const owedJobs = mine.filter((j) => jobOwed(j) > 0);
  return { money, todayJobs, queue, owedJobs };
}
