// The LINE bridge of the "แชตและออเดอร์" page (db/migrations/003_sale_line_bridge.sql):
//   · record()      a customer's message → a message in their chat in the page (silent: the customer gets nothing from this)
//   · tick()        a staff reply queued by the page → LINE, then the result back to the page
//   · beat()        "I am here" every minute — the only thing the page's "LINE OA: connected" is based on
// Nothing in here can stop the bot from answering customers: every call is caught, the database has timeouts, and the work for one
// customer is queued apart from the bot's own per-customer queue, so a slow database never delays an answer.
// It does nothing unless saleChat.mode (shop.json / SALECHAT_MODE) is pilot or on.
import { createSerial } from '../serial.js';
import { createSaleChatStore } from './store.js';
import { createSaleChatIngest } from './ingest.js';
import { createSaleOutbox } from './outbox.js';

const QUOTA_EVERY_MS = 30 * 60_000;

// db → { url, key } · getConfig() → the current saleChat settings (read each time, so a change on Render applies at once)
// lineApi → { profile, content, quota } · push(to, messages, token, retryKey) → LINE's answer · tokenFor(channelKey) → access token
export function createSaleChat({ db, store = createSaleChatStore({ url: db.url, key: db.key }), getConfig, lineApi, push, tokenFor, build = '', onSent, log = console, tickMs = 5000, beatMs = 60_000, now = () => Date.now(), retries }) {
  const cfg = () => getConfig() ?? {};
  const serial = createSerial(); // this bridge's own queue: one customer's messages in order, apart from the bot's answers
  const ingest = createSaleChatIngest({ store, lineApi, getConfig: cfg, log, ...(retries ? { retries } : {}) });
  const outbox = createSaleOutbox({ store, push, tokenFor, getConfig: cfg, onSent, log });
  let quota = null;
  let quotaAt = 0;
  let timers = [];
  // a database that is not ready (migration 003 not applied yet, the key wrong) must not fill the log once a few seconds: say each
  // problem once, and say when it is over
  const lastErr = new Map();
  const failed = (what, e) => {
    if (lastErr.get(what) !== e.message) {
      lastErr.set(what, e.message);
      log.error?.(`[salechat] ${what}:`, e.message);
    }
  };
  const worked = (what) => {
    if (lastErr.delete(what)) log.log?.(`[salechat] ${what}: working again`);
  };

  // fire and forget: never awaited by the webhook, never throws
  function record(channelKey, ev, token) {
    const who = ev?.source?.userId;
    if (!who) return;
    const mode = cfg().mode;
    if (mode !== 'on' && mode !== 'pilot') return;
    serial
      .run(`${channelKey}:${who}`, () => ingest.handle({ channelKey, token, ev }))
      .catch((e) => log.error?.('[salechat] message not saved:', e.message));
  }

  async function beat() {
    const c = cfg();
    const channel = c.channelKey || 'main';
    if ((c.mode === 'on' || c.mode === 'pilot') && lineApi.quota && now() - quotaAt > QUOTA_EVERY_MS) {
      quotaAt = now(); // set first: a slow or failed answer from LINE is not asked again every minute
      const q = await lineApi.quota(tokenFor(channel)).catch(() => null);
      if (q) quota = { ...q, at: new Date(now()).toISOString() };
    }
    await store.beat(channel, c.mode, build, quota ? { quota } : {});
  }

  function start() {
    stop();
    const pass = () => outbox.tick().then((r) => (r?.skipped ? undefined : worked('send pass')), (e) => failed('send pass', e));
    const pulse = () => beat().then(() => worked('heartbeat'), (e) => failed('heartbeat', e));
    timers = [setInterval(pass, tickMs), setInterval(pulse, beatMs)];
    for (const t of timers) t.unref?.();
    pulse();
  }
  function stop() {
    for (const t of timers) clearInterval(t);
    timers = [];
  }

  return { record, tick: outbox.tick, beat, start, stop, mode: () => cfg().mode ?? 'off' };
}
