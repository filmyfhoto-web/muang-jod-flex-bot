import { parseJobText } from './parser.js';
import { round2 } from './currency.js';
import { parseAreaPricing, areaItem, areaWorking } from './area.js';

// Rule-based natural-language extractor. Understands short Thai shopkeeper
// notes like:
//   "วันนี้ทำป้ายร้านพี่นก 2 ป้าย ป้ายละ 350 รับมาแล้ว 300"
// -> customer=พี่นก, qty=2, unit_price=350, total=700, paid=300
// This is the always-on engine and the fallback for the optional LLM layer.

// A unit missing from here is not a cosmetic problem: "สติ๊กเกอร์ 20 ดวง
// ดวงละ 15" was read as one piece at 15 baht instead of twenty at 300.
const UNIT_WORDS = [
  'ป้าย', 'ชิ้น', 'อัน', 'ใบ', 'แผ่น', 'ตัว', 'ม้วน', 'กล่อง', 'ชุด', 'เมตร', 'ผืน', 'โหล', 'คู่',
  'ดวง', 'เล่ม', 'ห่อ', 'ถุง', 'แพ็ค', 'แพ็ก', 'กิโล', 'โล',
];
// Note: short honorifics like "ป้า"/"อา" are intentionally excluded — they
// collide with common words ("ป้าย" = sign), causing false customer matches.
// Longest first: "ผู้ใหญ่" has to win before anything shorter inside it can.
// "ป้า" needs the guard — every second job here is a ป้าย, and "ป้ายไวนิล"
// would otherwise be read as a customer called "ยไวนิล".
const HONORIFICS = [
  'ผู้ใหญ่',
  'กำนัน',
  'ท่าน',
  'พี่',
  'คุณ',
  'น้อง',
  'เจ๊',
  'เฮีย',
  'ลุง',
  'ยาย',
  'แม่',
  'พ่อ',
  'ครู',
  'หมอ',
  'ผอ\\.?',
  // Both need guards against words this shop says all day: "หน้าร้าน" is not
  // an aunt called ร้าน, and "ป้ายไวนิล" is not an aunt called ยไวนิล.
  '(?<!ห)น้า',
  'ป้า(?!ย)',
];
// ลูกค้าที่เป็นหน่วยงาน — "รพสตบ้านชี", "โรงเรียนบ้านหนอง", "อบต.นาดี"
// เรียงยาวไปสั้น เพื่อให้ "รพ.สต." ชนะ "รพ."
const ORG_PREFIXES = [
  'รพ\\.?\\s?สต\\.?',
  'โรงพยาบาลส่งเสริมสุขภาพตำบล',
  'โรงพยาบาล',
  'รพ\\.',
  'โรงเรียน',
  'ร\\.?ร\\.',
  'มหาวิทยาลัย',
  'เทศบาล',
  'อบต\\.?',
  'อบจ\\.?',
  'สำนักงาน',
  'บริษัท',
  'หจก\\.?',
  'วัด',
  'ร้าน',
];

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

// คำที่ตามหลังคำนำหน้าแล้วแปลว่า "ไม่ใช่ชื่อ" — กัน "ป้ายวัดขนาด 2x3"
// กลายเป็นลูกค้าชื่อ "วัดขนาด"
// A second line of defence: even if an honorific matches by accident, these
// are words about the work, never a person's name.
const NOT_A_NAME =
  /^(ขนาด|ราคา|จำนวน|ไวนิล|สติกเกอร์|สติ๊กเกอร์|ป้าย|งาน|ทำ|ละ|ค่า|กว้าง|ยาว|หน้า|ร้าน|พิมพ์|โฟม|สี|ตรา|บาท)/;

