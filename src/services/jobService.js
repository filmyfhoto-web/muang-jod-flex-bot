import { supabase } from '../config/supabase.js';
import { round2 } from '../utils/currency.js';
import { todayISO, rangeForPeriod } from '../utils/dates.js';
import { derivePaymentFields } from '../utils/payment.js';
import { categoryFields } from '../utils/category.js';
import { logger } from './logger.js';

const ACTIVE_STATUSES = ['active', 'completed'];

// job_number format: MJ-YYYYMMDD-XXXX (XXXX = per-user daily running number).
export function formatJobNumber(dateISO, seq) {
  const compact = String(dateISO).replace(/-/g, ''); // YYYYMMDD
  return `MJ-${compact}-${String(seq).padStart(4, '0')}`;
}

// Pure aggregation for the "today" summary — extracted so it is unit-testable.
export function summarizeJobs(rows, dateStr) {
  let total = 0;
  let paid = 0;
  let pending = 0;
  for (const j of rows) {
    const t = Number(j.total) || 0;
    total += t;
    const p = j.paid_amount != null ? Number(j.paid_amount) || 0 : j.payment_status === 'paid' ? t : 0;
    const b = j.balance_due != null ? Number(j.balance_due) || 0 : Math.max(t - p, 0);
    paid += p;
    pending += b;
  }
  return {
    date: dateStr,
    jobCount: rows.length,
    total: round2(total),
    paid: round2(paid),
    pending: round2(pending),
  };
}

// A PostgREST error that means the RPC isn't installed (migration 002 not run).
function isMissingFunction(error) {
  if (!error) return false;
  const code = error.code || '';
  return (
    code === 'PGRST202' ||
    code === '42883' ||
    /find the function|does not exist|schema cache/i.test(error.message || '')
  );
}

