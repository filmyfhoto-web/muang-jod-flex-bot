import { matchIntent, findSchool, mentionsSupplies, isThanks, findAdminTopic } from './matcher.js';
import { menuCard, faqCard, productCards, schoolLinkCard, noteCard, adminTopicsCard, adminRouteCard } from './flex.js';

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
  messages: [noteCard(shop, 'ask', 'อุปกรณ์การเรียน', text) ?? { type: 'text', text }],
  awaitingSchool: true,
});

// The generic "an admin will answer" reply, used when no admin routing is configured
// or the chosen admin has no LINE link yet.
const genericHandoff = (shop) => ({
  messages: [noteCard(shop, 'admin', 'คุยกับแอดมิน', shop.handoff) ?? { type: 'text', text: shop.handoff }],
  awaitingSchool: false,
  handoff: true,
  quiet: true,
});

// Subject chosen → the right admin's LINE. After this the bot leaves the chat alone.
function routeToAdmin(shop, topic) {
  const admin = shop.adminRouting.admins[topic.admin];
  if (!admin?.link) return genericHandoff(shop);
  const message = (shop.adminRouting.routed || 'เรื่อง "{topic}" ติดต่อ{admin}ได้ที่ปุ่มด้านล่างเลยค่ะ')
    .replace('{topic}', topic.label)
    .replace('{admin}', admin.name);
  return { messages: [adminRouteCard(shop, admin, message)], awaitingSchool: false, quiet: true };
}

// Builds the LINE message array for an incoming text.
//
// `session.awaitingSchool` is true right after the customer was asked which
// school they are from, so a bare school name is read as the answer.
// Returns { messages, awaitingSchool } — the caller remembers the flag.
export function buildReply(text, shop, session = {}) {
  const cfg = shop.schoolSupplies;
  const routing = shop.adminRouting;

  // "ขอบคุณ" ends whatever was in progress, including a pending "which school?"
  if (isThanks(text)) return thanksReply(shop);

  if (routing) {
    const topic = findAdminTopic(text, routing, { loose: Boolean(session.awaitingAdmin) });
    if (topic) return routeToAdmin(shop, topic);
  }

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
      // With routing set up, first ask what it is about; the admin comes after.
      if (routing) return { messages: [adminTopicsCard(shop, routing)], awaitingSchool: false, awaitingAdmin: true };
      return genericHandoff(shop);
    case 'products':
      return out(productCards(shop, intent.products, qr));
    case 'faq':
      return out(faqCard(shop, intent.faq, qr));
    case 'greeting':
      return out(menuCard(shop, shop.name, shop.greeting, { image: 'staff' }));
    default:
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

export function withSender(messages, baseUrl) {
  const iconUrl = iconUrlFor(baseUrl);
  return iconUrl ? messages.map((m) => ({ ...m, sender: { iconUrl } })) : messages;
}
