import { reply } from './lineService.js';
import { setState, clearState, STATES } from './stateService.js';
import { todayISO } from '../utils/dates.js';
import { makeDraft, draftToBubble } from '../utils/jobDraft.js';
import { jobPreviewMessage } from '../flex/jobCard.js';
import {
  startCollecting,
  readTurn,
  nextQuestion,
  acknowledge,
  acknowledgeFilled,
  toDraftInput,
  parseCollectCommand,
  previousSlot,
  forget,
} from '../utils/slots.js';


/* วงสนทนา "ถามรายละเอียดทีละข้อ"
 *
 * อยู่ตรงนี้ไม่ใช่ใน messageHandler เพราะมีสองทางที่เริ่มวงนี้ได้: พิมพ์เข้ามาเอง
 * ("มีงานกรอบรูป") กับกดปุ่มลัดเหนือช่องพิมพ์ ถ้าเก็บไว้ในตัวจัดการข้อความ
 * ปุ่มลัดจะต้อง import ตัวจัดการข้อความ ซึ่ง import ตัวจัดการปุ่มอยู่แล้ว วนกัน
 */

// คำถามหนึ่งข้อ พร้อมปุ่มตัวเลือกเมื่อคำตอบมีไม่กี่แบบ
//
// ปุ่มพวกนี้เป็น Quick Reply ของ LINE ลอยอยู่เหนือช่องพิมพ์ กดแล้วส่งข้อความ
// นั้นทันที — คำถามอย่าง "เจาะตาไก่ไหม" จึงไม่ต้องพิมพ์ตอบ
function askMessage(question, lead = null) {
  const text = [lead, question.text].filter(Boolean).join('\n');
  const message = { type: 'text', text };
  if (!question.options?.length) return message;
  return {
    ...message,
    quickReply: {
      items: question.options.map((label) => ({
        type: 'action',
        action: { type: 'message', label, text: label },
      })),
    },
  };
}

const COLLECT_HELP =
  'พิมพ์ "ข้าม" ถ้ายังไม่รู้ · "ย้อนกลับ" เพื่อแก้ข้อที่แล้ว · "ยกเลิก" เพื่อเลิกจดค่ะ';

// ไม่เข้าใจสองรอบติด — ปล่อยร้านออกจากวงถาม อย่าตอบประโยคเดิมเป็นรอบที่สาม
const RELEASE_REPLY =
  'ม่วงพับชุดคำถามไว้ก่อนนะคะ 💜 พิมพ์คุยหรือจดงานใหม่ได้เลยค่ะ\n' +
  'เช่น "การ์ดแต่งงาน 100 ใบ 1,500 บาท"';

// ปุ่มทางออกตอนไม่เข้าใจ — ทุกคำโยงกับตัวอ่านที่มีอยู่แล้ว (ข้าม = คำข้าม,
// ย้อนกลับ/ยกเลิก = คำสั่ง) กดแล้วไม่มีทางกลายเป็นพลาดซ้ำ คำช่วยที่จมอยู่ใน
// ข้อความยาวร้านไม่เห็น ต้องเป็นปุ่มให้กดได้เลย
function missButtons(collect, question) {
  const labels = [...(question.options || []), 'ข้าม', ...(previousSlot(collect) ? ['ย้อนกลับ'] : []), 'ยกเลิก'];
  return labels.map((label) => ({ type: 'action', action: { type: 'message', label, text: label } }));
}

// เริ่มเก็บข้อมูล: ตอบรับสั้น ๆ ว่ารู้แล้วว่าเป็นงานอะไร แล้วถามข้อแรก
// lead ใช้ตอนสลับจากชุดคำถามเดิมมางานใหม่ — ต้องบอกว่าของเดิมถูกพับไว้
export async function startCollectFlow(replyToken, profile, collecting, lead = null) {
  const question = nextQuestion(collecting);

  // บอกมาครบตั้งแต่ประโยคแรก ไม่มีอะไรให้ถาม — ข้ามไปสรุปเลย
  if (!question) return finishCollect(replyToken, profile, collecting);

  await setState(profile.id, STATES.COLLECTING_JOB, {
    collect: { ...collecting, asking: question.id },
  });
  return reply(replyToken, askMessage(question, lead || `ได้เลยค่ะ 💜 ${collecting.itemName}`));
}

// เก็บข้อมูลครบแล้ว — ขึ้นการ์ดสรุปให้ตรวจ ยังไม่บันทึกจนกว่าจะกดยืนยัน
export async function finishCollect(replyToken, profile, collecting) {
  const draft = makeDraft({ ...toDraftInput(collecting), jobDate: todayISO() });
  await setState(profile.id, STATES.CONFIRMING_JOB, { draft });

  const working = draft.total > 0 ? toDraftInput(collecting).note : null;
  return reply(replyToken, [
    {
      type: 'text',
      text:
        'สรุปให้แล้วนะคะ 📋\n' +
        (working?.includes('คิดจาก') ? `${working.split('\n').find((l) => l.startsWith('คิดจาก'))}\n` : '') +
        'ข้อมูลถูกต้องไหมคะ? ถ้าถูกต้องกด "✅ บันทึกงาน" ได้เลยค่ะ 💜',
    },
    jobPreviewMessage(draftToBubble(draft)),
  ]);
}

