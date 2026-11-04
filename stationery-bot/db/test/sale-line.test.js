// "แชตและออเดอร์" · migration 003_sale_line_bridge on PostgreSQL (PGlite) shaped like production (db/helpers/sale-db.js):
// a LINE customer's messages become a chat in the page (once each, in order), a staff reply is queued and counts as sent only when the
// bot says LINE accepted it, a message that waited too long is not sent late, a repeated send never reaches the customer twice,
// only the bot writes inbound messages and delivery results, and the reverse script takes the bridge away while keeping the chats.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openSaleDb, asAnon, migration003, reverse003 } from '../helpers/sale-db.js';
import { asStaff, asService } from '../helpers/shop-db.js';

const U1 = 'U' + '1'.repeat(32);
const U2 = 'U' + '2'.repeat(32);
const U3 = 'U' + '3'.repeat(32);
const U4 = 'U' + '4'.repeat(32);
const U5 = 'U' + '5'.repeat(32);
const U6 = 'U' + '6'.repeat(32);
const U7 = 'U' + '7'.repeat(32);
const U8 = 'U' + '8'.repeat(32);
const U9 = 'U' + '9'.repeat(32);
const MANUAL = '66666666-6666-4666-8666-666666666699';

let db;
let n = 0;
const rows = (sql, params = []) => db.query(sql, params).then((r) => r.rows);
const one = async (sql, params = []) => (await rows(sql, params))[0];
const count = async (sql, params = []) => (await one(`select count(*)::int n from (${sql}) x`, params)).n;
const mid = () => `LINE-MSG-${++n}`;
const ingest = (over = {}) =>
  asService(db, (tx) =>
    tx.query('select public.sale_line_ingest($1::jsonb) as r', [
      JSON.stringify({ channel_key: 'main', line_user_id: U1, line_message_id: mid(), kind: 'text', body: 'สวัสดีค่ะ', name: 'คุณปู', ...over }),
    ]),
  ).then((r) => r.rows[0].r);
const send = (thread, text, token = `tok-${++n}`, order = null, by = 'ฟิล์ม') =>
  asStaff(db, (tx) => tx.query('select public.sale_line_send($1::uuid, $2, $3, $4, $5::uuid) as r', [thread, text, token, by, order])).then((r) => r.rows[0].r);
const claim = (limit = 5, stale = 90) => asService(db, (tx) => tx.query('select public.sale_line_claim($1, $2) as r', [limit, stale])).then((r) => r.rows[0].r);
const finish = (id, result, error = null, request = null) =>
  asService(db, (tx) => tx.query('select public.sale_line_finish($1::uuid, $2, $3, $4) as r', [id, result, error, request])).then((r) => r.rows[0].r);
const retry = (id) => asStaff(db, (tx) => tx.query('select public.sale_line_retry($1::uuid, $2) as r', [id, 'ฟิล์ม'])).then((r) => r.rows[0].r);
const out = (id) => one('select * from sale_line_out where id = $1', [id]);
const msgOf = (id) => one('select * from sale_msgs where id = $1', [id]);
const lineChat = async (user = U1, over = {}) => (await ingest({ line_user_id: user, ...over })).thread_id;

before(async () => {
  db = await openSaleDb({ line: true });
  await db.query(`insert into sale_threads (id, title, source) values ($1, 'แชตที่เปิดเองในหลังร้าน', 'manual')`, [MANUAL]);
});
after(() => db?.close());

test('the first message of a LINE customer opens a chat for them, and the next messages join it', async () => {
  const a = await ingest({ line_user_id: U1, body: 'อยากสั่งกระดาษ A4 ค่ะ', name: 'คุณปู', picture: 'https://profile.line-scdn.net/p1' });
  assert.equal(a.duplicate, false);
  assert.equal(a.created_thread, true);
  const t = await one('select * from sale_threads where id = $1', [a.thread_id]);
  assert.deepEqual([t.source, t.title, t.stage, t.unread, t.last_text, t.customer_id], ['line', 'คุณปู', 'talk', 1, 'อยากสั่งกระดาษ A4 ค่ะ', null]);
  const link = await one('select * from sale_line_links where thread_id = $1', [a.thread_id]);
  assert.deepEqual([link.channel_key, link.line_user_id, link.line_name, link.picture_url], ['main', U1, 'คุณปู', 'https://profile.line-scdn.net/p1']);
  const m = await msgOf(a.msg_id);
  assert.deepEqual([m.thread_id, m.dir, m.kind, m.body, m.by_name], [a.thread_id, 'in', 'text', 'อยากสั่งกระดาษ A4 ค่ะ', 'คุณปู']);
  assert.equal(m.meta.src, 'line');

  const b = await ingest({ line_user_id: U1, body: 'ขอราคาด้วยนะคะ', name: 'ปู (เปลี่ยนชื่อแล้ว)' });
  assert.equal(b.thread_id, a.thread_id, 'the same customer, the same chat');
  assert.equal(b.created_thread, false);
  const t2 = await one('select * from sale_threads where id = $1', [a.thread_id]);
  assert.deepEqual([t2.unread, t2.last_text, t2.title], [2, 'ขอราคาด้วยนะคะ', 'คุณปู'], 'two unread, the preview is the latest, and the chat is not renamed behind the staff');
  assert.equal((await one('select line_name from sale_line_links where thread_id = $1', [a.thread_id])).line_name, 'ปู (เปลี่ยนชื่อแล้ว)', 'the link keeps the newest LINE name');
  assert.equal(await count('select 1 from sale_threads where id = $1', [a.thread_id]), 1);
});

