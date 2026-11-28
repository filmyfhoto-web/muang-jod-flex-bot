// A draft the staff paste in from a chat (no LINE message behind it): the same rules as a draft from the chat, and the same order.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openShopDb, asStaff, asService } from '../helpers/shop-db.js';

const STORE = '22222222-2222-4222-8222-222222222222';
const P1 = '33333333-3333-4333-8333-333333333331'; // ไม้ถูพื้น 55 บาท
const P3 = '33333333-3333-4333-8333-333333333333'; // ปากกาลูกลื่นน้ำเงิน 0.5 · 5 บาท

let db;

before(async () => {
  db = await openShopDb();
  await db.query("insert into stores (id, name, vat_rate, doc_prefix) values ($1, 'นัฐภรณ์ คัลเลอร์แล็ป', 7, 'RC-CL')", [STORE]);
  await db.query(
    `insert into products (id, code, name, unit, price, stock_qty) values
       ($1, 'A1', 'ไม้ถูพื้น', 'อัน', 55, 10),
       ($2, 'A3', 'ปากกาลูกลื่นน้ำเงิน 0.5', 'ด้าม', 5, 20)`,
    [P1, P3],
  );
});
after(() => db.close());

const paste = (tx, items, { name = 'คุณครูสุดา', phone = null, school = null, note = null } = {}) =>
  tx.query('select public.chat_draft_manual($1::jsonb, $2, $3, $4, $5, $6) as r', [JSON.stringify(items), name, phone, school, note, 'staff:สมชาย']).then((r) => r.rows[0].r);
const drafts = () => asService(db, (tx) => tx.query("select draft_no, channel_key, line_user_id, status, items from chat_drafts where channel_key = 'manual' order by draft_no")).then((r) => r.rows);

test('staff paste a list from a chat: lines the shop has are matched, the rest wait for a check, and the history says who did it', async () => {
  const r = await asStaff(db, (tx) =>
    paste(tx, [
      { name: 'ไม้ถูพื้น', qty: 2, unit: '', product_id: P1, staff_ok: false, raw: 'ไม้ถูพื้น 2' },
      { name: 'ไม้กวาดทางมะพร้าว', qty: 1, unit: '', product_id: null, staff_ok: false, raw: 'ไม้กวาดทางมะพร้าว 1' },
    ]),
  );
  assert.equal(r.ok, true);
  assert.match(r.draft_no, /^CH-\d{4}$/);
  assert.equal(r.lines, 2);
  const [d] = (await drafts()).filter((x) => x.draft_no === r.draft_no);
  assert.equal(d.status, 'open');
  assert.match(d.line_user_id, /^manual:/, 'no LINE customer: a made-up id that never clashes with one');
  assert.equal(d.items[0].product_id, P1);
  assert.equal(d.items[0].status, 'ok');
  assert.equal(d.items[1].status, 'review');
  const events = await asService(db, (tx) =>
    tx.query(`select action, actor, detail from chat_draft_events where draft_id = (select id from chat_drafts where draft_no = '${r.draft_no}') order by id`),
  );
  assert.deepEqual(events.rows.map((e) => e.action), ['created', 'edited']);
  assert.equal(events.rows[0].detail.via, 'paste');
  assert.equal(events.rows[1].actor, 'staff:สมชาย');
});

test('a second paste for the same customer name is a second draft, not a clash with the first', async () => {
  const a = await asStaff(db, (tx) => paste(tx, [{ name: 'ปากกาลูกลื่นน้ำเงิน', qty: 1, unit: 'ด้าม', product_id: P3 }]));
  const b = await asStaff(db, (tx) => paste(tx, [{ name: 'ปากกาลูกลื่นน้ำเงิน', qty: 2, unit: 'ด้าม', product_id: P3 }]));
  assert.equal(a.ok && b.ok, true);
  assert.notEqual(a.draft_no, b.draft_no);
});

