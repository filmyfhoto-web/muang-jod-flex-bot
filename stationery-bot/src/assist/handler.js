// The HTTP side: what LINE (through line-bot's relay) sends us, and what we do with it.
//
//   POST  a LINE webhook body  → answered here, or passed on to the old bot (see "mode" in config.js)
//   POST  { "action": "seed_assets", "from": "<https folder with the 6 pictures>" }  → copies the pictures
//         into a public Storage folder, once
//   POST  { "action": "pick_alert", "user_id": "U…", "admin_name": "หญิง" }  → tells that person a customer
//         chose them in the shop's own picker (sent by the database, see sql/002_pick_alert.sql)
//   GET   → "ok"
//
// Who may call: a request that carries a valid LINE signature (if the channel secret is saved in
// app_secrets) or the shared key in the URL (?k=…, app_secrets 'faq_hook_key'). Nobody else.
import { buildShop, modeOf } from './config.js';
import { createEngine } from './engine.js';
import { createLine, describeEvent } from './lineapi.js';
import { people } from './contact.js';
import { hmacBase64, sameStr, HOUR } from './util.js';

const URL_OK = /^https:\/\/[^\s<>"']{3,990}$/i;
const PICTURES = ['staff', 'admin', 'school', 'order', 'ask', 'icon'];
// where the pictures may be copied from
const SEED_FROM = [/^https:\/\/raw\.githubusercontent\.com\/filmyfhoto-web\//, /^https:\/\/cdn\.jsdelivr\.net\/gh\/filmyfhoto-web\//];
const BUCKET = 'line-assist';

export function createHandler(deps) {
  const { store, fetch: doFetch = fetch, now = () => Date.now(), env = () => undefined, waitUntil = () => {}, selfUrl = '', iconsUrl = '' } = deps;
  const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });
  const memo = { forward: '' }; // the last good pass-on address, for when the store is unreachable

  async function authorized(raw, sig, key) {
    const secret = String((await store.getSecret('line_channel_secret')) ?? '').trim();
    if (secret && sig && sameStr(await hmacBase64(secret, raw), sig)) return true;
    const want = String((await store.getSecret('faq_hook_key')) ?? '').trim();
    return Boolean(want) && sameStr(want, key);
  }

  async function forwardTarget() {
    const u = String((await store.getSecret('faq_forward')) ?? '').trim();
    const ok = URL_OK.test(u) && u !== selfUrl ? u : '';
    memo.forward = ok;
    return ok;
  }

  // Hand the original request on to the old bot unchanged (same body, same signature).
  function forward(url, raw, sig) {
    const job = (async () => {
      try {
        const r = await doFetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Line-Signature': sig || '', 'User-Agent': 'LineBotWebhook/2.0' },
          body: raw,
          signal: AbortSignal.timeout(100_000),
        });
        try {
          await r.body?.cancel();
        } catch {
          /* ignore */
        }
        return r.status;
      } catch {
        return 0;
      }
    })();
    try {
      waitUntil(job);
    } catch {
      /* ignore */
    }
    return job;
  }

  // The shop's settings, the OA token and the old bot's address. Throws when the database cannot be reached.
  async function load() {
    const [row, bot, token, fwd] = await Promise.all([store.getConfig('faq_bot'), store.getConfig('line_bot'), store.getSecret('line_channel_token'), forwardTarget()]);
    return { row, bot, token: String(token ?? '').trim(), fwd };
  }

  // A customer chose a person in the shop's own picker (line-bot goes quiet for them by itself); the database
  // calls this so the chosen person is told too. Body: { action: 'pick_alert', user_id, admin_name }.
  async function pickAlert(body) {
    const customerId = String(body.user_id ?? '');
    const adminName = String(body.admin_name ?? '').slice(0, 40);
    if (!/^U[0-9a-f]{32}$/i.test(customerId) || !adminName.trim()) return json({ error: 'bad_request' }, 400);
    let setup;
    try {
      setup = await load();
    } catch (e) {
      console.error('[setup]', e.message);
      return json({ ok: false, error: 'setup_failed' }, 500);
    }
    const mode = modeOf(setup.row);
    if (mode === 'off' || !setup.token) return json({ ok: true, skipped: mode === 'off' ? 'off' : 'no_token' });
    const shop = buildShop(setup.row, { bot: setup.bot, iconsBase: iconsUrl });
    const engine = createEngine({ store, line: createLine({ fetch: doFetch, token: setup.token }), fetch: doFetch, now, env });
    try {
      return json({ ok: true, r: await engine.alertPick(shop, { customerId, adminName }) });
    } catch (e) {
      console.error('[pick_alert]', e.message);
      return json({ ok: false, error: 'alert_failed' }, 500);
    }
  }

  async function seedAssets(from) {
    if (!SEED_FROM.some((re) => re.test(from))) return json({ error: 'bad_source' }, 400);
    if (typeof store.putPublicFile !== 'function') return json({ error: 'no_storage' }, 500);
    const base = from.replace(/\/+$/, '');
    const done = {};
    let publicBase = '';
    for (const name of PICTURES) {
      let res;
      try {
        res = await doFetch(`${base}/${name}.png`, { signal: AbortSignal.timeout(20_000) });
      } catch {
        return json({ error: 'fetch_failed', name, status: 0 }, 502);
      }
      if (!res.ok) return json({ error: 'fetch_failed', name, status: res.status }, 502);
      const bytes = new Uint8Array(await res.arrayBuffer());
      const url = await store.putPublicFile(BUCKET, `${name}.png`, bytes, 'image/png');
      publicBase = url.slice(0, url.lastIndexOf('/'));
      done[name] = bytes.length;
    }
    return json({ ok: true, files: done, assets_base: publicBase });
  }

  async function onPost(req) {
    const raw = await req.text().catch(() => '');
    const sig = req.headers.get('x-line-signature') || '';
    const key = new URL(req.url).searchParams.get('k') || '';
    if (!(await authorized(raw, sig, key))) return json({ error: 'auth' }, 401);

    let body;
    try {
      body = JSON.parse(raw || '{}') || {};
    } catch {
      return json({ error: 'bad_json' }, 400);
    }
    if (body.action === 'seed_assets') return seedAssets(String(body.from ?? ''));
    if (body.action === 'pick_alert') return pickAlert(body);
    const events = Array.isArray(body.events) ? body.events : [];
    if (!events.length) return json({ ok: true, r: [] }); // LINE's "verify" ping

    let row;
    let bot;
    let token;
    let fwd;
    try {
      ({ row, bot, token, fwd } = await load());
    } catch (e) {
      // The settings cannot be read: do what the old bot would have done, if we still know where it is.
      console.error('[setup]', e.message);
      if (memo.forward) {
        forward(memo.forward, raw, sig);
        return json({ ok: true, r: [], relay: 'fwd', why: 'setup_failed' });
      }
      return json({ ok: false, error: 'setup_failed' }, 500);
    }
    const mode = modeOf(row);
    const shop = buildShop(row, { bot, iconsBase: iconsUrl });

    const pass = (why) => {
      if (fwd) {
        forward(fwd, raw, sig);
        return json({ ok: true, r: [], relay: 'fwd', mode, why });
      }
      return json({ ok: true, r: [], skipped: why, mode });
    };
    if (mode === 'off') return pass('off');
    if (!token) return pass('no_token');
    if (mode === 'admins') {
      // Trial run: only the listed people are answered here; a batch with anyone else goes to the old bot whole.
      const ids = new Set(people(shop).map((p) => p.userId));
      const onlyAdmins = events.every((ev) => ev?.source?.type === 'user' && ids.has(ev.source.userId));
      if (!onlyAdmins) return pass('not_admin');
    }

    const engine = createEngine({ store, line: createLine({ fetch: doFetch, token }), fetch: doFetch, now, env });
    const results = [];
    for (const ev of events.slice(0, 30)) {
      console.log(describeEvent(ev)); // what kind it is, never what anyone wrote
      try {
        results.push(await engine.handle(ev, shop));
      } catch (e) {
        console.error('[event]', e.message);
        results.push('error');
      }
    }
    if (Math.random() < 0.02) {
      try {
        waitUntil(store.prune(now() - 3 * 24 * HOUR).catch(() => {}));
      } catch {
        /* ignore */
      }
    }
    return json({ ok: true, r: results, mode });
  }

  return async function handle(req) {
    try {
      if (req.method === 'GET') return new Response('ok', { headers: { 'Content-Type': 'text/plain' } });
      if (req.method !== 'POST') return json({ error: 'method' }, 405);
      return await onPost(req);
    } catch (e) {
      console.error('[handler]', e.message);
      return json({ error: 'server' }, 500);
    }
  };
}
