// Weekly closing day. On that day the first message a customer sends gets the
// shop's "we are closed today" notice (once per customer per day, so a chat is
// not stamped with it on every line). Days are counted in Bangkok time.

const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const FALLBACK_TEXT =
  'วันนี้เป็นวันหยุดค่ะ ร้านหยุดทุกวันเสาร์\nขออภัยในความไม่สะดวก แอดมินจะตอบกลับให้เร็วที่สุดค่ะ';

// → { weekday: 0 (Sun) … 6 (Sat), key: '2026-10-03' } for the given instant in Bangkok.
export function bangkokDay(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(now);
  const get = (t) => parts.find((p) => p.type === t).value;
  return {
    weekday: DAY_NAMES.indexOf(get('weekday').slice(0, 3).toLowerCase()),
    key: `${get('year')}-${get('month')}-${get('day')}`,
  };
}

// shop.holiday = { weekday: 6, message: "…" }   (6 = Saturday; omit to switch off)
export function holidayNotice(shop, now = new Date()) {
  const h = shop.holiday;
  if (!h || h.weekday === undefined || h.weekday === null) return null;
  const day = bangkokDay(now);
  if (day.weekday !== Number(h.weekday)) return null;
  return { key: day.key, message: { type: 'text', text: h.message || FALLBACK_TEXT } };
}

// Remembers who has already been told today. In memory: a restart just means the
// notice may be sent once more.
export function createNoticeTracker() {
  let day = '';
  const told = new Set();
  return {
    // true the first time this customer is seen on this day
    firstToday(userId, key) {
      if (day !== key) {
        day = key;
        told.clear();
      }
      if (told.has(userId)) return false;
      told.add(userId);
      return true;
    },
  };
}

// Puts the notice in front of `messages` when it applies.
//  - skip: e.g. a thank-you, which ends the chat and needs no apology
export function applyHoliday(messages, { shop, userId, tracker, now = new Date(), skip = false }) {
  if (skip) return messages;
  const notice = holidayNotice(shop, now);
  if (!notice || !tracker.firstToday(userId, notice.key)) return messages;
  return [notice.message, ...messages].slice(0, 5);
}
