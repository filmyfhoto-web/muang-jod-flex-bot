import { supabase } from '../config/supabase.js';

export const STATES = {
  IDLE: 'idle',
  WAITING_FOR_JOB: 'waiting_for_job',
  CONFIRMING_JOB: 'confirming_job', // parsed a draft, waiting for confirm/edit/cancel
  WAITING_FOR_EVIDENCE: 'waiting_for_evidence',
  WAITING_FOR_EDIT: 'waiting_for_edit',
};

// Get the current state row for a user (by profile id). Returns null if none.
export async function getState(userId) {
  const { data, error } = await supabase
    .from('user_states')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('[stateService] getState failed:', error.message);
    return null;
  }
  return data;
}

// Upsert the state for a user.
export async function setState(userId, state, context = {}) {
  const { data, error } = await supabase
    .from('user_states')
    .upsert(
      {
        user_id: userId,
        state,
        context,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )
    .select('*')
    .single();

  if (error) {
    console.error('[stateService] setState failed:', error.message);
    throw error;
  }
  return data;
}

// Reset a user back to idle with empty context.
export async function clearState(userId) {
  return setState(userId, STATES.IDLE, {});
}