// หนึ่งรอบของบทสนทนา: อ่านคำสั่ง → อ่านคำตอบ → ถามข้อถัดไปหรือสรุป
export async function handleCollectTurn(replyToken, profile, state, text) {
  const collect = state?.context?.collect;
  if (!collect) {
    await clearState(profile.id);
    return reply(replyToken, { type: 'text', text: 'เริ่มใหม่นะคะ พิมพ์งานมาได้เลยค่ะ 💜' });
  }

  const command = parseCollectCommand(text);

  if (command?.kind === 'cancel') {
    await clearState(profile.id);
    return reply(replyToken, { type: 'text', text: 'ยกเลิกให้แล้วค่ะ พิมพ์คุยกันได้เลยนะคะ 💜' });
  }

  if (command?.kind === 'restart') {
    const fresh = { ...collect, fields: {}, skipped: [], asking: null };
    const question = nextQuestion(fresh);
    await setState(profile.id, STATES.COLLECTING_JOB, { collect: { ...fresh, asking: question?.id || null } });
    return reply(replyToken, askMessage(question, `เริ่มใหม่ให้แล้วค่ะ 💜 ${collect.itemName}`));
  }

  // "ย้อนกลับ" / "แก้ขนาด" — ลืมค่าเดิมของช่องนั้นแล้วถามใหม่
  const target = command?.kind === 'back' ? previousSlot(collect) : command?.kind === 'ask' ? command.field : null;
  // "ย้อนกลับ" ทั้งที่ยังอยู่ข้อแรก — ไม่ใช่เรื่องไม่เข้าใจ บอกตรง ๆ แล้วถามต่อ
  if (command?.kind === 'back' && !target) {
    return reply(replyToken, askMessage(nextQuestion(collect), 'ยังเป็นข้อแรกอยู่ค่ะ ตอบข้อนี้ต่อได้เลยนะคะ 💜'));
  }
  if (target) {
    const reopened = forget(collect, target);
    const question = nextQuestion(reopened);
    await setState(profile.id, STATES.COLLECTING_JOB, { collect: { ...reopened, asking: question?.id || null } });
    return reply(replyToken, askMessage(question));
  }

  if (command?.kind === 'summary' || command?.kind === 'save') {
    return finishCollect(replyToken, profile, collect);
  }

  // คำตอบธรรมดา — อ่านทุกอย่างที่อยู่ในข้อความนี้
  const applied = command?.kind === 'answer'
    ? { state: { ...collect, fields: { ...collect.fields, [command.field]: command.value } }, filled: [command.field], changed: [] }
    : readTurn(collect, text);
  const next = applied.state;
  const question = nextQuestion(next);

  if (!question) return finishCollect(replyToken, profile, next);

  // เติม/แก้ช่องไหนก็ได้นับว่าเข้าใจ — ตอบข้ามช่อง (บอกชื่อลูกค้าตอนถูกถามขนาด)
  // ม่วงจดไว้จริง จะไปบอกว่า "ยังไม่เข้าใจ" ไม่ได้
  const understood = Boolean(applied.filled?.length || applied.changed?.length || question.id !== collect.asking);
  const misses = understood ? 0 : (collect.misses || 0) + 1;

  // ไม่เข้าใจสองรอบติด — พับชุดคำถาม อย่าขังร้านไว้กับคำถามเดิม (เคสจริง:
  // ร้านพิมพ์งานใหม่ใส่คำถามที่ค้างไว้ แล้วเจอข้อความเดิมซ้ำจนคิดว่าบอทพัง)
  if (!understood && misses >= 2) {
    await clearState(profile.id);
    return reply(replyToken, { type: 'text', text: RELEASE_REPLY });
  }

  await setState(profile.id, STATES.COLLECTING_JOB, { collect: { ...next, asking: question.id, misses } });

  // ไม่เข้าใจครั้งแรก — ถามย้ำเฉพาะจุดพร้อมปุ่มทางออก ไม่เริ่มใหม่ทั้งหมด
  if (!understood) {
    const message = askMessage(question, `ยังไม่เข้าใจตรงนี้ค่ะ 🤔 ${COLLECT_HELP}`);
    return reply(replyToken, { ...message, quickReply: { items: missButtons(collect, question) } });
  }

  const lead =
    acknowledge(next, applied.changed) ||
    (question.id === collect.asking ? acknowledgeFilled(next, applied.filled || []) : null);
  return reply(replyToken, askMessage(question, lead));
}
