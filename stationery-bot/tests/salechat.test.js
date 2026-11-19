// The LINE bridge of the back office's "แชตและออเดอร์" page (src/salechat/), on its own with stand-ins for the database and LINE:
// what a customer's message becomes in the page, that nothing happens while it is off, that a picture is saved before it is shown,
// that a staff reply is reported "sent" only after LINE accepted it, and that no failure here can reach the bot's answers.
// The same code against a real PostgreSQL and a started bot is in db/test/sale-line-chain.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { saleChatFromEnv, saleChatDb } from '../src/salechat/config.js';
import { describeMessage, createSaleChatIngest } from '../src/salechat/ingest.js';
import { classifyPush, createSaleOutbox } from '../src/salechat/outbox.js';
import { createSaleChat } from '../src/salechat/index.js';

const U1 = 'U' + '1'.repeat(32);
const U2 = 'U' + '2'.repeat(32);
const silent = { error() {}, log() {} };
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const textEv = (userId, text, id = 'm1', extra = {}) => ({ type: 'message', timestamp: 1_762_000_000_000, source: { type: 'user', userId }, message: { id, type: 'text', text }, ...extra });

function fakeStore(over = {}) {
  const calls = { ingest: [], media: [], claim: 0, finish: [], beat: [] };
  const store = {
    async ingest(p) {
      calls.ingest.push(p);
      return { duplicate: false, thread_id: 't1', msg_id: 'g' + calls.ingest.length, created_thread: calls.ingest.length === 1 };
    },
    async putMedia(path, bytes, type) {
      calls.media.push({ path, size: bytes.length, type });
    },
    async claim() {
      calls.claim++;
      return [];
    },
    async finish(id, result, error, requestId) {
      calls.finish.push({ id, result, error, requestId });
      return { changed: true, status: result };
    },
    async beat(channel, mode, build, detail) {
      calls.beat.push({ channel, mode, build, detail });
    },
    ...over,
  };
  return { store, calls };
}
const lineApi = (over = {}) => ({
  profile: async () => ({ name: 'คุณปู', picture: 'https://profile.line-scdn.net/p.png' }),
  content: async () => ({ buffer: JPEG, mimeType: 'image/jpeg' }),
  quota: async () => ({ type: 'limited', limit: 300, used: 120 }),
  ...over,
});

// ---- settings --------------------------------------------------------------------------------------------------------------

test('the settings: off unless switched on, Render’s variables win over the file, nothing unknown is accepted', () => {
  assert.deepEqual(saleChatFromEnv({}, {}), { channelKey: 'main', quietAfterReply: true, mode: 'off' });
  assert.equal(saleChatFromEnv({ mode: 'on' }, {}).mode, 'on');
  assert.equal(saleChatFromEnv({ mode: 'on' }, { SALECHAT_MODE: ' PILOT ' }).mode, 'pilot');
  assert.equal(saleChatFromEnv({ mode: 'on' }, { SALECHAT_MODE: 'maybe' }).mode, 'on', 'a wrong value in Render leaves the file’s setting');
  assert.equal(saleChatFromEnv({ mode: 'sometimes' }, {}).mode, 'off', 'a wrong value in the file is off');
  assert.equal(saleChatFromEnv({}, { SALECHAT_QUIET: 'off' }).quietAfterReply, false);
  assert.equal(saleChatFromEnv({ quietAfterReply: false }, { SALECHAT_QUIET: 'x' }).quietAfterReply, false);
  assert.deepEqual(saleChatFromEnv({ pilotUserIds: [U2] }, { SALECHAT_PILOT_IDS: `${U1}, nonsense ,${U2},U123` }).pilotUserIds, [U1, U2], 'only real LINE ids');
  assert.deepEqual(saleChatFromEnv({ pilotUserIds: [U2] }, { SALECHAT_PILOT_IDS: 'x' }).pilotUserIds, [U2], 'no valid id in Render: the file’s list stays');
});

