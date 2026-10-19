import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRestStore, createMemoryStore } from '../src/store.js';

function recorder(replyFor = () => []) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method, headers: init.headers, body: init.body ? JSON.parse(init.body) : undefined });
    const out = replyFor(String(url), init);
    return { ok: true, status: 200, text: async () => (out === undefined ? '' : JSON.stringify(out)) };
  };
  return { fetch, calls };
}

test('REST store: every call carries the service key; keys with colons and Thai letters are escaped', async () => {
  const r = recorder();
  const store = createRestStore({ url: 'https://p.supabase.co/', key: 'SERVICE', fetch: r.fetch, now: () => 1_800_000_000_000.4 });
  await store.get('pick:Uabc:หญิง');
  assert.equal(r.calls[0].url, `https://p.supabase.co/rest/v1/st_state?select=at,data&key=eq.${encodeURIComponent('pick:Uabc:หญิง')}&limit=1`);
  assert.equal(r.calls[0].headers.apikey, 'SERVICE');
  assert.equal(r.calls[0].headers.Authorization, 'Bearer SERVICE');
  await store.set('last:U1', { said: 'x' });
  assert.equal(r.calls[1].method, 'POST');
  assert.match(r.calls[1].url, /st_state\?on_conflict=key$/);
  assert.equal(r.calls[1].headers.Prefer, 'resolution=merge-duplicates,return=minimal');
  assert.deepEqual(r.calls[1].body, { key: 'last:U1', at: 1_800_000_000_000, data: { said: 'x' } });
  await store.del('last:U1');
  assert.equal(r.calls[2].method, 'DELETE');
  assert.match(r.calls[2].url, /st_state\?key=eq\.last%3AU1$/);
});

test('REST store: the database wants whole numbers, so fractions are rounded', async () => {
  const r = recorder(() => true);
  const store = createRestStore({ url: 'https://p.supabase.co', key: 'k', fetch: r.fetch, now: () => 1_800_000_000_000.7 });
  assert.equal(await store.claim('alert:U1', 1_199_880.0000000002), true);
  assert.deepEqual(r.calls[0].body, { p_key: 'alert:U1', p_now: 1_800_000_000_001, p_ms: 1_199_880 });
  assert.match(r.calls[0].url, /\/rest\/v1\/rpc\/st_claim$/);
  assert.equal(await store.touchWithin('quiet:U1', 1_200_000.4), true);
  assert.match(r.calls[1].url, /\/rpc\/st_touch_within$/);
});

test('REST store: answers are read the way PostgREST returns them', async () => {
  const rows = { st_state: [{ at: '1800000000000', data: { a: 1 } }], app_secrets: [{ value: 'tok' }], app_config: [{ value: { mode: 'all' } }] };
  const r = recorder((url) => (url.includes('/rpc/') ? false : rows[url.match(/rest\/v1\/(\w+)/)[1]]));
  const store = createRestStore({ url: 'https://p.supabase.co', key: 'k', fetch: r.fetch });
  assert.deepEqual(await store.get('x'), { at: 1_800_000_000_000, data: { a: 1 } });
  assert.equal(await store.getSecret('line_channel_token'), 'tok');
  assert.deepEqual(await store.getConfig('faq_bot'), { mode: 'all' });
  assert.equal(await store.claim('k', 1000), false);
  const none = createRestStore({ url: 'https://p.supabase.co', key: 'k', fetch: recorder(() => []).fetch });
  assert.equal(await none.get('x'), null);
  assert.equal(await none.getSecret('x'), null);
  assert.equal(await none.getConfig('x'), null);
});

test('REST store: a refused call is an error naming the table and status, never the data', async () => {
  const store = createRestStore({ url: 'https://p.supabase.co', key: 'k', fetch: async () => ({ ok: false, status: 401, text: async () => 'secret details' }) });
  await assert.rejects(store.getSecret('line_channel_token'), (e) => e.status === 401 && /app_secrets/.test(e.message) && !/secret details/.test(e.message));
});

test('memory store behaves like the SQL: claim, sliding window, prune', async () => {
  let t = 1000;
  const m = createMemoryStore({ now: () => t });
  assert.equal(await m.claim('a', 100), true);
  t += 99;
  assert.equal(await m.claim('a', 100), false);
  t += 1;
  assert.equal(await m.claim('a', 100), true);
  await m.set('q', {});
  t += 50;
  assert.equal(await m.touchWithin('q', 100), true);
  t += 99;
  assert.equal(await m.touchWithin('q', 100), true); // slid
  t += 100;
  assert.equal(await m.touchWithin('q', 100), false);
  await m.prune(t + 1);
  assert.equal(await m.get('a'), null);
});