async function dailyCount(userId, jobDate, client) {
  const { count } = await client
    .from('jobs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('job_date', jobDate);
  return count || 0;
}

// Create a job plus its items. All rows are scoped to userId (profile.id).
// Prefers the atomic RPC (create_job_with_items); falls back to a JS insert
// with compensating rollback if the RPC is not installed.
export async function createJob(userId, payload, client = supabase) {
  const {
    jobName,
    items = [],
    subtotal = 0,
    discount = 0,
    total = 0,
    customerName = null,
    note = null,
    paidAmount = 0,
  } = payload;

  const jobDate = payload.jobDate || todayISO();
  const name = jobName || `งานวันที่ ${jobDate}`;
  const pay = derivePaymentFields(total, paidAmount);
  const cat = {
    category: payload.category ?? categoryFields(items).category,
    category_type: payload.categoryType ?? categoryFields(items).category_type,
  };

  // The pickup date is stamped on AFTER the row exists rather than inserted
  // with it. The RPC does not know the column, and neither does a database
  // where migration 007 has not been run yet — and a job must not be lost
  // over a date the shop can always fill in later.
  const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(String(payload.dueDate || '')) ? payload.dueDate : null;

  const itemRows = items.map((it) => ({
    item_name: it.item_name,
    size: it.size ?? null,
    quantity: it.quantity ?? 1,
    unit: it.unit ?? null,
    unit_price: round2(it.unit_price ?? 0),
    total: round2(it.total ?? 0),
  }));

  // 1) Preferred: atomic RPC.
  const rpc = await client.rpc('create_job_with_items', {
    p_user_id: userId,
    p_job_name: name,
    p_customer_name: customerName,
    p_job_date: jobDate,
    p_subtotal: round2(subtotal),
    p_discount: round2(discount),
    p_total: round2(total),
    p_payment_status: pay.payment_status,
    p_paid_amount: pay.paid_amount,
    p_note: note,
    p_items: itemRows,
  });

  if (!rpc.error && rpc.data) {
    let job = Array.isArray(rpc.data) ? rpc.data[0] : rpc.data;
    // The RPC predates categories; stamp them on afterwards. Derived metadata,
    // so a failure here must never lose the job that was just created.
    const stamp = { ...(job && !job.category ? cat : {}), ...(dueDate ? { due_date: dueDate } : {}) };
    if (job && Object.keys(stamp).length) {
      const { data: restamped, error: stampErr } = await client
        .from('jobs')
        .update(stamp)
        .eq('id', job.id)
        .eq('user_id', userId)
        .select('*')
        .maybeSingle();
      if (stampErr) logger.warn('job.stamp_failed', { message: stampErr.message });
      else if (restamped) job = restamped;
      else job = { ...job, ...stamp };
    }
    const [withItems] = await attachItems([job], client);
    logger.info('job.created', { via: 'rpc', jobNumber: job.job_number });
    return withItems || { ...job, items: itemRows };
  }
  if (rpc.error && !isMissingFunction(rpc.error)) {
    logger.error('job.rpc_failed', { code: rpc.error.code, message: rpc.error.message });
    throw rpc.error;
  }

  // 2) Fallback: JS insert with job_number retry + compensating rollback.
  let seq = await dailyCount(userId, jobDate, client);
  let job = null;
  let attempt = 0;
  while (!job) {
    attempt += 1;
    seq += 1;
    const jobNumber = formatJobNumber(jobDate, seq);
    const { data, error } = await client
      .from('jobs')
      .insert({
        user_id: userId,
        job_number: jobNumber,
        job_name: name,
        customer_name: customerName,
        job_date: jobDate,
        subtotal: round2(subtotal),
        discount: round2(discount),
        total: round2(total),
        payment_status: pay.payment_status,
        status: 'active',
        paid_amount: pay.paid_amount,
        balance_due: pay.balance_due,
        note,
        ...cat,
      })
      .select('*')
      .single();

    if (!error) {
      job = data;
      break;
    }
    if (error.code === '23505' && attempt < 25) continue; // job_number race — retry
    logger.error('job.insert_failed', { code: error.code, message: error.message });
    throw error;
  }

  if (dueDate) {
    const { data: dated, error: dueErr } = await client
      .from('jobs')
      .update({ due_date: dueDate })
      .eq('id', job.id)
      .eq('user_id', userId)
      .select('*')
      .maybeSingle();
    if (dueErr) logger.warn('job.due_stamp_failed', { message: dueErr.message });
    else if (dated) job = dated;
  }

  let insertedItems = [];
  if (itemRows.length) {
    const rows = itemRows.map((it) => ({ ...it, job_id: job.id }));
    const { data: itemData, error: itemErr } = await client
      .from('job_items')
      .insert(rows)
      .select('*');
    if (itemErr) {
      logger.error('job.items_failed_rollback', { code: itemErr.code, message: itemErr.message });
      await client.from('jobs').delete().eq('id', job.id).eq('user_id', userId);
      throw itemErr;
    }
    insertedItems = itemData;
  }

  logger.info('job.created', { via: 'fallback', jobNumber: job.job_number });
  return { ...job, items: insertedItems };
}

// Recent non-cancelled jobs (default 5), newest first, with items.
export async function getRecentJobs(userId, limit = 5, client = supabase) {
  const { data: jobs, error } = await client
    .from('jobs')
    .select('*')
    .eq('user_id', userId)
    .in('status', ACTIVE_STATUSES)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    logger.error('job.getRecent_failed', { message: error.message });
    throw error;
  }
  return attachItems(jobs || [], client);
}

// Every job in one category, newest first — "who has ordered what" for a kind
// of work, which is the question the menu's หมวดงาน button asks.
export async function getJobsByCategory(userId, category, limit = 60, client = supabase) {
  const { data: jobs, error } = await client
    .from('jobs')
    .select('*')
    .eq('user_id', userId)
    .eq('category', category)
    .in('status', ACTIVE_STATUSES)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    logger.error('job.byCategory_failed', { message: error.message });
    throw error;
  }
  return attachItems(jobs || [], client);
}