test('the database of the bridge: its own pair first, then the drafts’ pair, then the app’s; half a pair is nothing', () => {
  assert.equal(saleChatDb({}), null);
  assert.equal(saleChatDb({ SALECHAT_SUPABASE_URL: 'https://a.supabase.co' }), null, 'a URL without its key');
  assert.deepEqual(saleChatDb({ SUPABASE_URL: 'https://app.supabase.co/', SUPABASE_SERVICE_ROLE_KEY: ' k3 ' }), { url: 'https://app.supabase.co', key: 'k3' });
  assert.deepEqual(
    saleChatDb({ SUPABASE_URL: 'https://app.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k3', CHATDRAFTS_SUPABASE_URL: 'https://d.supabase.co', CHATDRAFTS_SERVICE_ROLE_KEY: 'k2' }),
    { url: 'https://d.supabase.co', key: 'k2' },
  );
  assert.deepEqual(
    saleChatDb({ SALECHAT_SUPABASE_URL: 'https://s.supabase.co', SALECHAT_SERVICE_ROLE_KEY: 'k1', CHATDRAFTS_SUPABASE_URL: 'https://d.supabase.co', CHATDRAFTS_SERVICE_ROLE_KEY: 'k2' }),
    { url: 'https://s.supabase.co', key: 'k1' },
  );
  assert.deepEqual(saleChatDb({ SALECHAT_SUPABASE_URL: 'https://s.supabase.co', CHATDRAFTS_SUPABASE_URL: 'https://d.supabase.co', CHATDRAFTS_SERVICE_ROLE_KEY: 'k2' }), { url: 'https://d.supabase.co', key: 'k2' });
});

// ---- what a message becomes in the page -----------------------------------------------------------------------------------

test('what each kind of LINE message looks like in the chat: text as written, everything else a short Thai note', () => {
  assert.deepEqual(describeMessage({ type: 'text', text: 'สวัสดีค่ะ' }), { kind: 'text', body: 'สวัสดีค่ะ', meta: {} });
  const sticker = describeMessage({ type: 'sticker', packageId: '1', stickerId: '2', keywords: ['hi'] });
  assert.deepEqual([sticker.kind, sticker.body, sticker.meta.package_id, sticker.meta.keywords], ['sticker', '[สติกเกอร์]', '1', ['hi']]);
  assert.equal(describeMessage({ type: 'video' }).kind, 'video');
  assert.match(describeMessage({ type: 'audio' }).body, /^\[ข้อความเสียง\]/);
  const file = describeMessage({ type: 'file', fileName: 'ใบเสนอราคา.pdf', fileSize: 1024 });
  assert.deepEqual([file.kind, file.body, file.meta.size], ['file', '[ไฟล์] ใบเสนอราคา.pdf', 1024]);
  assert.equal(describeMessage({ type: 'file' }).body, '[ไฟล์] ไม่มีชื่อ');
  const loc = describeMessage({ type: 'location', title: 'ร้านนัฐภรณ์', address: 'เชียงกลาง น่าน', latitude: 19.3, longitude: 100.9 });
  assert.deepEqual([loc.kind, loc.body, loc.meta.latitude], ['location', '[ตำแหน่งที่ตั้ง] ร้านนัฐภรณ์ · เชียงกลาง น่าน', 19.3]);
  assert.equal(describeMessage({ type: 'something-new' }).kind, 'other');
  assert.equal(describeMessage({ type: 'file', fileName: 'ก'.repeat(500) }).body.length < 215, true, 'a long name is cut');
});

// ---- customer messages in ----------------------------------------------------------------------------------------------------

function ingestWith({ mode = 'on', pilot = [U1], store, api, retries = [0, 0, 0] } = {}) {
  const fs = store ?? fakeStore();
  const ing = createSaleChatIngest({ store: fs.store, lineApi: api ?? lineApi(), getConfig: () => ({ mode, pilotUserIds: pilot }), log: silent, retries, sleep: async () => {} });
  return { ing, ...fs };
}

test('off: nothing is recorded and the store is never touched; pilot: only the listed customers; on: everyone', async () => {
  const off = ingestWith({ mode: 'off' });
  assert.deepEqual(await off.ing.handle({ channelKey: 'main', token: 't', ev: textEv(U1, 'สวัสดี') }), { handled: false, why: 'off' });
  assert.equal(off.calls.ingest.length, 0);

  const pilot = ingestWith({ mode: 'pilot', pilot: [U1] });
  assert.equal((await pilot.ing.handle({ channelKey: 'main', token: 't', ev: textEv(U2, 'ใครก็ไม่รู้') })).handled, false);
  assert.equal((await pilot.ing.handle({ channelKey: 'main', token: 't', ev: textEv(U1, 'ผู้ทดลอง') })).handled, true);
  assert.deepEqual(pilot.calls.ingest.map((p) => p.body), ['ผู้ทดลอง']);

  const on = ingestWith({ mode: 'on', pilot: [] });
  assert.equal((await on.ing.handle({ channelKey: 'main', token: 't', ev: textEv(U2, 'ทุกคน') })).handled, true);
});

