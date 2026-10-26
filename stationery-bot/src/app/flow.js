// The NATTA GROUP app's features inside the Render bot: order cards, the shop menu card, "talk to an admin" (pick a
// name, quiet for 24 h), and the project-document flow. The decision order for one message is the app's own (bot.js):
//
//   order card request → admin ask / pick → document flow → admin quiet window ("เมนู" ends it) → shop menu
//   → everything else is handed to `others` (the Render bot's own answers, or the assist engine)
//
// It stays OFF (returns null) unless SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set on this host, and it switches
// itself off per batch when the shop's settings cannot be read, so the Render bot never gets worse than it is without it.
// Which parts answer is decided by the shop's own settings row `app_config.line_bot` (menu_card, admin_pick, docs, enabled),
// read at most every 15 seconds — the same row the app's back office edits.
import { botConfig, createBotHandler } from './bot.js';

const SETTINGS_STALE = 10 * 60_000; // …and how long the last good copy is used when the database cannot be reached

// The promise's result, or an error after `ms` (a database that does not answer must not hold up the customer).
const within = (promise, ms) =>
  Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('timed out')), ms).unref?.())]);

export async function createAppFlow({ env = process.env, fetch: doFetch = fetch, others, onPick, skip, pickList, paused = () => false, log = console, now = () => Date.now(), store: injected } = {}) {
  if (typeof others !== 'function') throw new TypeError('createAppFlow needs an `others` function');
  const url = String(env.SUPABASE_URL ?? '').trim().replace(/\/+$/, '');
  const key = String(env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();

  let base = injected;
  if (!base) {
    if (!url || !key) {
      log.info?.('[app] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set: order cards, shop menu, admin pick and project documents are OFF');
      return null;
    }
    try {
      base = (await import('./store.js')).createAppStore({ url, key, env, fetch: doFetch });
    } catch (e) {
      log.error?.('[app] cannot start (' + String(e?.message ?? e).slice(0, 120) + '): the app features stay OFF');
      return null;
    }
  }

  const SETTINGS_TTL = Number(env.SETTINGS_TTL_MS) > 0 ? Number(env.SETTINGS_TTL_MS) : 15_000; // how long a read of the settings row is trusted (tests shorten it)
  const SETTINGS_WAIT = Number(env.SETTINGS_TIMEOUT_MS) > 0 ? Number(env.SETTINGS_TIMEOUT_MS) : 3000; // longest wait for the settings row before the Render bot answers alone
  const settings = { raw: undefined, at: 0, ok: false, failedAt: -Infinity };
  async function settingsOk() {
    const t = now();
    if (settings.ok && t - settings.at < SETTINGS_TTL) return true;
    if (!settings.ok && t - settings.failedAt < 3000) return false; // do not hammer a database that just said no
    try {
      settings.raw = await within(base.getConfig('line_bot'), SETTINGS_WAIT);
      settings.at = t;
      settings.ok = true;
      return true;
    } catch {
      if (settings.ok && t - settings.at < SETTINGS_STALE) return true; // a short outage: keep using the last good copy
      settings.ok = false;
      settings.failedAt = t;
      log.error?.('[app] the shop settings (line_bot) cannot be read: customers get the Render bot\'s own answers only');
      return false;
    }
  }

  // What bot.js sees: the settings row from the copy above (so one read serves both), and a chat-state read that
  // fails "closed" — a customer whose state cannot be read counts as just seen, so an outage never makes the bot
  // send the menu card to everybody.
  const store = {
    ...base,
    async getConfig(k) {
      return k === 'line_bot' ? (settings.raw ?? null) : base.getConfig(k);
    },
    async getChat(uid) {
      try {
        return await base.getChat(uid);
      } catch {
        const t = now();
        return { mode: 'bot', admin_ms: 0, last_ms: 0, seen_ms: t, menu_ms: t };
      }
    },
  };

  const runOthers = async (events) => {
    try {
      await others(events);
    } catch (e) {
      log.error?.('[app] others:', String(e?.message ?? e).slice(0, 160));
    }
  };
  // The Render bot's own admin / set-up commands ("ติดตั้งเมนู", "ปิดบอท", "ไอดีฉัน"): never a question for the app's cards.
  const isOwn = (ev) => {
    try {
      return Boolean(skip?.(ev));
    } catch {
      return false;
    }
  };

  // A customer's order written as a list in the chat: the Render bot tells the admins (a failing check counts as "not a list").
  const isList = (ev) => {
    try {
      return Boolean(pickList?.(ev));
    } catch {
      return false;
    }
  };

  const bot = createBotHandler({
    store,
    fetch: doFetch,
    now,
    waitUntil: (p) => {
      Promise.resolve(p).catch(() => {});
    },
    pushUrl: url ? `${url}/functions/v1/push-notify` : '',
    assetsUrl: url ? `${url}/functions/v1/line-assets` : '',
    selfUrl: '',
    others: runOthers,
    onPick,
    skip: isOwn,
    pickList: isList,
  });

  return {
    // The window onto the shop's database, for the parts of the Render bot that are not the app's own cards (chatorders.js).
    store: base,
    // One LINE webhook call. `raw` and `sig` are exactly what LINE sent; `events` is the parsed list.
    async handle(raw, sig, events) {
      if (!(await settingsOk())) {
        await runOthers(events);
        return { bypass: 'settings' };
      }
      if (botConfig(settings.raw).enabled === false) {
        await runOthers(events);
        return { bypass: 'off' };
      }
      if (paused()) {
        // a pause silences the bot for customers, not for the admins who switch it: "เปิดบอท" must still reach the Render bot
        const own = events.filter(isOwn);
        if (own.length) await runOthers(own);
        return { bypass: 'paused' };
      }
      const res = await bot(new Request('http://app.invalid/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'x-line-signature': sig || '' }, body: raw }));
      let out = null;
      try {
        out = await res.json();
      } catch {
        out = null;
      }
      if (out?.error) log.error?.('[app]', out.error, String(out.message ?? '').slice(0, 120));
      return out;
    },
    // A short note for the staff who use the shop's web app (a push to their phones; tapping it opens `path`, e.g. "/#projdocs").
    // The key lives in the shop's database (app_secrets) and is never logged. → false when it could not be sent.
    async notifyApp({ title, body, path = '/', tag = 'note' }) {
      if (!url || !(await settingsOk())) return false;
      try {
        const key = await within(base.getSecret('push_hook_key'), SETTINGS_WAIT);
        if (!key) return false;
        const res = await doFetch(`${url}/functions/v1/push-notify`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'notify', key, title, body, url: path, tag }),
          signal: AbortSignal.timeout(8000),
        });
        return res.ok;
      } catch {
        return false;
      }
    },
    // Can the shop's database be reached with the key that was given? (what /health reports)
    check: () => settingsOk(),
    // The answer of the latest look, without making another (for work that is not worth waiting for a dead database).
    dbOk: () => settings.ok,
    // Which parts are switched on right now (false for all of them while the settings cannot be read).
    status() {
      if (!settings.ok) return { menu: false, pick: false, docs: false, enabled: false };
      const c = botConfig(settings.raw);
      return { menu: c.menu_card, pick: c.admin_pick, docs: Boolean(c.docs), enabled: c.enabled };
    },
    // The settings as bot.js reads them (for the pick-alert names).
    admins() {
      return settings.ok ? botConfig(settings.raw).admins : [];
    },
  };
}
