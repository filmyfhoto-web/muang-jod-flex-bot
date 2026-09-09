import { reply, getMessageContentBuffer } from '../services/lineService.js';
import { getState, setState, clearState, STATES } from '../services/stateService.js';
import { createJob, getRecentJobs } from '../services/jobService.js';
import { saveAttachment } from '../services/attachmentService.js';
import { receiptFlex } from '../flex/receiptFlex.js';
import { formCardsMessage, greetingTexts } from '../flex/formCardFlex.js';
import { quickFormUrl, liffUrl } from '../utils/liff.js';
import { logger } from '../services/logger.js';

// Triggered by postback action=add_job: the greeting and the cards.
//
// No wall of instructions follows them. The card carries a "พิมพ์เอง" button
// and the chat is a chat — a page of examples is what you write when the UI
// cannot speak for itself, and it pushed the card off the screen.
//
// The state machine is left waiting for job text either way — the card is a
// picture of the form with a way through to it, and typing the job straight
// into the chat still works exactly as before. That is the fast path and it
// stays the default.
export async function addJob({ replyToken, profile }) {
  await setState(profile.id, STATES.WAITING_FOR_JOB, {});

  let recent = [];
  try {
    recent = await getRecentJobs(profile.id, 4);
  } catch (err) {
    logger.warn('addJob.recent_failed', { message: err?.message });
  }

  await reply(replyToken, [
    ...greetingTexts(profile.display_name),
    formCardsMessage({ formUrl: quickFormUrl(), dashboardUrl: liffUrl({ tab: 'today' }), recent }),
  ]);
}

// A draft read off a photographed document has that picture waiting for it.
// Nothing is downloaded until the draft is confirmed, so a cancelled draft
// costs no storage; a failure here never loses the job, which is already saved.
async function attachHeldPicture(userId, job, held) {
  if (!held?.messageId) return true;
  try {
    const buffer = await getMessageContentBuffer(held.messageId);
    await saveAttachment(userId, job, { messageId: held.messageId, buffer, fileType: held.fileType });
    return true;
  } catch (err) {
    logger.warn('addJob.attach_failed', { message: err?.message });
    return false;
  }
}

// postback action=confirm_add_job — commit the draft from context to the DB.
export async function confirmAddJob({ replyToken, profile }) {
  const st = await getState(profile.id);
  const draft = st?.context?.draft;
  const held = st?.context?.attachment;

  if (st?.state !== STATES.CONFIRMING_JOB || !draft) {
    return reply(replyToken, {
      type: 'text',
      text: 'ไม่พบงานที่รอบันทึกค่ะ ลองกด "บันทึกงานวันนี้" ใหม่นะคะ 💜',
    });
  }

  let job;
  try {
    job = await createJob(profile.id, draft);
  } catch (err) {
    console.error(`[confirmAddJob] save failed for user ${profile.id}:`, err?.message || err);
    // Keep the draft in context so the user can retry with the same buttons.
    return reply(replyToken, {
      type: 'text',
      text: 'ขออภัยค่ะ บันทึกไม่สำเร็จ 😢 กด "✅ บันทึกงาน" อีกครั้งได้เลยนะคะ',
    });
  }

  const attached = await attachHeldPicture(profile.id, job, held);
  await clearState(profile.id);

  // Receipt-style "บันทึกสำเร็จ" card.
  return reply(replyToken, [
    receiptFlex(job),
    ...(attached
      ? []
      : [{ type: 'text', text: 'บันทึกงานแล้วค่ะ แต่แนบรูปเอกสารไม่สำเร็จ ส่งรูปเข้ามาใหม่อีกครั้งได้นะคะ 💜' }]),
  ]);
}

// postback action=edit_new_job — go back to collecting a fresh description.
export async function editNewJob({ replyToken, profile }) {
  await setState(profile.id, STATES.WAITING_FOR_JOB, {});
  return reply(replyToken, {
    type: 'text',
    text: 'ได้ค่ะ พิมพ์รายละเอียดงานใหม่มาได้เลย ม่วงจดจะจัดรายการให้ใหม่ค่ะ ✏️',
  });
}

// postback action=cancel_new_job — drop the draft, save nothing.
export async function cancelNewJob({ replyToken, profile }) {
  await clearState(profile.id);
  return reply(replyToken, {
    type: 'text',
    text: 'ยกเลิกแล้วค่ะ ไม่มีการบันทึกงานนี้ลงระบบนะคะ ❌',
  });
}
