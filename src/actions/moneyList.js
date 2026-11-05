import { reply } from '../services/lineService.js';
import { getBookJobs } from '../services/jobService.js';
import { moneyKind, MONEY_KINDS } from '../utils/jobState.js';
import { jobOwed } from '../utils/customerBook.js';
import { buildLedger } from '../utils/ledger.js';
import { todayISO } from '../utils/dates.js';
import { formatBaht } from '../utils/currency.js';
import { liffUrl } from '../utils/liff.js';
import { COLORS, themed } from '../flex/theme.js';

/* ดูงานแยกตามเงิน — เงินสด / โอน / ลงบัญชี / ยังไม่ได้รับ
 *
 * ร้านขอ "แยกเงินสดกับลงบัญชีไว้เช็คงานอีกที" — พิมพ์ "งานเงินสด" หรือ "งานลงบัญชี"
 * แล้วม่วงสรุปให้ทีละกอง มีปุ่มสลับไปกองอื่น และปุ่มตรวจทีละใบ
 *
 * กองลงบัญชีพิเศษกว่ากองอื่น: มันคือเงินที่ต้องตามเก็บ แต่ละแถวจึงมีปุ่ม
 * 💵 สด / 🏦 โอน ให้จบในแตะเดียว — ปุ่มคือ action=sbn ตัวเดียวกับประโยค
 * "‹ชื่อ›เก็บเงินแล้ว" กติกาเงินอยู่ที่ statusPatch ที่เดียวเหมือนเดิม
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

/* กองลงบัญชีเป็นการ์ด — แถวละงาน พร้อมปุ่มเก็บเงินในตัว
 *
 * แตะ 💵/🏦 คือบอกช่องทางมาพร้อมกัน ไม่มีการเดา (V2 §4) และ statusPatch
 * ประทับวันเก็บจริงให้ — เงินก้อนนี้ไปขึ้น "เงินวันนี้" ของวันนี้ทันที
 */
const ACCOUNT_ROWS = 5;

function collectRow(job) {
  const who = job.customer_name || 'ไม่ได้ใส่ชื่อ';
  const what = job.job_name ? ` — ${job.job_name}` : '';
  const chip = (code, label, spoken) => ({
    type: 'button',
    style: 'secondary',
    height: 'sm',
    flex: 2,
    action: {
      type: 'postback',
      label,
      data: `action=sbn&id=${job.id}&c=${code}`,
      displayText: `${spoken} — ${who}`,
    },
  });
  return {
    type: 'box',
    layout: 'vertical',
    spacing: 'xs',
    margin: 'md',
    contents: [
      { type: 'text', text: `${who}${what}`, size: 'sm', color: COLORS.ink, wrap: true },
      {
        type: 'box',
        layout: 'horizontal',
        spacing: 'sm',
        alignItems: 'center',
        contents: [
          { type: 'text', text: formatBaht(jobOwed(job) || job.total), size: 'sm', weight: 'bold', color: COLORS.red, flex: 3 },
          chip('cash', '💵 สด', 'เก็บเงินสดแล้ว'),
          chip('transfer', '🏦 โอน', 'รับโอนแล้ว'),
        ],
      },
    ],
  };
}

export function accountListFlex(jobs = [], collected = null) {
  const sorted = [...jobs].sort((a, b) => (jobOwed(b) || 0) - (jobOwed(a) || 0));
  const owedSum = sorted.reduce((t, j) => t + jobOwed(j), 0);

  const body = [
    { type: 'text', text: '📒 ลงบัญชีไว้ (รอเก็บ)', weight: 'bold', size: 'md', color: COLORS.title },
    { type: 'text', text: `${sorted.length} งาน · ค้างรวม ${formatBaht(owedSum)}`, size: 'xs', color: COLORS.sub },
    { type: 'text', text: 'เก็บเงินได้แล้วแตะ 💵 หรือ 🏦 ที่งานนั้นได้เลยค่ะ', size: 'xxs', color: COLORS.grey, wrap: true },
    { type: 'separator', margin: 'md', color: COLORS.line },
    ...sorted.slice(0, ACCOUNT_ROWS).map(collectRow),
  ];

  if (sorted.length > ACCOUNT_ROWS) {
    body.push({
      type: 'text',
      text: `… และอีก ${sorted.length - ACCOUNT_ROWS} งาน (ดูทั้งหมดในเว็บ)`,
      size: 'xs',
      color: COLORS.grey,
      margin: 'md',
      wrap: true,
    });
  }
  if (collected?.jobCount) {
    body.push({ type: 'separator', margin: 'md', color: COLORS.line });
    body.push({
      type: 'text',
      text: `✓ เก็บจากบัญชีได้วันนี้ ${collected.jobCount} งาน ${formatBaht(collected.total)}`,
      size: 'xs',
      color: COLORS.green,
      margin: 'md',
      wrap: true,
    });
  }

  return themed({
    type: 'bubble',
    size: 'mega',
    body: { type: 'box', layout: 'vertical', spacing: 'xs', paddingAll: 'lg', contents: body },
  });
}

const chip = (label, data, shown) => ({
  type: 'action',
  action: { type: 'postback', label: label.slice(0, 20), data, displayText: shown || label },
});

export function moneyListMessage(kind, groups, extra = {}) {
  const items = [];
  const url = liffUrl({ tab: 'today', money: kind });
  if (url) items.push({ type: 'action', action: { type: 'uri', label: '📊 ดูในเว็บ', uri: url } });
  if (kind === 'unpaid' || kind === 'paid') items.push(chip('✅ ตรวจทีละใบ', 'action=review_jobs', 'ตรวจงานเก่า'));
  for (const k of MONEY_KINDS) {
    if (k === kind || (k === 'paid' && !groups[k].length)) continue;
    const n = groups[k].length;
    items.push(chip(`${MONEY_LABEL[k].split(' ')[0]} ${MONEY_LABEL[k].split(' ')[1].replace(/\(.*$/, '')} ${n}`.trim(), `action=money_list&k=${k}`, MONEY_LABEL[k]));
  }
  const quickReply = { items: items.slice(0, 13) };

  if (kind === 'account' && groups.account.length) {
    const owedSum = groups.account.reduce((t, j) => t + jobOwed(j), 0);
    return {
      type: 'flex',
      altText: `📒 ลงบัญชีไว้ (รอเก็บ) ${groups.account.length} งาน · ค้าง ${formatBaht(owedSum)}`,
      contents: accountListFlex(groups.account, extra.collected),
      quickReply,
    };
  }

  let text = moneyListText(kind, groups[kind]);
  // กองลงบัญชีว่าง = ตามเก็บครบ — ถ้าวันนี้เพิ่งเก็บมาได้ บอกให้ชื่นใจด้วย
  if (kind === 'account' && extra.collected?.jobCount) {
    text += `\n✓ เก็บจากบัญชีได้วันนี้ ${extra.collected.jobCount} งาน ${formatBaht(extra.collected.total)}`;
  }
  return { type: 'text', text, quickReply };
}

// action=money_list&k=cash|transfer|account|unpaid|paid
export async function moneyList({ replyToken, profile, params }) {
  const kind = MONEY_KINDS.includes(params?.k) ? params.k : 'account';
  const jobs = await getBookJobs(profile.id, 400);
  // เงินเก่าที่เพิ่งตามเก็บได้วันนี้ — สูตรเดียวกับใบลงบัญชี ไม่มีสูตรที่สอง
  const collected = kind === 'account' ? buildLedger(jobs, todayISO()).collected : null;
  return reply(replyToken, moneyListMessage(kind, groupByMoney(jobs), { collected }));
}