test('the same LINE message arriving twice is written once (LINE or the bot retried)', async () => {
  const id = mid();
  const a = await ingest({ line_user_id: U2, line_message_id: id, body: 'ไม้บรรทัด 10 อัน' });
  const b = await ingest({ line_user_id: U2, line_message_id: id, body: 'ไม้บรรทัด 10 อัน' });
  assert.equal(b.duplicate, true);
  assert.equal(b.msg_id, a.msg_id);
  assert.equal(b.thread_id, a.thread_id);
  assert.equal(await count('select 1 from sale_msgs where thread_id = $1', [a.thread_id]), 1);
  assert.equal((await one('select unread from sale_threads where id = $1', [a.thread_id])).unread, 1, 'the unread count is not raised twice');
});

test('two customers are two chats, and the same LINE id on another OA channel is another chat', async () => {
  const a = await ingest({ line_user_id: U3, name: 'ครูสมศรี' });
  const b = await ingest({ line_user_id: U4, name: 'คุณกิตติ' });
  const c = await ingest({ channel_key: 'second', line_user_id: U3, name: 'ครูสมศรี' });
  assert.equal(new Set([a.thread_id, b.thread_id, c.thread_id]).size, 3);
  assert.equal(await count(`select 1 from sale_line_links where line_user_id = $1`, [U3]), 2);
  // a LINE message id is only unique within its channel
  const same = 'SAME-ID-ON-TWO-OAS';
  const x = await ingest({ channel_key: 'main', line_user_id: U4, line_message_id: same });
  const y = await ingest({ channel_key: 'second', line_user_id: U4, line_message_id: same });
  assert.equal(x.duplicate, false);
  assert.equal(y.duplicate, false);
});

test('a late message does not replace the preview of a newer one, and each message keeps the time LINE gave it', async () => {
  const now = Date.now();
  const first = await ingest({ line_user_id: U5, body: 'ข้อความใหม่', at_ms: now - 60_000 });
  await ingest({ line_user_id: U5, body: 'ข้อความเก่าที่มาช้า', at_ms: now - 3_600_000 });
  const t = await one('select * from sale_threads where id = $1', [first.thread_id]);
  assert.equal(t.last_text, 'ข้อความใหม่');
  assert.ok(Math.abs(new Date(t.last_at).getTime() - (now - 60_000)) < 2000);
  assert.equal(t.unread, 2, 'both are unread');
  const order = (await rows('select body from sale_msgs where thread_id = $1 order by created_at', [first.thread_id])).map((r) => r.body);
  assert.deepEqual(order, ['ข้อความเก่าที่มาช้า', 'ข้อความใหม่']);

  // a time in the future (a wrong clock) or no usable time is the time of receiving
  const future = await ingest({ line_user_id: U5, at_ms: now + 86_400_000 });
  const junk = await ingest({ line_user_id: U5, at_ms: 'abc' });
  for (const r of [future, junk]) {
    const m = await msgOf(r.msg_id);
    assert.ok(Math.abs(new Date(m.created_at).getTime() - Date.now()) < 5000, 'stamped when received');
  }
});

test('stickers, pictures and files arrive as readable messages; a wrong kind or missing id is refused; a long text is cut at LINE’s limit', async () => {
  const t = await lineChat(U6, { name: 'คุณมะลิ' });
  const sticker = await ingest({ line_user_id: U6, kind: 'sticker', body: '[สติกเกอร์]', meta: { packageId: '1', stickerId: '2' } });
  const image = await ingest({ line_user_id: U6, kind: 'image', body: '[รูปภาพ]', meta: { path: 'line/main/123.jpg', name: 'รูปจากลูกค้า', size: 2048, type: 'image/jpeg' } });
  const file = await ingest({ line_user_id: U6, kind: 'file', body: '[ไฟล์] ใบเสนอราคา.pdf', meta: { name: 'ใบเสนอราคา.pdf', size: 10 } });
  assert.equal((await msgOf(sticker.msg_id)).kind, 'sticker');
  const im = await msgOf(image.msg_id);
  assert.deepEqual([im.kind, im.meta.path, im.meta.src, im.dir], ['image', 'line/main/123.jpg', 'line', 'in'], 'the page already shows kind=image with meta.path as a picture');
  assert.equal((await msgOf(file.msg_id)).body, '[ไฟล์] ใบเสนอราคา.pdf');
  assert.equal((await one('select last_text from sale_threads where id = $1', [t])).last_text, '[ไฟล์] ใบเสนอราคา.pdf');

  await assert.rejects(ingest({ line_user_id: U6, kind: 'script' }), /ชนิดข้อความ/);
  await assert.rejects(ingest({ line_user_id: U6, line_message_id: '' }), /เลขข้อความ/);
  await assert.rejects(ingest({ line_user_id: '' }), /ผู้ใช้ LINE/);
  await assert.rejects(ingest({ channel_key: '' }), /ช่อง LINE/);
  const long = await ingest({ line_user_id: U6, body: 'ก'.repeat(9000) });
  assert.equal((await msgOf(long.msg_id)).body.length, 5000);
  assert.equal((await one('select last_text from sale_threads where id = $1', [t])).last_text.length, 120, 'the preview is short');
});

