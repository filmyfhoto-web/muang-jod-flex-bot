// The shop's own question → answer rules, the ones the owner edits in the Reply Studio.
//
//   { id, name, enabled, match: 'contains' | 'exact', keywords: [...], replies: [...], quick }
//
// Rules are checked top to bottom and the first one that matches answers (see findRule in matcher.js).
// A reply is one of:
//   card     a titled card: { title, text, image?: 'staff'|'admin'|'school'|'order'|'ask', button?: { label, url } }
//   text     plain text
//   image    a picture by https address
//   sticker  a LINE sticker by package and sticker number
//   flex     a hand-made Flex Message (JSON from LINE's Flex Message Simulator)
//   silent   say nothing: the topic is left for the admins to answer by hand
// Everything is cleaned here, so a rule saved from anywhere can never put something LINE would refuse
// (or something unsafe) into a reply.
import { faqCard } from './flex.js';
import { normalize } from './matcher.js';

export const REPLY_TYPES = ['card', 'text', 'image', 'sticker', 'flex', 'silent'];
export const PICTURE_NAMES = ['staff', 'admin', 'school', 'order', 'ask'];
export const MAX_RULES = 100;
export const MAX_KEYWORDS = 40;
export const MAX_REPLIES = 5; // LINE takes at most five messages per reply
const FLEX_MAX = 30_000;

const isObj = (x) => Boolean(x) && typeof x === 'object' && !Array.isArray(x);
const str = (v, n) => String(v ?? '').trim().slice(0, n);
const https = (v, n = 1000) => {
  const s = str(v, n);
  return /^https:\/\/[^\s<>"']{3,}$/i.test(s) ? s : '';
};

// → a clean reply, or null when it is unusable.
export function cleanReply(r) {
  if (!isObj(r)) return null;
  switch (r.type) {
    case 'card': {
      const text = str(r.text, 2000);
      if (!text) return null;
      const url = https(r.button?.url);
      return {
        type: 'card',
        title: str(r.title, 40),
        text,
        image: PICTURE_NAMES.includes(r.image) ? r.image : '',
        button: url ? { label: str(r.button?.label, 20) || 'เปิดลิงก์', url } : null,
      };
    }
    case 'text': {
      const text = str(r.text, 5000);
      return text ? { type: 'text', text } : null;
    }
    case 'image': {
      const url = https(r.url);
      if (!url) return null;
      const preview = https(r.previewUrl);
      return { type: 'image', url, previewUrl: preview && preview !== url ? preview : '' };
    }
    case 'sticker': {
      const ok = (v) => /^\d{1,12}$/.test(String(v ?? '').trim());
      if (!ok(r.packageId) || !ok(r.stickerId)) return null;
      return { type: 'sticker', packageId: String(r.packageId).trim(), stickerId: String(r.stickerId).trim() };
    }
    case 'flex': {
      const c = r.contents;
      if (!isObj(c) || !['bubble', 'carousel'].includes(c.type)) return null;
      let json;
      try {
        json = JSON.stringify(c);
      } catch {
        return null;
      }
      if (json.length > FLEX_MAX) return null;
      return { type: 'flex', altText: str(r.altText, 400) || 'ข้อความจากร้าน', contents: JSON.parse(json) };
    }
    case 'silent':
      return { type: 'silent' };
    default:
      return null;
  }
}

// → a clean rule. A rule with no keywords or no usable reply is kept (the owner may still be writing it) but never answers.
export function cleanRule(r, index = 0) {
  if (!isObj(r)) return null;
  const replies = (Array.isArray(r.replies) ? r.replies : r.reply ? [r.reply] : []).map(cleanReply).filter(Boolean).slice(0, MAX_REPLIES);
  const seen = new Set();
  const keywords = [];
  for (const k of Array.isArray(r.keywords) ? r.keywords : []) {
    const kw = str(k, 60);
    const n = normalize(kw);
    if (!kw || !n || seen.has(n)) continue;
    seen.add(n);
    keywords.push(kw);
    if (keywords.length >= MAX_KEYWORDS) break;
  }
  return {
    id: String(r.id ?? '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) || `r${index + 1}`,
    name: str(r.name, 60) || `กฎ ${index + 1}`,
    enabled: r.enabled !== false,
    match: r.match === 'exact' ? 'exact' : 'contains',
    keywords,
    replies: replies.some((x) => x.type === 'silent') ? [{ type: 'silent' }] : replies,
    quick: r.quick !== false,
  };
}

export function cleanRules(raw) {
  const out = [];
  const ids = new Set();
  for (const [i, r] of (Array.isArray(raw) ? raw : []).slice(0, MAX_RULES).entries()) {
    const rule = cleanRule(r, i);
    if (!rule) continue;
    let id = rule.id;
    for (let n = 2; ids.has(id); n++) id = `${rule.id.slice(0, 36)}-${n}`;
    ids.add(id);
    out.push({ ...rule, id });
  }
  return out;
}

// The shipped question list (data.js "faq") written as rules: what the owner sees in the Studio the first time.
// A topic switched off there ("enabled": false) is a rule that stays silent.
export function rulesFromFaq(faq) {
  return cleanRules(
    (Array.isArray(faq) ? faq : []).map((f, i) => ({
      id: `faq-${i + 1}`,
      name: f?.label,
      match: 'contains',
      keywords: f?.keywords,
      replies: [
        f?.enabled === false
          ? { type: 'silent' }
          : { type: 'card', title: f?.label, text: f?.answer, image: f?.image, button: f?.link?.url ? { label: f.link.label, url: f.link.url } : null },
      ],
    }))
  );
}

// → the LINE messages a rule sends (at most five). Never throws.
export function ruleMessages(shop, rule) {
  const out = [];
  for (const r of rule?.replies ?? []) {
    try {
      if (r.type === 'card') out.push(faqCard(shop, { label: r.title || shop.name, answer: r.text, link: r.button ?? undefined, image: r.image || undefined }));
      else if (r.type === 'text') out.push({ type: 'text', text: r.text });
      else if (r.type === 'image') out.push({ type: 'image', originalContentUrl: r.url, previewImageUrl: r.previewUrl || r.url });
      else if (r.type === 'sticker') out.push({ type: 'sticker', packageId: r.packageId, stickerId: r.stickerId });
      else if (r.type === 'flex') out.push({ type: 'flex', altText: r.altText || 'ข้อความจากร้าน', contents: r.contents });
    } catch {
      /* a reply that cannot be built is left out */
    }
  }
  return out.slice(0, MAX_REPLIES);
}
