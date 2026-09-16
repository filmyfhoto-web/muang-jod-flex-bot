import { reply } from '../services/lineService.js';
import { setState, clearState, STATES } from '../services/stateService.js';
import {
  getBillableCustomers,
  getBillableJobs,
  createBill,
  getBillById,
  getLatestBill,
  splitBill,
  getSplittableBills,
} from '../services/billService.js';
import { getJobById } from '../services/jobService.js';
import {
  billFlex,
  billCustomersFlex,
  billJobsFlex,
  billReceiptFlex,
  billsCarousel,
  CAROUSEL_MAX,
} from '../flex/billFlex.js';

// action=create_bill — no customer yet: show who has unbilled work.
//                      with customer: show that customer's jobs to choose from.
//
// Picking a customer used to bill every job they had waiting, in one lump. A
// shop that finishes one of three jobs and wants to hand over a receipt for it
// could not: the other two were dragged onto the same bill. So the choice is
// the shop's now — a job to bill it on its own, or รวมทุกงาน to combine.
export async function createBillAction({ replyToken, profile, params }) {
  const customer = params?.customer;

  if (customer === undefined) {
    const customers = await getBillableCustomers(profile.id);
    return reply(replyToken, billCustomersFlex(customers));
  }

  // The picker sends "" for jobs saved without a customer name.
  const customerName = customer === '' ? null : customer;
  const jobs = await getBillableJobs(profile.id, { customerName });
  if (!jobs.length) {
    return reply(replyToken, {
      type: 'text',
      text: 'ไม่มีงานที่รอออกบิลของลูกค้ารายนี้แล้วค่ะ 💜',
    });
  }

  // One job is not a choice — asking which of the one they meant is a tap for
  // nothing, so bill it.
  if (jobs.length === 1) return billJobs(replyToken, profile.id, jobs, customerName);

  return reply(replyToken, billJobsFlex(customerName, jobs));
}

/* งานที่ไม่ได้ใส่ชื่อลูกค้า รวมเป็นบิลเดียวไม่ได้
 *
 * ร้านบอกว่า "ออกใบเสร็จเฉพาะคนค่ะ ไม่รวม" — กลุ่ม "ไม่ระบุ" ไม่ใช่ลูกค้าคนหนึ่ง
 * มันคือกองที่ยังไม่ได้ใส่ชื่อ ซึ่งเป็นคนละคนกันทั้งกอง การกด "รวมทุกงาน" ตรงนั้น
 * จึงไม่มีทางถูก ไม่ว่าการกรองจะทำงานถูกแค่ไหน
 */
const NO_NAME_WARNING =
  'งานพวกนี้ยังไม่ได้ใส่ชื่อลูกค้าค่ะ รวมเป็นบิลเดียวไม่ได้นะคะ\n' +
  'เพราะแต่ละงานอาจเป็นคนละคนกัน — แตะงานที่ต้องการ เพื่อออกใบเสร็จทีละงานได้เลยค่ะ 💜';

// action=bill_all&customer=… — the old behaviour, kept where it belongs: as a
// choice at the bottom of the job list rather than the only thing that happens.
export async function billAllForCustomer({ replyToken, profile, params }) {
  const customer = params?.customer;
  const customerName = customer === '' || customer === undefined ? null : customer;
  const jobs = await getBillableJobs(profile.id, { customerName });
  if (!jobs.length) {
    return reply(replyToken, { type: 'text', text: 'ไม่มีงานที่รอออกบิลของลูกค้ารายนี้แล้วค่ะ 💜' });
  }
  // กองที่ยังไม่ได้ใส่ชื่อ = คนละคนกัน รวมไม่ได้ ยื่นรายชื่องานให้เลือกทีละงานแทน
  if (!customerName) {
    return reply(replyToken, [
      { type: 'text', text: NO_NAME_WARNING },
      billJobsFlex(null, jobs),
    ]);
  }
  return billJobs(replyToken, profile.id, jobs, customerName);
}

// Make one bill out of these jobs and show it.
async function billJobs(replyToken, userId, jobs, customerName) {
  const bill = await createBill(
    userId,
    jobs.map((j) => j.id),
    { customerName }
  );
  if (!bill) {
    return reply(replyToken, { type: 'text', text: 'ออกบิลไม่สำเร็จค่ะ ลองใหม่อีกครั้งนะคะ' });
  }

  return reply(replyToken, [
    {
      type: 'text',
      text:
        bill.jobs.length === 1
          ? 'ออกบิลให้งานนี้แล้วค่ะ 💜'
          : `รวม ${bill.jobs.length} รายการเป็นบิลเดียวให้แล้วค่ะ 💜`,
    },
    billFlex(bill),
  ]);
}

/* action=split_bills — บิลใบไหนบ้างที่ยังรวมกองอยู่
 *
 * บิลที่ออกไปแล้วหาไม่เจอในแชต การ์ดเก่าเลื่อนหายไปนานแล้ว ใบที่ต้องแก้จึงเป็น
 * ใบที่มองไม่เห็นพอดี — พิมพ์ "แยกบิล" แล้วม่วงยกมันกลับมาให้
 */
export async function splitBillsList({ replyToken, profile }) {
  const bills = await getSplittableBills(profile.id, CAROUSEL_MAX);
  if (!bills.length) {
    return reply(replyToken, {
      type: 'text',
      text: 'ไม่มีบิลที่ต้องแยกแล้วค่ะ ทุกใบเป็นของคนเดียวอยู่แล้วนะคะ 💜',
    });
  }
  return reply(replyToken, [
    {
      type: 'text',
      text:
        `มีบิลที่ยังรวมงานของหลายคนอยู่ ${bills.length} ใบค่ะ\n` +
        'กด "✂️ แยกเป็นคนละใบ" บนใบที่ต้องการได้เลยนะคะ 💜',
    },
    billsCarousel(bills),
  ]);
}

