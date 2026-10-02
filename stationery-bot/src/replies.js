import { matchIntent } from './matcher.js';
import { menuCard, faqCard, productCards } from './flex.js';

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

// Builds the LINE message array for an incoming text.
export function buildReply(text, shop) {
  const intent = matchIntent(text, shop);
  const qr = quick(shop);
  switch (intent.type) {
    case 'handoff':
      return { messages: [{ type: 'text', text: shop.handoff }], handoff: true };
    case 'products':
      return { messages: [productCards(shop, intent.products, qr)] };
    case 'faq':
      return { messages: [faqCard(shop, intent.faq, qr)] };
    case 'greeting':
      return { messages: [menuCard(shop, shop.name, shop.greeting)] };
    default:
      return { messages: [menuCard(shop, 'ขออภัยค่ะ', shop.fallback)] };
  }
}

export const welcomeMessage = (shop) => menuCard(shop, shop.name, shop.greeting);
