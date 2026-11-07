// The wait before the bot answers free text (so a person has the chance to answer first).
// Buttons are different: someone who taps "เวลาเปิดร้าน" expects the answer at once, and
// so does someone in the middle of a two-step question ("which school?").
import { normalize } from './matcher.js';

export function delaySeconds(shop, env = {}) {
  const v = Number(env.REPLY_DELAY_SECONDS ?? shop.replyDelaySeconds ?? 0);
  return Number.isFinite(v) && v > 0 ? v : 0;
}

export function isMenuText(shop, text) {
  const q = normalize(text);
  if (!q) return false;
  return (shop.quickReplies ?? []).some((t) => {
    const items = typeof t === 'string' ? [t] : [t.label, t.text];
    return items.some((x) => normalize(x) === q);
  });
}

export function waitFor(shop, text, { awaitingSchool = false, env = {} } = {}) {
  if (awaitingSchool || (text && isMenuText(shop, text))) return 0;
  return delaySeconds(shop, env);
}
