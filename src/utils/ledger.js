import { round2 } from './currency.js';
import { customerKind } from './customerKind.js';
import { jobOwed } from './customerBook.js';

/* ใบลงบัญชีประจำวัน — เงินที่ "รับมาจริง" วันนี้ แยกเงินสดกับเงินโอน
 *
 * ร้านบอกว่าอยากได้ "ใบลงบัญชี" คู่กับใบเสร็จ สองใบนี้คนละเรื่องกัน:
 *
 *   ใบเสร็จ      ให้ลูกค้า — งานของเจ้านั้น ยอดของเจ้านั้น
 *   ใบลงบัญชี    ให้คนทำบัญชี — เงินทั้งวันของร้าน ไม่สนว่าใครจ่าย สนว่า
 *                เข้ามาทางไหน เพราะเงินสดอยู่ในลิ้นชัก เงินโอนอยู่ในธนาคาร
 *                ต้องกระทบยอดคนละทาง
 *
 * "รับมาจริงวันนี้" คิดจากงานที่เก็บเงินครบแล้วและลงบัญชีในวันนั้น ส่วนงานที่
 * ส่งของไปแล้วแต่ยังไม่ได้เงิน ไม่ใช่รายรับ — แยกไว้เป็นยอดยกไป ไม่ปนกัน
 */

export const PAY_METHODS = [
  { id: 'cash', label: 'เงินสด' },
  { id: 'transfer', label: 'โอน' },
  { id: 'unknown', label: 'ยังไม่ได้บอก' },
];

export function payMethod(job) {
  const m = job?.pay_method;
  return m === 'cash' || m === 'transfer' ? m : 'unknown';
}

/* งานใบนี้ลงบัญชีวันไหน (ตามเวลาไทย)
 *
 * ตัดวันด้วยเขตเวลาไทย ไม่ใช่ UTC — ร้านปิดสี่ทุ่ม ซึ่งเป็นวันถัดไปแล้วใน UTC
 * ถ้าตัดด้วย UTC ยอดของค่ำวันนี้จะไปโผล่ในใบของพรุ่งนี้
 */
export function bookedDate(job, tz = '+07:00') {
  const at = job?.booked_at;
  if (!at) return null;
  const ms = Date.parse(at);
  if (Number.isNaN(ms)) return null;
  const offsetMin = Number(tz.slice(1, 3)) * 60 + Number(tz.slice(4, 6));
  const shifted = new Date(ms + (tz.startsWith('-') ? -offsetMin : offsetMin) * 60_000);
  return shifted.toISOString().slice(0, 10);
}

/* ใบลงบัญชีของวันหนึ่ง
 *
 * jobs = งานทั้งหมดที่ยังไม่ถูกยกเลิก · dateISO = วันที่ต้องการ (YYYY-MM-DD)
 */
export function buildLedger(jobs = [], dateISO, tz = '+07:00', { expenses = [] } = {}) {
  const rows = [];
  const byMethod = new Map(PAY_METHODS.map((m) => [m.id, { ...m, jobCount: 0, total: 0 }]));
  let total = 0;

  let carryOwed = 0;
  let carryCount = 0;

  /* ยอดยกไปแยกสองกอง — ร้านขอ "แยกเงินสดกับลงบัญชีไว้เช็คงานอีกที"
   *
   *   account  ลงบัญชีไว้แล้วแต่ยังไม่ได้รับเงิน (ขายเชื่อ รอวางบิล)
   *   unpaid   ยังไม่ได้รับเงินและยังไม่ได้ลงบัญชี
   *
   * สองกองนี้ต้องตามคนละแบบ กองแรกเก็บตามบิล กองหลังยังไม่รู้ว่าจะเป็นเงินสดหรือ
   * ลงบัญชี จึงต้องกลับมาเช็คและตัดสินใจ
   */
  const carryBy = {
    account: { owed: 0, jobCount: 0, rows: [] },
    unpaid: { owed: 0, jobCount: 0, rows: [] },
  };

  for (const job of jobs) {
    if (!job || job.status === 'cancelled') continue;

    const owedNow = jobOwed(job);

    /* ลงบัญชีแล้วแต่ยังไม่ได้รับเงิน (ขายเชื่อ) ไม่ใช่รายรับ — เงินยังไม่เข้า
     * ไม่ว่าจะเป็นลิ้นชักหรือธนาคาร จึงไปอยู่ในยอดยกไปแทน
     */
    if (bookedDate(job, tz) === dateISO && owedNow <= 0) {
      const amount = round2(Number(job.total) || 0);
      const method = payMethod(job);
      const bucket = byMethod.get(method);
      bucket.jobCount += 1;
      bucket.total = round2(bucket.total + amount);
      total = round2(total + amount);
      rows.push({
        id: job.id,
        jobNumber: job.job_number || null,
        jobName: job.job_name || null,
        customerName: job.customer_name || null,
        kind: customerKind(job),
        method,
        methodLabel: bucket.label,
        amount,
      });
      continue;
    }

    // ยังค้างเงินอยู่ = ยอดยกไป ไม่ใช่รายรับของวันนี้ (ลงบัญชีไว้แล้วหรือยังก็ตาม)
    if (owedNow > 0) {
      carryOwed = round2(carryOwed + owedNow);
      carryCount += 1;
      const bucket = job.booked_at ? carryBy.account : carryBy.unpaid;
      bucket.owed = round2(bucket.owed + owedNow);
      bucket.jobCount += 1;
      bucket.rows.push({
        id: job.id,
        jobNumber: job.job_number || null,
        jobName: job.job_name || null,
        customerName: job.customer_name || null,
        kind: customerKind(job),
        total: round2(Number(job.total) || 0),
        owed: owedNow,
      });
    }
  }

  // ค้างมากอยู่บน — เจ้าที่ต้องตามก่อน
  for (const b of Object.values(carryBy)) b.rows.sort((a, c) => c.owed - a.owed);

  // เรียงตามวิธีจ่ายแล้วค่อยตามยอด — คนทำบัญชีอ่านทีละกอง ไม่ใช่ทีละใบ
  const order = { cash: 0, transfer: 1, unknown: 2 };
  rows.sort((a, b) => order[a.method] - order[b.method] || b.amount - a.amount);

  /* รายจ่ายของวัน (V2 "จดรายรับ–รายจ่าย") — เงินออก คู่กับเงินเข้าข้างบน
   *
   * net = รับจริงวันนี้ ลบ จ่ายวันนี้ — ตัวเลขที่ร้านถามตอนปิดวันว่า "เหลือเท่าไหร่"
   * รายจ่ายไม่แตะกองรับและยอดยกไป มันเป็นคนละสายน้ำกัน แค่สรุปอยู่ท้ายใบเดียวกัน
   */
  const expenseRows = (expenses || [])
    .filter((e) => e && e.status !== 'cancelled')
    .map((e) => ({
      id: e.id,
      item: e.item,
      amount: round2(Number(e.amount) || 0),
      method: e.pay_method === 'cash' || e.pay_method === 'transfer' ? e.pay_method : 'unknown',
    }));
  const expenseTotal = round2(expenseRows.reduce((t, e) => t + e.amount, 0));

  return {
    date: dateISO,
    rows,
    methods: [...byMethod.values()].filter((m) => m.jobCount > 0),
    total,
    jobCount: rows.length,
    carry: { owed: carryOwed, jobCount: carryCount, account: carryBy.account, unpaid: carryBy.unpaid },
    expense: { rows: expenseRows, total: expenseTotal, count: expenseRows.length },
    net: round2(total - expenseTotal),
  };
}
