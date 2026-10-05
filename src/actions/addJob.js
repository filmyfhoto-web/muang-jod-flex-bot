import { reply, getMessageContentBuffer } from '../services/lineService.js';
import { getState, setState, clearState, STATES } from '../services/stateService.js';
import { createJob, getRecentJobs, getTodaySummary } from '../services/jobService.js';
import { saveAttachment } from '../services/attachmentService.js';
import { receiptFlex } from '../flex/receiptFlex.js';
import { formCardsMessage, greetingTexts } from '../flex/formCardFlex.js';
import { quickFormUrl, liffUrl } from '../utils/liff.js';
import { listBranches, pickBranch } from '../services/branchService.js';
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

  // A failed read must not come back as "you have nothing" — that is the same
  // card the user sees on their first day, and it is a lie on any other day.
  let recent = [];
  let recentFailed = false;
  try {
    recent = await getRecentJobs(profile.id, 4);
  } catch (err) {
    recentFailed = true;
    logger.warn('addJob.recent_failed', { message: err?.message });
  }

  await reply(replyToken, [
    ...greetingTexts(profile.display_name),
    formCardsMessage({
      formUrl: quickFormUrl(),
      dashboardUrl: liffUrl({ tab: 'today' }),
      recent,
      recentFailed,
      today: await todayTally(profile.id),
    }),
  ]);
}

// The day's running total, or null. Never throws: a tally is a nice-to-have
// line on a card, and it must not be able to take the card down with it.
async function todayTally(userId) {
  try {
    return await getTodaySummary(userId);
  } catch (err) {
    logger.warn('addJob.today_failed', { message: err?.message });
    return null;
  }
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

  if (st?.state !== STATES.CONFIRMING_JOB || !draft) {
    return reply(replyToken, {
      type: 'text',
      text: 'ไม่พบงานที่รอบันทึกค่ะ ลองกด "บันทึกงานวันนี้" ใหม่นะคะ 💜',
    });
  }

  /* ร้านไหน — เจ้าของมีสองร้านและสั่งว่า "ห้ามนำงานมาปนกัน"
   *
   * ถ้าข้อความบอกร้านมาแล้ว (branchSlug ในสเตต) ใช้อันนั้น ไม่ได้บอกและมี
   * หลายร้าน → ถามก่อนบันทึก ตามที่เจ้าของสั่งไว้คำต่อคำ: "ถ้าฉันเพิ่มงานใหม่
   * แต่ไม่ได้บอกว่าเป็นร้านไหน ให้ม่วงถามสั้น ๆ"
   *
   * มีร้านเดียวหรือยังไม่มีร้าน (ไมเกรชันยังไม่รัน) → บันทึกไปเลย การถามคำถาม
   * ที่มีคำตอบเดียวคือการกดเพิ่มหนึ่งครั้งฟรี ๆ ทุกงาน
   */
  const branches = await listBranchesSafe(profile.id);
  const picked = st?.context?.branchSlug ? pickBranch(branches, st.context.branchSlug) : null;
  const branch = picked || (branches.length === 1 ? branches[0] : null);

  if (!branch && branches.length >= 2) {
    return reply(replyToken, {
      type: 'text',
      text: 'งานนี้ลงร้านไหนดีคะ? 💜',
      quickReply: {
        items: branches.slice(0, 13).map((b) => ({
          type: 'action',
          action: {
            type: 'postback',
            label: String(b.name).slice(0, 20),
            data: `action=pick_branch&branch=${encodeURIComponent(b.slug)}`,
            displayText: b.name,
          },
        })),
      },
    });
  }

  return saveDraft({ replyToken, profile }, st, branch);
}

// postback action=pick_branch&branch=… — คำตอบของ "งานนี้ลงร้านไหนดีคะ"
export async function pickBranchAndSave({ replyToken, profile, params }) {
  const st = await getState(profile.id);
  if (st?.state !== STATES.CONFIRMING_JOB || !st?.context?.draft) {
    return reply(replyToken, {
      type: 'text',
      text: 'ไม่พบงานที่รอบันทึกค่ะ ลองกด "บันทึกงานวันนี้" ใหม่นะคะ 💜',
    });
  }

  const branches = await listBranchesSafe(profile.id);
  const branch = pickBranch(branches, params?.branch || '');
  if (!branch) {
    // ปุ่มเก่าจากการ์ดที่ค้างไว้ ชี้ร้านที่ไม่มีแล้ว — อย่าเดา ให้เลือกใหม่
    return confirmAddJob({ replyToken, profile });
  }
  return saveDraft({ replyToken, profile }, st, branch);
}

async function listBranchesSafe(userId) {
  try {
    return await listBranches(userId);
  } catch (err) {
    // รายชื่อร้านพังต้องไม่พางานทั้งใบล่ม — บันทึกแบบไม่ระบุร้าน แล้วค่อยย้ายได้
    logger.warn('addJob.branches_failed', { message: err?.message });
    return [];
  }
}

async function saveDraft({ replyToken, profile }, st, branch) {
  const draft = st?.context?.draft;
  const held = st?.context?.attachment;

  let job;
  try {
    job = await createJob(profile.id, { ...draft, branchId: branch?.id || null });
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

  // Receipt-style "บันทึกสำเร็จ" card. ไม่มีแถบนับยอดของวันแล้ว — ร้านบอกว่า
  // "จำนวนจดรวมไม่ต้องนับ" ยอดรวมของวันดูได้จากปุ่มสรุปที่อยู่บนการ์ดอยู่แล้ว
  //
  // บอกด้วยว่าเข้าบัญชีร้านไหน — การลงผิดร้านต้องถูกเห็นตรงนี้ ตอนที่ยังแก้ทัน
  // ไม่ใช่ตอนปิดบัญชีสิ้นเดือน
  return reply(replyToken, [
    ...(branch ? [{ type: 'text', text: `ลงบัญชีร้าน "${branch.name}" ให้แล้วนะคะ 💜` }] : []),
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

// postback action=add_more&customer=… — the next job for the same customer.
//
// The customer rides along in the state, so the shop can type just the work
// ("ป้ายไวนิล 2 ป้าย ป้ายละ 500") and still get it filed under the right name.
export async function addMoreForCustomer({ replyToken, profile, params }) {
  const customerName = (params?.customer || '').trim() || null;
  await setState(profile.id, STATES.WAITING_FOR_JOB, { customerName });

  return reply(replyToken, {
    type: 'text',
    text: customerName
      ? `งานต่อไปของ ${customerName} ค่ะ 💜\nพิมพ์เฉพาะงานมาได้เลย ไม่ต้องพิมพ์ชื่อซ้ำนะคะ`
      : 'พิมพ์งานต่อไปได้เลยค่ะ 💜',
  });
}
