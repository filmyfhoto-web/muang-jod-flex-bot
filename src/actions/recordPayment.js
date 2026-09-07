import { reply } from '../services/lineService.js';
import { setState, STATES } from '../services/stateService.js';
import { getPendingJobs, getLatestJob } from '../services/jobService.js';
import { formatBaht } from '../utils/currency.js';

// postback action=record_payment — pick the most relevant job (the latest job
// that still owes money, else the latest job) and ask for the amount received.
export async function recordPaymentPrompt({ replyToken, profile }) {
  const pending = await getPendingJobs(profile.id);
  const job = pending[0] || (await getLatestJob(profile.id));

  if (!job) {
    await reply(replyToken, {
      type: 'text',
      text: 'ยังไม่มีงานให้บันทึกรับเงินเลยค่ะ ลองบันทึกงานก่อนนะคะ 💜',
    });
    return;
  }

  const balance = job.balance_due != null ? Number(job.balance_due) : Number(job.total) || 0;
  await setState(profile.id, STATES.WAITING_FOR_PAYMENT, { jobId: job.id });

  await reply(replyToken, {
    type: 'text',
    text:
      `💰 บันทึกรับเงินสำหรับงาน "${job.job_name}"\n` +
      `คงเหลือ ${formatBaht(balance)}\n\n` +
      'พิมพ์จำนวนเงินที่รับมาได้เลยค่ะ (เช่น 500)',
  });
}
