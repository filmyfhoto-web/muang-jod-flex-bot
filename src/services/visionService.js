import { round2 } from '../utils/currency.js';
import { todayISO } from '../utils/dates.js';
import { logger } from './logger.js';

// Read a photographed piece of paper into something the bot can act on.
//
// Two kinds are worth reading, and they mean opposite things:
//   slip — money already moved. Becomes a saved job, marked paid.
//   job  — a work order / spec sheet / quotation. Becomes a DRAFT to confirm,
//          because nobody has agreed to anything yet.
// Anything else (a photo of the finished sign, a screenshot, a face) is
// "other": it is evidence, and the caller attaches it as before.
//
// Optional, exactly like the text NLP layer: with no ANTHROPIC_API_KEY this
// returns null and the caller keeps the plain "attach the file" behaviour.

const SYSTEM_PROMPT = `คุณคือตัวช่วยอ่านรูปเอกสารของเจ้าของร้านป้าย/ร้านพิมพ์ภาษาไทย
ดูรูปแล้วตอบเป็น JSON เท่านั้น (ห้ามมีข้อความอื่น) ตามรูปแบบนี้:
{
  "kind": "slip" | "job" | "other",
  "merchantName": string | null,   // slip: ชื่อร้าน/ผู้รับเงิน | job: ชื่อลูกค้า/หน่วยงานที่สั่ง
  "jobName": string | null,        // job: ชื่องาน เช่น "ตราประทับบัตรเลือกตั้ง"
  "date": string | null,           // วันที่ในเอกสาร รูปแบบ YYYY-MM-DD (ค.ศ.) ถ้าไม่มีให้ null
  "total": number,                 // ยอดรวมที่พิมพ์อยู่ในเอกสาร ถ้าไม่มีให้ 0
  "items": [
    {
      "item_name": string,         // ชื่อรายการ/งาน
      "size": string | null,       // ขนาด เช่น "3.5 × 4 ซม." ถ้าไม่มีให้ null
      "quantity": number,          // จำนวน ถ้าไม่ระบุให้ 1
      "unit": string | null,       // หน่วย เช่น "อัน" "ชุด" ถ้าไม่มีให้ null
      "unit_price": number         // ราคาต่อหน่วย ถ้าเอกสารไม่ได้บอกราคาให้ 0
    }
  ]
}
วิธีเลือก kind:
- "slip" = สลิปโอนเงิน/ใบเสร็จ/หลักฐานการจ่ายเงิน (จ่ายไปแล้ว มียอดเงินชัดเจน)
- "job" = เอกสารสั่งงาน/แบบงาน/สเปกงาน/ใบเสนอราคา/ข้อความสั่งงาน (ยังไม่ได้จ่าย
  อาจไม่มีราคาเลยก็ได้ ให้อ่านชื่องาน ขนาด จำนวน ออกมาให้ครบ)
- "other" = รูปอื่น เช่น รูปงานที่ทำเสร็จแล้ว รูปคน รูปวิว อ่านไม่ออก
  ถ้าเป็น "other" ให้ items เป็น [] และ total เป็น 0
กติกา:
- ตัวเลขห้ามมีเครื่องหมายคั่นหลักพัน
- ถ้าปีเป็น พ.ศ. ให้แปลงเป็น ค.ศ. (ลบ 543)
- ขนาดให้คงหน่วยตามที่เขียนในเอกสาร รูปแบบ "กว้าง × ยาว หน่วย" เช่น "3.5 × 4 ซม."
- ถ้าเอกสารบอกราคาเป็นตารางเมตร ให้คำนวณพื้นที่เอง คูณกับเรต ได้ราคาต่อชิ้น แล้วส่ง
  quantity = จำนวนชิ้น, unit = null, unit_price = ราคาต่อชิ้นนั้น
  ห้ามส่งเรตต่อตารางเมตรมาเป็น unit_price และห้ามใส่ "ตร.ม." เป็น unit
- ห้ามเดาราคาที่เอกสารไม่ได้เขียนไว้ ไม่มีราคาก็ใส่ 0`;

function extractJsonObject(str) {
  const s = String(str || '');
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return null;
  try {
    return JSON.parse(s.slice(start, end + 1));
  } catch {
    return null;
  }
}

// A date read off paper is only trusted when it parses and is not in the future.
function normalizeDate(value) {
  const s = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const today = todayISO();
  return s > today ? today : s;
}

function text(value, fallback = null) {
  const s = value == null ? '' : String(value).trim();
  return s ? s.slice(0, 200) : fallback;
}

