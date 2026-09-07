import { reply } from '../services/lineService.js';
import { getState, setState, clearState, STATES } from '../services/stateService.js';
import { getJobById, updateJob, recordPayment, searchJobs } from '../services/jobService.js';
import { extractJobDraft } from '../services/nlpService.js';
import { round2, parsePrice } from '../utils/currency.js';
import { derivePaymentFields } from '../utils/payment.js';
import { todayISO } from '../utils/dates.js';
import { safe, paymentAmountSchema, searchQuerySchema } from '../utils/validation.js';
import { jobCardMessage, jobPreviewMessage } from '../flex/jobCard.js';
import { paymentConfirmationFlex } from '../flex/paymentFlex.js';
import { searchResultsFlex } from '../flex/searchResultsFlex.js';
import { resolveMenuCommand } from '../utils/menuCommands.js';
import { handlePostback } from './postbackHandler.js';

// Shape a draft (parsed, not-yet-saved) job into the object the flex bubble
// expects (job_name / job_date / items / total / payment_status).
function draftToBubble(draft) {
  return {
    job_name: draft.jobName,
    customer_name: draft.customerName || null,
    job_date: draft.jobDate,
    job_number: '',
    payment_status: draft.paymentStatus,
    total: draft.total,
    paid_amount: draft.paidAmount || 0,
    balance_due: draft.balanceDue || 0,
    items: draft.items,
    note: null,
  };
}

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

  // Menu labels sent as plain text (e.g. a Rich Menu built in OA Manager with
  // "send message" actions, or a typed command) route exactly like postbacks.
  const menuAction = resolveMenuCommand(text);
  if (menuAction) {
    return handlePostback({ ...event, postback: { data: `action=${menuAction}` } }, profile);
  }

  const state = await getState(profile.id);
  const current = state?.state || STATES.IDLE;

  console.log(`[message] user=${profile.id} state=${current}`);

  // While collecting a new job — or while previewing one — a text message is
  // (re)parsed into a fresh draft preview.
  if (current === STATES.WAITING_FOR_JOB || current === STATES.CONFIRMING_JOB) {
    return handleNewJob(replyToken, profile, text);
  }

  if (current === STATES.WAITING_FOR_EDIT) {
    return handleEdit(replyToken, profile, state, text);
  }

  if (current === STATES.WAITING_FOR_PAYMENT) {
    return handlePaymentAmount(replyToken, profile, state, text);
  }

  if (current === STATES.WAITING_FOR_SEARCH) {
    return handleSearch(replyToken, profile, text);
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
  // Natural-language understanding: customer, items, quantity, price, and any
  // amount already received — via the AI layer when configured, else rules.
  const parsed = await extractJobDraft(text);

  if (!parsed.items.length) {
    return reply(replyToken, {
      type: 'text',
      text: 'ขออภัยค่ะ อ่านรายการไม่ออกเลย ลองพิมพ์แบบนี้นะคะ\nป้ายไวนิล 60x100 150 บาท 💜',
    });
  }

  // Parse only — do NOT save yet. Stash the draft in user_states.context and
  // show a preview with confirm / edit / cancel buttons.
  const pay = derivePaymentFields(parsed.total, parsed.paidAmount);
  const draft = {
    jobName: deriveJobName(parsed.items),
    customerName: parsed.customerName || null,
    jobDate: todayISO(),
    items: parsed.items,
    subtotal: parsed.subtotal,
    discount: parsed.discount || 0,
    total: parsed.total,
    paidAmount: pay.paid_amount,
    balanceDue: pay.balance_due,
    paymentStatus: pay.payment_status,
  };

  await setState(profile.id, STATES.CONFIRMING_JOB, { draft });

  return reply(replyToken, [
    {
      type: 'text',
      text: 'ตรวจดูให้หน่อยนะคะ ถ้าถูกต้องกด "✅ บันทึกงาน" ได้เลยค่ะ 💜',
    },
    jobPreviewMessage(draftToBubble(draft)),
  ]);
}

async function handlePaymentAmount(replyToken, profile, state, text) {
  const jobId = state?.context?.jobId;
  if (!jobId) {
    await clearState(profile.id);
    return reply(replyToken, {
      type: 'text',
      text: 'ไม่พบงานที่จะบันทึกรับเงินค่ะ ลองกด "บันทึกรับเงิน" ใหม่นะคะ',
    });
  }

  const amount = parsePrice(text);
  const check = safe(paymentAmountSchema, amount);
  if (!check.ok) {
    return reply(replyToken, {
      type: 'text',
      text: `${check.error}\nพิมพ์จำนวนเงินเป็นตัวเลข เช่น 500 ค่ะ 💜`,
    });
  }

  const job = await recordPayment(profile.id, jobId, check.data);
  await clearState(profile.id);

  if (!job) {
    return reply(replyToken, { type: 'text', text: 'ไม่พบงานนี้ค่ะ' });
  }

  return reply(replyToken, [
    { type: 'text', text: 'บันทึกรับเงินแล้วค่ะ 💜' },
    paymentConfirmationFlex(job),
  ]);
}

async function handleSearch(replyToken, profile, text) {
  const check = safe(searchQuerySchema, text);
  if (!check.ok) {
    return reply(replyToken, { type: 'text', text: check.error });
  }
  const jobs = await searchJobs(profile.id, check.data, { limit: 10 });
  await clearState(profile.id);
  return reply(replyToken, searchResultsFlex(jobs, check.data));
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

  // Keep money fields consistent so "ค้างรับ" stays accurate after an edit:
  // editing the price recalculates the balance from what's already paid, and
  // marking a job "paid" settles the balance to zero.
  const current = await getJobById(profile.id, jobId);
  if (current) {
    if (patch.total !== undefined) {
      Object.assign(patch, derivePaymentFields(patch.total, current.paid_amount));
    } else if (patch.payment_status === 'paid') {
      patch.paid_amount = round2(current.total);
      patch.balance_due = 0;
    }
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
