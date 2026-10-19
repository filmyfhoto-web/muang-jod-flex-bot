import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../src/handler.js';
import { createMemoryStore } from '../src/store.js';
import { hmacBase64 } from '../src/util.js';
import { fakeLine, CUSTOMER, CUSTOMER2, IDS, textsOf } from './_line.js';

const KEY = 'k-' + 'a'.repeat(30);
const RENDER = 'https://old-bot.example/webhook';
const ADMINS = Object.entries(IDS).map(([name, userId]) => ({ name, userId }));

function rig({ secrets = {}, config = {}, line, selfUrl = 'https://x.supabase.co/functions/v1/line-assist' } = {}) {
  const fake = fakeLine(line);
  const forwards = [];
  const fetch = async (url, init = {}) => {
    if (String(url) === RENDER) {
      forwards.push({ url: String(url), headers: init.headers, body: init.body });
      return { ok: true, status: 200, body: { cancel: async () => {} } };
    }
    if (String(url).startsWith('https://pics.example/')) {
      return { ok: true, status: 200, arrayBuffer: async () => new Uint8Array([137, 80, 78, 71]).buffer };
    }
    return fake.fetch(url, init);
  };
  const store = createMemoryStore({
    secrets: { line_channel_token: 'tok', faq_hook_key: KEY, faq_forward: RENDER, ...secrets },
    config: { faq_bot: { mode: 'all', admins: ADMINS, chatLinkTemplate: 'https://chat.example/oa', ...config } },
  });
  const jobs = [];
  const handle = createHandler({ store, fetch, selfUrl, waitUntil: (p) => jobs.push(p) });
  const post = async (body, { key = KEY, sig = '' } = {}) => {
    const raw = typeof body === 'string' ? body : JSON.stringify(body);
    const res = await handle(new Request(`https://x.supabase.co/functions/v1/line-assist${key ? `?k=${key}` : ''}`, { method: 'POST', headers: { 'x-line-signature': sig, 'content-type': 'application/json' }, body: raw }));
    await Promise.all(jobs.splice(0));
    return { status: res.status, body: await res.json().catch(() => null), raw };
  };
  return { handle, post, store, fake, forwards, log: fake.log };
}

const textEvent = (userId, text, n = 1) => ({ type: 'message', mode: 'active', replyToken: `rt${n}`, source: { type: 'user', userId }, message: { id: `m${n}`, type: 'text', text } });
const batch = (...events) => ({ destination: 'Ubot', events });

test('GET says ok, other methods are refused', async () => {
  const r = rig();
  assert.equal((await r.handle(new Request('https://x/y'))).status, 200);
  assert.equal((await r.handle(new Request('https://x/y', { method: 'PUT' }))).status, 405);
});

test('who may call: the shared key in the URL, or a valid LINE signature — nobody else', async () => {
  const r = rig();
  assert.equal((await r.post(batch(textEvent(CUSTOMER, 'ร้านเปิดกี่โมง')), { key: '' })).status, 401);
  assert.equal((await r.post(batch(textEvent(CUSTOMER, 'ร้านเปิดกี่โมง')), { key: 'wrong' })).status, 401);
  assert.equal(r.log.replies.length, 0);
  assert.equal((await r.post(batch(textEvent(CUSTOMER, 'ร้านเปิดกี่โมง')))).status, 200);
  assert.equal(r.log.replies.length, 1);

  const s = rig({ secrets: { line_channel_secret: 'chan-secret', faq_hook_key: '' } });
  const raw = JSON.stringify(batch(textEvent(CUSTOMER, 'ร้านเปิดกี่โมง')));
  assert.equal((await s.post(raw, { key: '', sig: await hmacBase64('chan-secret', raw) })).status, 200);
  assert.equal((await s.post(raw, { key: '', sig: await hmacBase64('other-secret', raw) })).status, 401);
  assert.equal((await s.post(raw, { key: '', sig: '' })).status, 401);

  // nothing configured at all → nobody gets in, not even with a key in the URL
  const none = rig({ secrets: { faq_hook_key: '' } });
  assert.equal((await none.post(batch(), { key: KEY })).status, 401);
});