test('a chat opened before the customer’s name was known takes the name when it arrives, and a name set later is not overwritten', async () => {
  const a = await ingest({ line_user_id: U7, name: null, body: 'สวัสดีค่ะ' });
  assert.equal((await one('select title from sale_threads where id = $1', [a.thread_id])).title, 'ลูกค้า LINE');
  await ingest({ line_user_id: U7, name: 'คุณแก้ว' });
  assert.equal((await one('select title from sale_threads where id = $1', [a.thread_id])).title, 'คุณแก้ว');
  await db.query(`update sale_threads set title = 'ลูกค้าประจำ คุณแก้ว' where id = $1`, [a.thread_id]);
  await ingest({ line_user_id: U7, name: 'Kaew' });
  assert.equal((await one('select title from sale_threads where id = $1', [a.thread_id])).title, 'ลูกค้าประจำ คุณแก้ว');
});

test('who can do what: visitors nothing; staff read the status, the links and the queue but write nowhere directly; only the bot writes inbound messages and results', async () => {
  const t = await lineChat(U8);
  const sent = await send(t, 'ทดสอบสิทธิ์', 'perm-1');
  const fns = {
    ingest: ["select public.sale_line_ingest('{}'::jsonb)"],
    claim: ['select public.sale_line_claim(5, 90)'],
    finish: [`select public.sale_line_finish('${sent.out_id}'::uuid, 'sent', null, null)`],
    beat: [`select public.sale_line_beat('main', 'on', 'x', '{}'::jsonb)`],
    mirror: [`select public._sale_line_mirror('${sent.out_id}'::uuid)`],
    send: [`select public.sale_line_send('${t}'::uuid, 'x', 'anon-1', 'x', null)`],
    retry: [`select public.sale_line_retry('${sent.out_id}'::uuid, 'x')`],
  };
  for (const [name, [sql]] of Object.entries(fns)) {
    await assert.rejects(asAnon(db, (tx) => tx.query(sql)), /permission denied/, `a visitor cannot call ${name}`);
  }
  for (const name of ['ingest', 'claim', 'finish', 'beat', 'mirror']) {
    await assert.rejects(asStaff(db, (tx) => tx.query(fns[name][0])), /permission denied/, `staff cannot call ${name}: it is the bot’s`);
  }
  // staff may send and retry (that is the screen’s job) and read what the bot reports
  await asStaff(db, async (tx) => {
    assert.ok((await tx.query('select 1 from sale_line_out')).rows.length >= 1);
    await tx.query('select * from sale_line_links');
    await tx.query('select * from sale_line_status');
  });
  for (const sql of [
    `insert into sale_line_out (msg_id, thread_id, channel_key, line_user_id, body) select msg_id, thread_id, channel_key, 'Uevil', 'x' from sale_line_out limit 1`,
    `update sale_line_out set status = 'sent'`,
    `update sale_line_out set line_user_id = 'Uevil'`,
    `delete from sale_line_out`,
    `insert into sale_line_links (thread_id, channel_key, line_user_id) values ('${MANUAL}', 'main', 'Uevil')`,
    `update sale_line_links set line_user_id = 'Uevil'`,
    `insert into sale_line_status (channel_key, mode) values ('fake', 'on')`,
    `update sale_line_status set mode = 'on'`,
    `select * from sale_line_msgs`,
  ]) {
    await assert.rejects(asStaff(db, (tx) => tx.query(sql)), /permission denied|row-level security/, `staff: ${sql.slice(0, 50)}…`);
  }
  for (const table of ['sale_line_out', 'sale_line_links', 'sale_line_status', 'sale_line_msgs']) {
    await assert.rejects(asAnon(db, (tx) => tx.query(`select * from ${table}`)), /permission denied|row-level security/, `a visitor reads nothing in ${table}`);
  }
  assert.equal((await out(sent.out_id)).status, 'queued', 'none of that changed the message');
});

