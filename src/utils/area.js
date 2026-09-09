import { round2, numText } from './currency.js';

// ราคาแบบ "ตารางเมตรละ" — งานป้าย/ไวนิล/สติกเกอร์คิดตามพื้นที่
//
//   "รพสตบ้านชี ไวนิล ขนาด 160*300 ตรมละ 165 บาท"
//   -> 1.60 ม. × 3.00 ม. = 4.8 ตร.ม. × 165 = 792 บาท
//
// เจ้าของร้านพิมพ์แค่ขนาดกับราคาต่อตารางเมตร ไม่ต้องคูณเอง และไม่ต้องใส่หน่วย
// ถ้าไม่ใส่ — ตัวเลขตั้งแต่ 20 ขึ้นไปถือว่าเป็นเซนติเมตร (160*300), ต่ำกว่านั้น
// ถือว่าเป็นเมตร (1.6*3) ซึ่งตรงกับวิธีที่ร้านป้ายเรียกขนาดกันจริง ๆ
// ใส่หน่วยมาเอง (ซม. / ม. / นิ้ว / ฟุต) ก็เชื่อหน่วยที่ใส่เสมอ

const NUM = '\\d+(?:\\.\\d+)?';

// หน่วยความยาว — ท้าย "ม." ต้องไม่ตามด้วยตัวอักษรไทย กัน "300 มัดจำ" ถูกอ่าน
// เป็น 300 เมตร
const CM = '(?:เซนติเมตร|ซ\\.?ม\\.?(?![ก-๙])|[cC][mM])';
const M = '(?:เมตร|ม\\.?(?![ก-๙])|[mM](?![a-zA-Z]))';
const INCH = '(?:นิ้ว|[iI][nN][cC][hH]|")';
const FT = '(?:ฟุต|[fF][tT])';
const UNIT = `(?:${CM}|${INCH}|${FT}|${M})`;

// "ตร.ม." / "ตรม" / "ตารางเมตร" / "sq.m" / "m2"
const SQM = '(?:ตร\\.?\\s*ม\\.?|ตาราง\\s*เมตร|[sS][qQ]\\.?\\s*[mM]\\.?|[mM][²2]|ม²)';

const TIMES = '[x×X*✕✖]';

const FACTORS = { cm: 0.01, m: 1, inch: 0.0254, ft: 0.3048 };
const UNIT_LABELS = { cm: 'ซม.', m: 'ม.', inch: 'นิ้ว', ft: 'ฟุต' };

export const SQM_UNIT = 'ตร.ม.';

// 160×300 / 160*300 ซม. / 1.6 ม. x 3 ม.
const SIZE_RE = new RegExp(`(${NUM})\\s*(${UNIT})?\\s*${TIMES}\\s*(${NUM})\\s*(${UNIT})?`);
// กว้าง 1.6 ยาว 3 ม.
const SIZE_WORDS_RE = new RegExp(
  `กว้าง\\s*(${NUM})\\s*(${UNIT})?\\s*(?:ยาว|สูง)\\s*(${NUM})\\s*(${UNIT})?`
);

// "ตรมละ 165" / "ตารางเมตรละ 165 บาท" / "ราคา ตร.ม. ละ 165"
const RATE_PER_RE = new RegExp(`(?:ราคา\\s*)?${SQM}\\s*ละ\\s*(${NUM})`);
// "165 บาท/ตร.ม." / "165 ต่อตารางเมตร"
const RATE_SLASH_RE = new RegExp(`(${NUM})\\s*(?:บาท|฿)?\\s*(?:\\/|ต่อ|per)\\s*${SQM}`);
// "4.8 ตร.ม." — พื้นที่ที่ลูกค้าคิดมาให้แล้ว
const AREA_RE = new RegExp(`(${NUM})\\s*${SQM}`);

function toNumber(s) {
  const v = parseFloat(String(s ?? '').replace(/,/g, ''));
  return Number.isFinite(v) ? v : 0;
}

function replaceOnce(text, fragment) {
  const idx = text.indexOf(fragment);
  return idx === -1 ? text : `${text.slice(0, idx)} ${text.slice(idx + fragment.length)}`;
}

export function classifyUnit(token) {
  if (!token) return null;
  const t = String(token).toLowerCase().replace(/[.\s]/g, '');
  if (t === 'ซม' || t === 'เซนติเมตร' || t === 'cm') return 'cm';
  if (t === 'ม' || t === 'เมตร' || t === 'm') return 'm';
  if (t === 'นิ้ว' || t === 'inch' || t === '"') return 'inch';
  if (t === 'ฟุต' || t === 'ft') return 'ft';
  return null;
}

// ไม่ได้ใส่หน่วยมา: ป้ายที่เรียกเป็นตัวเลขสองหลักขึ้นไปคือเซนติเมตรเสมอ
// (60x100, 160x300) ส่วน 1.2x2.4 คือเมตร
export function inferUnit(width, height) {
  return width < 20 && height < 20 ? 'm' : 'cm';
}