test('LINE\'s verify ping (no events) is accepted and does nothing', async () => {
  const r = rig();
  const out = await r.post({ destination: 'Ubot', events: [] });
  assert.equal(out.status, 200);
  assert.deepEqual(out.body, { ok: true, r: [] });
  assert.equal((await r.post('not json')).status, 400);
});

test('mode "all": everybody is answered here and nothing goes to the old bot', async () => {
  const r = rig();
  const out = await r.post(batch(textEvent(CUSTOMER, 'ร้านเปิดกี่โมง')));
  assert.deepEqual(out.body.r, ['reply']);
  assert.equal(r.forwards.length, 0);
});

test('mode "off" (or no settings at all): the request is handed to the old bot unchanged', async () => {
  for (const config of [{ mode: 'off' }, { mode: 'nonsense' }]) {
    const r = rig({ config });
    const b = batch(textEvent(CUSTOMER, 'ร้านเปิดกี่โมง'));
    const out = await r.post(b, { sig: 'orig-sig' });
    assert.equal(out.body.relay, 'fwd');
    assert.equal(r.forwards.length, 1);
    assert.equal(r.forwards[0].body, out.raw); // same bytes
    assert.equal(r.forwards[0].headers['X-Line-Signature'], 'orig-sig'); // same signature, so the old bot can verify it
    assert.equal(r.log.replies.length, 0);
  }
  const bare = rig({ config: { mode: 'off' }, secrets: { faq_forward: '' } });
  const out = await bare.post(batch(textEvent(CUSTOMER, 'x')));
  assert.equal(out.status, 200);
  assert.equal(out.body.skipped, 'off');
});

test('mode "admins": only the listed people are answered here; any batch with someone else goes to the old bot whole', async () => {
  const r = rig({ config: { mode: 'admins' } });
  const mine = await r.post(batch(textEvent(IDS.หญิง, 'ร้านเปิดกี่โมง')));
  assert.deepEqual(mine.body.r, ['reply']);
  assert.equal(r.forwards.length, 0);

  const other = await r.post(batch(textEvent(CUSTOMER, 'ร้านเปิดกี่โมง')), { sig: 's1' });
  assert.equal(other.body.relay, 'fwd');
  assert.equal(r.forwards.length, 1);
  assert.equal(r.log.replies.length, 1); // still only the admin's

  const mixed = await r.post(batch(textEvent(IDS.หญิง, 'ร้านเปิดกี่โมง', 2), textEvent(CUSTOMER, 'ร้านเปิดกี่โมง', 3)));
  assert.equal(mixed.body.relay, 'fwd');
  assert.equal(r.forwards.length, 2);
  assert.equal(r.log.replies.length, 1);

  // a group message from an admin is not "an admin writing to the OA"
  const group = await r.post(batch({ ...textEvent(IDS.หญิง, 'x'), source: { type: 'group', groupId: 'C1', userId: IDS.หญิง } }));
  assert.equal(group.body.relay, 'fwd');
});

test('mode "admins" with nobody listed behaves like "off" (nothing is answered here)', async () => {
  const r = rig({ config: { mode: 'admins', admins: [] } });
  const out = await r.post(batch(textEvent(CUSTOMER, 'ร้านเปิดกี่โมง')));
  assert.equal(out.body.relay, 'fwd');
  assert.equal(r.log.replies.length, 0);
});

test('without the OA\'s access token nothing is answered here — the request goes on to the old bot', async () => {
  const r = rig({ secrets: { line_channel_token: '' } });
  const out = await r.post(batch(textEvent(CUSTOMER, 'ร้านเปิดกี่โมง')));
  assert.equal(out.body.relay, 'fwd');
  assert.equal(r.log.replies.length, 0);
});

test('the old bot\'s address must be https and must not be this function itself', async () => {
  for (const faq_forward of ['http://old-bot.example/webhook', 'not a url', 'https://x.supabase.co/functions/v1/line-assist']) {
    const r = rig({ config: { mode: 'off' }, secrets: { faq_forward } });
    const out = await r.post(batch(textEvent(CUSTOMER, 'x')));
    assert.equal(out.body.skipped, 'off', faq_forward);
    assert.equal(r.forwards.length, 0);
  }
});