test('a staff reply is queued, not “sent”: it shows in the chat as waiting, goes to the customer the chat is linked to, and a double click makes one message', async () => {
  const t = await lineChat(U9, { name: 'คุณเอ' });
  const r = await send(t, '  รับรายการแล้วนะคะ  ', 'click-1');
  assert.deepEqual([r.duplicate, r.status], [false, 'queued']);
  const o = await out(r.out_id);
  assert.deepEqual([o.status, o.body, o.line_user_id, o.channel_key, o.attempts, o.thread_id], ['queued', 'รับรายการแล้วนะคะ', U9, 'main', 0, t]);
  assert.ok(new Date(o.expires_at) - new Date(o.created_at) === 30 * 60_000, 'it waits 30 minutes at most');
  const m = await msgOf(r.msg_id);
  assert.deepEqual([m.dir, m.kind, m.body, m.by_name, m.meta.delivery, m.meta.out_id], ['out', 'text', 'รับรายการแล้วนะคะ', 'ฟิล์ม', 'queued', r.out_id]);
  assert.equal((await one('select last_text from sale_threads where id = $1', [t])).last_text, 'รับรายการแล้วนะคะ');
  assert.equal((await one('select unread from sale_threads where id = $1', [t])).unread, 1, 'the customer’s unread message stays unread until someone opens the chat');

  const again = await send(t, 'รับรายการแล้วนะคะ', 'click-1');
  assert.deepEqual([again.duplicate, again.out_id, again.msg_id], [true, r.out_id, r.msg_id]);
  const both = await Promise.all([send(t, 'พร้อมกัน', 'click-2'), send(t, 'พร้อมกัน', 'click-2')]);
  assert.equal(new Set(both.map((x) => x.out_id)).size, 1);
  assert.equal(await count(`select 1 from sale_line_out where client_token = 'click-2'`), 1);
  assert.equal(await count(`select 1 from sale_msgs where thread_id = $1 and body = 'พร้อมกัน'`, [t]), 1);
  await assert.rejects(send(MANUAL, 'ข้อความ', 'click-3'), /ไม่ได้มาจาก LINE OA/);
  const other = await lineChat(U2);
  await assert.rejects(send(other, 'ข้อความ', 'click-1'), /รหัสนี้ถูกใช้กับแชตอื่น/, 'the same token cannot be reused for another chat');
  assert.equal(await count(`select 1 from sale_msgs where thread_id = $1 and dir = 'out'`, [other]), 0);
});

test('what staff may send: not empty, not more than LINE’s 5,000 characters, only with a token, only in a chat that is from LINE', async () => {
  const t = await lineChat(U1);
  await assert.rejects(send(t, '   ', 'v-1'), /ข้อความว่าง/);
  await assert.rejects(send(t, 'ก'.repeat(5001), 'v-2'), /5,000/);
  await assert.rejects(send(t, 'สวัสดี', ''), /รหัสกันส่งซ้ำ/);
  await assert.rejects(send('00000000-0000-4000-8000-000000000000', 'สวัสดี', 'v-3'), /ไม่ได้มาจาก LINE OA/);
  await assert.rejects(send(MANUAL, 'สวัสดี', 'v-4'), /ไม่ได้มาจาก LINE OA/);
  const ok = await send(t, 'ก'.repeat(5000), 'v-5');
  assert.equal((await out(ok.out_id)).body.length, 5000);
  const other = await lineChat(U2);
  await assert.rejects(send(other, 'สวัสดี', 'v-5'), /รหัสนี้ถูกใช้กับแชตอื่น/);
});

test('delivery: the bot takes the message, LINE accepts it, and only then it is “sent” (in the queue and in the chat)', async () => {
  const t = await lineChat(U3);
  const r = await send(t, 'ส่งถึงลูกค้าจริงไหม', 'life-1');
  const got = (await claim()).find((x) => x.id === r.out_id);
  assert.ok(got, 'the bot gets it');
  assert.deepEqual([got.line_user_id, got.body, got.channel_key, got.attempts], [U3, 'ส่งถึงลูกค้าจริงไหม', 'main', 1]);
  assert.match(got.retry_key, /^[0-9a-f-]{36}$/);
  assert.equal((await out(r.out_id)).status, 'sending');
  assert.equal((await msgOf(r.msg_id)).meta.delivery, 'queued', 'while LINE has not answered the chat still says it is waiting, never “sent”');
  assert.deepEqual((await claim()).filter((x) => x.id === r.out_id), [], 'a second bot does not get a message that is already being sent');

  const f = await finish(r.out_id, 'sent', null, 'line-req-123');
  assert.deepEqual([f.changed, f.status], [true, 'sent']);
  const o = await out(r.out_id);
  assert.deepEqual([o.status, o.line_request_id, o.error, o.ambiguous], ['sent', 'line-req-123', null, false]);
  assert.ok(o.finished_at);
  assert.equal((await msgOf(r.msg_id)).meta.delivery, 'sent');
  const again = await finish(r.out_id, 'failed', 'ช้าเกินไป', null);
  assert.deepEqual([again.changed, again.status], [false, 'sent'], 'a late or repeated report cannot turn a sent message into a failed one');
  await assert.rejects(finish(r.out_id, 'maybe'), /ผลการส่ง/);
  const queued = await send(t, 'ยังไม่ได้หยิบ', 'life-2');
  assert.equal((await finish(queued.out_id, 'sent', null, 'x')).changed, false, 'a message the bot never took cannot be reported as sent');
  assert.equal((await out(queued.out_id)).status, 'queued');
});

