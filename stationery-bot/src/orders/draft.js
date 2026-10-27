// Orders typed in the chat, before a person has checked them: what a message means for the drafts, the lines a draft holds,
// and the merge that keeps one customer's messages in one draft. Pure functions — no database, no LINE.
//
//   classifyText(text, { open })  → { kind, items, day, notes }
//     list    two or more lines of items (the same rules as the back office's paste box, picklist.js)
//     single  one line that says its quantity, next to a clear ordering word or unit
//     follow  items sent while the customer has an open draft
//     remark  other text sent while a draft is open: kept in its note, may give the day needed
//     ignore  anything else (greetings, questions, thanks): nothing is stored and no draft is made
import { randomUUID } from 'node:crypto';
import { parsePickList, parseOrderText, normUnit } from '../picklist.js';
import { pick } from '../catalog.js';
import { looksLikeOrder } from '../chatai.js';

const clip = (s, n) => {
  const t = String(s ?? '');
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
};
const key = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, '');
const positive = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export function classifyText(text, { open = false } = {}) {
  const strict = parsePickList(text);
  if (strict) return { kind: 'list', items: strict.items, day: strict.day, notes: strict.notes };
  const loose = parseOrderText(text);
  const strong = loose.items.filter((i) => i.strong);
  if (!open) {
    if (strong.length >= 1 && looksLikeOrder(text)) return { kind: 'single', items: strong, day: loose.day, notes: loose.notes };
    return { kind: 'ignore', items: [], day: loose.day, notes: [] };
  }
  if (strong.length) return { kind: 'follow', items: strong, day: loose.day, notes: loose.notes };
  return { kind: 'remark', items: [], day: loose.day, notes: [text] };
}

// Parsed lines → the draft's item rows. A line is linked to a product only when one product is clearly the one (catalog.js);
// anything else keeps the customer's words, is marked "review" and lists the closest products for the staff. No price is ever
// set here: a linked line takes the product's price when the order is confirmed in the database, a free line needs a price
// typed by staff.
export function itemsFromLines(lines, products = [], { src = 'chat', match = {} } = {}) {
  return lines.map((ln) => {
    const { product, near } = pick(products, ln.name, match);
    const said = clip(ln.name, 200);
    return {
      id: randomUUID(),
      raw: clip(ln.raw ?? `${ln.name} ${ln.qty}${ln.unit ? ' ' + ln.unit : ''}`, 300),
      name: product ? product.name : said,
      said: product && key(said) !== key(product.name) ? said : null,
      qty: Number(ln.qty),
      unit: ln.unit ? normUnit(ln.unit) : (product?.unit ?? ''),
      product_id: product?.id ?? null,
      product_code: product?.code ?? null,
      product_name: product?.name ?? null,
      product_unit: product?.unit ?? null,
      product_price: product ? positive(product.price) : null,
      price: null,
      staff_ok: false,
      status: product ? 'ok' : 'review',
      suggestions: near.slice(0, 3).map((p) => ({ id: p.id, name: p.name, code: p.code ?? null, unit: p.unit ?? null, price: positive(p.price) })),
      removed: false,
      src,
    };
  });
}

const itemKey = (x) => `${key(x.name)}|${Number(x.qty)}|${normUnit(x.unit ?? '')}`;

// Adds the new lines that are not in the draft yet. A line the draft already has — or one the staff took out — is not added
// again, so a repeated list changes nothing.
export function mergeItems(old = [], fresh = [], max = 200) {
  const seen = new Set(old.map(itemKey));
  const add = [];
  for (const x of fresh) {
    if (old.length + add.length >= max) break;
    if (seen.has(itemKey(x))) continue;
    seen.add(itemKey(x));
    add.push(x);
  }
  return { items: [...old, ...add], added: add.length };
}

// The draft's note keeps what the customer wrote, message after message (newest last), within the database's limit.
export function noteAppend(note, text, cap = 1000) {
  const add = String(text ?? '').trim();
  if (!add) return note ?? null;
  if (!note) return clip(add, cap);
  if (note.includes(add)) return note;
  const joined = `${note}\n———\n${add}`;
  return joined.length <= cap ? joined : note;
}

export function summarize(items = []) {
  const live = items.filter((x) => !x.removed);
  return {
    lines: live.length,
    linked: live.filter((x) => x.product_id).length,
    review: live.filter((x) => !x.product_id && !x.staff_ok).length,
    removed: items.length - live.length,
  };
}
