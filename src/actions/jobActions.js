import { reply } from '../services/lineService.js';
import { setState, STATES } from '../services/stateService.js';
import { getJobById } from '../services/jobService.js';
import { jobCardMessage } from '../flex/jobCard.js';
import { confirmCancelFlex } from '../flex/confirmationFlex.js';
import { liffUrl } from '../utils/liff.js';

const EDIT_GUIDE = `✏️ ต้องการแก้ไขอะไรคะ?

พิมพ์ในรูปแบบนี้ได้เลยค่ะ
• ชื่องาน: ป้ายงานวัด
• ลูกค้า: ร้านกาแฟ
• สถานะ: จ่ายแล้ว / ค้างรับ / จ่ายบางส่วน
• ราคา: 500
• หมายเหตุ: ส่งของวันจันทร์

พิมพ์หลายบรรทัดพร้อมกันได้ค่ะ 💜`;

// action=edit_job&jobId=… — the ✏️ button on a job card.
//
// With LIFF configured the card's own URI button opens the form directly, so
// this path is the fallback for older cards (and when LIFF is not set up):
// point at the form if we can, otherwise run the chat edit flow.
export async function editJob({ replyToken, profile, params }) {
  const jobId = params?.jobId;
  const job = jobId ? await getJobById(profile.id, jobId) : null;
  if (!job) {
    return reply(replyToken, { type: 'text', text: 'ไม่พบงานนี้ค่ะ อาจถูกยกเลิกไปแล้วนะคะ' });
  }

  const url = liffUrl({ edit: job.id });
  if (url) {
    return reply(replyToken, {
      type: 'text',
      text: `แก้ไข "${job.job_name}" ได้ที่ลิงก์นี้เลยค่ะ 💜\n${url}`,
    });
  }

  await setState(profile.id, STATES.WAITING_FOR_EDIT, { jobId: job.id });
  return reply(replyToken, [jobCardMessage(job, 'งานที่จะแก้ไข'), { type: 'text', text: EDIT_GUIDE }]);
}

// action=delete_job&jobId=… — the ❌ button. Always confirms first; the
// confirmation card reuses the existing confirm_cancel flow (soft delete).
export async function deleteJob({ replyToken, profile, params }) {
  const jobId = params?.jobId;
  const job = jobId ? await getJobById(profile.id, jobId) : null;
  if (!job) {
    return reply(replyToken, { type: 'text', text: 'ไม่พบงานนี้ค่ะ อาจถูกยกเลิกไปแล้วนะคะ' });
  }
  return reply(replyToken, confirmCancelFlex(job));
}
