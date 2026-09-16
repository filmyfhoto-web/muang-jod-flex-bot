import { CATEGORY_GROUPS, OTHER_GROUP, jobCategory } from './category.js';

/* เลขงานรันแยกตามหมวด
 *
 * ร้านขอว่า "เลขรหัส รันตามหมวดงานได้มั้ย ต่อให้แก้กี่รอบก็ไม่เปลี่ยน"
 *
 * ของเดิมเป็น MJ-YYYYMMDD-XXXX คือรันตามวัน ซึ่งบอกแค่ว่าจดวันไหน งานตรายาง
 * กับงานป้ายของวันเดียวกันได้เลขติดกัน แยกกองกันไม่ได้เลย
 *
 * ของใหม่ MJ-STP-0007 อ่านออกทันทีว่าเป็นตรายางใบที่เจ็ดของร้าน และเลขนี้ถูก
 * ตั้งครั้งเดียวตอนสร้าง ไม่มีใครคำนวณใหม่อีก — แก้ราคา แก้ชื่อลูกค้า หรือแม้แต่
 * ย้ายหมวดทีหลัง เลขก็ยังเป็นเลขเดิม เพราะเลขงานคือ "ชื่อ" ของใบงานนั้น ไม่ใช่
 * ผลลัพธ์ที่คิดใหม่ได้ ใบที่ส่งให้ลูกค้าไปแล้วต้องตามหาเจอตลอดไป
 */

// รหัสสามตัวต่อหนึ่งหมวด — สามตัวเพราะสองตัวชนกันเอง (สติ๊กเกอร์ ตรายาง ส่งของ
// ขึ้นต้นด้วย ส เหมือนกันหมด) และรหัสที่เดาผิดได้คือรหัสที่ค้นหาผิด
export const CATEGORY_CODES = {
  print: 'PRN',
  sign: 'SGN',
  stamp: 'STP',
  sticker: 'STK',
  photo: 'PIC',
  design: 'DSG',
  shipping: 'SHP',
  other: 'GEN',
};

export const DEFAULT_CODE = CATEGORY_CODES.other;

// รหัสของหมวดหนึ่ง — หมวดที่ไม่รู้จักตกมาที่ GEN เสมอ ไม่ใช่ undefined
export function categoryCode(categoryId) {
  return CATEGORY_CODES[String(categoryId || '')] || DEFAULT_CODE;
}

// รหัสของงานหนึ่งใบ อ่านจากหมวดที่บันทึกไว้ ถ้าไม่มีก็เดาจากรายการเหมือนที่อื่น
export function jobCode(job = {}) {
  return categoryCode(jobCategory(job).group.id);
}

// MJ-STP-0007
export function formatJobNumber(categoryId, seq) {
  return `MJ-${categoryCode(categoryId)}-${String(seq).padStart(4, '0')}`;
}

// อ่านเลขงานกลับเป็นส่วนประกอบ คืน null เมื่อไม่ใช่รูปแบบนี้ (เช่นเลขแบบเก่า)
export function parseJobNumber(jobNumber) {
  const m = /^MJ-([A-Z]{3})-(\d{4,})$/.exec(String(jobNumber || '').trim());
  if (!m) return null;
  const entry = Object.entries(CATEGORY_CODES).find(([, code]) => code === m[1]);
  return { code: m[1], category: entry?.[0] || null, seq: Number(m[2]) };
}

// ทุกหมวดต้องมีรหัส และรหัสต้องไม่ซ้ำกัน — ถ้าวันหนึ่งมีคนเพิ่มหมวดใหม่แล้วลืม
// ใส่รหัส งานทั้งหมวดจะไปกองรวมกันที่ GEN เงียบ ๆ
export function auditCodes() {
  const ids = [...CATEGORY_GROUPS.map((g) => g.id), OTHER_GROUP.id];
  const missing = ids.filter((id) => !CATEGORY_CODES[id]);
  const codes = ids.map((id) => CATEGORY_CODES[id]).filter(Boolean);
  const duplicated = codes.filter((c, i) => codes.indexOf(c) !== i);
  return { missing, duplicated };
}
