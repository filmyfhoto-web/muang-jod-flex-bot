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
import { billReceiptFlex } from '../flex/billFlex.js';
import { recordBillPayment } from '../services/billService.js';
import { resolveMenuCommand, splitLeadingAddJob } from '../utils/menuCommands.js';
import { parseNaturalJob } from '../utils/nlParser.js';
import { deriveJobName } from '../utils/category.js';
import { makeDraft, draftToBubble, priceDraft, parseBarePrice } from '../utils/jobDraft.js';
import { extractDate } from '../utils/thaiDate.js';
import { handlePostback } from './postbackHandler.js';

const DEFAULT_REPLY =
  'สวัสดีค่ะ 💜 ม่วงจดพร้อมช่วยจดงานให้แล้วค่ะ\n' +
  'พิมพ์รายการงานมาได้เลย เช่น\nป้ายไวนิล 60x100 150 บาท\n' +
  'หรือคิดเป็นตารางเมตร\nไวนิล 160x300 ตรมละ 165\n' +
  'หรือกดเมนูด้านล่างนะคะ';

// Cheap, rule-based check: does this text look like a job entry (has an
// item with a price)? Used in the idle state so people can just type a job.
function looksLikeJob(text) {
  try {
    const d = parseNaturalJob(text);
    return d.items.length > 0 && d.total > 0;
  } catch {
    return false;
  }
}

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

// (job naming lives in utils/category.js — category label when recognised)

// `heard` is set when the message arrived as a voice note: the transcript is
// echoed back on the paths where the user cannot otherwise tell what the bot
// thought it heard.
export async function handleTextMessage(event, profile, { heard = null } = {}) {
  const { replyToken } = event;
  const text = event.message?.text || '';

  // Menu labels sent as plain text (e.g. a Rich Menu built in OA Manager with
  // "send message" actions, or a typed command) route exactly like postbacks.
  const menuAction = resolveMenuCommand(text);
  if (menuAction) {
    return handlePostback({ ...event, postback: { data: `action=${menuAction}` } }, profile);
  }

  // "งานวันนี้ ป้ายไวนิล 150 บาท" — command + details in one message.
  const leading = splitLeadingAddJob(text);
  if (leading) {
    return handleNewJob(replyToken, profile, leading.rest, heard);
  }

  const state = await getState(profile.id);
  const current = state?.state || STATES.IDLE;

  console.log(`[message] user=${profile.id} state=${current}`);

  // A bare number while a priceless draft is on screen is the price for it —
  // the answer to "ในเอกสารไม่มีราคา พิมพ์ราคามาได้เลย".
  if (current === STATES.CONFIRMING_JOB) {
    const priced = await handleDraftPrice(replyToken, profile, state, text);
    if (priced) return priced;
  }

  // While collecting a new job — or while previewing one — a text message is
  // (re)parsed into a fresh draft preview.
  if (current === STATES.WAITING_FOR_JOB || current === STATES.CONFIRMING_JOB) {
    return handleNewJob(replyToken, profile, text, heard);
  }

  if (current === STATES.WAITING_FOR_EDIT) {
    return handleEdit(replyToken, profile, state, text);
  }

  if (current === STATES.WAITING_FOR_PAYMENT) {
    return handlePaymentAmount(replyToken, profile, state, text);
  }

  if (current === STATES.WAITING_FOR_BILL_PAYMENT) {
    return handleBillPaymentAmount(replyToken, profile, state, text);
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

  // Idle: a message that already looks like a job goes straight to preview.
  if (looksLikeJob(text)) {
    return handleNewJob(replyToken, profile, text, heard);
  }

  // Idle: nudge toward the menu.
  return reply(replyToken, { type: 'text', text: heardLine(heard) + DEFAULT_REPLY });
}

// A draft with no price is what a photographed job sheet usually leaves —
// the paper says what to make, not what to charge. Answering it with a bare
// number fills the price in rather than starting the whole job over.
//
// Returns null when the message is anything else, so the normal re-parse runs.
async function handleDraftPrice(replyToken, profile, state, text) {
  const amount = parseBarePrice(text);
  const draft = state?.context?.draft;
  const priced = amount && draft ? priceDraft(draft, amount) : null;
  if (!priced) return null;

  await setState(profile.id, STATES.CONFIRMING_JOB, { ...state.context, draft: priced });

  return reply(replyToken, [
    { type: 'text', text: 'ใส่ราคาให้แล้วค่ะ ถ้าถูกต้องกด "✅ บันทึกงาน" ได้เลย 💜' },
    jobPreviewMessage(draftToBubble(priced)),
  ]);
}

// A voice note has to show its working: the user never sees the words the
// transcriber produced, so a wrong reading looks like a broken bot.
function heardLine(heard) {
  return heard ? `🎤 ได้ยินว่า “${heard}”\n\n` : '';
}

async function handleNewJob(replyToken, profile, text, heard = null) {
  // "10 กันยา ไก่ทอดน้ำปลา 278" — the date is lifted off the front first, both
  // to back-date the job and to keep "กันยา" out of the item name.
  const when = extractDate(text);

  // Natural-language understanding: customer, items, quantity, price, and any
  // amount already received — via the AI layer when configured, else rules.
  const parsed = await extractJobDraft(when.rest);

  if (!parsed.items.length) {
    return reply(replyToken, {
      type: 'text',
      text:
        heardLine(heard) +
        'ขออภัยค่ะ อ่านรายการไม่ออกเลย ลองพิมพ์แบบนี้นะคะ\n' +
        'ป้ายไวนิล 60x100 150 บาท\n' +
        'หรือ ไวนิล 160x300 ตรมละ 165 💜',
    });
  }

  // Parse only — do NOT save yet. Stash the draft in user_states.context and
  // show a preview with confirm / edit / cancel buttons.
  const draft = makeDraft({
    jobName: deriveJobName(parsed.items),
    customerName: parsed.customerName,
    jobDate: when.date || todayISO(),
    items: parsed.items,
    subtotal: parsed.subtotal,
    discount: parsed.discount || 0,
    total: parsed.total,
    paidAmount: parsed.paidAmount,
  });

  await setState(profile.id, STATES.CONFIRMING_JOB, { draft });

  return reply(replyToken, [
    {
      type: 'text',
      text: heardLine(heard) + 'ตรวจดูให้หน่อยนะคะ ถ้าถูกต้องกด "✅ บันทึกงาน" ได้เลยค่ะ 💜',
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

async function handleBillPaymentAmount(replyToken, profile, state, text) {
  const billId = state?.context?.billId;
  if (!billId) {
    await clearState(profile.id);
    return reply(replyToken, {
      type: 'text',
      text: 'ไม่พบบิลที่จะรับชำระค่ะ ลองกด "ออกบิล" ใหม่นะคะ',
    });
  }

  const check = safe(paymentAmountSchema, parsePrice(text));
  if (!check.ok) {
    return reply(replyToken, {
      type: 'text',
      text: `${check.error}\nพิมพ์จำนวนเงินเป็นตัวเลข เช่น 500 ค่ะ 💜`,
    });
  }

  const bill = await recordBillPayment(profile.id, billId, check.data);
  await clearState(profile.id);

  if (!bill) {
    return reply(replyToken, { type: 'text', text: 'ไม่พบบิลนี้ค่ะ' });
  }

  return reply(replyToken, [
    { type: 'text', text: 'บันทึกรับชำระแล้วค่ะ 💜' },
    billReceiptFlex(bill),
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
