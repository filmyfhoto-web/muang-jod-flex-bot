import { supabase } from '../config/supabase.js';
import { todayISO, addDays } from '../utils/dates.js';
import { round2 } from '../utils/currency.js';
import { jobCategory } from '../utils/category.js';
import { summarizeJobs, getRecentJobs, getPendingJobs } from './jobService.js';
import { logger } from './logger.js';

const ACTIVE_STATUSES = ['active', 'completed'];

// Split a day's jobs by category group: count, total, and share of the day.
export function breakdownByCategory(rows = []) {
  const dayTotal = rows.reduce((sum, j) => sum + (Number(j.total) || 0), 0);
  const byGroup = new Map();

  for (const job of rows) {
    const { group } = jobCategory(job);
    const entry = byGroup.get(group.id) || {
      id: group.id,
      label: group.label,
      icon: group.icon,
      color: group.color,
      count: 0,
      total: 0,
    };
    entry.count += 1;
    entry.total = round2(entry.total + (Number(job.total) || 0));
    byGroup.set(group.id, entry);
  }

  return [...byGroup.values()]
    .map((e) => ({ ...e, percent: dayTotal ? Math.round((e.total / dayTotal) * 100) : 0 }))
    .sort((a, b) => b.total - a.total || b.count - a.count);
}

// Percentage change against yesterday. null when yesterday had nothing to
// compare against — "+∞%" helps nobody.
export function trendVs(todayTotal, yesterdayTotal) {
  const prev = Number(yesterdayTotal) || 0;
  const now = Number(todayTotal) || 0;
  if (prev <= 0) return { percent: null, direction: now > 0 ? 'up' : 'flat', yesterday: prev };
  const percent = Math.round(((now - prev) / prev) * 100);
  return { percent, direction: percent > 0 ? 'up' : percent < 0 ? 'down' : 'flat', yesterday: round2(prev) };
}

async function jobsOn(userId, date, client) {
  const { data, error } = await client
    .from('jobs')
    .select('*')
    .eq('user_id', userId)
    .in('status', ACTIVE_STATUSES)
    .eq('job_date', date);
  if (error) {
    logger.error('dashboard.day_failed', { date, message: error.message });
    throw error;
  }
  return data || [];
}

// Everything the "สรุปวันนี้" card and the LIFF dashboard show, in one call:
// today's money, how the day splits by payment status and by category, the
// trend against yesterday, the latest jobs, and (optionally) the outstanding
// ones. All scoped to userId.
export async function getDashboard(userId, opts = {}, client = supabase) {
  const { recentLimit = 3, includePending = false } = opts;
  const date = todayISO();

  const rows = await jobsOn(userId, date, client);
  const yesterday = await jobsOn(userId, addDays(date, -1), client);

  const counts = { paid: 0, partial: 0, pending: 0 };
  for (const j of rows) {
    const s = j.payment_status in counts ? j.payment_status : 'pending';
    counts[s] += 1;
  }

  const summary = summarizeJobs(rows, date);
  const recent = await getRecentJobs(userId, recentLimit, client);
  const pending = includePending ? await getPendingJobs(userId, client) : undefined;

  return {
    date,
    summary,
    counts,
    categories: breakdownByCategory(rows),
    trend: trendVs(summary.total, summarizeJobs(yesterday, addDays(date, -1)).total),
    recent,
    ...(pending ? { pending } : {}),
  };
}
