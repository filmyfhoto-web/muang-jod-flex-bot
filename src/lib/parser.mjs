const THAI_DIGITS = new Map([
  ['๐', '0'], ['๑', '1'], ['๒', '2'], ['๓', '3'], ['๔', '4'],
  ['๕', '5'], ['๖', '6'], ['๗', '7'], ['๘', '8'], ['๙', '9']
]);

const CATEGORY_RULES = [
  ['อาหาร', /กาแฟ|ข้าว|อาหาร|ขนม|น้ำดื่ม|กระเพรา|กะเพรา|มื้อ/],
  ['เดินทาง', /น้ำมัน|รถ|แท็กซี่|เดินทาง|ค่าทางด่วน|ตั๋ว/],
  ['วัสดุงานพิมพ์', /กระดาษ|หมึก|โฟมบอร์ด|ไวนิล|สติกเกอร์|กรอบ|อุปกรณ์/],
  ['ค่าน้ำค่าไฟ', /ค่าไฟ|ค่าน้ำ|อินเทอร์เน็ต|โทรศัพท์/],
  ['ค่าจ้าง', /ค่าแรง|ค่าจ้าง|เงินเดือน/],
  ['งานป้าย', /ป้าย|ไวนิล|สแตนดี้|เอ็กซ์สแตนด์|x-stand/i],
  ['งานรูป', /รูป|ถ่ายภาพ|อัดรูป|รูปติดบัตร/],
  ['งานเอกสาร', /ถ่ายเอกสาร|เข้าเล่ม|พิมพ์งาน|เคลือบ/],
  ['มัดจำ', /มัดจำ/]
];

const EXPENSE_RE = /รายจ่าย|จ่าย|ซื้อ|ค่า(?!ขาย)|ชำระ|เสียเงิน/;
const INCOME_RE = /รายรับ|รับเงิน|ได้เงิน|ขาย|ลูกค้าจ่าย|มัดจำ|เก็บเงิน|งานวันนี้|รับงาน|งานลูกค้า/;
const PAYMENT_RULES = [
  ['พร้อมเพย์', /พร้อมเพย์|promptpay/i],
  ['โอนเงิน', /โอน|กรุงไทย|กสิกร|ไทยพาณิชย์|กรุงเทพ/],
  ['บัตร', /บัตรเครดิต|บัตรเดบิต|บัตร/],
  ['TrueMoney', /truemoney|ทรูมันนี่/i],
  ['TikTokPay', /tiktokpay/i],
  ['เงินสด', /เงินสด/]
];

export function normalizeThaiDigits(input) {
  return String(input || '').replace(/[๐-๙]/g, (digit) => THAI_DIGITS.get(digit));
}

function inferType(text, fallback = null) {
  const expenseIndex = text.search(EXPENSE_RE);
  const incomeIndex = text.search(INCOME_RE);
  if (expenseIndex >= 0 && incomeIndex >= 0) return expenseIndex < incomeIndex ? 'expense' : 'income';
  if (expenseIndex >= 0) return 'expense';
  if (incomeIndex >= 0) return 'income';
  if (/กาแฟ|ข้าว|อาหาร|ขนม|น้ำมัน|ค่าไฟ|ค่าน้ำ/.test(text)) return 'expense';
  return fallback;
}

function inferCategory(text, type) {
  for (const [name, pattern] of CATEGORY_RULES) {
    if (pattern.test(text)) return name;
  }
  return type === 'income' ? 'รายรับอื่นๆ' : 'รายจ่ายอื่นๆ';
}

function inferPayment(text) {
  for (const [name, pattern] of PAYMENT_RULES) {
    if (pattern.test(text)) return name;
  }
  return null;
}

function cleanDescription(text) {
  return text
    .replace(/^(?:และ|,|;|\||-)+\s*/g, '')
    .replace(/(?:รายรับ|รายจ่าย|รับเงิน|ได้เงิน|ลูกค้าจ่าย|จ่าย|ซื้อ|ขาย|บันทึก|จด|งานวันนี้|รับงาน|งานลูกค้า)\s*/g, '')
    .replace(/(?:เงินสด|พร้อมเพย์|promptpay|โอนเงิน?|บัตรเครดิต|บัตรเดบิต|truemoney|tiktokpay)\s*/gi, '')
    .replace(/[,:;|]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function numberValue(value) {
  return Number(String(value).replace(/,/g, ''));
}

function isDimensionNumber(text, index, rawNumber) {
  const before = text.slice(Math.max(0, index - 2), index);
  const after = text.slice(index + rawNumber.length, index + rawNumber.length + 2);
  return /[xX×*]\s*$/.test(before) || /^\s*[xX×*]/.test(after);
}

function extractCurrencyMarked(text) {
  const regex = /(\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)\s*(?:บาท|บ\.?|฿)/g;
  return [...text.matchAll(regex)].filter((match) => !isDimensionNumber(text, match.index, match[1]));
}

function fallbackSingleAmount(text) {
  const regex = /(\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)(?![\d])/g;
  const candidates = [...text.matchAll(regex)].filter((match) => !isDimensionNumber(text, match.index, match[1]));
  if (!candidates.length) return [];
  return [candidates[candidates.length - 1]];
}

function nearestType(segment, inheritedType) {
  return inferType(segment, inheritedType);
}

export function parseTransactions(input) {
  const source = normalizeThaiDigits(input).replace(/\r/g, ' ').trim();
  if (!source) return { entries: [], issues: ['กรุณาพิมพ์รายการและจำนวนเงิน'] };

  const inheritedType = inferType(source);
  let matches = extractCurrencyMarked(source);
  if (!matches.length) matches = fallbackSingleAmount(source);
  if (!matches.length) return { entries: [], issues: ['ไม่พบจำนวนเงิน กรุณาใส่ตัวเลข เช่น กาแฟ 50'] };

  const entries = [];
  let start = 0;
  for (const match of matches) {
    let segment = source.slice(start, match.index);
    if (matches.length === 1) segment = source.slice(0, match.index);
    const amount = numberValue(match[1]);
    const type = nearestType(segment, inheritedType);
    const description = cleanDescription(segment) || 'ไม่ระบุรายการ';
    entries.push({
      type,
      description,
      amount,
      category: inferCategory(segment, type),
      // ตรวจทั้งข้อความก่อน เพื่อไม่ให้คำในชื่อสินค้า เช่น “รูปติดบัตร”
      // ถูกเข้าใจผิดเป็นช่องทางบัตร เมื่อผู้ใช้ระบุ “พร้อมเพย์” ไว้ภายหลัง
      paymentMethod: inferPayment(source)
    });
    start = match.index + match[0].length;
  }

  const issues = [];
  if (entries.some((entry) => !entry.type)) issues.push('ยังไม่ทราบว่าเป็นรายรับหรือรายจ่าย');
  if (entries.some((entry) => !Number.isFinite(entry.amount) || entry.amount <= 0)) issues.push('จำนวนเงินต้องมากกว่า 0');
  if (entries.length > 10) issues.push('หนึ่งข้อความบันทึกได้ไม่เกิน 10 รายการ');
  return { entries: entries.slice(0, 10), issues };
}

export function parsePostbackData(data) {
  const params = new URLSearchParams(String(data || ''));
  return Object.fromEntries(params.entries());
}
