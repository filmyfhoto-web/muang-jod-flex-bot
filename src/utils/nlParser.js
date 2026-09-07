import { parseJobText } from './parser.js';
import { round2 } from './currency.js';

// Rule-based natural-language extractor. Understands short Thai shopkeeper
// notes like:
//   "วันนี้ทำป้ายร้านพี่นก 2 ป้าย ป้ายละ 350 รับมาแล้ว 300"
// -> customer=พี่นก, qty=2, unit_price=350, total=700, paid=300
// This is the always-on engine and the fallback for the optional LLM layer.

const UNIT_WORDS = ['ป้าย', 'ชิ้น', 'อัน', 'ใบ', 'แผ่น', 'ตัว', 'ม้วน', 'กล่อง', 'ชุด', 'เมตร', 'ผืน', 'โหล', 'คู่'];
// Note: short honorifics like "ป้า"/"อา" are intentionally excluded — they
// collide with common words ("ป้าย" = sign), causing false customer matches.
const HONORIFICS = ['พี่', 'คุณ', 'น้อง', 'เจ๊', 'เฮีย', 'ลุง'];

function toNumber(s) {
  const v = parseFloat(String(s ?? '').replace(/,/g, ''));
  return Number.isFinite(v) ? v : 0;
}

// Pull out "received/deposit" amount, e.g. "รับมาแล้ว 300", "มัดจำ 500".
function extractPaid(text) {
  const re =
    /(?:รับ(?:มา)?(?:แล้ว|เงิน)?|มัดจำ|วางมัดจำ|จ่ายแล้ว|ชำระแล้ว|โอนแล้ว|โอนมา)\s*(?:มา)?\s*(\d[\d,]*(?:\.\d+)?)\s*(?:บาท|฿)?/;
  const m = text.match(re);
  if (!m) return { paidAmount: 0, rest: text };
  return { paidAmount: toNumber(m[1]), rest: text.replace(m[0], ' ') };
}

// Pull out a customer name: an honorific + name (พี่นก), else "ร้าน<name>".
function extractCustomer(text) {
  const honor = new RegExp(`(${HONORIFICS.join('|')})\\s*([ก-๙A-Za-z]{1,20})`);
  const m = text.match(honor);
  if (m) {
    return { customerName: `${m[1]}${m[2]}`.replace(/\s+/g, ''), rest: text.replace(m[0], ' ') };
  }
  const shop = text.match(/ร้าน\s*([ก-๙A-Za-z]{2,20})/);
  if (shop) {
    return { customerName: `ร้าน${shop[1]}`, rest: text.replace(shop[0], ' ') };
  }
  return { customerName: null, rest: text };
}

// Parse a single free-form line into one item, understanding "ป้ายละ 350"
// (price per unit) and "2 ป้าย" (leading quantity + unit).
function parseSingleLine(line) {
  let working = ` ${String(line || '').replace(/\s+/g, ' ').trim()} `;

  let size = null;
  const sizeM = working.match(/(\d+(?:\.\d+)?\s*[xX×]\s*\d+(?:\.\d+)?)/);
  if (sizeM) {
    size = sizeM[1].replace(/\s+/g, '');
    working = working.replace(sizeM[1], ' ');
  }

  let unitPrice = null;
  let unitWord = null;
  const per = working.match(/([ก-๙A-Za-z]{1,15})?ละ\s*(\d[\d,]*(?:\.\d+)?)/);
  if (per) {
    unitPrice = toNumber(per[2]);
    if (per[1]) unitWord = per[1];
    working = working.replace(per[0], ' ');
  }

  let quantity = null;
  const qtyUnit = working.match(new RegExp(`(\\d+)\\s*(${UNIT_WORDS.join('|')})`));
  if (qtyUnit) {
    quantity = toNumber(qtyUnit[1]);
    if (!unitWord) unitWord = qtyUnit[2];
    working = working.replace(qtyUnit[0], ' ');
  } else {
    const qx = working.match(/(?:x|×|จำนวน)\s*(\d+)/i);
    if (qx) {
      quantity = toNumber(qx[1]);
      working = working.replace(qx[0], ' ');
    }
  }

  if (unitPrice == null) {
    const tagged = working.match(/(\d[\d,]*(?:\.\d+)?)\s*(?:บาท|฿)/);
    if (tagged) {
      unitPrice = toNumber(tagged[1]);
      working = working.replace(tagged[0], ' ');
    } else {
      const nums = working.match(/\d[\d,]*(?:\.\d+)?/g);
      if (nums && nums.length) {
        const last = nums[nums.length - 1];
        unitPrice = toNumber(last);
        const idx = working.lastIndexOf(last);
        working = `${working.slice(0, idx)} ${working.slice(idx + last.length)}`;
      }
    }
  }

  if (quantity == null) quantity = 1;
  if (quantity <= 0) quantity = 1;
  if (unitPrice == null) unitPrice = 0;

  let itemName = working
    .replace(/วันนี้|เมื่อวาน|พรุ่งนี้|ทำ|ทํา|งาน|ให้|ค่ะ|คะ|ครับ|นะ|บาท|฿/g, ' ')
    .replace(/ร้าน/g, ' ')
    .replace(/\d[\d,]*(?:\.\d+)?/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!itemName) itemName = unitWord || 'งาน';

  return {
    item_name: itemName,
    size: size || null,
    quantity,
    unit: unitWord || null,
    unit_price: round2(unitPrice),
    total: round2(unitPrice * quantity),
  };
}

// Parse a whole message into a normalized job draft.
export function parseNaturalJob(rawText) {
  const text = String(rawText || '');
  const paid = extractPaid(text);
  const cust = extractCustomer(paid.rest);

  // Drop the label word "ลูกค้า" so it can't be parsed as an item.
  const cleaned = cust.rest.replace(/ลูกค้า/g, ' ');
  const lines = cleaned.split('\n').map((l) => l.trim()).filter(Boolean);

  let items;
  if (lines.length > 1) {
    // Multi-line list — reuse the tested line parser.
    items = parseJobText(cleaned).items;
  } else {
    items = [parseSingleLine(lines[0] || '')];
  }
  items = items.filter(Boolean);

  const subtotal = round2(items.reduce((s, it) => s + (Number(it.total) || 0), 0));
  return {
    customerName: cust.customerName || null,
    items,
    subtotal,
    discount: 0,
    total: subtotal,
    paidAmount: round2(paid.paidAmount || 0),
  };
}
