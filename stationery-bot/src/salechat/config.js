// The saleChat settings of data/shop.json, with the switches that can also be set on Render's Environment page (no code push):
//   SALECHAT_MODE = off | pilot | on          off = the page gets nothing from LINE and sends nothing · pilot = only the people listed below
//   SALECHAT_PILOT_IDS = Uxxx,Uyyy            LINE ids of the people to try it with first (their messages are recorded, replies to them are sent)
//   SALECHAT_QUIET = on | off                 on = once staff have answered a customer from the page, the bot's own answers stay quiet for them
// A value set there wins over the file; anything else in a variable is ignored and the file's value stays.
//
// The shop's database for the bridge (the service role key is a secret: it goes on Render's Environment page and nowhere else):
//   SALECHAT_SUPABASE_URL + SALECHAT_SERVICE_ROLE_KEY, or else the CHATDRAFTS_ pair, or else the app's SUPABASE_ pair.
// Having a database does not switch anything on; the mode does. Without a database the bridge does not exist (the page says "not connected").
const MODES = ['off', 'pilot', 'on'];

export function saleChatFromEnv(cfg, env = {}) {
  const out = { channelKey: 'main', quietAfterReply: true, ...cfg };
  const t = (v) => String(v ?? '').trim().toLowerCase();
  const mode = t(env.SALECHAT_MODE);
  if (MODES.includes(mode)) out.mode = mode;
  if (!MODES.includes(out.mode)) out.mode = 'off'; // anything unknown is off
  const quiet = t(env.SALECHAT_QUIET);
  if (quiet === 'on' || quiet === 'off') out.quietAfterReply = quiet === 'on';
  const ids = String(env.SALECHAT_PILOT_IDS ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter((x) => /^U[0-9a-f]{32}$/.test(x));
  if (ids.length) out.pilotUserIds = ids;
  return out;
}

const clean = (v) => String(v ?? '').trim();

// → { url, key } of the first complete pair, or null
export function saleChatDb(env = {}) {
  for (const [u, k] of [
    ['SALECHAT_SUPABASE_URL', 'SALECHAT_SERVICE_ROLE_KEY'],
    ['CHATDRAFTS_SUPABASE_URL', 'CHATDRAFTS_SERVICE_ROLE_KEY'],
    ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'],
  ]) {
    const url = clean(env[u]).replace(/\/+$/, '');
    const key = clean(env[k]);
    if (url && key) return { url, key };
  }
  return null;
}
