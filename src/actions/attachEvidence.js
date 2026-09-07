import { reply } from '../services/lineService.js';
import { setState, STATES } from '../services/stateService.js';
import { getLatestJob } from '../services/jobService.js';

// Triggered by postback action=attach_evidence. Wait for an image/file which
// will be linked to the user's latest job.
export async function attachEvidence({ replyToken, profile }) {
  const latest = await getLatestJob(profile.id);

  if (!latest) {
    await reply(replyToken, {
      type: 'text',
      text: 'ยังไม่มีงานให้แนบหลักฐานเลยค่ะ ลองบันทึกงานก่อนนะคะ 💜',
    });
    return;
  }

  await setState(profile.id, STATES.WAITING_FOR_EVIDENCE, { jobId: latest.id });
  await reply(replyToken, {
    type: 'text',
    text: `📎 ส่งรูปสลิปหรือหลักฐานมาได้เลยค่ะ\n(จะแนบเข้ากับงาน "${latest.job_name}")`,
  });
}
