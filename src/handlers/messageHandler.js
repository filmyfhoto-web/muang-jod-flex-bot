import { reply } from '../services/lineService.js';
import { getState, clearState, STATES } from '../services/stateService.js';
import { createJob, getJobById, updateJob } from '../services/jobService.js';
import { parseJobText } from '../utils/parser.js';
import { round2, parsePrice } from '../utils/currency.js';
import { jobCardMessage } from '../flex/jobCard.js';

const DEFAULT_REPLY =
  'สวัสดีค่ะ 💜 ม่วงจดพร้อมช่วยจดงานให้แล้วค่ะ\nกดเมนูด้านล่างเพื่อเริ่มใช้งานได้เลยนะคะ';

// Map Thai payment keywords to status values.
function parsePaymentStatus(value) {
  const v = value.toLowerCase();
  if (/(จ่ายแล้ว|ชำระแล้ว|รับแล้ว|paid|จ่ายครบ)/.test(v)) return 'paid';
  if (/(บางส่วน|partial|มัดจำ)/.test(v)) return 'partial';
  if (/(ค้าง|ยังไม่|pending)/.test(v)) return 'pending';
  return null;
}

// Parse "key: value" lines from an edit message into a job patch.
function parseEditPatch(text) {
  const patch = {};
  const lines = String(text).split('\n');
  for (const raw of lines) {
    const line = raw.replace(/^[•\-\s]+/, '').trim();
    const idx = line.search(/[:：]/);
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (!value) continue;

    if (/(ชื่องาน|ชื่อ|งาน)/.test(key)) patch.job_name = value;
    else if (/(ลูกค้า|customer)/.test(key)) patch.customer_name = value;
    else if (/(สถานะ|ชำระ|payment)/.test(key)) {
      const status = parsePaymentStatus(value);
      if (status) patch.payment_status = status;
    } else if (/(ราคา|ยอด|total|price)/.test(key)) {
      patch.total = round2(parsePrice(value));
    } else if (/(หมายเหตุ|note|โน้ต)/.test(key)) {
      patch.note = value;
    }
  }
  return patch;
}

function deriveJobName(items) {
  if (!items.length) return null;
  if (items.length === 1) return items[0].item_name;
  return `${items[0].item_name} +${items.length - 1} รายการ`;
}

export async function handleTextMessage(event, profile) {
  const { replyToken } = event;
  const text = event.message?.text || '';
  const state = await getState(profile.id);
  const current = state?.state || STATES.IDLE;

  console.log(`[message] user=${profile.id} state=${current}`);

  if (current === STATES.WAITING_FOR_JOB) {
    return handleNewJob(replyToken, profile, text);
  }

  if (current === STATES.WAITING_FOR_EDIT) {
    return handleEdit(replyToken, profile, state, text);
  }

  if (current === STATES.WAITING_FOR_EVIDENCE) {
    return reply(replyToken, {
      type: 'text',
      text: 'กำลังรอรูปสลิป/หลักฐานอยู่ค่ะ ส่งรูปมาได้เลยนะคะ 📎',
    });
  }

  // Idle: nudge toward the menu.
  return reply(replyToken, { type: 'text', text: DEFAULT_REPLY });
}

async function handleNewJob(replyToken, profile, text) {
  const parsed = parseJobText(text);

  if (!parsed.items.length) {
    return reply(replyToken, {
      type: 'text',
      text: 'ขออภัยค่ะ อ่านรายการไม่ออกเลย ลองพิมพ์แบบนี้นะคะ\nป้ายไวนิล 60x100 150 บาท 💜',
    });
  }

  const job = await createJob(profile.id, {
    jobName: deriveJobName(parsed.items),
    items: parsed.items,
    subtotal: parsed.subtotal,
    discount: parsed.discount,
    total: parsed.total,
    paymentStatus: 'pending',
  });

  await clearState(profile.id);

  return reply(replyToken, [
    { type: 'text', text: 'บันทึกให้แล้วค่ะ 💜' },
    jobCardMessage(job, 'บันทึกงานเรียบร้อย'),
  ]);
}

async function handleEdit(replyToken, profile, state, text) {
  const jobId = state?.context?.jobId;
  if (!jobId) {
    await clearState(profile.id);
    return reply(replyToken, {
      type: 'text',
      text: 'ไม่พบงานที่จะแก้ไขค่ะ ลองกด "แก้ไขล่าสุด" อีกครั้งนะคะ',
    });
  }

  const patch = parseEditPatch(text);
  if (!Object.keys(patch).length) {
    return reply(replyToken, {
      type: 'text',
      text: 'ยังไม่เข้าใจสิ่งที่จะแก้ค่ะ ลองพิมพ์เช่น\nสถานะ: จ่ายแล้ว 💜',
    });
  }

  const updated = await updateJob(profile.id, jobId, patch);
  await clearState(profile.id);

  if (!updated) {
    return reply(replyToken, { type: 'text', text: 'ไม่พบงานนี้ค่ะ' });
  }

  const full = await getJobById(profile.id, jobId);
  return reply(replyToken, [
    { type: 'text', text: 'แก้ไขให้แล้วค่ะ 💜' },
    jobCardMessage(full || updated, 'แก้ไขงานเรียบร้อย'),
  ]);
}