test('only a customer’s own message counts: not a group, a follow, a postback, or a message with no id', async () => {
  const { ing, calls } = ingestWith();
  const base = textEv(U1, 'x');
  for (const ev of [
    { ...base, source: { type: 'group', groupId: 'G1', userId: U1 } },
    { ...base, source: { type: 'room', roomId: 'R1', userId: U1 } },
    { ...base, source: { type: 'user' } },
    { type: 'follow', source: { type: 'user', userId: U1 } },
    { type: 'postback', source: { type: 'user', userId: U1 }, postback: { data: 'x' } },
    { ...base, message: { type: 'text', text: 'no id' } },
    null,
  ]) {
    assert.equal((await ing.handle({ channelKey: 'main', token: 't', ev })).handled, false);
  }
  assert.equal(calls.ingest.length, 0);
});

test('a text message goes in with the customer’s LINE name and picture, the time LINE gave, and its own LINE id', async () => {
  const { ing, calls } = ingestWith();
  const r = await ing.handle({ channelKey: 'main', token: 'tok', ev: textEv(U1, 'ขอสั่งกระดาษ A4 หน่อยค่ะ', 'LINE-77') });
  assert.equal(r.handled, true);
  assert.equal(r.thread_id, 't1');
  assert.deepEqual(calls.ingest[0], {
    channel_key: 'main',
    line_user_id: U1,
    line_message_id: 'LINE-77',
    kind: 'text',
    body: 'ขอสั่งกระดาษ A4 หน่อยค่ะ',
    name: 'คุณปู',
    picture: 'https://profile.line-scdn.net/p.png',
    at_ms: 1_762_000_000_000,
    meta: {},
  });
  // LINE could not give the profile: the message still goes in (the chat is called “ลูกค้า LINE” until a name is known)
  const noProfile = ingestWith({ api: lineApi({ profile: async () => { throw new Error('boom'); } }) });
  await noProfile.ing.handle({ channelKey: 'main', token: 't', ev: { ...textEv(U1, 'x'), timestamp: undefined } });
  assert.deepEqual([noProfile.calls.ingest[0].name, noProfile.calls.ingest[0].picture, noProfile.calls.ingest[0].at_ms], [null, null, null]);
});

test('a picture is saved in the page’s bucket first, then shown in the chat; a picture that cannot be had is still noted', async () => {
  const ok = ingestWith();
  await ok.ing.handle({ channelKey: 'main', token: 't', ev: { ...textEv(U1, ''), message: { id: 'IMG-1', type: 'image' } } });
  assert.deepEqual(ok.calls.media, [{ path: 'line/main/IMG-1.jpg', size: JPEG.length, type: 'image/jpeg' }]);
  const m = ok.calls.ingest[0];
  assert.deepEqual([m.kind, m.body, m.meta.path, m.meta.type, m.meta.size], ['image', '[รูปภาพ]', 'line/main/IMG-1.jpg', 'image/jpeg', JPEG.length]);

  // the same picture twice: the file is already there — that is fine
  const dup = ingestWith({ store: fakeStore({ async putMedia() { throw new Error('save picture: The resource already exists'); } }) });
  await dup.ing.handle({ channelKey: 'main', token: 't', ev: { ...textEv(U1, ''), message: { id: 'IMG-1', type: 'image' } } });
  assert.equal(dup.calls.ingest[0].meta.path, 'line/main/IMG-1.jpg');

  for (const [label, api, store] of [
    ['LINE has no picture', lineApi({ content: async () => null }), undefined],
    ['a type the page does not keep', lineApi({ content: async () => ({ buffer: JPEG, mimeType: 'image/heic' }) }), undefined],
    ['empty', lineApi({ content: async () => ({ buffer: Buffer.alloc(0), mimeType: 'image/jpeg' }) }), undefined],
    ['over 10 MB', lineApi({ content: async () => ({ buffer: Buffer.alloc(10 * 1024 * 1024 + 1), mimeType: 'image/jpeg' }) }), undefined],
    ['the storage is down', undefined, fakeStore({ async putMedia() { throw new Error('save picture: fetch failed'); } })],
  ]) {
    const h = ingestWith({ api, store });
    const r = await h.ing.handle({ channelKey: 'main', token: 't', ev: { ...textEv(U1, ''), message: { id: 'IMG-2', type: 'image' } } });
    assert.equal(r.handled, true, label);
    assert.equal(h.calls.ingest[0].kind, 'image', label);
    assert.equal(h.calls.ingest[0].meta.path, undefined, `${label}: no path, so the page shows the note, not a broken picture`);
    assert.match(h.calls.ingest[0].body, /^\[รูปภาพ\] .*LINE OA Manager|เก็บรูปไม่สำเร็จ/, label);
  }
});

