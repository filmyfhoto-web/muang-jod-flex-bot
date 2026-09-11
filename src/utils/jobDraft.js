import { round2, numText } from './currency.js';
import { derivePaymentFields } from './payment.js';
import { todayISO } from './dates.js';

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
