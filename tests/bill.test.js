import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMockSupabase } from './helpers/mockSupabase.js';
import {
  formatBillNumber,
  summarizeBill,
  getBillableJobs,
  getBillableCustomers,
  createBill,
  getBillById,
  getBillByToken,
  recordBillPayment,
  getOpenBills,
} from '../src/services/billService.js';
import { billFlex, billReceiptFlex, billCustomersFlex, receiptUrl, shareReceiptUrl } from '../src/flex/billFlex.js';
import { jobCardMessage, jobPreviewMessage } from '../src/flex/jobCard.js';
import { renderReceiptHtml, escapeHtml } from '../src/routes/receipt.js';
import { todayISO } from '../src/utils/dates.js';

const USER = 'user-1';
const OTHER = 'user-2';
const today = todayISO();

function job(id, over = {}) {
  return {
    id,
    user_id: USER,
    job_number: `MJ-x-${id}`,
    job_name: `งาน ${id}`,
    customer_name: 'พี่นก',
    job_date: today,
    total: 100,
    paid_amount: 0,
    balance_due: 100,
    payment_status: 'pending',
    status: 'active',
    bill_id: null,
    created_at: `2026-09-08T0${id}:00:00.000Z`,
    ...over,
  };
}

function db(extra = []) {
  return createMockSupabase({
    jobs: [
      job('1'),
      job('2', { total: 200, balance_due: 200 }),
      job('3', { customer_name: 'ร้านกาแฟ', total: 50, balance_due: 50 }),
      job('4', { status: 'cancelled', total: 999 }),
      job('5', { bill_id: 'other-bill', total: 888 }),
      { ...job('6', { total: 777 }), user_id: OTHER },
      ...extra,
    ],
  });
}

test('bill numbers and the money summary', () => {
  assert.equal(formatBillNumber('2026-09-08', 3), 'MJ-B-20260908-0003');

  const money = summarizeBill([
    { total: 100, paid_amount: 0 },
    { total: 200, paid_amount: 50 },
  ]);
  assert.equal(money.total, 300);
  assert.equal(money.paid_amount, 50);
  assert.equal(money.balance_due, 250);
  assert.equal(money.payment_status, 'partial');

  assert.equal(summarizeBill([]).total, 0);
  assert.equal(summarizeBill([]).payment_status, 'pending');
});

test('billable jobs exclude cancelled, already-billed, and other users', async () => {
  const jobs = await getBillableJobs(USER, {}, db());
  assert.deepEqual(jobs.map((j) => j.id).sort(), ['1', '2', '3']);

  const nok = await getBillableJobs(USER, { customerName: 'พี่นก' }, db());
  assert.deepEqual(nok.map((j) => j.id).sort(), ['1', '2']);
});

test('billable customers are grouped and ordered by what is owed', async () => {
  const customers = await getBillableCustomers(USER, db());
  assert.equal(customers.length, 2);
  assert.equal(customers[0].customerName, 'พี่นก');
  assert.equal(customers[0].jobCount, 2);
  assert.equal(customers[0].total, 300);
  assert.equal(customers[1].customerName, 'ร้านกาแฟ');
});

test('createBill links only this user\'s unbilled jobs and sums them', async () => {
  const client = db();
  const bill = await createBill(USER, ['1', '2'], { customerName: 'พี่นก' }, client);

  assert.match(bill.bill_number, /^MJ-B-\d{8}-\d{4}$/);
  assert.equal(bill.customer_name, 'พี่นก');
  assert.equal(bill.total, 300);
  assert.equal(bill.balance_due, 300);
  assert.equal(bill.jobs.length, 2);
  // The jobs now point at the bill, so they can't be billed twice.
  assert.deepEqual((await getBillableJobs(USER, {}, client)).map((j) => j.id), ['3']);
});

test('createBill refuses jobs that are not the caller\'s to bill', async () => {
  const client = db();
  assert.equal(await createBill(USER, ['6'], {}, client), null); // another user's
  assert.equal(await createBill(USER, ['4'], {}, client), null); // cancelled
  assert.equal(await createBill(USER, ['5'], {}, client), null); // already billed
  assert.equal(await createBill(USER, [], {}, client), null);
  assert.equal(client._store.tables.bills.length, 0); // no orphan bill left behind
});

