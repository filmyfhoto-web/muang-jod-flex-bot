import { reply } from '../services/lineService.js';
import { setState, clearState, STATES } from '../services/stateService.js';
import {
  getBillableCustomers,
  getBillableJobs,
  createBill,
  getBillById,
  getLatestBill,
} from '../services/billService.js';
import { getJobById } from '../services/jobService.js';
import { billFlex, billCustomersFlex, billReceiptFlex } from '../flex/billFlex.js';

// action=create_bill — no customer yet: show who has unbilled work.
//                      with customer: bill everything of theirs at once.
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

  const bill = await createBill(
    profile.id,
    jobs.map((j) => j.id),
    { customerName }
  );
  if (!bill) {
    return reply(replyToken, { type: 'text', text: 'ออกบิลไม่สำเร็จค่ะ ลองใหม่อีกครั้งนะคะ' });
  }

  return reply(replyToken, [
    { type: 'text', text: `รวม ${bill.jobs.length} รายการเป็นบิลเดียวให้แล้วค่ะ 💜` },
    billFlex(bill),
  ]);
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
