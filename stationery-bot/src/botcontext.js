// Which customer the bot is answering right now. Each customer event runs inside forCustomer(userId, …), and the async work it starts
// (replies, pushes, timers) carries that id along. When LINE accepts a reply to that customer, or a push to that same customer,
// line.js calls noteBotSent(), which hands the messages to the hook (the sale chat records them as the bot's answer in that customer's
// chat). Nothing else is reported: a push to a staff member (an admin alert, the team's card) or a send outside any customer's event
// (the page's queue, the team worker) is not the customer's chat. The hook never throws into the answer.
import { AsyncLocalStorage } from 'node:async_hooks';

const current = new AsyncLocalStorage();
let onSent = null;

export function forCustomer(userId, fn) {
  return userId ? current.run({ userId: String(userId) }, fn) : fn();
}

export function setBotSentHook(fn) {
  onSent = typeof fn === 'function' ? fn : null;
}

// to: the LINE id a push went to (undefined for a reply, which always goes back to the customer whose event is being handled)
export function noteBotSent(to, messages) {
  const cur = current.getStore();
  if (!cur || !onSent) return;
  if (to !== undefined && to !== null && String(to) !== cur.userId) return;
  try {
    onSent(cur.userId, messages);
  } catch {
    /* recording never changes what the customer got */
  }
}
