import { matchIntent, findSchool, mentionsSupplies, isThanks } from './matcher.js';
import { menuCard, faqCard, productCards, schoolLinkCard, noteCard, contactCard } from './flex.js';

// quickReplies entries are "text" or { label, text } — LINE button labels stop at
// 20 characters, so a long message can wear a shorter label.
export const topics = (shop) =>
  (shop.quickReplies ?? []).map((t) => (typeof t === 'string' ? { label: t, text: t } : t));

export function quick(shop) {
  const items = topics(shop)
    .slice(0, 13)
    .map((t) => ({ type: 'action', action: { type: 'message', label: t.label.slice(0, 20), text: t.text } }));
  return items.length ? { items } : undefined;
}

const sendSchool = (shop, school) => ({
  messages: [schoolLinkCard(shop, school, shop.schoolSupplies.found.replace('{school}', school.name))],
  awaitingSchool: false,
});

const askSchool = (shop, text) => ({
  messages: [noteCard(shop, 'ask', 'อุปกรณ์การเรียน', text) ?? { type: 'text', text }],
  awaitingSchool: true,
});

// Builds the LINE message array for an incoming text.
//
// `session.awaitingSchool` is true right after the customer was asked which
// school they are from, so a bare school name is read as the answer.
// Returns { messages, awaitingSchool } — the caller remembers the flag.
export function buildReply(text, shop, session = {}) {
  const cfg = shop.schoolSupplies;

  // "ขอบคุณ" ends whatever was in progress, including a pending "which school?"
  if (isThanks(text, (shop.contact?.people ?? []).map((p) => p.name))) return thanksReply(shop);

  if (cfg) {
    const school = findSchool(text, cfg.schools);
    if (school && (session.awaitingSchool || mentionsSupplies(text, cfg))) return sendSchool(shop, school);
    if (mentionsSupplies(text, cfg)) return askSchool(shop, cfg.ask);
    if (session.awaitingSchool) {
      const other = matchIntent(text, shop);
      if (other.type === 'fallback') return askSchool(shop, cfg.notFound);
    }
  }

  const intent = matchIntent(text, shop);
  const qr = quick(shop);
  if (intent.type === 'off') return { messages: [], awaitingSchool: false, silent: true, quiet: true };
  if (intent.type === 'ask') return { messages: [], awaitingSchool: false, needsPhotos: true }; // the contact card, no alert
  if (intent.type === 'order') return { messages: [], awaitingSchool: false, needsPhotos: true, askText: shop.contact.orderAsk ?? shop.contact.ask };
  if (intent.type === 'contact') return { messages: [contactCard(shop, shop.contact.ask)], awaitingSchool: false, needsPhotos: true };
  const out = (m) => ({ messages: [m], awaitingSchool: false });
  switch (intent.type) {
    case 'products':
      return out(productCards(shop, intent.products, qr));
    case 'faq':
      return out(faqCard(shop, intent.faq, qr));
    case 'greeting':
      return { ...out(menuCard(shop, shop.name, shop.greeting, { image: 'staff' })) };
    default:
      // Only answer what the shop has set up. Anything else is left for the admin to
      // see and answer — set "replyOnlyKnown": false in shop.json to get the old
      // "sorry, I don't understand" card back.
      if (shop.replyOnlyKnown !== false) return { messages: [], awaitingSchool: false, silent: true };
      return out(menuCard(shop, 'ขออภัยค่ะ', shop.fallback, { image: 'admin' }));
  }
}

export function thanksReply(shop) {
  const text = shop.thanks || 'ยินดีค่ะ หากต้องการสอบถามรายละเอียดเพิ่มเติม แจ้งได้เลยนะคะ';
  const qr = quick(shop);
  return { messages: [noteCard(shop, 'staff', shop.name, text, qr) ?? { type: 'text', text, quickReply: qr }], awaitingSchool: false };
}

export const welcomeMessage = (shop) => menuCard(shop, shop.name, shop.greeting, { image: 'staff' });

// Shows the shop's own picture as the bot's avatar on each message (LINE `sender`).
// Without a public base URL the messages are returned untouched.
export function iconUrlFor(baseUrl) {
  const base = String(baseUrl ?? '').trim().replace(/\/+$/, '');
  return /^https:\/\//.test(base) ? `${base}/assets/icon.png` : null;
}

// Every reply wears the sender icon, and the last one carries the topic buttons (LINE shows
// quick replies only under the newest message, so they go on whatever the bot sent last).
export function withSender(messages, baseUrl, quickReply) {
  const iconUrl = iconUrlFor(baseUrl);
  const out = iconUrl ? messages.map((m) => ({ ...m, sender: { iconUrl } })) : messages.map((m) => ({ ...m }));
  const last = out[out.length - 1];
  if (last && quickReply && !last.quickReply) last.quickReply = quickReply;
  return out;
}

