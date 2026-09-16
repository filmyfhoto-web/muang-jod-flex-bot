/* บิลรวมกอง แยกกลับเป็นคนละใบได้ยังไง
 *
 * ร้านถามว่า "ทำไมใบเสร็จไม่แยกเป็นคนๆ" ทั้งที่การออกบิลใหม่แยกให้แล้ว คำตอบคือ
 * ใบที่ร้านถืออยู่ออกไปก่อนหน้านั้น มันยังรวมกองอยู่ในฐานข้อมูลต่อไปเรื่อย ๆ และ
 * ไม่มีปุ่มไหนในแอปที่ถอยมันกลับได้ — แก้ทางสร้างอย่างเดียวจึงไม่พอ ของที่ออกผิด
 * ไปแล้วต้องมีทางแก้ด้วย
 *
 * แยกเป็นแผนล้วน ๆ ไว้ตรงนี้ เพราะทั้งฝั่งที่ลงมือแยกจริง (billService) และฝั่งที่
 * ตัดสินใจว่าจะโชว์ปุ่มไหม (billFlex) ต้องตอบเหมือนกันเป๊ะ ถ้าต่างคนต่างคิดเอง
 * จะมีวันที่ปุ่มขึ้นแต่กดแล้วไม่เกิดอะไร
 */

// งานที่มีชื่อลูกค้า รวมกันตามชื่อ (สามงานของพี่น้อย = ใบเดียวของพี่น้อย)
// งานที่ยังไม่ได้ใส่ชื่อ แยกใบละงาน เพราะกอง "ไม่ระบุ" ไม่ใช่ลูกค้าคนหนึ่ง
// มันคือคนละคนกันทั้งกอง
export function splitPlan(jobs = []) {
  const groups = [];
  const byName = new Map();
  for (const j of jobs) {
    const name = j.customer_name || null;
    if (!name) {
      groups.push({ customerName: null, jobs: [j] });
      continue;
    }
    const g = byName.get(name);
    if (g) {
      g.jobs.push(j);
      continue;
    }
    const fresh = { customerName: name, jobs: [j] };
    byName.set(name, fresh);
    groups.push(fresh);
  }
  return groups;
}

// บิลใบนี้แยกได้ไหม — แยกได้ต่อเมื่อแยกแล้วได้มากกว่าหนึ่งใบ และยังไม่มีเงินเข้า
// (ยอดที่รับมาผูกกับบิลใบเดียว พอแยกแล้วต้องเดาแทนร้านว่าเงินก้อนนั้นเป็นของใคร)
export function canSplitBill(bill) {
  if (!bill || bill.status === 'cancelled') return false;
  if (Number(bill.paid_amount) > 0) return false;
  return splitPlan(bill.jobs || []).length > 1;
}
