import { reply } from '../services/lineService.js';
import { getState, setState, clearState, STATES } from '../services/stateService.js';
import { getJobById, updateJob, recordPayment, searchJobs, getRecentCustomerNames } from '../services/jobService.js';
import { withDraftGuide } from '../flex/draftGuide.js';
import { extractJobDraft } from '../services/nlpService.js';
import { round2, numText, parsePrice } from '../utils/currency.js';
import { derivePaymentFields } from '../utils/payment.js';
import { todayISO } from '../utils/dates.js';
import { safe, paymentAmountSchema, searchQuerySchema } from '../utils/validation.js';
import { jobCardMessage, jobPreviewMessage } from '../flex/jobCard.js';
import { paymentConfirmationFlex } from '../flex/paymentFlex.js';
import { searchResultsFlex } from '../flex/searchResultsFlex.js';
import { billReceiptFlex } from '../flex/billFlex.js';
import { recordBillPayment } from '../services/billService.js';
import { resolveMenuCommand, splitLeadingAddJob, suggestMenuCommand, labelForAction } from '../utils/menuCommands.js';
import { matchCustomer } from '../utils/customerMatch.js';
import { parseChatIntent } from '../utils/chatIntent.js';
import { parseNaturalJob } from '../utils/nlParser.js';
import { deriveJobName, classifyJob } from '../utils/category.js';
import { makeDraft, draftToBubble, priceDraft, parseBarePrice, parseBareSqmRate, priceDraftBySqm, parseCustomerName } from '../utils/jobDraft.js';
import { extractDate, extractDueDate } from '../utils/thaiDate.js';
import { startCollecting } from '../utils/slots.js';
import { startCollectFlow, handleCollectTurn } from '../services/collectFlow.js';
import { splitDump, looksLikeDump } from '../utils/dumpSplit.js';
import { renameShopQr } from '../services/shopService.js';
import { DEFAULT_BRANCHES, matchBranchStrict, stripBranch, parseBranchView, parseMoveCommand, TODAY_QUESTION } from '../utils/branch.js';
import { branchView } from '../actions/branchView.js';
import { moveJob } from '../actions/moveJob.js';
import { logger } from '../services/logger.js';
import { dumpPreviewFlex } from '../flex/dumpFlex.js';
import { handlePostback } from './postbackHandler.js';
import { parseAddCategory } from '../utils/categoryCommands.js';
import { parseExpense } from '../utils/expense.js';
import { confirmExpense } from '../actions/expense.js';
import { parseStatusSpeak } from '../utils/statusSpeak.js';
import { statusBySpeech } from '../actions/statusSpeak.js';
import { parseQuickEdit } from '../utils/quickEdit.js';
import { quickEditAsk } from '../actions/quickEdit.js';
import { addCategoryFromChat } from '../actions/manageCategories.js';

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

// ระหว่างรอ/ยืนยันงาน ข้อความแบบไหนถึงนับว่าเป็น "รายการงาน"
//
// งานที่ยังไม่มีราคาก็เป็นงาน (ใบสั่งงานที่ถ่ายมามักไม่มีราคา แล้วค่อยพิมพ์
// ราคาตามทีหลัง) looksLikeJob จึงหลวมไปไม่ได้ แต่ก็แน่นไปไม่ได้เช่นกัน —
// สิ่งที่ทุกงานมีเหมือนกันคือตัวเลข ไม่ราคาก็ขนาดหรือจำนวน ประโยคที่ไม่มีเลข
// สักตัวไม่ใช่การจดงาน มันคือการพูดกับม่วง
const HAS_NUMBER = /[\d๐-๙]/;
export function isJobEntry(text) {
  return looksLikeJob(text) || HAS_NUMBER.test(String(text ?? ''));
}

