// "Who does the customer want to talk to?"
//
// The bot shows a card with a "ติดต่อ <name>" button for each person. Once the customer
// taps one, the bot goes quiet for that customer and the chosen person is notified
// through the OA. A customer who writes something the bot cannot answer, and has not
// chosen, is shown the card — and reminded once if they still do not choose.
// State is in memory: a restart just means the card may be shown again.
import { normalize } from './matcher.js';

export const contactLabel = (person) => `ติดต่อ ${person.name}`;

export const people = (shop) => shop.contact?.people ?? [];

// The exact text a "ติดต่อ <name>" button sends.
export function findContact(text, shop) {
  const q = normalize(text);
  if (!q) return null;
  return people(shop).find((p) => normalize(contactLabel(p)) === q) ?? null;
}

// The line that pops up on the admin's LINE.
export function notificationText({ customer, contact, said }) {
  const head = contact ? `🔔 มีลูกค้าทักมา — ต้องการติดต่อ ${contact.name}` : '🔔 มีลูกค้าทักมา แต่ยังไม่ได้เลือกว่าจะติดต่อใคร';
  const lines = [head, `ลูกค้า: ${customer || 'ไม่ทราบชื่อ'}`];
  const preview = String(said ?? '').replace(/\s+/g, ' ').trim();
  if (preview) lines.push(`ข้อความ: ${preview.slice(0, 80)}`);
  lines.push('ตอบได้ในแชท OA เลยค่ะ');
  return lines.join('\n');
}

export function createContactState(now = () => Date.now()) {
  const m = new Map(); // userId → { status: 'prompted' | 'chosen', at, last, reminded }
  const alive = (id, windowMs) => {
    const e = m.get(id);
    if (e && now() - e.last > windowMs) m.delete(id); // idle too long → back to BOT MODE
    return m.get(id);
  };
  return {
    choose(id, windowMs) {
      alive(id, windowMs);
      m.set(id, { status: 'chosen', at: now(), last: now(), reminded: true });
    },
    // chosen someone and still within the quiet window? (every message from them extends it)
    isQuiet(id, windowMs) {
      const e = alive(id, windowMs);
      if (e?.status !== 'chosen') return false;
      e.last = now();
      return true;
    },
    wake(id) {
      m.delete(id);
    },
    // → 'card' (first time) | 'remind' (still not chosen after a pause) | 'silent'
    onUnknown(id, { windowMs, gapMs }) {
      const e = alive(id, windowMs);
      const t = now();
      if (!e) {
        m.set(id, { status: 'prompted', at: t, last: t, reminded: false });
        return 'card';
      }
      e.last = t;
      if (e.status === 'prompted' && !e.reminded && t - e.at >= gapMs) {
        e.reminded = true;
        return 'remind';
      }
      return 'silent';
    },
    // timer: true once if the customer still has not chosen
    dueReminder(id) {
      const e = m.get(id);
      if (e?.status === 'prompted' && !e.reminded) {
        e.reminded = true;
        return true;
      }
      return false;
    },
    stillUndecided(id) {
      return m.get(id)?.status === 'prompted';
    },
  };
}
