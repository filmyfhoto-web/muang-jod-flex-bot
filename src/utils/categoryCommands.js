import { parseNewCategoryName } from './taxonomy.js';

/* "เพิ่มหมวด 🥤 แก้วสกรีน" — เพิ่มหมวดงานใหม่ของร้านจากแชตได้เลย
 *
 * ร้านขอ "แก้ไขหมวดงานเองได้ เพราะมันจะมีเพิ่มเติม" หน้าแก้ไขหมวดทำได้ครบ (เปลี่ยนชื่อ ซ่อน
 * ประเภทย่อย คำค้น) แต่ที่ร้านทำบ่อยที่สุดคือเพิ่มหมวดใหม่ทีละอัน ซึ่งไม่ควรต้องเปิดหน้าเว็บ
 *
 * จับเฉพาะรูปที่ชัดว่าเป็นคำสั่งเพิ่มหมวดจริง ๆ: ขึ้นต้นด้วย "เพิ่ม/สร้าง/ตั้ง หมวด" แล้วตามด้วย
 * ชื่อ — ข้อความจดงานธรรมดาไม่มีทางขึ้นต้นแบบนี้ "เพิ่มหมวด" คำเดียวโดดๆ ไม่ใช่ที่นี่
 * (เป็นคำสั่งในเมนู พาไปหน้าแก้ไขหมวด)
 */

const POLITE_TAIL = /\s*(?:ให้|หน่อย|ด้วย|ที|ซิ|สิ|นะ|น่ะ|จ้า|ครับ|คับ|ค่ะ|คะ|ๆ)+$/u;
const ADD_RE = /^(?:ช่วย|ขอ)?\s*(?:เพิ่ม|สร้าง|ตั้ง)\s*หมวด(?:งาน)?(?:\s*ใหม่)?\s*[:：]?\s+(\S.*)$/su;
const NEW_RE = /^หมวด(?:งาน)?ใหม่\s*[:：]?\s+(\S.*)$/su;

// → { label, icon } หรือ null เมื่อไม่ใช่คำสั่งเพิ่มหมวด
export function parseAddCategory(text) {
  const raw = String(text ?? '').trim();
  if (!raw || raw.includes('\n')) return null;
  const m = ADD_RE.exec(raw) || NEW_RE.exec(raw);
  if (!m) return null;

  let rest = m[1].trim();
  let before;
  do {
    before = rest;
    rest = rest.replace(POLITE_TAIL, '').trim();
  } while (rest !== before);

  return parseNewCategoryName(rest);
}
