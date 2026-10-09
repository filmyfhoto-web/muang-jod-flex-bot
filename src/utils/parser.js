import { round2 } from './currency.js';
import { parseAreaPricing, areaItem, areaWorking } from './area.js';

// บรรทัดที่เป็นตัวเลขล้วน ๆ = ราคา ไม่ใช่ของที่สั่ง (เกณฑ์เดียวกับที่ใช้ตอบ
// "พิมพ์ราคามาได้เลย" ใน jobDraft.parseBarePrice — เขียนไว้ตรงนี้เพราะ
// jobDraft import ไฟล์นี้อยู่แล้ว ย้อนกลับไปหาอีกทีจะวนกัน)
const BARE_PRICE_RE = /^฿?\s*[\d,]+(?:\.\d+)?\s*(?:บาท|฿)?$/;

function parseBarePrice(line) {
  const text = String(line ?? '').trim();
  if (!BARE_PRICE_RE.test(text)) return null;
  const amount = round2(Number(text.replace(/[^0-9.]/g, '')));
  return amount > 0 ? amount : null;
}

const SIZE_RE = /(\d+(?:\.\d+)?\s*[xX×*]\s*\d+(?:\.\d+)?(?:\s*[xX×*]\s*\d+(?:\.\d+)?)?)/;
// "ผืน" นับป้ายผ้าใบ เป็นคำนับอย่างเดียว ไม่เคยเป็นชื่อของ จึงอยู่ตรงนี้ได้
// (ต่างจาก "ป้าย" ที่เป็นทั้งชื่อของและหน่วยนับ จึงอยู่ใน PIECE_WORDS เท่านั้น)
// "บาน/กรอบ" ของงานกรอบรูป ต่อท้ายลิสต์ — detectUnit เอาคำแรกที่เจอ คำเดิมต้องชนะก่อน
const UNIT_WORDS = ['ชิ้น', 'อัน', 'ใบ', 'แผ่น', 'ผืน', 'ตัว', 'ม้วน', 'กล่อง', 'ชุด', 'เมตร', 'ตร.ม.', 'ตารางเมตร', 'บาน', 'กรอบ'];
// หน่วยนับ "ผืน/ป้าย" ใช้เฉพาะบรรทัดที่คิดราคาแบบตารางเมตร
const PIECE_WORDS = ['ผืน', 'ป้าย', 'แผ่น', 'ชิ้น', 'อัน', 'ใบ', 'ชุด', 'บาน', 'กรอบ'];
const PIECE_RE = new RegExp(`(\\d+)\\s*(?:${PIECE_WORDS.join('|')})`);
const QTY_RE = new RegExp(
  `(?:[x×]\\s*(\\d+))|(?:จำนวน\\s*(\\d+))|(\\d+)\\s*(?:${UNIT_WORDS.join('|')})`,
  'i'
);
// "ตัวละ 1,200" / "ป้ายละ 350" / "ละ 50" — a price per piece. The word in
// front of "ละ" is the unit it is counted in, when the shop wrote one.
const PER_UNIT_RE = /([ก-๙A-Za-z]{1,15})?ละ\s*(\d[\d,]*(?:\.\d+)?)/;
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

function cleanName(working) {
  return working
    .replace(/บาท|฿|baht/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Parse a single line into a job item, or null if nothing useful found.
export function parseLine(rawLine) {
  const line = String(rawLine).trim();
  if (!line) return null;

  // ราคาต่อตารางเมตรมาก่อน — บรรทัดแบบ "ไวนิล 160*300 ตรมละ 165" ต้องคิด
  // พื้นที่ให้ ไม่ใช่อ่าน 165 เป็นราคาทั้งผืน
  const area = parseAreaPricing(line);
  if (area) {
    let rest = area.rest;
    let pieces = 1;
    const pieceMatch = rest.match(PIECE_RE);
    if (pieceMatch) {
      pieces = Number(pieceMatch[1]) || 1;
      rest = rest.replace(pieceMatch[0], ' ');
    }
    const itemName = cleanName(rest) || (area.sizeLabel ? `รายการ ${area.sizeLabel}` : 'รายการ');
    const item = areaItem(area, { itemName, pieces });
    // ติดวิธีคิดไว้กับรายการ ให้ผู้เรียกเก็บลงหมายเหตุ ไม่ใช่ลงใบเสร็จ
    item.working = areaWorking(area, { itemName, pieces });
    return item;
  }

  let working = line;

  // 1) Size (e.g. 60x100)
  let size = null;
  const sizeMatch = working.match(SIZE_RE);
  if (sizeMatch) {
    size = sizeMatch[1].replace(/\s+/g, '');
    working = working.replace(sizeMatch[0], ' ');
  }

  // 1b) "ตัวละ 1,200" / "ป้ายละ 350" — the shop's own way of writing a price
  // per piece. Read it before falling through to "the last number on the line
  // is the price": that guess happens to land on the right number, but it
  // leaves the word "ตัวละ" behind, and "สแตนตี้ 2 ตัว ตัวละ 1,200" came out
  // as an item called "สแตนตี้ ตัวละ". The single-line parser has understood
  // this all along; a note with more than one line goes through here instead.
  let perUnitPrice = null;
  let perUnitWord = null;
  const perUnit = working.match(PER_UNIT_RE);
  if (perUnit) {
    perUnitPrice = toNumber(perUnit[2]);
    perUnitWord = perUnit[1] || null;
    working = working.replace(perUnit[0], ' ');
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

  const unit = detectUnit(line) || perUnitWord;

  // 3) Price — the "ละ" price when the shop wrote one, else a number tagged
  // with บาท / ฿, else the last number in the line.
  let unitPrice = 0;
  const tagged = perUnitPrice != null ? null : working.match(PRICE_TAGGED_RE);
  if (perUnitPrice != null) {
    unitPrice = perUnitPrice;
  } else if (tagged) {
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
  let itemName = cleanName(working);
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

  /* ราคาที่ขึ้นบรรทัดใหม่ เป็นราคาของบรรทัดบน ไม่ใช่รายการใหม่
   *
   * ร้านพิมพ์งานหนึ่งงานเป็นสามบรรทัด:
   *   งานไวนิล งานสีดำน้องป่านสั่ง
   *   ขนาด 0.6*1.6  1 ผืน
   *   200 บาท
   * ของเดิมบรรทัดสุดท้ายกลายเป็นรายการที่สองชื่อ "รายการ" ราคา 200 ส่วนป้ายจริง
   * เหลือราคา 1 บาท (เลข 1 ของ "1 ผืน" ถูกอ่านเป็นราคา) — ใบเสร็จได้ ฿201
   * ทั้งที่ร้านคิด ฿200 และมีของสองบรรทัดที่ลูกค้าสั่งมาอย่างเดียว
   *
   * บรรทัดที่มีแต่ตัวเลขล้วน ๆ ไม่มีชื่อของ จึงไม่ใช่ของที่สั่ง — และรับเฉพาะ
   * เมื่อบรรทัดบนยังไม่มีราคา ถ้ามีแล้วก็ไม่รู้ว่าเลขนั้นของใคร เดาไม่ได้
   */
  const items = [];
  for (const line of lines) {
    const bare = parseBarePrice(line);
    const last = items[items.length - 1];
    if (bare != null && last && !(last.total > 0)) {
      const count = Number(last.quantity) > 0 ? Number(last.quantity) : 1;
      last.unit_price = round2(bare / count);
      last.total = round2(bare);
      continue;
    }
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