test('a bill is readable by its owner and by its share token, not by others', async () => {
  const client = db();
  const bill = await createBill(USER, ['1', '2'], {}, client);

  assert.equal((await getBillById(USER, bill.id, client)).id, bill.id);
  assert.equal(await getBillById(OTHER, bill.id, client), null);

  const byToken = await getBillByToken(bill.share_token, client);
  assert.equal(byToken.id, bill.id);
  assert.equal(byToken.jobs.length, 2);

  // A token that is not a token never reaches the database.
  assert.equal(await getBillByToken('', client), null);
  assert.equal(await getBillByToken('../../etc/passwd', client), null);
  assert.equal(await getBillByToken('short', client), null);
  assert.equal(await getBillByToken('a'.repeat(48), client), null); // well-formed, unknown
});

test('paying a bill settles it and its jobs, in instalments', async () => {
  const client = db();
  const bill = await createBill(USER, ['1', '2'], {}, client); // 300

  const partial = await recordBillPayment(USER, bill.id, 150, client);
  assert.equal(partial.payment_status, 'partial');
  assert.equal(partial.paid_amount, 150);
  assert.equal(partial.balance_due, 150);
  // 150 covers the first job (100) and part of the second.
  const jobsAfter = client._store.tables.jobs;
  assert.equal(jobsAfter.find((j) => j.id === '1').payment_status, 'paid');
  assert.equal(jobsAfter.find((j) => j.id === '2').payment_status, 'partial');
  assert.equal(Number(jobsAfter.find((j) => j.id === '2').balance_due), 150);

  const settled = await recordBillPayment(USER, bill.id, 150, client);
  assert.equal(settled.payment_status, 'paid');
  assert.equal(settled.balance_due, 0);
  assert.ok(settled.issued_at, 'issued_at is stamped when the bill is settled');
  assert.ok(jobsAfter.filter((j) => ['1', '2'].includes(j.id)).every((j) => j.payment_status === 'paid'));

  assert.equal(await recordBillPayment(OTHER, bill.id, 50, client), null);
  assert.deepEqual(await getOpenBills(USER, client), []);
});

test('bill card: rows, total and the settle action; receipt link only with a base URL', async () => {
  const client = db();
  const bill = await createBill(USER, ['1', '2'], { customerName: 'พี่นก' }, client);

  const json = JSON.stringify(billFlex(bill, { receiptUrl: 'https://bot.example.com/r/tok' }));
  assert.ok(json.includes('บิลรวมรายการ'));
  assert.ok(json.includes(bill.bill_number));
  assert.ok(json.includes('ลูกค้า: พี่นก'));
  assert.ok(json.includes('฿300'));
  assert.ok(json.includes(`action=bill_payment&billId=${bill.id}`));
  assert.ok(json.includes('https://bot.example.com/r/tok'));

  const noUrl = JSON.stringify(billFlex(bill, { receiptUrl: null }));
  assert.ok(!noUrl.includes('"type":"uri"'));

  assert.equal(receiptUrl(bill, { baseUrl: 'https://bot.example.com' }), `https://bot.example.com/r/${bill.share_token}`);
  assert.equal(receiptUrl(bill, { baseUrl: null }), null);
  assert.equal(receiptUrl({}, { baseUrl: 'https://bot.example.com' }), null);
});

test('receipt card says settled only when the bill actually is', async () => {
  const client = db();
  const bill = await createBill(USER, ['1'], {}, client);

  const partialCard = JSON.stringify(billReceiptFlex({ ...bill, payment_status: 'partial', paid_amount: 40, balance_due: 60 }, { mascotImageUrl: null, receiptUrl: null }));
  assert.ok(partialCard.includes('รับชำระบางส่วน'));
  assert.ok(partialCard.includes('ยังค้าง'));

  const paid = await recordBillPayment(USER, bill.id, 100, client);
  const paidCard = JSON.stringify(billReceiptFlex(paid, { mascotImageUrl: null, receiptUrl: 'https://bot.example.com/r/tok' }));
  assert.ok(paidCard.includes('ออกใบเสร็จแล้ว'));
  assert.ok(paidCard.includes('https://bot.example.com/r/tok'));
});

