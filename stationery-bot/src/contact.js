// "Who does the customer want to talk to?"
//
// The bot shows a card with a "ติดต่อ <name>" button for each person. Once the customer
// taps one, the bot goes quiet for that customer and the chosen person is notified
// through the OA. A customer who writes something the bot cannot answer, and has not
// chosen, is shown the card — and reminded once if they still do not choose.
// State is in memory: a restart just means the card may be shown again.
import { normalize } from './matcher.js';
import { notifyCard } from './flex.js';

export const contactLabel = (person) => `ติดต่อ ${person.name}`;

export const people = (shop) => shop.contact?.people ?? [];

// The exact text a "ติดต่อ <name>" button sends.
export function findContact(text, shop) {
  const q = normalize(text);
  if (!q) return null;
  return people(shop).find((p) => normalize(contactLabel(p)) === q) ?? null;
}

// The line that pops up on the admin's LINE.
export function notificationText({ customer, contact, said, link, reason }) {
  const head = contact ? `🔔 มีลูกค้าทักมา — ต้องการติดต่อ ${contact.name}` : `🔔 ${reason || 'มีลูกค้าทักมา — บอทตอบเรื่องนี้ไม่ได้'} รบกวนดูแชทด้วยค่ะ`;
  const lines = [head, `ลูกค้า: ${customer || 'ไม่ทราบชื่อ'}`];
  const preview = String(said ?? '').replace(/\s+/g, ' ').trim();
  if (preview) lines.push(`ข้อความ: ${preview.slice(0, 80)}`);
  lines.push(link ? `ตอบในแชท OA (อย่าตอบในห้องนี้): ${link}` : 'ตอบในแอป LINE Official Account ของร้าน (ไม่ใช่ห้องแชทนี้)');
  return lines.join('\n');
}

export function createContactState(now = () => Date.now()) {
  const chosen = new Map(); // userId → last message time (the quiet window slides)
  const told = new Map(); // key → { at: when it last fired, ms: its own cooldown }
  return {
    choose(id) {
      chosen.set(id, now());
    },
    // chosen someone and still within the quiet window? (every message from them extends it)
    isQuiet(id, windowMs) {
      const last = chosen.get(id);
      if (last === undefined) return false;
      if (now() - last > windowMs) {
        chosen.delete(id); // idle too long → back to BOT MODE
        return false;
      }
      chosen.set(id, now());
      return true;
    },
    // the same question as isQuiet, without sliding the window (for things that run on their own, not when the customer writes)
    peekQuiet(id, windowMs) {
      const last = chosen.get(id);
      return last !== undefined && now() - last <= windowMs;
    },
    wake(id) {
      chosen.delete(id);
    },
    // true when the admins should be told now (not more than once per cooldown for this key).
    // Every key keeps its own window, so a short-window check (e.g. "another thank-you for a
    // picture?") never wipes out a long-window one (e.g. "the admins were told 2 h ago").
    alertDue(id, cooldownMs) {
      const t = now();
      for (const [k, v] of told) if (t - v.at >= v.ms) told.delete(k);
      const e = told.get(id);
      if (e && t - e.at < cooldownMs) return false;
      told.set(id, { at: t, ms: cooldownMs });
      return true;
    },
  };
}

// The notification as a Flex card (its alt text — what shows in the phone's banner — is
// the plain text version).
export function notificationCard(shop, { customer, contact, said, link, reason }) {
  const altText = notificationText({ customer: customer?.name, contact, said, link, reason });
  return notifyCard(shop, {
    title: contact ? '🔔 มีลูกค้าทักมา' : `🔔 ${reason || 'มีลูกค้าทักมา — บอทตอบไม่ได้'}`,
    reason,
    customerName: customer?.name,
    customerPhoto: customer?.picture,
    contactName: contact?.name,
    contactPhoto: contact?.picture,
    said: String(said ?? '').replace(/\s+/g, ' ').trim().slice(0, 80),
    link,
    altText,
  });
}

// Photos of the people on the card, keyed by name: { หญิง: 'https://…', … }.
export async function contactPhotos(shop, getProfile) {
  const out = {};
  await Promise.all(
    people(shop).map(async (p) => {
      if (!p.userId) return;
      const { picture } = await getProfile(p.userId);
      if (picture) out[p.name] = picture;
    })
  );
  return out;
}
