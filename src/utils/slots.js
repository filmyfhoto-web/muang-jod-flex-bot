import { classifyItem } from './category.js';
import { matchSize, sizeLabel } from './area.js';
import { extractCustomer } from './nlParser.js';
import { extractDueDate } from './thaiDate.js';
import { round2, numText } from './currency.js';

/* ถามทีละข้อจนกว่าจะครบ — เครื่องเก็บข้อมูลของบทสนทนา
 *
 * ของเดิมอ่านข้อความทั้งก้อนครั้งเดียว ขาดอะไรก็ขึ้นการ์ด ฿0 มาเฉย ๆ ร้านที่
 * พิมพ์ว่า "มีงานกรอบรูป" จึงไม่ได้อะไรกลับไปนอกจากคำสั่งว่าให้พิมพ์ใหม่ให้ครบ
 * ซึ่งไม่ใช่วิธีที่คนคุยกัน
 *
 * ตรงนี้เก็บทีละช่อง: รู้แล้วไม่ถามซ้ำ ตอบมาหลายเรื่องในประโยคเดียวก็รับครบ
 * แล้วข้ามคำถามที่ได้คำตอบไปแล้ว ทุกอย่างในนี้เป็นฟังก์ชันล้วน ไม่แตะฐานข้อมูล
 * ไม่แตะ LINE — ตัวที่เอาไปต่อกับแชตอยู่ที่ messageHandler
 */

/* ------------------------------------------------------------ ช่องข้อมูล */

// คำลงท้ายสุภาพที่ไม่ใช่คำตอบ ตัดทิ้งก่อนอ่านเสมอ
const POLITE = /(?:\s*(?:ค่ะ|คะ|ครับ|จ้า|จ้ะ|นะ|น๊า|ฮะ|ฮ่ะ))+$/i;

// คำที่แปลว่า "ไม่มี / ข้ามไปเถอะ" — ทุกช่องต้องข้ามได้ ไม่งั้นร้านที่ยังไม่รู้
// ราคาจะติดอยู่กับคำถามเดิมไปเรื่อย ๆ
const SKIP_WORDS =
  /^(?:ไม่มี|ไม่ต้อง(?:การ)?|ไม่เอา|ยังไม่รู้|ยังไม่มี|ข้าม(?:ไป)?|ไม่ระบุ|เดี๋ยวบอก|ไว้ก่อน|-)$/i;

const YES_WORDS = /^(?:เอา|ต้องการ|ใช่|ใช่ค่ะ|มี|แนบ|ครับ|ค่ะ|ok|โอเค|เจาะ|ไดคัท)/i;
const NO_WORDS = /^(?:ไม่|ไม่เอา|ไม่ต้อง|ไม่มี|ไม่ใช่|no)/i;

function tidy(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim();
}

function stripPolite(text) {
  return tidy(text).replace(POLITE, '').trim();
}

function toNumber(s) {
  const v = parseFloat(String(s ?? '').replace(/,/g, ''));
  return Number.isFinite(v) ? v : 0;
}

// หน่วยนับที่ร้านใช้จริง เอาไว้แยก "2 กรอบ" (จำนวน) ออกจาก "350 บาท" (เงิน)
const COUNT_UNITS =
  '(?:กรอบ|ป้าย|ผืน|แผ่น|ชิ้น|อัน|ชุด|ใบ|ตัว|กล่อง|ม้วน|เล่ม|หน้า|แผง|ดวง|รูป|คู่|โหล)';

// "2 กรอบ" · "จำนวน 3" · "3 ชุด" · "เปลี่ยนเป็น 3 กรอบ"
const QTY_RE = new RegExp(`(?:จำนวน\\s*)?(\\d[\\d,]*(?:\\.\\d+)?)\\s*${COUNT_UNITS}|จำนวน\\s*(\\d[\\d,]*)`, 'i');

