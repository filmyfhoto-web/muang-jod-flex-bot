// The answering engine that the "Reply Studio" page edits (src/assist/ = line-assist/src, same code the shop's Supabase
// function runs), used here for the events the app's features do not answer. Settings are read from the shop's database:
//
//   app_config.faq_bot  { mode, admins, content: { rules, texts, schools … } }   ← what the Studio saves
//   app_config.line_bot  the app's settings (admin names, silence hours, buttons …)
//
// mode  off     → this engine is not used; the Render bot's own answers (data/shop.json) reply, as before
//       admins  → only the people listed in faq_bot.admins are answered by this engine (a trial run); everybody else as before
//       all     → everybody is answered by this engine
// No database settings, an unreadable row or a missing module all mean "off": the Render bot's own answers reply.
import { parseAdminCommand } from './quiet.js';


export async function createAssistStage({ env = process.env, fetch: doFetch = fetch, now = () => Date.now(), log = console, store: injected } = {}) {
  const url = String(env.SUPABASE_URL ?? '').trim().replace(/\/+$/, '');
  const key = String(env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  const token = String(env.LINE_CHANNEL_ACCESS_TOKEN ?? '').trim();
  if (!token || (!injected && (!url || !key))) return null;

  let mod;
  try {
    const [config, engine, lineapi, contact, storeMod] = await Promise.all([
      import('./assist/config.js'),
      import('./assist/engine.js'),
      import('./assist/lineapi.js'),
      import('./assist/contact.js'),
      injected ? null : import('./assist/store.js'),
    ]);
    mod = { ...config, ...engine, ...lineapi, ...contact, ...(storeMod ?? {}) };
  } catch (e) {
    log.error?.('[assist] cannot load the answering engine (' + String(e?.message ?? e).slice(0, 120) + '): the Render bot answers alone');
    return null;
  }

  const store = injected ?? mod.createRestStore({ url, key, fetch: doFetch, now });
  const engine = mod.createEngine({ store, line: mod.createLine({ fetch: doFetch, token }), fetch: doFetch, now, env: (k) => env[k] });
  const TTL = Number(env.SETTINGS_TTL_MS) > 0 ? Number(env.SETTINGS_TTL_MS) : 15_000; // how long the settings are trusted (tests shorten it)
  const iconsBase = url ? `${url}/functions/v1/line-assets` : '';
  const cache = { at: 0, v: null };

  // The settings, read at most every 15 seconds; null when they cannot be read (and no recent copy exists).
  async function setup() {
    const t = now();
    if (cache.v && t - cache.at < TTL) return cache.v;
    try {
      const [row, bot] = await Promise.all([store.getConfig('faq_bot'), store.getConfig('line_bot')]);
      const shop = mod.buildShop(row, { bot, iconsBase });
      cache.v = { mode: mod.modeOf(row), shop, ids: new Set(mod.people(shop).map((p) => p.userId)) };
      cache.at = t;
    } catch (e) {
      if (!cache.v || t - cache.at > 10 * 60_000) {
        cache.v = null;
        log.error?.('[assist] settings unreadable → the Render bot answers alone');
      }
    }
    return cache.v;
  }

  const userOf = (ev) => (ev?.source?.type === 'user' ? ev.source.userId : '');
  // Commands only the Render bot knows (installing / removing the rich menu) always go to it.
  const renderOnly = (ev) => {
    const cmd = ev?.type === 'message' && ev.message?.type === 'text' ? parseAdminCommand(ev.message.text) : null;
    return cmd?.type === 'menuInstall' || cmd?.type === 'menuRemove';
  };

  return {
    // Does this engine answer this customer right now?
    async takesUser(userId) {
      const s = await setup();
      if (!s || s.mode === 'off') return false;
      return s.mode === 'all' || (s.mode === 'admins' && s.ids.has(userId));
    },
    async takes(ev) {
      return !renderOnly(ev) && (await this.takesUser(userOf(ev)));
    },
    async run(ev) {
      const s = await setup();
      if (!s) throw new Error('settings unreadable');
      return engine.handle(ev, s.shop);
    },
    // A customer picked a person in the app's card: that person is told (once per customer per person per window).
    async alertPick(customerId, adminName) {
      const s = await setup();
      if (!s) throw new Error('settings unreadable');
      return engine.alertPick(s.shop, { customerId, adminName });
    },
    mode: async () => (await setup())?.mode ?? 'off',
  };
}
