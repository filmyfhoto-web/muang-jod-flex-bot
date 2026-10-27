// The chat-order tables in the shop's database, through the same Supabase client the rest of the bot uses (service role).
// Writes here are the bot's own: new drafts, merges with a version check, the customer's messages and photos, the events.
// Confirming, selling and cancelling are the back office's, done by the database functions in db/migrations/001_chat_drafts.sql.
import { createClient } from '@supabase/supabase-js';

export function createOrdersStore({ url, key, fetch: doFetch = fetch }) {
  // a customer's message is never held up by a slow database: 8 s for queries, 40 s for photos
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
    async getChannel(channelKey) {
      return must(
        await db.from('line_channels').select('key,name,shop_label,bot_user_id,channel_secret,channel_token').eq('key', channelKey).eq('enabled', true).maybeSingle(),
        'channel',
      );
    },
    async messageSeen(channelKey, lineMessageId) {
      const rows = must(await db.from('chat_messages').select('id').eq('channel_key', channelKey).eq('line_message_id', lineMessageId).limit(1), 'message seen');
      return Boolean(rows && rows.length);
    },
    async openDraft(channelKey, userId, sinceIso) {
      const rows = must(
        await db
          .from('chat_drafts')
          .select('*')
          .eq('channel_key', channelKey)
          .eq('line_user_id', userId)
          .eq('status', 'open')
          .gte('last_msg_at', sinceIso)
          .order('last_msg_at', { ascending: false })
          .limit(1),
        'open draft',
      );
      return (rows && rows[0]) || null;
    },
    // → the new draft, or null when another open draft for this customer exists (the caller merges into that one)
    async createDraft(row) {
      const res = await db.from('chat_drafts').insert(row).select('*').single();
      if (res.error && res.error.code === '23505') return null;
      return must(res, 'create draft');
    },
    // → the draft after the update, or null when its version moved on since it was read (nothing is written then)
    async casUpdateDraft(id, version, patch) {
      const rows = must(
        await db
          .from('chat_drafts')
          .update({ ...patch, version: version + 1 })
          .eq('id', id)
          .eq('version', version)
          .select('*'),
        'update draft',
      );
      return (rows && rows[0]) || null;
    },
    // → the row, or null when this LINE message was recorded before (the unique key on channel + message id)
    async insertMessage(row) {
      const rows = must(
        await db.from('chat_messages').upsert(row, { onConflict: 'channel_key,line_message_id', ignoreDuplicates: true }).select('id'),
        'save message',
      );
      return (rows && rows[0]) || null;
    },
    async addEvent(draftId, actor, action, detail = {}) {
      must(await db.from('chat_draft_events').insert({ draft_id: draftId, actor, action, detail }), 'event');
    },
    async nextDraftNo() {
      return must(await db.rpc('chat_next_draft_no'), 'draft number');
    },
    async recentTexts(draftId, n = 6) {
      const rows = must(
        await db.from('chat_messages').select('body').eq('draft_id', draftId).eq('kind', 'text').order('created_at', { ascending: false }).limit(n),
        'recent texts',
      );
      return (rows || []).map((r) => r.body || '').reverse();
    },
    async putMedia(path, bytes, contentType) {
      must(await db.storage.from('chat-media').upload(path, bytes, { contentType, upsert: false }), 'save photo');
    },
    // The customer's details from their latest order (name, phone, school) — a starting point for the staff, never a guess they keep.
    async customerHints(userId) {
      const rows = must(
        await db.from('orders').select('orderer_name,phone,school_name').eq('line_user_id', userId).order('created_at', { ascending: false }).limit(1),
        'customer hints',
      );
      const o = rows && rows[0];
      return o ? { name: o.orderer_name || null, phone: o.phone || null, school_name: o.school_name || null } : {};
    },
    // confirmed drafts of the shop's own OA that the customer has not been told about yet
    async draftsToAck(sinceIso) {
      return must(
        await db
          .from('chat_drafts')
          .select('id,draft_no,line_user_id,channel_key,confirmed_at')
          .eq('status', 'confirmed')
          .eq('channel_key', 'main')
          .is('ack_sent_at', null)
          .gte('confirmed_at', sinceIso)
          .order('confirmed_at')
          .limit(50),
        'drafts to confirm',
      ) || [];
    },
    // marks one draft as "told" before the message is sent, so two passes (or two servers) never send it twice
    async markAcked(id) {
      const rows = must(await db.from('chat_drafts').update({ ack_sent_at: new Date().toISOString() }).eq('id', id).is('ack_sent_at', null).select('id'), 'mark told');
      return Boolean(rows && rows.length);
    },
    async releaseAck(id) {
      must(await db.from('chat_drafts').update({ ack_sent_at: null }).eq('id', id), 'release told');
    },
  };
}
