import { reply } from '../services/lineService.js';
import { getState, setState, STATES } from '../services/stateService.js';
import { withDraftGuide } from '../flex/draftGuide.js';
import { jobPreviewMessage } from '../flex/jobCard.js';
import { draftToBubble, parseCustomerName } from '../utils/jobDraft.js';

/* action=draft_customer&name=… — ลงชื่อลูกค้าให้ร่างที่อยู่บนจอ ด้วยปุ่ม ไม่ต้องพิมพ์
 *
 * ใช้โดยปุ่มที่ม่วงเสนอตอนชื่อที่พิมพ์ไปพ้องกับชื่อที่เคยจดไว้ — "สบกอน" ที่พิมพ์
 * กับ "รร.สบกอน" ที่เสนอ เป็นคนละข้อความแต่เจ้าเดียวกัน กดปุ่มคือเลือกสะกด
 *
 * เป็น postback เพราะข้อความธรรมดาเปลี่ยนชื่อไม่ได้แล้วหลังร่างมีชื่อ (ทุกประโยค
 * ที่พิมพ์ระหว่างตรวจร่างจะกลายเป็นการเปลี่ยนชื่อหมด) — ปุ่มนี้คือทางเดียวที่แคบพอ
 */
export async function setDraftCustomer({ replyToken, profile, params }) {
  const name = parseCustomerName(params?.name);
  if (!name) {
    return reply(replyToken, { type: 'text', text: 'ชื่อนี้ใช้ไม่ได้ค่ะ ลองพิมพ์ชื่อลูกค้ามาใหม่ได้เลยนะคะ 💜' });
  }

  const state = await getState(profile.id);
  const draft = state?.state === STATES.CONFIRMING_JOB ? state.context?.draft : null;
  if (!draft) {
    return reply(replyToken, { type: 'text', text: 'ไม่มีร่างงานค้างอยู่แล้วค่ะ ร่างใหม่พิมพ์รายการงานมาได้เลยนะคะ 💜' });
  }

  const updated = { ...draft, customerName: name };
  await setState(profile.id, STATES.CONFIRMING_JOB, { ...state.context, draft: updated });
  return reply(
    replyToken,
    withDraftGuide(
      [
        { type: 'text', text: `ลงชื่อลูกค้า "${name}" ให้แล้วค่ะ 💜 ครบแล้วกด "✅ บันทึกงาน" ได้เลยนะคะ` },
        jobPreviewMessage(draftToBubble(updated)),
      ],
      updated
    )
  );
}
