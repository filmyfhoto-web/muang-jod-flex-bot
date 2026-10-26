import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createChatOrders, buildItems, mergeItems, enabledFor, docLink, chatOrdersFromEnv } from '../src/chatorders.js';
import { createCatalog } from '../src/catalog.js';
import { parsePickList } from '../src/picklist.js';

const ME = 'U' + '1'.repeat(32);
const OTHER = 'U' + '2'.repeat(32);
const PRODUCTS = [
  { id: 'p1', code: 'A1', name: 'ไม้ถูพื้น', unit: 'อัน' },
  { id: 'p2', name: 'ปากกาลูกลื่นน้ำเงิน 0.5', unit: 'ด้าม' },
  { id: 'p3', name: 'ปากกาลูกลื่นแดง 0.5', unit: 'ด้าม' },
  { id: 'p4', name: 'น้ำยาล้างจาน', unit: 'ขวด' },
];
const LIST = 'ไม้ถูพื้น=10\nปากกา=2โหล\nไม้กวาดทางมะพร้าว=10\nน้ำยาล้างจาน=1แกลอน';

// the database, in memory: the same promises the real store makes (see src/app/store.js)
function fakeStore({ docs = [], hints = {}, clock }) {
  const claims = new Set();
  const s = {
    docs,
    claims,
    broken: new Set(),
    pushes: [],
    async claim(k) {
      if (claims.has(k)) return false;
      claims.add(k);
      return true;
    },
    async unclaim(k) {
      claims.delete(k);
    },
    async teacherHints() {
      if (s.broken.has('hints')) throw new Error('db');
      return hints;
    },
    async chatDocOpen(uid, since) {
      if (s.broken.has('open')) throw new Error('db');
      const rows = docs.filter((d) => d.line_user_id === uid && d.origin === 'chat' && d.status === 'new' && !d.archived_at && d.created_at >= since);
      const row = rows.sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
      return row ? { ...row } : null; // a copy, as the real database hands over: what is read does not change behind the reader's back
    },
    async chatDocCreate(row) {
      if (s.broken.has('create')) throw new Error('create chat order: db down');
      const at = new Date(clock.t).toISOString();
      const doc = { id: 'd' + (docs.length + 1), doc_no: 'PJ-' + String(docs.length + 1).padStart(4, '0'), file_count: 0, created_at: at, updated_at: at, ...row };
      docs.push(doc);
      return { ...doc };
    },
    async chatDocUpdate(id, ifAt, patch) {
      const d = docs.find((x) => x.id === id);
      if (!d || d.updated_at !== ifAt) return null;
      Object.assign(d, patch);
      return { ...d };
    },
    async chatDocsToAck(since) {
      return docs.filter((d) => d.origin === 'chat' && ['working', 'done'].includes(d.status) && d.line_user_id && d.updated_at >= since);
    },
  };
  return s;
}
function setup({ docs = [], hints = {}, products = PRODUCTS } = {}) {
  const clock = { t: Date.parse('2026-10-26T05:00:00Z') };
  const store = fakeStore({ docs, hints, clock });
  const errors = [];
  const co = createChatOrders({ store, catalog: createCatalog({ load: async () => products }), now: () => clock.t, log: { error: (...a) => errors.push(a.join(' ')) } });
  return { co, store, clock, errors };
}
const cfg = { mode: 'on', projectName: 'สั่งของทางแชท LINE', mergeMinutes: 30 };
const list = (text = LIST) => parsePickList(text);

test('who is recorded: nobody (off), the pilot people, or everybody', () => {
  assert.equal(enabledFor({ mode: 'off' }, ME), false);
  assert.equal(enabledFor({}, ME), false);
  assert.equal(enabledFor(undefined, ME), false);
  assert.equal(enabledFor({ mode: 'on' }, ME), true);
  assert.equal(enabledFor({ mode: 'on' }, 'anon'), false);
  assert.equal(enabledFor({ mode: 'on' }, ''), false);
  assert.equal(enabledFor({ mode: 'pilot', pilotUserIds: [ME] }, ME), true);
  assert.equal(enabledFor({ mode: 'pilot', pilotUserIds: [ME] }, OTHER), false);
  assert.equal(enabledFor({ mode: 'pilot' }, ME), false);
  assert.equal(enabledFor({ mode: 'yes please', pilotUserIds: [ME] }, ME), false, 'only the three known modes switch it on');
});

