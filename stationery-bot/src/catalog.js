// The shop's own products, and which of them a customer's words mean.
//
// The scoring is the web app's (back office, module projdocs "วางข้อความจาก LINE"): the same normalising, the same
// Thai-skeleton comparison for small spelling differences (หยักใย / หยากไย่) and the same bigram score. What differs is how
// much the bot trusts it. A person pasting a chat sees the choice and can change it; the bot writes before anybody looks,
// so it links a line to a product only when one product is clearly the one — an exact name, or a strong match that no other
// product comes close to. Everything else stays the customer's own words, marked "รอตรวจสอบสินค้า", with the nearest
// products named so the staff can pick in one tap. The bot never creates, prices or changes a product (it only reads them).

const norm = (s) => String(s ?? '').toLowerCase().replace(/[\s\-_.,()/+"'“”]/g, '');
const MARKS = new RegExp('[' + 'ะัาำิีึืุูเแโใไ็่้๊๋์ๆฯๅ' + ']', 'g');
const skeleton = (s) => s.replace(MARKS, ''); // consonants only: spellings that differ by a vowel or a tone mark still meet

function bigrams(s) {
  const m = new Map();
  for (let i = 0; i < s.length - 1; i++) {
    const k = s.substr(i, 2);
    m.set(k, (m.get(k) || 0) + 1);
  }
  return m;
}
function dice(a, b) {
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const A = bigrams(a);
  const B = bigrams(b);
  let x = 0;
  A.forEach((v, k) => {
    const w = B.get(k);
    if (w) x += Math.min(v, w);
  });
  return (2 * x) / (a.length + b.length - 2);
}

// → up to `limit` products that look like `name`, best first: [{ p, s }]  (s = 0…1)
export function candidates(products, name, limit = 4) {
  const n = norm(name);
  if (n.length < 2) return [];
  const out = [];
  for (const p of products || []) {
    const pn = norm(p.name);
    if (!pn) continue;
    let s = 0;
    if (pn === n) s = 1;
    else if (pn.includes(n)) s = 0.74 + 0.22 * (n.length / pn.length);
    else if (n.includes(pn) && pn.length >= 3) s = 0.58 + 0.3 * (pn.length / n.length);
    else {
      const nk = skeleton(n);
      const pk = skeleton(pn);
      s = dice(n, pn);
      if (nk.length >= 4 && pk.includes(nk)) s = Math.max(s, 0.64 + 0.2 * (nk.length / pk.length));
      if (s < 0.42) continue;
    }
    out.push({ p, s });
  }
  out.sort((a, b) => b.s - a.s || String(a.p.name ?? '').length - String(b.p.name ?? '').length);
  return out.slice(0, limit);
}

// → { product, near } — `product` only when one product is clearly the one (see above), `near` = the closest few worth showing.
// auto = the lowest score trusted, gap = how far ahead of the runner-up it must be (an exact name needs no gap unless two
// products carry the very same name), hint = the lowest score worth mentioning as a suggestion.
export function pick(products, name, { auto = 0.85, gap = 0.12, hint = 0.45 } = {}) {
  const c = candidates(products, name, 4);
  const top = c[0];
  const near = c.filter((x) => x.s >= hint).map((x) => x.p);
  if (!top || top.s < auto) return { product: null, near };
  const next = c[1];
  const clear = top.s === 1 ? !(next && next.s === 1) : !next || top.s - next.s >= gap;
  return { product: clear ? top.p : null, near };
}

// A cached copy of the shop's products for the matching above (741 rows at the moment). Read again in the background every
// `ttlMs`: a customer's message never waits for a refresh, only the very first one waits for the first read.
export function createCatalog({ load, ttlMs = 10 * 60_000, now = () => Date.now() }) {
  let rows = null;
  let at = 0;
  let pending = null;
  const refresh = () => {
    pending ??= Promise.resolve()
      .then(load)
      .then((r) => {
        rows = Array.isArray(r) ? r : [];
        at = now();
        return rows;
      })
      .catch(() => rows ?? [])
      .finally(() => {
        pending = null;
      });
    return pending;
  };
  return {
    // → the products, or [] when they have never been readable (every line then stays the customer's own words, for the staff to match)
    async get() {
      if (rows) {
        if (now() - at >= ttlMs) void refresh(); // stale: answer now, update behind the scenes
        return rows;
      }
      return refresh();
    },
  };
}
