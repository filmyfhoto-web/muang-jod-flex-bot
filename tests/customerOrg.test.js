import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import express from 'express';
import { createApiRouter } from '../src/routes/api.js';
import { buildBook, buildAccount, accountKey } from '../src/utils/customerBook.js';
import { setCustomerOrg, listCustomerOrgs } from '../src/services/customerOrgService.js';

/* ร้านขอ "เพิ่มชื่อหน่วยงานในหน้าสมุดลูกค้า" — ครูแนนสั่งแทนโรงเรียน
 * งานของครูแนนต้องเข้าบัญชีโรงเรียน ไม่ใช่นับเป็นลูกค้าหน้าร้าน
 */

process.env.LIFF_ID = '1234567890-abcdefgh';
process.env.PUBLIC_BASE_URL = 'https://shop.example.com';

const JOBS = [
  { id: 'a', customer_name: 'ครูแนน', category: 'sign', job_name: 'ป้าย', status: 'active', total: 1000, paid_amount: 0, balance_due: 1000, created_at: '2026-10-01T09:00:00Z' },
  { id: 'b', customer_name: 'ครู แนน', category: 'sign', job_name: 'โฟม', status: 'active', total: 500, paid_amount: 500, balance_due: 0, created_at: '2026-10-02T09:00:00Z' },
  { id: 'c', customer_name: 'รร.พระธาตุพิทยาคม', category: 'sign', job_name: 'บอร์ด', status: 'active', total: 300, paid_amount: 0, balance_due: 300, created_at: '2026-10-03T09:00:00Z' },
  { id: 'd', customer_name: 'น้าปิ่ม', category: 'sticker', job_name: 'สติ๊กเกอร์', status: 'active', total: 250, paid_amount: 250, balance_due: 0, created_at: '2026-10-04T09:00:00Z' },
];

test('ไม่ผูก: ครูแนนเป็นลูกค้าหน้าร้าน ไม่มีบัญชีหน่วยงาน', () => {
  const book = buildBook(JOBS);
  assert.equal(book.orgs.length, 1);
  assert.equal(book.orgs[0].name, 'รร.พระธาตุพิทยาคม');
  assert.ok(book.people.some((p) => p.name === 'น้าปิ่ม'));
});

test('ผูกครูแนน → โรงเรียน: งานทุกใบ (สะกดต่างกันก็ได้) เข้าบัญชีโรงเรียน', () => {
  const links = new Map([[accountKey('ครูแนน'), 'โรงเรียนพระธาตุพิทยาคม']]);
  const book = buildBook(JOBS, links);
  const school = book.orgs.find((o) => o.name === 'โรงเรียนพระธาตุพิทยาคม');
  assert.ok(school, 'ไม่มีบัญชีโรงเรียน');
  assert.equal(school.jobCount, 2);
  assert.equal(school.owed, 1000);
  assert.deepEqual(school.contacts, ['ครู แนน', 'ครูแนน'].sort());
  // ครูแนนไม่ไปค้างอยู่ในลูกค้าหน้าร้านอีก
  assert.ok(!book.people.some((p) => accountKey(p.name) === accountKey('ครูแนน')));

  const account = buildAccount(JOBS, school.key, links);
  assert.equal(account.name, 'โรงเรียนพระธาตุพิทยาคม');
  assert.equal(account.kind, 'org');
  assert.equal(account.jobCount, 2);
});

test('ผูกกับโรงเรียนที่มีบัญชีอยู่แล้ว = รวมเข้าบัญชีเดียวกัน', () => {
  const links = new Map([[accountKey('ครูแนน'), 'รร พระธาตุพิทยาคม']]);
  const book = buildBook(JOBS, links);
  assert.equal(book.orgs.length, 1);
  assert.equal(book.orgs[0].jobCount, 3);
});

test('setCustomerOrg: ผูก, ผูกซ้ำ(แก้ชื่อ), เลิกผูก — ตารางเดียวต่อกุญแจ', async () => {
  const rows = [];
  const client = {
    from: () => ({
      upsert: async (row) => {
        const i = rows.findIndex((r) => r.user_id === row.user_id && r.customer_key === row.customer_key);
        if (i >= 0) rows[i] = row; else rows.push(row);
        return { error: null };
      },
      delete: () => ({
        eq: (_c1, uid) => ({ eq: async (_c2, key) => {
          const i = rows.findIndex((r) => r.user_id === uid && r.customer_key === key);
          if (i >= 0) rows.splice(i, 1);
          return { error: null };
        } }),
      }),
      select: () => ({ eq: async (_c, uid) => ({ data: rows.filter((r) => r.user_id === uid), error: null }) }),
    }),
  };

  await setCustomerOrg('u1', { customerName: 'ครู แนน', orgName: 'รร.ก' }, client);
  await setCustomerOrg('u1', { customerName: 'ครูแนน', orgName: 'รร.ข' }, client);
  assert.equal(rows.length, 1);
  assert.equal((await listCustomerOrgs('u1', client)).get(accountKey('ครูแนน')), 'รร.ข');
  assert.equal((await listCustomerOrgs('u2', client)).size, 0); // ของใครของมัน

  await setCustomerOrg('u1', { customerName: 'ครูแนน', orgName: '  ' }, client);
  assert.equal(rows.length, 0);

  assert.equal((await setCustomerOrg('u1', { customerName: '', orgName: 'x' }, client)).ok, false);
});

test('API: POST /book/org ผูกแล้ว GET /book เห็นบัญชีหน่วยงาน', async () => {
  const links = new Map();
  const app = express();
  app.use(express.json());
  app.use('/api', createApiRouter({
    verify: async () => ({ userId: 'U' }),
    resolveProfile: async () => ({ id: 'user-1', line_user_id: 'U' }),
    getBookJobs: async () => JOBS,
    listCustomerOrgs: async () => links,
    setCustomerOrg: async (_u, { customerName, orgName }) => {
      links.set(accountKey(customerName), orgName);
      return { ok: true, orgName };
    },
  }));
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, init) => {
    const res = await fetch(base + path, { ...init, headers: { Authorization: 'Bearer t', 'content-type': 'application/json' } });
    return { status: res.status, body: await res.json() };
  };
  try {
    const bad = await call('/api/book/org', { method: 'POST', body: JSON.stringify({ orgName: 'x' }) });
    assert.equal(bad.status, 400);

    const ok = await call('/api/book/org', { method: 'POST', body: JSON.stringify({ customerName: 'ครูแนน', orgName: 'โรงเรียน ก' }) });
    assert.equal(ok.status, 200);

    const book = await call('/api/book');
    assert.ok(book.body.orgs.some((o) => o.name === 'โรงเรียน ก' && o.jobCount === 2));
  } finally {
    server.close();
  }
});

test('หน้าสมุดมีฟอร์มผูกหน่วยงาน 3 ขั้น', () => {
  const page = readFileSync(new URL('../public/liff/book/index.html', import.meta.url), 'utf8');
  for (const id of ['org-open', 'org-form', 'of-person', 'of-org', 'of-orglist']) {
    assert.ok(page.includes(`id="${id}"`), id);
  }
  assert.ok(page.includes("'/book/org'"));
});

test('หมวดในแท็บงานทั่วไปกดเข้าไปดูงานข้างในได้', () => {
  const page = readFileSync(new URL('../public/liff/book/index.html', import.meta.url), 'utf8');
  assert.ok(page.includes("'/app/?tab=category&category=' + encodeURIComponent(r.id)"));
  // ทั้งแถวหน่วยงานและแถวหมวดเป็นปุ่มเหมือนกัน
  assert.ok(page.includes("const el = document.createElement('button');"));
});