test('LINE refuses it (quota full, customer blocked…): failed with the reason; staff can send again, with a new LINE retry key', async () => {
  const t = await lineChat(U4);
  const r = await send(t, 'โควตาเต็มไหม', 'fail-1');
  const first = (await claim()).find((x) => x.id === r.out_id);
  const f = await finish(r.out_id, 'failed', '429 You have reached your monthly limit.');
  assert.equal(f.status, 'failed');
  const o = await out(r.out_id);
  assert.deepEqual([o.status, o.error, o.ambiguous], ['failed', '429 You have reached your monthly limit.', false]);
  const m = await msgOf(r.msg_id);
  assert.deepEqual([m.meta.delivery, m.meta.error], ['failed', '429 You have reached your monthly limit.']);
  assert.deepEqual((await claim()).filter((x) => x.id === r.out_id), [], 'a refused message is not tried again by itself');

  const re = await retry(r.out_id);
  assert.deepEqual([re.changed, re.status], [true, 'queued']);
  const second = (await claim()).find((x) => x.id === r.out_id);
  assert.notEqual(second.retry_key, first.retry_key, 'LINE clearly refused the first request, so the new one is a new request');
  assert.equal(second.attempts, 1);
  assert.equal((await finish(r.out_id, 'sent', null, 'ok-1')).status, 'sent');
  assert.deepEqual(await retry(r.out_id), { changed: false, status: 'sent' }, 'a sent message cannot be sent again');
  await assert.rejects(retry('00000000-0000-4000-8000-000000000000'), /ไม่พบ/);
});

test('LINE or the network did not answer: the bot is asked to try again later with the same key; after 4 tries it stops and says it is not sure', async () => {
  const t = await lineChat(U5);
  const r = await send(t, 'เครือข่ายหลุด', 'flaky-1');
  const keys = [];
  for (let i = 1; i <= 4; i++) {
    const got = (await claim()).find((x) => x.id === r.out_id);
    assert.ok(got, `try ${i} gets the message`);
    assert.equal(got.attempts, i);
    keys.push(got.retry_key);
    const f = await finish(r.out_id, 'retry', 'timeout');
    if (i < 4) {
      assert.equal(f.status, 'queued');
      assert.deepEqual((await claim()).filter((x) => x.id === r.out_id), [], 'it waits before the next try');
      assert.ok((await out(r.out_id)).not_before, 'with a time to wait until');
      await db.query(`update sale_line_out set not_before = now() - interval '1 second' where id = $1`, [r.out_id]);
    } else assert.equal(f.status, 'failed');
  }
  assert.equal(new Set(keys).size, 1, 'every try uses the same key, so LINE does not deliver it twice');
  const o = await out(r.out_id);
  assert.equal(o.ambiguous, true);
  assert.match(o.error, /timeout.*ไม่แน่ใจว่าถึงลูกค้าหรือไม่/);
  assert.match((await msgOf(r.msg_id)).meta.error, /ไม่แน่ใจ/);
  // staff send it again: the earlier request may have reached the customer, so the key stays the same and LINE answers "already accepted"
  assert.equal((await retry(r.out_id)).status, 'queued');
  const again = (await claim()).find((x) => x.id === r.out_id);
  assert.equal(again.retry_key, keys[0]);
  assert.equal(again.attempts, 1, 'a new round of tries');
});

