import { matchIntent } from './matcher.js';

const baht = (n) => `${Number(n).toLocaleString('th-TH')} บาท`;

export function productText(p) {
  const lines = [
    `📦 ${p.name}`,
    `ราคา ${baht(p.price)}/${p.unit ?? 'ชิ้น'}`,
    p.bulk ? `ราคาซื้อจำนวนมาก: ${p.bulk}` : null,
    p.inStock === false ? 'สถานะ: สินค้าหมดชั่วคราวค่ะ 🙏 พิมพ์ "แอดมิน" เพื่อสอบถามวันเข้าสินค้า' : 'สถานะ: มีสินค้าพร้อมส่งค่ะ ✅',
  ];
  return lines.filter(Boolean).join('\n');
}

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
    case 'products': {
      const shown = intent.products.slice(0, 5);
      const body = shown.map(productText).join('\n\n');
      const more = intent.products.length > shown.length ? '\n\nมีสินค้าอื่นที่ตรงกันอีก พิมพ์ชื่อให้ละเอียดขึ้นได้ค่ะ' : '';
      return { messages: [{ type: 'text', text: body + more, quickReply: qr }] };
    }
    case 'faq':
      return { messages: [{ type: 'text', text: intent.faq.answer, quickReply: qr }] };
    case 'greeting':
      return { messages: [{ type: 'text', text: shop.greeting, quickReply: qr }] };
    default:
      return { messages: [{ type: 'text', text: shop.fallback, quickReply: quick(shop, ['แอดมิน']) }] };
  }
}