// Pull out a customer name: an honorific + name (พี่นก), an organisation
// (รพสตบ้านชี, โรงเรียนบ้านหนอง), else "ร้าน<name>".
export function extractCustomer(text) {
  const honor = new RegExp(`(${HONORIFICS.join('|')})\\s*([ก-๙A-Za-z]{1,20})`);
  const m = text.match(honor);
  if (m && !NOT_A_NAME.test(m[2])) {
    // `match` is the fragment, and `index` where it began. A caller reading a
    // whole heading line needs to know where the name starts in it, so it can
    // keep what follows ("ผอ กิ้ก โรงเรียนบ้านนาบง") without also keeping what
    // came before ("งานงานบุญ" in front of "วัดบ้านชี").
    return {
      customerName: `${m[1]}${m[2]}`.replace(/\s+/g, ''),
      rest: text.replace(m[0], ' '),
      match: m[0],
      index: m.index,
    };
  }

  const org = text.match(new RegExp(`(${ORG_PREFIXES.join('|')})\\s*([ก-๙A-Za-z]{2,20})`));
  if (org && !NOT_A_NAME.test(org[2])) {
    return {
      customerName: `${org[1]}${org[2]}`.replace(/\s+/g, ''),
      rest: text.replace(org[0], ' '),
      match: org[0],
      index: org.index,
    };
  }

  return { customerName: null, rest: text, match: null, index: -1 };
}

// Units left stranded once the size has been lifted out: "ป้ายไวนิล 200x100 ซม."
// keeps its size in its own field, so the bare "ซม." that stays behind is not
// part of the name. Matched as whole tokens, never as substrings — Thai has no
// word spacing, and stripping a bare "ม" would turn "โฟมบอร์ด" into "โฟบอร์ด".
const LEFTOVER_UNITS = new Set([
  'ซม', 'ซม.', 'ซ.ม.', 'ซ.ม', 'เซนติเมตร',
  'มม', 'มม.', 'มิลลิเมตร',
  'ม.', 'เมตร', 'ตร.ม.', 'ตร.ม', 'ตรม', 'ตรม.', 'ตารางเมตร',
  'นิ้ว', 'ฟุต', 'หลา',
]);