test('a reply that waited more than 30 minutes is not sent late; a bot that stopped halfway leaves “unknown”, never “sent”', async () => {
  const t = await lineChat(U6);
  const stale = await send(t, 'ตอบช้าเกินไป', 'old-1');
  await db.query(`update sale_line_out set expires_at = now() - interval '1 minute' where id = $1`, [stale.out_id]);
  assert.deepEqual((await claim()).filter((x) => x.id === stale.out_id), [], 'it is not handed to the bot');
  const o = await out(stale.out_id);
  assert.equal(o.status, 'expired');
  assert.match(o.error, /30 นาที/);
  assert.equal((await msgOf(stale.msg_id)).meta.delivery, 'expired');
  assert.equal((await retry(stale.out_id)).status, 'queued', 'staff can send it again, with a fresh 30 minutes');
  assert.ok(new Date((await out(stale.out_id)).expires_at) > new Date(Date.now() + 25 * 60_000));
  assert.ok((await claim()).some((x) => x.id === stale.out_id));
  assert.equal((await finish(stale.out_id, 'sent', null, 'r')).status, 'sent');

  // the bot took it and went silent: another bot gets it after the wait (same key, safe); if its time is over too, nobody sends it
  const half = await send(t, 'บอทหยุดกลางคัน', 'half-1');
  const first = (await claim()).find((x) => x.id === half.out_id);
  assert.deepEqual((await claim()).filter((x) => x.id === half.out_id), [], 'not before the wait is over');
  await db.query(`update sale_line_out set claimed_at = now() - interval '5 minutes' where id = $1`, [half.out_id]);
  const second = (await claim()).find((x) => x.id === half.out_id);
  assert.equal(second.attempts, 2);
  assert.equal(second.retry_key, first.retry_key);
  await db.query(`update sale_line_out set claimed_at = now() - interval '5 minutes', expires_at = now() - interval '1 minute' where id = $1`, [half.out_id]);
  assert.deepEqual((await claim()).filter((x) => x.id === half.out_id), []);
  const u = await out(half.out_id);
  assert.deepEqual([u.status, u.ambiguous], ['unknown', true]);
  assert.equal((await msgOf(half.msg_id)).meta.delivery, 'unknown');
  assert.equal((await retry(half.out_id)).status, 'queued');
  assert.equal((await claim()).find((x) => x.id === half.out_id).retry_key, first.retry_key, 'the same key: if it had gone through, LINE does not send it twice');

  const ancient = await send(t, 'เก่ามาก', 'old-2');
  await db.query(`update sale_line_out set status = 'failed', created_at = now() - interval '24 hours' where id = $1`, [ancient.out_id]);
  await assert.rejects(retry(ancient.out_id), /เก่าเกิน 23 ชั่วโมง/);
});

test('sending an order summary: the order’s history gets the result only when it is known, once per result', async () => {
  const t = await lineChat(U7, { name: 'โรงเรียนตัวอย่าง' });
  const saved = await asStaff(db, (tx) =>
    tx.query('select public.sale_order_save($1::jsonb) as r', [
      JSON.stringify({ thread_id: t, client_token: 'sum-order-1', customer_name: 'โรงเรียนตัวอย่าง', by_name: 'ฟิล์ม', items: [{ name: 'กระดาษ A4', qty: 2, unit: 'รีม', unit_price: 135 }] }),
    ]),
  ).then((r) => r.rows[0].r);
  const orderId = saved.order.id;
  const events = () => rows(`select detail from sale_order_events where order_id = $1 and kind = 'send' order by created_at, id`, [orderId]).then((r) => r.map((x) => x.detail));
  const r = await send(t, 'สรุปใบสั่งงาน ORD…', 'sum-1', orderId);
  assert.deepEqual(await events(), [], 'queued is not a result');
  await claim();
  assert.deepEqual(await events(), [], 'neither is “being sent”');
  await finish(r.out_id, 'failed', 'ผู้ใช้บล็อก OA');
  let ev = await events();
  assert.equal(ev.length, 1);
  assert.deepEqual([ev[0].channel, ev[0].ok, ev[0].out_id, ev[0].out_status], ['line', false, r.out_id, 'failed']);
  assert.match(ev[0].detail, /ไม่สำเร็จ.*ผู้ใช้บล็อก OA/);
  await asService(db, (tx) => tx.query('select public._sale_line_mirror($1::uuid)', [r.out_id]));
  assert.equal((await events()).length, 1, 'looking at the same result again does not write it again');
  await retry(r.out_id);
  await claim();
  await finish(r.out_id, 'sent', null, 'sum-req');
  ev = await events();
  assert.equal(ev.length, 2);
  assert.deepEqual([ev[1].ok, ev[1].out_status], [true, 'sent']);
  assert.match(ev[1].detail, /ถึงลูกค้าแล้ว/);

  const other = await lineChat(U8);
  await assert.rejects(send(other, 'สรุป', 'sum-2', orderId), /ไม่ใช่ของแชตนี้/);
  assert.equal(await count(`select 1 from sale_line_out where client_token = 'sum-2'`), 0);
  assert.equal(await count(`select 1 from sale_msgs where thread_id = $1 and body = 'สรุป'`, [other]), 0, 'nothing was left behind by the refused call');
});

