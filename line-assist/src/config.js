// Turns the app_config row 'faq_bot' into the `shop` object the rest of the code reads.
//
// {
//   "mode": "off" | "admins" | "all",     // off: pass everything to Render · admins: only the listed people are
//                                         // answered here (the rest goes to Render) · all: everybody, Render unused
//   "admins": [{ "name": "หญิง", "userId": "U…" }, …],
//   "chatLinkTemplate": "https://chat.line.biz/…", "chatLinkLabel": "เปิดแอปตอบลูกค้า",
//   "quietMinutes": 20, "alertEveryHours": 5, "pictureReplyMinutes": 10, "burstSeconds": 6,
//   "greeting": false,                    // answer a plain hello too (the shop's own menu card already does)
//   "paused": false, "assets_base": "https://…/storage/v1/object/public/line-assist",
//   "content": { …keys of data.js to replace without a deploy… }
// }
import data from './data.js';

export const MODES = ['off', 'admins', 'all'];
export const modeOf = (row) => (row && MODES.includes(row.mode) ? row.mode : 'off');

const ID = /^U[0-9a-f]{32}$/i;
const CONTENT_KEYS = ['name', 'greeting', 'fallback', 'quickReplies', 'faq', 'products', 'productsEnabled', 'schoolSupplies', 'thanks', 'holiday', 'replyOnlyKnown', 'welcome', 'theme', 'adminPauseHours'];
const NUMBERS = ['quietMinutes', 'alertEveryHours', 'pictureReplyMinutes', 'burstSeconds'];

export function buildShop(row) {
  const c = row && typeof row === 'object' && !Array.isArray(row) ? row : {};
  const shop = JSON.parse(JSON.stringify(data));
  if (c.content && typeof c.content === 'object') {
    const sameKind = (x, y) => typeof x === typeof y && Array.isArray(x) === Array.isArray(y) && (x === null) === (y === null);
    for (const k of CONTENT_KEYS) if (c.content[k] !== undefined && sameKind(c.content[k], shop[k])) shop[k] = c.content[k];
  }
  shop.contact.people = (Array.isArray(c.admins) ? c.admins : [])
    .map((a) => ({ name: String(a?.name ?? '').trim().slice(0, 20), userId: String(a?.userId ?? '').trim() }))
    .filter((a) => a.name && ID.test(a.userId))
    .slice(0, 6);
  for (const k of NUMBERS) {
    const n = Number(c[k]);
    if (c[k] !== undefined && Number.isFinite(n) && n > 0) shop.contact[k] = n;
  }
  if (typeof c.chatLinkTemplate === 'string') shop.contact.chatLinkTemplate = c.chatLinkTemplate.trim();
  if (typeof c.chatLinkLabel === 'string' && c.chatLinkLabel.trim()) shop.contact.chatLinkLabel = c.chatLinkLabel.trim().slice(0, 20);
  if (c.notify === false) shop.contact.notify = false;
  shop.paused = c.paused === true;
  shop.engineGreeting = c.greeting === true;
  shop.assetBase = /^https:\/\//.test(String(c.assets_base ?? '')) ? String(c.assets_base).replace(/\/+$/, '') : '';
  return shop;
}
