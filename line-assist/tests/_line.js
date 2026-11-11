// A fake LINE + vision API for the tests: records what would have been sent.
import { createLine } from '../src/lineapi.js';
import { createEngine } from '../src/engine.js';
import { createMemoryStore } from '../src/store.js';
import { makeShop, IDS } from './_shop.js';

export const MIN = 60_000;
export const HOUR = 60 * MIN;
const TOKEN = 'tok';

export function fakeLine({ replyStatus = 200, profile = {}, content = null, gemini = null } = {}) {
  const log = { replies: [], pushes: [], calls: [] };
  const state = { replyStatus };
  const json = (o, status = 200) => ({ ok: status < 400, status, json: async () => o, text: async () => JSON.stringify(o), headers: new Headers() });
  const fetch = async (url, init = {}) => {
    const u = String(url);
    log.calls.push(u);
    const body = init.body && typeof init.body === 'string' ? JSON.parse(init.body) : null;
    if (u.endsWith('/message/reply')) {
      log.replies.push(body);
      return json({}, state.replyStatus);
    }
    if (u.endsWith('/message/push')) {
      log.pushes.push(body);
      return json({});
    }
    if (u.includes('/bot/profile/')) {
      const id = decodeURIComponent(u.split('/bot/profile/')[1]);
      return json({ displayName: profile[id]?.name ?? `ลูกค้า-${id.slice(-4)}`, pictureUrl: profile[id]?.picture ?? `https://p.example/${id.slice(-4)}.jpg` });
    }
    if (u.includes('/content')) {
      if (!content) return json({}, 404);
      return { ok: true, status: 200, headers: new Headers({ 'content-type': content.mime }), arrayBuffer: async () => content.bytes.buffer.slice(content.bytes.byteOffset, content.bytes.byteOffset + content.bytes.length) };
    }
    if (u.endsWith('/message/quota')) return json({ type: 'limited', value: 300 });
    if (u.endsWith('/quota/consumption')) return json({ totalUsage: 120 });
    if (u.includes('generativelanguage.googleapis.com')) return json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ kind: gemini ?? 'other' }) }] } }] });
    throw new Error(`unexpected fetch ${u}`);
  };
  return { fetch, log, state };
}

export function setup({ shop = makeShop(), start = Date.UTC(2026, 9, 14, 5, 0, 0), env = {}, line: lineOpts } = {}) {
  const clock = { t: start };
  const now = () => clock.t;
  const store = createMemoryStore({ now });
  const fake = fakeLine(lineOpts);
  const line = createLine({ fetch: fake.fetch, token: TOKEN });
  const engine = createEngine({ store, line, fetch: fake.fetch, now, env: (k) => env[k] });
  let n = 0;
  const ev = (userId, message, extra = {}) => ({
    type: 'message',
    mode: 'active',
    source: { type: 'user', userId },
    replyToken: `rt${++n}`,
    message: { id: `m${n}`, ...message },
    ...extra,
  });
  const say = (userId, text) => engine.handle(ev(userId, { type: 'text', text }), shop);
  const media = (userId, type, extra = {}) => engine.handle(ev(userId, { type, ...extra }), shop);
  return { clock, store, fake, engine, shop, ev, say, media, tick: (ms) => (clock.t += ms), ...fake.log && { log: fake.log } };
}

export const CUSTOMER = 'U' + 'c'.repeat(32);
export const CUSTOMER2 = 'U' + 'd'.repeat(32);
export { IDS };
export const textsOf = (messages) => JSON.stringify(messages);
