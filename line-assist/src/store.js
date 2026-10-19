// Where the assistant keeps its small per-customer memory (quiet windows, "the admins were
// already told", the last reply) and where it reads the shop's own settings.
//
// Two versions of the same interface: a REST one for the shop's Supabase project (tables
// st_state + the two st_* functions in sql/001_st_state.sql) and an in-memory one for tests.
//
//   getSecret(k) / getConfig(k)   app_secrets / app_config rows (read only)
//   get(k) → { at, data } | null  set(k, data) · del(k)
//   claim(k, ms)        → true for the first caller within `ms` (atomic — two webhooks at once cannot both win)
//   touchWithin(k, ms)  → true when k was written less than `ms` ago, and renews it
//   prune(beforeMs)     delete rows not written since then

export function createMemoryStore({ now = () => Date.now(), secrets = {}, config = {} } = {}) {
  const rows = new Map();
  return {
    rows,
    secrets,
    config,
    async getSecret(k) {
      return secrets[k] ?? null;
    },
    async getConfig(k) {
      return config[k] ?? null;
    },
    async get(k) {
      const r = rows.get(k);
      return r ? { at: r.at, data: r.data } : null;
    },
    async set(k, data = {}) {
      rows.set(k, { at: now(), data });
    },
    async del(k) {
      rows.delete(k);
    },
    async claim(k, ms) {
      const r = rows.get(k);
      if (r && now() - r.at < ms) return false;
      rows.set(k, { at: now(), data: r?.data ?? {} });
      return true;
    },
    async touchWithin(k, ms) {
      const r = rows.get(k);
      if (!r || now() - r.at >= ms) return false;
      r.at = now();
      return true;
    },
    async prune(before) {
      for (const [k, v] of rows) if (v.at < before) rows.delete(k);
    },
  };
}

export function createRestStore({ url, key, fetch: doFetch = fetch, now = () => Date.now() }) {
  const root = String(url).replace(/\/+$/, '');
  const base = `${root}/rest/v1`;
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  const enc = encodeURIComponent;

  async function req(method, path, { body, prefer } = {}) {
    const res = await doFetch(base + path, {
      method,
      headers: prefer ? { ...headers, Prefer: prefer } : headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw Object.assign(new Error(`store ${method} ${path.split('?')[0]} → ${res.status}`), { status: res.status });
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  return {
    async getSecret(k) {
      const r = await req('GET', `/app_secrets?select=value&key=eq.${enc(k)}&limit=1`);
      return r?.[0]?.value == null ? null : String(r[0].value);
    },
    async getConfig(k) {
      const r = await req('GET', `/app_config?select=value&key=eq.${enc(k)}&limit=1`);
      return r?.[0]?.value ?? null;
    },
    async get(k) {
      const r = await req('GET', `/st_state?select=at,data&key=eq.${enc(k)}&limit=1`);
      return r?.[0] ? { at: Number(r[0].at), data: r[0].data } : null;
    },
    async set(k, data = {}) {
      await req('POST', '/st_state?on_conflict=key', { body: { key: k, at: now(), data }, prefer: 'resolution=merge-duplicates,return=minimal' });
    },
    async del(k) {
      await req('DELETE', `/st_state?key=eq.${enc(k)}`, { prefer: 'return=minimal' });
    },
    async claim(k, ms) {
      return (await req('POST', '/rpc/st_claim', { body: { p_key: k, p_now: now(), p_ms: ms } })) === true;
    },
    async touchWithin(k, ms) {
      return (await req('POST', '/rpc/st_touch_within', { body: { p_key: k, p_now: now(), p_ms: ms } })) === true;
    },
    async prune(before) {
      await req('DELETE', `/st_state?at=lt.${Math.floor(before)}`, { prefer: 'return=minimal' });
    },

    // Public picture folder (Supabase Storage). Used once, by the "seed_assets" action.
    async putPublicFile(bucket, name, bytes, contentType) {
      const mk = await doFetch(`${root}/storage/v1/bucket`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ id: bucket, name: bucket, public: true }),
        signal: AbortSignal.timeout(8000),
      });
      if (!mk.ok && mk.status !== 409 && mk.status !== 400) throw new Error(`bucket → ${mk.status}`); // already there is fine
      const up = await doFetch(`${root}/storage/v1/object/${enc(bucket)}/${enc(name)}`, {
        method: 'POST',
        headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': contentType, 'x-upsert': 'true' },
        body: bytes,
        signal: AbortSignal.timeout(20_000),
      });
      if (!up.ok) throw new Error(`upload ${name} → ${up.status}`);
      return `${root}/storage/v1/object/public/${bucket}/${name}`;
    },
  };
}