// Shape a raw extraction into the same draft shape createJob expects, or null.
export function normalizeSlip(raw) {
  if (!raw) return null;
  const total = round2(Number(raw.total) || 0);
  if (!(total > 0)) return null;

  const merchant = text(raw.merchantName);

  const items = [];
  for (const it of Array.isArray(raw.items) ? raw.items : []) {
    const name = text(it?.item_name, '');
    const quantity = Number(it?.quantity);
    const unitPrice = Number(it?.unit_price);
    if (!name || !Number.isFinite(quantity) || quantity <= 0) continue;
    if (!Number.isFinite(unitPrice) || unitPrice < 0) continue;
    items.push({
      item_name: name,
      size: null,
      quantity: round2(quantity),
      unit: null,
      unit_price: round2(unitPrice),
      total: round2(unitPrice * quantity),
    });
  }

  // No line items (or they don't add up to anything): keep the slip's own
  // total as a single line, so the money on the card always matches the slip.
  const itemsTotal = round2(items.reduce((s, it) => s + it.total, 0));
  const lines = items.length && itemsTotal === total
    ? items
    : [{ item_name: merchant || 'รายการจากสลิป', size: null, quantity: 1, unit: null, unit_price: total, total }];

  return {
    kind: 'slip',
    merchantName: merchant,
    date: normalizeDate(raw.date),
    items: lines,
    subtotal: total,
    discount: 0,
    total,
  };
}

// A job sheet is the mirror image of a slip: the lines are what matters and
// the money may be missing entirely, so a zero total is normal here rather
// than a reason to give up.
export function normalizeJobSheet(raw) {
  if (!raw) return null;

  const items = [];
  for (const it of Array.isArray(raw.items) ? raw.items : []) {
    const name = text(it?.item_name, '');
    if (!name) continue;
    const rawQty = Number(it?.quantity);
    const quantity = Number.isFinite(rawQty) && rawQty > 0 ? round2(rawQty) : 1;
    const rawPrice = Number(it?.unit_price);
    const unitPrice = Number.isFinite(rawPrice) && rawPrice > 0 ? round2(rawPrice) : 0;
    items.push({
      item_name: name,
      size: text(it?.size),
      quantity,
      unit: text(it?.unit),
      unit_price: unitPrice,
      total: round2(unitPrice * quantity),
    });
  }
  if (!items.length) return null;

  // Trust the lines when they carry prices; fall back to the printed total
  // when only a grand total is written on the paper.
  const itemsTotal = round2(items.reduce((s, it) => s + it.total, 0));
  const printed = round2(Number(raw.total) || 0);
  const total = itemsTotal > 0 ? itemsTotal : Math.max(printed, 0);

  return {
    kind: 'job',
    jobName: text(raw.jobName),
    customerName: text(raw.merchantName),
    date: normalizeDate(raw.date),
    items,
    subtotal: total,
    discount: 0,
    total,
  };
}

async function defaultVisionExtract(buffer, mimeType) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey });
  const model = process.env.VISION_MODEL || process.env.NLP_MODEL || 'claude-haiku-4-5';

  const res = await client.messages.create({
    model,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mimeType, data: buffer.toString('base64') } },
          { type: 'text', text: 'อ่านรูปนี้แล้วตอบเป็น JSON ตามรูปแบบที่กำหนด' },
        ],
      },
    ],
  });

  const out = (res.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');
  return extractJsonObject(out);
}

// Images only — the vision API does not read PDFs as images.
export const READABLE_TYPES = ['image/jpeg', 'image/png'];

// Returns a normalized slip or job-sheet draft, or null when reading is
// unavailable or the picture is neither. Never throws: the caller falls back
// to attaching the file as-is.
export async function readImage(buffer, mimeType, deps = {}) {
  if (!READABLE_TYPES.includes(mimeType)) return null;
  const extract = deps.visionExtract || defaultVisionExtract;
  try {
    const raw = await extract(buffer, mimeType);
    if (raw?.kind === 'other') return null; // a photo, not paperwork: just attach it

    // A slip is the safer reading of an ambiguous document: it records money
    // that already moved, where a job sheet only ever proposes a draft.
    const read = raw?.kind === 'job' ? normalizeJobSheet(raw) : normalizeSlip(raw);
    if (read) {
      logger.info('vision.read', { kind: read.kind, items: read.items.length, total: read.total });
      return read;
    }
  } catch (err) {
    logger.warn('vision.read_failed', { message: err?.message });
  }
  return null;
}
