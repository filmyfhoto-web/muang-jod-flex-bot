import { supabase, STORAGE_BUCKET } from '../config/supabase.js';
import { getJobsInPeriod } from './jobService.js';
import { logger } from './logger.js';

const CSV_COLUMNS = [
  'job_number',
  'job_date',
  'job_name',
  'customer_name',
  'status',
  'payment_status',
  'subtotal',
  'discount',
  'total',
  'paid_amount',
  'balance_due',
  'created_at',
];

// RFC-4180-ish field escaping.
function csvField(value) {
  if (value == null) return '';
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

// Build a CSV string from job rows. Prefixed with a UTF-8 BOM so Excel renders
// Thai text correctly. Pure — unit-testable.
export function buildReportCSV(rows) {
  const lines = [CSV_COLUMNS.join(',')];
  for (const row of rows) {
    lines.push(CSV_COLUMNS.map((c) => csvField(row[c])).join(','));
  }
  return '﻿' + lines.join('\r\n') + '\r\n';
}

// Generate a per-user CSV for a period (default: this month). ALWAYS scoped to
// userId via getJobsInPeriod → the user-permission check happens every time.
export async function generateReportCSV(userId, period = 'monthly', client = supabase) {
  const { rows, range } = await getJobsInPeriod(userId, period, client);
  const csv = buildReportCSV(rows);
  const filename = `muang-jod-report-${range.periodKey}.csv`;
  return { filename, csv, rowCount: rows.length, range };
}

// Generate + upload the CSV to the user's private storage folder and return a
// signed URL. Files live under `${userId}/reports/...` so they are isolated.
export async function generateAndStoreReportCSV(userId, period = 'monthly', client = supabase) {
  const { filename, csv, rowCount } = await generateReportCSV(userId, period, client);
  const path = `${userId}/reports/${filename}`;

  const { error: uploadErr } = await client.storage
    .from(STORAGE_BUCKET)
    .upload(path, Buffer.from(csv, 'utf8'), { contentType: 'text/csv; charset=utf-8', upsert: true });
  if (uploadErr) {
    logger.error('report.csv_upload_failed', { message: uploadErr.message });
    throw uploadErr;
  }

  const { data: signed, error: signErr } = await client.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(path, 60 * 60 * 24 * 7); // 7 days
  if (signErr) {
    logger.error('report.csv_sign_failed', { message: signErr.message });
    throw signErr;
  }

  logger.info('report.csv_ready', { filename, rowCount });
  return { filename, signedUrl: signed?.signedUrl || null, rowCount };
}