// The single most recent non-cancelled job (with items), or null.
export async function getLatestJob(userId, client = supabase) {
  const { data: jobs, error } = await client
    .from('jobs')
    .select('*')
    .eq('user_id', userId)
    .in('status', ACTIVE_STATUSES)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    logger.error('job.getLatest_failed', { message: error.message });
    throw error;
  }
  if (!jobs || !jobs.length) return null;
  const [withItems] = await attachItems(jobs, client);
  return withItems;
}

// Fetch one job by id, verifying ownership via userId.
export async function getJobById(userId, jobId, client = supabase) {
  const { data: job, error } = await client
    .from('jobs')
    .select('*')
    .eq('id', jobId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    logger.error('job.getById_failed', { message: error.message });
    throw error;
  }
  if (!job) return null;
  const [withItems] = await attachItems([job], client);
  return withItems;
}

// Patch a job, always constrained by userId so users can't edit others' jobs.
export async function updateJob(userId, jobId, patch, client = supabase) {
  const allowed = {};
  const fields = [
    'job_name',
    'customer_name',
    'subtotal',
    'discount',
    'total',
    'payment_status',
    'status',
    'paid_amount',
    'balance_due',
    'job_date',
    'category',
    'category_type',
    'note',
  ];
  for (const f of fields) {
    if (patch[f] !== undefined) allowed[f] = patch[f];
  }
  allowed.updated_at = new Date().toISOString();

  const { data, error } = await client
    .from('jobs')
    .update(allowed)
    .eq('id', jobId)
    .eq('user_id', userId)
    .select('*')
    .maybeSingle();

  if (error) {
    logger.error('job.update_failed', { message: error.message });
    throw error;
  }
  return data;
}

// Soft-delete: mark cancelled. Never physically DELETE.
export async function cancelJob(userId, jobId, client = supabase) {
  return updateJob(userId, jobId, { status: 'cancelled' }, client);
}

export async function updateLatestJob(userId, patch, client = supabase) {
  const latest = await getLatestJob(userId, client);
  if (!latest) return null;
  return updateJob(userId, latest.id, patch, client);
}

export async function cancelLatestJob(userId, client = supabase) {
  const latest = await getLatestJob(userId, client);
  if (!latest) return null;
  return cancelJob(userId, latest.id, client);
}

// Record a payment (increment paid_amount) and recalculate status/balance.
export async function recordPayment(userId, jobId, amount, client = supabase) {
  const job = await getJobById(userId, jobId, client);
  if (!job) return null;
  const newPaid = round2((Number(job.paid_amount) || 0) + (Number(amount) || 0));
  const fields = derivePaymentFields(job.total, newPaid);
  const updated = await updateJob(userId, jobId, fields, client);
  if (!updated) return null;
  return { ...updated, items: job.items || [] };
}

// Aggregate today's numbers for a user (Bangkok day).
export async function getTodaySummary(userId, client = supabase) {
  const date = todayISO();
  const { data: jobs, error } = await client
    .from('jobs')
    .select('total, payment_status, paid_amount, balance_due, status')
    .eq('user_id', userId)
    .in('status', ACTIVE_STATUSES)
    .eq('job_date', date);

  if (error) {
    logger.error('job.summary_failed', { message: error.message });
    throw error;
  }
  return summarizeJobs(jobs || [], date);
}

// Jobs with an outstanding balance (pending or partial), newest first.
export async function getPendingJobs(userId, client = supabase) {
  const { data: jobs, error } = await client
    .from('jobs')
    .select('*')
    .eq('user_id', userId)
    .in('payment_status', ['pending', 'partial'])
    .in('status', ACTIVE_STATUSES)
    .order('job_date', { ascending: false });

  if (error) {
    logger.error('job.pending_failed', { message: error.message });
    throw error;
  }
  return attachItems(jobs || [], client);
}

export const getPendingPayments = getPendingJobs;

