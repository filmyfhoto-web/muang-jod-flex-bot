// Staff replies written in the "แชตและออเดอร์" page → the customer's LINE. The page only queues a reply; this takes it from the queue,
// sends it to LINE (a push, which uses one message of the plan's monthly quota) and tells the database what LINE answered. The page shows
// "sent" only after this has reported LINE's acceptance — never before.
import { enabledFor } from '../chatorders.js';
import { buildCustomerCard } from './card.js';

// LINE's answer → what to tell the database.
//   sent   LINE accepted it (200), or accepted it earlier and now says so (409 with the first request's id)
//   failed LINE refused it for a reason a retry will not fix (quota full, the customer blocked the OA, a bad token…)
//   retry  no answer / LINE's own error: not known whether it arrived, so it is tried again with the same retry key
export function classifyPush(r) {
  if (r?.ok) return { result: 'sent', requestId: r.requestId || '' };
  if (r?.status === 409 && r.accepted) return { result: 'sent', requestId: r.accepted };
  const why = r?.error ? ` — ${r.error}` : '';
  if (!r || r.network || r.status === 0) return { result: 'retry', error: `ติดต่อ LINE ไม่ได้${why}` };
  if (r.status >= 500) return { result: 'retry', error: `LINE ผิดพลาดชั่วคราว (${r.status})${why}` };
  const hint =
    {
      400: 'LINE ไม่รับข้อความนี้',
      401: 'โทเคนของ LINE OA ใช้ไม่ได้ (ต้องตรวจที่ Render)',
      403: 'LINE ไม่ให้ส่งถึงลูกค้าคนนี้ (อาจบล็อกหรือเลิกติดตามร้านแล้ว)',
      409: 'LINE ตอบว่าส่งซ้ำ (รหัสซ้ำ)',
      429: 'โควตาข้อความของ LINE เดือนนี้เต็ม หรือส่งถี่เกินไป',
    }[r.status] || `LINE ตอบ ${r.status}`;
  return { result: 'failed', error: `${hint}${why}` };
}

// push(to, messages, token, retryKey) → LINE's answer (line.js pushWithRetryKey) · tokenFor(channelKey) → that OA's access token or ''
// onSent(job) runs after LINE accepted a message (the bot uses it to stay quiet for that customer while staff are talking to them)
export function createSaleOutbox({ store, push, tokenFor, getConfig, onSent = () => {}, log = console, limit = 5, shopName = () => '' }) {
  let running = false;

  // a reply that belongs to an order goes as that order's card (built from the database rows, so the totals are the server's);
  // any other reply, or a card that cannot be built right now, goes as the plain text the staff wrote: the customer gets something either way
  async function messagesFor(job, cfg) {
    try {
      if (cfg.card?.mode !== 'on') return [{ type: 'text', text: job.body }]; // the card is switched off: the text goes as before
      const orderId = await store.outboxOrderId(job.id);
      if (orderId) {
        const data = await store.orderCard(orderId);
        if (data) return [buildCustomerCard(data, { shopName: shopName(), payNote: cfg.card?.payNote ?? '' })];
      }
    } catch (e) {
      log.error?.('[salechat] card for', job.id, 'not built, the text is sent:', e.message);
    }
    return [{ type: 'text', text: job.body }];
  }

  // one pass: take what is waiting, send it, report. Several passes never overlap.
  async function tick() {
    if (running) return { skipped: 'busy' };
    const cfg = getConfig() ?? {};
    // off = nothing is sent; what is waiting is left alone and, if still unsent after 30 minutes, the database marks it "not sent"
    if (cfg.mode !== 'on' && cfg.mode !== 'pilot') return { skipped: 'off' };
    running = true;
    try {
      const jobs = await store.claim(limit);
      let sent = 0;
      for (const job of jobs) {
        try {
          if (!enabledFor(cfg, job.line_user_id)) {
            await store.finish(job.id, 'failed', 'โหมดทดลอง: ลูกค้าคนนี้ไม่อยู่ในรายชื่อทดสอบ จึงไม่ได้ส่ง');
            continue;
          }
          const token = tokenFor(job.channel_key);
          if (!token) {
            await store.finish(job.id, 'failed', 'ไม่พบโทเคนของช่อง LINE นี้ จึงไม่ได้ส่ง');
            continue;
          }
          const c = classifyPush(await push(job.line_user_id, await messagesFor(job, cfg), token, job.retry_key));
          await store.finish(job.id, c.result, c.error ?? null, c.requestId ?? null);
          if (c.result === 'sent') {
            sent++;
            try {
              onSent(job);
            } catch {
              /* a hook never undoes a delivery */
            }
          }
        } catch (e) {
          // the result could not be reported (the database is down): the row stays "sending", the next pass takes it again after
          // the wait and sends it with the same retry key, so LINE answers "already accepted" instead of sending it twice
          log.error?.('[salechat] send', job.id, e.message);
        }
      }
      return { jobs: jobs.length, sent };
    } finally {
      running = false;
    }
  }

  return { tick };
}