/* action=split_bill&billId=… — ถอยบิลรวมกอง ออกเป็นใบของแต่ละคน
 *
 * การแก้ตอนสร้าง (บิลใหม่ไม่รวมคนอื่นแล้ว) ไม่ช่วยใบที่ออกไปก่อนหน้านั้นเลย
 * ร้านจึงยังเปิดดูแล้วเห็นสี่คนอยู่ในใบเดียว และแก้เองไม่ได้ ปุ่มนี้คือทางแก้
 */
const SPLIT_REFUSALS = {
  not_found: 'ไม่พบบิลนี้ค่ะ',
  cancelled: 'บิลนี้ถูกยกเลิกไปแล้วค่ะ',
  paid: 'บิลนี้รับเงินมาแล้ว แยกให้ไม่ได้ค่ะ\nเพราะม่วงจะไม่รู้ว่าเงินที่รับมาเป็นของใคร — ถ้าต้องแยกจริง ๆ บอกม่วงได้นะคะ 💜',
  nothing_to_split: 'บิลนี้เป็นของคนเดียวอยู่แล้วค่ะ ไม่ต้องแยกนะคะ 💜',
};

export async function splitBillAction({ replyToken, profile, params }) {
  const result = await splitBill(profile.id, params?.billId);
  if (!result.ok) {
    return reply(replyToken, { type: 'text', text: SPLIT_REFUSALS[result.why] || SPLIT_REFUSALS.not_found });
  }

  const { from, bills } = result;
  const lines = [
    `แยกบิล${from.bill_number ? ` ${from.bill_number}` : ''} ออกเป็น ${bills.length} ใบแล้วค่ะ 💜`,
    'ใบเดิมถูกยกเลิก ลิงก์เก่าจะเปิดไม่ได้แล้วนะคะ',
  ];
  if (bills.length > CAROUSEL_MAX) {
    lines.push(`(แสดง ${CAROUSEL_MAX} ใบแรก ที่เหลือดูในเมนูบิลได้ค่ะ)`);
  }
  return reply(replyToken, [{ type: 'text', text: lines.join('\n') }, billsCarousel(bills)]);
}

// action=bill_payment&billId=… — ask how much came in.
export async function billPaymentPrompt({ replyToken, profile, params }) {
  const bill = params?.billId ? await getBillById(profile.id, params.billId) : await getLatestBill(profile.id);
  if (!bill) {
    return reply(replyToken, { type: 'text', text: 'ไม่พบบิลนี้ค่ะ ลองกด "ออกบิล" ใหม่นะคะ' });
  }
  if (bill.payment_status === 'paid') {
    return reply(replyToken, [
      { type: 'text', text: 'บิลนี้ชำระครบแล้วค่ะ 💜' },
      billReceiptFlex(bill),
    ]);
  }

  await setState(profile.id, STATES.WAITING_FOR_BILL_PAYMENT, { billId: bill.id });
  return reply(replyToken, {
    type: 'text',
    text:
      `บิล ${bill.bill_number} ยอด ${Number(bill.total).toLocaleString('th-TH')} บาท\n` +
      `ค้างอยู่ ${Number(bill.balance_due).toLocaleString('th-TH')} บาท\n\n` +
      'รับเงินมาเท่าไหร่คะ? พิมพ์เป็นตัวเลขได้เลยค่ะ 💜',
  });
}

// action=view_receipt&billId=… — show the receipt card for a bill.
export async function viewReceipt({ replyToken, profile, params }) {
  const bill = params?.billId ? await getBillById(profile.id, params.billId) : await getLatestBill(profile.id);
  if (!bill) {
    return reply(replyToken, { type: 'text', text: 'ยังไม่มีบิลให้ออกใบเสร็จค่ะ 💜' });
  }
  await clearState(profile.id);
  return reply(replyToken, billReceiptFlex(bill));
}

// action=bill_job&jobId=… — a receipt for this one job, from its own card.
//
// The customer picker bills everything a customer has waiting at once, which
// is right when the shop settles up. This is the other half: one job, one
// receipt, handed over as the work is handed over.
export async function billOneJob({ replyToken, profile, params }) {
  const jobId = params?.jobId;
  const job = jobId ? await getJobById(profile.id, jobId) : null;
  if (!job) {
    return reply(replyToken, { type: 'text', text: 'ไม่พบงานนี้ค่ะ' });
  }
  if (job.bill_id) {
    const existing = await getBillById(profile.id, job.bill_id);
    return reply(replyToken, [
      { type: 'text', text: 'งานนี้ออกบิลไปแล้วค่ะ นี่คือบิลเดิมนะคะ 💜' },
      ...(existing ? [billFlex(existing)] : []),
    ]);
  }

  const bill = await createBill(profile.id, [job.id], { customerName: job.customer_name ?? null });
  if (!bill) {
    return reply(replyToken, { type: 'text', text: 'ออกบิลไม่สำเร็จค่ะ ลองใหม่อีกครั้งนะคะ' });
  }

  return reply(replyToken, [
    { type: 'text', text: 'ออกบิลให้งานนี้แล้วค่ะ กด "📤 ส่งให้ลูกค้า" เพื่อส่งต่อในไลน์ได้เลย 💜' },
    billFlex(bill),
  ]);
}