test('if the settings cannot be read, the old bot is still reached (when its address was known before)', async () => {
  const r = rig();
  await r.post(batch(textEvent(CUSTOMER, 'ร้านเปิดกี่โมง'))); // learns the address
  r.store.getConfig = async () => {
    throw new Error('db down');
  };
  const out = await r.post(batch(textEvent(CUSTOMER, 'ร้านเปิดกี่โมง', 2)));
  assert.equal(out.status, 200);
  assert.equal(out.body.why, 'setup_failed');
  assert.equal(r.forwards.length, 1);

  // nothing known yet and the database is out altogether: say so (LINE's relay records the failure)
  const cold = rig();
  const getSecret = cold.store.getSecret;
  cold.store.getConfig = async () => {
    throw new Error('db down');
  };
  cold.store.getSecret = async (k) => {
    if (k === 'faq_forward') throw new Error('db down');
    return getSecret(k);
  };
  assert.equal((await cold.post(batch(textEvent(CUSTOMER, 'x')))).status, 500);
});

test('one event failing does not stop the others in the batch', async () => {
  const r = rig();
  let calls = 0;
  const realFetch = r.fake.fetch;
  r.fake.fetch = async (u, i) => {
    if (String(u).endsWith('/message/reply') && ++calls === 1) return { ok: false, status: 500, text: async () => 'boom' };
    return realFetch(u, i);
  };
  // the rig built its fetch before; rebuild a handler around the failing one
  const store = createMemoryStore({ secrets: { line_channel_token: 'tok', faq_hook_key: KEY }, config: { faq_bot: { mode: 'all', admins: ADMINS } } });
  const handle = createHandler({ store, fetch: r.fake.fetch, selfUrl: '' });
  const res = await handle(new Request(`https://x/y?k=${KEY}`, { method: 'POST', body: JSON.stringify(batch(textEvent(CUSTOMER, 'ร้านเปิดกี่โมง', 1), textEvent(IDS.หญิง, 'ที่ตั้งร้าน', 2))) }));
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.deepEqual(body.r, ['error', 'reply']);
});

test('the log never contains what a customer wrote', async () => {
  const r = rig();
  const seen = [];
  const orig = [console.log, console.error];
  console.log = (...a) => seen.push(a.join(' '));
  console.error = (...a) => seen.push(a.join(' '));
  try {
    await r.post(batch(textEvent(CUSTOMER, 'ความลับของลูกค้า xyz-9876'), textEvent(CUSTOMER, 'ติดต่อ หญิง', 2)));
  } finally {
    [console.log, console.error] = orig;
  }
  const all = seen.join('\n');
  assert.ok(seen.length > 0);
  assert.ok(!all.includes('ความลับ') && !all.includes('9876') && !all.includes(CUSTOMER));
});

test('seed_assets copies the six pictures into a public folder, only from this account\'s GitHub', async () => {
  const r = rig();
  const put = [];
  r.store.putPublicFile = async (bucket, name, bytes, type) => {
    put.push([bucket, name, bytes.length, type]);
    return `https://x.supabase.co/storage/v1/object/public/${bucket}/${name}`;
  };
  const bad = await r.post({ action: 'seed_assets', from: 'https://evil.example/pics' });
  assert.equal(bad.status, 400);
  assert.equal(put.length, 0);
  const ok = await r.post({ action: 'seed_assets', from: 'https://raw.githubusercontent.com/filmyfhoto-web/muang-jod-flex-bot/abc123/line-assist/assets' });
  assert.equal(ok.status, 502); // the fake host only knows pics.example
  const r2 = rig();
  const put2 = [];
  r2.store.putPublicFile = async (b, n, bytes, t) => (put2.push(n), `https://x.supabase.co/storage/v1/object/public/${b}/${n}`);
  const realFetch = r2.fake.fetch;
  void realFetch;
  const h = createHandler({
    store: r2.store,
    selfUrl: '',
    fetch: async (u) => ({ ok: true, status: 200, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer }),
  });
  const res = await h(new Request(`https://x/y?k=${KEY}`, { method: 'POST', body: JSON.stringify({ action: 'seed_assets', from: 'https://raw.githubusercontent.com/filmyfhoto-web/muang-jod-flex-bot/abc123/line-assist/assets/' }) }));
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.deepEqual(put2.sort(), ['admin.png', 'ask.png', 'icon.png', 'order.png', 'school.png', 'staff.png']);
  assert.equal(body.assets_base, 'https://x.supabase.co/storage/v1/object/public/line-assist');
  assert.ok(textsOf(body));
});

