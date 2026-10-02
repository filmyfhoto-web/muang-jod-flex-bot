import { matchIntent, findSchool, mentionsSupplies } from './matcher.js';
import { menuCard, faqCard, productCards, schoolLinkCard } from './flex.js';

function quick(shop, extra = []) {
  const labels = [...(shop.quickReplies ?? []), ...extra].slice(0, 13);
  if (!labels.length) return undefined;
  return {
    items: labels.map((l) => ({
      type: 'action',
      action: { type: 'message', label: l.slice(0, 20), text: l },
    })),
  };
}

const sendSchool = (shop, school) => ({
  messages: [schoolLinkCard(shop, school, shop.schoolSupplies.found.replace('{school}', school.name))],
  awaitingSchool: false,
});

const askSchool = (shop, text) => ({
  messages: [{ type: 'text', text }],
  awaitingSchool: true,
});

// Builds the LINE message array for an incoming text.
//
// `session.awaitingSchool` is true right after the customer was asked which
// school they are from, so a bare school name is read as the answer.
// Returns { messages, awaitingSchool } — the caller remembers the flag.
export function buildReply(text, shop, session = {}) {
  const cfg = shop.schoolSupplies;

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
      return { messages: [{ type: 'text', text: shop.handoff }], awaitingSchool: false, handoff: true };
    case 'products':
      return out(productCards(shop, intent.products, qr));
    case 'faq':
      return out(faqCard(shop, intent.faq, qr));
    case 'greeting':
      return out(menuCard(shop, shop.name, shop.greeting));
    default:
      return out(menuCard(shop, 'ขออภัยค่ะ', shop.fallback));
  }
}

export const welcomeMessage = (shop) => menuCard(shop, shop.name, shop.greeting);

// Shows the shop's own picture as the bot's avatar on each message (LINE `sender`).
// Without a public base URL the messages are returned untouched.
export function withSender(messages, baseUrl) {
  const base = String(baseUrl ?? '').trim().replace(/\/+$/, '');
  if (!/^https:\/\//.test(base)) return messages;
  return messages.map((m) => ({ ...m, sender: { iconUrl: `${base}/assets/icon.png` } }));
}
