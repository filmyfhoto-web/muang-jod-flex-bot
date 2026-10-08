import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createApiRouter } from '../src/routes/api.js';
import { resetTaxonomies, taxonomyOf } from '../src/utils/category.js';
import { addCustomGroup } from '../src/utils/taxonomy.js';

/* หน้า "เพิ่ม / แก้ไขหมวดงาน" คุยกับเซิร์ฟเวอร์สองเส้นทาง:
 *   GET  /api/categories  อ่านโมเดลที่แก้ได้
 *   PUT  /api/categories  บันทึกทั้งรายการ
 */

process.env.LIFF_ID = '1234567890-abcdefgh';
process.env.PUBLIC_BASE_URL = 'https://shop.example.com';

afterEach(() => resetTaxonomies());

async function serve(over = {}) {
  const state = { config: over.config ?? null, saved: [], warmed: [] };
  const app = express();
  app.use(
    '/api',
    createApiRouter({
      verify: async (token) => (token === 'good' ? { userId: 'U-line' } : null),
      resolveProfile: async () => ({ id: 'api-user-1', line_user_id: 'U-line' }),
      ensureTaxonomy: async (id) => void state.warmed.push(id),
      loadCategoryConfig: async () => (over.ready === false ? null : { config: state.config }),
      saveCategoryConfig: async (u, c) => {
        state.saved.push([u, c]);
        state.config = c;
      },
      countJobsUsing: async () => over.used || [],
      ...(over.deps || {}),
    })
  );
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, body, token = 'good') => {
    const res = await fetch(`${base}/api/categories`, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };
  return { state, call, close: () => new Promise((r) => server.close(r)) };
}

const NEW = (over = {}) => ({ id: '', label: 'แก้วสกรีน', icon: '🥤', keys: 'แก้วสกรีน', types: [], ...over });
const withNew = (model, extra) => {
  const groups = model.groups.slice(0, -1);
  return { groups: [...groups, extra, model.groups.at(-1)] };
};

test('GET: ยังไม่เคยแก้ → ชุดตั้งต้นพร้อมข้อมูลให้หน้าแก้ไข', async () => {
  const s = await serve();
  try {
    const { status, body } = await s.call('GET');
    assert.equal(status, 200);
    assert.equal(body.ready, true);
    assert.deepEqual(body.groups.map((g) => g.id), ['print', 'sign', 'stamp', 'sticker', 'photo', 'design', 'shipping', 'other']);
    assert.equal(body.groups.at(-1).locked, true);
    assert.ok(body.palette.length >= 6);
    assert.ok(body.limits.groups > 0);
    assert.ok(s.state.warmed.includes('api-user-1'), 'อุ่นชุดหมวดของร้านก่อนตอบ');
  } finally {
    await s.close();
  }
});

test('GET: ตารางยังไม่ได้สร้าง → ready=false หน้าจะบอกให้รันไมเกรชัน (ยังเห็นชุดตั้งต้น)', async () => {
  const s = await serve({ ready: false });
  try {
    const { status, body } = await s.call('GET');
    assert.equal(status, 200);
    assert.equal(body.ready, false);
    assert.equal(body.groups.length, 8);
  } finally {
    await s.close();
  }
});

test('PUT: เพิ่มหมวดใหม่ → บันทึก คืนโมเดลใหม่ และใช้ได้ทันที', async () => {
  const s = await serve();
  try {
    const model = (await s.call('GET')).body;
    const { status, body } = await s.call('PUT', withNew(model, NEW()));
    assert.equal(status, 200);
    const mine = body.groups.find((g) => g.custom);
    assert.equal(mine.label, 'แก้วสกรีน');
    assert.match(mine.id, /^c_[a-z0-9]{6}$/);
    assert.equal(mine.code, 'XAA');
    assert.equal(body.groups.at(-1).id, 'other');

    assert.equal(s.state.saved.length, 1);
    assert.equal(s.state.saved[0][0], 'api-user-1');
    assert.equal(taxonomyOf('api-user-1').classifyItem('แก้วสกรีน 12 ใบ').group.id, mine.id);

    // อ่านกลับมาเห็นเหมือนกัน
    const again = (await s.call('GET')).body;
    assert.deepEqual(again.groups.map((g) => [g.id, g.label]), body.groups.map((g) => [g.id, g.label]));
  } finally {
    await s.close();
  }
});

