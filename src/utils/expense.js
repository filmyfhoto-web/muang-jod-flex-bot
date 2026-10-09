import { round2 } from './currency.js';
import { extractPayMethod } from './nlParser.js';

/* อ่านประโยครายจ่าย — "ซื้อกระดาษ A4 350" / "จ่ายค่าไฟ 1,200 โอน" / "เติมหมึก 450"
 *
 * ร้านขอ (V2): พิมพ์สิ่งที่ทำจริงแล้วม่วงเข้าใจเองว่าเป็นรายจ่าย ไม่ต้องเลือกเมนูก่อน
 *
 * จับเฉพาะประโยคที่ขึ้นต้นด้วยกริยาจ่ายเงินชัด ๆ (ซื้อ / จ่ายค่า / เติม / รายจ่าย)
 * — จงใจไม่จับ "ค่า..." เดี่ยว ๆ เพราะ "ค่าส่ง 50" ในใบงานคือรายรับค่าส่งของลูกค้า
 * ไม่ใช่รายจ่ายของร้าน สองอย่างนี้สะกดเหมือนกันแต่เงินไหลคนละทาง
 */

const LEAD_RE = /^(?:ช่วย|ขอ)?\s*(จดรายจ่าย|รายจ่าย|ซื้อ|จ่ายค่า|เติม)\s*[:：]?\s*/u;
// จำนวนเงิน: เลขก้อนสุดท้ายของประโยค (มีจุลภาค/ทศนิยม/คำว่า บาท ได้)
const AMOUNT_RE = /(\d[\d,]*(?:\.\d+)?)\s*(?:บาท|฿|บ\.?)?\s*$/;

// → { item, amount, payMethod } หรือ null เมื่อไม่ใช่ประโยครายจ่าย
export function parseExpense(text) {
  const raw = String(text ?? '').trim();
  if (!raw || raw.includes('\n')) return null; // รายจ่ายจดทีละรายการ หลายบรรทัดคือใบงาน

  const lead = LEAD_RE.exec(raw);
  if (!lead) return null;
  let rest = raw.slice(lead[0].length).trim();
  if (!rest) return null;

  // "เติม" ต้องเป็นการเติมของ (หมึก น้ำมัน เงิน…) ไม่ใช่คำทั่วไปกลางประโยคอื่น
  // — ขึ้นต้นประโยคอยู่แล้วจาก LEAD_RE จึงพอ

  // ช่องทางเงิน (เงินสด/โอน) พูดติดท้ายได้เหมือนประโยคจดงาน
  const pm = extractPayMethod(rest);
  if (pm.method === 'account') return null; // "ลงบัญชี" เป็นเรื่องของงาน ไม่ใช่รายจ่าย
  rest = pm.rest.trim();

  const m = AMOUNT_RE.exec(rest);
  if (!m) return null;
  const amount = round2(Number(m[1].replace(/,/g, '')));
  if (!(amount > 0)) return null;

  // ชื่อรายการ = สิ่งที่เหลือ (รวมกริยา "ซื้อ/เติม" กลับเข้าไปให้อ่านรู้เรื่อง:
  // "ซื้อกระดาษ A4" ไม่ใช่ "กระดาษ A4" เฉย ๆ ที่อ่านแล้วไม่รู้ว่าจ่ายหรือขาย)
  const thing = rest.slice(0, m.index).trim().replace(/[-–—:：]+$/u, '').trim();
  if (!thing) return null;
  const verb = lead[1] === 'รายจ่าย' || lead[1] === 'จดรายจ่าย' ? '' : lead[1];
  const item = (verb && verb !== 'จ่ายค่า' ? `${verb}${verb === 'ซื้อ' || verb === 'เติม' ? '' : ' '}` : verb === 'จ่ายค่า' ? 'ค่า' : '') + thing;

  return { item: item.trim().slice(0, 120), amount, payMethod: pm.method || null };
}
