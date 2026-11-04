// The bridge's side of the shop's database, through the same Supabase client the rest of the bot uses (service role).
// Everything goes through the functions of db/migrations/003_sale_line_bridge.sql: one call = one transaction, so a customer's
// message is never half written and a delivery result is never applied twice. A slow database never holds the bot up:
// 8 s for a query, 40 s for a picture.
import { createClient } from '@supabase/supabase-js';

export function createSaleChatStore({ url, key, fetch: doFetch = fetch, bucket = 'sale-order-files' }) {
  const limited = (u, init = {}) =>
    doFetch(u, { ...init, signal: init.signal ?? AbortSignal.timeout(String(u).includes('/storage/') ? 40_000 : 8_000) });
  const db = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: limited },
  });
  const must = (res, what) => {
    if (res.error) throw Object.assign(new Error(`${what}: ${res.error.message ?? res.error.code ?? 'failed'}`), { code: res.error.code });
    return res.data;
  };

  return {
    // → { duplicate, thread_id, msg_id, created_thread }
    async ingest(payload) {
      return must(await db.rpc('sale_line_ingest', { p: payload }), 'ingest');
    },
    async putMedia(path, bytes, contentType) {
      must(await db.storage.from(bucket).upload(path, bytes, { contentType, upsert: false }), 'save picture');
    },
    // → [{ id, thread_id, channel_key, line_user_id, body, retry_key, attempts, expires_at }]
    async claim(limit = 5, staleSecs = 90) {
      return must(await db.rpc('sale_line_claim', { p_limit: limit, p_stale_secs: staleSecs }), 'claim') ?? [];
    },
    // result: 'sent' | 'failed' | 'retry'
    async finish(id, result, error = null, requestId = null) {
      return must(await db.rpc('sale_line_finish', { p_id: id, p_result: result, p_error: error, p_request_id: requestId }), 'finish');
    },
    async beat(channel, mode, build, detail = {}) {
      must(await db.rpc('sale_line_beat', { p_channel: channel, p_mode: mode, p_build: build ?? '', p_detail: detail }), 'beat');
    },
  };
}
