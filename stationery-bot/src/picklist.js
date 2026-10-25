// A customer's order written as a list in the chat:
//
//   ไม้กวาดทางมะพร้าว=10
//   น้ำยาล้างห้องน้ำ=2แพค
//
// The bot cannot take such an order itself, but it can recognise it, tidy it into lines and tell the admins (server.js),
// so nobody has to find it in the chat. Pure functions: easy to test, nothing here talks to LINE.

// Units a customer writes after a number ("2 แพค", "1 แกลอน"). Needed only for lines with no "=" or "x" in them.
const UNITS = [
  'อัน', 'ชิ้น', 'ด้าม', 'เล่ม', 'แพค', 'แพ็ค', 'แพ็ก', 'กล่อง', 'ชุด', 'ใบ', 'แกลลอน', 'แกลอน', 'โหล', 'ห่อ', 'ถุง', 'ม้วน', 'รีม',
  'ขวด', 'แท่ง', 'คู่', 'ลัง', 'กระปุก', 'หลอด', 'ตัว', 'แผ่น', 'ก้อน', 'กิโล', 'กก.', 'ลิตร', 'เมตร', 'ลูก', 'ถัง', 'กระป๋อง', 'ซอง',
];
const unitsRe = UNITS.map((u) => u.replace(/\./g, '\\.')).join('|');
const NUM = '(\\d{1,5}(?:[.,]\\d{1,2})?)';
const NAME = '(.{2,80}?)';

// name = qty[unit]   ·   name : qty unit
const BY_EQUALS = new RegExp(`^${NAME}\\s*[=:：＝]\\s*${NUM}\\s*([^\\d\\s=:：＝][^\\n]{0,14})?$`);
// name x 5   ·   name × 5   ·   name*5 (an "x" counts only after a Thai letter, a space or a digit — never inside "Max")
const BY_TIMES = new RegExp(`^${NAME}\\s*(?:(?<=[\\u0E00-\\u0E7F\\s\\d)])[xX]|[×✕*])\\s*${NUM}\\s*([^\\d\\s][^\\n]{0,14})?$`);
// name 5 unit
const BY_UNIT = new RegExp(`^${NAME}\\s+${NUM}\\s*(${unitsRe})$`);

const BULLET = /^\s*(?:[-•·*●▪]|\d{1,2}[.)])\s*/;
const hasLetter = (s) => /[฀-๿a-zA-Z]/.test(s);

function parseLine(raw) {
  const line = String(raw).replace(BULLET, '').trim();
  if (!line) return null;
  const m = BY_EQUALS.exec(line) || BY_TIMES.exec(line) || BY_UNIT.exec(line);
  if (!m) return null;
  const name = m[1].replace(/[\s:：=＝\-–]+$/u, '').trim();
  const qty = Number(String(m[2]).replace(',', '.'));
  if (!hasLetter(name) || !Number.isFinite(qty) || qty <= 0 || qty > 100000) return null;
  return { name, qty, unit: String(m[3] ?? '').trim() };
}

// → { items: [{ name, qty, unit }], note, lines } when the text is an order list, else null.
// A list = at least two item lines, and most of the lines are items (a header or a closing remark is fine).
export function parsePickList(text, { minItems = 2, maxLines = 60 } = {}) {
  const lines = String(text ?? '')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (lines.length < minItems || lines.length > maxLines) return null;
  const items = [];
  const rest = [];
  for (const line of lines) {
    const it = parseLine(line);
    if (it) items.push(it);
    else rest.push(line);
  }
  if (items.length < minItems || items.length / lines.length < 0.6) return null;
  return { items, note: rest.join(' ').slice(0, 200), lines: lines.length };
}

// The same list sent twice is one order: a short fingerprint of the words.
export function pickListKey(text) {
  const s = String(text ?? '').replace(/\s+/g, '');
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

export const fmtQty = (n) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));
export const itemLine = (it) => `${it.name} × ${fmtQty(it.qty)}${it.unit ? ' ' + it.unit : ''}`;

// What shows in the phone's banner.
export const pickListAltText = ({ customer, count }) => `📋 มีรายการสั่งจัดของ — ไลน์ชื่อ ${customer || 'ไม่ทราบชื่อ'} (${count} รายการ)`;

// The short version for the shop's web app notification (at most 240 characters).
export function pickListPushText({ customer, items }) {
  const head = `ไลน์ชื่อ ${customer || 'ไม่ทราบชื่อ'} · ${items.length} รายการ: `;
  let body = '';
  for (const it of items) {
    const next = (body ? ', ' : '') + itemLine(it);
    if ((head + body + next).length > 232) return head + body + ' …';
    body += next;
  }
  return head + body;
}