test('pick_alert: the database tells us a customer chose someone in the shop\'s own picker → only that person is told', async () => {
  const r = rig({ config: { mode: 'admins' } });
  const call = (body, opts) => r.post(body, opts);
  assert.equal((await call({ action: 'pick_alert', user_id: CUSTOMER, admin_name: 'หญิง' }, { key: '' })).status, 401); // needs the key
  assert.equal((await call({ action: 'pick_alert', user_id: 'nope', admin_name: 'หญิง' })).status, 400);
  assert.equal((await call({ action: 'pick_alert', user_id: CUSTOMER, admin_name: '  ' })).status, 400);
  const ok = await call({ action: 'pick_alert', user_id: CUSTOMER, admin_name: 'หญิง' });
  assert.deepEqual(ok.body, { ok: true, r: 'pick:alerted' });
  assert.deepEqual(r.log.pushes.map((p) => p.to), [IDS.หญิง]);
  assert.equal(r.log.replies.length, 0); // nothing is said to the customer
  assert.equal((await call({ action: 'pick_alert', user_id: CUSTOMER, admin_name: 'หญิง' })).body.r, 'pick:again');
  assert.equal((await call({ action: 'pick_alert', user_id: CUSTOMER, admin_name: 'ไม่มีคนนี้' })).body.r, 'pick:unknown');
  assert.equal(r.log.pushes.length, 1);
});

test('pick_alert does nothing while the assistant is switched off, has no token, or the database is out', async () => {
  const off = rig({ config: { mode: 'off' } });
  assert.deepEqual((await off.post({ action: 'pick_alert', user_id: CUSTOMER, admin_name: 'หญิง' })).body, { ok: true, skipped: 'off' });
  const none = rig({ secrets: { line_channel_token: '' } });
  assert.deepEqual((await none.post({ action: 'pick_alert', user_id: CUSTOMER, admin_name: 'หญิง' })).body, { ok: true, skipped: 'no_token' });
  const down = rig();
  down.store.getConfig = async () => {
    throw new Error('db down');
  };
  assert.equal((await down.post({ action: 'pick_alert', user_id: CUSTOMER, admin_name: 'หญิง' })).status, 500);
  assert.equal(off.log.pushes.length + none.log.pushes.length + down.log.pushes.length, 0);
});

test('the shop\'s own settings are read: its people, its buttons, its silence time', async () => {
  const r = rig({ config: { mode: 'all' } });
  r.store.config.line_bot = { admin_label: 'ถามแอดมิน', silence_hours: 12, old_chips: ['เวลาเปิดร้าน'], admins: [{ name: 'หญิง', note: 'ของ' }] };
  await r.post(batch(textEvent(CUSTOMER, 'ร้านเปิดกี่โมง')));
  const items = r.log.replies[0].messages[0].quickReply.items;
  assert.deepEqual(items.map((i) => i.action.label), ['สั่งซื้อสินค้า', 'ส่งเอกสารโครงการ', 'ถามแอดมิน', 'เวลาเปิดร้าน']);
  await r.post(batch(textEvent(CUSTOMER2, 'สั่งงาน', 2))); // another customer, so the first one's burst window does not apply
  assert.match(JSON.stringify(r.log.replies.at(-1).messages), /คุยกับหญิง/);
  assert.ok(!/คุยกับฟิล์ม/.test(JSON.stringify(r.log.replies.at(-1).messages))); // only the people the shop lists
});
