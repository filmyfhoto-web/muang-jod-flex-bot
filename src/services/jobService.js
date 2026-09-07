import { supabase } from '../config/supabase.js';
import { round2 } from '../utils/currency.js';
import { todayISO, todayRange } from '../utils/dates.js';

const ACTIVE_STATUSES = ['active', 'completed'];

// Build a human-friendly job number: JYYMMDD-NNN (running per user per day).
async function generateJobNumber(userId, date) {
  const { start, end } = todayRange();
  const { count } = await supabase
    .from('jobs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', start)
    .lte('created_at', end);

  const seq = String((count || 0) + 1).padStart(3, '0');
  const compact = date.replace(/-/g, '').slice(2); // YYMMDD
  return `J${compact}-${seq}`;
}

// Create a job plus its items. All rows are scoped to userId (profile.id).
export async function createJob(userId, payload) {
  const {
    jobName,
    items = [],
    subtotal = 0,
    discount = 0,
    total = 0,
    paymentStatus = 'pending',
    customerName = null,
    note = null,
  } = payload;

  const jobDate = payload.jobDate || todayISO();
  const jobNumber = await generateJobNumber(userId, jobDate);

  const { data: job, error: jobErr } = await supabase
    .from('jobs')
    .insert({
      user_id: userId,
      job_number: jobNumber,
      job_name: jobName || `งานวันที่ ${jobDate}`,
      customer_name: customerName,
      job_date: jobDate,
      subtotal: round2(subtotal),
      discount: round2(discount),
      total: round2(total),
      payment_status: paymentStatus,
      status: 'active',
      note,
    })
    .select('*')
    .single();

  if (jobErr) {
    console.error('[jobService] createJob failed:', jobErr.message);
    throw jobErr;
  }

  let insertedItems = [];
  if (items.length) {
    const rows = items.map((it) => ({
      job_id: job.id,
      item_name: it.item_name,
      size: it.size ?? null,
      quantity: it.quantity ?? 1,
      unit: it.unit ?? null,
      unit_price: round2(it.unit_price ?? 0),
      total: round2(it.total ?? 0),
    }));
    const { data: itemData, error: itemErr } = await supabase
      .from('job_items')
      .insert(rows)
      .select('*');
    if (itemErr) {
      console.error('[jobService] insert items failed:', itemErr.message);
      throw itemErr;
    }
    insertedItems = itemData;
  }

  console.log(`[jobService] created job ${job.job_number} for user ${userId}`);
  return { ...job, items: insertedItems };
}

// Recent non-cancelled jobs (default 5), newest first, with items.
export async function getRecentJobs(userId, limit = 5) {
  const { data: jobs, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('user_id', userId)
    .in('status', ACTIVE_STATUSES)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[jobService] getRecentJobs failed:', error.message);
    throw error;
  }
  return attachItems(jobs || []);
}

// The single most recent non-cancelled job (with items), or null.
export async function getLatestJob(userId) {
  const { data: jobs, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('user_id', userId)
    .in('status', ACTIVE_STATUSES)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    console.error('[jobService] getLatestJob failed:', error.message);
    throw error;
  }
  if (!jobs || !jobs.length) return null;
  const [withItems] = await attachItems(jobs);
  return withItems;
}

// Fetch one job by id, verifying ownership via userId.
export async function getJobById(userId, jobId) {
  const { data: job, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', jobId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('[jobService] getJobById failed:', error.message);
    throw error;
  }
  if (!job) return null;
  const [withItems] = await attachItems([job]);
  return withItems;
}

// Patch a job, always constrained by userId so users can't edit others' jobs.
export async function updateJob(userId, jobId, patch) {
  const allowed = {};
  const fields = [
    'job_name',
    'customer_name',
    'subtotal',
    'discount',
    'total',
    'payment_status',
    'status',
    'note',
  ];
  for (const f of fields) {
    if (patch[f] !== undefined) allowed[f] = patch[f];
  }
  allowed.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('jobs')
    .update(allowed)
    .eq('id', jobId)
    .eq('user_id', userId)
    .select('*')
    .maybeSingle();

  if (error) {
    console.error('[jobService] updateJob failed:', error.message);
    throw error;
  }
  return data;
}

// Soft-delete: mark cancelled. Never physically DELETE.
export async function cancelJob(userId, jobId) {
  return updateJob(userId, jobId, { status: 'cancelled' });
}

// Convenience: patch the user's most recent non-cancelled job.
export async function updateLatestJob(userId, patch) {
  const latest = await getLatestJob(userId);
  if (!latest) return null;
  return updateJob(userId, latest.id, patch);
}

// Convenience: soft-delete the user's most recent non-cancelled job.
export async function cancelLatestJob(userId) {
  const latest = await getLatestJob(userId);
  if (!latest) return null;
  return cancelJob(userId, latest.id);
}

// Aggregate today's numbers for a user.
export async function getTodaySummary(userId) {
  const { start, end } = todayRange();
  const { data: jobs, error } = await supabase
    .from('jobs')
    .select('total, payment_status, status')
    .eq('user_id', userId)
    .in('status', ACTIVE_STATUSES)
    .gte('created_at', start)
    .lte('created_at', end);

  if (error) {
    console.error('[jobService] getTodaySummary failed:', error.message);
    throw error;
  }

  const rows = jobs || [];
  let total = 0;
  let paid = 0;
  let pending = 0;
  for (const j of rows) {
    const amt = Number(j.total) || 0;
    total += amt;
    if (j.payment_status === 'paid') paid += amt;
    else pending += amt; // pending & partial both count as outstanding here
  }

  return {
    date: todayISO(),
    jobCount: rows.length,
    total: round2(total),
    paid: round2(paid),
    pending: round2(pending),
  };
}

// Jobs with outstanding payment (pending), newest first, with items.
export async function getPendingJobs(userId) {
  const { data: jobs, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('user_id', userId)
    .eq('payment_status', 'pending')
    .in('status', ACTIVE_STATUSES)
    .order('job_date', { ascending: false });

  if (error) {
    console.error('[jobService] getPendingJobs failed:', error.message);
    throw error;
  }
  return attachItems(jobs || []);
}

// Spec-named alias (getPendingPayments) for getPendingJobs.
export const getPendingPayments = getPendingJobs;

// Helper: load items for a list of jobs in one query, then group.
async function attachItems(jobs) {
  if (!jobs.length) return [];
  const ids = jobs.map((j) => j.id);
  const { data: items, error } = await supabase
    .from('job_items')
    .select('*')
    .in('job_id', ids)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[jobService] attachItems failed:', error.message);
    return jobs.map((j) => ({ ...j, items: [] }));
  }

  const byJob = new Map();
  for (const it of items || []) {
    if (!byJob.has(it.job_id)) byJob.set(it.job_id, []);
    byJob.get(it.job_id).push(it);
  }
  return jobs.map((j) => ({ ...j, items: byJob.get(j.id) || [] }));
}
