import { round2 } from './currency.js';

const SIZE_RE = /(\d+(?:\.\d+)?\s*[xX×]\s*\d+(?:\.\d+)?(?:\s*[xX×]\s*\d+(?:\.\d+)?)?)/;
const UNIT_WORDS = ['ชิ้น', 'อัน', 'ใบ', 'แผ่น', 'ตัว', 'ม้วน', 'กล่อง', 'ชุด', 'เมตร', 'ตร.ม.', 'ตารางเมตร'];
const QTY_RE = new RegExp(
  `(?:[x×]\\s*(\\d+))|(?:จำนวน\\s*(\\d+))|(\\d+)\\s*(?:${UNIT_WORDS.join('|')})`,
  'i'
);
// Price: a number optionally followed by บาท / ฿.
const PRICE_TAGGED_RE = /(\d[\d,]*(?:\.\d+)?)\s*(?:บาท|฿|baht)/i;
const NUMBER_RE = /\d[\d,]*(?:\.\d+)?/g;

function toNumber(str) {
  if (str == null) return 0;
  const v = parseFloat(String(str).replace(/,/g, ''));
  return Number.isFinite(v) ? v : 0;
}

function detectUnit(line) {
  for (const u of UNIT_WORDS) {
    if (line.includes(u)) return u;
  }
  return null;
}

// Parse a single line into a job item, or null if nothing useful found.
export function parseLine(rawLine) {
  const line = String(rawLine).trim();
  if (!line) return null;

  let working = line;

  // 1) Size (e.g. 60x100)
  let size = null;
  const sizeMatch = working.match(SIZE_RE);
  if (sizeMatch) {
    size = sizeMatch[1].replace(/\s+/g, '');
    working = working.replace(sizeMatch[0], ' ');
  }

  // 2) Quantity
  let quantity = 1;
  const qtyMatch = working.match(QTY_RE);
  if (qtyMatch) {
    const q = qtyMatch[1] || qtyMatch[2] || qtyMatch[3];
    if (q) {
      quantity = toNumber(q);
      if (quantity <= 0) quantity = 1;
      working = working.replace(qtyMatch[0], ' ');
    }
  }

  const unit = detectUnit(line);

  // 3) Price — prefer a number tagged with บาท / ฿, else last number in the line.
  let unitPrice = 0;
  const tagged = working.match(PRICE_TAGGED_RE);
  if (tagged) {
    unitPrice = toNumber(tagged[1]);
    working = working.replace(tagged[0], ' ');
  } else {
    const nums = working.match(NUMBER_RE);
    if (nums && nums.length) {
      const last = nums[nums.length - 1];
      unitPrice = toNumber(last);
      // remove only the last occurrence
      const idx = working.lastIndexOf(last);
      working = working.slice(0, idx) + ' ' + working.slice(idx + last.length);
    }
  }

  // 4) Item name = whatever text remains
  let itemName = working
    .replace(/บาท|฿|baht/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!itemName) itemName = size ? `รายการ ${size}` : 'รายการ';

  const total = round2(unitPrice * quantity);

  return {
    item_name: itemName,
    size,
    quantity,
    unit,
    unit_price: round2(unitPrice),
    total,
  };
}

// Parse a full multi-line message into items + subtotal/total.
export function parseJobText(text) {
  const lines = String(text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const items = [];
  for (const line of lines) {
    const item = parseLine(line);
    if (item) items.push(item);
  }

  const subtotal = round2(items.reduce((sum, it) => sum + it.total, 0));

  return {
    items,
    subtotal,
    discount: 0,
    total: subtotal,
  };
}
