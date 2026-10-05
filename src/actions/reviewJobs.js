import { reply } from '../services/lineService.js';
import { getUnbookedJobs, getJobById, updateJob } from '../services/jobService.js';
import { reviewJobsFlex, statusLine } from '../flex/reviewJobsFlex.js';
import { stagePatch, pickupPatch } from '../utils/jobState.js';
import { missingColumn } from '../utils/dbErrors.js';
import { logger } from '../services/logger.js';

const PAGE = 8;

const MARKS = {
  // จ่ายแล้ว = เดินถึงขั้น "ได้เงิน" (ครบสี่ขั้นต้องผ่านขั้นนี้ก่อน)
  paid: (job) => stagePatch(job, 3),
  // ยังไม่จ่าย = ลูกค้ารับของไปแล้วแต่ยังไม่ได้เงิน
  owed: (job) => pickupPatch(job, 'owed'),
  booked: (job) => stagePatch(job, 4),
};

const LABEL = { paid: '💰 จ่ายแล้ว', owed: '📛 ยังไม่จ่าย', booked: '📒 ลงบัญชีแล้ว' };

// action=review_jobs[&offset=N] — "ตรวจงานเก่า": การ์ดงานที่ยังไม่ลงบัญชี ใบละสามปุ่ม
export async function reviewJobs({ replyToken, profile, params }) {
  const offset = Math.max(Number.parseInt(params?.offset, 10) || 0, 0);
  const page = await getUnbookedJobs(profile.id, { offset, limit: PAGE });

  if (!page) {
    return reply(replyToken, {
      type: 'text',
      text: 'ยังเปิดหน้านี้ไม่ได้ค่ะ 😔 ต้องรัน migration 015_job_stages.sql ใน Supabase ก่อน',
    });
  }
  if (!page.jobs.length) {
    return reply(replyToken, {
      type: 'text',
      text: offset ? 'ครบทุกใบแล้วค่ะ 🎉' : 'ไม่มีงานค้างให้ทบทวนแล้วค่ะ ลงบัญชีครบทุกใบ 💜',
    });
  }

  return reply(replyToken, [
    {
      type: 'text',
      text: `ตรวจงานเก่าค่ะ 💜 (เรียงจากเก่าสุด)\nกดทีละใบ: 💰 จ่ายแล้ว · 📛 ยังไม่จ่าย · 📒 ลงบัญชีแล้ว`,
    },
    reviewJobsFlex({ ...page, offset }),
  ]);
}

// action=job_mark&jobId=…&to=paid|owed|booked&o=<หน้าที่อยู่>
export async function jobMark({ replyToken, profile, params }) {
  const to = String(params?.to || '');
  const offset = Math.max(Number.parseInt(params?.o, 10) || 0, 0);
  const job = params?.jobId ? await getJobById(profile.id, params.jobId) : null;
  if (!job || !MARKS[to]) {
    return reply(replyToken, { type: 'text', text: 'ไม่พบงานนี้ค่ะ อาจถูกยกเลิกไปแล้วนะคะ' });
  }

  const patch = MARKS[to](job);
  try {
    await updateJob(profile.id, job.id, patch);
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

  const after = await getJobById(profile.id, job.id);
  const st = statusLine(after || job);
  return reply(replyToken, {
    type: 'text',
    text: `${LABEL[to]} ✓ ${job.job_name || 'งาน'}\nตอนนี้: ${st.text}`,
    quickReply: {
      items: [
        { type: 'action', action: { type: 'postback', label: '↩️ กลับไปรายการ', data: `action=review_jobs&offset=${offset}`, displayText: 'กลับไปรายการ' } },
        { type: 'action', action: { type: 'postback', label: 'ถัดไป ›', data: `action=review_jobs&offset=${offset + 8}`, displayText: 'ดูงานถัดไป' } },
      ],
    },
  });
}
