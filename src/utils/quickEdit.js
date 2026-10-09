import { round2, parsePrice } from './currency.js';

/* "แก้ราคาเป็น 650" — แก้ใบล่าสุดด้วยประโยคเดียว (V2 §4)
 *
 * ร้านเพิ่งจดเสร็จแล้วเห็นว่าพิมพ์ราคาผิด การแก้ที่เร็วที่สุดคือพูดแก้เลย ไม่ใช่
 * เปิดหน้าแก้ไข — แต่เรื่องเงินห้ามเดา จึงตอบเป็นการ์ดให้กดยืนยันก่อนเสมอ
 *
 * จับเฉพาะรูป "แก้ <อะไร> เป็น <ค่า>" ที่ชัดเจน — "แก้ไขล่าสุด" (เปิดฟอร์มแก้)
 * ยังทำงานเหมือนเดิม เพราะไม่มี "เป็น/=" ตามหลัง
 */

const FIELDS = [
  [/^ราคา(?:รวม)?|^ยอด(?:รวม)?|^ราคาที่เก็บ/u, 'total', 'ราคา'],
  [/^มัดจำ|^ยอดมัดจำ|^รับมา(?:แล้ว)?/u, 'paid', 'ยอดที่รับมาแล้ว'],
  [/^(?:ชื่อ)?ลูกค้า/u, 'customer', 'ชื่อลูกค้า'],
  [/^ชื่องาน/u, 'jobName', 'ชื่องาน'],
];

const LEAD = /^แก้(?:ไข)?\s*/u;
const BE = /^(?:เป็น|=|เท่ากับ)\s*/u;

// → { field: 'total'|'paid'|'customer'|'jobName', value, fieldLabel } หรือ null
export function parseQuickEdit(text) {
  const raw = String(text ?? '').trim().replace(/\s+/g, ' ');
  if (!raw || raw.includes('\n')) return null;
  const lead = LEAD.exec(raw);
  if (!lead) return null;
  let rest = raw.slice(lead[0].length).trim();

  for (const [re, field, fieldLabel] of FIELDS) {
    const m = re.exec(rest);
    if (!m) continue;
    let value = rest.slice(m[0].length).trim();
    const be = BE.exec(value);
    if (!be) return null; // ต้องมี "เป็น" — "แก้ไขล่าสุด" ฯลฯ ไม่ใช่ของเรา
    value = value.slice(be[0].length).trim();
    if (!value) return null;

    if (field === 'total' || field === 'paid') {
      const amount = round2(parsePrice(value));
      if (!(amount > 0) && !(field === 'paid' && amount === 0)) return null;
      return { field, value: amount, fieldLabel };
    }
    if (value.length < 1 || value.length > 60) return null;
    return { field, value, fieldLabel };
  }
  return null;
}
