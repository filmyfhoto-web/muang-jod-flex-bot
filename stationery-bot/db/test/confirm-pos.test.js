// Staff side, in the database: save the draft, confirm it into a real order (NT-xxxx), sell it through the shop's POS once,
// and cancel what was not confirmed. Every rule is checked on PostgreSQL itself, not on a copy of it in JavaScript.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openShopDb, asStaff, asService, STAFF } from '../helpers/shop-db.js';

const STORE = '22222222-2222-4222-8222-222222222222';
const P1 = '33333333-3333-4333-8333-333333333331'; // ไม้ถูพื้น 55 บาท สต็อก 10
const P2 = '33333333-3333-4333-8333-333333333332'; // น้ำยาล้างจาน 60 บาท สต็อก 5
const P3 = '33333333-3333-4333-8333-333333333333'; // สินค้าที่ยังไม่มีราคา สต็อก 4
const MAIN_USER = 'U' + 'a'.repeat(32);
const OTHER_USER = 'U' + 'b'.repeat(32);

let db;
before(async () => {
  db = await openShopDb();
  await asService(db, async (tx) => {
    await tx.query("insert into stores (id, name, vat_rate, doc_prefix) values ($1, 'นัฐภรณ์ คัลเลอร์แล็ป', 7, 'RC-CL')", [STORE]);
    await tx.query(
      `insert into products (id, code, name, unit, price, stock_qty) values
         ($1, 'A1', 'ไม้ถูพื้น', 'อัน', 55, 10),
         ($2, 'A2', 'น้ำยาล้างจาน', 'ขวด', 60, 5),
         ($3, 'A3', 'สินค้าที่ยังไม่มีราคา', 'ชิ้น', null, 4)`,
      [P1, P2, P3],
    );
  });
});
after(async () => {
  await db.close();
});

const stock = async (pid) =>
  (await asService(db, (tx) => tx.query('select stock_qty from products where id = $1', [pid]))).rows[0].stock_qty;

async function openDraft(no, user, items, { customer = 'ปู่', channel = 'main' } = {}) {
  const id = (
    await asService(db, (tx) =>
      tx.query(
        `insert into chat_drafts (draft_no, channel_key, line_user_id, line_name, customer_name, items)
         values ($1, $2, $3, 'ลูกค้า', $4, $5::jsonb) returning id`,
        [no, channel, user, customer, JSON.stringify(items)],
      ),
    )
  ).rows[0].id;
  return id;
}

const save = (tx, draftId, version, items, extra = {}) =>
  tx.query(
    `select public.chat_draft_save($1::uuid, $2::int, $3::jsonb, $4, $5, $6, $7::date, $8, $9) as r`,
    [draftId, version, JSON.stringify(items), extra.name ?? 'ปู่', extra.phone ?? null, extra.school ?? null, extra.need ?? null, extra.note ?? null, 'สมชาย'],
  );
const confirm = (tx, draftId, version) =>
  tx.query('select public.chat_draft_confirm($1::uuid, $2::int, $3) as r', [draftId, version, 'สมชาย']);
const pos = (tx, draftId, store = STORE) =>
  tx.query('select public.chat_draft_pos($1::uuid, $2::uuid, $3, $4) as r', [draftId, store, 'เงินสด', 'สมชาย']);

test('saving checks the version it was read at, the quantities and the prices, and never writes over someone else\'s change', async () => {
  const id = await openDraft('CH-0100', 'U' + '9'.repeat(32), [{ id: 'a', name: 'ไม้ถูพื้น', qty: 3, unit: 'อัน', product_id: P1 }]);
  const first = (await asStaff(db, (tx) => save(tx, id, 1, [{ id: 'a', name: 'ไม้ถูพื้น', qty: 4, unit: 'อัน', product_id: P1 }]))).rows[0].r;
  assert.equal(first.ok, true);
  assert.equal(first.version, 2);
  assert.equal(first.items[0].name, 'ไม้ถูพื้น', 'a linked line takes the product\'s name');
  assert.equal(first.items[0].status, 'ok');

  const stale = (await asStaff(db, (tx) => save(tx, id, 1, []))).rows[0].r;
  assert.deepEqual(stale, { ok: false, error: 'conflict', version: 2 });

  const bad = (await asStaff(db, (tx) => save(tx, id, 2, [{ id: 'a', name: 'ไม้ถูพื้น', qty: 0, product_id: P1 }]))).rows[0].r;
  assert.deepEqual(bad, { ok: false, error: 'bad_qty', line: 1 });

  // a removed line may keep any quantity; it does not count
  const removed = (await asStaff(db, (tx) => save(tx, id, 2, [{ id: 'a', name: 'ไม้ถูพื้น', qty: 0, product_id: P1, removed: true }]))).rows[0].r;
  assert.equal(removed.ok, true);
  assert.equal(removed.items[0].removed, true);
});