test('customer picker lists who owes, and says so when nobody does', async () => {
  const customers = await getBillableCustomers(USER, db());
  const json = JSON.stringify(billCustomersFlex(customers));
  assert.ok(json.includes('พี่นก'));
  assert.ok(json.includes('action=create_bill&customer='));

  const empty = billCustomersFlex([]);
  assert.equal(empty.type, 'text');
  assert.ok(empty.text.includes('ยังไม่มีงานที่รอออกบิล'));
});

test('receipt page: renders the bill and escapes what customers typed', async () => {
  const client = db([job('7', { customer_name: '<script>alert(1)</script>', total: 10, balance_due: 10 })]);
  const bill = await createBill(USER, ['7'], { customerName: '<script>alert(1)</script>' }, client);
  const paid = await recordBillPayment(USER, bill.id, 10, client);

  const html = renderReceiptHtml(paid);
  assert.ok(html.includes('ใบเสร็จรับเงิน'));
  assert.ok(html.includes(bill.bill_number));
  assert.ok(html.includes('noindex'));
  assert.ok(!html.includes('<script>alert(1)</script>'), 'customer text must not reach the page as markup');
  assert.ok(html.includes('&lt;script&gt;'));

  // An unpaid bill is a statement, not a receipt.
  assert.ok(renderReceiptHtml({ ...bill, payment_status: 'pending', jobs: [] }).includes('ใบแจ้งยอด'));
  assert.equal(escapeHtml(`<a href="x">&'`), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
});


test('a finished receipt can be handed to the customer without a push', () => {
  // The shop sends it themselves through LINE's own friend picker, so the bot
  // never needs to know who the customer is on LINE, and never spends a push.
  const bill = {
    id: 'b1',
    bill_number: 'MJ-B-20260910-0001',
    customer_name: 'รพ.สต.บ้านชี',
    total: 1200,
    paid_amount: 1200,
    balance_due: 0,
    payment_status: 'paid',
    created_at: '2026-09-10T03:00:00Z',
    share_token: 'tok123',
    jobs: [],
  };
  const url = shareReceiptUrl(bill, { baseUrl: 'https://bot.example' });
  assert.ok(url.startsWith('https://line.me/R/share?text='), 'not the LINE share picker');

  const text = decodeURIComponent(url.slice('https://line.me/R/share?text='.length));
  assert.match(text, /ใบเสร็จรับเงิน/);
  assert.match(text, /MJ-B-20260910-0001/);
  assert.match(text, /รพ\.สต\.บ้านชี/);
  assert.match(text, /฿1,200/);
  assert.ok(text.includes('https://bot.example/r/tok123'), 'the receipt link is missing');

  // Both cards offer it, and both also keep the plain "open it" button.
  for (const card of [billFlex(bill, { baseUrl: 'https://bot.example' }), billReceiptFlex(bill, { baseUrl: 'https://bot.example' })]) {
    const json = JSON.stringify(card);
    assert.ok(json.includes('📤 ส่งให้ลูกค้า'), 'no share button');
    assert.ok(json.includes('🧾 เปิดใบเสร็จ'), 'no open button');
  }

  // With no public URL there is no link to share, so neither button appears
  // rather than one that goes nowhere.
  const nowhere = JSON.stringify(billReceiptFlex(bill, { baseUrl: null }));
  assert.ok(!nowhere.includes('ส่งให้ลูกค้า'));
  assert.ok(!nowhere.includes('เปิดใบเสร็จ'));
});

test('a saved job can be billed on its own, from its own card', () => {
  const job = {
    id: 'job-9',
    job_name: 'ป้ายไวนิล',
    job_date: '2026-09-10',
    total: 792,
    payment_status: 'pending',
    items: [],
  };
  const json = JSON.stringify(jobCardMessage(job));
  assert.ok(json.includes('action=bill_job&jobId=job-9'), 'no per-job receipt button');
  assert.ok(json.includes('🧾 ออกใบเสร็จ'));

  // A draft has no id and nothing to bill yet.
  assert.ok(!JSON.stringify(jobPreviewMessage(job)).includes('bill_job'));
});