// "กรอบละ 350" · "ราคา 350" · "350 บาท" · "อันละ 120 บาท"
const PRICE_RE = new RegExp(
  `(?:ราคา|ค่า)?\\s*(?:${COUNT_UNITS}|อัน|แผ่น)?\\s*ละ\\s*(\\d[\\d,]*(?:\\.\\d+)?)|` +
    `(?:ราคา)\\s*(\\d[\\d,]*(?:\\.\\d+)?)|` +
    `(\\d[\\d,]*(?:\\.\\d+)?)\\s*บาท`,
  'i'
);

// ตัวเลขลอย ๆ ทั้งข้อความ — คำตอบของคำถามที่เพิ่งถามไป
const BARE_NUMBER_RE = /^฿?\s*(\d[\d,]*(?:\.\d+)?)\s*(?:บาท|฿)?$/;

/* ช่องข้อมูลหนึ่งช่อง
 *   ask      คำถามที่ถาม (ข้อเดียวจบ ไม่ยาว)
 *   options  ตัวเลือกสำหรับ Quick Reply — มีเมื่อคำตอบมีไม่กี่แบบ
 *   read     อ่านค่าจากข้อความทั้งก้อน คืน { value, match } หรือ null
 *            match คือส่วนที่กินไป จะได้ไม่ถูกช่องอื่นอ่านซ้ำ
 *   take     อ่านค่าจากข้อความที่เป็น "คำตอบของคำถามนี้โดยตรง"
 *   say      บอกค่าที่เก็บไว้เป็นภาษาคน ใช้ตอนสรุปและตอนบอกว่าแก้ให้แล้ว
 */
