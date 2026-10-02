import { matchIntent, findSchool, mentionsSupplies, isThanks } from './matcher.js';
import { menuCard, faqCard, productCards, schoolLinkCard, noteCard } from './flex.js';

// quickReplies entries are "text" or { label, text } — LINE button labels stop at
// 20 characters, so a long message can wear a shorter label.
export const topics = (shop) =>
  (shop.quickReplies ?? []).map((t) => (typeof t === 'string' ? { label: t, text: t } : t));

function quick(shop) {
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
  messages: [noteCard(shop, 'ask', text) ?? { type: 'text', text }],
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
  if (isThanks(text)) return thanksReply(shop);

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
  const out = (m) => ({ messages: [m], awaitingSchool: false });
  switch (intent.type) {
    case 'handoff':
      return {
        messages: [noteCard(shop, 'admin', shop.handoff) ?? { type: 'text', text: shop.handoff }],
        awaitingSchool: false,
        handoff: true,
      };
    case 'products':
      return out(productCards(shop, intent.products, qr));
    case 'faq':
      return out(faqCard(shop, intent.faq, qr));
    case 'greeting':
      return out(menuCard(shop, shop.name, shop.greeting, { banner: true }));
    default:
      return out(menuCard(shop, 'ขออภัยค่ะ', shop.fallback));
  }
}

export function thanksReply(shop) {
  const text = shop.thanks || 'ยินดีค่ะ สอบถามรายละเอียดเพิ่มเติม แจ้งได้เลยนะคะ';
  return { messages: [{ type: 'text', text, quickReply: quick(shop) }], awaitingSchool: false };
}

export const welcomeMessage = (shop) => menuCard(shop, shop.name, shop.greeting, { banner: true });

// Shows the shop's own picture as the bot's avatar on each message (LINE `sender`).
// Without a public base URL the messages are returned untouched.
export function iconUrlFor(baseUrl) {
  const base = String(baseUrl ?? '').trim().replace(/\/+$/, '');
  return /^https:\/\//.test(base) ? `${base}/assets/icon.png` : null;
}

export function withSender(messages, baseUrl) {
  const iconUrl = iconUrlFor(baseUrl);
  return iconUrl ? messages.map((m) => ({ ...m, sender: { iconUrl } })) : messages;
}
