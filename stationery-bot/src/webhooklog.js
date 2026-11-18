// เหตุการณ์ของ LINE ที่เขียนลงฐานข้อมูลก่อนบอทตอบ LINE ด้วย 200 (ดู migration 010)
// เหตุการณ์ที่ไม่มี webhookEventId ไม่ถูกเขียนลง และถูกจัดการเหมือนเดิมทุกอย่าง

import { createClient } from '@supabase/supabase-js';

export function webhookLogFor({ url, key, fetch: doFetch = fetch }) {
  const limited = (u, init = {}) => doFetch(u, { ...init, signal: init.signal ?? AbortSignal.timeout(8_000) });
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: limited } });
  return createWebhookLog({ db });
}

export function createWebhookLog({ db }) {
  const call = async (name, args, what) => {
    const res = await db.rpc(name, args);
    if (res.error) throw Object.assign(new Error(`${what}: ${res.error.message ?? res.error.code ?? 'failed'}`), { code: res.error.code });
    return res.data;
  };
  return {
    // → เฉพาะเหตุการณ์ที่เพิ่งเขียนครั้งแรก (ที่เคยรับแล้ว และที่ซ้ำกันในเนื้อความเดียวกัน จะไม่อยู่ในรายการนี้)
    async receive(channel, events) {
      const logged = events.filter((ev) => ev.webhookEventId);
      if (!logged.length) return events;
      const fresh = new Set((await call('line_webhook_record', { p_channel: channel, p_events: logged }, 'webhook record')) ?? []);
      const seen = new Set();
      return events.filter((ev) => {
        const id = ev.webhookEventId;
        if (!id) return true;
        if (!fresh.has(id) || seen.has(id)) return false;
        seen.add(id);
        return true;
      });
    },
    // จัดการเสร็จ (error ว่าง) หรือล้มเหลว (error = เหตุผล) — ล้มเหลวครบเพดานจะกลายเป็น dead
    async settle(channel, ids, error = null) {
      if (!ids.length) return;
      if (error) return call('line_webhook_failed', { p_channel: channel, p_ids: ids, p_error: String(error.message ?? error) }, 'webhook failed');
      return call('line_webhook_done', { p_channel: channel, p_ids: ids }, 'webhook done');
    },
  };
}