test('the heartbeat: what the bot reports is what the screen shows, a wrong mode is “off”, and nothing in it comes from anyone else', async () => {
  const beat = (mode, detail = {}, channel = 'main') => asService(db, (tx) => tx.query('select public.sale_line_beat($1, $2, $3, $4::jsonb)', [channel, mode, 'abc1234def', JSON.stringify(detail)]));
  assert.equal(await count(`select 1 from sale_line_status where channel_key = 'main'`), 0, 'before any beat the screen has nothing to call “connected”');
  await beat('on', { quota: { type: 'limited', limit: 300, used: 120 } });
  let s = await one(`select * from sale_line_status where channel_key = 'main'`);
  assert.deepEqual([s.mode, s.build, s.detail.quota.limit], ['on', 'abc1234def', 300]);
  assert.ok(Math.abs(Date.now() - new Date(s.last_seen_at).getTime()) < 5000);
  assert.ok(s.last_in_at, 'the time of the latest customer message comes from the chats');
  await db.query(`update sale_line_status set last_seen_at = now() - interval '1 hour' where channel_key = 'main'`);
  await beat('pilot', { note: 'x' });
  s = await one(`select * from sale_line_status where channel_key = 'main'`);
  assert.equal(s.mode, 'pilot');
  assert.deepEqual([s.detail.quota.used, s.detail.note], [120, 'x'], 'details are added to, not replaced');
  assert.ok(Date.now() - new Date(s.last_seen_at).getTime() < 5000, 'seen just now');
  await beat('everything-on');
  assert.equal((await one(`select mode from sale_line_status where channel_key = 'main'`)).mode, 'off');
  await assert.rejects(beat('on', {}, ''), /ช่อง LINE/);
  const staffSees = await asStaff(db, (tx) => tx.query(`select mode from sale_line_status where channel_key = 'main'`));
  assert.equal(staffSees.rows[0].mode, 'off');
});

test('the bridge touches no order, stock or document: a whole conversation leaves the shop’s other data exactly as it was', async () => {
  const snap = async () => ({
    orders: await rows('select count(*)::int n, coalesce(sum(total), 0)::float s from orders'),
    orderItems: await rows('select count(*)::int n from order_items'),
    products: await rows('select count(*)::int n, coalesce(sum(stock_qty), 0)::float s from products'),
    stockMoves: await rows('select count(*)::int n from stock_moves'),
    sales: await rows('select count(*)::int n from sales'),
    saleItems: await rows('select count(*)::int n from sale_items'),
    customers: await rows('select count(*)::int n from customers'),
    schools: await rows('select count(*)::int n from schools'),
    saleOrders: await rows('select count(*)::int n from sale_orders'),
    saleOrderEvents: await rows('select count(*)::int n from sale_order_events'),
  });
  const before = await snap();
  const t = await lineChat(U9, { name: 'คุณทดสอบ' });
  await ingest({ line_user_id: U9, kind: 'image', body: '[รูปภาพ]', meta: { path: 'line/main/9.jpg' } });
  const r = await send(t, 'ได้รับแล้วค่ะ', 'side-1');
  await claim();
  await finish(r.out_id, 'sent', null, 'rq');
  assert.deepEqual(await snap(), before);
});

test('removing a chat or an order takes only its own bridge rows with it', async () => {
  const t = await lineChat(U1, { channel_key: 'gone', name: 'จะถูกลบ' });
  const r = await send(t, 'ก่อนลบ', 'del-1');
  const saved = await asStaff(db, (tx) =>
    tx.query('select public.sale_order_save($1::jsonb) as r', [JSON.stringify({ thread_id: t, client_token: 'del-order-1', customer_name: 'x', by_name: 'ฟิล์ม', items: [{ name: 'x', qty: 1, unit: 'อัน', unit_price: 1 }] })]),
  ).then((x) => x.rows[0].r);
  const withOrder = await send(t, 'สรุป', 'del-2', saved.order.id);
  await db.query('delete from sale_orders where id = $1', [saved.order.id]);
  assert.equal((await out(withOrder.out_id)).order_id, null, 'the message stays; it just no longer points at an order');
  // (as in production, sale_msgs.thread_id has no cascade: the messages go first, then the chat)
  await db.query('delete from sale_msgs where thread_id = $1', [t]);
  for (const table of ['sale_line_out', 'sale_line_msgs']) {
    assert.equal(await count(`select 1 from ${table} where thread_id = $1`, [t]), 0, `${table} follows the messages`);
  }
  assert.equal(await count('select 1 from sale_line_links where thread_id = $1', [t]), 1, 'the link stays while the chat exists');
  await db.query('delete from sale_threads where id = $1', [t]);
  assert.equal(await count('select 1 from sale_line_links where thread_id = $1', [t]), 0, 'and goes with the chat');
  assert.equal(await count('select 1 from sale_line_out where id = $1', [r.out_id]), 0);
});

