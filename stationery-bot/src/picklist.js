// A customer's order written as a list in the chat:
//
//   ไม้กวาดทางมะพร้าว=10
//   น้ำยาล้างห้องน้ำ=2แพค
//
// The bot cannot take such an order itself, but it can recognise it, tidy it into lines and hand it to the shop (server.js →
// chatorders.js), so nobody has to find it in the chat. Pure functions: easy to test, nothing here talks to LINE.
//
// The reading rules are the ones the shop's web app uses when staff paste a LINE chat into a ใบสั่งจัด (back office, module
// projdocs "วางข้อความจาก LINE", 25 Oct 2026): ชื่อ=จำนวนหน่วย · ชื่อ:จำนวน · ชื่อ 10 อัน · 10 อัน ชื่อ · bullets, times and polite
// endings are stripped · any other line is a remark · "วันที่ 28" is the date the customer wants. Keep the two in step: what the bot
// recognises is what staff would get by pasting the same text.

// how customers spell a unit → how the shop's catalogue spells it
const UNIT_ALIAS = { 'แพค': 'แพ็ค', 'แพ็ก': 'แพ็ค', 'แพก': 'แพ็ค', 'แพ๊ค': 'แพ็ค', 'แกลอน': 'แกลลอน', 'กป': 'กระป๋อง', 'กล.': 'กล่อง', 'ม.': 'เมตร' };
export const UNITS = 'อัน|ชิ้น|ด้าม|แท่ง|กล่อง|ห่อ|แพ็ค|แพค|แพ็ก|แพก|แพ๊ค|โหล|ลัง|รีม|เล่ม|แผ่น|ม้วน|ขวด|แกลลอน|แกลอน|ถุง|ชุด|ตัว|ใบ|คู่|กระป๋อง|กป|ซอง|ก้อน|หลอด|เส้น|เมตร|หลา|ถัง|แผง|ลูก|ผืน|ตลับ|กระปุก|คัน|หัว|ลูกบาศก์|ม\\.';

const RE = {
  zw: new RegExp('[' + String.fromCharCode(0x200b, 0xa0, 9) + ']', 'g'),
  tail: /\s*(?:ครับ|คับ|ค้าบ|ค่ะ|คะ|ค่า|นะคะ|นะครับ|นะ|จ้า|จ้ะ|จ๊ะ|น้า|เน้อ|เจ้า|ฮะ|จิ่มเน้อ|จิ่ม|ด้วย|ด้วยนะ)+\s*[.!~]*$/,
  lead: /^(?:[-–•*·▪●○◦✓✔☑>]+\s*|\d{1,2}[.)]\s+)/,
  time: /^\[?\d{1,2}[:.]\d{2}\]?\s*(?:น\.)?\s*/,
  note: /(วันที่|ฝาก|ประมาณ|รบกวน|ขอบคุณ|โทร|เบอร์|ราคา|ยอด|โอน|บาท|ส่งของ|มารับ|แวะ)/,
  day: /วันที่\s*(\d{1,2})(?!\d)/,
  tailUnit: new RegExp('^(.*?[^\\d\\s])\\s*(\\d+(?:[.,]\\d+)?)\\s*(' + UNITS + ')?\\s*$'),
  headQty: new RegExp('^(\\d+(?:[.,]\\d+)?)\\s*(' + UNITS + ')?\\s+(.+)$'),
};

export const normUnit = (u) => {
  const s = String(u ?? '').trim().replace(/[.]+$/, '');
  return UNIT_ALIAS[s] || UNIT_ALIAS[s + '.'] || s;
};
const qtyOf = (s) => {
  let t = String(s ?? '');
  t = /^\d{1,3}(,\d{3})+$/.test(t) ? t.replace(/,/g, '') : t.replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) && n > 0 && n <= 100000 ? n : null; // a phone number is not a quantity
};
const nameOf = (s) => String(s ?? '').replace(/[\s=:：＝\-–]+$/, '').replace(/^[\s=:：＝\-–]+/, '').replace(/\s+[x×X*]$/, '').trim();

