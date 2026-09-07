import { reply } from '../services/lineService.js';
import { getLatestJob, cancelJob } from '../services/jobService.js';
import { clearState } from '../services/stateService.js';
import { confirmCancelFlex } from '../flex/confirmationFlex.js';

// action=cancel_latest — show the latest job and ask for confirmation.
// Never deletes immediately.
export async function cancelLatest({ replyToken, profile }) {
  const latest = await getLatestJob(profile.id);

  if (!latest) {
    await reply(replyToken, {
      type: 'text',
      text: 'ยังไม่มีงานให้ยกเลิกเลยค่ะ 💜',
    });
    return;
  }

  await reply(replyToken, confirmCancelFlex(latest));
}

// action=confirm_cancel&jobId=... — soft-delete (status=cancelled).
export async function confirmCancel({ replyToken, profile, params }) {
  const jobId = params?.jobId;
  if (!jobId) {
    await reply(replyToken, { type: 'text', text: 'ไม่พบงานที่จะยกเลิกค่ะ' });
    return;
  }

  const updated = await cancelJob(profile.id, jobId);
  await clearState(profile.id);

  if (!updated) {
    await reply(replyToken, {
      type: 'text',
      text: 'ไม่พบงานนี้ หรืออาจถูกยกเลิกไปแล้วค่ะ',
    });
    return;
  }

  await reply(replyToken, {
    type: 'text',
    text: `ยกเลิกงาน "${updated.job_name}" เรียบร้อยแล้วค่ะ 💜`,
  });
}

// action=cancel_cancel — user backed out.
export async function cancelCancel({ replyToken, profile }) {
  await clearState(profile.id);
  await reply(replyToken, {
    type: 'text',
    text: 'ไม่ยกเลิกนะคะ เก็บงานไว้เหมือนเดิมค่ะ 💜',
  });
}
