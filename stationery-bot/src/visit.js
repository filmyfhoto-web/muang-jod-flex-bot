// "Visits": the first message a customer sends on a (Bangkok-time) day, or the first one after
// a long quiet gap, starts a new visit. A new visit is owed ONE "who do you want to talk to?"
// card; once it has been sent (or the customer has picked someone) it is not owed again until
// the next visit. In memory: a restart only means a returning customer is asked once more.
import { bangkokDay } from './holiday.js';

export const HOUR = 60 * 60 * 1000;

export function createVisitTracker({ now = () => Date.now(), gapMs = 4 * HOUR } = {}) {
  const seen = new Map(); // userId → { last: ms of the latest message, owed: card not sent yet this visit }
  return {
    // Call for every message the customer sends (before deciding what to answer).
    touch(id, gap = gapMs) {
      const t = now();
      const e = seen.get(id);
      if (!e || t - e.last >= gap || bangkokDay(new Date(e.last)).key !== bangkokDay(new Date(t)).key) {
        seen.set(id, { last: t, owed: true });
      } else {
        e.last = t;
      }
      if (seen.size > 5000) for (const [k, v] of seen) if (t - v.last > 2 * 24 * HOUR) seen.delete(k);
    },
    // Is the "who do you want to talk to?" card still owed to this customer in this visit?
    owed(id) {
      return seen.get(id)?.owed === true;
    },
    // The card was shown (or they chose someone): not again until the next visit.
    done(id) {
      const e = seen.get(id);
      if (e) e.owed = false;
    },
  };
}