// Search a user's own jobs by job_number / job_name / customer_name.
// The DB query is scoped to the user (and non-cancelled by default); the free
// text is matched in-app so user input never becomes part of a filter string.
export async function searchJobs(userId, query, opts = {}, client = supabase) {
  const { limit = 10, includeCancelled = false } = opts;
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];

  let builder = client.from('jobs').select('*').eq('user_id', userId);
  if (!includeCancelled) builder = builder.in('status', ACTIVE_STATUSES);
  builder = builder.order('created_at', { ascending: false }).limit(500);

  const { data, error } = await builder;
  if (error) {
    logger.error('job.search_failed', { message: error.message });
    throw error;
  }

  const matched = (data || [])
    .filter((j) => {
      const hay = `${j.job_number || ''} ${j.job_name || ''} ${j.customer_name || ''}`.toLowerCase();
      return hay.includes(q);
    })
    .slice(0, limit);

  return attachItems(matched, client);
}

// Fetch all of a user's jobs (any status) recorded within a reporting period.
export async function getJobsInPeriod(userId, period = 'daily', client = supabase) {
  const range = rangeForPeriod(period);
  const { data, error } = await client
    .from('jobs')
    .select('*')
    .eq('user_id', userId)
    .gte('created_at', range.start)
    .lte('created_at', range.end)
    .order('created_at', { ascending: false });

  if (error) {
    logger.error('job.period_failed', { message: error.message, period });
    throw error;
  }
  return { rows: data || [], range };
}

// Pure report aggregation over a set of job rows. Cancelled jobs are counted
// separately and excluded from sales/averages.
export function buildReport(rows, meta = {}) {
  const active = rows.filter((j) => j.status !== 'cancelled');
  const cancelledCount = rows.length - active.length;

  let totalSales = 0;
  let paid = 0;
  let pending = 0;
  for (const j of active) {
    const t = Number(j.total) || 0;
    totalSales += t;
    const p = j.paid_amount != null ? Number(j.paid_amount) || 0 : j.payment_status === 'paid' ? t : 0;
    const b = j.balance_due != null ? Number(j.balance_due) || 0 : Math.max(t - p, 0);
    paid += p;
    pending += b;
  }

  const jobCount = active.length;
  const byCreated = [...active].sort((a, b) =>
    String(b.created_at).localeCompare(String(a.created_at))
  );
  const byValue = [...active].sort((a, b) => (Number(b.total) || 0) - (Number(a.total) || 0));

  return {
    label: meta.label || '',
    period: meta.period || null,
    periodKey: meta.periodKey || null,
    jobCount,
    cancelledCount,
    totalSales: round2(totalSales),
    paid: round2(paid),
    pending: round2(pending),
    avgPerBill: jobCount ? round2(totalSales / jobCount) : 0,
    recent: byCreated.slice(0, 5),
    top: byValue.slice(0, 5),
  };
}

// Fetch + aggregate a report for a user and period.
export async function getReport(userId, period = 'daily', client = supabase) {
  const { rows, range } = await getJobsInPeriod(userId, period, client);
  return buildReport(rows, range);
}

// Helper: load items for a list of jobs in one query, then group.
// Exported because a bill needs them too: a job holding three lines shows on
// the receipt as one amount unless the receipt can see what it is made of.
export async function attachItems(jobs, client = supabase) {
  if (!jobs.length) return [];
  const ids = jobs.map((j) => j.id);
  const { data: items, error } = await client
    .from('job_items')
    .select('*')
    .in('job_id', ids)
    .order('created_at', { ascending: true });

  if (error) {
    logger.error('job.attachItems_failed', { message: error.message });
    return jobs.map((j) => ({ ...j, items: [] }));
  }

  const byJob = new Map();
  for (const it of items || []) {
    if (!byJob.has(it.job_id)) byJob.set(it.job_id, []);
    byJob.get(it.job_id).push(it);
  }
  return jobs.map((j) => ({ ...j, items: byJob.get(j.id) || [] }));
}
