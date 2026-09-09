import { reply, getMessageContentBuffer } from '../services/lineService.js';
import { getState, setState, clearState, STATES } from '../services/stateService.js';
import { getLatestJob, getJobById, createJob } from '../services/jobService.js';
import { saveAttachment } from '../services/attachmentService.js';
import { readImage } from '../services/visionService.js';
import { slipReceiptFlex } from '../flex/slipFlex.js';
import { jobPreviewMessage } from '../flex/jobCard.js';
import { makeDraft, draftToBubble } from '../utils/jobDraft.js';
import { deriveJobName } from '../utils/category.js';
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
  const attaching = current === STATES.WAITING_FOR_EVIDENCE;

  // Resolve the target job: explicit from state, else the latest one.
  let job = null;
  if (attaching && state?.context?.jobId) {
    job = await getJobById(profile.id, state.context.jobId);
  }
  if (!job) job = await getLatestJob(profile.id);

  // With no job to attach to, an unreadable image has nowhere to go — but a
  // readable slip or job sheet makes its own job below, so don't bail out yet.
  const nowhereToAttach = !job;

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

  // Unless the user explicitly asked to attach evidence to an existing job,
  // try to read the paper: a slip becomes a job of its own, a job sheet
  // becomes a draft to check first.
  if (!attaching) {
    const read = await readImage(buffer, fileType);

    // A work order is a proposal, not a fact — the paper says what to make,
    // not that it was agreed or paid for. So it goes through the same preview
    // and the same "✅ บันทึกงาน" button a typed job does, with the picture
    // held aside to attach once the draft is confirmed.
    if (read?.kind === 'job') {
      const draft = makeDraft({
        jobName: read.jobName || deriveJobName(read.items),
        customerName: read.customerName,
        jobDate: read.date || undefined,
        items: read.items,
        subtotal: read.subtotal,
        total: read.total,
        note: 'อ่านจากรูปเอกสาร',
      });

      await setState(profile.id, STATES.CONFIRMING_JOB, {
        draft,
        attachment: { messageId: message.id, fileType },
      });

      const askPrice = !(draft.total > 0) && draft.items.length === 1;
      return reply(replyToken, [
        {
          type: 'text',
          text: askPrice
            ? 'อ่านจากรูปได้แล้วค่ะ แต่ในเอกสารไม่มีราคา 💜\nพิมพ์ราคามาได้เลย เช่น 1500 แล้วม่วงจดจะใส่ให้ค่ะ'
            : 'อ่านจากรูปได้แล้วค่ะ ตรวจดูให้หน่อยนะคะ ถ้าถูกต้องกด "✅ บันทึกงาน" ได้เลย 💜',
        },
        jobPreviewMessage(draftToBubble(draft)),
      ]);
    }

    const slip = read?.kind === 'slip' ? read : null;
    if (slip) {
      const created = await createJob(profile.id, {
        jobName: slip.merchantName ? `สลิป ${slip.merchantName}` : 'บันทึกจากสลิป',
        customerName: slip.merchantName,
        jobDate: slip.date || undefined,
        items: slip.items,
        subtotal: slip.subtotal,
        discount: slip.discount,
        total: slip.total,
        paidAmount: slip.total, // a slip is proof the money moved
        note: 'บันทึกจากสลิป/หลักฐาน',
      });

      let attached = true;
      try {
        await saveAttachment(profile.id, created, { messageId: message.id, buffer, fileType });
      } catch (err) {
        // The job is already saved; say so rather than losing it over a file.
        attached = false;
        logger.error('image.slip_attach_failed', { message: err?.message });
      }

      return reply(replyToken, slipReceiptFlex(created, { attached }));
    }
  }

  if (nowhereToAttach) {
    if (attaching) await clearState(profile.id);
    return reply(replyToken, {
      type: 'text',
      text: 'ยังไม่มีงานให้แนบหลักฐานเลยค่ะ ลองบันทึกงานก่อนนะคะ 💜',
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

  if (attaching) await clearState(profile.id);

  return reply(replyToken, {
    type: 'text',
    text: `แนบหลักฐานเข้ากับงาน "${job.job_name}" แล้วค่ะ 💜`,
  });
}
