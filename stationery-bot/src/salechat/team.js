// The team's card: a new order saved on the "แชตและออเดอร์" page → one card to each person on the shop's contact list, once per order.
// Only orders saved within the last two hours are sent (older ones were marked "sent" when migration 004 went in). A card LINE did not
// answer for is tried again later with the same retry key, so nobody gets it twice; after three such tries it is given up on and logged.
// Switched by SALECHAT_TEAMCARD (or shop.json saleChat.teamCard.mode): off · on. Nothing is sent while it is off.
import { createHash } from 'node:crypto';
import { buildTeamCard } from './card.js';
import { classifyPush } from './outbox.js';

export const TEAM_WINDOW_MS = 2 * 60 * 60_000;
export const MAX_TRIES = 3;

// LINE wants a UUID as the retry key: the same order and the same person always give the same key
export function retryKeyFor(...parts) {
  const h = createHash('sha1').update(parts.join('|')).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

// store · push(to, messages, token, retryKey) → LINE's answer · teamIds() → the LINE ids of the people on the contact list
export function createTeamCards({ store, push, tokenFor, getConfig, teamIds = () => [], shopName = () => '', channelKey = 'main', log = console, now = () => Date.now(), windowMs = TEAM_WINDOW_MS, limit = 5 }) {
  let running = false;
  const tries = new Map(); // orderId → passes that LINE did not answer for (in memory: a restart starts the count again)

  async function tick() {
    if (running) return { skipped: 'busy' };
    const cfg = getConfig() ?? {};
    if (cfg.teamCard?.mode !== 'on') return { skipped: 'off' };
    const ids = teamIds().filter(Boolean);
    if (!ids.length) return { skipped: 'no-team' };
    const token = tokenFor(channelKey);
    if (!token) return { skipped: 'no-token' };
    running = true;
    try {
      const pending = await store.teamPending(new Date(now() - windowMs).toISOString(), limit);
      let sent = 0;
      for (const { id } of pending) {
        const card = await store.orderCard(id);
        if (!card) {
          await store.markTeamSent(id, new Date(now()).toISOString());
          continue;
        }
        const msg = buildTeamCard(card, { shopName: shopName() });
        const answers = [];
        for (const to of ids) answers.push({ to, ...classifyPush(await push(to, [msg], token, retryKeyFor('team', id, to))) });
        if (answers.some((a) => a.result === 'retry')) {
          const n = (tries.get(id) || 0) + 1;
          tries.set(id, n);
          if (n < MAX_TRIES) continue; // the people who got it are not sent it again (same retry keys)
          log.error?.('[salechat] team card for', id, 'given up after', n, 'tries');
        }
        for (const a of answers) if (a.result === 'failed') log.error?.('[salechat] team card for', id, 'not delivered to', a.to, a.error);
        await store.markTeamSent(id, new Date(now()).toISOString());
        tries.delete(id);
        sent++;
      }
      return { pending: pending.length, sent };
    } finally {
      running = false;
    }
  }

  return { tick };
}