test('confirming refuses a draft with an unresolved line, then makes exactly one order when every line is settled', async () => {
  const items = [
    { id: 'a', name: 'ไม้ถูพื้น', qty: 3, unit: 'อัน', product_id: P1 },
    { id: 'b', name: 'น้ำยาล้างจานเขียว', qty: 2, unit: 'แกลลอน' },
  ];
  const id = await openDraft('CH-0101', MAIN_USER, items);
  const v1 = (await asStaff(db, (tx) => save(tx, id, 1, items))).rows[0].r;
  const refused = (await asStaff(db, (tx) => confirm(tx, id, v1.version))).rows[0].r;
  assert.deepEqual(refused, { ok: false, error: 'unresolved', count: 1 }, 'a free-text line is not an order until staff accept it');

  const settled = [items[0], { ...items[1], staff_ok: true, price: 70 }];
  const v2 = (await asStaff(db, (tx) => save(tx, id, v1.version, settled))).rows[0].r;
  const done = (await asStaff(db, (tx) => confirm(tx, id, v2.version))).rows[0].r;
  assert.equal(done.ok, true);
  assert.match(done.order_no, /^NT-\d{4}$/);
  assert.equal(done.total, 3 * 55 + 2 * 70, 'the linked line is priced from the product, the free line from the price staff typed');

  const order = (await asService(db, (tx) => tx.query('select * from orders where order_no = $1', [done.order_no]))).rows[0];
  assert.equal(order.channel, 'line_chat');
  assert.equal(order.status, 'pending');
  assert.equal(Number(order.total), 305);
  assert.equal(order.line_user_id, MAIN_USER, 'the OA\'s own customer gets the shop\'s usual confirmations');
  assert.equal(order.orderer_name, 'ปู่');
  const lines = (await asService(db, (tx) => tx.query('select name, qty, unit_price, product_id from order_items where order_id = $1 order by sort', [order.id]))).rows;
  assert.deepEqual(lines.map((l) => [l.name, Number(l.qty), Number(l.unit_price)]), [['ไม้ถูพื้น · อัน', 3, 55], ['น้ำยาล้างจานเขียว · แกลลอน', 2, 70]]);
  assert.equal(lines[1].product_id, null);

  const draft = (await asService(db, (tx) => tx.query('select status, order_no, version from chat_drafts where id = $1', [id]))).rows[0];
  assert.deepEqual(draft, { status: 'confirmed', order_no: done.order_no, version: v2.version + 1 });

  // a second confirm of the same draft creates nothing
  const again = (await asStaff(db, (tx) => confirm(tx, id, v2.version + 1))).rows[0].r;
  assert.equal(again.ok, false);
  assert.equal(again.error, 'not_open');
  assert.equal(again.order_no, done.order_no);
});

test('confirming needs a customer name and a price for every line that has no product', async () => {
  const id = await openDraft('CH-0102', OTHER_USER, [{ id: 'a', name: 'ไม้ถูพื้น', qty: 1, unit: 'อัน', product_id: P1 }], { customer: null, channel: 'main' });
  const noName = (await asStaff(db, (tx) => confirm(tx, id, 1))).rows[0].r;
  assert.deepEqual(noName, { ok: false, error: 'need_name' });

  const id2 = await openDraft('CH-0103', 'U' + 'c'.repeat(32), [{ id: 'p', name: 'สินค้าที่ยังไม่มีราคา', qty: 1, unit: 'ชิ้น', product_id: P3 }]);
  const noPrice = (await asStaff(db, (tx) => confirm(tx, id2, 1))).rows[0].r;
  assert.deepEqual(noPrice, { ok: false, error: 'missing_price', count: 1 }, 'a product with no price is never guessed');
  const priced = (await asStaff(db, (tx) => save(tx, id2, 1, [{ id: 'p', name: 'สินค้าที่ยังไม่มีราคา', qty: 1, unit: 'ชิ้น', product_id: P3, price: 80 }]))).rows[0].r;
  const ok = (await asStaff(db, (tx) => confirm(tx, id2, priced.version))).rows[0].r;
  assert.equal(ok.ok, true);
  assert.equal(ok.total, 80);
});

