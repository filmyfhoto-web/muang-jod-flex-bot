import { reply } from '../services/lineService.js';
import { searchJobs, getJobById, updateJob } from '../services/jobService.js';
import { statusPatch, jobStatus } from '../utils/jobState.js';
import { formatBaht } from '../utils/currency.js';

/* ทำตามประโยค "งานครูแอนเสร็จแล้ว"
 *
 *   เจอใบเดียว  → ทำเลย ตอบสั้น ๆ ว่าใบไหนถูกเปลี่ยน
 *   เจอหลายใบ  → ปุ่มให้เลือกใบ (ไม่เดา) แล้วค่อยเปลี่ยน
 *   "จ่ายแล้ว"  → ได้เงินจริง แต่สด/โอนต้องถามต่อหนึ่งปุ่ม
 *
 * การเปลี่ยนจริงใช้ statusPatch ตัวเดียวกับปุ่มบนแผงสถานะทุกที่ — กติกาเงิน
 * อยู่ที่เดียว ประโยคพูดเป็นแค่ทางเข้าอีกทาง
 */

const CHANGE_CODE = { done: 'd', picked: 'p' };
const CODE_CHANGE = {
  d: { done: true },
  p: { picked: true },
  cash: { money: 'cash' },
  transfer: { money: 'transfer' },
  account: { money: 'account' },
};
const CODE_LABEL = {
  d: '✓ ทำเสร็จแล้ว',
  p: '📦 ลูกค้ารับของแล้ว',
  cash: '💵 รับเงินสดแล้ว',
  transfer: '🏦 รับเงินโอนแล้ว',
  account: '📒 ลงบัญชีไว้แล้ว (ยังไม่ได้รับเงิน)',
};

export function changeCode(parsed) {
  if (parsed.ask === 'method') return 'ask';
  if (parsed.change?.done) return 'd';
  if (parsed.change?.picked) return 'p';
  return parsed.change?.money || null;
}

const jobLine = (j) =>
  [j.customer_name, j.job_name].filter(Boolean).join(' · ') + ` ${formatBaht(j.total)}` + (j.job_number ? ` (${j.job_number})` : '');

function methodButtons(jobId) {
  return [
    { type: 'action', action: { type: 'postback', label: '💵 จ่ายสด', data: `action=sbn&id=${jobId}&c=cash`, displayText: 'จ่ายสด' } },
    { type: 'action', action: { type: 'postback', label: '🏦 โอน', data: `action=sbn&id=${jobId}&c=transfer`, displayText: 'โอน' } },
    { type: 'action', action: { type: 'postback', label: '📒 ลงบัญชีไว้ก่อน', data: `action=sbn&id=${jobId}&c=account`, displayText: 'ลงบัญชี' } },
  ];
}

async function applyTo(replyToken, profile, job, code, deps) {
  const change = CODE_CHANGE[code];
  const patch = statusPatch(job, change);
  if (!patch) return reply(replyToken, { type: 'text', text: 'สถานะนี้ใช้กับงานนี้ไม่ได้ค่ะ' });
  const save = deps.updateJob || updateJob;
  const updated = await save(profile.id, job.id, patch);
  if (!updated) return reply(replyToken, { type: 'text', text: 'ไม่พบงานนี้แล้วค่ะ' });

  const after = { ...job, ...updated };
  const s = jobStatus(after);
  const left = [
    s.done ? null : 'ยังไม่เสร็จ',
    s.picked ? null : 'ยังไม่ได้รับของ',
    ['cash', 'transfer', 'paid'].includes(s.money) ? null : s.money === 'account' ? 'รอเก็บเงิน (ลงบัญชีไว้)' : 'ยังไม่ได้รับเงิน',
  ].filter(Boolean);
  return reply(replyToken, {
    type: 'text',
    text:
      `${CODE_LABEL[code]} — ${jobLine(after)}\n` +
      (left.length ? `เหลือ: ${left.join(' · ')}` : 'งานนี้จบครบทุกอย่างแล้วค่ะ 🎉'),
  });
}

// จากประโยคในแชต
export async function statusBySpeech({ replyToken, profile }, parsed, deps = {}) {
  const find = deps.searchJobs || searchJobs;
  let jobs = [];
  try {
    jobs = (await find(profile.id, parsed.name, { limit: 5 })).filter((j) => j.status !== 'cancelled');
  } catch {
    jobs = [];
  }

  if (!jobs.length) {
    return reply(replyToken, { type: 'text', text: `หางานของ "${parsed.name}" ไม่เจอค่ะ ลองพิมพ์ "ค้นหางาน" ดูนะคะ 💜` });
  }

  const code = changeCode(parsed);

  if (jobs.length === 1) {
    const job = jobs[0];
    if (code === 'ask') {
      return reply(replyToken, {
        type: 'text',
        text: `${parsed.label} — ${jobLine(job)}\nรับมาเป็นแบบไหนคะ?`,
        quickReply: { items: methodButtons(job.id) },
      });
    }
    return applyTo(replyToken, profile, job, code, deps);
  }

  // หลายใบ — ให้เลือกก่อน (ปุ่มพกการเปลี่ยนแปลงไปด้วย กดทีเดียวจบ)
  const c = code === 'ask' ? 'ask' : code;
  return reply(replyToken, {
    type: 'text',
    text:
      `เจองานของ "${parsed.name}" ${jobs.length} ใบค่ะ ${parsed.label} ใบไหนคะ?\n` +
      jobs.map((j, i) => `${i + 1}. ${jobLine(j)}`).join('\n'),
    quickReply: {
      items: jobs.slice(0, 13).map((j, i) => ({
        type: 'action',
        action: {
          type: 'postback',
          label: `${i + 1}. ${j.customer_name || j.job_name || 'งาน'}`.slice(0, 20),
          data: `action=sbn&id=${j.id}&c=${c}`,
          displayText: `ใบที่ ${i + 1}`,
        },
      })),
    },
  });
}

// action=sbn&id=…&c=… — จากปุ่มเลือกใบ/เลือกช่องทาง
export async function statusByNamePick({ replyToken, profile, params }, deps = {}) {
  const job = await (deps.getJobById || getJobById)(profile.id, params.id);
  if (!job) return reply(replyToken, { type: 'text', text: 'ไม่พบงานนี้แล้วค่ะ' });
  if (params.c === 'ask') {
    return reply(replyToken, {
      type: 'text',
      text: `ได้รับเงินแล้ว — ${jobLine(job)}\nรับมาเป็นแบบไหนคะ?`,
      quickReply: { items: methodButtons(job.id) },
    });
  }
  if (!CODE_CHANGE[params.c]) return reply(replyToken, { type: 'text', text: 'ปุ่มนี้หมดอายุแล้วค่ะ' });
  return applyTo(replyToken, profile, job, params.c, deps);
}
