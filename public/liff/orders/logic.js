// ตรรกะล้วนของหน้า "แชตและออเดอร์" — ไม่แตะ DOM ไม่แตะเครือข่าย
//
// แยกออกมาเพื่อให้เทสต์ได้โดยไม่ต้องมีเบราว์เซอร์ และให้หน้าจอกับเซิร์ฟเวอร์ใช้กติกา
// เดียวกัน ตัวเลขที่ส่งขึ้นเซิร์ฟเวอร์ยังถูกคำนวณใหม่ฝั่งเซิร์ฟเวอร์เสมอ — ที่นี่แค่
// ใช้โชว์ให้ร้านเห็นก่อนกดบันทึก

// ข้อความที่ต้องโชว์ทุกครั้งที่พูดถึงการส่งถึงลูกค้า — ตอนนี้ไม่มีช่องทางไหนเชื่อมจริง
export const NOT_CONNECTED_TEXT = 'ยังไม่ได้เชื่อมต่อช่องทางส่งถึงลูกค้า — บันทึกไว้ในระบบเท่านั้น';

export const FILTERS = [
  { id: 'all', label: 'ทั้งหมด' },
  { id: 'unread', label: 'รอตอบ' },
  { id: 'open', label: 'กำลังสั่งงาน' },
  { id: 'done', label: 'เสร็จแล้ว' },
];

// ภาษีมูลค่าเพิ่ม: ร้านยังไม่มีอัตราภาษีในระบบ (shop_profiles มีแค่เลขผู้เสียภาษี)
// จึงห้ามคำนวณ VAT เอง — หน้าจอต้องบอกว่าตั้งค่าไม่ได้
export const TAX_NOTE = 'ยังตั้งค่าภาษีไม่ได้ — ร้านยังไม่มีอัตราภาษีในระบบ ยอดนี้ยังไม่รวมภาษี';

export function round2(n) {
  const v = Number(n);
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : 0;
}

