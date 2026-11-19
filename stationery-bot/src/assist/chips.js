// The topic buttons under every reply: the shop's own topics (the shop calls them "old_chips", read from the same
// settings row 'line_bot'), so a customer sees one bot, not two. สั่งซื้อสินค้า · ส่งเอกสารโครงการ · คุยกับแอดมิน are on
// the rich menu and the menu picture, not on this bar: the shop's rule is only the hours and the location here.
const str = (v, n) => String(v ?? '').slice(0, n);

export const MENU_DOC_TEXT = 'ส่งเอกสารโครงการ';
export const DEFAULT_OLD_CHIPS = ['เวลาเปิด - ปิด', 'ที่ตั้งร้าน'];
export const DEFAULT_ADMIN_LABEL = 'คุยกับแอดมิน';

// → LINE quick-reply items (at most 13): the shop's topics only, or [] when there are none.
export function shopChips(bot) {
  const b = bot && typeof bot === 'object' && !Array.isArray(bot) ? bot : {};
  const old = (Array.isArray(b.old_chips) ? b.old_chips : DEFAULT_OLD_CHIPS).map((x) => str(x, 20).trim()).filter(Boolean).slice(0, 9);
  return old.map((x) => ({ type: 'action', action: { type: 'message', label: x, text: x } }));
}

// The texts those buttons send (a tap is a request of its own, not a customer typing line after line).
export function chipTexts(bot) {
  const b = bot && typeof bot === 'object' && !Array.isArray(bot) ? bot : {};
  return [MENU_DOC_TEXT, str(b.admin_label, 20).trim() || DEFAULT_ADMIN_LABEL, ...(Array.isArray(b.old_chips) ? b.old_chips : DEFAULT_OLD_CHIPS).map((x) => str(x, 20).trim())].filter(Boolean);
}
