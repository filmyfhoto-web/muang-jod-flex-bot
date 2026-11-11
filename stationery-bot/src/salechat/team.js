// The team's card: a new order saved on the "แชตและออเดอร์" page → one card to each person on the shop's contact list, once per order.
// Every order sale_orders has that the team has not been sent a card for yet is picked up, however old (an old one only exists if the
// bot was down a while; migration 004 marked every order from before this feature "sent" when it went in, so nothing from that time
// is resent). A card LINE has not answered for yet is tried again next tick with the same retry key, so nobody gets it twice, and the
// order is never marked "sent" until every person's answer is final — a refusal that a retry will not fix is logged and counts as final
// too, so one blocked phone does not hold the order open forever.
// Switched by SALECHAT_TEAMCARD (or shop.json saleChat.teamCard.mode): off · on. Nothing is sent while it is off.
import { buildTeamCard } from './card.js';
import { classifyPush, pushWithTextFallback, retryKeyFor } from './outbox.js';
export { retryKeyFor } from './outbox.js';

// store · push(to, messages, token, retryKey) → LINE's answer · teamIds() → the LINE ids of the people on the contact list
export function createTeamCards({ store, push, tokenFor, getConfig, teamIds = () => [], shopName = () => '', channelKey = 'main', log = console, now = () => Date.now(), limit = 5 }) {
  let running = false;

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
      const pending = await store.teamPending(limit);
      let sent = 0;
      for (const { id } of pending) {
        const card = await store.orderCard(id);
        if (!card) {
          await store.markTeamSent(id, new Date(now()).toISOString());
          continue;
        }
        const msg = buildTeamCard(card, { shopName: shopName() });
        const answers = [];
        for (const to of ids) {
          // the same order and the same person always give the same key; a card LINE refuses goes as its one-line text instead
          const answer = await pushWithTextFallback(push, to, [msg], [{ type: 'text', text: msg.altText }], token, retryKeyFor('team', id, to), log);
          answers.push({ to, ...classifyPush(answer) });
        }
        if (answers.some((a) => a.result === 'retry')) continue; // not final yet: tried again next tick, same keys, nobody sent it twice
        for (const a of answers) if (a.result === 'failed') log.error?.('[salechat] team card for', id, 'not delivered to', a.to, a.error);
        await store.markTeamSent(id, new Date(now()).toISOString());
        sent++;
      }
      return { pending: pending.length, sent };
    } finally {
      running = false;
    }
  }

  return { tick };
}