// หาขนาดในข้อความ คืน { match, width, height, unit } — unit เป็น null ถ้าไม่ได้ใส่มา
export function matchSize(text) {
  const line = String(text || '');
  const m = SIZE_RE.exec(line) || SIZE_WORDS_RE.exec(line);
  if (!m) return null;
  const width = toNumber(m[1]);
  const height = toNumber(m[3]);
  if (!(width > 0) || !(height > 0)) return null;
  return { match: m[0], width, height, unit: classifyUnit(m[2]) || classifyUnit(m[4]) };
}

// หาราคาต่อตารางเมตร คืน { match, rate } หรือ null
export function matchSqmRate(text) {
  const line = String(text || '');
  const m = RATE_PER_RE.exec(line) || RATE_SLASH_RE.exec(line);
  if (!m) return null;
  const rate = toNumber(m[1]);
  return rate > 0 ? { match: m[0], rate } : null;
}

// พื้นที่เป็นตารางเมตรจากขนาด + หน่วย
export function areaSqm({ width, height, unit }) {
  const factor = FACTORS[unit] || 1;
  return round2(width * factor * (height * factor));
}

// ป้ายขนาดบนใบเสร็จ: กว้าง คูณ ยาว เท่านั้น เขียนแบบเดียวกับฟอร์มจดด่วน
// (public/liff/jot/script.js) เพื่อให้งานเดียวกันหน้าตาเหมือนกันไม่ว่าจะจด
// มาทางไหน — tests/area.test.js คุมไว้ว่าสองที่ต้องตรงกัน
export function sizeLabel({ width, height, unit }) {
  return `${numText(width)} × ${numText(height)} ${UNIT_LABELS[unit] || ''}`.trim();
}

// อ่านบรรทัดที่คิดราคาแบบตารางเมตร — คืน null ถ้าไม่ใช่แบบนั้น
// (ต้องมีทั้ง "ราคาต่อตารางเมตร" และ "ขนาด" หรือ "พื้นที่" ถึงจะคิดให้)
export function parseAreaPricing(rawLine) {
  const line = String(rawLine || '');
  const rate = matchSqmRate(line);
  if (!rate) return null;

  // ตัดราคาออกก่อน เลข 165 จะได้ไม่ถูกอ่านเป็นด้านหนึ่งของขนาด
  const withoutRate = replaceOnce(line, rate.match);

  const size = matchSize(withoutRate);
  let sqm;
  let rest;
  let unit = null;
  let inferred = false;
  let label = null;

  if (size) {
    unit = size.unit || inferUnit(size.width, size.height);
    inferred = !size.unit;
    sqm = areaSqm({ ...size, unit });
    label = sizeLabel({ ...size, unit });
    rest = replaceOnce(withoutRate, size.match);
  } else {
    // ไม่มีขนาด แต่บอกพื้นที่มาตรง ๆ: "ไวนิล 4.8 ตร.ม. ตรมละ 165"
    const areaM = AREA_RE.exec(withoutRate);
    if (!areaM) return null;
    sqm = round2(toNumber(areaM[1]));
    rest = replaceOnce(withoutRate, areaM[0]);
  }

  if (!(sqm > 0)) return null;

  return {
    rest: rest.replace(/ขนาด|พื้นที่|กว้าง|ยาว|สูง/g, ' ').replace(/\s+/g, ' ').trim(),
    rate: round2(rate.rate),
    sqm,
    unit,
    inferred,
    sizeLabel: label,
  };
}

// สร้างรายการงานหนึ่งบรรทัดจากผลด้านบน
//
// เรตต่อตารางเมตรเป็นวิธีคิดของร้าน ไม่ใช่สิ่งที่ลูกค้าต้องเห็น บรรทัดที่ออก
// ไปจึงเป็น "ขนาด · จำนวนชิ้น · ราคาต่อชิ้น" เหมือนงานอื่นทุกประเภท ส่วนพื้นที่
// กับเรตไปอยู่ในหมายเหตุผ่าน areaWorking() ซึ่งขึ้นเฉพาะการ์ดของร้าน
export function areaItem(area, { itemName, pieces = 1 } = {}) {
  const count = Number(pieces) > 0 ? Number(pieces) : 1;
  const perPiece = round2(area.sqm * area.rate);
  return {
    item_name: itemName || 'งานป้าย',
    size: area.sizeLabel,
    quantity: count,
    unit: null,
    unit_price: perPiece,
    total: round2(perPiece * count),
  };
}

// วิธีคิดของร้าน หนึ่งบรรทัด — "ไวนิล: 4.8 ตร.ม. × 165 = 792"
export function areaWorking(area, { itemName, pieces = 1 } = {}) {
  const count = Number(pieces) > 0 ? Number(pieces) : 1;
  const perPiece = round2(area.sqm * area.rate);
  const each = count > 1 ? ` ต่อชิ้น × ${numText(count)} ชิ้น` : '';
  return `${itemName || 'งานป้าย'}: ${numText(area.sqm)} ${SQM_UNIT} × ${numText(area.rate)} = ${numText(perPiece)}${each}`;
}
