import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  listChatCustomers,
  listChatMessages,
  listCustomerJobs,
  addChatMessage,
  markChatRead,
  findJobByClientRef,
  CHAT_CHANNELS,
} from '../src/services/chatService.js';

// Fake client: supports only the query-builder calls chatService makes. Rows
// are returned in the order given, so tests pass them already newest-first the
// way the database would.
function fakeClient(tables, { failing = [] } = {}) {
  const inserted = [];
  const from = (name) => {
    if (failing.includes(name)) {
      return chain({ data: null, error: { code: 'PGRST205', message: `Could not find the table '${name}'` } });
    }
    let rows = (tables[name] || []).slice();
    let pendingUpdate = null;
    let pendingInsert = null;
    const b = {
      select() { return b; },
      eq(col, val) { rows = rows.filter((r) => r[col] === val); return b; },
      neq(col, val) { rows = rows.filter((r) => r[col] !== val); return b; },
      is(col, val) { rows = rows.filter((r) => (r[col] ?? null) === val); return b; },
      order() { return b; },
      limit(n) { rows = rows.slice(0, n); return b; },
      update(patch) { pendingUpdate = patch; return b; },
      insert(row) {
        pendingInsert = { ...row, id: `new-${inserted.length + 1}`, created_at: '2026-11-03T04:00:00.000Z' };
        inserted.push({ table: name, row: pendingInsert });
        (tables[name] ||= []).push(pendingInsert);
        return b;
      },
      single() { return Promise.resolve({ data: pendingInsert, error: null }); },
      maybeSingle() { return Promise.resolve({ data: rows[0] || null, error: null }); },
      then(res, rej) {
        if (pendingUpdate) for (const r of rows) Object.assign(r, pendingUpdate);
        const out = pendingInsert && !rows.length ? [pendingInsert] : rows;
        return Promise.resolve({ data: out, error: null }).then(res, rej);
      },
    };
    return b;
  };
  return { client: { from }, inserted };
}

function chain(result) {
  const b = {
    select() { return b; }, eq() { return b; }, neq() { return b; }, is() { return b; },
    order() { return b; }, limit() { return b; }, update() { return b; }, insert() { return b; },
    single() { return Promise.resolve(result); }, maybeSingle() { return Promise.resolve(result); },
    then(res, rej) { return Promise.resolve(result).then(res, rej); },
  };
  return b;
}

const JOBS = [
  { id: 'j1', user_id: 'u1', customer_name: 'ครูแนน', status: 'active', total: 300, balance_due: 300, job_number: 'MJ-1', created_at: '2026-11-02T01:00:00.000Z' },
  { id: 'j2', user_id: 'u1', customer_name: 'ครู แนน', status: 'completed', total: 900, balance_due: 0, job_number: 'MJ-0', created_at: '2026-10-20T01:00:00.000Z' },
  { id: 'j3', user_id: 'u1', customer_name: 'บริษัท เอ', status: 'completed', total: 50, balance_due: 0, job_number: 'MJ-9', created_at: '2026-10-01T01:00:00.000Z' },
  { id: 'j4', user_id: 'u1', customer_name: 'ยกเลิกไปแล้ว', status: 'cancelled', total: 10, balance_due: 10, created_at: '2026-11-03T01:00:00.000Z' },
  { id: 'j5', user_id: 'u2', customer_name: 'คนอื่น', status: 'active', total: 1, balance_due: 1, created_at: '2026-11-03T01:00:00.000Z' },
];