const SLOTS = {
  size: {
    ask: 'ขนาดเท่าไหร่คะ?',
    read: (text) => {
      const s = matchSize(text);
      if (!s) return null;
      const unit = s.unit || (s.width < 20 && s.height < 20 ? 'inch' : 'cm');
      return { value: { width: s.width, height: s.height, unit }, match: s.match };
    },
    say: (v) => sizeLabel(v),
  },

  qty: {
    ask: 'จำนวนกี่ชิ้นคะ?',
    read: (text) => {
      const m = QTY_RE.exec(text);
      if (!m) return null;
      const n = toNumber(m[1] || m[2]);
      if (!(n > 0)) return null;
      const unitWord = new RegExp(COUNT_UNITS, 'i').exec(m[0]);
      return { value: { count: n, unit: unitWord ? unitWord[0] : null }, match: m[0] };
    },
    take: (text) => {
      const m = BARE_NUMBER_RE.exec(stripPolite(text));
      const n = m ? toNumber(m[1]) : 0;
      return n > 0 ? { value: { count: n, unit: null } } : null;
    },
    say: (v) => `${numText(v.count)} ${v.unit || 'ชิ้น'}`,
  },

  unitPrice: {
    ask: 'ราคาชิ้นละเท่าไหร่คะ?',
    read: (text) => {
      const m = PRICE_RE.exec(text);
      if (!m) return null;
      const n = toNumber(m[1] || m[2] || m[3]);
      return n > 0 ? { value: n, match: m[0] } : null;
    },
    take: (text) => {
      const m = BARE_NUMBER_RE.exec(stripPolite(text));
      const n = m ? toNumber(m[1]) : 0;
      return n > 0 ? { value: n } : null;
    },
    say: (v) => `${numText(v)} บาท`,
  },

  customer: {
    ask: 'ลูกค้าชื่ออะไรคะ?',
    read: (text) => {
      const hit = extractCustomer(text);
      return hit.customerName ? { value: hit.customerName, match: hit.match } : null;
    },
    // ตอบชื่อมาตรง ๆ ("แอน") ไม่มีคำนำหน้าให้จับ ก็คือชื่อนั่นแหละ
    take: (text) => {
      const name = stripPolite(text).replace(/^(?:ชื่อ|ลูกค้า(?:ชื่อ)?)\s*/i, '').trim();
      return name.length >= 2 && name.length <= 80 ? { value: name } : null;
    },
    say: (v) => v,
  },

  due: {
    ask: 'นัดรับวันไหนคะ?',
    read: (text) => {
      const hit = extractDueDate(text);
      return hit.date ? { value: hit.date, match: null } : null;
    },
    // ตอบคำถามเรื่องวันมาตรง ๆ ("วันศุกร์") ไม่มีคำว่า "นัดรับ" นำหน้าให้จับ
    // เติมให้เองเพราะบริบทบอกอยู่แล้วว่ากำลังพูดถึงวันนัด
    take: (text) => {
      const hit = extractDueDate(`นัดรับ ${stripPolite(text)}`);
      return hit.date ? { value: hit.date } : null;
    },
    say: (v) => v,
  },

  /* ช่องเฉพาะประเภทงาน — ถามเฉพาะอันที่เปลี่ยนราคาหรือเปลี่ยนวิธีทำ
   * ส่วนที่เป็นรายละเอียดความสวยงาม (กรอบสีอะไร) ไม่ถาม ปล่อยให้บอกเองถ้าอยากบอก
   * ไม่งั้นสั่งกรอบสองอันต้องตอบคำถามแปดข้อ */
  eyelet: {
    ask: 'ต้องการเจาะตาไก่ไหมคะ?',
    options: ['เจาะตาไก่', 'ไม่เจาะ'],
    read: (text) => {
      if (/เจาะ\s*ตาไก่|ตอกตาไก่|ตาไก่/.test(text)) return { value: !/ไม่\s*(?:เจาะ|ตอก)/.test(text), match: null };
      return null;
    },
    take: (text) => yesNo(text),
    say: (v) => (v ? 'เจาะตาไก่' : 'ไม่เจาะตาไก่'),
  },

  diecut: {
    ask: 'ต้องการไดคัทไหมคะ?',
    options: ['ไดคัท', 'ไม่ไดคัท'],
    read: (text) => (/ไดคัท|ไดคัต|die\s*cut/i.test(text) ? { value: !/ไม่\s*ไดคั/.test(text), match: null } : null),
    take: (text) => yesNo(text),
    say: (v) => (v ? 'ไดคัท' : 'ไม่ไดคัท'),
  },

  colour: {
    ask: 'ขาวดำหรือสีคะ?',
    options: ['ขาวดำ', 'สี'],
    read: (text) => {
      if (/ขาว\s*ดำ|ขาวดำ|ข-ด|bw/i.test(text)) return { value: 'ขาวดำ', match: null };
      if (/(?:พิมพ์|ถ่าย|ปริ้น)?\s*สี(?!เขียว|แดง|ฟ้า|ดำ|ขาว)/.test(text)) return { value: 'สี', match: null };
      return null;
    },
    say: (v) => v,
  },

  sides: {
    ask: 'หน้าเดียวหรือหน้าหลังคะ?',
    options: ['หน้าเดียว', 'หน้าหลัง'],
    read: (text) => {
      if (/หน้า\s*หลัง|สองหน้า|2\s*หน้า/.test(text)) return { value: 'หน้าหลัง', match: null };
      if (/หน้า\s*เดียว|หน้าเดี่ยว/.test(text)) return { value: 'หน้าเดียว', match: null };
      return null;
    },
    say: (v) => v,
  },

  background: {
    ask: 'พื้นหลังสีอะไรคะ?',
    options: ['ขาว', 'ฟ้า', 'แดง'],
    read: (text) => {
      const m = /พื้นหลัง\s*(?:สี)?\s*(ขาว|ฟ้า|น้ำเงิน|แดง|เทา|ครีม)/.exec(text);
      return m ? { value: m[1], match: m[0] } : null;
    },
    take: (text) => {
      const v = stripPolite(text).replace(/^(?:พื้นหลัง|สี)\s*/i, '').trim();
      return v.length >= 2 && v.length <= 20 ? { value: v } : null;
    },
    say: (v) => `พื้นหลัง${v}`,
  },

  detail: {
    ask: 'ต้องการรายละเอียดหรือขนาดแบบไหนคะ?',
    take: (text) => {
      const v = stripPolite(text);
      return v.length >= 2 && v.length <= 200 ? { value: v } : null;
    },
    say: (v) => v,
  },

  attach: {
    ask: 'ต้องการแนบรูปหรือหลักฐานประกอบงานไหมคะ?',
    options: ['ไม่ต้อง', 'แนบรูป'],
    read: (text) => (/แนบ\s*(?:รูป|ไฟล์|สลิป)/.test(text) ? { value: true, match: null } : null),
    take: (text) => yesNo(text),
    say: (v) => (v ? 'มีรูปแนบ' : ''),
  },
};

