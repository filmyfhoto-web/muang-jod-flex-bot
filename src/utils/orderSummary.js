import { round2 } from './currency.js';

/* ใบสรุปใบสั่ง — งานหลายวันรวมเป็นใบเดียว
 *
 * ร้านส่งตัวอย่างมาแล้วบอกว่า "อยากทำใบสรุปราคาแบบนี้ไปด้วย": ตารางแยกตามวันที่
 * สั่ง แต่ละวันมีรายการ ขนาด จำนวน ตร.ม. จำนวนแผ่น ราคา แล้วปิดท้ายด้วยยอดรวม
 * ของทั้งใบ โดยแยก "ค่าสินค้า" กับ "ค่าส่ง" ออกจากกัน
 *
 * ต่างจากใบเสร็จตรงที่ใบเสร็จตอบว่า "ต้องจ่ายเท่าไหร่" ส่วนใบนี้ตอบว่า "สั่งอะไร
 * ไปบ้าง วันไหน กี่แผ่น" ซึ่งเป็นคนละคำถาม และเป็นคำถามที่ลูกค้าประจำถามบ่อยกว่า
 *
 * ข้อมูลมาจากบิลที่มีอยู่แล้ว ไม่ต้องเก็บอะไรเพิ่ม — งานในบิลถูกจัดกลุ่มตาม
 * job_date เอา
 */

// 6 แผ่น = 1 ตร.ม. ตามตารางราคาสติ๊กเกอร์ของร้าน (ตรงกับ SHEETS_PER_SQM
// ใน public/liff/jot/rate.js — แก้ที่ไหนต้องแก้อีกที่ด้วย)
export const SHEETS_PER_SQM = 6;

// คำที่แปลว่า "นี่คือค่าส่ง ไม่ใช่ของที่ทำให้ลูกค้า"
//
// ค่าส่งถูกเก็บเป็นรายการหนึ่งบนบิล เพราะมันต้องขึ้นใบเสร็จให้ลูกค้าเห็น แต่บน
// ใบสรุปมันอยู่คนละคอลัมน์กับค่าสินค้า จึงต้องแยกออกให้ได้
const SHIPPING_RE = /^\s*(ค่าส่ง|ค่าจัดส่ง|ค่าขนส่ง|ค่าส่งของ|shipping|delivery)\s*$/i;

export function isShippingLine(name) {
  return SHIPPING_RE.test(String(name || ''));
}

// จำนวนแผ่นของหนึ่งรายการ — นับเฉพาะรายการที่ขายเป็นแผ่นจริง ๆ
//
// งานป้ายนับเป็นผืน งานตรายางนับเป็นอัน เอามารวมเป็น "แผ่น" ไม่ได้ ไม่งั้นยอด
// แผ่นบนใบสรุปจะเป็นเลขที่ไม่ได้แปลว่าอะไรเลย
export function sheetsOf(item = {}) {
  if (String(item.unit || '') !== 'แผ่น') return 0;
  const qty = Number(item.quantity);
  return Number.isFinite(qty) && qty > 0 ? qty : 0;
}

// พื้นที่วัสดุของจำนวนแผ่นหนึ่ง — ตารางของร้านคิด 6 แผ่นต่อหนึ่งตารางเมตร
export function sqmOfSheets(sheets) {
  return round2((Number(sheets) || 0) / SHEETS_PER_SQM);
}

/* หนึ่งงาน → หนึ่งกลุ่มบรรทัดบนใบสรุป
 *
 * งานที่ไม่มีรายการย่อย (จดมาเป็นก้อนเดียว) ก็ยังต้องขึ้นใบ ใช้ชื่องานเป็น
 * บรรทัดเดียวแทน ไม่ใช่หายไปเพราะไม่มี items
 */
function linesOf(job = {}) {
  const items = Array.isArray(job.items) ? job.items : [];
  if (!items.length) {
    return [
      {
        name: String(job.job_name || 'งาน').trim() || 'งาน',
        size: null,
        sheets: 0,
        sqm: 0,
        amount: round2(Number(job.total) || 0),
        shipping: false,
      },
    ];
  }

  return items.map((it) => {
    const shipping = isShippingLine(it.item_name);
    const sheets = shipping ? 0 : sheetsOf(it);
    return {
      name: String(it.item_name || 'รายการ').trim() || 'รายการ',
      // ช่อง size ของรายการคือบรรทัดย่อยบนใบเสร็จ — ขนาด และ/หรือ รายละเอียด
      size: it.size ? String(it.size) : null,
      sheets,
      sqm: sqmOfSheets(sheets),
      amount: round2(Number(it.total) || 0),
      shipping,
    };
  });
}

function blankTotals() {
  return { sheets: 0, sqm: 0, goods: 0, shipping: 0, total: 0 };
}

function addInto(totals, line) {
  totals.sheets += line.sheets;
  if (line.shipping) totals.shipping = round2(totals.shipping + line.amount);
  else totals.goods = round2(totals.goods + line.amount);
  totals.total = round2(totals.goods + totals.shipping);
  totals.sqm = sqmOfSheets(totals.sheets);
  return totals;
}

/* บิลหนึ่งใบ → ใบสรุปที่จัดกลุ่มตามวันสั่ง
 *
 * เรียงวันจากเก่าไปใหม่ เพราะใบนี้อ่านเป็นลำดับเหตุการณ์ว่าสั่งอะไรไปเมื่อไหร่
 * ไม่ใช่รายการล่าสุดอยู่บนเหมือนหน้าจอในแอป
 */
export function buildOrderSummary(bill = {}) {
  const jobs = Array.isArray(bill.jobs) ? bill.jobs : [];
  const byDate = new Map();

  for (const job of jobs) {
    const date = String(job.job_date || '').slice(0, 10) || 'ไม่ระบุวัน';
    const day = byDate.get(date) || { date, lines: [], totals: blankTotals() };
    for (const line of linesOf(job)) {
      day.lines.push(line);
      addInto(day.totals, line);
    }
    byDate.set(date, day);
  }

  const days = [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const grand = blankTotals();
  for (const day of days) {
    grand.sheets += day.totals.sheets;
    grand.goods = round2(grand.goods + day.totals.goods);
    grand.shipping = round2(grand.shipping + day.totals.shipping);
  }
  grand.total = round2(grand.goods + grand.shipping);
  grand.sqm = sqmOfSheets(grand.sheets);

  /* ยอดที่ลูกค้าจ่ายจริงมาจากบิล ไม่ใช่ผลบวกของบรรทัด
   *
   * ร้านปัดราคาขึ้น/ลดให้ได้ ยอดบนบิลจึงเป็นตัวจริง ส่วนผลบวกของบรรทัดเป็นที่มา
   * ของมัน ใบสรุปต้องโชว์ตัวจริง ไม่งั้นลูกค้าบวกเองแล้วไม่ตรงกับที่โอนมา
   */
  const charged = round2(Number(bill.total) || 0);
  return {
    billNumber: bill.bill_number || null,
    customerName: bill.customer_name || null,
    days,
    grand,
    charged: charged > 0 ? charged : grand.total,
    // ต่างกันเมื่อร้านปัดราคา — หน้าที่แสดงผลเอาไปบอกว่าปัดไปเท่าไหร่
    adjusted: charged > 0 && Math.abs(charged - grand.total) >= 0.01,
  };
}