const MESSAGES = [
  // newest first, as the database returns them
  { id: 'm3', user_id: 'u1', customer_key: 'ครูแนน', customer_name: 'ครูแนน', direction: 'in', body: 'ส่งรูปมาแล้ว', file_url: null, created_at: '2026-11-02T03:10:00.000Z', read_at: null },
  { id: 'm2', user_id: 'u1', customer_key: 'ครูแนน', customer_name: 'ครูแนน', direction: 'out', body: 'รับทราบค่ะ', file_url: null, created_at: '2026-11-02T03:05:00.000Z', read_at: '2026-11-02T03:05:00.000Z' },
  { id: 'm1', user_id: 'u1', customer_key: 'ครูแนน', customer_name: 'ครูแนน', direction: 'in', body: 'ขอใบเสนอราคา', file_url: null, created_at: '2026-11-02T03:00:00.000Z', read_at: null },
  { id: 'm4', user_id: 'u2', customer_key: 'คนอื่น', customer_name: 'คนอื่น', direction: 'in', body: 'ของคนอื่น', file_url: null, created_at: '2026-11-03T05:00:00.000Z', read_at: null },
];

const noOrgs = async () => new Map([['ครูแนน', 'โรงเรียนพระธาตุ']]);

test('listChatCustomers: รวมงานกับข้อความของลูกค้าคนเดียวกันเข้าด้วยกัน ตามกติกาสมุดลูกค้า', async () => {
  const { client } = fakeClient({ jobs: JOBS.slice(), chat_messages: MESSAGES.slice() });
  const out = await listChatCustomers('u1', { client, orgsOf: noOrgs });
  const nan = out.customers.find((c) => c.key === 'ครูแนน');
  assert.ok(nan, 'ครูแนน ต้องรวมสองการสะกด');
  assert.equal(nan.jobCount, 2);
  assert.equal(nan.openJobs, 1);
  assert.equal(nan.balanceDue, 300);
  assert.equal(nan.orgName, 'โรงเรียนพระธาตุ');
  assert.equal(out.chatReady, true);
});

test('listChatCustomers: นับข้อความรอตอบจากลูกค้าเท่านั้น ข้อความร้านไม่นับ', async () => {
  const { client } = fakeClient({ jobs: JOBS.slice(), chat_messages: MESSAGES.slice() });
  const out = await listChatCustomers('u1', { client, orgsOf: noOrgs });
  const nan = out.customers.find((c) => c.key === 'ครูแนน');
  assert.equal(nan.unread, 2);
  assert.equal(nan.lastMessage.body, 'ส่งรูปมาแล้ว');
  assert.equal(nan.lastMessage.direction, 'in');
});

test('listChatCustomers: ไม่รวมงานที่ยกเลิก และไม่เห็นลูกค้าของบัญชีอื่น', async () => {
  const { client } = fakeClient({ jobs: JOBS.slice(), chat_messages: MESSAGES.slice() });
  const out = await listChatCustomers('u1', { client, orgsOf: noOrgs });
  assert.equal(out.customers.some((c) => c.key === 'ยกเลิกไปแล้ว'), false);
  assert.equal(out.customers.some((c) => c.key === 'คนอื่น'), false);
});

test('listChatCustomers: ลูกค้าที่งานเสร็จหมดนับเป็นเสร็จแล้ว และเรียงจากคนที่ขยับล่าสุด', async () => {
  const { client } = fakeClient({ jobs: JOBS.slice(), chat_messages: MESSAGES.slice() });
  const out = await listChatCustomers('u1', { client, orgsOf: noOrgs });
  assert.deepEqual(out.customers.map((c) => c.key), ['ครูแนน', 'บริษัทเอ']);
  const done = out.customers.find((c) => c.key === 'บริษัทเอ');
  assert.equal(done.openJobs, 0);
  assert.equal(done.lastMessage, null);
});

test('listChatCustomers: ตารางข้อความยังไม่มี → ยังได้รายชื่อจากงาน และบอกว่าแชตยังไม่พร้อม', async () => {
  const { client } = fakeClient({ jobs: JOBS.slice() }, { failing: ['chat_messages'] });
  const out = await listChatCustomers('u1', { client, orgsOf: noOrgs });
  assert.equal(out.chatReady, false);
  assert.ok(out.customers.some((c) => c.key === 'ครูแนน'));
});

test('listChatCustomers: ช่องทางทั้งหมดยังไม่เชื่อมต่อ และไม่มีช่องไหนถูกทำเครื่องหมายว่าใช้ได้', async () => {
  const { client } = fakeClient({ jobs: [], chat_messages: [] });
  const out = await listChatCustomers('u1', { client, orgsOf: noOrgs });
  assert.deepEqual(out.channels, CHAT_CHANNELS);
  assert.ok(out.channels.every((c) => c.connected === false));
});