function yesNo(text) {
  const t = stripPolite(text);
  if (NO_WORDS.test(t)) return { value: false };
  if (YES_WORDS.test(t)) return { value: true };
  return null;
}

/* ------------------------------------------------- ชุดคำถามตามประเภทงาน */

// เรียงตามลำดับที่ถาม — งานจะเสร็จเมื่อทุกช่องในชุดมีค่าหรือถูกข้ามแล้ว
const SETS = {
  frame: ['size', 'qty', 'unitPrice', 'customer', 'due', 'attach'],
  vinyl: ['size', 'qty', 'eyelet', 'unitPrice', 'customer', 'due', 'attach'],
  photo: ['size', 'qty', 'background', 'unitPrice', 'customer', 'due', 'attach'],
  copy: ['colour', 'sides', 'qty', 'unitPrice', 'customer', 'due', 'attach'],
  sticker: ['size', 'qty', 'diecut', 'unitPrice', 'customer', 'due', 'attach'],
  other: ['detail', 'qty', 'unitPrice', 'customer', 'due', 'attach'],
};

// ประเภทงานที่ระบบรู้จัก → ชุดคำถาม ที่เหลือใช้ชุดพื้นฐาน
const TYPE_TO_SET = {
  frame: 'frame',
  vinyl: 'vinyl',
  banner: 'vinyl',
  standee: 'vinyl',
  foamboard: 'vinyl',
  photo: 'photo',
  copy: 'copy',
  print: 'copy',
  scan: 'copy',
  binding: 'copy',
  sticker: 'sticker',
  sticker_board: 'sticker',
  stamp: 'other',
};

export function questionSet(workType) {
  return SETS[workType] || SETS.other;
}

// คำถามของช่องนี้ ปรับถ้อยคำตามประเภทงานให้ตรงกับของที่ร้านกำลังสั่ง
const ASK_OVERRIDES = {
  frame: { qty: 'จำนวนกี่กรอบคะ?', unitPrice: 'ราคากรอบละเท่าไหร่คะ?' },
  vinyl: { size: 'ขนาดกว้าง × สูงเท่าไหร่คะ?', qty: 'จำนวนกี่ป้ายคะ?', unitPrice: 'ราคาป้ายละเท่าไหร่คะ?' },
  photo: { size: 'ต้องการรูปขนาดเท่าไหร่คะ?', qty: 'จำนวนกี่ชุดคะ?', unitPrice: 'ราคาชุดละเท่าไหร่คะ?' },
  copy: { qty: 'จำนวนกี่หน้าคะ?', unitPrice: 'ราคาหน้าละเท่าไหร่คะ?' },
  sticker: { size: 'ขนาดกว้าง × สูงเท่าไหร่คะ?', qty: 'จำนวนกี่แผ่นคะ?', unitPrice: 'ราคาแผ่นละเท่าไหร่คะ?' },
};

export function askText(workType, slotId) {
  return ASK_OVERRIDES[workType]?.[slotId] || SLOTS[slotId].ask;
}

export function slotOptions(slotId) {
  return SLOTS[slotId].options || null;
}

/* --------------------------------------------------------- เริ่มบทสนทนา */

