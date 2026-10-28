// The chatDrafts settings of data/shop.json, with the switches that can also be set on Render's Environment page (no code push):
//   CHATDRAFTS_MODE = off | pilot | on · CHATDRAFTS_AI = off | pilot | on · CHATDRAFTS_ACK = on | off
//   CHATDRAFTS_PILOT_IDS = Uxxx,Uyyy   (LINE ids of the people to try it with first)
// A value set there wins over the file; anything else in a variable is ignored and the file's value stays.
const MODES = ['off', 'pilot', 'on'];

export function chatDraftsFromEnv(cfg, env = {}) {
  const out = { ...cfg };
  const pick = (v, list) => {
    const t = String(v ?? '').trim().toLowerCase();
    return list.includes(t) ? t : null;
  };
  const mode = pick(env.CHATDRAFTS_MODE, MODES);
  if (mode) out.mode = mode;
  const ai = pick(env.CHATDRAFTS_AI, MODES);
  if (ai) out.ai = { ...out.ai, mode: ai };
  const ack = pick(env.CHATDRAFTS_ACK, ['on', 'off']);
  if (ack) out.ack = { ...out.ack, enabled: ack === 'on' };
  const ids = String(env.CHATDRAFTS_PILOT_IDS ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter((x) => /^U[0-9a-f]{32}$/.test(x));
  if (ids.length) out.pilotUserIds = ids;
  return out;
}
