import { reply, getMessageContentBuffer } from '../services/lineService.js';
import { getState, clearState, STATES } from '../services/stateService.js';
import { getLatestJob, getJobById } from '../services/jobService.js';
import { saveAttachment } from '../services/attachmentService.js';
import { logger } from '../services/logger.js';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];

function maxBytes() {
  const mb = Number(process.env.MAX_UPLOAD_MB) || 10;
  return mb * 1024 * 1024;
}

// Detect the real content type from magic bytes — do not trust the filename.
function sniffMime(buf) {
  if (!buf || buf.length < 4) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return 'application/pdf';
  return null;
}

// Handle image/file messages: download from LINE, validate, store, link to job.
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
  if (!job) job = await getLatestJob(profile.id);

  if (!job) {
    if (current === STATES.WAITING_FOR_EVIDENCE) await clearState(profile.id);
    return reply(replyToken, {
      type: 'text',
      text: 'ยังไม่มีงานให้แนบหลักฐานเลยค่ะ ลองบันทึกงานก่อนนะคะ 💜',
    });
  }

  let buffer;
  try {
    buffer = await getMessageContentBuffer(message.id);
  } catch (err) {
    logger.error('image.download_failed', { message: err?.message });
    return reply(replyToken, {
      type: 'text',
      text: 'ขออภัยค่ะ ดาวน์โหลดไฟล์ไม่สำเร็จ ลองส่งใหม่อีกครั้งนะคะ',
    });
  }

  // Size limit.
  if (buffer.length > maxBytes()) {
    const mb = Number(process.env.MAX_UPLOAD_MB) || 10;
    logger.warn('image.too_large', { size: buffer.length });
    return reply(replyToken, {
      type: 'text',
      text: `ไฟล์ใหญ่เกินไปค่ะ 😢 รองรับไม่เกิน ${mb} MB ต่อไฟล์นะคะ`,
    });
  }

  // MIME check (magic bytes, not filename).
  const fileType = sniffMime(buffer);
  if (!fileType || !ALLOWED_TYPES.includes(fileType)) {
    logger.warn('image.bad_type', { detected: fileType || 'unknown' });
    return reply(replyToken, {
      type: 'text',
      text: 'รองรับเฉพาะรูป JPG, PNG หรือไฟล์ PDF เท่านั้นค่ะ 💜',
    });
  }

  try {
    await saveAttachment(profile.id, job, { messageId: message.id, buffer, fileType });
  } catch (err) {
    logger.error('image.save_failed', { message: err?.message });
    return reply(replyToken, {
      type: 'text',
      text: 'ขออภัยค่ะ บันทึกไฟล์ไม่สำเร็จ ลองส่งใหม่อีกครั้งนะคะ',
    });
  }

  if (current === STATES.WAITING_FOR_EVIDENCE) await clearState(profile.id);

  return reply(replyToken, {
    type: 'text',
    text: `แนบหลักฐานเข้ากับงาน "${job.job_name}" แล้วค่ะ 💜`,
  });
}
