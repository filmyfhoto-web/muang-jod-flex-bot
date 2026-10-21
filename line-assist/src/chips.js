// The topic buttons under every reply. They are the SAME buttons the shop's own line-bot shows under its
// menu card (read from the same settings row 'line_bot'), so a customer sees one bot, not two:
//   สั่งซื้อสินค้า (opens the web shop) · ส่งเอกสารโครงการ · คุยกับแอดมิน · then the four topics the
//   old bot used to answer (the shop calls them "old_chips").
// Icons are the shop's own pictures (served by its line-assets function).
const str = (v, n) => String(v ?? '').slice(0, n);

export const MENU_DOC_TEXT = 'ส่งเอกสารโครงการ';
export const DEFAULT_OLD_CHIPS = ['เวลาเปิดร้าน', 'สั่งของ', 'อุปกรณ์การเรียน 2-69', 'ที่ตั้งร้าน'];
export const DEFAULT_ADMIN_LABEL = 'คุยกับแอดมิน';

// → LINE quick-reply items (at most 13), or [] when there is nothing to show.
export function shopChips(bot, assets) {
  const b = bot && typeof bot === 'object' && !Array.isArray(bot) ? bot : {};
  const A = String(assets ?? '').trim().replace(/\/+$/, '');
  const adminLabel = str(b.admin_label, 20).trim() || DEFAULT_ADMIN_LABEL;
  const orderUrl = (Array.isArray(b.links) && b.links[0] && /^https?:\/\//.test(String(b.links[0].url ?? '')) ? String(b.links[0].url) : '') || 'https://www.nattagroup.com';
  const old = (Array.isArray(b.old_chips) ? b.old_chips : DEFAULT_OLD_CHIPS).map((x) => str(x, 20).trim()).filter(Boolean).slice(0, 9);

  const doc = { type: 'action', action: { type: 'message', label: MENU_DOC_TEXT, text: MENU_DOC_TEXT } };
  const cart = { type: 'action', action: { type: 'uri', label: 'สั่งซื้อสินค้า', uri: orderUrl } };
  const chat = { type: 'action', action: { type: 'message', label: adminLabel, text: adminLabel } };
  if (A) {
    doc.imageUrl = `${A}/i/doc.png`;
    cart.imageUrl = `${A}/i/cart.png`;
    chat.imageUrl = `${A}/i/chat.png`;
  }
  const topics = old.map((x) => ({ type: 'action', action: { type: 'message', label: x, text: x } }));
  // menu_style 'card' shows only the document button and the topics; 'chips' / 'both' (the shop's choice) add the two big ones
  const items = b.menu_style === 'card' ? [doc, ...topics] : [cart, doc, chat, ...topics];
  return items.slice(0, 13);
}

// The texts those buttons send (a tap is a request of its own, not a customer typing line after line).
export function chipTexts(bot) {
  const b = bot && typeof bot === 'object' && !Array.isArray(bot) ? bot : {};
  return [MENU_DOC_TEXT, str(b.admin_label, 20).trim() || DEFAULT_ADMIN_LABEL, ...(Array.isArray(b.old_chips) ? b.old_chips : DEFAULT_OLD_CHIPS).map((x) => str(x, 20).trim())].filter(Boolean);
}