test('a PDF the customer sends is saved as a PDF and opens from the chat; a file that is not a PDF, or cannot be had, is noted by name as before', async () => {
  const PDF_BYTES = Buffer.from('%PDF-1.4\n% test\n', 'latin1');
  const pdfApi = () => lineApi({ content: async () => ({ buffer: PDF_BYTES, mimeType: 'application/octet-stream' }) });
  const ok = ingestWith({ api: pdfApi() });
  await ok.ing.handle({ channelKey: 'main', token: 't', ev: { ...textEv(U1, ''), message: { id: 'PDF-1', type: 'file', fileName: 'ไวนิลประตูม.3.pdf', fileSize: PDF_BYTES.length } } });
  assert.deepEqual(ok.calls.media, [{ path: 'line/main/PDF-1.pdf', size: PDF_BYTES.length, type: 'application/pdf' }]);
  const m = ok.calls.ingest[0];
  assert.deepEqual([m.kind, m.body, m.meta.path, m.meta.name, m.meta.type], ['file', '[ไฟล์] ไวนิลประตูม.3.pdf', 'line/main/PDF-1.pdf', 'ไวนิลประตูม.3.pdf', 'application/pdf']);

  const storageDown = fakeStore({ async putMedia() { throw new Error('save file: fetch failed'); } });
  for (const [label, msg, api, store] of [
    ['a Word file (the page keeps PDFs only)', { id: 'DOC-1', type: 'file', fileName: 'ใบเสนอราคา.docx', fileSize: 900 }, undefined, undefined],
    ['LINE has no file', { id: 'PDF-2', type: 'file', fileName: 'a.pdf', fileSize: 10 }, lineApi({ content: async () => null }), undefined],
    ['named .pdf but not a PDF inside', { id: 'PDF-3', type: 'file', fileName: 'a.pdf', fileSize: 10 }, lineApi({ content: async () => ({ buffer: Buffer.from('hello'), mimeType: 'application/pdf' }) }), undefined],
    ['over 10 MB', { id: 'PDF-4', type: 'file', fileName: 'big.pdf', fileSize: 1 }, lineApi({ content: async () => ({ buffer: Buffer.concat([Buffer.from('%PDF'), Buffer.alloc(10 * 1024 * 1024)]), mimeType: 'application/pdf' }) }), undefined],
    ['the storage is down', { id: 'PDF-5', type: 'file', fileName: 'c.pdf', fileSize: 10 }, pdfApi(), storageDown],
  ]) {
    const h = ingestWith({ api, store });
    const r = await h.ing.handle({ channelKey: 'main', token: 't', ev: { ...textEv(U1, ''), message: msg } });
    assert.equal(r.handled, true, label);
    assert.equal(h.calls.ingest[0].kind, 'file', label);
    assert.equal(h.calls.ingest[0].meta.path, undefined, `${label}: no path, so the page shows the name only`);
    assert.match(h.calls.ingest[0].body, /^\[ไฟล์\] /, label);
  }
});

