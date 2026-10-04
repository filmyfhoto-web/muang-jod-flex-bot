// Rule-based matching. Thai has no word spaces, so everything is substring
// matching on a normalised string rather than tokenising.

const POLITE = /(?:ค่ะ|คะ|ครับ|คับ|จ้า|จ้ะ|นะ|น๊า|หน่อย|ด้วย|ที)+$/g;

export function normalize(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(POLITE, '');
}

const GREETING = /^(?:สวัสดี|หวัดดี|hello|hi|ดีจ้า|ดีค่ะ|ดีครับ|เมนู|menu|บอท|เริ่มใหม่)/;
const HANDOFF = /แอดมิน|admin|คุยกับคน|เจ้าของร้าน|พนักงาน/;

// Longest alias contained in the message wins, so "กระดาษa4" picks the A4
// entry over a shorter generic alias like "กระดาษ" on another item.
function findByNames(text, items) {
  const q = normalize(text);
  if (!q) return [];
  const scored = [];
  for (const p of items) {
    const names = [p.name, ...(p.aliases ?? [])].map(normalize).filter(Boolean);
    const hit = names.filter((n) => q.includes(n)).sort((a, b) => b.length - a.length)[0];
    if (hit) scored.push({ p, score: hit.length });
  }
  const best = Math.max(0, ...scored.map((s) => s.score));
  return scored.filter((s) => s.score === best).map((s) => s.p);
}

export const findProducts = findByNames;

// Customers write a school many ways: "โรงเรียนบ้านกอก", "ร.ร.บ้านกอก", "รร บ้านกอก",
// "บ้านกอก", "กอก". Compare on a key with the school prefix, the word "บ้าน", dots,
// spaces and politeness removed. "รร" is only a prefix at the start or after a
// space — "บรรณโศภิษฐ์" has one inside and must keep it.
const schoolKey = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/โรงเรียน/g, '')
    .replace(/(^|\s)ร\s*\.?\s*ร\s*\.?/g, '$1')
    .replace(/บ้าน/g, '')
    .replace(/[\s.]+/g, '')
    .replace(POLITE, '');

// Order of trust: the key is exactly the school's → the school's key is inside the
// message ("อยู่โรงเรียนบ้านกอกค่ะ"; longest wins so กอกจูน never lands on กอก) → the
// message is a distinctive part of one school's key ("ไตรมิตร"). Anything that
// fits two schools is ambiguous and returns null rather than guessing.
export function findSchool(text, schools) {
  const q = schoolKey(text);
  if (!q) return null;
  const cands = (schools ?? []).map((sc) => ({
    sc,
    keys: [sc.name, ...(sc.aliases ?? [])].map(schoolKey).filter(Boolean),
  }));
  const only = (list) => (list.length === 1 ? list[0].sc : null);

  const exact = cands.filter((c) => c.keys.includes(q));
  if (exact.length) return only(exact);

  const inside = cands
    .map((c) => ({ ...c, len: Math.max(0, ...c.keys.filter((k) => q.includes(k)).map((k) => k.length)) }))
    .filter((c) => c.len > 0);
  if (inside.length) {
    const best = Math.max(...inside.map((c) => c.len));
    return only(inside.filter((c) => c.len === best));
  }

  if (q.length >= 3) {
    const part = only(cands.filter((c) => c.keys.some((k) => k.includes(q))));
    if (part) return part;
  }

  // "ไทยรัฐ 98" for "ไทยรัฐวิทยา 98": the number pins it down, the words may be short.
  const m = /^(\D{3,})(\d+)$/.exec(q);
  if (m) return only(cands.filter((c) => c.keys.some((k) => k.includes(m[1]) && k.endsWith(m[2]))));
  return null;
}

export function mentionsSupplies(text, cfg) {
  const q = normalize(text);
  return Boolean(cfg) && (cfg.keywords ?? []).map(normalize).some((k) => k && q.includes(k));
}

export function findFaq(text, faq) {
  const q = normalize(text);
  if (!q) return null;
  let best = null;
  for (const entry of faq) {
    const hits = entry.keywords.map(normalize).filter((k) => k && q.includes(k));
    const score = hits.reduce((n, k) => n + k.length, 0);
    if (score && (!best || score > best.score)) best = { entry, score };
  }
  return best?.entry ?? null;
}

// "ขอบคุณค่ะ", "ขอบคุณมากครับ", "thanks" — but not "ขอบคุณ ปากกาเท่าไหร่": a message
// that still says something else is a question, not a goodbye.
const THANKS = /ขอบคุณ|ขอบใจ|ขอบพระคุณ|thank(?:s|you)?|thx/g;
const THANKS_FILLER = /มากๆ|มาก|เลย|นะคะ|นะครับ|นะ|ค่ะ|คะ|ครับ|คับ|จ้า|จ้ะ|ล่วงหน้า|ที่|ช่วย|ๆ/g;
export function isThanks(text) {
  const q = String(text ?? '').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]/gu, '');
  if (!THANKS.test(q)) return false;
  THANKS.lastIndex = 0;
  return q.replace(THANKS, '').replace(THANKS_FILLER, '') === '';
}

// A LINE sticker carries English keywords describing it; "thanks" ones count.
export const isThanksSticker = (keywords) =>
  Array.isArray(keywords) && keywords.some((k) => /thank|thx|ขอบคุณ/i.test(String(k)));

// → { type: 'handoff' | 'greeting' | 'products' | 'faq' | 'fallback', ... }
export function matchIntent(text, shop) {
  const q = normalize(text);
  if (HANDOFF.test(q)) return { type: 'handoff' };
  if (isThanks(text)) return { type: 'thanks' };
  const products = findProducts(text, shop.products ?? []);
  if (products.length) return { type: 'products', products };
  const faq = findFaq(text, shop.faq ?? []);
  if (faq) return { type: 'faq', faq };
  if (GREETING.test(q)) return { type: 'greeting' };
  return { type: 'fallback' };
}

// Which subject did the customer pick for the admin? A button sends the topic's exact
// label, which is always accepted; looser wording ("ทำไวนิลหน่อย") counts only while the
// customer has just been asked, so ordinary chat is never swept up into a handoff.
export function findAdminTopic(text, routing, { loose = false } = {}) {
  const q = normalize(text);
  if (!q || !routing?.topics) return null;
  const exact = routing.topics.find((t) => normalize(t.label) === q);
  if (exact) return exact;
  if (!loose) return null;
  let best = null;
  for (const t of routing.topics) {
    for (const k of [t.label, ...(t.keywords ?? [])].map(normalize)) {
      if (k && q.includes(k) && (!best || k.length > best.len)) best = { t, len: k.length };
    }
  }
  return best?.t ?? null;
}