// ข้อความแรกบอกว่ากำลังจะสั่งงานอะไร — คืน null เมื่อไม่รู้จักว่าเป็นงานอะไรเลย
// (ปล่อยให้ทางเดิมจัดการ จะได้ไม่ไปกินประโยคที่ไม่ใช่การสั่งงาน)
export function startCollecting(text) {
  const clean = tidy(text).replace(/^(?:มี|รับ|จด|เพิ่ม|ขอ)\s*(?:งาน)?\s*/i, '');
  const hit = classifyItem(clean) || classifyItem(text);
  if (!hit) return null;

  const workType = TYPE_TO_SET[hit.type?.id] || 'other';
  const itemName = hit.type?.label || hit.group.label;
  const state = { workType, itemName, fields: {}, skipped: [], asking: null };
  return readTurn(state, text).state;
}

/* ------------------------------------------------- อ่านคำตอบหนึ่งรอบ */

// อ่านทุกอย่างที่อยู่ในข้อความนี้ลงช่องที่เกี่ยวข้อง
//
// สองชั้น: ชั้นแรกอ่านของที่พก "ป้ายกำกับ" มาเอง (ขนาดมี × จำนวนมีหน่วยนับ ราคา
// มีคำว่าบาท/ละ วันมีคำว่านัดรับ) อ่านได้ทุกช่องพร้อมกัน ตอบมาหลายเรื่องใน
// ประโยคเดียวจึงรับครบ ชั้นสองคือตัวเลขหรือคำลอย ๆ ซึ่งแปลว่า "ตอบคำถามที่เพิ่ง
// ถามไป" — ถ้าไม่มีชั้นสอง คำว่า "350" หลังคำถามเรื่องราคาจะไม่มีความหมายเลย
export function readTurn(state, text) {
  const fields = { ...state.fields };
  const skipped = [...(state.skipped || [])];
  const filled = [];
  const changed = [];
  const set = questionSet(state.workType);
  let rest = tidy(text);

  const put = (id, value) => {
    const had = fields[id] !== undefined && fields[id] !== null;
    const same = had && JSON.stringify(fields[id]) === JSON.stringify(value);
    if (same) return;
    fields[id] = value;
    (had ? changed : filled).push(id);
    // ตอบมาแล้วก็ไม่ใช่ช่องที่ข้ามอีกต่อไป
    const at = skipped.indexOf(id);
    if (at > -1) skipped.splice(at, 1);
  };

  // ชั้นแรก — ของที่มีป้ายกำกับในตัว อ่านตามลำดับช่องของงานประเภทนี้
  for (const id of set) {
    const slot = SLOTS[id];
    if (!slot.read) continue;
    const hit = slot.read(rest);
    if (!hit) continue;
    put(id, hit.value);
    if (hit.match) rest = rest.replace(hit.match, ' ').replace(/\s+/g, ' ').trim();
  }

  // ชั้นสอง — คำตอบตรง ๆ ของคำถามที่เพิ่งถามไป
  const asking = state.asking;
  if (asking && SLOTS[asking]) {
    const answered = filled.includes(asking) || changed.includes(asking);
    if (!answered) {
      if (SKIP_WORDS.test(stripPolite(text))) {
        if (!skipped.includes(asking)) skipped.push(asking);
      } else {
        const direct = SLOTS[asking].take?.(rest || text);
        if (direct) put(asking, direct.value);
      }
    }
  }

  return { state: { ...state, fields, skipped }, filled, changed };
}

/* ------------------------------------------------------ ถามข้อถัดไป */

// ช่องแรกที่ยังไม่รู้และยังไม่ได้ข้าม — null แปลว่าครบแล้ว พร้อมสรุป
export function nextSlot(state) {
  const { fields = {}, skipped = [] } = state;
  for (const id of questionSet(state.workType)) {
    if (fields[id] !== undefined && fields[id] !== null) continue;
    if (skipped.includes(id)) continue;
    return id;
  }
  return null;
}