test('a database that does not answer is tried again (the same LINE id, so nothing doubles); one that refuses the data is not', async () => {
  let n = 0;
  const flaky = ingestWith({
    store: fakeStore({
      async ingest(p) {
        n++;
        if (n <= 2) throw Object.assign(new Error('ingest: fetch failed'), { code: undefined });
        return { duplicate: false, thread_id: 't9', msg_id: 'g9' };
      },
    }),
  });
  assert.equal((await flaky.ing.handle({ channelKey: 'main', token: 't', ev: textEv(U1, 'ลองใหม่') })).thread_id, 't9');
  assert.equal(n, 3);

  let m = 0;
  const refused = ingestWith({ store: fakeStore({ async ingest() { m++; throw Object.assign(new Error('ingest: saleline: ชนิดข้อความไม่ถูกต้อง'), { code: 'P0001' }); } }) });
  await assert.rejects(refused.ing.handle({ channelKey: 'main', token: 't', ev: textEv(U1, 'x') }), /ชนิดข้อความ/);
  assert.equal(m, 1, 'not tried again: it would be refused again');

  let k = 0;
  const down = ingestWith({ store: fakeStore({ async ingest() { k++; throw Object.assign(new Error('ingest: timeout'), { code: '57014' }); } }) });
  await assert.rejects(down.ing.handle({ channelKey: 'main', token: 't', ev: textEv(U1, 'x') }), /timeout/);
  assert.equal(k, 4, 'the first try and three more, then it gives up (the message stays in LINE OA Manager)');
});

// ---- staff replies out ----------------------------------------------------------------------------------------------------------

test('what LINE answered → what the page is told: only an acceptance is “sent”', () => {
  assert.deepEqual(classifyPush({ ok: true, status: 200, requestId: 'req-1' }), { result: 'sent', requestId: 'req-1' });
  assert.deepEqual(classifyPush({ ok: false, status: 409, accepted: 'req-0', error: 'conflict' }), { result: 'sent', requestId: 'req-0' }, 'LINE says it already took this very request');
  assert.equal(classifyPush({ ok: false, status: 409, error: 'conflict' }).result, 'failed', 'a 409 without the first request’s id proves nothing');
  assert.equal(classifyPush({ ok: false, status: 0, network: true, error: 'fetch failed' }).result, 'retry');
  assert.equal(classifyPush({ ok: false, status: 503, error: 'busy' }).result, 'retry');
  assert.equal(classifyPush(undefined).result, 'retry');
  for (const [status, re] of [[429, /โควตา/], [403, /บล็อก/], [401, /โทเคน/], [400, /ไม่รับ/], [404, /LINE ตอบ 404/]]) {
    const c = classifyPush({ ok: false, status, error: 'Failed' });
    assert.equal(c.result, 'failed', String(status));
    assert.match(c.error, re);
    assert.match(c.error, /Failed/, 'LINE’s own words are kept for whoever has to look');
  }
});

function outboxWith({ jobs = [], mode = 'on', pilot = [U1], push, finishFails = false, sent = [] } = {}) {
  const pushes = [];
  const fs = fakeStore({
    async claim() {
      const j = jobs.splice(0);
      return j;
    },
    async finish(id, result, error, requestId) {
      if (finishFails) throw new Error('database down');
      fs.calls.finish.push({ id, result, error, requestId });
      return { changed: true };
    },
  });
  const ob = createSaleOutbox({
    store: fs.store,
    push: push ?? (async (...a) => (pushes.push(a), { ok: true, status: 200, requestId: 'line-req-9' })),
    tokenFor: (ch) => (ch === 'main' ? 'main-token' : ''),
    getConfig: () => ({ mode, pilotUserIds: pilot }),
    onSent: (job) => sent.push(job.id),
    log: silent,
  });
  return { ob, pushes, sent, ...fs };
}
const job = (over = {}) => ({ id: 'o1', channel_key: 'main', line_user_id: U1, body: 'รับรายการแล้วนะคะ', retry_key: '3cb352dd-a38d-44ff-932a-1bd6c4cd9090', attempts: 1, ...over });

test('a queued reply is pushed to the customer it belongs to, with the queue’s retry key, and reported sent only after LINE accepted it', async () => {
  const h = outboxWith({ jobs: [job()] });
  assert.deepEqual(await h.ob.tick(), { jobs: 1, sent: 1 });
  assert.deepEqual(h.pushes, [[U1, [{ type: 'text', text: 'รับรายการแล้วนะคะ' }], 'main-token', '3cb352dd-a38d-44ff-932a-1bd6c4cd9090']]);
  assert.deepEqual(h.calls.finish, [{ id: 'o1', result: 'sent', error: null, requestId: 'line-req-9' }]);
  assert.deepEqual(h.sent, ['o1'], 'the bot is told a person is with this customer');
});

