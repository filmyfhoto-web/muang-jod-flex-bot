import { reply, getMessageContentBuffer } from '../services/lineService.js';
import { getState, setState, clearState, STATES } from '../services/stateService.js';
import { getLatestJob, getJobById, createJob } from '../services/jobService.js';
import { saveAttachment } from '../services/attachmentService.js';
import { saveShopQr } from '../services/shopService.js';
import { readImage } from '../services/visionService.js';
import { slipReceiptFlex } from '../flex/slipFlex.js';
import { jobPreviewMessage } from '../flex/jobCard.js';
import { makeDraft, draftToBubble } from '../utils/jobDraft.js';
import { deriveJobName } from '../utils/category.js';
import { logger } from '../services/logger.js';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];

/* เพดานขนาดไฟล์
 *
 * ร้านอยากให้ม่วงอ่านไฟล์ที่ลูกค้าส่งมาได้เลย ซึ่งไฟล์แบบนั้นใหญ่กว่ารูปในแชตมาก
 * — รูปที่ส่งเป็น "รูป" ไลน์บีบมาให้แล้ว แต่รูปที่ส่งเป็น "ไฟล์" มาเต็มความละเอียด
 * เดิม ตัวอย่างที่ร้านส่งมาคือ PNG 27.42 MB ซึ่งของเดิมถูกปัดตกตั้งแต่ด่านนี้
 * ด้วยข้อความ "ไฟล์ใหญ่เกินไป" ทั้งที่มันคือใบสั่งงานที่ควรอ่าน
 *
 * ย่อก่อนส่งให้ตัวอ่าน (imagePrep) แล้ว เพดานตรงนี้จึงเหลือแค่เรื่องหน่วยความจำ
 * กับพื้นที่เก็บไฟล์เท่านั้น
 */
function maxBytes() {
  const mb = Number(process.env.MAX_UPLOAD_MB) || 30;
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
  // A draft is on screen: the shop typed the job and is now sending the photo
  // that goes with it. That photo belongs to the job about to be saved, not to
  // whatever was saved before it.
  const drafting = current === STATES.CONFIRMING_JOB && Boolean(state?.context?.draft);

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
    const mb = Number(process.env.MAX_UPLOAD_MB) || 30;
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

  /* รูป QR รับเงินของร้าน — ต้องมาก่อนทุกทาง
   *
   * ร้านเพิ่งพิมพ์ว่า "QR" แล้วม่วงขอรูป รูปถัดไปจึงเป็น QR ของร้านแน่ ๆ
   * ไม่ใช่หลักฐานของงานและไม่ใช่ใบสั่งงานให้อ่าน — ถ้าปล่อยให้ตกไปทางอ่านรูป
   * ม่วงจะพยายามอ่าน QR เป็นใบสั่งงาน แล้วตั้งงานใหม่ขึ้นมาจากรูปที่ไม่มีงาน
   */
  if (current === STATES.WAITING_FOR_QR) {
    if (fileType === 'application/pdf') {
      return reply(replyToken, { type: 'text', text: 'QR ต้องเป็นรูปนะคะ (JPG หรือ PNG) ส่งใหม่ได้เลยค่ะ 💜' });
    }
    try {
      await saveShopQr(profile.id, { buffer, fileType });
    } catch (err) {
      logger.error('shop.qr_save_failed', { message: err?.message });
      return reply(replyToken, { type: 'text', text: 'เก็บ QR ไม่สำเร็จค่ะ 😢 ลองส่งรูปใหม่อีกครั้งนะคะ' });
    }
    await clearState(profile.id);
    return reply(replyToken, {
      type: 'text',
      text:
        'เก็บ QR รับเงินให้แล้วค่ะ 💜\n' +
        'คราวหลังพิมพ์ว่า "QR" คำเดียว รูปจะเด้งขึ้นมาเลย\n' +
        'และ QR จะขึ้นท้ายใบเสร็จที่ยังไม่ได้จ่ายให้อัตโนมัติด้วยนะคะ',
    });
  }

  // Held, not uploaded: confirmAddJob downloads and attaches it once the draft
  // is saved, so a cancelled draft costs no storage.
  if (drafting) {
    await setState(profile.id, STATES.CONFIRMING_JOB, {
      ...state.context,
      attachment: { messageId: message.id, fileType },
    });
    return reply(replyToken, [
      { type: 'text', text: 'รับรูปไว้แล้วค่ะ จะแนบให้ตอนกด "✅ บันทึกงาน" นะคะ 💜' },
      jobPreviewMessage(draftToBubble(state.context.draft)),
    ]);
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
