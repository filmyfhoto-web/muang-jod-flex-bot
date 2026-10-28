// "Who does the customer want to talk to?"
//
// The bot shows a card with a "ติดต่อ <name>" button for each person. Once the customer taps
// one, the bot goes quiet for that customer and the chosen person is told through the OA.
import { normalize } from './matcher.js';
import { notifyCard } from './flex.js';

// What a person's button says and sends: the shop's own wording, so its picker and ours are one thing.
export const contactLabel = (person) => `คุยกับ${person.name}`;

export const people = (shop) => shop.contact?.people ?? [];

// The ways a customer may ask for one person (a button, or typed): "คุยกับหญิง", "ขอคุยกับหญิง",
// "คุยกับแอดมินหญิง", "แอดมินหญิง", "ติดต่อหญิง" — the whole message, nothing else.
const askedFor = (person) => {
  const n = person.name;
  return [`คุยกับ${n}`, `ขอคุยกับ${n}`, `คุยกับแอดมิน${n}`, `แอดมิน${n}`, `ติดต่อ${n}`].map(normalize);
};

export function findContact(text, shop) {
  const q = normalize(text);
  if (!q) return null;
  return people(shop).find((p) => askedFor(p).includes(q)) ?? null;
}

// The same person by the name the shop's settings use (matching ignores spaces and politeness).
export function findByName(name, shop) {
  const q = normalize(name);
  if (!q) return null;
  return people(shop).find((p) => normalize(p.name) === q) ?? null;
}

// The line that pops up on the admin's LINE (also the Flex card's alt text — what shows in the
// phone's banner).
export function notificationText({ customer, contact, said, link, reason }) {
  const head = contact ? `🔔 มีลูกค้าทักมา — ต้องการติดต่อ ${contact.name}` : `🔔 ${reason || 'มีลูกค้าทักมา — บอทตอบเรื่องนี้ไม่ได้'} รบกวนดูแชทด้วยค่ะ`;
  const lines = [head, `ลูกค้า: ${customer || 'ไม่ทราบชื่อ'}`];
  const preview = String(said ?? '').replace(/\s+/g, ' ').trim();
  if (preview) lines.push(`ข้อความ: ${preview.slice(0, 80)}`);
  lines.push(link ? `ตอบในแชท OA (อย่าตอบในห้องนี้): ${link}` : 'ตอบในแอป LINE Official Account ของร้าน (ไม่ใช่ห้องแชทนี้)');
  return lines.join('\n');
}

// The notification as a Flex card.
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
