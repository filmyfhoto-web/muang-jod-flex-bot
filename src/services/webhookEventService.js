import { supabase } from '../config/supabase.js';
import { logger } from './logger.js';

// Record a webhook event by its LINE event id (webhook_events.line_event_id is
// UNIQUE). Returns { isNew: true } if this is the first time we see the event,
// or { isNew: false } if it was already processed (duplicate delivery).
//
// The `client` param is injectable so this can be unit-tested without a real DB.
export async function markEventProcessed(lineEventId, eventType, client = supabase) {
  if (!lineEventId) {
    // No id to dedupe on — process it, but say so.
    return { isNew: true, reason: 'no_event_id' };
  }

  const { error } = await client
    .from('webhook_events')
    .insert({ line_event_id: lineEventId, event_type: eventType || null });

  if (!error) return { isNew: true };

  // 23505 = unique_violation -> we've already processed this event id.
  if (error.code === '23505') {
    logger.info('webhook.duplicate_ignored', { eventType });
    return { isNew: false };
  }

  // Any other error: don't block processing on a logging-table failure, but
  // surface it. Treat as new so the event still runs.
  logger.error('webhook.dedupe_insert_failed', { code: error.code, message: error.message });
  return { isNew: true, reason: 'insert_error' };
}