test('LINE refuses: failed with the reason and nothing says “sent”; LINE or the network fails: retry; neither calls the quiet hook', async () => {
  const quota = outboxWith({ jobs: [job()], push: async () => ({ ok: false, status: 429, error: 'You have reached your monthly limit.' }) });
  await quota.ob.tick();
  assert.equal(quota.calls.finish[0].result, 'failed');
  assert.match(quota.calls.finish[0].error, /โควตา.*monthly limit/);
  assert.deepEqual(quota.sent, []);

  const down = outboxWith({ jobs: [job()], push: async () => ({ ok: false, status: 0, network: true, error: 'fetch failed' }) });
  assert.deepEqual(await down.ob.tick(), { jobs: 1, sent: 0 });
  assert.equal(down.calls.finish[0].result, 'retry');
  assert.deepEqual(down.sent, []);

  const accepted = outboxWith({ jobs: [job()], push: async () => ({ ok: false, status: 409, accepted: 'earlier-req' }) });
  await accepted.ob.tick();
  assert.deepEqual(accepted.calls.finish[0], { id: 'o1', result: 'sent', error: null, requestId: 'earlier-req' });
});

test('off: nothing is taken from the queue; pilot: a reply to someone outside the list is refused, not sent; an unknown OA channel has no token', async () => {
  const off = outboxWith({ jobs: [job()], mode: 'off' });
  assert.deepEqual(await off.ob.tick(), { skipped: 'off' });
  assert.equal(off.calls.claim, 0, 'not even asked');

  const pilot = outboxWith({ jobs: [job({ id: 'o2', line_user_id: U2 })], mode: 'pilot', pilot: [U1] });
  await pilot.ob.tick();
  assert.equal(pilot.pushes.length, 0, 'nothing reached LINE');
  assert.equal(pilot.calls.finish[0].result, 'failed');
  assert.match(pilot.calls.finish[0].error, /รายชื่อทดสอบ/);

  const other = outboxWith({ jobs: [job({ id: 'o3', channel_key: 'second' })] });
  await other.ob.tick();
  assert.equal(other.pushes.length, 0);
  assert.match(other.calls.finish[0].error, /โทเคน/);
});

test('if the result cannot be reported the pass goes on and the message is left for the next pass (same key, so LINE does not send it twice); passes never overlap', async () => {
  const h = outboxWith({ jobs: [job(), job({ id: 'o2' })], finishFails: true });
  assert.deepEqual(await h.ob.tick(), { jobs: 2, sent: 0 }, 'nothing is counted as sent when the page was not told');
  assert.equal(h.pushes.length, 2);

  let release;
  const slow = outboxWith({ jobs: [job()], push: () => new Promise((r) => (release = () => r({ ok: true, status: 200, requestId: 'r' }))) });
  const first = slow.ob.tick();
  await wait(10);
  assert.deepEqual(await slow.ob.tick(), { skipped: 'busy' });
  release();
  assert.deepEqual(await first, { jobs: 1, sent: 1 });
});

// ---- the whole bridge ---------------------------------------------------------------------------------------------------------

function bridge({ mode = 'on', store, now, api, retries } = {}) {
  const fs = store ?? fakeStore();
  const cfg = { mode, pilotUserIds: [U1], channelKey: 'main' };
  const b = createSaleChat({ db: {}, store: fs.store, getConfig: () => cfg, lineApi: api ?? lineApi(), push: async () => ({ ok: true, status: 200 }), tokenFor: () => 'tok', build: 'abc1234', log: silent, now, retries: retries ?? [0], tickMs: 15, beatMs: 25 });
  return { b, cfg, ...fs };
}

