import { reply } from '../services/lineService.js';
import { getState, setState, clearState, STATES } from '../services/stateService.js';
import { createJob } from '../services/jobService.js';
import { receiptFlex } from '../flex/receiptFlex.js';
import { quickFormUrl } from '../utils/liff.js';

const PROMPT = `📝 บันทึกงานใหม่

พิมพ์รายละเอียดงานได้เลยค่ะ

ตัวอย่าง:
ป้ายไวนิล 60x100 150 บาท
โฟมบอร์ด 40x60 250 บาท

คิดเป็นตารางเมตรก็ได้ค่ะ พิมพ์ขนาดกับเรตมา ม่วงจดคูณให้เอง
รพสตบ้านชี ไวนิล 160x300 ตรมละ 165
(ตัวเลขไม่ใส่หน่วย = เซนติเมตร → 4.8 ตร.ม. = 792 บาท)

ม่วงจดจะช่วยจัดรายการให้ค่ะ 💜`;

// Triggered by postback action=add_job. Prompt user then wait for job text.
//
// Typing is the fast path and stays the default. The form is for the times
// pricing has to be picked apart field by field — or when a photo goes with
// the job — so it is offered, not forced.
export async function addJob({ replyToken, profile }) {
  await setState(profile.id, STATES.WAITING_FOR_JOB, {});
  const form = quickFormUrl();
  const text = form ? `${PROMPT}\n\nหรือกรอกเป็นฟอร์มก็ได้ค่ะ 👉 ${form}` : PROMPT;
  await reply(replyToken, { type: 'text', text });
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

  await clearState(profile.id);

  // Receipt-style "บันทึกสำเร็จ" card.
  return reply(replyToken, receiptFlex(job));
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
