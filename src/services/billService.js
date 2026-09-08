import { randomBytes } from 'node:crypto';
import { supabase } from '../config/supabase.js';
import { round2 } from '../utils/currency.js';
import { todayISO } from '../utils/dates.js';
import { derivePaymentFields } from '../utils/payment.js';
import { logger } from './logger.js';

const ACTIVE_JOB_STATUSES = ['active', 'completed'];

// The receipt link's secret. Generated here rather than left to the column
// default, so the app owns it and it exists even on a database whose default
// was never applied. 24 random bytes = 48 hex characters.
export function newShareToken() {
  return randomBytes(24).toString('hex');
}

// bill_number format: MJ-B-YYYYMMDD-XXXX (per-user daily running number).
export function formatBillNumber(dateISO, seq) {
  return `MJ-B-${String(dateISO).replace(/-/g, '')}-${String(seq).padStart(4, '0')}`;
}

// Sum a set of jobs into the bill's money fields.
export function summarizeBill(jobs = []) {
  let subtotal = 0;
  let paid = 0;
  for (const j of jobs) {
    subtotal += Number(j.total) || 0;
    paid += Number(j.paid_amount) || 0;
  }
  const total = round2(subtotal);
  return { subtotal: total, discount: 0, total, ...derivePaymentFields(total, round2(paid)) };
}

async function dailyBillCount(userId, dateISO, client) {
  const { count } = await client
    .from('bills')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', `${dateISO}T00:00:00+07:00`)
    .lte('created_at', `${dateISO}T23:59:59.999+07:00`);
  return count || 0;
}

// Jobs that can still go on a bill: this user's, not cancelled, not billed.
export async function getBillableJobs(userId, opts = {}, client = supabase) {
  let query = client
    .from('jobs')
    .select('*')
    .eq('user_id', userId)
    .in('status', ACTIVE_JOB_STATUSES)
    .is('bill_id', null)
    .order('created_at', { ascending: false });

  if (opts.customerName) query = query.eq('customer_name', opts.customerName);

  const { data, error } = await query;
  if (error) {
    logger.error('bill.billable_failed', { message: error.message });
    throw error;
  }
  return data || [];
}

// Billable jobs grouped by customer, biggest outstanding first — the list the
// "ออกบิล" picker shows.
export async function getBillableCustomers(userId, client = supabase) {
  const jobs = await getBillableJobs(userId, {}, client);
  const byCustomer = new Map();
  for (const j of jobs) {
    const key = j.customer_name || '';
    const entry = byCustomer.get(key) || { customerName: j.customer_name || null, jobCount: 0, total: 0, due: 0 };
    entry.jobCount += 1;
    entry.total = round2(entry.total + (Number(j.total) || 0));
    entry.due = round2(entry.due + (Number(j.balance_due) || 0));
    byCustomer.set(key, entry);
  }
  return [...byCustomer.values()].sort((a, b) => b.due - a.due || b.total - a.total);
}

// Create a bill from the given jobs. Every job is re-read under this user, so
// a job id from another user (or one already billed) can never be pulled in.
export async function createBill(userId, jobIds = [], opts = {}, client = supabase) {
  const ids = [...new Set(jobIds.filter(Boolean))];
  if (!ids.length) return null;

  const { data: jobs, error: jobsErr } = await client
    .from('jobs')
    .select('*')
    .eq('user_id', userId)
    .in('status', ACTIVE_JOB_STATUSES)
    .is('bill_id', null)
    .in('id', ids);

  if (jobsErr) {
    logger.error('bill.jobs_failed', { message: jobsErr.message });
    throw jobsErr;
  }
  if (!jobs || !jobs.length) return null;

  const money = summarizeBill(jobs);
  const customerName =
    opts.customerName !== undefined ? opts.customerName : jobs.find((j) => j.customer_name)?.customer_name || null;

  const date = todayISO();
  let seq = await dailyBillCount(userId, date, client);
  let bill = null;
  let attempt = 0;

  while (!bill) {
    attempt += 1;
    seq += 1;
    const { data, error } = await client
      .from('bills')
      .insert({
        user_id: userId,
        bill_number: formatBillNumber(date, seq),
        customer_name: customerName,
        share_token: newShareToken(),
        status: 'active',
        ...money,
        note: opts.note ?? null,
      })
      .select('*')
      .single();

    if (!error) {
      bill = data;
      break;
    }
    if (error.code === '23505' && attempt < 25) continue; // bill_number race
    logger.error('bill.insert_failed', { code: error.code, message: error.message });
    throw error;
  }

  // Link the jobs. Still scoped by user, and still only unbilled ones, so a
  // concurrent bill cannot steal a job that just got attached elsewhere.
  const { data: linked, error: linkErr } = await client
    .from('jobs')
    .update({ bill_id: bill.id })
    .eq('user_id', userId)
    .is('bill_id', null)
    .in('id', jobs.map((j) => j.id))
    .select('*');

  if (linkErr) {
    logger.error('bill.link_failed_rollback', { message: linkErr.message });
    await client.from('bills').delete().eq('id', bill.id).eq('user_id', userId);
    throw linkErr;
  }

  const attached = linked || [];
  if (!attached.length) {
    await client.from('bills').delete().eq('id', bill.id).eq('user_id', userId);
    return null;
  }

  // Re-sum from what actually attached, in case a race took one away.
  if (attached.length !== jobs.length) {
    const fixed = summarizeBill(attached);
    const { data: updated } = await client
      .from('bills')
      .update(fixed)
      .eq('id', bill.id)
      .eq('user_id', userId)
      .select('*')
      .maybeSingle();
    if (updated) bill = updated;
  }

  logger.info('bill.created', { billNumber: bill.bill_number, jobs: attached.length });
  return { ...bill, jobs: attached };
}

