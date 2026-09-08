import { supabase } from '../config/supabase.js';
import { logger } from './logger.js';

// Reminders are per-user rows with an absolute due time. Creating and listing
// them is always scoped to the owner; only the dispatcher reads across users,
// and it reads nothing but what is due.

export async function createReminder(userId, { jobId = null, message, remindAt }, client = supabase) {
  const text = String(message || '').trim().slice(0, 500);
  const at = remindAt instanceof Date ? remindAt : new Date(remindAt);
  if (!text || Number.isNaN(at.getTime())) return null;

  const { data, error } = await client
    .from('reminders')
    .insert({
      user_id: userId,
      job_id: jobId,
      message: text,
      remind_at: at.toISOString(),
      status: 'pending',
    })
    .select('*')
    .single();

  if (error) {
    logger.error('reminder.create_failed', { message: error.message });
    throw error;
  }
  logger.info('reminder.created', { remindAt: data.remind_at });
  return data;
}

// A user's own upcoming reminders, soonest first.
export async function getUpcomingReminders(userId, client = supabase) {
  const { data, error } = await client
    .from('reminders')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .order('remind_at', { ascending: true });

  if (error) {
    logger.error('reminder.list_failed', { message: error.message });
    throw error;
  }
  return data || [];
}

export async function cancelReminder(userId, reminderId, client = supabase) {
  const { data, error } = await client
    .from('reminders')
    .update({ status: 'cancelled' })
    .eq('id', reminderId)
    .eq('user_id', userId)
    .eq('status', 'pending')
    .select('*')
    .maybeSingle();

  if (error) {
    logger.error('reminder.cancel_failed', { message: error.message });
    throw error;
  }
  return data;
}

// Reminders that are due. Cross-user by nature — this is the dispatcher's
// query — so it selects only what a push needs and caps the batch.
export async function getDueReminders({ now = new Date(), limit = 50 } = {}, client = supabase) {
  const { data, error } = await client
    .from('reminders')
    .select('id, user_id, job_id, message, remind_at')
    .eq('status', 'pending')
    .lte('remind_at', now.toISOString())
    .order('remind_at', { ascending: true })
    .limit(limit);

  if (error) {
    logger.error('reminder.due_failed', { message: error.message });
    return [];
  }
  return data || [];
}

// Claim a reminder before pushing: the update is filtered on status='pending',
// so if two dispatchers race, only one gets a row back and only one push goes
// out. Returns the claimed row, or null if someone else took it.
export async function claimReminder(reminderId, client = supabase) {
  const { data, error } = await client
    .from('reminders')
    .update({ status: 'sent', sent_at: new Date().toISOString() })
    .eq('id', reminderId)
    .eq('status', 'pending')
    .select('*')
    .maybeSingle();

  if (error) {
    logger.error('reminder.claim_failed', { message: error.message });
    return null;
  }
  return data;
}

// Hand a claimed reminder back when the push failed, so it is retried.
export async function releaseReminder(reminderId, client = supabase) {
  const { error } = await client
    .from('reminders')
    .update({ status: 'pending', sent_at: null })
    .eq('id', reminderId)
    .eq('status', 'sent');
  if (error) logger.error('reminder.release_failed', { message: error.message });
}