test('the link that opens one job in the back office', () => {
  assert.equal(docLink('https://admin.nattagroup.com/#projdocs', 'PJ-0123'), 'https://admin.nattagroup.com/?doc=PJ-0123#projdocs');
  assert.equal(docLink('https://admin.nattagroup.com/#projdocs', ''), 'https://admin.nattagroup.com/#projdocs');
  assert.equal(docLink('', 'PJ-0123'), '');
  assert.equal(docLink('not a url', 'PJ-0123'), 'not a url');
});

test('lines become the app\'s item rows: a clear product is linked, anything else stays the customer\'s words for the staff to check — and no price, ever', () => {
  const items = buildItems(list().items, PRODUCTS);
  const by = Object.fromEntries(items.map((i) => [i.name, i]));
  assert.deepEqual(by['ไม้ถูพื้น'], { name: 'ไม้ถูพื้น', qty: 10, unit: 'อัน', price: null, src: 'chat', product_id: 'p1', code: 'A1' }, 'unit comes from the product when the customer gave none');
  const pens = by['ปากกา'];
  assert.equal(pens.product_id, undefined, 'two pens fit: not linked');
  assert.equal(pens.review, true);
  assert.match(pens.hint, /^ใกล้เคียง: /);
  assert.ok(pens.hint.includes('ปากกาลูกลื่นน้ำเงิน') && pens.hint.includes('ปากกาลูกลื่นแดง'));
  const broom = by['ไม้กวาดทางมะพร้าว'];
  assert.deepEqual(broom, { name: 'ไม้กวาดทางมะพร้าว', qty: 10, unit: '', price: null, src: 'chat', review: true }, 'nothing like it in the shop: only the customer\'s words');
  const soap = by['น้ำยาล้างจาน'];
  assert.equal(soap.product_id, 'p4');
  assert.equal(soap.review, true, 'sold by the bottle, asked for by the gallon: the quantity needs a look');
  assert.match(soap.hint, /ขวด/);
  assert.equal(soap.unit, 'แกลลอน', 'the customer\'s unit is kept as written');
  assert.ok(items.every((i) => i.price === null), 'the bot never prices');
});

test('the customer\'s wording is kept when it differs from the product\'s name; items from the AI say so', () => {
  const [a] = buildItems([{ name: 'ปากกาลูกลื่นน้ำเงิน', qty: 3, unit: 'ด้าม' }], PRODUCTS);
  assert.equal(a.name, 'ปากกาลูกลื่นน้ำเงิน 0.5');
  assert.equal(a.said, 'ปากกาลูกลื่นน้ำเงิน');
  assert.equal(a.review, undefined);
  const [b] = buildItems([{ name: 'ไม้ถูพื้น', qty: 1, unit: 'อัน', src: 'ai' }], PRODUCTS);
  assert.equal(b.src, 'ai');
  assert.equal(b.said, undefined, 'the same words: nothing to add');
});

test('a second piece of an order adds its lines; a line already there is not added twice', () => {
  const first = buildItems(list('ไม้ถูพื้น=10\nขันน้ำ=10').items, PRODUCTS);
  const second = buildItems(list('ขันน้ำ=10\nถังน้ำ=2 ใบ').items, PRODUCTS);
  const m = mergeItems(first, second);
  assert.equal(m.added, 1);
  assert.deepEqual(m.items.map((i) => i.name), ['ไม้ถูพื้น', 'ขันน้ำ', 'ถังน้ำ']);
  const other = mergeItems(first, buildItems(list('ขันน้ำ=12\nถัง=1').items, PRODUCTS));
  assert.equal(other.added, 2, 'same name, another quantity: a new line (the staff will see both)');
});