export function nextQuestion(state) {
  const id = nextSlot(state);
  if (!id) return null;
  return { id, text: askText(state.workType, id), options: slotOptions(id) };
}

// ชื่อช่องเป็นภาษาคน ใช้ตอนบอกว่าแก้อะไรให้แล้ว
const LABELS = {
  size: 'ขนาด',
  qty: 'จำนวน',
  unitPrice: 'ราคา',
  customer: 'ชื่อลูกค้า',
  due: 'วันนัดรับ',
  eyelet: 'ตาไก่',
  diecut: 'ไดคัท',
  colour: 'สี',
  sides: 'หน้า',
  background: 'พื้นหลัง',
  detail: 'รายละเอียด',
};

// บอกสั้น ๆ ว่าแก้อะไรให้ไปบ้างในรอบนี้ — "แก้จำนวนเป็น 3 กรอบแล้วค่ะ"
//
// พูดเฉพาะของที่ "เปลี่ยน" ไม่ใช่ของที่เพิ่งกรอกครั้งแรก การทวนทุกคำตอบทำให้
// บทสนทนายาวขึ้นเท่าตัวโดยไม่ได้บอกอะไรที่ร้านไม่รู้อยู่แล้ว
export function acknowledge(state, changed = []) {
  const said = changed
    .filter((id) => SLOTS[id]?.say && LABELS[id])
    .map((id) => {
      const value = SLOTS[id].say(state.fields[id]);
      return value ? `${LABELS[id]}เป็น ${value}` : null;
    })
    .filter(Boolean);
  if (!said.length) return null;
  return `แก้${said.join(' และ')}แล้วค่ะ`;
}

/* ----------------------------------------------------------- สรุปงาน */

export function lineTotal(fields = {}) {
  const qty = Number(fields.qty?.count) || 1;
  const price = Number(fields.unitPrice) || 0;
  return round2(qty * price);
}

// วิธีคิดยอดรวม เขียนให้เห็นเลยว่าคูณอะไรกับอะไร — ร้านตรวจได้โดยไม่ต้องเชื่อ
export function totalWorking(fields = {}) {
  const qty = Number(fields.qty?.count) || 1;
  const price = Number(fields.unitPrice) || 0;
  if (!(price > 0) || qty <= 1) return null;
  return `${numText(price)} × ${numText(qty)} = ${numText(round2(qty * price))} บาท`;
}

// ชื่อรายการที่จะขึ้นบนการ์ด: ของ + ขนาด
export function itemLabel(state) {
  const { itemName, fields = {} } = state;
  return [itemName, fields.detail].filter(Boolean).join(' ').trim() || 'งาน';
}

// รายละเอียดที่ไม่ใช่ขนาด/จำนวน/ราคา เก็บไว้ในหมายเหตุ ไม่ได้หายไปไหน
export function extraNote(state) {
  const f = state.fields || {};
  const bits = [];
  for (const id of ['eyelet', 'diecut', 'colour', 'sides', 'background']) {
    if (f[id] === undefined || f[id] === null) continue;
    const said = SLOTS[id].say(f[id]);
    if (said) bits.push(said);
  }
  return bits.length ? bits.join(' · ') : null;
}

// แปลงสิ่งที่เก็บมาเป็นร่างงาน — รูปร่างเดียวกับที่ makeDraft รับ
export function toDraftInput(state) {
  const f = state.fields || {};
  const qty = Number(f.qty?.count) || 1;
  const price = Number(f.unitPrice) || 0;
  const total = round2(qty * price);
  const note = [extraNote(state), totalWorking(f) ? `คิดจาก ${totalWorking(f)}` : ''].filter(Boolean).join('\n');

  return {
    jobName: itemLabel(state),
    customerName: f.customer || null,
    dueDate: f.due || null,
    items: [
      {
        item_name: itemLabel(state),
        size: f.size ? sizeLabel(f.size) : null,
        quantity: qty,
        unit: f.qty?.unit || null,
        unit_price: price,
        total,
      },
    ],
    subtotal: total,
    total,
    ...(note ? { note } : {}),
  };
}

