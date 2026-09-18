/* บรรทัดย่อยใต้ชื่อรายการ — "ขนาด · รายละเอียด"
 *
 * ตาราง job_items มีช่อง size ช่องเดียว ไม่มีช่อง detail แยก ฟอร์มจดงาน (LIFF)
 * จึงรวมสองอย่างนี้เป็นสตริงเดียวก่อนส่งมาอยู่แล้ว (public/liff/jot/rate.js)
 * ตรงนี้คือกติกาเดียวกันสำหรับฝั่งที่จดจากข้อความ เพื่อให้งานที่พิมพ์มาในแชต
 * กับงานที่กรอกในฟอร์ม ออกมาหน้าตาเหมือนกันบนใบเสร็จ
 */

const MAX = 100;

export function subLine(size, detail, name) {
  const s = String(size || '').trim();
  const d = String(detail || '').trim();
  const n = String(name || '').trim();
  // รายละเอียดที่พิมพ์ซ้ำกับชื่องานไม่ได้บอกอะไรเพิ่ม
  const parts = [s, d && d !== n ? d : ''].filter(Boolean);
  if (!parts.length) return null;
  return parts.join(' · ').slice(0, MAX);
}