test('record: the list becomes a new job in the shop\'s app, the way the app\'s own jobs look', async () => {
  const { co, store } = setup({ hints: { name: 'สมศรี', phone: '0812345678', school_id: 's1', school_name: 'โรงเรียนบ้านทดสอบ', line_name: 'ครูสมศรี' } });
  const l = list(LIST + '\nวันที่ 28');
  const r = await co.record({ userId: ME, lineName: 'ปู่', text: LIST + '\nวันที่ 28', list: l, cfg, messageId: 'm1' });
  assert.equal(r.ok, true);
  assert.equal(r.merged, false);
  assert.equal(r.doc.doc_no, 'PJ-0001');
  assert.equal(r.total, 4);
  assert.equal(r.linked, 2);
  assert.equal(r.review, 3);
  const d = store.docs[0];
  assert.equal(d.origin, 'chat');
  assert.equal(d.status, 'new');
  assert.equal(d.line_user_id, ME);
  assert.equal(d.line_name, 'ปู่');
  assert.equal(d.teacher_name, 'สมศรี');
  assert.equal(d.phone, '0812345678');
  assert.equal(d.school_id, 's1');
  assert.equal(d.school_name, 'โรงเรียนบ้านทดสอบ');
  assert.equal(d.project_name, 'สั่งของทางแชท LINE');
  assert.equal(d.need_date, '2026-10-28');
  assert.ok(d.note.startsWith('ข้อความจากแชท LINE:\nไม้ถูพื้น=10'), d.note);
  assert.ok(d.note.length <= 1000);
  assert.equal(d.items.length, 4);
  assert.ok(!('price' in d) && !('budget' in d) && !('items_total' in d), 'no money anywhere');
});

test('record: with no history of the customer, the LINE name stands in for the teacher and the school is left for the staff', async () => {
  const { co, store } = setup();
  await co.record({ userId: ME, lineName: 'ปู่', text: LIST, list: list(), cfg });
  assert.equal(store.docs[0].teacher_name, 'ปู่');
  assert.equal(store.docs[0].school_id, null);
  assert.equal(store.docs[0].school_name, null);
  assert.equal(store.docs[0].need_date, null);
});

test('record: the next piece within the window joins the same job and says so', async () => {
  const { co, store, clock } = setup();
  await co.record({ userId: ME, text: 'ไม้ถูพื้น=10\nขันน้ำ=10', list: list('ไม้ถูพื้น=10\nขันน้ำ=10'), cfg });
  clock.t += 5 * 60_000;
  const r = await co.record({ userId: ME, text: 'ขันน้ำ=10\nถังน้ำ=2ใบ\nวันที่ 30', list: list('ขันน้ำ=10\nถังน้ำ=2ใบ\nวันที่ 30'), cfg });
  assert.equal(store.docs.length, 1);
  assert.equal(r.merged, true);
  assert.equal(r.added, 1);
  assert.equal(r.doc.doc_no, 'PJ-0001');
  assert.deepEqual(store.docs[0].items.map((i) => i.name), ['ไม้ถูพื้น', 'ขันน้ำ', 'ถังน้ำ']);
  assert.equal(store.docs[0].need_date, '2026-10-30');
  assert.ok(store.docs[0].note.includes('———'), 'both messages are in the note');
  assert.equal(r.total, 3);
});

test('record: another customer, a late message, or a job the staff already picked up each get a job of their own', async () => {
  const { co, store, clock } = setup();
  await co.record({ userId: ME, text: LIST, list: list(), cfg });
  await co.record({ userId: OTHER, text: LIST, list: list(), cfg });
  assert.equal(store.docs.length, 2, 'another customer');
  clock.t += 31 * 60_000;
  await co.record({ userId: ME, text: LIST, list: list(), cfg });
  assert.equal(store.docs.length, 3, 'after the window');
  store.docs[2].status = 'working';
  clock.t += 60_000;
  await co.record({ userId: ME, text: LIST, list: list(), cfg });
  assert.equal(store.docs.length, 4, 'the staff took the third one: a new message is a new job');
});