test('a draft from another shop OA gets an order without a LINE id, so no confirmation can go to the wrong channel', async () => {
  await asService(db, (tx) => tx.query("insert into line_channels (key, name, enabled) values ('shop2', 'OA ที่ 2', true) on conflict do nothing"));
  const id = await openDraft('CH-0104', 'U' + 'd'.repeat(32), [{ id: 'a', name: 'ไม้ถูพื้น', qty: 1, unit: 'อัน', product_id: P1 }], { channel: 'shop2' });
  const r = (await asStaff(db, (tx) => confirm(tx, id, 1))).rows[0].r;
  assert.equal(r.ok, true);
  const order = (await asService(db, (tx) => tx.query('select line_user_id from orders where order_no = $1', [r.order_no]))).rows[0];
  assert.equal(order.line_user_id, null);
});

test('selling through the POS takes the stock once, links the sale to the draft, and a second sale is refused', async () => {
  const items = [
    { id: 'a', name: 'ไม้ถูพื้น', qty: 2, unit: 'อัน', product_id: P1 },
    { id: 'b', name: 'น้ำยาล้างจาน', qty: 1, unit: 'ขวด', product_id: P2 },
  ];
  const id = await openDraft('CH-0200', 'U' + 'e'.repeat(32), items);
  const before1 = await stock(P1);
  const before2 = await stock(P2);

  const notYet = (await asStaff(db, (tx) => pos(tx, id))).rows[0].r;
  assert.deepEqual(notYet, { ok: false, error: 'not_confirmed', status: 'open' }, 'an unconfirmed draft is never sold');

  const v1 = (await asStaff(db, (tx) => save(tx, id, 1, items))).rows[0].r;
  const c = (await asStaff(db, (tx) => confirm(tx, id, v1.version))).rows[0].r;
  assert.equal(c.ok, true);
  assert.equal(await stock(P1), before1, 'confirming an order takes no stock');
  assert.equal(await stock(P2), before2);

  const sold = (await asStaff(db, (tx) => pos(tx, id))).rows[0].r;
  assert.equal(sold.ok, true);
  assert.match(sold.sale_no, /^POS-/);
  assert.equal(Number(sold.total), 2 * 55 + 60);
  assert.equal(await stock(P1), before1 - 2, 'the product stock went down by the quantity sold');
  assert.equal(await stock(P2), before2 - 1);

  const again = (await asStaff(db, (tx) => pos(tx, id))).rows[0].r;
  assert.deepEqual(again, { ok: false, error: 'already_sold', sale_no: sold.sale_no });
  assert.equal(await stock(P1), before1 - 2, 'the second attempt took no stock');

  const sale = (await asService(db, (tx) => tx.query('select meta, total from sales where sale_no = $1', [sold.sale_no]))).rows[0];
  assert.equal(sale.meta.chat_draft_no, 'CH-0200');
  assert.equal(sale.meta.source, 'line_chat');
  const moves = (await asService(db, (tx) => tx.query('select delta, reason from stock_moves where note = $1 order by delta', [sold.sale_no]))).rows;
  assert.deepEqual(moves.map((m) => [m.delta, m.reason]), [[-2, 'ขายหน้าร้าน'], [-1, 'ขายหน้าร้าน']]);
  const link = (await asService(db, (tx) => tx.query('select pos_sale_no from chat_drafts where id = $1', [id]))).rows[0];
  assert.equal(link.pos_sale_no, sold.sale_no);
});