export function money(n) {
  return round2(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function lineTotal(quantity, unitPrice) {
  return round2((Number(quantity) || 0) * (Number(unitPrice) || 0));
}

export function sumItems(items = []) {
  return round2(items.reduce((s, it) => s + lineTotal(it.quantity, it.unit_price), 0));
}

/* ยอดของออเดอร์
 *   subtotal = รวมจากรายการ (ราคาที่คิดได้)
 *   total    = ยอดที่ร้านจะเก็บลูกค้า — ว่างไว้ = เท่ากับ subtotal
 *   adjust   = ส่วนต่าง: ติดลบคือลด/ปัดลง บวกคือปัดขึ้น (ตรงกับ discount ฝั่งเซิร์ฟเวอร์)
 */
export function orderTotals(items = [], customerTotal = '') {
  const subtotal = sumItems(items);
  const hasTotal = customerTotal !== '' && customerTotal !== null && customerTotal !== undefined;
  const total = hasTotal && Number.isFinite(Number(customerTotal)) ? round2(customerTotal) : subtotal;
  return { subtotal, total, adjust: round2(total - subtotal) };
}

// ----- รายชื่อแชต -----

export function matchesFilter(customer, filter) {
  switch (filter) {
    case 'unread':
      return customer.unread > 0;
    case 'open':
      return customer.openJobs > 0;
    case 'done':
      return customer.openJobs === 0 && customer.jobCount > 0;
    default:
      return true;
  }
}

export function filterCounts(customers = []) {
  return Object.fromEntries(FILTERS.map((f) => [f.id, customers.filter((c) => matchesFilter(c, f.id)).length]));
}

export function filterCustomers(customers = [], { filter = 'all', query = '' } = {}) {
  const q = String(query || '').trim().toLowerCase();
  return customers.filter((c) => {
    if (!matchesFilter(c, filter)) return false;
    if (!q) return true;
    return [c.name, c.orgName, c.lastMessage?.body].some((v) => String(v || '').toLowerCase().includes(q));
  });
}

// ----- ออเดอร์ -----

// ฟอร์มว่างสำหรับออเดอร์ใหม่ของลูกค้าคนหนึ่ง
export function blankForm({ customerName = '', jobDate = '' } = {}) {
  return {
    id: null,
    jobNumber: null,
    jobName: '',
    customerName,
    customerPhone: '',
    jobDate,
    dueDate: '',
    fulfillment: '',
    handlerName: '',
    note: '',
    customerTotal: '',
    items: [{ item_name: '', size: '', quantity: 1, unit: '', unit_price: 0 }],
  };
}

// งานจากเซิร์ฟเวอร์ → ฟอร์ม
export function jobToForm(job = {}) {
  return {
    id: job.id ?? null,
    jobNumber: job.job_number ?? null,
    jobName: job.job_name || '',
    customerName: job.customer_name || '',
    customerPhone: job.customer_phone || '',
    jobDate: job.job_date || '',
    dueDate: job.due_date || '',
    fulfillment: job.fulfillment || '',
    handlerName: job.handler_name || '',
    note: job.note || '',
    customerTotal: job.total === undefined || job.total === null ? '' : round2(job.total),
    items: (job.items || []).map((i) => ({
      item_name: i.item_name || '',
      size: i.size || '',
      quantity: Number(i.quantity) || 0,
      unit: i.unit || '',
      unit_price: round2(i.unit_price),
    })),
  };
}

// ผลจาก /api/parse → ฟอร์ม (ร้านยังต้องตรวจก่อนบันทึกเสมอ)
export function draftToForm(draft = {}, { customerName = '' } = {}) {
  const form = blankForm({ customerName: draft.customerName || customerName, jobDate: draft.jobDate || '' });
  form.jobName = draft.jobName || '';
  form.dueDate = draft.dueDate || '';
  form.note = draft.note || '';
  if (Array.isArray(draft.items) && draft.items.length) {
    form.items = draft.items.map((i) => ({
      item_name: i.item_name || i.name || '',
      size: i.size || '',
      quantity: Number(i.quantity) || 1,
      unit: i.unit || '',
      unit_price: round2(i.unit_price),
    }));
  }
  if (draft.total !== undefined && draft.total !== null) form.customerTotal = round2(draft.total);
  return form;
}

// ตรวจก่อนส่งขึ้นเซิร์ฟเวอร์ — คืนรายการข้อความที่ต้องแก้ (ว่าง= ผ่าน)
export function validateOrder(form = {}) {
  const errors = [];
  if (!String(form.customerName || '').trim()) errors.push('ต้องใส่ชื่อลูกค้าก่อนค่ะ');
  const items = form.items || [];
  if (!items.length) errors.push('ต้องมีรายการอย่างน้อย 1 รายการ');
  items.forEach((it, idx) => {
    const no = idx + 1;
    if (!String(it.item_name || '').trim()) errors.push(`รายการที่ ${no} ยังไม่ได้ใส่ชื่อ`);
    if (!(Number(it.quantity) > 0)) errors.push(`รายการที่ ${no} จำนวนต้องมากกว่า 0`);
    if (!(Number(it.unit_price) >= 0) || !Number.isFinite(Number(it.unit_price))) {
      errors.push(`รายการที่ ${no} ราคาต่อหน่วยไม่ถูกต้อง`);
    }
  });
  if (form.customerTotal !== '' && form.customerTotal !== null && form.customerTotal !== undefined) {
    const t = Number(form.customerTotal);
    if (!Number.isFinite(t) || t < 0) errors.push('ยอดที่เก็บลูกค้าต้องไม่ติดลบ');
  }
  return errors;
}

const TRIM = (v) => (String(v ?? '').trim() || null);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_OR_NULL = (v) => (ISO_DATE.test(String(v || '')) ? String(v) : null);

function itemRows(items = []) {
  return items.map((it) => ({
    item_name: String(it.item_name || '').trim(),
    size: TRIM(it.size),
    quantity: Number(it.quantity),
    unit: TRIM(it.unit),
    unit_price: round2(it.unit_price),
    total: lineTotal(it.quantity, it.unit_price),
  }));
}

// ฟอร์ม → body ของ POST /api/jobs (สร้างใหม่)
export function toCreatePayload(form = {}, { clientRef = null } = {}) {
  const t = orderTotals(form.items, form.customerTotal);
  return {
    jobName: TRIM(form.jobName),
    customerName: TRIM(form.customerName),
    jobDate: DATE_OR_NULL(form.jobDate) || undefined,
    dueDate: DATE_OR_NULL(form.dueDate),
    items: itemRows(form.items),
    customerTotal: t.total,
    note: TRIM(form.note),
    customerPhone: TRIM(form.customerPhone),
    fulfillment: form.fulfillment || null,
    handlerName: TRIM(form.handlerName),
    clientRef,
  };
}

// ฟอร์ม → body ของ PATCH /api/jobs/:id (แก้ของเดิม) — ไม่ส่งยอดจ่ายเงิน
// การรับเงิน/สถานะทำผ่านปุ่มของตัวเองเสมอ ไม่ปนมากับการบันทึกฟอร์ม
export function toPatchPayload(form = {}) {
  const t = orderTotals(form.items, form.customerTotal);
  return {
    job_name: TRIM(form.jobName) || TRIM(form.customerName) || 'งาน',
    customer_name: TRIM(form.customerName),
    total: t.total,
    subtotal: t.subtotal,
    job_date: DATE_OR_NULL(form.jobDate) || form.jobDate,
    due_date: DATE_OR_NULL(form.dueDate),
    note: TRIM(form.note),
    customer_phone: TRIM(form.customerPhone),
    fulfillment: form.fulfillment || null,
    handler_name: TRIM(form.handlerName),
    items: itemRows(form.items),
  };
}

// ใช้เทียบว่าฟอร์มถูกแก้จากที่โหลดมาหรือยัง (กันหายเงียบตอนเปลี่ยนลูกค้า)
export function snapshot(form) {
  return JSON.stringify(form || null);
}

export function isDirty(form, saved) {
  return snapshot(form) !== snapshot(saved);
}

// สถานะงานแบบอ่านง่าย — ตรงกับ done_at / picked_up_at ฝั่งเซิร์ฟเวอร์
export function workLabel(job = {}) {
  if (job.status === 'cancelled') return 'ยกเลิกแล้ว';
  if (job.picked_up_at) return 'ส่งมอบแล้ว';
  if (job.done_at) return 'ทำเสร็จ รอรับ/ส่ง';
  return 'รอดำเนินการ';
}

// เตือนก่อนปิดออเดอร์: ยังไม่ส่งมอบ หรือยังมียอดค้าง — คืนข้อความที่ต้องให้ร้านยืนยัน
export function closeWarnings({ delivered = false, balanceDue = 0 } = {}) {
  const warnings = [];
  if (!delivered) warnings.push('ยังไม่ได้ส่งมอบงาน');
  if (round2(balanceDue) > 0) warnings.push(`ยังมียอดค้าง ${money(balanceDue)} บาท`);
  return warnings;
}

// ข้อความสรุปสำหรับคัดลอกไปส่งเอง — ระบบยังส่งถึงลูกค้าไม่ได้
export function summaryText(form = {}, { jobNumber = null, shopName = '' } = {}) {
  const t = orderTotals(form.items, form.customerTotal);
  const lines = [];
  if (shopName) lines.push(shopName);
  lines.push(`สรุปรายการ ${jobNumber || '(ยังไม่บันทึกเลขออเดอร์)'}`);
  lines.push(`ลูกค้า: ${form.customerName || '-'}`);
  if (form.jobDate) lines.push(`วันที่: ${form.jobDate}`);
  if (form.dueDate) lines.push(`กำหนดรับ: ${form.dueDate}`);
  lines.push('');
  (form.items || []).forEach((it, idx) => {
    const qty = Number(it.quantity) || 0;
    const name = [it.item_name, it.size].filter(Boolean).join(' ');
    lines.push(`${idx + 1}. ${name} ${qty}${it.unit ? ` ${it.unit}` : ''} = ${money(lineTotal(it.quantity, it.unit_price))} บาท`);
  });
  lines.push('');
  lines.push(`ยอดรวม ${money(t.total)} บาท`);
  lines.push('(ยังไม่รวมภาษี — ร้านยังตั้งค่าภาษีไม่ได้)');
  return lines.join('\n');
}

// เวลาในแชตแบบไทย เช่น "14:05" ถ้าไม่ใช่วันนี้โชว์วันที่แทน
export function timeLabel(iso, now = new Date()) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const day = (x) => x.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
  if (day(d) === day(now)) {
    return d.toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', numberingSystem: 'latn' });
  }
  return d.toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', numberingSystem: 'latn' });
}

// กติกาเดียวกับ accountKey ฝั่งเซิร์ฟเวอร์ (src/utils/customerBook.js) — ใช้จับคู่ลูกค้าใหม่
// ที่เพิ่งพิมพ์ในหน้า ให้ตรงกับแชตเดิมของลูกค้าคนเดียวกัน
export function customerKeyOf(name) {
  const raw = String(name ?? '').trim();
  if (!raw) return '';
  return raw.replace(/[\s.·,\-–—]/g, '').toLowerCase();
}