test('data the draft rules refuse leaves no draft behind: the whole paste is refused', async () => {
  const before = (await drafts()).length;
  await assert.rejects(
    asStaff(db, (tx) => paste(tx, [{ name: 'ไม้ถูพื้น', qty: 0, product_id: P1 }])),
    /manual draft refused: bad_qty/,
  );
  const empty = await asStaff(db, (tx) => paste(tx, []));
  assert.deepEqual(empty, { ok: false, error: 'bad_items' }, 'an empty paste is refused before anything is written');
  assert.equal((await drafts()).length, before, 'no draft row and no history row was kept');
  const hist = await asService(db, (tx) => tx.query("select count(*)::int as n from chat_draft_events where actor = 'staff:สมชาย' and action = 'created' and detail->>'via' = 'paste'"));
  assert.equal(hist.rows[0].n, (await drafts()).length, 'every kept paste has its creation event, and no refused one does');
});

test('a pasted draft confirms into an order like a chat draft: the free line needs its price typed and checked by staff', async () => {
  const r = await asStaff(db, (tx) => paste(tx, [{ name: 'ไม้ถูพื้น', qty: 1, unit: '', product_id: P1 }, { name: 'ไม้กวาดทางมะพร้าว', qty: 1, unit: '', product_id: null }], { phone: '0812345678', school: 'โรงเรียนบ้านทดสอบ' }));
  const [d] = (await drafts()).filter((x) => x.draft_no === r.draft_no);
  const v0 = await asService(db, (tx) => tx.query(`select version from chat_drafts where draft_no = '${r.draft_no}'`));
  const save = (items, version) =>
    asStaff(db, (tx) =>
      tx.query('select public.chat_draft_save(( select id from chat_drafts where draft_no = $1), $2, $3::jsonb, $4, $5, $6, null, null, $7) as r', [r.draft_no, version, JSON.stringify(items), 'คุณครูสุดา', '0812345678', 'โรงเรียนบ้านทดสอบ', 'staff:สมชาย']).then((x) => x.rows[0].r),
    );
  const unpriced = await save(d.items, v0.rows[0].version);
  assert.equal(unpriced.ok, true);
  const refused = await asStaff(db, (tx) =>
    tx.query('select public.chat_draft_confirm((select id from chat_drafts where draft_no = $1), $2, $3) as r', [r.draft_no, unpriced.version, 'staff:สมชาย']).then((x) => x.rows[0].r),
  );
  assert.deepEqual(refused, { ok: false, error: 'unresolved', count: 1 }, 'the line the shop does not have is not sold until a person accepts it');
  const priced = d.items.map((x, i) => (i === 1 ? { ...x, staff_ok: true, price: 45 } : x));
  const saved = await save(priced, unpriced.version);
  const done = await asStaff(db, (tx) =>
    tx.query('select public.chat_draft_confirm((select id from chat_drafts where draft_no = $1), $2, $3) as r', [r.draft_no, saved.version, 'staff:สมชาย']).then((x) => x.rows[0].r),
  );
  assert.equal(done.ok, true, JSON.stringify(done));
  assert.equal(Number(done.total), 55 + 45);
  const [o] = (await asService(db, (tx) => tx.query(`select channel, line_user_id, school_name, phone from orders where order_no = '${done.order_no}'`))).rows;
  assert.deepEqual(o, { channel: 'line_chat', line_user_id: null, school_name: 'โรงเรียนบ้านทดสอบ', phone: '0812345678' });
});

test('the manual channel is switched off: the bot never answers through it', async () => {
  const [c] = (await asService(db, (tx) => tx.query("select enabled from line_channels where key = 'manual'"))).rows;
  assert.equal(c.enabled, false);
});

test('a caller who is not signed in cannot paste a draft', async () => {
  await assert.rejects(
    db.transaction(async (tx) => {
      await tx.exec('set local role anon');
      return tx.query('select public.chat_draft_manual($1::jsonb, $2, null, null, null, $3)', ['[{"name":"x","qty":1}]', 'x', 'anon']);
    }),
    (e) => e.code === '42501',
  );
});
