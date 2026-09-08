import { getDueReminders, claimReminder, releaseReminder } from './reminderService.js';
import { supabase } from '../config/supabase.js';
import { push } from './lineService.js';
import { logger } from './logger.js';

// Sends reminders that have come due.
//
// This runs inside the web process on a timer rather than as a separate
// worker, which is the honest trade for a single small service: if the host
// sleeps the process (Render's free tier does), reminders fire when it next
// wakes, not at the minute they were set for.

const DEFAULT_INTERVAL_MS = 60_000;

// Resolve the LINE user id for a profile — push() addresses LINE ids, and
// reminders store the profile id.
async function lineIdFor(userId, client) {
  const { data, error } = await client
    .from('profiles')
    .select('line_user_id')
    .eq('id', userId)
    .maybeSingle();
  if (error) {
    logger.error('reminder.profile_failed', { message: error.message });
    return null;
  }
  return data?.line_user_id || null;
}

// One pass. Exported so it can be tested and triggered directly.
export async function dispatchDueReminders(deps = {}) {
  const client = deps.client || supabase;
  const sendPush = deps.push || push;
  const now = deps.now || new Date();

  const due = await getDueReminders({ now }, client);
  let sent = 0;

  for (const reminder of due) {
    // Claim first: whoever wins the claim is the only one that pushes.
    const claimed = await claimReminder(reminder.id, client);
    if (!claimed) continue;

    const lineUserId = await lineIdFor(reminder.user_id, client);
    if (!lineUserId) {
      logger.warn('reminder.no_line_id', { reminderId: reminder.id });
      continue; // stays 'sent' — there is nobody to deliver it to
    }

    try {
      await sendPush(lineUserId, { type: 'text', text: `⏰ เตือนความจำจากม่วงจดค่ะ\n\n${reminder.message}` });
      sent += 1;
    } catch (err) {
      // Put it back so the next pass retries rather than losing it.
      await releaseReminder(reminder.id, client);
      logger.error('reminder.push_failed', { reminderId: reminder.id, message: err?.message });
    }
  }

  if (due.length) logger.info('reminder.dispatched', { due: due.length, sent });
  return { due: due.length, sent };
}

// Start the timer. Returns a stop function; unref'd so it never holds the
// process open on its own.
export function startReminderDispatcher(opts = {}) {
  const intervalMs = Number(process.env.REMINDER_INTERVAL_MS) || opts.intervalMs || DEFAULT_INTERVAL_MS;
  let running = false;

  const tick = async () => {
    if (running) return; // never overlap a slow pass with the next one
    running = true;
    try {
      await dispatchDueReminders(opts);
    } catch (err) {
      logger.error('reminder.tick_failed', { message: err?.message });
    } finally {
      running = false;
    }
  };

  const timer = setInterval(tick, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();
  logger.info('reminder.dispatcher_started', { intervalMs });
  return () => clearInterval(timer);
}
