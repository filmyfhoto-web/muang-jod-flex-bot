import { reply } from '../services/lineService.js';
import { getLatestJob, getJobById, updateJob } from '../services/jobService.js';
import { derivePaymentFields } from '../utils/payment.js';
import { formatBaht, round2, numText } from '../utils/currency.js';
import { jobCardMessage } from '../flex/jobCard.js';

/* "แก้ราคาเป็น 650" → การ์ดยืนยันบนใบล่าสุด → กดแล้วค่อยแก้จริง
 *
 * เรื่องเงินห้ามเดา (V2 §4): การ์ดบอกชัดว่าใบไหน จากเท่าไหร่ เป็นเท่าไหร่
 * ปุ่มยืนยันพกค่าไปเอง (ไม่เก็บสเตต) — การ์ดเก่ากดซ้ำก็แก้เป็นค่าเดิมซ้ำ
 * ซึ่งไม่ทำให้ยอดเพี้ยน
 */

const FIELD_LABEL = { total: 'ราคา', paid: 'ยอดที่รับมาแล้ว', customer: 'ชื่อลูกค้า', jobName: 'ชื่องาน' };

function oldValue(job, field) {
  if (field === 'total') return formatBaht(job.total);
  if (field === 'paid') return formatBaht(job.paid_amount || 0);
  if (field === 'customer') return job.customer_name || '(ยังไม่มี)';
  return job.job_name || '(ยังไม่มี)';
}
const newText = (field, value) => (field === 'total' || field === 'paid' ? formatBaht(value) : `"${value}"`);

// จากประโยคในแชต — ชี้ใบล่าสุดเสมอ (คือใบที่เพิ่งจดแล้วเห็นว่าผิด)
export async function quickEditAsk({ replyToken, profile }, parsed, deps = {}) {
  const job = await (deps.getLatestJob || getLatestJob)(profile.id);
  if (!job) return reply(replyToken, { type: 'text', text: 'ยังไม่มีงานให้แก้เลยค่ะ 💜' });

  const data =
    `action=qe&id=${job.id}&f=${parsed.field}&v=${encodeURIComponent(String(parsed.value).slice(0, 80))}`;
  const who = [job.customer_name, job.job_name].filter(Boolean).join(' · ') || 'งานล่าสุด';
  return reply(replyToken, {
    type: 'text',
    text:
      `แก้${FIELD_LABEL[parsed.field]}ของใบล่าสุดนะคะ\n` +
      `${who}${job.job_number ? ` (${job.job_number})` : ''}\n` +
      `${oldValue(job, parsed.field)} → ${newText(parsed.field, parsed.value)}`,
    quickReply: {
      items: [
        { type: 'action', action: { type: 'postback', label: '✅ ยืนยันแก้', data, displayText: 'ยืนยันแก้' } },
        { type: 'action', action: { type: 'postback', label: 'ไม่แก้', data: 'action=qe_cancel', displayText: 'ไม่แก้' } },
      ],
    },
  });
}

// action=qe&id&f&v — แก้จริง (คิดยอดค้างใหม่แบบเดียวกับหน้าแก้ไข)
export async function quickEditApply({ replyToken, profile, params }, deps = {}) {
  const job = await (deps.getJobById || getJobById)(profile.id, params.id);
  if (!job) return reply(replyToken, { type: 'text', text: 'ไม่พบงานนี้แล้วค่ะ' });

  const f = params.f;
  const patch = {};
  if (f === 'total') {
    const amount = round2(Number(params.v));
    if (!(amount > 0)) return reply(replyToken, { type: 'text', text: 'ราคาไม่ถูกต้องค่ะ' });
    Object.assign(patch, { total: amount }, derivePaymentFields(amount, job.paid_amount || 0));
  } else if (f === 'paid') {
    const amount = round2(Number(params.v));
    if (!(amount >= 0)) return reply(replyToken, { type: 'text', text: 'ยอดไม่ถูกต้องค่ะ' });
    Object.assign(patch, derivePaymentFields(job.total, amount));
  } else if (f === 'customer') {
    patch.customer_name = String(params.v || '').trim();
  } else if (f === 'jobName') {
    patch.job_name = String(params.v || '').trim();
  } else {
    return reply(replyToken, { type: 'text', text: 'ปุ่มนี้หมดอายุแล้วค่ะ' });
  }

  const updated = await (deps.updateJob || updateJob)(profile.id, job.id, patch);
  if (!updated) return reply(replyToken, { type: 'text', text: 'ไม่พบงานนี้แล้วค่ะ' });
  const full = { ...job, ...updated, items: job.items || [] };
  return reply(replyToken, [
    { type: 'text', text: `แก้${FIELD_LABEL[f] || ''}ให้แล้วค่ะ 💜` },
    jobCardMessage(full, 'แก้ไขเรียบร้อย'),
  ]);
}

export async function quickEditCancel({ replyToken }) {
  return reply(replyToken, { type: 'text', text: 'ไม่แก้ค่ะ ใบเดิมอยู่ครบเหมือนเดิม 💜' });
}
