import { accountKey } from './customerBook.js';

/* จับคู่ชื่อลูกค้าที่พิมพ์มา กับชื่อที่เคยจดไว้
 *
 * ร้านขอ "หากฉันพิมพ์ลูกค้าคนไหนที่เคยจดไว้ แสดงให้อัตโนมัติ จะได้ไม่ต้องพิมพ์"
 * — พิมพ์ "สบกอน" ก็ควรได้ "รร.สบกอน" ชื่อเต็มแบบที่เคยจด ไม่ใช่ได้บัญชีใหม่
 * อีกใบของโรงเรียนเดิม (สมุดลูกค้ารวมเจ้าด้วยชื่อ สะกดต่างกันคือคนละเจ้า)
 *
 * เทียบแบบเดียวกับกุญแจบัญชี (accountKey): ตัดจุด เว้นวรรค ขีด และตัวพิมพ์ —
 * "รร สบกอน" กับ "รร.สบกอน" คือชื่อเดียวกัน
 */

// ชื่อที่พิมพ์สั้นกว่านี้ (หลังตัดช่องว่าง) ไม่เอามาเดา — สองตัวอักษรไปโผล่ใน
// ชื่อครึ่งสมุด เดาผิดบ่อยกว่าถูก
const MIN_PARTIAL = 3;

/* → { kind: 'exact', name }                ชื่อเดียวกันเป๊ะ (สะกดต่างได้) — ใช้ชื่อที่เคยจด
 *   { kind: 'partial', names: [...] }      ที่พิมพ์เป็นส่วนหนึ่งของชื่อที่เคยจด (เรียงตามลำดับใน names)
 *   null                                   ไม่เจอ — ลูกค้าใหม่
 *
 * names เรียงมาตามลำดับที่อยากให้ชนะ (ล่าสุดก่อน) ชื่อซ้ำกันเอาตัวแรก
 */
export function matchCustomer(typed, names = []) {
  const key = accountKey(typed);
  if (!key) return null;

  const seen = new Set();
  const exact = [];
  const partial = [];
  for (const name of names) {
    const nk = accountKey(name);
    if (!nk || seen.has(nk)) continue;
    seen.add(nk);
    if (nk === key) exact.push(name);
    else if (key.length >= MIN_PARTIAL && nk.includes(key)) partial.push(name);
  }

  if (exact.length) return { kind: 'exact', name: exact[0] };
  if (partial.length) return { kind: 'partial', names: partial.slice(0, 3) };
  return null;
}