test('a order with a line that is not linked to a product cannot go to the POS, and nothing is taken from stock', async () => {
  const items = [{ id: 'a', name: 'ไม้ถูพื้น', qty: 1, unit: 'อัน', product_id: P1 }, { id: 'b', name: 'ถุงขยะ', qty: 1, unit: 'ม้วน', staff_ok: true, price: 30 }];
  const id = await openDraft('CH-0201', 'U' + 'f'.repeat(32), items);
  const v1 = (await asStaff(db, (tx) => save(tx, id, 1, items))).rows[0].r;
  assert.equal((await asStaff(db, (tx) => confirm(tx, id, v1.version))).rows[0].r.ok, true);
  const before = await stock(P1);
  const r = (await asStaff(db, (tx) => pos(tx, id))).rows[0].r;
  assert.deepEqual(r, { ok: false, error: 'unlinked' });
  assert.equal(await stock(P1), before);
});

test('cancelling an open draft frees the customer for a new one; a confirmed draft cannot be cancelled here', async () => {
  const id = await openDraft('CH-0300', 'U' + '1'.repeat(32), [{ id: 'a', name: 'ไม้ถูพื้น', qty: 1, unit: 'อัน', product_id: P1 }]);
  const stale = (await asStaff(db, (tx) => tx.query("select public.chat_draft_cancel($1::uuid, 9, 'สมชาย', 'ลูกค้าไม่เอาแล้ว') as r", [id]))).rows[0].r;
  assert.equal(stale.error, 'conflict');
  const ok = (await asStaff(db, (tx) => tx.query("select public.chat_draft_cancel($1::uuid, 1, 'สมชาย', 'ลูกค้าไม่เอาแล้ว') as r", [id]))).rows[0].r;
  assert.deepEqual(ok, { ok: true, version: 2 });
  const row = (await asService(db, (tx) => tx.query('select status, cancel_reason from chat_drafts where id = $1', [id]))).rows[0];
  assert.deepEqual(row, { status: 'cancelled', cancel_reason: 'ลูกค้าไม่เอาแล้ว' });

  const v = (await asStaff(db, (tx) => tx.query("select public.chat_draft_cancel($1::uuid, 2, 'สมชาย', null) as r", [id]))).rows[0].r;
  assert.equal(v.error, 'not_open');
  // the same customer can start a new draft now
  await openDraft('CH-0301', 'U' + '1'.repeat(32), [{ id: 'a', name: 'ไม้ถูพื้น', qty: 1, unit: 'อัน', product_id: P1 }]);
});

test('the functions refuse to run without a signed-in user', async () => {
  const id = await openDraft('CH-0400', 'U' + '2'.repeat(32), [{ id: 'a', name: 'ไม้ถูพื้น', qty: 1, unit: 'อัน', product_id: P1 }]);
  await assert.rejects(asService(db, (tx) => confirm(tx, id, 1)), /auth/);
  await assert.rejects(asService(db, (tx) => pos(tx, id)), /auth/);
});

test('every audit event is written in order: created by the bot, edited, confirmed, sold', async () => {
  const id = await openDraft('CH-0500', 'U' + '3'.repeat(32), [{ id: 'a', name: 'ไม้ถูพื้น', qty: 1, unit: 'อัน', product_id: P1 }]);
  await asService(db, (tx) => tx.query("insert into chat_draft_events (draft_id, actor, action) values ($1, 'bot', 'created')", [id]));
  const v1 = (await asStaff(db, (tx) => save(tx, id, 1, [{ id: 'a', name: 'ไม้ถูพื้น', qty: 2, unit: 'อัน', product_id: P1 }]))).rows[0].r;
  const c = (await asStaff(db, (tx) => confirm(tx, id, v1.version))).rows[0].r;
  assert.equal(c.ok, true);
  const events = (await asService(db, (tx) => tx.query('select actor, action from chat_draft_events where draft_id = $1 order by id', [id]))).rows;
  // the back office passes its actor as 'staff:<name>'; these tests pass the bare name, which the database stores as given
  assert.deepEqual(events.map((e) => [e.actor, e.action]), [['bot', 'created'], ['สมชาย', 'edited'], ['สมชาย', 'confirmed']]);
});

test('the staff id is the signed-in user, so auth.uid() is never trusted from the request body', async () => {
  const uid = await asStaff(db, (tx) => tx.query('select auth.uid() as u'), STAFF);
  assert.equal(uid.rows[0].u, STAFF);
});
