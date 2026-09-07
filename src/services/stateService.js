import { supabase } from '../config/supabase.js';
import { logger } from './logger.js';

export const STATES = {
  IDLE: 'idle',
  WAITING_FOR_JOB: 'waiting_for_job',
  CONFIRMING_JOB: 'confirming_job', // parsed a draft, waiting for confirm/edit/cancel
  WAITING_FOR_EVIDENCE: 'waiting_for_evidence',
  WAITING_FOR_EDIT: 'waiting_for_edit',
  WAITING_FOR_PAYMENT: 'waiting_for_payment_amount',
  WAITING_FOR_SEARCH: 'waiting_for_search',
};

// Get the current state row for a user (by profile id). Returns null if none.
//
// Reads the newest row rather than requiring exactly one: a database whose
// user_states.user_id lost its UNIQUE constraint can hold duplicates, and a
// stale conversation state must never break the conversation itself.
export async function getState(userId, client = supabase) {
  const { data, error } = await client
    .from('user_states')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1);

  if (error) {
    logger.error('state.get_failed', { code: error.code, message: error.message });
    return null;
  }
  return data?.[0] || null;
}

// Upsert the state for a user.
//
// Prefers a real upsert (one round-trip, safe under concurrency). Falls back to
// update-then-insert when the database rejects ON CONFLICT — e.g. 42P10, "no
// unique or exclusion constraint matching the ON CONFLICT specification", which
// a hand-edited schema missing `user_id unique` produces.
export async function setState(userId, state, context = {}, client = supabase) {
  const row = { user_id: userId, state, context, updated_at: new Date().toISOString() };

  const { data, error } = await client
    .from('user_states')
    .upsert(row, { onConflict: 'user_id' })
    .select('*')
    .maybeSingle();

  if (!error) return data;

  logger.warn('state.upsert_failed', { code: error.code, message: error.message });

  const updated = await client.from('user_states').update(row).eq('user_id', userId).select('*');
  if (updated.error) {
    logger.error('state.update_failed', { code: updated.error.code, message: updated.error.message });
    throw updated.error;
  }
  if (updated.data?.length) return updated.data[0];

  const inserted = await client.from('user_states').insert(row).select('*').maybeSingle();
  if (inserted.error) {
    logger.error('state.insert_failed', { code: inserted.error.code, message: inserted.error.message });
    throw inserted.error;
  }
  return inserted.data;
}

// Reset a user back to idle with empty context.
export async function clearState(userId, client = supabase) {
  return setState(userId, STATES.IDLE, {}, client);
}
