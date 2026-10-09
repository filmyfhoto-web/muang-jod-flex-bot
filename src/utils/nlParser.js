import { parseJobText } from './parser.js';
import { round2, numText } from './currency.js';
import { parseAreaPricing, areaItem, areaWorking } from './area.js';
import { classifyItem } from './category.js';
import { subLine } from './itemLine.js';

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
  // งานกรอบรูปนับเป็นบาน — "กรอบรูป 2 บาน" เคยอ่านจำนวนไม่ออก (ได้ 1)
  // ต่อท้ายลิสต์เสมอ คำเดิมต้องชนะก่อนเหมือนเดิมทุกตัว
  'บาน', 'กรอบ',
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
  /* "25 กันยายน" ไม่ใช่ยายชื่อ "น"
   *
   * ร้านตอบคำถาม "นัดรับวันไหนคะ?" ว่า "25 กันยายน" แล้วม่วงตอบกลับว่า
   * "แก้ชื่อลูกค้าเป็น ยายนแล้วค่ะ นัดรับวันไหนคะ?" วนอยู่อย่างนั้น เพราะ
   * กัน+ยาย+น อ่านเป็นคำนำหน้า "ยาย" ตามด้วยชื่อ "น"
   *
   * กันยายนเป็นเดือนเดียวที่ชนกับคำนำหน้าในลิสต์นี้ กันเฉพาะจุดจึงพอ และยังจด
   * "ยายนวล" กับ "ยายน้อย" ได้เหมือนเดิม
   */
  '(?<!กัน)ยาย',
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
  /* "รร สบกอน" — ร้านเขียนย่อแบบไม่มีจุด
   *
   * ต้องอยู่ต้นคำเท่านั้น ไม่งั้น "ธรรม" "บรรทัด" "กรรไกร" จะกลายเป็นโรงเรียน
   * ชื่อ "ม" "ทัด" "ไกร" — "รร" สองตัวติดกันกลางคำไทยมีเยอะ
   */
  '(?<![ก-๙])รร\\.?',
  'มหาวิทยาลัย',
  'เทศบาล',
  'อบต\\.?',
  'อบจ\\.?',
  'สำนักงาน',
  'บริษัท',
  'หจก\\.?',
  // หน่วยงานที่ร้านนี้ออกใบเสร็จให้จริง — ธกส ทุ่งช้าง อยู่ในคิวงานของร้านอยู่แล้ว
  // แต่ไม่เคยถูกอ่านว่าเป็นหน่วยงาน เพราะไม่มีในลิสต์
  'ธ\\.?ก\\.?ส\\.?',
  'สหกรณ์',
  'กศน\\.?',
  'วัด',
  'ร้าน',
];

/* ชื่อนี้เป็นหน่วยงานไหม — ใช้ลิสต์เดียวกับตอนอ่านชื่อลูกค้าจากประโยค
 *
 * ส่งออกมาเป็นฟังก์ชัน ไม่ใช่ส่งลิสต์ออกไป เพื่อให้มีที่เดียวที่ตอบคำถามว่า
 * "อันนี้โรงเรียนหรือลูกค้าหน้าร้าน" — ก๊อปลิสต์ไปไว้อีกไฟล์เมื่อไหร่ ก็มีวันที่
 * สองที่ตอบไม่ตรงกัน แล้วงานเดียวกันอยู่คนละกองแล้วแต่ว่าถามจากตรงไหน
 */
export function isOrgCustomer(name) {
  const text = String(name || '').trim();
  if (!text) return false;
  return new RegExp(`^\\s*(?:${ORG_PREFIXES.join('|')})`).test(text);
}

function toNumber(s) {
  const v = parseFloat(String(s ?? '').replace(/,/g, ''));
  return Number.isFinite(v) ? v : 0;
}

/* ช่องทางเงินที่พูดติดท้ายประโยค — "อัดรูป 150 เงินสด" / "ป้าย 600 โอน" / "ตรายาง 300 ลงบัญชี"
 *
 * ร้านพูดแบบนี้จริง (V2: "พิมพ์น้อย จดไว") คำพวกนี้ไม่ใช่ชื่อของ และบอกความหมายเงินชัด:
 *   เงินสด/สด/จ่ายสด   → รับเป็นเงินสดแล้ว (ไม่บอกยอด = รับครบ)
 *   โอน/เงินโอน/พร้อมเพย์ → รับเป็นเงินโอนแล้ว
 *   ลงบัญชี             → ยังไม่ได้เงิน แต่ลงใบลงบัญชีวันนี้ไว้ (รอวางบิล)
 * เอาคำออกจากข้อความก่อนอ่านรายการ ไม่งั้นใบเสร็จขึ้นของชื่อ "อัดรูป เงินสด"
 */