async function attachJobs(bill, client) {
  if (!bill) return null;
  const { data, error } = await client
    .from('jobs')
    .select('*')
    .eq('bill_id', bill.id)
    .order('created_at', { ascending: true });
  if (error) {
    logger.error('bill.attach_jobs_failed', { message: error.message });
    return { ...bill, jobs: [] };
  }
  return { ...bill, jobs: data || [] };
}

export async function getBillById(userId, billId, client = supabase) {
  const { data, error } = await client
    .from('bills')
    .select('*')
    .eq('id', billId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    logger.error('bill.get_failed', { message: error.message });
    throw error;
  }
  return attachJobs(data, client);
}

export async function getLatestBill(userId, client = supabase) {
  const { data, error } = await client
    .from('bills')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) {
    logger.error('bill.latest_failed', { message: error.message });
    throw error;
  }
  return data?.length ? attachJobs(data[0], client) : null;
}

// Read one bill by its share token — the printable receipt page. Deliberately
// not user-scoped: the token IS the authorisation, so it must stay secret.
export async function getBillByToken(token, client = supabase) {
  const t = String(token || '').trim();
  if (!/^[a-f0-9]{16,128}$/i.test(t)) return null;

  const { data, error } = await client
    .from('bills')
    .select('*')
    .eq('share_token', t)
    .eq('status', 'active')
    .maybeSingle();
  if (error) {
    logger.error('bill.by_token_failed', { message: error.message });
    return null;
  }
  return data ? attachJobs(data, client) : null;
}

// Record a payment against a bill, and settle its jobs to match.
export async function recordBillPayment(userId, billId, amount, client = supabase) {
  const bill = await getBillById(userId, billId, client);
  if (!bill) return null;

  const newPaid = round2((Number(bill.paid_amount) || 0) + (Number(amount) || 0));
  const money = derivePaymentFields(bill.total, newPaid);
  const nowIso = new Date().toISOString();

  const { data: updated, error } = await client
    .from('bills')
    .update({
      ...money,
      ...(money.payment_status === 'paid' && !bill.issued_at ? { issued_at: nowIso } : {}),
    })
    .eq('id', bill.id)
    .eq('user_id', userId)
    .select('*')
    .maybeSingle();

  if (error) {
    logger.error('bill.payment_failed', { message: error.message });
    throw error;
  }
  if (!updated) return null;

  // Spread the money across the bill's jobs, oldest first, so each job's own
  // payment_status stays true — reports and "ค้างรับ" read jobs, not bills.
  let remaining = newPaid;
  for (const job of bill.jobs || []) {
    const jobTotal = round2(Number(job.total) || 0);
    const applied = round2(Math.min(remaining, jobTotal));
    remaining = round2(Math.max(remaining - applied, 0));
    await client
      .from('jobs')
      .update(derivePaymentFields(jobTotal, applied))
      .eq('id', job.id)
      .eq('user_id', userId);
  }

  logger.info('bill.paid', { billNumber: updated.bill_number, status: updated.payment_status });
  return attachJobs(updated, client);
}

// Open bills (not fully paid), newest first.
export async function getOpenBills(userId, client = supabase) {
  const { data, error } = await client
    .from('bills')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .in('payment_status', ['pending', 'partial'])
    .order('created_at', { ascending: false });
  if (error) {
    logger.error('bill.open_failed', { message: error.message });
    throw error;
  }
  return data || [];
}