test('the migration adds only its own tables and functions, changes nothing that was there, runs twice safely; the reverse takes back only the bridge and keeps the chats', async () => {
  const fresh = await openSaleDb();
  try {
    const fns = () => fresh.query(`select p.oid::regprocedure::text sig, md5(pg_get_functiondef(p.oid)) h from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' order by 1`).then((r) => r.rows);
    const cols = () => fresh.query(`select table_name, string_agg(column_name || ':' || data_type || ':' || coalesce(column_default, ''), ',' order by ordinal_position) c from information_schema.columns where table_schema = 'public' group by table_name order by table_name`).then((r) => r.rows);
    const pols = () => fresh.query(`select tablename, policyname, cmd, roles::text r from pg_policies where schemaname in ('public', 'storage') order by 1, 2`).then((r) => r.rows);
    const grants = () => fresh.query(`select table_name, grantee, privilege_type from information_schema.role_table_grants where table_schema = 'public' order by 1, 2, 3`).then((r) => r.rows);
    const buckets = () => fresh.query(`select id, public, file_size_limit, allowed_mime_types from storage.buckets order by id`).then((r) => r.rows);
    const idx = () => fresh.query(`select tablename, indexname from pg_indexes where schemaname = 'public' order by 1, 2`).then((r) => r.rows);
    const trg = () => fresh.query(`select event_object_table t, trigger_name from information_schema.triggers where trigger_schema = 'public' order by 1, 2`).then((r) => r.rows);
    await fresh.query(`insert into sale_threads (id, title) values ($1, 'ก่อนติดตั้ง')`, [MANUAL]);
    await fresh.query(`insert into sale_msgs (thread_id, dir, body) values ($1, 'in', 'ข้อความเดิม')`, [MANUAL]);
    const [f0, c0, p0, g0, b0, i0, t0] = [await fns(), await cols(), await pols(), await grants(), await buckets(), await idx(), await trg()];

    await fresh.exec(migration003());
    await fresh.exec(migration003());
    const [f1, c1, p1, g1, b1, i1, t1] = [await fns(), await cols(), await pols(), await grants(), await buckets(), await idx(), await trg()];
    assert.deepEqual(f1.filter((x) => f0.some((y) => y.sig === x.sig)), f0, 'every function that was there is byte-for-byte the same');
    assert.deepEqual(
      f1.filter((x) => !f0.some((y) => y.sig === x.sig)).map((x) => x.sig).sort(),
      [
        '_sale_line_mirror(uuid)',
        'sale_line_beat(text,text,text,jsonb)',
        'sale_line_claim(integer,integer)',
        'sale_line_finish(uuid,text,text,text)',
        'sale_line_ingest(jsonb)',
        'sale_line_retry(uuid,text)',
        'sale_line_send(uuid,text,text,text,uuid)',
      ].sort(),
    );
    assert.deepEqual(c1.filter((x) => c0.some((y) => y.table_name === x.table_name)), c0, 'every table that was there has exactly the same columns (sale_threads and sale_msgs included)');
    assert.deepEqual(c1.filter((x) => !c0.some((y) => y.table_name === x.table_name)).map((x) => x.table_name), ['sale_line_links', 'sale_line_msgs', 'sale_line_out', 'sale_line_status']);
    assert.deepEqual(
      p1.filter((x) => !p0.some((y) => y.tablename === x.tablename && y.policyname === x.policyname)).map((x) => `${x.tablename}:${x.policyname}:${x.cmd}:${x.r}`),
      ['sale_line_links:staff read sale_line_links:SELECT:{authenticated}', 'sale_line_out:staff read sale_line_out:SELECT:{authenticated}', 'sale_line_status:staff read sale_line_status:SELECT:{authenticated}'],
    );
    assert.deepEqual(g1.filter((x) => !x.table_name.startsWith('sale_line')), g0, 'no grant on an existing table changed');
    const mine = g1.filter((x) => x.table_name.startsWith('sale_line'));
    assert.equal(mine.filter((x) => x.grantee === 'anon').length, 0, 'a visitor has no grant on the new tables');
    assert.deepEqual(mine.filter((x) => x.grantee === 'authenticated').map((x) => `${x.table_name}:${x.privilege_type}`), ['sale_line_links:SELECT', 'sale_line_out:SELECT', 'sale_line_status:SELECT'], 'staff may only read three of them');
    assert.deepEqual(b1, b0, 'no bucket and no storage policy is added or changed (the pictures use the bucket 002 made)');
    assert.deepEqual(i1.filter((x) => i0.some((y) => y.indexname === x.indexname)), i0, 'no index on an existing table changed');
    assert.deepEqual(t1, t0, 'no trigger anywhere');

    await fresh.query(`select public.sale_line_ingest('{"channel_key":"main","line_user_id":"Ux","line_message_id":"M1","body":"ทักมา","name":"ลูกค้า"}'::jsonb)`);
    await fresh.exec(reverse003());
    assert.deepEqual(await fns(), f0, 'the functions are as before');
    assert.deepEqual(await cols(), c0, 'the tables and their columns are as before — only the original tables are left');
    assert.deepEqual(await pols(), p0);
    assert.deepEqual(await grants(), g0);
    assert.deepEqual(await buckets(), b0);
    assert.equal((await fresh.query(`select count(*)::int n from sale_threads where source = 'line'`)).rows[0].n, 1, 'the LINE chat that was opened is kept as an ordinary chat');
    assert.equal((await fresh.query(`select count(*)::int n from sale_msgs where body = 'ทักมา'`)).rows[0].n, 1, 'and its message');
    await fresh.exec(reverse003());
    await fresh.exec(migration003());
    assert.ok((await fresh.query(`select to_regclass('public.sale_line_out') r`)).rows[0].r, 'it can be installed again');
  } finally {
    await fresh.close();
  }
});
