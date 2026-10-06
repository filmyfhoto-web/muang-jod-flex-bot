import { reply } from '../services/lineService.js';
import { getUnbookedJobs, getJobById, updateJob } from '../services/jobService.js';
import { statusPatch, jobStatus } from '../utils/jobState.js';
import { missingColumn } from '../utils/dbErrors.js';
import { logger } from '../services/logger.js';

/* ตรวจงานเก่าแบบถาม–ตอบ — ทีละงาน ทีละคำถาม เหมือนคุยกับคน
 *
 * ร้านขอ "ให้บอทถามตอบได้เหมือนคนคุยกัน กระชับ ไม่ซับซ้อน"
 *
 *   งานนี้ทำเสร็จแล้วใช่ไหมคะ?         → เสร็จแล้ว / ยังไม่เสร็จ
 *   ลูกค้ามารับของไปแล้วหรือยังคะ?     → รับแล้ว / ยังไม่รับ
 *   ได้รับเงินแล้วไหมคะ?               → ได้รับแล้ว / ยังไม่ได้รับ
 *   รับเป็นเงินสดหรือโอนคะ?            → จ่ายสด / โอน        (ถ้าได้รับแล้ว)
 *   ลงบัญชีไว้ก่อนไหมคะ?               → ลงบัญชี / ไม่ลง      (ถ้ายังไม่ได้รับ)
 *
 * ไม่เก็บสถานะการคุยไว้ที่ไหน: ทุกปุ่มพกงาน คำถามที่ตอบ และคำตอบมาเองใน postback
 * จึงกดซ้ำ กดค้าง หรือกลับมาตอบทีหลังก็ไม่พัง
 */

const ASK = {
  done: { text: 'งานนี้ทำเสร็จแล้วใช่ไหมคะ?', yes: '✓ เสร็จแล้ว', no: 'ยังไม่เสร็จ' },
  picked: { text: 'ลูกค้ามารับของไปแล้วหรือยังคะ?', yes: '📦 รับแล้ว', no: 'ยังไม่รับ' },
  money: { text: 'ได้รับเงินแล้วไหมคะ?', yes: '💰 ได้รับแล้ว', no: '⏳ ยังไม่ได้รับ' },
  account: { text: 'ลงบัญชีไว้ก่อนไหมคะ? (ค้างจ่ายไว้ในสมุด)', yes: '📒 ลงบัญชี', no: 'ไม่ลง' },
};

const baht = (n) => `฿${Number(n || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 })}`;

// คำถามแรกของงานใบหนึ่ง — ข้อที่ยังไม่รู้คำตอบ ไล่จากต้นทางของงาน
export function firstQuestion(job) {
  const s = jobStatus(job);
  if (!s.done) return 'done';
  if (!s.picked) return 'picked';
  return ['cash', 'transfer', 'paid'].includes(s.money) ? 'method' : 'money';
}

/* ตอบข้อหนึ่งแล้วต้องทำอะไร
 *
 * คืน { patch, next } — patch เขียนลงงาน (หรือ null ถ้ายังไม่มีอะไรให้เขียน),
 * next = คำถามถัดไปในงานเดียวกัน หรือ null เมื่อจบงานใบนี้
 */
export function applyAnswer(job, q, a, now = new Date()) {
  const yes = a === 'y';
  switch (q) {
    case 'done':
      // ยังไม่เสร็จ ก็ยังถามเรื่องเงินต่อได้ (มัดจำ/จ่ายล่วงหน้า) แต่ข้ามเรื่องรับของ
      return { patch: statusPatch(job, { done: yes }, now), next: yes ? 'picked' : 'money' };
    case 'picked':
      return { patch: statusPatch(job, { picked: yes }, now), next: 'money' };
    case 'money':
      return { patch: null, next: yes ? 'method' : 'account' };
    case 'method':
      return a === 'cash' || a === 'transfer'
        ? { patch: statusPatch(job, { money: a }, now), next: null }
        : null;
    case 'account':
      return { patch: statusPatch(job, { money: yes ? 'account' : 'unpaid' }, now), next: null };
    default:
      return null;
  }
}

const data = (job, q, a, offset) =>
  `action=rv&jobId=${encodeURIComponent(job.id)}&q=${q}&a=${a}&o=${offset}`;

const chip = (label, d, shown) => ({
  type: 'action',
  action: { type: 'postback', label: label.slice(0, 20), data: d, displayText: shown || label },
});