function readLine(t) {
  // ชื่อ=จำนวนหน่วย / ชื่อ:จำนวน — the last separator counts, so a name may hold digits
  const sep = Math.max(t.lastIndexOf('='), t.lastIndexOf('＝'), t.lastIndexOf(':'), t.lastIndexOf('：'));
  if (sep > 0) {
    const nm = nameOf(t.slice(0, sep));
    const m = t.slice(sep + 1).trim().match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
    if (nm && m) {
      const q = qtyOf(m[1]);
      if (q) {
        let u = m[2].trim();
        let ex = '';
        const sp = u.indexOf(' ');
        if (sp > 0) {
          ex = u.slice(sp + 1).trim();
          u = u.slice(0, sp);
        }
        if (!/\d/.test(u) && u.length <= 12) return { name: ex ? nm + ' (' + ex + ')' : nm, qty: q, unit: normUnit(u), strong: true };
      }
    }
  }
  let m = t.match(RE.tailUnit);
  if (m) {
    const q = qtyOf(m[2]);
    const nm = nameOf(m[1]);
    if (q && nm) return { name: nm, qty: q, unit: normUnit(m[3] || ''), strong: Boolean(m[3]) || /\s+[x×X*]$/.test(m[1]) };
  }
  m = t.match(RE.headQty);
  if (m) {
    const q = qtyOf(m[1]);
    const nm = nameOf(m[3]);
    if (q && nm && !/\d{3,}/.test(nm)) return { name: nm, qty: q, unit: normUnit(m[2] || ''), strong: Boolean(m[2]) };
  }
  return null;
}

// → { items: [{ name, qty, unit, raw, strong }], notes: [line…], day: 1–31 | null } — any text, any number of lines.
// `strong` = the line says the quantity out loud (ชื่อ=10 · ชื่อ:10 · ชื่อ x10 · ชื่อ 10 อัน); a bare "ชื่อ 10" is not strong:
// the web app takes it (a person pasted it on purpose), the bot only trusts it next to strong lines ("Max 5", "หมู่ 5" …).
export function parseOrderText(text) {
  const items = [];
  const notes = [];
  let day = null;
  for (const rawLine of String(text ?? '').replace(/\r/g, '').split('\n')) {
    let t = rawLine.replace(RE.zw, ' ').replace(/\s+/g, ' ').trim();
    if (!t) continue;
    t = t.replace(RE.time, '').replace(RE.lead, '').trim();
    if (!t) continue;
    const dm = t.match(RE.day);
    if (dm && !day) {
      const d = +dm[1];
      if (d >= 1 && d <= 31) day = d;
    }
    const c = t.replace(RE.tail, '').trim();
    const it = !dm && c.length <= 120 ? readLine(c) : null;
    if (it && /[A-Za-zก-๙]/.test(it.name) && it.name.length >= 2 && !RE.note.test(it.name)) items.push({ ...it, raw: t });
    else notes.push(t);
  }
  return { items, notes, day };
}

// "วันที่ 28" → the next 28th (this month if it has not passed, else next month), as YYYY-MM-DD in Bangkok time.
export function dayToDate(d, nowMs = Date.now()) {
  const b = new Date(nowMs + 7 * 3_600_000);
  let y = b.getUTCFullYear();
  let m = b.getUTCMonth();
  if (d < b.getUTCDate()) {
    m++;
    if (m > 11) {
      m = 0;
      y++;
    }
  }
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const day = Math.min(d, last);
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// → { items, note, notes, day, lines } when the text is an order list, else null.
// A list = at least two item lines, most of the lines are items, and at least half of the items say their quantity out
// loud: a message the bot reads without anybody asking it to must not turn an address ("บ้านเลขที่ 12 / หมู่ 5") or a
// model name ("Max 5 / Pro 3") into an order.
export function parsePickList(text, { minItems = 2, maxLines = 60 } = {}) {
  const lines = String(text ?? '')
    .replace(/\r/g, '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  if (lines.length < minItems || lines.length > maxLines) return null;
  const r = parseOrderText(text);
  const strong = r.items.filter((i) => i.strong).length;
  if (r.items.length < minItems || strong < 1 || strong < Math.ceil(r.items.length / 2)) return null;
  // a greeting, a date and a closing remark around the lines are fine: 60% of the lines are items, or 40% when every one is strong
  if (r.items.length / lines.length < (strong === r.items.length ? 0.4 : 0.6)) return null;
  return { items: r.items, note: r.notes.join(' ').slice(0, 200), notes: r.notes, day: r.day, lines: lines.length };
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
