import { supabase } from '../config/supabase.js';
import { costUsd } from '../utils/aiCost.js';
import { todayISO, addDays } from '../utils/dates.js';
import { logger } from './logger.js';

/* เก็บและสรุปค่า AI — ไม่เคยทำให้งานหลักล้ม
 *
 * ตารางยังไม่ถูกสร้าง (ไมเกรชัน 017) หรือเขียนไม่สำเร็จ = แค่ไม่เก็บยอด
 * การอ่านรูปต้องเดินต่อได้เสมอ
 */

export async function recordAiUsage(userId, { kind = 'vision', model, usage } = {}, client = supabase) {
  if (!userId || !model || !usage) return false;
  const input = Number(usage.input_tokens) || 0;
  const output = Number(usage.output_tokens) || 0;
  try {
    const { error } = await client.from('ai_usage').insert({
      user_id: userId,
      kind,
      model,
      input_tokens: input,
      output_tokens: output,
      cost_usd: costUsd(model, input, output),
    });
    if (error) {
      logger.warn('ai_usage.record_failed', { message: error.message });
      return false;
    }
    return true;
  } catch (err) {
    logger.warn('ai_usage.record_failed', { message: err?.message });
    return false;
  }
}

// รวมแถวเป็นยอดวันนี้ / เดือนนี้ / 7 วันล่าสุด (นับวันตามเวลาไทย)
export function summarizeUsage(rows = [], now = new Date()) {
  const today = todayISO(now);
  const month = today.slice(0, 7);
  const out = { today: { count: 0, usd: 0 }, month: { count: 0, usd: 0 }, days: [] };
  const byDay = new Map();

  for (const row of rows) {
    const day = todayISO(new Date(row.created_at));
    const usd = Number(row.cost_usd) || 0;
    if (day.slice(0, 7) === month) {
      out.month.count += 1;
      out.month.usd += usd;
    }
    if (day === today) {
      out.today.count += 1;
      out.today.usd += usd;
    }
    const d = byDay.get(day) || { day, count: 0, usd: 0 };
    d.count += 1;
    d.usd += usd;
    byDay.set(day, d);
  }

  const since = addDays(today, -6);
  out.days = [...byDay.values()].filter((d) => d.day >= since).sort((a, b) => b.day.localeCompare(a.day));
  return out;
}

// null = อ่านไม่ได้ (ยังไม่ได้รันไมเกรชัน)
export async function getAiUsageSummary(userId, now = new Date(), client = supabase) {
  const monthStart = `${todayISO(now).slice(0, 7)}-01T00:00:00+07:00`;
  const weekStart = `${addDays(todayISO(now), -6)}T00:00:00+07:00`;
  const from = weekStart < monthStart ? weekStart : monthStart;
  try {
    const { data, error } = await client
      .from('ai_usage')
      .select('created_at, cost_usd')
      .eq('user_id', userId)
      .gte('created_at', from)
      .limit(5000);
    if (error) {
      logger.warn('ai_usage.summary_failed', { message: error.message });
      return null;
    }
    return summarizeUsage(data || [], now);
  } catch (err) {
    logger.warn('ai_usage.summary_failed', { message: err?.message });
    return null;
  }
}