const METHOD_TOKEN = /(?:^|[\s,·])(เงินสด|จ่ายสด|รับสด|สด|เงินโอน|พร้อมเพย์|สแกนจ่าย|โอนจ่าย|โอน|ลงบัญชี(?:ไว้)?)(?:แล้ว)?(?=[\s,·]|$)/u;
export function extractPayMethod(text) {
  const t = String(text ?? '');
  const m = METHOD_TOKEN.exec(t);
  if (!m) return { method: null, rest: t };
  const word = m[1];
  const method = /สด/.test(word) ? 'cash' : /ลงบัญชี/.test(word) ? 'account' : 'transfer';
  // "โอนแล้ว 300" เป็นของ extractPaid (ยอดมัดจำ+ช่องทาง) ไม่แตะตรงนี้
  if (/^โอน/.test(word) && /^\s*\d/.test(t.slice(m.index + m[0].length))) return { method: null, rest: t };
  return { method, rest: (t.slice(0, m.index) + ' ' + t.slice(m.index + m[0].length)).trim() };
}

// Pull out "received/deposit" amount, e.g. "รับมาแล้ว 300", "มัดจำ 500".
function extractPaid(text) {
  const re =
    /(?:รับ(?:มา)?(?:แล้ว|เงิน)?|มัดจำ|วางมัดจำ|จ่ายแล้ว|ชำระแล้ว|โอนแล้ว|โอนมา)\s*(?:มา)?\s*(\d[\d,]*(?:\.\d+)?)\s*(?:บาท|฿)?/;
  const m = text.match(re);
  if (!m) return { paidAmount: 0, method: null, rest: text };
  // "โอนแล้ว 300" บอกทั้งยอดและช่องทางในคำเดียว
  return { paidAmount: toNumber(m[1]), method: /โอน/.test(m[0]) ? 'transfer' : null, rest: text.replace(m[0], ' ') };
}

/* "จ่ายเงินแล้ว" เฉย ๆ ไม่มีตัวเลข = จ่ายครบ
 *
 * ร้านตอบว่า "รับไปแล้ว จ่ายเงินแล้ว" แล้วม่วงอ่านไม่ออกเลยสักคำ ทั้งที่นี่คือ
 * ประโยคที่ตอบคำถาม "แต่ละวันได้เงินเท่าไหร่" ตรงที่สุด — งานที่จ่ายแล้วคือเงิน
 * ที่เข้าร้านจริงในวันนั้น
 *
 * ต้องไม่มีตัวเลขตามมา ไม่งั้นจะไปทับ "มัดจำ 300" ซึ่งแปลว่าจ่ายบางส่วน
 */
const PAID_IN_FULL_RE =
  /(?:จ่าย(?:เงิน)?|ชำระ(?:เงิน)?|โอน(?:เงิน)?|เก็บเงิน|รับเงิน|คิดเงิน)\s*(?:ครบ|เต็ม)?\s*แล้ว(?!\s*\d)/;

export function saysPaidInFull(text) {
  return PAID_IN_FULL_RE.test(String(text || ''));
}

// คำที่ตามหลังคำนำหน้าแล้วแปลว่า "ไม่ใช่ชื่อ" — กัน "ป้ายวัดขนาด 2x3"
// กลายเป็นลูกค้าชื่อ "วัดขนาด"
// A second line of defence: even if an honorific matches by accident, these
// are words about the work, never a person's name.
const NOT_A_NAME =
  /^(ขนาด|ราคา|จำนวน|ไวนิล|สติกเกอร์|สติ๊กเกอร์|ป้าย|งาน|ทำ|ละ|ค่า|กว้าง|ยาว|หน้า|ร้าน|พิมพ์|โฟม|สี|ตรา|บาท)/;

