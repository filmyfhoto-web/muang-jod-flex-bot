// Rule-based matching. Thai has no word spaces, so everything is substring
// matching on a normalised string rather than tokenising.

const POLITE = /(?:ค่ะ|คะ|ครับ|คับ|จ้า|จ้ะ|นะ|น๊า|หน่อย|ด้วย|ที)+$/g;

export function normalize(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(POLITE, '');
}

const GREETING = /^(?:สวัสดี|หวัดดี|hello|hi|ดีจ้า|ดีค่ะ|ดีครับ)/;
const HANDOFF = /แอดมิน|admin|คุยกับคน|เจ้าของร้าน|พนักงาน/;

// Longest product alias contained in the message wins, so "กระดาษa4" picks the
// A4 entry over a shorter generic alias like "กระดาษ" on another product.
export function findProducts(text, products) {
  const q = normalize(text);
  if (!q) return [];
  const scored = [];
  for (const p of products) {
    const names = [p.name, ...(p.aliases ?? [])].map(normalize).filter(Boolean);
    const hit = names.filter((n) => q.includes(n)).sort((a, b) => b.length - a.length)[0];
    if (hit) scored.push({ p, score: hit.length });
  }
  const best = Math.max(0, ...scored.map((s) => s.score));
  return scored.filter((s) => s.score === best).map((s) => s.p);
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

// → { type: 'handoff' | 'greeting' | 'products' | 'faq' | 'fallback', ... }
export function matchIntent(text, shop) {
  const q = normalize(text);
  if (HANDOFF.test(q)) return { type: 'handoff' };
  const products = findProducts(text, shop.products ?? []);
  if (products.length) return { type: 'products', products };
  const faq = findFaq(text, shop.faq ?? []);
  if (faq) return { type: 'faq', faq };
  if (GREETING.test(q)) return { type: 'greeting' };
  return { type: 'fallback' };
}
