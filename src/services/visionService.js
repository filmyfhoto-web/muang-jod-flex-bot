import { round2 } from '../utils/currency.js';
import { todayISO } from '../utils/dates.js';
import { logger } from './logger.js';

// Read a payment slip / receipt image into a job draft.
//
// Optional, exactly like the text NLP layer: with no ANTHROPIC_API_KEY this
// returns null and the caller keeps the plain "attach the file" behaviour.

const SYSTEM_PROMPT = `คุณคือตัวช่วยอ่านสลิป/ใบเสร็จของเจ้าของร้านภาษาไทย
อ่านรูปแล้วตอบเป็น JSON เท่านั้น (ห้ามมีข้อความอื่น) ตามรูปแบบนี้:
{
  "merchantName": string | null,   // ชื่อร้าน/ผู้รับเงิน ถ้าไม่มีให้ null
  "date": string | null,           // วันที่ในสลิป รูปแบบ YYYY-MM-DD (ค.ศ.) ถ้าไม่มีให้ null
  "total": number,                 // ยอดชำระรวม (>0) ถ้าอ่านไม่ออกให้ 0
  "items": [                       // รายการในสลิป ถ้าไม่มีให้ []
    { "item_name": string, "quantity": number, "unit_price": number }
  ]
}
กติกา:
- ตัวเลขห้ามมีเครื่องหมายคั่นหลักพัน
- ถ้าปีเป็น พ.ศ. ให้แปลงเป็น ค.ศ. (ลบ 543)
- ถ้าอ่านยอดรวมไม่ได้เลย ให้ total เป็น 0`;

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

// A slip date is only trusted when it parses and is not in the future.
function normalizeDate(value) {
  const s = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const today = todayISO();
  return s > today ? today : s;
}

// Shape a raw extraction into the same draft shape createJob expects, or null.
export function normalizeSlip(raw) {
  if (!raw) return null;
  const total = round2(Number(raw.total) || 0);
  if (!(total > 0)) return null;

  const merchant = raw.merchantName ? String(raw.merchantName).trim().slice(0, 200) : null;

  const items = [];
  for (const it of Array.isArray(raw.items) ? raw.items : []) {
    const name = typeof it?.item_name === 'string' ? it.item_name.trim() : '';
    const quantity = Number(it?.quantity);
    const unitPrice = Number(it?.unit_price);
    if (!name || !Number.isFinite(quantity) || quantity <= 0) continue;
    if (!Number.isFinite(unitPrice) || unitPrice < 0) continue;
    items.push({
      item_name: name.slice(0, 200),
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
    merchantName: merchant,
    date: normalizeDate(raw.date),
    items: lines,
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
          { type: 'text', text: 'อ่านสลิปนี้แล้วตอบเป็น JSON ตามรูปแบบที่กำหนด' },
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

// Returns a normalized slip draft, or null when reading is unavailable or the
// image is not a readable slip. Never throws: the caller falls back to
// attaching the file as-is.
export async function readSlip(buffer, mimeType, deps = {}) {
  if (!READABLE_TYPES.includes(mimeType)) return null;
  const extract = deps.visionExtract || defaultVisionExtract;
  try {
    const raw = await extract(buffer, mimeType);
    const slip = normalizeSlip(raw);
    if (slip) {
      logger.info('vision.slip_read', { items: slip.items.length, total: slip.total });
      return slip;
    }
  } catch (err) {
    logger.warn('vision.slip_failed', { message: err?.message });
  }
  return null;
}
