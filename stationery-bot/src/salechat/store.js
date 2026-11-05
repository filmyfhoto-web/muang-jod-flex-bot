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
    // the order a queued reply belongs to (sale_line_out.order_id, set when the page sends an order summary) → id or null
    async outboxOrderId(outId) {
      const r = await db.from('sale_line_out').select('order_id').eq('id', outId).maybeSingle();
      if (r.error) throw new Error(`order of the reply: ${r.error.message}`);
      return r.data?.order_id ?? null;
    },
    // → { order, items } for a card, or null when the order is gone
    async orderCard(orderId) {
      const o = await db
        .from('sale_orders')
        .select('id, order_no, order_type, order_date, customer_name, phone, subtotal, vat_rate, vat_amount, total, note, fulfil, need_date, created_at')
        .eq('id', orderId)
        .maybeSingle();
      if (o.error) throw new Error(`order card: ${o.error.message}`);
      if (!o.data) return null;
      const it = await db.from('sale_order_items').select('seq, name, qty, unit, unit_price, line_total').eq('order_id', orderId).order('seq');
      if (it.error) throw new Error(`order items: ${it.error.message}`);
      return { order: o.data, items: it.data ?? [] };
    },
    // orders saved since `sinceIso` that the team has not been sent a card for yet → [{ id }]
    async teamPending(sinceIso, limit = 5) {
      const r = await db.from('sale_orders').select('id').is('team_card_at', null).gte('created_at', sinceIso).order('created_at').limit(limit);
      if (r.error) throw new Error(`team cards: ${r.error.message}`);
      return r.data ?? [];
    },
    // the bot's own answer to a customer, kept in that customer's chat as the bot's (not as a message staff sent); nothing if no chat exists
    async botOut(channelKey, lineUserId, body, atIso) {
      const link = await db.from('sale_line_links').select('thread_id').eq('channel_key', channelKey).eq('line_user_id', lineUserId).maybeSingle();
      if (link.error) throw new Error(`bot answer: ${link.error.message}`);
      if (!link.data) return { skipped: 'no-chat' };
      const threadId = link.data.thread_id;
      const text = String(body).slice(0, 4000);
      const ins = await db
        .from('sale_msgs')
        .insert({ thread_id: threadId, dir: 'out', kind: 'text', body: text, by_name: 'บอท', meta: { src: 'bot', delivery: 'sent', delivery_at: atIso } });
      if (ins.error) throw new Error(`bot answer: ${ins.error.message}`);
      const upd = await db.from('sale_threads').update({ last_text: text.slice(0, 120), last_at: atIso, updated_at: atIso }).eq('id', threadId);
      if (upd.error) throw new Error(`bot answer thread: ${upd.error.message}`);
      return { thread_id: threadId };
    },
    // marks the team card as sent (only the first time: a second call changes nothing)
    async markTeamSent(orderId, atIso) {
      const r = await db.from('sale_orders').update({ team_card_at: atIso }).eq('id', orderId).is('team_card_at', null);
      if (r.error) throw new Error(`team card mark: ${r.error.message}`);
    },
  };
}
