import { round2, numText } from './currency.js';
import { derivePaymentFields } from './payment.js';
import { todayISO } from './dates.js';
import { matchSize, matchSqmRate, inferUnit, areaSqmExact, SQM_UNIT } from './area.js';

// A draft is a job that has been read but not saved: the shape stashed in
// user_states.context and shown as a preview card. Typed jobs and jobs read
// off a photographed document both go through here, so the preview and the
// eventual row look the same whichever way the job arrived.

// A square-metre job arrives carrying `working` — "4.8 ตร.ม. × 165 = 792", how
// the shop got to the price. That is the shop's business, not the customer's,
// so it comes off the item here (where every path builds its draft) and goes
// into the note, which only the shop's own job card renders.
function liftWorkings(items) {
  const lines = [];
  const clean = items.map((it) => {
    if (!it?.working) return it;
    lines.push(it.working);
    const { working, ...rest } = it;
    return rest;
  });
  return { items: clean, workings: lines };
}

export function makeDraft({
  jobName,
  customerName = null,
  jobDate,
  dueDate = null,
  items: rawItems = [],
  subtotal,
  discount = 0,
  total,
  paidAmount = 0,
  note = null,
}) {
  const { items, workings } = liftWorkings(rawItems);
  const sum = round2(items.reduce((s, it) => s + (Number(it.total) || 0), 0));
  const net = round2(total ?? sum - discount);

  // When the shop set the price themselves, the lines no longer add up to the
  // total — on purpose. Nothing renders `discount`, so say it here, where the
  // shop's own card shows it: otherwise the card looks like it cannot add up.
  const gap = round2(sum - net);
  const rounded =
    gap !== 0 && Math.abs(gap) < sum
      ? `${gap > 0 ? 'ลด' : 'เพิ่ม'}จาก ${numText(sum)} เป็น ${numText(net)} (${gap > 0 ? '-' : '+'}${numText(Math.abs(gap))})`
      : '';
  const fullNote =
    [note, workings.length ? `คิดตาม ตร.ม. — ${workings.join(' | ')}` : '', rounded]
      .filter(Boolean)
      .join('\n') || null;
  const pay = derivePaymentFields(net, paidAmount);
  return {
    jobName,
    customerName,
    jobDate: jobDate || todayISO(),
    dueDate: dueDate || null,
    items,
    subtotal: round2(subtotal ?? sum),
    discount: round2(discount),
    total: net,
    paidAmount: pay.paid_amount,
    balanceDue: pay.balance_due,
    paymentStatus: pay.payment_status,
    ...(fullNote ? { note: fullNote } : {}),
  };
}

// Shape a draft into the object the flex bubble expects
// (job_name / job_date / items / total / payment_status).
export function draftToBubble(draft) {
  return {
    job_name: draft.jobName,
    customer_name: draft.customerName || null,
    job_date: draft.jobDate,
    due_date: draft.dueDate || null,
    job_number: '',
    payment_status: draft.paymentStatus,
    total: draft.total,
    paid_amount: draft.paidAmount || 0,
    balance_due: draft.balanceDue || 0,
    items: draft.items,
    note: null,
  };
}

// Is this message just a number — the answer to "พิมพ์ราคามาได้เลย"? Returns
// the amount, or null for anything with words in it, which is a new job
// description rather than a price. "1500", "1,500", "฿1500", "1500 บาท".
export function parseBarePrice(text) {
  if (!/^฿?\s*[\d,]+(\.\d+)?\s*(บาท|฿)?$/.test(String(text ?? '').trim())) return null;
  const amount = round2(Number(String(text).replace(/[^0-9.]/g, '')));
  return amount > 0 ? amount : null;
}

/* "ตรมละ 350" ทั้งข้อความ — คำตอบของคำถามว่าคิดตารางเมตรละเท่าไหร่
 *
 * ใบสั่งงานที่ถ่ายมามักมีหลายบอร์ดหลายขนาดแต่ไม่มีราคา ร้านอยากตอบด้วยเรต
 * เดียวแล้วให้ม่วง "ไล่บอร์ด 1-2-3-4 มาเลย ขนาดเท่านี้ ตรมละเท่านี้ กี่บาท"
 *
 * ต้องเป็นเรตล้วน ๆ เท่านั้น ถ้ามีขนาดติดมาด้วย ("ไวนิล 160x300 ตรมละ 165")
 * นั่นคือบรรทัดงานใหม่ ไม่ใช่คำตอบของใบที่ค้างอยู่
 */
export function parseBareSqmRate(text) {
  const raw = String(text ?? '').trim();
  if (!raw || matchSize(raw)) return null;

  const hit = matchSqmRate(raw);
  if (!hit || hit.pieces) return null;

  // นอกจากเรตแล้ว เหลือได้แค่คำประกอบ ("บาทค่ะ") — มีคำอื่นแปลว่าเป็นประโยคงาน
  const leftover = raw
    .replace(hit.match, '')
    .replace(/บาท|ราคา|คิด|ค่ะ|คะ|ครับ|นะ|จ้า|เลย|ละกัน|แล้วกัน|[฿\s.,]/g, '');
  if (leftover !== '') return null;

  const rate = round2(hit.rate);
  return rate > 0 ? rate : null;
}