test('record(): nothing while off; while on, one customer’s messages are saved in the order they came and other customers do not wait for them', async () => {
  const off = bridge({ mode: 'off' });
  off.b.record('main', textEv(U1, 'x'), 'tok');
  await wait(20);
  assert.equal(off.calls.ingest.length, 0);

  const order = [];
  const slow = bridge({
    mode: 'on',
    store: fakeStore({
      async ingest(p) {
        order.push(`start ${p.body}`);
        if (p.body === 'first') await wait(40);
        order.push(`end ${p.body}`);
        return { duplicate: false, thread_id: 't', msg_id: 'm' };
      },
    }),
  });
  slow.b.record('main', textEv(U1, 'first', 'a'), 'tok');
  slow.b.record('main', textEv(U1, 'second', 'b'), 'tok');
  slow.b.record('main', textEv(U2, 'other', 'c'), 'tok');
  await wait(120);
  assert.deepEqual(order.filter((x) => /first|second/.test(x)), ['start first', 'end first', 'start second', 'end second'], 'the same customer: in order');
  assert.ok(order.indexOf('start other') < order.indexOf('end first'), 'another customer is not held up by it');
});

test('record() never throws and never leaves an unhandled rejection, whatever goes wrong inside', async () => {
  const boom = bridge({ store: fakeStore({ async ingest() { throw new Error('database exploded'); } }), retries: [] });
  const unhandled = [];
  const onUnhandled = (e) => unhandled.push(e);
  process.on('unhandledRejection', onUnhandled);
  try {
    assert.doesNotThrow(() => boom.b.record('main', textEv(U1, 'x'), 'tok'));
    assert.doesNotThrow(() => boom.b.record('main', null, 'tok'));
    assert.doesNotThrow(() => boom.b.record('main', { type: 'message' }, 'tok'));
    await wait(40);
  } finally {
    process.off('unhandledRejection', onUnhandled);
  }
  assert.deepEqual(unhandled, []);
});

test('the heartbeat tells the page the mode, the build and (at most every 30 minutes) the LINE quota; no quota from LINE is no quota, not an error', async () => {
  let t = 1_762_000_000_000;
  let asked = 0;
  const h = bridge({ now: () => t, api: lineApi({ quota: async () => (asked++, { type: 'limited', limit: 300, used: 120 }) }) });
  await h.b.beat();
  await h.b.beat();
  assert.equal(asked, 1, 'asked once');
  assert.deepEqual(h.calls.beat[1], { channel: 'main', mode: 'on', build: 'abc1234', detail: { quota: { type: 'limited', limit: 300, used: 120, at: new Date(t).toISOString() }, cards: { card: 'off', teamCard: 'off' } } });
  t += 31 * 60_000;
  await h.b.beat();
  assert.equal(asked, 2);

  const off = bridge({ mode: 'off', api: lineApi({ quota: async () => { throw new Error('should not be asked while off'); } }) });
  await off.b.beat();
  assert.deepEqual(off.calls.beat[0], { channel: 'main', mode: 'off', build: 'abc1234', detail: { cards: { card: 'off', teamCard: 'off' } } }, 'off still says “I am here, and I am off”');

  const noQuota = bridge({ api: lineApi({ quota: async () => null }) });
  await noQuota.b.beat();
  assert.deepEqual(noQuota.calls.beat[0].detail, { cards: { card: 'off', teamCard: 'off' } }, 'no quota: no quota key');
});

test('start() runs the send pass and the heartbeat on their own timers; stop() ends them', async () => {
  const h = bridge();
  h.b.start();
  await wait(120);
  h.b.stop();
  const claimed = h.calls.claim;
  const beats = h.calls.beat.length;
  assert.ok(claimed >= 3, `claimed ${claimed}`);
  assert.ok(beats >= 3, `beats ${beats}`);
  await wait(80);
  assert.equal(h.calls.claim, claimed, 'stopped');
  assert.equal(h.calls.beat.length, beats);
});

test('a database that is not ready is reported once, not every few seconds, and a bridge with a broken database still starts', async () => {
  const lines = [];
  const store = fakeStore({ async claim() { throw new Error('claim: relation "sale_line_out" does not exist'); }, async beat() { throw new Error('beat: function sale_line_beat does not exist'); } }).store;
  const b = createSaleChat({ db: {}, store, getConfig: () => ({ mode: 'on', pilotUserIds: [] }), lineApi: lineApi(), push: async () => ({ ok: true }), tokenFor: () => 't', log: { error: (...a) => lines.push(a.join(' ')), log() {} }, tickMs: 10, beatMs: 10 });
  assert.doesNotThrow(() => b.start());
  await wait(120);
  b.stop();
  assert.equal(lines.filter((l) => /send pass/.test(l)).length, 1);
  assert.equal(lines.filter((l) => /heartbeat/.test(l)).length, 1);
});
