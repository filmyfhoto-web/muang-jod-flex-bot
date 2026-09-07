import { supabase } from '../config/supabase.js';
import { todayISO } from '../utils/dates.js';
import { summarizeJobs, getRecentJobs, getPendingJobs } from './jobService.js';
import { logger } from './logger.js';

const ACTIVE_STATUSES = ['active', 'completed'];

// Everything the "สรุปวันนี้" card and the LIFF dashboard show, in one call:
// today's money summary, how today's jobs split by payment status, the most
// recent jobs, and (optionally) the outstanding ones. All scoped to userId.
export async function getDashboard(userId, opts = {}, client = supabase) {
  const { recentLimit = 3, includePending = false } = opts;
  const date = todayISO();

  const { data: today, error } = await client
    .from('jobs')
    .select('*')
    .eq('user_id', userId)
    .in('status', ACTIVE_STATUSES)
    .eq('job_date', date);

  if (error) {
    logger.error('dashboard.today_failed', { message: error.message });
    throw error;
  }

  const rows = today || [];
  const counts = { paid: 0, partial: 0, pending: 0 };
  for (const j of rows) {
    const s = j.payment_status in counts ? j.payment_status : 'pending';
    counts[s] += 1;
  }

  const recent = await getRecentJobs(userId, recentLimit, client);
  const pending = includePending ? await getPendingJobs(userId, client) : undefined;

  return {
    date,
    summary: summarizeJobs(rows, date),
    counts,
    recent,
    ...(pending ? { pending } : {}),
  };
}