function cleanItemName(working) {
  const stripped = working
    .replace(/วันนี้|เมื่อวาน|พรุ่งนี้|ทำ|ทํา|งาน|ให้|ค่ะ|คะ|ครับ|นะ|บาท|฿/g, ' ')
    .replace(/ร้าน/g, ' ')
    .replace(/\d[\d,]*(?:\.\d+)?/g, ' ')
    // "ไวนิล = 0.80X1.80 165" left the "=" sitting in the name once the numbers
    // went. Separators are how the shop writes, never part of what they made.
    .replace(/[=＝+*/|~<>]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return stripped
    .split(' ')
    .filter((word) => word && !LEFTOVER_UNITS.has(word))
    .join(' ')
    .trim();
}

// จำนวนผืน/ป้ายในบรรทัดที่คิดราคาแบบตารางเมตร
function extractPieces(working) {
  const byUnit = working.match(new RegExp(`(\\d+)\\s*(${UNIT_WORDS.join('|')})`));
  if (byUnit) return { pieces: toNumber(byUnit[1]) || 1, rest: working.replace(byUnit[0], ' ') };
  const byX = working.match(/(?:x|×|จำนวน)\s*(\d+)/i);
  if (byX) return { pieces: toNumber(byX[1]) || 1, rest: working.replace(byX[0], ' ') };
  return { pieces: 1, rest: working };
}

// Parse a single free-form line into one item, understanding "ป้ายละ 350"
// (price per unit) and "2 ป้าย" (leading quantity + unit).
function parseSingleLine(line) {
  let working = ` ${String(line || '').replace(/\s+/g, ' ').trim()} `;

  // "ไวนิล ขนาด 160*300 ตรมละ 165" — คิดพื้นที่ให้ก่อน ไม่งั้น "ละ 165"
  // จะถูกอ่านเป็นราคาต่อชิ้น
  const area = parseAreaPricing(working);
  if (area) {
    const { pieces, rest } = extractPieces(area.rest);
    const itemName = cleanItemName(rest) || 'งานป้าย';
    const item = areaItem(area, { itemName, pieces });
    // ติดวิธีคิดไว้กับรายการ ให้ผู้เรียกเก็บลงหมายเหตุ ไม่ใช่ลงใบเสร็จ
    item.working = areaWorking(area, { itemName, pieces });
    return item;
  }

  let size = null;
  const sizeM = working.match(/(\d+(?:\.\d+)?\s*[xX×*]\s*\d+(?:\.\d+)?)/);
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

  let itemName = cleanItemName(working);
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

// A line that is nothing but "รวม 4,900" — the shop's own price for the lot.
//
// The bot works out 4,887.97 and the shop charges 4,900, or 4,880, or whatever
// they and the customer settled on. Every line still shows what it was worked
// out from; this is the number at the bottom of the receipt.
//
// The whole line has to be the keyword and the number: an item line always has
// more on it than that, so "ไวนิลรวมมิตร 100*200ซม ตรมละ 165" is never mistaken
// for a total.
const GRAND_TOTAL_RE =
  /^(?:ยอด)?(?:รวม(?:ทั้งหมด|ทั้งสิ้น|เป็น)?|ราคารวม|เหมา(?:ทั้งหมด|หมด)?|คิด(?:รวม)?|สรุป|ทั้งหมด|ปัด(?:เศษ)?(?:เป็น)?)\s*(?:เป็น|ที่|[=:])?\s*฿?\s*(\d[\d,]*(?:\.\d+)?)\s*(?:บาท|฿)?$/;

export function extractGrandTotal(text) {
  let total = null;
  const rest = [];
  for (const line of String(text || '').split('\n')) {
    const m = GRAND_TOTAL_RE.exec(line.trim());
    const amount = m ? toNumber(m[1]) : 0;
    // Every one of these comes out, not just the one that wins: a shop that
    // changes its mind types the new figure below the old, and a leftover
    // "รวม 3,200" parses as an item worth 3,200 that nobody made.
    if (amount > 0) total = round2(amount);
    else rest.push(line);
  }
  return { total, rest: rest.join('\n') };
}

// A line with no digit anywhere in it can be priced at nothing and measured as
// nothing. On a note whose other lines do have numbers, it is the heading —
// who the work is for, or what the batch is — never something that was made.
//
// "ผอ กิ้ก โรงเรียนบ้านนาบง" on the first line used to come back as an item
// costing ฿0, printed on the customer's own receipt under their own name.
function splitHeading(lines) {
  if (lines.length < 2) return { heading: null, body: lines };
  const body = lines.filter((l) => /\d/.test(l));
  if (!body.length || body.length === lines.length) return { heading: null, body: lines };
  return { heading: lines.filter((l) => !/\d/.test(l)).join(' ').replace(/\s+/g, ' ').trim() || null, body };
}

// Parse a whole message into a normalized job draft.
export function parseNaturalJob(rawText) {
  const text = String(rawText || '');
  const paid = extractPaid(text);
  const grand = extractGrandTotal(paid.rest);

  const { heading, body } = splitHeading(
    grand.rest.split('\n').map((l) => l.trim()).filter(Boolean)
  );

  // The heading names the customer when it reads like one — and then the whole
  // line is the name, not just the two words the pattern matched: this shop
  // writes "ผอ กิ้ก โรงเรียนบ้านนาบง", and a receipt made out to "ผอกิ้ก" has
  // lost the half that says which school. When it does not read like a
  // customer it is the name of the job, which beats one derived from the items.
  // "ลูกค้า" / "ชื่อลูกค้า" are labels on the line, never part of the name.
  const named = heading ? heading.replace(/(?:ชื่อ)?ลูกค้า\s*:?\s*/g, '').trim() : null;
  const found = named ? extractCustomer(named) : null;
  // From where the name starts to the end of the line: "ผอ กิ้ก" is only half
  // of "ผอ กิ้ก โรงเรียนบ้านนาบง", and a receipt made out to the half has lost
  // which school it is for. Anything in front of the name is not part of it.
  const cust = found?.customerName
    ? { customerName: named.slice(found.index).trim(), rest: body.join('\n') }
    : extractCustomer(heading ? body.join('\n') : grand.rest);
  const headingIsCustomer = Boolean(found?.customerName);

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
  // A price the shop stated beats the one worked out from the lines. The gap
  // goes in `discount` so subtotal − discount = total still holds; rounding up
  // makes it negative, which is the shop charging more than the lines add to.
  const total = grand.total != null ? grand.total : subtotal;
  return {
    customerName: cust.customerName || null,
    jobName: headingIsCustomer ? null : heading,
    items,
    subtotal,
    discount: round2(subtotal - total),
    total,
    statedTotal: grand.total,
    paidAmount: round2(paid.paidAmount || 0),
  };
}