test('record: if the staff saved the job a moment ago, their version wins and the message becomes a job of its own', async () => {
  const { co, store, clock } = setup();
  await co.record({ userId: ME, text: 'ไม้ถูพื้น=10\nขันน้ำ=10', list: list('ไม้ถูพื้น=10\nขันน้ำ=10'), cfg });
  const real = store.chatDocOpen;
  store.chatDocOpen = async (...a) => {
    const row = await real(...a);
    store.docs[0].updated_at = '2026-10-26T05:00:09.000Z'; // the staff press "บันทึก" right after we read it
    store.docs[0].note = 'ร้านจดไว้';
    return row;
  };
  clock.t += 60_000;
  const r = await co.record({ userId: ME, text: 'ปากกา=2โหล\nสมุด=5เล่ม', list: list('ปากกา=2โหล\nสมุด=5เล่ม'), cfg });
  assert.equal(store.docs.length, 2);
  assert.equal(r.merged, false);
  assert.equal(store.docs[0].note, 'ร้านจดไว้', 'nothing of the staff\'s was overwritten');
  assert.equal(store.docs[0].items.length, 2);
});

test('record: the same LINE message is recorded once, however often it arrives', async () => {
  const { co, store } = setup();
  const a = await co.record({ userId: ME, text: LIST, list: list(), cfg, messageId: 'm42' });
  const b = await co.record({ userId: ME, text: LIST, list: list(), cfg, messageId: 'm42' });
  assert.equal(a.ok && !a.dup, true);
  assert.deepEqual(b, { ok: true, dup: true });
  assert.equal(store.docs.length, 1);
});

test('record never throws: a database that fails leaves "not saved" and nothing else', async () => {
  const { co, store, errors } = setup();
  store.broken.add('create');
  const r = await co.record({ userId: ME, text: LIST, list: list(), cfg });
  assert.equal(r.ok, false);
  assert.match(r.error, /db down/);
  assert.equal(store.docs.length, 0);
  assert.equal(errors.length, 1);
  store.broken.clear();
  store.broken.add('open');
  assert.equal((await co.record({ userId: ME, text: LIST, list: list(), cfg })).ok, false);
});

test('record: when the products or the customer\'s history cannot be read, the job is still made — every line for the staff to check', async () => {
  const clock = { t: Date.parse('2026-10-26T05:00:00Z') };
  const store = fakeStore({ docs: [], hints: {}, clock });
  store.broken.add('hints');
  const co = createChatOrders({ store, catalog: createCatalog({ load: async () => { throw new Error('products down'); } }), now: () => clock.t, log: { error() {} } });
  const r = await co.record({ userId: ME, lineName: 'ปู่', text: LIST, list: list(), cfg });
  assert.equal(r.ok, true);
  assert.equal(r.linked, 0);
  assert.equal(r.review, 4);
  assert.equal(store.docs[0].teacher_name, 'ปู่');
});

test('record: an AI-read order says so in the note, and its lines are marked', async () => {
  const { co, store } = setup();
  await co.record({ userId: ME, text: 'ขอสั่งไม้ถูพื้น 10 อัน', list: { items: [{ name: 'ไม้ถูพื้น', qty: 10, unit: 'อัน' }], notes: [], day: null, via: 'ai' }, cfg });
  assert.match(store.docs[0].note, /แยกรายการด้วย AI/);
  assert.equal(store.docs[0].items[0].src, 'ai');
});

test('remark: what the customer adds after the list goes into the job\'s note, and "วันที่ 28" sets the date', async () => {
  const { co, store, clock } = setup();
  assert.equal(await co.remark({ userId: ME, text: 'ประมาณวันที่ 28', cfg }), null, 'no job yet');
  await co.record({ userId: ME, text: LIST, list: list(), cfg });
  clock.t += 2 * 60_000;
  const d = await co.remark({ userId: ME, text: 'ประมาณวันที่ 28 ครูเขาจะแวะเอาครับ', cfg });
  assert.ok(d);
  assert.ok(store.docs[0].note.endsWith('ข้อความต่อมา:\nประมาณวันที่ 28 ครูเขาจะแวะเอาครับ'));
  assert.equal(store.docs[0].need_date, '2026-10-28');
});

// ---- telling the customer the order has been taken ----------------------------------------------------------------------
const ackCfg = (over = {}) => ({ mode: 'on', ack: { enabled: true, text: 'ได้รับรายการสั่งซื้อแล้วค่ะ ร้านกำลังดำเนินการจัดสินค้า', maxAgeHours: 48 }, ...over });
async function withTwoJobs() {
  const s = setup();
  await s.co.record({ userId: ME, text: LIST, list: list(), cfg });
  await s.co.record({ userId: OTHER, text: LIST, list: list(), cfg });
  return s;
}