/* คำกริยาที่ร้านพิมพ์ติดท้ายชื่อคน — "น้องป่านสั่ง" คือน้องป่านเป็นคนสั่ง
 *
 * ภาษาไทยไม่เว้นวรรค ตัวจับชื่อจึงกวาดคำที่ติดมาข้างหลังไปด้วยทั้งคำ ใบเสร็จ
 * เลยออกในชื่อ "น้องป่านสั่ง" ซึ่งไม่ใช่ชื่อใคร
 *
 * ตัดเฉพาะที่ "ท้ายชื่อ" และเฉพาะคำที่เป็นกริยาสั่งงานชัด ๆ เท่านั้น และต้อง
 * เหลือชื่ออย่างน้อยสองตัวอักษร — ตัดพลาดแปลว่าออกใบเสร็จผิดคน
 */
const NAME_TAIL_RE = /(?:มาสั่ง|สั่งของ|สั่งมา|สั่ง|ฝากมา|ฝาก)$/;

export function trimNameTail(name) {
  const clean = String(name || '').trim();
  const cut = clean.replace(NAME_TAIL_RE, '');
  return cut.length >= 2 ? cut : clean;
}

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
      customerName: trimNameTail(`${m[1]}${m[2]}`.replace(/\s+/g, '')),
      rest: text.replace(m[0], ' '),
      match: m[0],
      index: m.index,
    };
  }

  const org = text.match(new RegExp(`(${ORG_PREFIXES.join('|')})\\s*([ก-๙A-Za-z]{2,20})`));
  if (org && !NOT_A_NAME.test(org[2])) {
    return {
      customerName: trimNameTail(`${org[1]}${org[2]}`.replace(/\s+/g, '')),
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

/* คำที่ร้านพิมพ์ติดมาแต่ไม่ใช่ชื่อของ
 *
 * ร้านบอกว่า "เขาพิมพ์ไป ม่วงก็จดไม่ได้ ไม่เข้าใจ" พร้อมตัวอย่างจริง:
 *   "พี่ต่าย สั่งสติ๊กเกอร์ ติดของที่ระลึก ออกแบบใส่ชุดตชด ด้วย 50 ดวง ขนาด 5*6.5"
 * ชื่อรายการที่ได้คือทั้งประโยค — "สั่งสติ๊กเกอร์ ติดของที่ระลึก ออกแบบใส่ชุดตชด
 * ด้วย ขนาด" ซึ่งบนการ์ดอ่านแล้วเหมือนม่วงไม่เข้าใจอะไรเลย
 *
 * ตัดเป็น "คำ" เท่านั้น ห้ามตัดเป็นตัวอักษรกลางคำ — ภาษาไทยไม่เว้นวรรค การลบ
 * "ขอ" แบบ substring จะทำให้ "ติดของที่ระลึก" กลายเป็น "ติดงที่ระลึก"
 */
const NOISE_WORDS = new Set([
  'ด้วย', 'หน่อย', 'ขนาด', 'ไซส์', 'ไซซ์', 'จำนวน', 'ราคา',
  'สั่ง', 'ขอ', 'เอา', 'อยาก', 'อยากได้', 'ช่วย', 'จด', 'รับ', 'และ',
  // "ขอตรายาง ของโรงเรียนเปียงซ้อ" — พอชื่อลูกค้าถูกยกออกไป เหลือ "ของ" ลอยอยู่
  // คำเดียวโดด ๆ เป็นคำเชื่อม ไม่ใช่ชื่อของ ("ของที่ระลึก" เป็นคนละคำ ไม่โดน)
  'ของ',
  // "คนสั่งน้องทีน" — พอชื่อคนถูกยกออกไป เหลือ "คนสั่ง" ลอยอยู่
  'คนสั่ง',
]);

/* คำนำหน้าที่ติดหัวชื่อของมาเลย: "สั่งสติ๊กเกอร์" "ขอทำป้าย"
 *
 * ตัดได้ต่อเมื่อส่วนที่เหลือยังเป็นชื่อของที่ระบบรู้จัก — ไม่งั้น "ของที่ระลึก"
 * ที่ขึ้นต้นด้วย "ขอ" เหมือนกัน จะกลายเป็น "งที่ระลึก"
 */
const LEAD_VERB_RE = /^(?:สั่งทำ|สั่ง|ขอทำ|ขอ|อยากได้|อยาก|เอา|ช่วย|รับทำ|จด)/;

function stripLeadVerb(word) {
  const m = LEAD_VERB_RE.exec(word);
  if (!m) return word;
  const rest = word.slice(m[0].length);
  return rest.length >= 2 && classifyItem(rest) ? rest : word;
}

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
    .map((word) => stripLeadVerb(word))
    .filter((word) => word && !LEFTOVER_UNITS.has(word) && !NOISE_WORDS.has(word))
    .join(' ')
    .trim();
}

/* ชื่อของ กับ รายละเอียดของงาน เป็นคนละเรื่องกัน
 *
 * "สติ๊กเกอร์ ติดของที่ระลึก ออกแบบใส่ชุดตชด" — คำแรกคือของที่ทำ ที่เหลือคือ
 * สิ่งที่ร้านต้องรู้ตอนลงมือทำ ยัดรวมกันเป็นชื่อเดียวแล้วมันยาวจนใบเสร็จอ่านไม่รู้
 * เรื่อง และจัดหมวดหมู่งานไม่ได้
 *
 * ตัวตัดสินว่าคำไหนคือ "ของ" คือ classifyItem ตัวเดียวกับที่ใช้จัดหมวดงาน —
 * ที่ไหนที่ระบบรู้ว่านี่คือสติ๊กเกอร์ ที่นั่นคือชื่อของ ส่วนที่เหลือคือรายละเอียด
 * ถ้าไม่มีคำไหนรู้จักเลย ก็เก็บทั้งก้อนเป็นชื่อเหมือนเดิม ดีกว่าเดาแล้วผิด
 */
export function splitNameDetail(name) {
  const words = String(name || '').split(' ').filter(Boolean);
  if (words.length < 2) return { name: String(name || '').trim(), detail: null };
  const hit = words.findIndex((w) => classifyItem(w));
  if (hit === -1) return { name: words.join(' '), detail: null };
  const detail = words.filter((_, i) => i !== hit).join(' ').trim();
  return { name: words[hit], detail: detail || null };
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
/* "1*1.5*700*2=2,100" — เลขหลังเท่ากับคือยอดที่ร้านคิดมาเองแล้ว
 *
 * ร้านพิมพ์วิธีคิดพร้อมคำตอบมาในบรรทัดเดียว บางบรรทัดมีบวกเพิ่มด้วย
 * ("1,428+200=1,628" — ค่าขาตั้ง) เลขตัวสุดท้ายหลังเท่ากับตัวสุดท้ายคือยอดจริง
 *
 * เชื่อเลขที่ร้านเขียนดีกว่าคิดเอง: มันคือยอดที่ร้านจะเก็บลูกค้าจริง ๆ และการ
 * ที่ร้านอุตส่าห์พิมพ์มาแปลว่าเขาคิดแล้ว ส่วนที่เหลือของบรรทัดยังอ่านต่อได้
 * ตามปกติ เพื่อเอาขนาดกับจำนวนขึ้นใบเสร็จ
 */
const STATED_TOTAL_RE = /=\s*(\d[\d,]*(?:\.\d+)?)\s*$/;

export function statedLineTotal(line) {
  const m = STATED_TOTAL_RE.exec(String(line || '').trim());
  if (!m) return null;
  const total = toNumber(m[1]);
  return total > 0 ? total : null;
}

/* ขั้นตอนสุดท้ายที่ร้านเขียน: "ราคาต่อชิ้น × จำนวน = ยอด"
 *
 * ร้านอธิบายวิธีคิดที่ต้องการมาเป็นบรรทัด ๆ:
 *   "ป้ายเกษียณ 1.2*1.7*600 = 900   900*2=1800"
 *                             ↑ ต่อชิ้น  ↑ จำนวน  ↑ ยอด
 * จำนวนอยู่ในขั้นตอนสุดท้ายนี้เท่านั้น ไม่ได้เขียนเป็นคำว่า "2 อัน" ทุกบรรทัด
 * ถ้าไม่อ่าน ป้ายเกษียณจะออกมาชิ้นเดียวทั้งที่ลูกค้าสั่งสอง
 *
 * รับเฉพาะเมื่อ "ต่อชิ้น × จำนวน" เท่ากับยอดที่ร้านเขียนพอดี — เส้นแบ่งนี้คือ
 * ทั้งหมดที่กันไม่ให้ขนาดถูกอ่านเป็นจำนวน: "ป้าย 100*150 = 600" ก็ลงรูปแบบ
 * เดียวกันเป๊ะ แต่ 100 × 150 ไม่เท่ากับ 600 จึงไม่ใช่ขั้นตอนคิดเงิน — ถ้ารับไป
 * ลูกค้าจะโดนคิด 150 ชิ้น
 */
const LAST_STEP_RE = /(\d[\d,]*(?:\.\d+)?)\s*[*x×]\s*(\d+)\s*$/i;

function finalStep(raw, stated) {
  const last = raw.lastIndexOf('=');
  if (last === -1) return null;
  // เฉพาะช่วงหลังเท่ากับตัวก่อนหน้า ไม่งั้นจะคว้าตัวคูณจากคนละขั้นตอน
  const seg = raw.slice(raw.lastIndexOf('=', last - 1) + 1, last).trim();
  const m = LAST_STEP_RE.exec(seg);
  if (!m) return null;
  const perPiece = toNumber(m[1]);
  const count = toNumber(m[2]);
  if (!(perPiece > 0) || !(count > 0)) return null;
  if (Math.abs(perPiece * count - stated) > 0.009) return null;
  return { count, match: m[0].trim() };
}

function dropLast(text, fragment) {
  const at = text.lastIndexOf(fragment);
  return at === -1 ? text : `${text.slice(0, at)} ${text.slice(at + fragment.length)}`;
}

function parseSingleLine(line) {
  const raw = String(line || '').replace(/\s+/g, ' ').trim();
  /* ยอดที่ร้านคิดมาเอง และส่วนที่เหลือของบรรทัดหลังตัดวิธีคิดออก
   *
   * ตัดตั้งแต่เครื่องหมายเท่ากับตัวแรกไปจนจบ เพราะทุกอย่างหลังจากนั้นคือ
   * การคิดเลข ไม่ใช่ของที่ลูกค้าสั่ง ("=1,428+200=1,628")
   */
  const stated = statedLineTotal(raw);
  const step = stated == null ? null : finalStep(raw, stated);
  let head = stated != null ? raw.slice(0, raw.indexOf('=')) : raw;
  // ขั้นตอนสุดท้ายบางทีอยู่ก่อนเท่ากับตัวแรก ("ชุดละ 1400  1400*2=2800") ถ้า
  // ปล่อยไว้ "1400*2" จะถูกอ่านเป็นขนาดของงาน
  if (step) head = dropLast(head, step.match);
  let working = ` ${head.replace(/\s+/g, ' ').trim()} `;

  // "ไวนิล ขนาด 160*300 ตรมละ 165" — คิดพื้นที่ให้ก่อน ไม่งั้น "ละ 165"
  // จะถูกอ่านเป็นราคาต่อชิ้น
  const area = parseAreaPricing(working);
  if (area) {
    const found = extractPieces(area.rest);
    // จำนวนที่เขียนเป็นตัวคูณที่สี่ ชนะการเดาจากคำ ("2 แผ่น") เพราะมันอยู่ใน
    // สูตรที่ร้านเขียนเอง
    const pieces = step?.count || area.pieces || found.pieces;
    const rest = found.rest;
    /* แยกชื่อของออกจากรายละเอียด เหมือนทางที่ไม่ได้คิดตามพื้นที่
     *
     * ของเดิมทางนี้ข้ามการแยก ชื่อรายการจึงกลายเป็นทั้งก้อน — "โฟมบอร์ด รร
     * สบกอน" แทนที่จะเป็นชื่อ "โฟมบอร์ด" กับรายละเอียด "รร สบกอน" ทั้งที่อีก
     * ทางหนึ่งแยกให้อยู่แล้ว งานเดียวกันจึงหน้าตาไม่เหมือนกันแค่เพราะคิดราคา
     * คนละแบบ
     */
    const split = splitNameDetail(cleanItemName(rest) || 'งานป้าย');
    const itemName = split.name;
    const item = areaItem(area, { itemName, pieces });
    item.detail = split.detail;
    item.size = subLine(area.sizeLabel, split.detail, itemName);
    // ติดวิธีคิดไว้กับรายการ ให้ผู้เรียกเก็บลงหมายเหตุ ไม่ใช่ลงใบเสร็จ
    item.working = areaWorking(area, { itemName, pieces });
    if (stated != null) applyStated(item, stated);
    return item;
  }

  let size = null;
  const sizeM = working.match(/(\d+(?:\.\d+)?\s*[xX×*]\s*\d+(?:\.\d+)?)/);
  if (sizeM) {
    // ร้านพิมพ์คูณมาได้หลายแบบ (5*6.5, 5x6.5, 5 × 6.5) บนใบเสร็จให้เป็นแบบเดียว
    size = sizeM[1].replace(/\s+/g, '').replace(/[xX*×]/, ' × ');
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

  const split = splitNameDetail(itemName);
  const item = {
    item_name: split.name,
    // ขนาดกับรายละเอียดอยู่ช่องเดียวกัน ตามที่ตาราง job_items มีให้ และตรงกับ
    // ที่ฟอร์มจดงานส่งมา — ใบเสร็จกับใบสรุปจึงพิมพ์ออกมาเหมือนกันทั้งสองทาง
    size: subLine(size, split.detail, split.name),
    detail: split.detail,
    // จำนวนในขั้นตอนคิดเงินที่ร้านเขียนเอง ชนะการเดาจากคำในบรรทัด
    quantity: step?.count || quantity,
    unit: unitWord || null,
    unit_price: round2(unitPrice),
    total: round2(unitPrice * quantity),
  };
  if (stated != null) applyStated(item, stated);
  return item;
}

/* ยอดที่ร้านเขียนเองชนะยอดที่คิดได้
 *
 * ราคาต่อชิ้นคิดย้อนจากยอดที่ร้านเขียน เพื่อให้ "ราคา × จำนวน = ยอด" บนใบเสร็จ
 * ยังบวกกันได้ลงตัว ไม่ใช่โชว์ยอดของร้านแต่ราคาต่อชิ้นเป็นของเรา
 */
function applyStated(item, stated) {
  const count = Number(item.quantity) > 0 ? Number(item.quantity) : 1;
  const computed = round2(Number(item.total) || 0);
  item.total = round2(stated);
  item.unit_price = round2(stated / count);

  /* วิธีคิดต้องจบที่ยอดเดียวกับที่ขึ้นใบเสร็จ
   *
   * "0.6*1.7*700*2=1,428+200=1,628" — ค่าขาตั้ง 200 ที่ร้านบวกเพิ่มไม่ได้อยู่
   * ในสูตรพื้นที่ บรรทัดวิธีคิดจึงจบที่ 1,428 ทั้งที่ราคาบนการ์ดเป็น 1,628
   * ร้านอ่านแล้วนึกว่าม่วงคิดผิด ทั้งที่ยอดถูก — ต่อท้ายให้เห็นว่าส่วนต่างมา
   * จากที่ร้านเขียนมาเอง
   */
  if (item.working && Math.abs(computed - item.total) > 0.009) {
    item.working += ` → ร้านคิด ${numText(item.total)}`;
  }
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
/* ร้านโชว์วิธีคิดไว้ในบรรทัดสรุปด้วย: "ทั้งหมด 6*50 = *300*"
 *
 * ของเดิมรับได้แต่ "รวม 300" เปล่า ๆ บรรทัดที่มีตัวคูณนำหน้าจึงตกไปเป็น
 * "รายการชื่อ ทั้งหมด ขนาด 6 × 50 ราคา 300" — กลายเป็นงานที่สี่ที่ไม่มีอยู่จริง
 * แล้วยอดรวมของกองก็บวกเกินไปหนึ่งเท่า
 *
 * ดาวคร่อมตัวเลขเป็นการเน้นข้อความแบบที่คนพิมพ์ในไลน์ ไม่ใช่ตัวคูณ
 */
const TOTAL_WORD =
  '(?:ยอด)?(?:รวม(?:ทั้งหมด|ทั้งสิ้น|เป็น)?|ราคารวม|เหมา(?:ทั้งหมด|หมด)?|คิด(?:รวม)?|สรุป|ทั้งหมด|ปัด(?:เศษ)?(?:เป็น)?)';

const GRAND_TOTAL_RE = new RegExp(
  `^${TOTAL_WORD}\\s*(?:[\\d,.\\s*x×+]*=)?\\s*(?:เป็น|ที่|[=:])?\\s*\\*?\\s*฿?\\s*(\\d[\\d,]*(?:\\.\\d+)?)\\s*\\*?\\s*(?:บาท|฿)?$`
);

/* บรรทัดสรุปที่มีคำพูดต่อท้าย — "ทั้งหมด 2100+2100+1800+2800 = 8,800. มันต้องคิดแบบนี้"
 *
 * ร้านคุยกับม่วงต่อในบรรทัดเดียวกับยอด แบบข้างบนต้องจบที่ตัวเลขพอดีถึงจะรับ
 * บรรทัดนี้จึงตกไปเป็น "รายการชื่อ ทั้งหมด ราคา 8,800" — บวกยอดทั้งกองซ้ำอีก
 * รอบบนใบเสร็จ
 *
 * ปล่อยให้ต่อท้ายได้เฉพาะเมื่อร้านเขียนวิธีคิดมาด้วย (มีเครื่องหมายเท่ากับ)
 * เพราะนั่นคือสิ่งที่บอกว่าเลขตัวนี้เป็นผลลัพธ์ ไม่ใช่จำนวน — "ทั้งหมด 2 ป้าย"
 * ไม่มีเท่ากับ จึงยังเป็นของที่สั่ง ไม่ใช่ยอดรวมสองบาท
 */
const GRAND_TOTAL_WORKING_RE = new RegExp(
  // จุดปิดประโยคไม่ใช่จุดทศนิยม — "= 8,800. มันต้องคิดแบบนี้" ยอดคือ 8,800
  // ไม่ใช่ 8 (ถ้าห้ามจุดตามหลังเฉย ๆ ตัวจับจะถอยไปเอาแค่หลักแรก)
  `^${TOTAL_WORD}\\s*[\\d,.\\s*x×+]+=\\s*\\*?\\s*฿?\\s*(\\d[\\d,]*(?:\\.\\d+)?)(?!\\d|\\.\\d)`
);

export function extractGrandTotal(text) {
  let total = null;
  const rest = [];
  for (const line of String(text || '').split('\n')) {
    const m = GRAND_TOTAL_RE.exec(line.trim()) || GRAND_TOTAL_WORKING_RE.exec(line.trim());
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

/* ดาวคร่อมตัวเลขคือการเน้นข้อความ ไม่ใช่ตัวคูณ
 *
 * ร้านพิมพ์ "= *1,050*  2 อัน 1050*2 = *2,100*" — ดาวคู่ที่คร่อมเลขไว้เป็นวิธี
 * เน้นข้อความแบบที่คนพิมพ์ในไลน์ แต่ดาวเป็นเครื่องหมายคูณของเราด้วย ยอดที่ร้าน
 * เขียนไว้ท้ายบรรทัดจึงอ่านไม่ออกเพราะมีดาวปิดท้าย แล้วม่วงก็ไปคิดเลขเอง
 *
 * ตัวคูณจริงไม่มีช่องว่างหรือเท่ากับนำหน้า ("1050*2") ส่วนดาวเน้นข้อความมาเป็น
 * คู่คร่อมตัวเลขไว้พอดี — เอาออกเฉพาะคู่ที่คร่อมครบ
 */
export function stripEmphasis(text) {
  return String(text ?? '').replace(/(?<![\d.])\*\s*(\d[\d,]*(?:\.\d+)?)\s*\*(?!\d)/g, '$1');
}

/* Parse a whole message into a normalized job draft.
 *
 * `opts.customerKnown` says the caller already knows whose job this is, so the
 * line carries none: the shop wrote the customer on a heading line above and
 * these are the things they ordered. Without it "รูปครูยิ้ม 1*1.5*700*2" reads
 * as a customer called ครูยิ้ม and the item is left named "รูป" — two of those
 * on one receipt and nobody can tell which picture is which.
 */
export function parseNaturalJob(rawText, opts = {}) {
  const text = stripEmphasis(rawText);
  /* "จ่ายเงินแล้ว" ไม่มีตัวเลข = จ่ายครบ — เอาวลีออกจากข้อความก่อนอ่านรายการ
   * ไม่งั้นมันจะไปติดอยู่ในชื่อของ ("กรอบรูป จ่ายแล้ว")
   */
  const paidInFull = saysPaidInFull(text);
  const paidByTransferInFull = paidInFull && /โอน(?:เงิน)?\s*(?:ครบ|เต็ม)?\s*แล้ว/.test(text);
  const cleanedText = paidInFull ? text.replace(PAID_IN_FULL_RE, ' ') : text;
  const paid = extractPaid(cleanedText);
  const pm = extractPayMethod(paid.rest);
  const payMethod = pm.method || paid.method || (paidByTransferInFull ? 'transfer' : null);
  const grand = extractGrandTotal(pm.rest);

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
  const found = opts.customerKnown || !named ? null : extractCustomer(named);
  // From where the name starts to the end of the line: "ผอ กิ้ก" is only half
  // of "ผอ กิ้ก โรงเรียนบ้านนาบง", and a receipt made out to the half has lost
  // which school it is for. Anything in front of the name is not part of it.
  const rest = heading ? body.join('\n') : grand.rest;
  const cust = found?.customerName
    ? { customerName: trimNameTail(named.slice(found.index).trim()), rest: body.join('\n') }
    : opts.customerKnown
      ? { customerName: null, rest }
      : extractCustomer(rest);
  const headingIsCustomer = Boolean(found?.customerName);

  // Drop the label word "ลูกค้า" so it can't be parsed as an item.
  const cleaned = cust.rest.replace(/ลูกค้า/g, ' ');
  const lines = cleaned.split('\n').map((l) => l.trim()).filter(Boolean);

  /* หัวเรื่องบอกว่าทำอะไร บรรทัดล่างบอกรายละเอียดของอันนั้น = ของชิ้นเดียว
   *
   * ร้านพิมพ์งานหนึ่งงานเป็นสามบรรทัด:
   *   งานไวนิล งานสีดำน้องป่านสั่ง
   *   ขนาด 0.6*1.6  1 ผืน
   *   200 บาท
   * ของเดิมนับบรรทัดล่างเป็นคนละรายการ ใบเสร็จจึงมีของสองอย่างที่ลูกค้าสั่งมา
   * อย่างเดียว แถมคิดเงินได้ ฿201 แทนที่จะเป็น ฿200
   *
   * ตัวตัดสินคือ "บรรทัดล่างมีชื่อของเป็นของตัวเองไหม" — ใช้ classifyItem
   * ตัวเดียวกับที่ใช้จัดหมวดงาน ถ้าทุกบรรทัดไม่มีชื่อของเลย แปลว่ามันเป็น
   * รายละเอียดของสิ่งที่เขียนไว้บนหัวเรื่อง ไม่ใช่ของคนละชิ้น
   * ("สติ๊กเกอร์ 50 ดวง" กับ "ตรายาง 1 อัน" ต่างมีชื่อของ จึงยังแยกกันเหมือนเดิม)
   *
   * ชื่อของอยู่บนหัวเรื่อง ต้องเอามาด้วย ไม่งั้นรายการจะไม่มีชื่อ
   */
  const headText = headingIsCustomer ? named.slice(0, found.index).trim() : heading || '';
  const detailsOnly =
    lines.length > 1 && Boolean(heading) && lines.every((line) => !classifyItem(line));

  let items;
  if (detailsOnly) {
    items = [parseSingleLine([headText, ...lines].filter(Boolean).join(' '))];
  } else if (lines.length > 1) {
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
    // บอกว่าจ่ายแล้วโดยไม่บอกจำนวน = จ่ายเต็มยอด ซึ่งคือคำตอบของ "วันนี้ได้เงิน
    // เท่าไหร่" — แต่ถ้าบอกจำนวนมาด้วย เชื่อจำนวนนั้น (มัดจำคือจ่ายบางส่วน)
    // บอกช่องทางมาเฉย ๆ ("อัดรูป 150 เงินสด") = รับครบแล้วทางนั้น — ภาษาหน้าร้านจริง
    // ยกเว้น "ลงบัญชี" ที่แปลว่ายังไม่ได้เงิน แค่ลงใบลงบัญชีไว้
    paidAmount: round2(
      paid.paidAmount || (paidInFull || (payMethod && payMethod !== 'account') ? total : 0)
    ),
    payMethod,
  };
}
