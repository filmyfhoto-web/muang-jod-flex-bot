import { reply, getMessageContentBuffer } from '../services/lineService.js';
import { getState, clearState, STATES } from '../services/stateService.js';
import { getLatestJob, getJobById } from '../services/jobService.js';
import { saveAttachment } from '../services/attachmentService.js';

const MIME_BY_EXT = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  pdf: 'application/pdf',
};

function guessFileType(message) {
  if (message.type === 'image') return 'image/jpeg';
  const name = message.fileName || '';
  const ext = name.split('.').pop()?.toLowerCase();
  return MIME_BY_EXT[ext] || 'application/octet-stream';
}

// Handle image/file messages: download from LINE, store in Supabase, link to job.
export async function handleImageMessage(event, profile) {
  const { replyToken } = event;
  const message = event.message;
  const state = await getState(profile.id);
  const current = state?.state || STATES.IDLE;

  // Resolve the target job: explicit from state, else the latest one.
  let job = null;
  if (current === STATES.WAITING_FOR_EVIDENCE && state?.context?.jobId) {
    job = await getJobById(profile.id, state.context.jobId);
  }
  if (!job) {
    job = await getLatestJob(profile.id);
  }

  if (!job) {
    if (current === STATES.WAITING_FOR_EVIDENCE) await clearState(profile.id);
    return reply(replyToken, {
      type: 'text',
      text: 'ยังไม่มีงานให้แนบหลักฐานเลยค่ะ ลองบันทึกงานก่อนนะคะ 💜',
    });
  }

  try {
    const buffer = await getMessageContentBuffer(message.id);
    const fileType = guessFileType(message);
    await saveAttachment(profile.id, job, {
      messageId: message.id,
      buffer,
      fileType,
    });
  } catch (err) {
    console.error('[imageHandler] failed to save attachment:', err?.message || err);
    return reply(replyToken, {
      type: 'text',
      text: 'ขออภัยค่ะ บันทึกไฟล์ไม่สำเร็จ ลองส่งใหม่อีกครั้งนะคะ',
    });
  }

  if (current === STATES.WAITING_FOR_EVIDENCE) {
    await clearState(profile.id);
  }

  return reply(replyToken, {
    type: 'text',
    text: `แนบหลักฐานเข้ากับงาน "${job.job_name}" แล้วค่ะ 💜`,
  });
}