test('listChatCustomers: งานพังให้โยน error ออกไป ไม่เงียบว่าไม่มีลูกค้า', async () => {
  const { client } = fakeClient({}, { failing: ['jobs'] });
  await assert.rejects(() => listChatCustomers('u1', { client, orgsOf: noOrgs }));
});

test('listChatMessages: คืนข้อความจากเก่าไปใหม่ของลูกค้าคนนั้นเท่านั้น', async () => {
  const { client } = fakeClient({ chat_messages: MESSAGES.slice() });
  const rows = await listChatMessages('u1', 'ครูแนน', { client });
  assert.deepEqual(rows.map((r) => r.id), ['m1', 'm2', 'm3']);
});

test('listCustomerJobs: งานของลูกค้าคนนี้ทุกใบ ยกเว้นที่ยกเลิก', async () => {
  const { client } = fakeClient({ jobs: JOBS.slice() });
  const rows = await listCustomerJobs('u1', 'ครูแนน', { client });
  assert.deepEqual(rows.map((r) => r.id), ['j1', 'j2']);
});

test('addChatMessage: ข้อความขาออกถูกทำเครื่องหมายว่าอ่านแล้ว ขาเข้ายังรอตอบ', async () => {
  const tables = { chat_messages: [] };
  const { client, inserted } = fakeClient(tables);
  const out = await addChatMessage('u1', { customerName: 'ครู แนน', direction: 'out', body: 'รับทราบ' }, { client });
  assert.equal(inserted[0].row.customer_key, 'ครูแนน');
  assert.equal(inserted[0].row.customer_name, 'ครู แนน');
  assert.ok(inserted[0].row.read_at, 'ขาออกต้องมี read_at');
  assert.equal(out.direction, 'out');

  await addChatMessage('u1', { customerName: 'ครูแนน', direction: 'in', body: 'ขอด้วย' }, { client });
  assert.equal(inserted[1].row.read_at, null);
});

test('addChatMessage: ไม่มีชื่อลูกค้าให้ผูกข้อความ = ปฏิเสธ', async () => {
  const { client } = fakeClient({ chat_messages: [] });
  await assert.rejects(() => addChatMessage('u1', { customerName: '   ', direction: 'in', body: 'x' }, { client }));
});

test('markChatRead: เคลียร์เฉพาะข้อความขาเข้าของลูกค้าคนนั้น', async () => {
  const rows = MESSAGES.map((m) => ({ ...m }));
  const { client } = fakeClient({ chat_messages: rows });
  await markChatRead('u1', 'ครูแนน', { client });
  const nan = rows.filter((r) => r.customer_key === 'ครูแนน' && r.direction === 'in');
  assert.ok(nan.every((r) => r.read_at), 'ข้อความของครูแนนที่รอตอบต้องอ่านแล้ว');
  assert.equal(rows.find((r) => r.id === 'm4').read_at, null, 'ของลูกค้าคนอื่นต้องไม่ถูกแตะ');
});

test('findJobByClientRef: ไม่มีรหัสหรือยังไม่มีคอลัมน์ → null ไม่พัง', async () => {
  const { client } = fakeClient({ jobs: [] });
  assert.equal(await findJobByClientRef('u1', null, { client }), null);
  const missing = {
    from: () => chain({ data: null, error: { code: 'PGRST204', message: "Could not find the 'client_ref' column of 'jobs' in the schema cache" } }),
  };
  assert.equal(await findJobByClientRef('u1', 'ref-12345678', { client: missing }), null);
});

test('findJobByClientRef: เจองานที่มีรหัสเดิม คืนงานนั้น', async () => {
  const found = { from: () => chain({ data: { id: 'j-old' }, error: null }) };
  assert.deepEqual(await findJobByClientRef('u1', 'ref-12345678', { client: found }), { id: 'j-old' });
});