export function questionMessage(job, q, offset) {
  const head = [`📄 ${job.job_name || 'งาน'}`, job.customer_name, baht(job.total)].filter(Boolean).join(' · ');
  const skip = chip('ข้ามใบนี้', data(job, 'skip', 'x', offset), 'ข้ามใบนี้');

  if (q === 'method') {
    return {
      type: 'text',
      text: `${head}\nรับเป็นเงินสดหรือโอนคะ?`,
      quickReply: {
        items: [chip('💵 จ่ายสด', data(job, 'method', 'cash', offset), 'จ่ายสด'), chip('🏦 โอน', data(job, 'method', 'transfer', offset), 'โอน'), skip],
      },
    };
  }
  const ask = ASK[q];
  return {
    type: 'text',
    text: `${head}\n${ask.text}`,
    quickReply: {
      items: [chip(ask.yes, data(job, q, 'y', offset), ask.yes.replace(/^\S+\s/, '')), chip(ask.no, data(job, q, 'n', offset), ask.no.replace(/^\S+\s/, '')), skip],
    },
  };
}

// ขึ้นงานใบที่ offset (เก่าสุดก่อน) พร้อมคำถามแรก
async function presentJob(replyToken, profile, offset, lead = []) {
  const page = await getUnbookedJobs(profile.id, { offset, limit: 1 });
  if (!page) {
    return reply(replyToken, {
      type: 'text',
      text: 'ยังเปิดหน้านี้ไม่ได้ค่ะ 😔 ต้องรัน migration 015_job_stages.sql ใน Supabase ก่อน',
    });
  }
  const job = page.jobs[0];
  if (!job) {
    return reply(replyToken, [
      ...lead,
      { type: 'text', text: offset ? 'ครบทุกใบแล้วค่ะ 🎉 งานเก่าเรียบร้อยหมด' : 'ไม่มีงานค้างให้ตรวจแล้วค่ะ ลงบัญชีครบทุกใบ 💜' },
    ]);
  }
  const intro = offset === 0 && !lead.length ? [{ type: 'text', text: 'ตรวจงานเก่าทีละใบนะคะ (เก่าสุดก่อน) ตอบแค่กดปุ่มข้างล่างได้เลย 💜' }] : [];
  return reply(replyToken, [...lead, ...intro, questionMessage(job, firstQuestion(job), offset)]);
}

// action=review_jobs[&offset=N] — "ตรวจงานเก่า"
export async function reviewJobs({ replyToken, profile, params }) {
  const offset = Math.max(Number.parseInt(params?.offset, 10) || 0, 0);
  return presentJob(replyToken, profile, offset);
}

// action=rv&jobId=…&q=…&a=…&o=… — คำตอบของคำถามหนึ่งข้อ
export async function reviewAnswer({ replyToken, profile, params }) {
  const offset = Math.max(Number.parseInt(params?.o, 10) || 0, 0);
  const q = String(params?.q || '');
  const a = String(params?.a || '');

  if (q === 'skip') return presentJob(replyToken, profile, offset + 1);

  const job = params?.jobId ? await getJobById(profile.id, params.jobId) : null;
  if (!job) {
    return reply(replyToken, { type: 'text', text: 'ไม่พบงานนี้ค่ะ อาจถูกยกเลิกไปแล้วนะคะ' });
  }

  const step = applyAnswer(job, q, a);
  if (!step) return presentJob(replyToken, profile, offset);

  let current = job;
  if (step.patch) {
    try {
      await updateJob(profile.id, job.id, step.patch);
    } catch (err) {
      if (missingColumn(err, 'done_at', 'booked_at', 'pay_method')) {
        logger.warn('review.no_column', { jobId: job.id });
        return reply(replyToken, {
          type: 'text',
          text: 'ยังบันทึกไม่ได้ค่ะ 😔 ต้องรัน migration 015_job_stages.sql ใน Supabase ก่อน',
        });
      }
      throw err;
    }
    current = { ...job, ...step.patch };
  }

  // ยังมีคำถามต่อในงานใบเดิม
  if (step.next) return reply(replyToken, questionMessage(current, step.next, offset));

  // จบงานใบนี้ — สรุปสั้น ๆ แล้วขึ้นใบถัดไปเลย
  // ใบที่ลงบัญชีแล้วหลุดออกจากรายการ ใบถัดไปจึงเลื่อนมาอยู่ตำแหน่งเดิม
  const left = Boolean(current.booked_at);
  return presentJob(replyToken, profile, left ? offset : offset + 1, [
    { type: 'text', text: `✓ บันทึกแล้วค่ะ — ${current.job_name || 'งาน'}\n${summary(current)}` },
  ]);
}

function summary(job) {
  const s = jobStatus(job);
  const money = { cash: 'จ่ายสดแล้ว', transfer: 'รับเงินโอนแล้ว', paid: 'ได้รับเงินแล้ว', account: 'ลงบัญชีไว้ (ค้างจ่าย)', unpaid: 'ยังไม่ได้รับเงิน', partial: 'รับเงินบางส่วน' }[s.money];
  return [s.done ? 'เสร็จแล้ว' : 'ยังไม่เสร็จ', s.picked ? 'ลูกค้ารับแล้ว' : 'ยังไม่รับ', money].join(' · ');
}
