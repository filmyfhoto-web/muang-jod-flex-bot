import { reply } from '../services/lineService.js';
import { getBookJobs } from '../services/jobService.js';
import { moneyKind, MONEY_KINDS } from '../utils/jobState.js';
import { jobOwed } from '../utils/customerBook.js';
import { formatBaht } from '../utils/currency.js';
import { liffUrl } from '../utils/liff.js';

/* ดูงานแยกตามเงิน — เงินสด / โอน / ลงบัญชี / ยังไม่ได้รับ
 *
 * ร้านขอ "แยกเงินสดกับลงบัญชีไว้เช็คงานอีกที" — พิมพ์ "งานเงินสด" หรือ "งานลงบัญชี"
 * แล้วม่วงสรุปให้ทีละกอง มีปุ่มสลับไปกองอื่น และปุ่มตรวจทีละใบ
 */

export const MONEY_LABEL = {
  cash: '💵 เงินสด',
  transfer: '🏦 โอน',
  account: '📒 ลงบัญชี (ค้างจ่าย)',
  unpaid: '⏳ ยังไม่ได้รับเงิน',
  paid: '❓ รับแล้ว ไม่ระบุช่องทาง',
};

const HINT = {
  cash: 'รับเป็นเงินสดแล้ว',
  transfer: 'รับเป็นเงินโอนแล้ว',
  account: 'ลงบัญชีไว้แล้ว ยังไม่ได้รับเงิน รอวางบิล / เก็บเงิน',
  unpaid: 'ยังไม่ได้รับเงินและยังไม่ได้ลงบัญชี',
  paid: 'รับเงินแล้วแต่ยังไม่ได้บอกว่าสดหรือโอน',
};

const SHOW = 10;

export function groupByMoney(jobs = []) {
  const groups = Object.fromEntries(MONEY_KINDS.map((k) => [k, []]));
  for (const job of jobs) {
    if (!job || job.status === 'cancelled') continue;
    groups[moneyKind(job)].push(job);
  }
  return groups;
}

// ข้อความสรุปกองหนึ่ง: หัว + ตัวเลขรวม + รายการล่าสุด
export function moneyListText(kind, jobs = []) {
  const total = jobs.reduce((t, j) => t + (Number(j.total) || 0), 0);
  const owed = jobs.reduce((t, j) => t + jobOwed(j), 0);
  const head = `${MONEY_LABEL[kind]} — ${jobs.length} งาน · รวม ${formatBaht(total)}` + (owed > 0.009 ? ` · ค้าง ${formatBaht(owed)}` : '');
  if (!jobs.length) return `${MONEY_LABEL[kind]}\nไม่มีงานในกองนี้ค่ะ 💜`;

  const lines = jobs.slice(0, SHOW).map((j, i) => {
    const who = j.customer_name || 'ไม่ได้ใส่ชื่อ';
    const what = j.job_name ? ` · ${j.job_name}` : '';
    return `${i + 1}. ${who}${what} ${formatBaht(kind === 'account' || kind === 'unpaid' ? jobOwed(j) || j.total : j.total)}`;
  });
  const more = jobs.length > SHOW ? `\n… และอีก ${jobs.length - SHOW} งาน (ดูทั้งหมดในเว็บ)` : '';
  return `${head}\n${HINT[kind]}\n\n${lines.join('\n')}${more}`;
}

const chip = (label, data, shown) => ({
  type: 'action',
  action: { type: 'postback', label: label.slice(0, 20), data, displayText: shown || label },
});

export function moneyListMessage(kind, groups) {
  const items = [];
  const url = liffUrl({ tab: 'today', money: kind });
  if (url) items.push({ type: 'action', action: { type: 'uri', label: '📊 ดูในเว็บ', uri: url } });
  if (kind === 'unpaid' || kind === 'paid') items.push(chip('✅ ตรวจทีละใบ', 'action=review_jobs', 'ตรวจงานเก่า'));
  for (const k of MONEY_KINDS) {
    if (k === kind || (k === 'paid' && !groups[k].length)) continue;
    const n = groups[k].length;
    items.push(chip(`${MONEY_LABEL[k].split(' ')[0]} ${MONEY_LABEL[k].split(' ')[1].replace(/\(.*$/, '')} ${n}`.trim(), `action=money_list&k=${k}`, MONEY_LABEL[k]));
  }
  return {
    type: 'text',
    text: moneyListText(kind, groups[kind]),
    quickReply: { items: items.slice(0, 13) },
  };
}

// action=money_list&k=cash|transfer|account|unpaid|paid
export async function moneyList({ replyToken, profile, params }) {
  const kind = MONEY_KINDS.includes(params?.k) ? params.k : 'account';
  const jobs = await getBookJobs(profile.id, 400);
  return reply(replyToken, moneyListMessage(kind, groupByMoney(jobs)));
}