test('ack: nothing is said while the staff have not picked the job up; once they have, the customer is told once', async () => {
  const { co, store, clock } = await withTwoJobs();
  const sent = [];
  const push = async (to, messages) => sent.push({ to, messages });
  assert.equal(await co.ack({ cfg: ackCfg(), push }), 0, 'both jobs are still new');
  store.docs[0].status = 'working';
  store.docs[0].updated_at = new Date(clock.t).toISOString();
  assert.equal(await co.ack({ cfg: ackCfg(), push }), 1);
  assert.deepEqual(sent, [{ to: ME, messages: [{ type: 'text', text: 'ได้รับรายการสั่งซื้อแล้วค่ะ ร้านกำลังดำเนินการจัดสินค้า' }] }]);
  assert.equal(await co.ack({ cfg: ackCfg(), push }), 0, 'never twice for one job');
  store.docs[0].status = 'done';
  assert.equal(await co.ack({ cfg: ackCfg(), push }), 0, 'finishing it later is not another announcement');
  store.docs[1].status = 'cancelled';
  assert.equal(await co.ack({ cfg: ackCfg(), push }), 0, 'a cancelled job is never announced');
});

test('ack: off by default, off with the mode, and only for the pilot people in pilot mode', async () => {
  const { co, store } = await withTwoJobs();
  store.docs.forEach((d) => { d.status = 'working'; });
  const sent = [];
  const push = async (to) => sent.push(to);
  assert.equal(await co.ack({ cfg: { mode: 'on', ack: { enabled: false, text: 'x' } }, push }), 0);
  assert.equal(await co.ack({ cfg: ackCfg({ mode: 'off' }), push }), 0);
  assert.equal(await co.ack({ cfg: { mode: 'on', ack: { enabled: true, text: '' } }, push }), 0, 'no sentence, no message');
  assert.equal(await co.ack({ cfg: ackCfg({ mode: 'pilot', pilotUserIds: [OTHER] }), push }), 1);
  assert.deepEqual(sent, [OTHER]);
});

test('ack: never while the customer is talking with a person; it waits and is said afterwards', async () => {
  const { co, store } = await withTwoJobs();
  store.docs[0].status = 'working';
  const sent = [];
  const push = async (to) => sent.push(to);
  let busy = true;
  assert.equal(await co.ack({ cfg: ackCfg(), push, busy: async () => busy }), 0);
  assert.equal(await co.ack({ cfg: ackCfg(), push, busy: async () => { throw new Error('cannot tell'); } }), 0, 'in doubt: stay out of it');
  busy = false;
  assert.equal(await co.ack({ cfg: ackCfg(), push, busy: async () => busy }), 1);
  assert.deepEqual(sent, [ME]);
});

test('ack: a push that failed for a passing reason is tried again; a customer who blocked the shop is not pestered', async () => {
  const { co, store } = await withTwoJobs();
  store.docs.forEach((d) => { d.status = 'working'; });
  const sent = [];
  let mode = 'down';
  const push = async (to) => {
    if (mode === 'down') throw Object.assign(new Error('LINE push 500'), { status: 500 });
    if (mode === 'blocked' && to === OTHER) throw Object.assign(new Error('LINE push 403'), { status: 403 });
    sent.push(to);
  };
  assert.equal(await co.ack({ cfg: ackCfg(), push }), 0);
  mode = 'blocked';
  assert.equal(await co.ack({ cfg: ackCfg(), push }), 1, 'the first customer is told now');
  assert.deepEqual(sent, [ME]);
  mode = 'fine';
  assert.equal(await co.ack({ cfg: ackCfg(), push }), 0, 'the blocked one is not tried again');
});

test('record: if the "same message twice" check itself fails, the order is still saved (a second job is easy to cancel, a lost order is not)', async () => {
  const { co, store } = setup();
  store.claim = async () => { throw new Error('claim: function does not exist'); };
  const r = await co.record({ userId: ME, text: LIST, list: list(), cfg, messageId: 'm1' });
  assert.equal(r.ok, true);
  assert.equal(store.docs.length, 1);
});