/* ------------------------------------------------------ คำสั่งระหว่างคุย */

// คำสั่งที่พิมพ์ได้ระหว่างกำลังตอบคำถาม — ปุ่มบนการ์ดเลื่อนหายไปจากจอได้
// แต่คำสั่งที่พิมพ์เองอยู่ในมือเสมอ
const COMMANDS = [
  [/^(?:ยกเลิก|ไม่เอาแล้ว|เลิก|หยุด|พอแล้ว)$/i, { kind: 'cancel' }],
  [/^(?:เริ่มใหม่|เริ่มต้นใหม่|ตั้งต้นใหม่|รีเซ็ต)$/i, { kind: 'restart' }],
  [/^(?:ย้อนกลับ|กลับ|ถอยกลับ|ย้อน)$/i, { kind: 'back' }],
  [/^(?:สรุป(?:ให้ดู|ให้หน่อย)?|ดูสรุป|ขอสรุป)$/i, { kind: 'summary' }],
  [/^(?:บันทึกเลย|บันทึก|เซฟเลย|จดเลย|โอเคบันทึก)$/i, { kind: 'save' }],
  [/^(?:ไม่แนบรูป|ไม่ต้องแนบรูป|ไม่แนบ)$/i, { kind: 'answer', field: 'attach', value: false }],
  [/^แก้(?:ไข)?\s*ขนาด/i, { kind: 'ask', field: 'size' }],
  [/^แก้(?:ไข)?\s*จำนวน/i, { kind: 'ask', field: 'qty' }],
  [/^แก้(?:ไข)?\s*ราคา/i, { kind: 'ask', field: 'unitPrice' }],
  [/^(?:เปลี่ยน|แก้(?:ไข)?)\s*(?:ชื่อ)?ลูกค้า/i, { kind: 'ask', field: 'customer' }],
  [/^(?:เปลี่ยน|แก้(?:ไข)?)\s*(?:วัน(?:นัด)?รับ|วันนัด|นัดรับ)/i, { kind: 'ask', field: 'due' }],
];

// คืน null เมื่อไม่ใช่คำสั่ง (คือเป็นคำตอบธรรมดา)
//
// "แก้จำนวนเป็น 3 กรอบ" มีทั้งคำสั่งและคำตอบอยู่ในประโยคเดียว — ถ้ามีค่าตามมา
// ด้วยก็ไม่ต้องถามซ้ำ ให้ readTurn อ่านค่านั้นไปเลย จึงคืน null ปล่อยผ่าน
export function parseCollectCommand(text) {
  const clean = stripPolite(text);
  if (!clean) return null;
  for (const [re, out] of COMMANDS) {
    if (!re.test(clean)) continue;
    // มีค่ามาด้วยแล้ว ("แก้จำนวนเป็น 3 กรอบ") — ไม่ใช่คำสั่งเปล่า ปล่อยให้อ่านค่า
    if (out.kind === 'ask' && /\d/.test(clean)) return null;
    return out;
  }
  return null;
}

// ช่องก่อนหน้าช่องที่กำลังถาม — คำสั่ง "ย้อนกลับ"
export function previousSlot(state) {
  const set = questionSet(state.workType);
  const at = set.indexOf(nextSlot(state) || set[set.length - 1]);
  for (let i = at - 1; i >= 0; i--) {
    const id = set[i];
    if (state.fields?.[id] !== undefined || (state.skipped || []).includes(id)) return id;
  }
  return null;
}

// ลืมค่าของช่องหนึ่งเพื่อถามใหม่
export function forget(state, id) {
  const fields = { ...state.fields };
  delete fields[id];
  return { ...state, fields, skipped: (state.skipped || []).filter((x) => x !== id), asking: id };
}

export { SLOTS };
