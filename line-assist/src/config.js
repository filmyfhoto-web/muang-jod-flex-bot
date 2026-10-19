// Turns the shop's settings rows into the `shop` object the rest of the code reads.
//
// Two rows are read:
//   'line_bot'  the shop's own bot settings (written by its settings page): the people customers can ask for
//               (names + what they look after), how long the bot stays quiet after a choice (silence_hours),
//               the buttons under replies. We follow them, so the two bots can never disagree.
//   'faq_bot'   ours:
//   {
//     "mode": "off" | "admins" | "all",   // off: pass everything to the old bot · admins: only the listed people are
//                                         // answered here (the rest goes to the old bot) · all: everybody
//     "admins": [{ "name": "หญิง", "userId": "U…" }, …],   // the same names as in line_bot; this is where their LINE ids live
//     "chatLinkTemplate": "https://chat.line.biz/…", "chatLinkLabel": "เปิดแอปตอบลูกค้า",
//     "quietMinutes": 1440, "alertEveryHours": 5, "pictureReplyMinutes": 10, "burstSeconds": 6,
//     "greeting": false,                  // answer a plain hello too (the shop's own menu card already does)
//     "senderIcon": false,                // show the shop picture as the sender's avatar on our messages
//     "paused": false, "assets_base": "https://…/line-assist/assets",
//     "content": { …keys of data.js to replace without a deploy… }
//   }
import data from './data.js';
import { normalize } from './matcher.js';
import { shopChips, chipTexts, DEFAULT_ADMIN_LABEL } from './chips.js';

export const MODES = ['off', 'admins', 'all'];
export const modeOf = (row) => (row && MODES.includes(row.mode) ? row.mode : 'off');

const ID = /^U[0-9a-f]{32}$/i;
const CONTENT_KEYS = ['name', 'greeting', 'fallback', 'quickReplies', 'faq', 'products', 'productsEnabled', 'schoolSupplies', 'thanks', 'holiday', 'replyOnlyKnown', 'welcome', 'theme', 'adminPauseHours'];
const NUMBERS = ['quietMinutes', 'alertEveryHours', 'pictureReplyMinutes', 'burstSeconds'];

// What the shop's bot uses when its settings row names nobody.
export const DEFAULT_ADMINS = [
  { name: 'เจ้ปิ่น', note: 'ร้านเครื่องเขียน' },
  { name: 'หญิง', note: 'ร้านเครื่องเขียน' },
  { name: 'ฟิล์ม', note: 'ถ่ายรูป · ถ่ายเอกสาร · ไวนิล' },
];

const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);

export function buildShop(row, { bot = null, iconsBase = '' } = {}) {
  const c = isObj(row) ? row : {};
  const b = isObj(bot) ? bot : {};
  const shop = JSON.parse(JSON.stringify(data));
  if (isObj(c.content)) {
    const sameKind = (x, y) => typeof x === typeof y && Array.isArray(x) === Array.isArray(y) && (x === null) === (y === null);
    for (const k of CONTENT_KEYS) if (c.content[k] !== undefined && sameKind(c.content[k], shop[k])) shop[k] = c.content[k];
  }

  // The people: names and notes as the shop's bot has them; their LINE ids from our row. Someone without a
  // valid id cannot be told, so is left out rather than offered and then silently ignored.
  const named = (Array.isArray(b.admins) && b.admins.length ? b.admins : DEFAULT_ADMINS)
    .map((a) => ({ name: String(a?.name ?? '').trim().slice(0, 20), note: String(a?.note ?? '').trim().slice(0, 40) }))
    .filter((a) => a.name);
  const mine = (Array.isArray(c.admins) ? c.admins : [])
    .map((a) => ({ name: String(a?.name ?? '').trim().slice(0, 20), note: String(a?.note ?? '').trim().slice(0, 40), userId: String(a?.userId ?? '').trim() }))
    .filter((a) => a.name && ID.test(a.userId));
  const people = [];
  for (const n of named) {
    const hit = mine.find((m) => normalize(m.name) === normalize(n.name));
    if (hit) people.push({ name: n.name, note: n.note || hit.note, userId: hit.userId });
  }
  shop.contact.people = people.slice(0, 6); // someone only our row knows about is not offered: the shop's list decides who exists

  // quiet after a choice: the shop's silence_hours (24 by default) unless we are told otherwise
  const silence = Math.round(Number(b.silence_hours));
  shop.contact.quietMinutes = (silence >= 1 && silence <= 168 ? silence : 24) * 60;
  for (const k of NUMBERS) {
    const n = Number(c[k]);
    if (c[k] !== undefined && Number.isFinite(n) && n > 0) shop.contact[k] = n;
  }
  if (typeof c.chatLinkTemplate === 'string') shop.contact.chatLinkTemplate = c.chatLinkTemplate.trim();
  if (typeof c.chatLinkLabel === 'string' && c.chatLinkLabel.trim()) shop.contact.chatLinkLabel = c.chatLinkLabel.trim().slice(0, 20);
  if (c.notify === false) shop.contact.notify = false;

  // the shop's own "talk to the admin" button counts as asking for a person, and its buttons are ours too
  const adminLabel = String(b.admin_label ?? '').trim() || DEFAULT_ADMIN_LABEL;
  shop.contact.buttonAliases = [...new Set([...(shop.contact.buttonAliases ?? []), adminLabel])];
  shop.chips = shopChips(b, iconsBase);
  shop.menuTexts = chipTexts(b);

  shop.paused = c.paused === true;
  shop.engineGreeting = c.greeting === true;
  shop.senderIcon = c.senderIcon === true;
  shop.assetBase = /^https:\/\//.test(String(c.assets_base ?? '')) ? String(c.assets_base).replace(/\/+$/, '') : '';
  return shop;
}
