// "ได้รับรายการสั่งซื้อแล้วค่ะ ร้านกำลังดำเนินการจัดสินค้า" — sent to the customer once the staff have checked and confirmed the
// order in the back office. Off unless chatDrafts.ack.enabled says so. Only the shop's own OA is told this (a second OA's
// customer is not a friend of the main account), never while a person is talking with the customer (busy), and never twice:
// the draft is marked "told" in the database before the message goes out.
import { enabledFor } from '../chatorders.js';

export function createDraftAck({ store, getConfig, push, busy = async () => false, now = () => Date.now(), log = console }) {
  return async function tick() {
    const conf = getConfig() ?? {};
    const a = conf.ack ?? {};
    if (!a.enabled || !a.text) return 0;
    const hours = Number(a.maxAgeHours) > 0 ? Number(a.maxAgeHours) : 48;
    const rows = await store.draftsToAck(new Date(now() - hours * 3_600_000).toISOString());
    let told = 0;
    for (const d of rows) {
      if (!enabledFor(conf, d.line_user_id)) continue;
      if (await busy(d.line_user_id).catch(() => true)) continue; // a person is with the customer: next pass
      if (!(await store.markAcked(d.id))) continue;
      try {
        await push(d.line_user_id, [{ type: 'text', text: String(a.text).slice(0, 1000) }]);
        await store.addEvent(d.id, 'bot', 'ack_sent', {});
        told++;
      } catch (e) {
        if (/\b(400|403)\b/.test(String(e?.status ?? e?.message ?? ''))) {
          await store.addEvent(d.id, 'bot', 'ack_refused', { status: e?.status ?? null }); // the customer blocked the shop: no retries
        } else {
          await store.releaseAck(d.id); // a passing failure: the next pass tries again
          log.error?.('[orders] ack', d.draft_no, String(e?.message ?? e).slice(0, 120));
        }
      }
    }
    return told;
  };
}
