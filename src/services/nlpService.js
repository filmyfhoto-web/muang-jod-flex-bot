import { parseNaturalJob } from '../utils/nlParser.js';
import { round2 } from '../utils/currency.js';
import { logger } from './logger.js';

// Natural-language job extraction.
//
// Default engine: the deterministic rule-based parser (utils/nlParser).
// Optional AI layer: if ANTHROPIC_API_KEY is set, Claude extracts the fields
// from messier phrasing; any failure (no key, network, bad JSON, invalid
// shape) falls back to the rule-based parser so the bot always works.

const SYSTEM_PROMPT = `คุณคือตัวช่วยแยกข้อมูลงานจากข้อความสั้น ๆ ของเจ้าของร้านภาษาไทย
ดึงข้อมูลออกมาเป็น JSON เท่านั้น (ห้ามมีข้อความอื่น) ตามรูปแบบนี้:
{
  "customerName": string | null,   // ชื่อลูกค้า เช่น "พี่นก" ถ้าไม่มีให้ null
  "items": [
    {
      "item_name": string,          // ชื่อสินค้า/งาน
      "size": string | null,        // ขนาด เช่น "60x100" ถ้าไม่มีให้ null
      "quantity": number,           // จำนวน (>0)
      "unit": string | null,        // หน่วย เช่น "ป้าย" ถ้าไม่มีให้ null
      "unit_price": number          // ราคาต่อหน่วย (>=0)
    }
  ],
  "paidAmount": number              // ยอดที่รับมาแล้ว ถ้าไม่มีให้ 0
}
ตัวอย่าง: "วันนี้ทำป้ายร้านพี่นก 2 ป้าย ป้ายละ 350 รับมาแล้ว 300"
-> {"customerName":"พี่นก","items":[{"item_name":"ป้าย","size":null,"quantity":2,"unit":"ป้าย","unit_price":350}],"paidAmount":300}

กฎสำคัญ: ถ้าคิดราคาเป็น "ตารางเมตรละ" (ตรมละ / ตร.ม.ละ / บาทต่อตารางเมตร)
ให้คำนวณพื้นที่เอง แล้วคูณกับเรต ได้ราคาต่อชิ้น ส่งแบบนี้:
  quantity   = จำนวนชิ้น (ไม่ใช่ตารางเมตร)
  unit       = null
  unit_price = ราคาต่อชิ้นที่คำนวณได้ (ไม่ใช่เรตต่อตารางเมตร)
  size       = "กว้าง × ยาว หน่วย" เท่านั้น
เรตต่อตารางเมตรเป็นวิธีคิดของร้าน ห้ามส่งออกมาเป็น unit_price และห้ามใส่
"ตร.ม." เป็น unit เด็ดขาด
ขนาดที่ไม่ใส่หน่วย ถ้าตัวเลขตั้งแต่ 20 ขึ้นไปคือเซนติเมตร ต่ำกว่า 20 คือเมตร
ถ้าใส่หน่วยมา (ซม./ม./นิ้ว/ฟุต) ให้เชื่อหน่วยนั้น และใส่หน่วยกำกับใน size ด้วย
ตัวอย่าง: "รพสตบ้านชี ไวนิล ขนาด 160*300 ตรมละ 165 บาท"
-> {"customerName":"รพสตบ้านชี","items":[{"item_name":"ไวนิล","size":"160 × 300 ซม.","quantity":1,"unit":null,"unit_price":792}],"paidAmount":0}
(160 ซม. = 1.6 ม., 300 ซม. = 3 ม. -> 1.6 × 3 = 4.8 ตร.ม. -> 4.8 × 165 = 792 บาทต่อชิ้น)`;

// Pull the first balanced JSON object out of a model response.
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

// Validate + normalize a raw extraction object into a job draft, or null.
function normalizeExtraction(raw) {
  if (!raw || !Array.isArray(raw.items)) return null;
  const items = [];
  for (const it of raw.items) {
    const quantity = Number(it?.quantity);
    const unitPrice = Number(it?.unit_price);
    const name = typeof it?.item_name === 'string' ? it.item_name.trim() : '';
    if (!name) continue;
    if (!Number.isFinite(quantity) || quantity <= 0) continue;
    if (!Number.isFinite(unitPrice) || unitPrice < 0) continue;
    items.push({
      item_name: name,
      size: it.size ? String(it.size) : null,
      quantity: round2(quantity),
      unit: it.unit ? String(it.unit) : null,
      unit_price: round2(unitPrice),
      total: round2(unitPrice * quantity),
    });
  }
  if (!items.length) return null;

  const subtotal = round2(items.reduce((s, it) => s + it.total, 0));
  const paidAmount = Number.isFinite(Number(raw.paidAmount)) ? round2(Math.max(Number(raw.paidAmount), 0)) : 0;
  return {
    customerName: raw.customerName ? String(raw.customerName).trim() : null,
    items,
    subtotal,
    discount: 0,
    total: subtotal,
    paidAmount,
  };
}

// Default AI extractor — returns a raw object, or null if no key is configured.
async function defaultLlmExtract(text) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey });
  const model = process.env.NLP_MODEL || 'claude-haiku-4-5';

  const res = await client.messages.create({
    model,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: String(text || '') }],
  });

  const out = (res.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');
  return extractJsonObject(out);
}

// Extract a normalized job draft from free text. `deps.llmExtract` is
// injectable for tests; production uses the Claude call above.
export async function extractJobDraft(text, deps = {}) {
  const llm = deps.llmExtract || defaultLlmExtract;
  try {
    const raw = await llm(text);
    const draft = normalizeExtraction(raw);
    if (draft) {
      logger.info('nlp.extracted', { via: 'llm', items: draft.items.length });
      return draft;
    }
  } catch (err) {
    logger.warn('nlp.llm_failed', { message: err?.message });
  }

  const draft = parseNaturalJob(text);
  logger.info('nlp.extracted', { via: 'rules', items: draft.items.length });
  return draft;
}

export { normalizeExtraction, extractJsonObject };