// พื้นที่ของรายการหนึ่งบรรทัด อ่านจากช่องขนาดก่อน ไม่มีค่อยลองชื่อของ
function itemArea(item) {
  const size = matchSize(String(item?.size || '')) || matchSize(String(item?.item_name || ''));
  if (!size) return null;
  const unit = size.unit || inferUnit(size.width, size.height);
  return areaSqmExact({ ...size, unit });
}

// ตัวเลขพื้นที่แบบที่ตรวจทานมือได้: สองตำแหน่งเมื่อคูณแล้วตรงเงิน ไม่งั้นสี่
function sqmShown(exact, rate) {
  const short = round2(exact);
  return numText(round2(short * rate) === round2(exact * rate) ? short : Number(exact.toFixed(4)));
}

/* ใส่ราคาตามตารางเมตรให้ทั้งใบ — ไล่ทีละบอร์ด
 *
 * คิดให้เฉพาะเมื่อ "ทุก" รายการมีขนาด รายการเดียวที่ไม่มีขนาดก็พอให้ยอดรวม
 * ทั้งใบผิดได้ และบอร์ดที่ขาดคือบอร์ดที่ร้านจะไม่มีวันรู้ว่าไม่ได้ถูกคิดเงิน
 *
 * คืน { draft, lines } — lines คือวิธีคิดทีละบรรทัดไว้พิมพ์ตอบในแชต
 * ("บอร์ด 1: 0.84 ตร.ม. × 350 = 294")
 */
export function priceDraftBySqm(draft, rate) {
  const r = round2(Number(rate) || 0);
  if (!(r > 0) || !draft || draft.total > 0 || !draft.items.length) return null;

  const lines = [];
  const items = [];
  for (const item of draft.items) {
    const exact = itemArea(item);
    if (!exact || !(exact > 0)) return null;

    const quantity = Number(item.quantity) || 1;
    const perPiece = round2(exact * r);
    const line =
      `${item.item_name || 'งาน'}: ${sqmShown(exact, r)} ${SQM_UNIT} × ${numText(r)} = ${numText(perPiece)}` +
      (quantity > 1 ? ` × ${numText(quantity)} ชิ้น = ${numText(round2(perPiece * quantity))}` : '');
    // `working` ถูก makeDraft ยกไปใส่โน้ตของงาน — เปิดดูทีหลังก็ยังเห็นวิธีคิด
    items.push({ ...item, unit_price: perPiece, total: round2(perPiece * quantity), working: line });
    lines.push(line);
  }

  const subtotal = round2(items.reduce((s, it) => s + it.total, 0));
  return {
    draft: makeDraft({ ...draft, items, subtotal, total: subtotal }),
    lines,
    rate: r,
  };
}

/* คำตอบของ "งานนี้ของลูกค้าท่านไหนคะ" — ชื่อคน ไม่ใช่คำคุย ไม่ใช่งาน
 *
 * รับเฉพาะข้อความสั้นที่ไม่มีตัวเลข (ชื่อที่มีเลขจะถูกทางอื่นอ่านเป็นงานไปก่อน
 * แล้ว) และไม่ใช่คำรับคำทั่วไป — "โอเค" ไม่ใช่ชื่อลูกค้า ต่อให้พิมพ์ตอนถูกถาม
 */
const NOT_A_NAME =
  /^(?:โอเค|โอเช|ok(?:ay)?|ได้(?:เลย|ค่ะ|ครับ|จ้า)?|ครับ(?:ผม)?|ค่ะ|คะ|จ้า|จ้ะ|อืม+|เยี่ยม|ดีมาก|ขอบคุณ(?:ค่ะ|ครับ|นะ)?|ใช่|ถูกต้อง|ตามนั้น)[\s.!]*$/i;

export function parseCustomerName(text) {
  const raw = String(text ?? '').trim();
  if (!raw || /[\d๐-๙]/.test(raw)) return null;
  if (NOT_A_NAME.test(raw)) return null;

  // "ของโรงเรียนบ้านดอน" / "ลูกค้าชื่อ ครูแนน" → เอาเฉพาะชื่อ
  const name = raw.replace(/^(?:ของ|ลูกค้า(?:ชื่อ)?|ชื่อ(?:ลูกค้า)?|คือ)\s*/u, '').trim();
  if (name.length < 2 || name.length > 40) return null;
  return name;
}

// Put a price on a draft that has none — the case a photographed job sheet
// leaves behind, where the paper says what to make but not what it costs.
//
// Only a single-line draft can be priced this way: with two lines there is no
// way to tell which one the number belongs to, and guessing would put money on
// the card that the user never said. The number is the line's TOTAL, so a line
// of four pieces comes back priced correctly per piece.
export function priceDraft(draft, price) {
  const amount = round2(Number(price) || 0);
  if (!(amount > 0) || draft.total > 0 || draft.items.length !== 1) return null;

  const [item] = draft.items;
  const quantity = Number(item.quantity) || 1;
  const items = [{ ...item, unit_price: round2(amount / quantity), total: amount }];
  return makeDraft({ ...draft, items, subtotal: amount, total: amount });
}