/* ข้อความนี้เป็น "งานใหม่ทั้งใบ" หรือเป็นคำตอบของคำถามที่ม่วงถามค้างไว้
 *
 * ร้านพิมพ์งานใหม่เข้ามาตอนที่ม่วงกำลังถามรายละเอียดงานเก่าอยู่ ของเดิมข้อความ
 * นั้นถูกอ่านเป็นคำตอบ งานใหม่เลยกลายเป็นการ "แก้" งานเก่า — ร้านเห็นม่วงตอบ
 * ว่า "แก้ขนาดเป็น 0.6 × 1.6 และจำนวนเป็น 1 ผืน และชื่อลูกค้าเป็นน้องป่านแล้วค่ะ"
 * ทั้งที่เพิ่งสั่งงานใหม่ ต้องพิมพ์ "ยกเลิก" ก่อนถึงจะจดงานใหม่ได้
 *
 * เส้นแบ่ง: คำตอบข้อเดียวไม่เคยมีทั้งชื่อของ ราคา และอย่างอื่นอีกสองอย่างพร้อมกัน
 * "200 บาท" "0.6*1.6" "2 ผืน" ตอบคำถามได้ข้อเดียว ส่วน "งานไวนิล สีดำน้องป่าน
 * ขนาด 0.6*1.6 1 ผืน 200 บาท" เป็นใบสั่งงานทั้งใบ
 */
export function isWholeNewJob(text) {
  try {
    const d = parseNaturalJob(text);
    if (!(d.total > 0) || !d.items.length || !classifyJob(d.items)) return false;
    const [it] = d.items;
    const marks = [it.size, it.unit, d.customerName, Number(it.quantity) > 1].filter(Boolean);
    return marks.length >= 2;
  } catch {
    return false;
  }
}

// งานที่ยังไม่ได้ตั้งราคาก็เป็นงาน — ร้านรับออเดอร์เข้ามาก่อน แล้วค่อยคิดราคา
// ทีหลัง "ตรายาง ของโรงเรียนเปียงซ้อ 1 อัน" คือใบสั่งงาน ไม่ใช่การทักทาย
//
// แต่ตอนที่ยังไม่ได้สั่งอะไร จะเหมาเอาทุกประโยคเป็นงานไม่ได้ ต้องมีครบสองอย่าง:
// ชื่อของที่ระบบรู้ว่าเป็นงานประเภทไหน (ตรายาง ไวนิล กรอบรูป …) กับตัวเลขสักตัว
// (จำนวนหรือขนาด) — "ตรายางอันละเท่าไหร่" มีอย่างแรกแต่ไม่มีอย่างหลัง จึงยังเป็น
// คำถาม ไม่ใช่งาน
export function looksLikePricelessJob(text) {
  try {
    const d = parseNaturalJob(text);
    return d.items.length > 0 && Boolean(classifyJob(d.items)) && HAS_NUMBER.test(String(text ?? ''));
  } catch {
    return false;
  }
}

// ทางออกที่พิมพ์ได้ ไม่ใช่แค่ปุ่มบนการ์ด — การ์ดเลื่อนหายไปจากจอได้ แล้วร้าน
// ก็ติดอยู่ในโหมดจดงานโดยไม่มีอะไรให้กด
export const QUIT_WORDS = /^(?:ยกเลิก|ไม่เอา(?:แล้ว)?|เลิก|ออก|หยุด|พอ(?:แล้ว)?|ปิด)\s*(?:ค่ะ|คะ|ครับ|จ้า|จ้ะ|นะ|น๊า)*$/i;

const DRAFT_WAITING_REPLY =
  'ยังมีร่างงานค้างอยู่นะคะ 📋\n' +
  'กด ✅ บันทึกงาน หรือ ❌ ยกเลิก บนการ์ดด้านบนก่อนนะคะ\n' +
  'หรือพิมพ์ว่า "ยกเลิก" ก็ได้ค่ะ แล้วค่อยคุยกันต่อ 💜';

// คนละสถานการณ์กับข้างบน: ตรงนี้ยังไม่มีร่าง ม่วงแค่รอให้พิมพ์งานมา
const WAITING_JOB_REPLY =
  'ยังไม่เห็นตัวเลขเลยค่ะ 🤔 พิมพ์ราคาหรือขนาดมาด้วยนะคะ เช่น\n' +
  'ป้ายไวนิล 60x100 150 บาท\n' +
  'ถ้าไม่จดแล้ว พิมพ์ว่า "ยกเลิก" ได้เลยค่ะ 💜';

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