test('PUT: ข้อมูลไม่ถูกต้อง → 400 invalid พร้อมข้อความ', async () => {
  const s = await serve();
  try {
    const model = (await s.call('GET')).body;
    const dup = await s.call('PUT', withNew(model, NEW({ label: 'งานป้าย' })));
    assert.equal(dup.status, 400);
    assert.equal(dup.body.error, 'invalid');
    assert.match(dup.body.message, /ซ้ำ/);

    const empty = await s.call('PUT', withNew(model, NEW({ label: '' })));
    assert.equal(empty.status, 400);
    assert.match(empty.body.message, /ต้องมีชื่อ/);

    assert.equal((await s.call('PUT', {})).status, 400);
    assert.equal((await s.call('PUT', { groups: 'x' })).status, 400);
    assert.equal(s.state.saved.length, 0, 'ไม่มีอะไรถูกบันทึก');
  } finally {
    await s.close();
  }
});

test('PUT: ลบหมวดที่ยังมีงานใช้ → 409 in_use', async () => {
  const seeded = addCustomGroup(null, { label: 'แก้วสกรีน', icon: '🥤' }).config;
  const mine = seeded.groups.find((g) => g.custom);
  const s = await serve({ config: seeded, used: [{ kind: 'group', id: mine.id, count: 2 }] });
  try {
    const model = (await s.call('GET')).body;
    const { status, body } = await s.call('PUT', { groups: model.groups.filter((g) => g.id !== mine.id) });
    assert.equal(status, 409);
    assert.equal(body.error, 'in_use');
    assert.match(body.message, /2 งาน/);
    assert.equal(s.state.saved.length, 0);
  } finally {
    await s.close();
  }
});

test('PUT: ตารางยังไม่ได้สร้าง → 503 not_ready', async () => {
  const s = await serve({ ready: false });
  try {
    const model = (await s.call('GET')).body;
    const { status, body } = await s.call('PUT', withNew(model, NEW()));
    assert.equal(status, 503);
    assert.equal(body.error, 'not_ready');
    assert.match(body.message, /019/);
  } finally {
    await s.close();
  }
});

test('PUT: บันทึกพังกลางทาง → 500 ไม่ใช่ตอบว่าสำเร็จ', async () => {
  const s = await serve({
    deps: {
      saveCategoryConfig: async () => {
        throw new Error('db down');
      },
    },
  });
  try {
    const model = (await s.call('GET')).body;
    const { status } = await s.call('PUT', withNew(model, NEW()));
    assert.equal(status, 500);
    assert.equal(taxonomyOf('api-user-1').findGroup('print').label, 'งานพิมพ์');
    assert.ok(!taxonomyOf('api-user-1').groups.some((g) => g.custom), 'ยังไม่จดในความจำเมื่อบันทึกไม่สำเร็จ');
  } finally {
    await s.close();
  }
});

test('ต้องล็อกอิน: ไม่มี token / token ผิด → 401 ทั้งอ่านและเขียน', async () => {
  const s = await serve();
  try {
    assert.equal((await s.call('GET', undefined, null)).status, 401);
    assert.equal((await s.call('GET', undefined, 'bad')).status, 401);
    assert.equal((await s.call('PUT', { groups: [] }, 'bad')).status, 401);
    assert.equal(s.state.saved.length, 0);
  } finally {
    await s.close();
  }
});

test('PUT: รายการใหญ่กว่า 64kb ผ่านได้ (หมวดเยอะ คำค้นเยอะ) แต่ใหญ่เกินจริงถูกปฏิเสธ', async () => {
  const s = await serve();
  try {
    const model = (await s.call('GET')).body;
    const padded = (n) => ({ groups: model.groups.map((g) => (g.id === 'print' ? { ...g, note: 'x'.repeat(n) } : g)) });

    // 100kb เกินขีดจำกัดทั่วไปของ API (64kb) แต่หน้านี้ส่งทั้งรายการ จึงมีเพดานของตัวเอง
    assert.equal((await s.call('PUT', padded(100_000))).status, 200);
    assert.equal(s.state.saved.length, 1);

    const tooBig = await s.call('PUT', padded(600_000));
    assert.ok(tooBig.status >= 400, 'ใหญ่เกินเพดาน 256kb ต้องไม่ผ่าน');
    assert.equal(s.state.saved.length, 1, 'และไม่ถูกบันทึก');
  } finally {
    await s.close();
  }
});