test('a job never grows without end', () => {
  const old = Array.from({ length: 198 }, (_, i) => ({ name: `สินค้า${i}`, qty: 1, unit: '' }));
  const fresh = Array.from({ length: 10 }, (_, i) => ({ name: `ใหม่${i}`, qty: 1, unit: '' }));
  const m = mergeItems(old, fresh, 200);
  assert.equal(m.items.length, 200);
  assert.equal(m.added, 2);
});

test('record: the same lines again add nothing, and say so (the caller keeps quiet)', async () => {
  const { co, clock } = setup();
  const first = await co.record({ userId: ME, text: 'ไม้ถูพื้น=10\nขันน้ำ=10', list: list('ไม้ถูพื้น=10\nขันน้ำ=10'), cfg });
  clock.t += 60_000;
  const again = await co.record({ userId: ME, text: 'ไม้ถูพื้น = 10\nขันน้ำ = 10', list: list('ไม้ถูพื้น = 10\nขันน้ำ = 10'), cfg });
  assert.equal(again.merged, true);
  assert.equal(again.added, 0);
  assert.equal(again.doc.doc_no, first.doc.doc_no);
});

test('ack: a job that has been dealt with is not looked at again on every pass', async () => {
  const { co, store } = await withTwoJobs();
  store.docs.forEach((d) => { d.status = 'working'; });
  let claims = 0;
  const real = store.claim;
  store.claim = async (...a) => { claims++; return real(...a); };
  const push = async () => {};
  assert.equal(await co.ack({ cfg: ackCfg(), push }), 2);
  const after = claims;
  assert.equal(await co.ack({ cfg: ackCfg(), push }), 0);
  assert.equal(await co.ack({ cfg: ackCfg(), push }), 0);
  assert.equal(claims, after, 'no more claims once both are settled');
});

test('Render\'s Environment page can switch it on and off without a code push; a value it does not understand changes nothing', () => {
  const file = { mode: 'off', pilotUserIds: [ME], ack: { enabled: false, text: 'x' }, ai: { mode: 'off' }, mergeMinutes: 30 };
  assert.deepEqual(chatOrdersFromEnv(file, {}), file, 'nothing set: the file as it is');
  assert.deepEqual(chatOrdersFromEnv(file, { CHATORDERS_MODE: 'pilot' }).mode, 'pilot');
  assert.equal(chatOrdersFromEnv(file, { CHATORDERS_MODE: ' ON ' }).mode, 'on', 'case and spaces do not matter');
  assert.equal(chatOrdersFromEnv({ ...file, mode: 'on' }, { CHATORDERS_MODE: 'off' }).mode, 'off', 'the environment can switch it off too');
  for (const bad of ['yes', 'true', '1', '', 'pilott']) assert.equal(chatOrdersFromEnv(file, { CHATORDERS_MODE: bad }).mode, 'off', bad);
  const on = chatOrdersFromEnv(file, { CHATORDERS_ACK: 'on', CHATORDERS_AI: 'pilot' });
  assert.deepEqual([on.ack.enabled, on.ack.text, on.ai.mode], [true, 'x', 'pilot'], 'the rest of the block is kept');
  assert.equal(chatOrdersFromEnv({ ...file, ack: { enabled: true, text: 'x' } }, { CHATORDERS_ACK: 'off' }).ack.enabled, false);
  assert.deepEqual(chatOrdersFromEnv(file, { CHATORDERS_PILOT_IDS: `${OTHER}, not-an-id ,${ME}` }).pilotUserIds, [OTHER, ME], 'only real LINE ids are taken');
  assert.deepEqual(chatOrdersFromEnv(file, { CHATORDERS_PILOT_IDS: 'garbage' }).pilotUserIds, [ME]);
  assert.deepEqual(chatOrdersFromEnv(undefined, { CHATORDERS_MODE: 'on' }), { mode: 'on' });
  assert.deepEqual(file.ack, { enabled: false, text: 'x' }, 'the file\'s object is never changed in place');
});