export async function handleTextMessage(event, profile) {
  const { replyToken } = event;
  const text = event.message?.text || '';

  // Menu labels sent as plain text (e.g. a Rich Menu built in OA Manager with
  // "send message" actions, or a typed command) route exactly like postbacks.
  const menuAction = resolveMenuCommand(text);
  if (menuAction) {
    return handlePostback({ ...event, postback: { data: `action=${menuAction}` } }, profile);
  }

  // "เพิ่มหมวด 🥤 แก้วสกรีน" — เพิ่มหมวดงานใหม่ของร้านจากแชตได้เลย
  const newCategory = parseAddCategory(text);
  if (newCategory) return addCategoryFromChat({ replyToken, profile }, newCategory);

  // "ซื้อกระดาษ A4 350" — รายจ่ายของร้าน การ์ดสั้น ๆ ให้ยืนยันก่อนบันทึก
  // (มาก่อนการอ่านเป็นงาน: "ซื้อ..." ไม่ใช่งานของลูกค้า)
  const expense = parseExpense(text);
  if (expense) return confirmExpense({ replyToken, profile }, expense);

  // "งานครูแอนเสร็จแล้ว" — เปลี่ยนสถานะงานด้วยชื่อ หลายใบให้เลือกก่อน
  const spoken = parseStatusSpeak(text);
  if (spoken) return statusBySpeech({ replyToken, profile }, spoken);

  // "แก้ราคาเป็น 650" — แก้ใบล่าสุด มีการ์ดยืนยันก่อนเสมอ (เรื่องเงินไม่เดา)
  const quick = parseQuickEdit(text);
  if (quick) return quickEditAsk({ replyToken, profile }, quick);

  // "งานวันนี้ ป้ายไวนิล 150 บาท" — command + details in one message.
  const leading = splitLeadingAddJob(text);
  if (leading) {
    return handleNewJob(replyToken, profile, leading.rest);
  }

  /* "ดูงานนัฐภรณ์ ปริ้นงาน" / "ดูงานเชียงกลาง" / "ดูงานทั้งสองร้าน"
   *
   * เจ้าของมีสองร้านและสั่งไว้ว่าถามถึงร้านไหนให้ตอบเฉพาะร้านนั้น — จับก่อน
   * เข้าสเตต เพราะเป็นคำสั่งอ่านอย่างเดียว ควรตอบได้เสมอเหมือนปุ่มเมนู
   */
  const branchAsk = parseBranchView(text, DEFAULT_BRANCHES);
  if (branchAsk) {
    return branchView({ replyToken, profile }, branchAsk.all ? null : branchAsk);
  }

  // "วันนี้มีงานอะไรบ้าง" → สรุปแยกสองร้าน ตามที่เจ้าของสั่งไว้คำต่อคำ
  // มีตัวเลข = กำลังจดงาน ("วันนี้มีงาน ป้ายไวนิล 150") ไม่ใช่คำถาม
  if (TODAY_QUESTION.test(text) && !HAS_NUMBER.test(text)) {
    return branchView({ replyToken, profile }, null);
  }

  // "ย้าย MJ-SGN-0001 ไปร้านเชียงกลาง" — งานเก่า/งานลงผิดร้าน ย้ายจากแชตได้เลย
  const move = parseMoveCommand(text, DEFAULT_BRANCHES);
  if (move) {
    return moveJob({ replyToken, profile }, move);
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
  //
  // แต่ไม่ใช่ทุกข้อความ ของเดิมอ่านทุกอย่างที่พิมพ์มาเป็นงานใหม่ ร้านจึงพูดกับ
  // ม่วงไม่ได้เลยสักคำจนกว่าจะกด ✅ หรือ ❌ — ถามอะไรไปก็ได้ร่าง ฿0 กลับมา
  // แล้วร่างใหม่นั้นก็ค้างสถานะไว้ต่อ วนไม่จบ
  if (current === STATES.WAITING_FOR_JOB || current === STATES.CONFIRMING_JOB) {
    if (isJobEntry(text)) {
      return handleNewJob(replyToken, profile, text, state?.context?.customerName || null);
    }
    if (QUIT_WORDS.test(text.trim())) {
      await clearState(profile.id);
      return reply(replyToken, { type: 'text', text: 'ยกเลิกให้แล้วค่ะ พิมพ์คุยกันได้เลยนะคะ 💜' });
    }
    // มีร่างอยู่บนจอ กับกำลังรอให้พิมพ์งาน เป็นคนละเรื่อง บอกให้ตรงกับที่เห็น
    const hasDraft = current === STATES.CONFIRMING_JOB && Boolean(state?.context?.draft);

    /* ร่างที่ยังไม่มีชื่อลูกค้า — ม่วงเพิ่งถามว่า "ของใคร" ข้อความสั้น ๆ
     * ที่ไม่มีตัวเลขตรงนี้คือคำตอบ ไม่ใช่การคุยเล่น ใส่ชื่อแล้วขึ้นการ์ดใหม่
     */
    if (hasDraft && !state.context.draft.customerName) {
      const typed = parseCustomerName(text);
      if (typed) {
        /* ชื่อที่พิมพ์ไปพ้องกับชื่อที่เคยจดไว้ไหม — ร้านขอ "พิมพ์ลูกค้าคนไหนที่เคย
         * จดไว้ แสดงให้อัตโนมัติ จะได้ไม่ต้องพิมพ์"
         *
         *   สะกดต่างแต่เจ้าเดียวกัน ("รร สบกอน" = "รร.สบกอน") → ใช้สะกดที่เคยจด
         *     สมุดลูกค้ารวมเจ้าด้วยชื่อ สะกดใหม่ทุกใบคือบัญชีใหม่ทุกใบ
         *   พิมพ์มาแค่บางส่วน ("สบกอน")                       → ใช้ตามที่พิมพ์ แต่มีปุ่ม
         *     ชื่อเต็มให้กดเปลี่ยน ไม่เดาแทน เพราะ "สบกอน" อาจเป็นลูกค้าใหม่จริง ๆ
         */
        const known = await getRecentCustomerNames(profile.id, 30).catch(() => []);
        const hit = matchCustomer(typed, known);
        const name = hit?.kind === 'exact' ? hit.name : typed;
        const matchNote = hit?.kind === 'exact' && hit.name !== typed ? ' (ชื่อที่เคยจดไว้ค่ะ)' : '';

        const draft = { ...state.context.draft, customerName: name };
        await setState(profile.id, STATES.CONFIRMING_JOB, { ...state.context, draft });
        const msgs = withDraftGuide(
          [
            { type: 'text', text: `ลงชื่อลูกค้า "${name}"${matchNote} ให้แล้วค่ะ 💜 ครบแล้วกด "✅ บันทึกงาน" ได้เลยนะคะ` },
            jobPreviewMessage(draftToBubble(draft)),
          ],
          draft
        );
        // ปุ่มชื่อเต็มที่เคยจดไว้ — กดแล้วเปลี่ยนสะกดให้ ไม่ต้องพิมพ์ใหม่
        if (hit?.kind === 'partial') {
          const last = msgs[msgs.length - 1];
          if (!last.quickReply) {
            last.quickReply = {
              items: hit.names.slice(0, 3).map((n) => ({
                type: 'action',
                action: {
                  type: 'postback',
                  label: `ใช้ "${n}"`.slice(0, 20),
                  data: `action=draft_customer&name=${encodeURIComponent(n)}`,
                  displayText: `ลูกค้า "${n}"`,
                },
              })),
            };
          }
        }
        return reply(replyToken, msgs);
      }
    }
    return reply(replyToken, { type: 'text', text: hasDraft ? DRAFT_WAITING_REPLY : WAITING_JOB_REPLY });
  }

  // กำลังถามรายละเอียดทีละข้ออยู่
  if (current === STATES.COLLECTING_JOB) {
    // พิมพ์งานใหม่ทั้งใบเข้ามากลางคัน = จดงานใหม่ ไม่ใช่ตอบคำถามงานเก่า
    if (isWholeNewJob(text)) return handleNewJob(replyToken, profile, text);
    return handleCollectTurn(replyToken, profile, state, text);
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

  /* เพิ่งเก็บรูป QR แล้วม่วงถามว่าใบนี้ของธนาคารอะไร
   *
   * คำตอบสั้น ๆ คำเดียว ("กสิกร") ซึ่งถ้าปล่อยผ่านไปจะถูกอ่านเป็นการจดงาน
   * จึงต้องรับตรงนี้ก่อนทางอื่น
   */
  if (current === STATES.WAITING_FOR_QR_LABEL && state?.context?.qrId) {
    const answer = String(text || '').trim();
    const skipped = /^(ข้าม|ไม่|ไม่เอา|-|ไม่ต้อง)$/i.test(answer);
    await clearState(profile.id);
    if (!skipped && answer) {
      try {
        await renameShopQr(profile.id, state.context.qrId, answer);
      } catch (err) {
        logger.warn('shop.qr_rename_failed', { message: err?.message });
      }
    }
    return reply(replyToken, {
      type: 'text',
      text:
        (skipped || !answer ? 'ได้ค่ะ ไม่ตั้งชื่อก็ได้' : `ตั้งชื่อว่า "${answer}" แล้วค่ะ`) +
        ' 💜\nพิมพ์ "QR" เพื่อดูและเลือกใบที่จะใช้ · "เพิ่ม QR" เพื่อเก็บใบใหม่',
    });
  }

  /* Idle: จดรวดเดียวทั้งวัน — หลายบรรทัด หลายลูกค้า
   *
   * ร้านบอกว่า "คิดได้ก็ใส่ บางทีไม่มีเวลามานั่งใส่เป็นหมวด ๆ" ของเดิมข้อความ
   * หลายบรรทัดถูกอ่านเป็นงานเดียวที่มีหลายรายการ ลูกค้าสี่คนจึงกลายเป็นบิลใบ
   * เดียวของคนแรก ส่วนชื่ออีกสามคนถูกยัดไปเป็นชื่อสินค้า
   *
   * ต้องมาก่อนทางของงานเดี่ยว ไม่งั้น looksLikeJob คว้าไปก่อนทุกครั้ง
   */
  if (looksLikeDump(text)) {
    return handleDump(replyToken, profile, text);
  }

  // Idle: a message that already looks like a job goes straight to preview —
  // ไม่ว่าจะใส่ราคามาแล้วหรือยัง
  if (looksLikeJob(text) || looksLikePricelessJob(text)) {
    return handleNewJob(replyToken, profile, text);
  }

  // Idle: "มีงานกรอบรูป" — รู้ว่าเป็นงานอะไรแต่ยังไม่มีรายละเอียดสักอย่าง
  // ถามเก็บทีละข้อ แทนที่จะตอบกลับไปว่าพิมพ์ใหม่ให้ครบ
  const collecting = startCollecting(text);
  if (collecting) return startCollectFlow(replyToken, profile, collecting);

  // Idle: spoken to rather than commanded — "ม่วง จดงานให้หน่อย", or a
  // customer named before the work arrives. Answer it like a person would.
  const intent = parseChatIntent(text);
  if (intent) return handleChatIntent(replyToken, profile, intent);

  /* ยังไม่เข้าใจ — แต่ถ้าเดาได้ว่าใกล้เคียงคำสั่งไหน ให้ถามกลับด้วยปุ่ม
   *
   * ร้านพิมพ์ "ดูงานค้างหน่อย" แล้วได้คำทักทายกลับไปสองรอบ พร้อมบอกว่า "อยากให้
   * บอทตอบได้ในสิ่งที่เราถาม" — คำทักทายที่ไม่เกี่ยวกับสิ่งที่ถามเลยคือคำตอบ
   * ที่แย่ที่สุดที่ตอบได้ เพราะมันไม่ได้บอกด้วยซ้ำว่าม่วงไม่เข้าใจ
   *
   * เสนอเป็นปุ่ม ไม่ใช่ทำให้เลย เพราะการเดาจากคำที่อยู่กลางประโยคหลวมเกินกว่า
   * จะลงมือเอง — กดครั้งเดียวก็ได้คำตอบ และร้านเห็นว่าม่วงเข้าใจว่าอะไร
   */
  const guess = suggestMenuCommand(text);
  const guessLabel = guess && labelForAction(guess);
  if (guessLabel) {
    return reply(replyToken, {
      type: 'text',
      text: `ยังไม่แน่ใจว่าหมายถึงอะไรค่ะ 🤔\nหมายถึง "${guessLabel}" ไหมคะ?`,
      quickReply: {
        items: [{ type: 'action', action: { type: 'message', label: guessLabel.slice(0, 20), text: guessLabel } }],
      },
    });
  }

  // Idle: nudge toward the menu.
  return reply(replyToken, { type: 'text', text: DEFAULT_REPLY });
}

// Answer a sentence the way a person would: say what was heard, then ask for
// exactly the one thing still missing.
//
// The name is put in the state rather than in a reply the shop has to repeat —
// "ม่วงก็เตรียมชื่อไว้". The next message is the work, and it gets filed under
// that name without the name being typed again.
async function handleChatIntent(replyToken, profile, intent) {
  if (intent.kind === 'start_job') {
    await setState(profile.id, STATES.WAITING_FOR_JOB, {});
    return reply(replyToken, {
      type: 'text',
      text:
        'ได้เลยค่ะ 💜 ม่วงจดพร้อมแล้วนะคะ\n' +
        'พิมพ์งานมาได้เลย เช่น "ป้ายไวนิล 60x100 150 บาท"\n' +
        'หรือบอกชื่อลูกค้าก่อนก็ได้ค่ะ เช่น "ชื่อลูกค้า ผู้ใหญ่สมศรี"',
    });
  }

  const { customerName, rest } = intent;

  // The name and the work arrived together — no reason to ask for the work.
  if (rest) return handleNewJob(replyToken, profile, rest, customerName);

  await setState(profile.id, STATES.WAITING_FOR_JOB, { customerName });
  return reply(replyToken, {
    type: 'text',
    text:
      `จำไว้แล้วค่ะ ลูกค้า: ${customerName} 💜\n` +
      'งานของเขาคืออะไรคะ พิมพ์มาได้เลย ไม่ต้องพิมพ์ชื่อซ้ำนะคะ',
  });
}

// A draft with no price is what a photographed job sheet usually leaves —
// the paper says what to make, not what to charge. Answering it with a bare
// number fills the price in rather than starting the whole job over.
//
// Returns null when the message is anything else, so the normal re-parse runs.
async function handleDraftPrice(replyToken, profile, state, text) {
  const draft = state?.context?.draft;
  if (!draft) return null;

  /* "ตรมละ 350" — ใบที่มีหลายบอร์ดหลายขนาด ตอบเรตเดียวแล้วม่วงไล่คิดให้
   * ทีละบอร์ดตามขนาดของมัน ร้านขอไว้ตรง ๆ: "ไล่บอร์ด 1-2-3-4 มาเลย
   * ขนาดเท่านี้ ตรมละเท่านี้ กี่บาท"
   *
   * ต้องมาก่อนทางราคาเหมา เพราะ "ตรมละ 350" ก็มีตัวเลขเหมือนกัน
   */
  const rate = parseBareSqmRate(text);
  const bySqm = rate ? priceDraftBySqm(draft, rate) : null;
  if (bySqm) {
    await setState(profile.id, STATES.CONFIRMING_JOB, { ...state.context, draft: bySqm.draft });
    const names = !bySqm.draft.customerName ? await getRecentCustomerNames(profile.id) : [];
    return reply(
      replyToken,
      withDraftGuide(
        [
          {
            type: 'text',
            text:
              `คิดตารางเมตรละ ${numText(bySqm.rate)} ให้แล้วค่ะ 💜\n` +
              bySqm.lines.join('\n') +
              `\nรวมทั้งใบ ${numText(bySqm.draft.total)} บาท\n` +
              'ถูกต้องกด "✅ บันทึกงาน" ได้เลยนะคะ',
          },
          jobPreviewMessage(draftToBubble(bySqm.draft)),
        ],
        bySqm.draft,
        names
      )
    );
  }

  const amount = parseBarePrice(text);
  const priced = amount ? priceDraft(draft, amount) : null;
  if (!priced) return null;

  await setState(profile.id, STATES.CONFIRMING_JOB, { ...state.context, draft: priced });

  return reply(replyToken, [
    { type: 'text', text: 'ใส่ราคาให้แล้วค่ะ ถ้าถูกต้องกด "✅ บันทึกงาน" ได้เลย 💜' },
    jobPreviewMessage(draftToBubble(priced)),
  ]);
}

// `knownCustomer` is set after "➕ เพิ่มงานอีก": the shop typed the name once
// and should not have to type it again for every job in the same visit. What
// the message itself says still wins — they may have moved on to someone else.
/* จดรวดเดียวทั้งวัน → แยกเป็นงาน ๆ แล้วขึ้นการ์ดให้ตรวจ
 *
 * ยังไม่บันทึกอะไรทั้งนั้น เพราะสิ่งที่ผิดได้คือการจับคู่ "ใครสั่งอะไร" ซึ่ง
 * ต้องให้ร้านมองด้วยตาก่อน แยกผิดคนแปลว่าออกใบเสร็จผิดคน
 */
async function handleDump(replyToken, profile, text) {
  const { jobs, total } = splitDump(text);

  /* ลูกค้าคนเดียวที่จดมาหลายบรรทัด ไม่ใช่ "หลายงาน" — ร้านบอกว่า "งานนี้ชื่อ
   * เดียวกัน ... แต่รับพร้อมกัน" ใบเสร็จจึงควรเป็นใบเดียว ไปทางการ์ดสรุปเดิม
   * ซึ่งมีปุ่มแก้ไขครบ
   *
   * แต่ต้องใช้ผลที่อ่านทีละบรรทัดมาแทน เพราะตัวอ่านหลายบรรทัดกลืนจำนวนไปอยู่ใน
   * ชื่อของ: "สติ๊กเกอร์ 50 ดวง ดวงละ 5" คิดได้ ฿5 แทนที่จะเป็น ฿250
   */
  if (jobs.length === 1) {
    const only = jobs[0];
    return handleNewJob(replyToken, profile, text, null, {
      customerName: only.customerName,
      jobName: only.jobName,
      items: only.items,
      subtotal: only.subtotal,
      discount: only.discount || 0,
      total: only.total,
      paidAmount: only.paidAmount || 0,
      statedTotal: only.discount ? only.total : null,
    });
  }

  const jobDate = todayISO();

  await setState(profile.id, STATES.CONFIRMING_DUMP, { dump: jobs, jobDate });

  return reply(replyToken, [
    {
      type: 'text',
      text:
        `อ่านให้แล้วค่ะ แยกได้ ${jobs.length} งาน 💜\n` +
        'ดูการ์ดข้างล่างว่าแยกถูกคนไหมคะ ถ้าถูกกด "บันทึกทั้งหมด" ได้เลย',
    },
    dumpPreviewFlex(jobs, total),
  ]);
}

async function handleNewJob(replyToken, profile, text, knownCustomer = null, parsedOverride = null) {
  /* ร้านไหน — จับเฉพาะที่พูดถึงร้านแบบตั้งใจ ("นัฐภรณ์ ปริ้นงาน …", "ลงร้าน
   * เชียงกลาง …") แล้วตัดชื่อร้านออกก่อนอ่านงาน ไม่งั้นชื่อร้านถูกอ่านเป็นชื่อ
   * ลูกค้า ใบเสร็จออกในนามร้านตัวเอง
   *
   * ไม่ได้บอกร้านมา ไม่เป็นไร — ตอนกด ✅ บันทึก ม่วงจะถามว่า "งานนี้ลงร้านไหน
   * ดีคะ" เอง การเดาจากคำหลวม ๆ ("ปริ้นงานเอกสาร 100 แผ่น" คืองานปริ้น ไม่ใช่
   * ร้านปริ้นงาน) คือทางที่งานลงผิดร้านเงียบ ๆ
   */
  const branch = matchBranchStrict(text, DEFAULT_BRANCHES);
  if (branch) text = stripBranch(text, branch, DEFAULT_BRANCHES);

  // Two different dates can be in one message and they mean opposite things.
  // The pickup date is the one wearing a label ("นัดรับ 15 ก.ย."), so it comes
  // off first; whatever bare date is left is when the job is being recorded.
  const due = extractDueDate(text);
  const when = extractDate(due.rest);

  // Natural-language understanding: customer, items, quantity, price, and any
  // amount already received — via the AI layer when configured, else rules.
  const parsed = parsedOverride || (await extractJobDraft(when.rest));

  if (!parsed.items.length) {
    return reply(replyToken, {
      type: 'text',
      text:
        'ขออภัยค่ะ อ่านรายการไม่ออกเลย ลองพิมพ์แบบนี้นะคะ\n' +
        'ป้ายไวนิล 60x100 150 บาท\n' +
        'หรือ ไวนิล 160x300 ตรมละ 165 💜',
    });
  }

  // Parse only — do NOT save yet. Stash the draft in user_states.context and
  // show a preview with confirm / edit / cancel buttons.
  const draft = makeDraft({
    // A heading the shop wrote themselves beats one worked out from the items.
    jobName: parsed.jobName || deriveJobName(parsed.items, profile.id),
    customerName: parsed.customerName || knownCustomer,
    jobDate: when.date || todayISO(),
    dueDate: due.date,
    items: parsed.items,
    subtotal: parsed.subtotal,
    discount: parsed.discount || 0,
    total: parsed.total,
    paidAmount: parsed.paidAmount,
    payMethod: parsed.payMethod || null,
  });

  await setState(profile.id, STATES.CONFIRMING_JOB, { draft, ...(branch ? { branchSlug: branch.slug } : {}) });

  // Pricing by the square metre lands on satang — 4,887.97 — and no shop hands
  // a customer a bill like that. Say how to round it, but only on the jobs that
  // came out with a fraction and where the shop has not already said a price:
  // on a job ending in a round number this is a line about nothing.
  const hasSatang = parsed.statedTotal == null && Math.round(draft.total) !== draft.total;
  const roundTo = Math.round(draft.total / 10) * 10;

  // งานที่ยังไม่มีราคา บอกทางไปต่อด้วย ไม่งั้นการ์ด ฿0 ขึ้นมาเฉย ๆ แล้วร้าน
  // ไม่รู้ว่าพิมพ์ราคาต่อได้เลย
  //
  // หลายรายการราคาเหมาใส่ไม่ได้ (ไม่รู้ว่าก้อนเดียวเป็นของบรรทัดไหน) แต่บอก
  // เรตตารางเมตรได้ — ม่วงจะไล่คิดทีละบอร์ดตามขนาดให้เอง
  const noPrice = !(draft.total > 0);
  const priceHint =
    draft.items.length > 1
      ? 'บอกเรตมาได้เลยค่ะ เช่น "ตรมละ 350" เดี๋ยวม่วงไล่คิดทีละแผ่นตามขนาดให้'
      : 'พิมพ์ราคามาได้เลยค่ะ เช่น 350 หรือ "ตรมละ 350" ก็ได้';

  // ไม่รู้ว่าของใคร ถามเลยตอนที่การ์ดยังอยู่บนจอ — ใบที่ไม่มีชื่อลูกค้าคือใบ
  // ที่ค้นย้อนหลังไม่เจอ
  const askWho = !draft.customerName ? '\nงานนี้ของลูกค้าท่านไหนคะ? พิมพ์ชื่อมาได้เลยค่ะ' : '';

  const guideNames = !draft.customerName ? await getRecentCustomerNames(profile.id) : [];
  // บอกสิ่งที่ม่วงเข้าใจจากคำท้ายประโยค — เข้าใจผิดต้องเห็นตรงนี้ ตอนยังแก้ทัน
  const MONEY_UNDERSTOOD = {
    cash: '💵 รับเป็นเงินสดแล้ว — จะลงใบลงบัญชีวันนี้ให้เลยค่ะ',
    transfer: '🏦 รับเป็นเงินโอนแล้ว — จะลงใบลงบัญชีวันนี้ให้เลยค่ะ',
    account: '📒 ลงบัญชีไว้ (ยังไม่ได้รับเงิน) — รอวางบิล/เก็บเงินค่ะ',
  };
  const moneyLine = MONEY_UNDERSTOOD[draft.payMethod] || '';
  return reply(replyToken, withDraftGuide([
    // บอกตั้งแต่ตอนตรวจว่าจะเข้าบัญชีร้านไหน — เห็นผิดตรงนี้ยังกดยกเลิกทัน
    ...(branch ? [{ type: 'text', text: `งานนี้จะลงบัญชีร้าน "${branch.name}" นะคะ 🏪` }] : []),
    {
      type: 'text',
      text:
        (noPrice
          ? 'จดไว้ให้แล้วค่ะ 📝 ยังไม่ได้ใส่ราคานะคะ\n' +
            priceHint +
            '\nหรือกด "✅ บันทึกงาน" ไว้ก่อน แล้วค่อยมาใส่ราคาทีหลังก็ได้ 💜'
          : hasSatang
            ? `ตรวจดูให้หน่อยนะคะ ถ้าถูกต้องกด "✅ บันทึกงาน" ได้เลยค่ะ 💜\n` +
              `อยากปัดเศษเอง พิมพ์ "รวม ${numText(roundTo)}" มาได้เลยค่ะ`
            : 'ตรวจดูให้หน่อยนะคะ ถ้าถูกต้องกด "✅ บันทึกงาน" ได้เลยค่ะ 💜') +
        (moneyLine ? '\n' + moneyLine : '') +
        askWho,
    },
    jobPreviewMessage(draftToBubble(draft)),
  ], draft, guideNames));
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
