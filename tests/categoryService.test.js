import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resetTaxonomies, taxonomyOf, hasTaxonomy } from '../src/utils/category.js';
import { addCustomGroup, editorModel, normalizeConfig } from '../src/utils/taxonomy.js';
import {
  loadCategoryConfig,
  saveCategoryConfig,
  ensureTaxonomy,
  preloadTaxonomies,
  countJobsUsing,
  updateCategories,
} from '../src/services/categoryService.js';

/* หมวดงานของร้านต้องไม่ทำให้การจดงานล่มไม่ว่าฐานข้อมูลจะเป็นยังไง — ตารางยังไม่ได้สร้าง
 * (ยังไม่ได้รันไมเกรชัน 019) เน็ตสะดุด หรือแถวเพี้ยน ทุกกรณีต้องตกไปใช้ชุดตั้งต้นเงียบ ๆ
 */

afterEach(() => resetTaxonomies());

// Supabase ปลอมแค่พอใช้: ตาราง category_settings (แถวเดียวต่อร้าน) กับการนับงานใน jobs
function fakeClient({ rows = {}, jobCounts = {}, error = null, throws = false } = {}) {
  const log = { reads: 0, writes: [], counts: [] };
  const chain = (resolve) => {
    const filters = {};
    const c = {
      eq(k, v) {
        filters[k] = v;
        return c;
      },
      maybeSingle: async () => resolve(filters),
      then: (ok, bad) => Promise.resolve(resolve(filters)).then(ok, bad),
    };
    return c;
  };
  return {
    log,
    rows,
    from(table) {
      if (throws) throw new Error('network down');
      if (table === 'category_settings') {
        return {
          select: () =>
            chain((f) => {
              log.reads += 1;
              if (error) return { data: null, error };
              if ('user_id' in f) return { data: f.user_id in rows ? { config: rows[f.user_id] } : null, error: null };
              return { data: Object.entries(rows).map(([user_id, config]) => ({ user_id, config })), error: null };
            }),
          upsert: async (row) => {
            log.writes.push(row);
            if (error) return { error };
            rows[row.user_id] = row.config;
            return { error: null };
          },
        };
      }
      if (table === 'jobs') {
        return {
          select: () =>
            chain((f) => {
              const col = 'category' in f ? 'category' : 'category_type';
              log.counts.push({ col, id: f[col], user: f.user_id });
              if (error) return { count: null, error };
              return { count: jobCounts[f[col]] || 0, error: null };
            }),
        };
      }
      throw new Error('table ' + table);
    },
  };
}

const withGroup = (label = 'แก้วสกรีน', prev = null) => {
  const r = addCustomGroup(prev, { label, icon: '🥤', keys: [label] });
  assert.ok(r.ok, r.message);
  return r.config;
};

// ---------------------------------------------------------------------------

test('loadCategoryConfig: ยังไม่เคยแก้ = config เป็น null, อ่านไม่ได้ = null', async () => {
  const cfg = withGroup();
  assert.deepEqual(await loadCategoryConfig('u', fakeClient({ rows: { u: cfg } })), { config: cfg });
  assert.deepEqual(await loadCategoryConfig('u', fakeClient()), { config: null });
  assert.equal(await loadCategoryConfig('u', fakeClient({ error: { message: 'relation "category_settings" does not exist' } })), null);
  assert.equal(await loadCategoryConfig('u', fakeClient({ throws: true })), null, 'ล้มเหลวแบบ throw ก็ไม่ปล่อยออกไป');
});

test('saveCategoryConfig: เก็บหนึ่งแถวต่อร้าน และ throw เมื่อเก็บไม่ได้', async () => {
  const client = fakeClient();
  const cfg = withGroup();
  await saveCategoryConfig('u', cfg, client);
  assert.equal(client.log.writes.length, 1);
  assert.equal(client.log.writes[0].user_id, 'u');
  assert.deepEqual(client.log.writes[0].config, cfg);
  assert.ok(Date.parse(client.log.writes[0].updated_at), 'มีเวลาแก้ล่าสุด');

  await assert.rejects(saveCategoryConfig('u', cfg, fakeClient({ error: new Error('boom') })), /boom/);
});

test('ensureTaxonomy: โหลดครั้งเดียว จดไว้ในความจำ แล้วไม่ถามฐานข้อมูลซ้ำภายในรอบ', async () => {
  const cfg = withGroup();
  const client = fakeClient({ rows: { 'svc-a': cfg } });

  const tax = await ensureTaxonomy('svc-a', { client });
  assert.equal(tax.groups.some((g) => g.label === 'แก้วสกรีน'), true);
  assert.equal(hasTaxonomy('svc-a'), true);
  assert.equal(taxonomyOf('svc-a'), tax);
  assert.equal(client.log.reads, 1);

  await ensureTaxonomy('svc-a', { client });
  await ensureTaxonomy('svc-a', { client });
  assert.equal(client.log.reads, 1, 'ไม่ยิงฐานข้อมูลทุกข้อความ');

  await ensureTaxonomy('svc-a', { client, force: true });
  assert.equal(client.log.reads, 2, 'force = โหลดใหม่');
});

test('ensureTaxonomy: หลายคำขอพร้อมกันใช้คำขอเดียว', async () => {
  const client = fakeClient({ rows: { 'svc-b': withGroup() } });
  const [a, b, c] = await Promise.all([
    ensureTaxonomy('svc-b', { client }),
    ensureTaxonomy('svc-b', { client }),
    ensureTaxonomy('svc-b', { client }),
  ]);
  assert.equal(client.log.reads, 1);
  assert.equal(a, b);
  assert.equal(b, c);
});

test('ensureTaxonomy: ตารางยังไม่มี/อ่านไม่ได้ → ชุดตั้งต้น ไม่ throw ไม่ยิงซ้ำรัว ๆ', async () => {
  const client = fakeClient({ error: { message: 'relation "category_settings" does not exist' } });
  const tax = await ensureTaxonomy('svc-c', { client });
  assert.deepEqual(tax.groups.map((g) => g.id).slice(0, 2), ['print', 'sign']);
  assert.equal(hasTaxonomy('svc-c'), false);
  assert.equal(client.log.reads, 1);

  await ensureTaxonomy('svc-c', { client });
  assert.equal(client.log.reads, 1, 'ลองใหม่อีกทีในไม่กี่สิบวินาที ไม่ใช่ทุกข้อความ');
});

test('ensureTaxonomy: ไม่ใส่ client และปิดการโหลด (ตัวทดสอบ) → ไม่แตะฐานข้อมูลเลย', async () => {
  const tax = await ensureTaxonomy('svc-d');
  assert.ok(tax.groups.length >= 7);
  assert.equal(hasTaxonomy('svc-d'), false);
  assert.ok(await ensureTaxonomy(undefined), 'ไม่มี userId ก็ได้ชุดตั้งต้น');
});

test('ensureTaxonomy: ร้านที่เคยแก้แล้วลบทิ้งทั้งหมด กลับเป็นชุดตั้งต้น', async () => {
  const rows = { 'svc-e': withGroup() };
  const client = fakeClient({ rows });
  await ensureTaxonomy('svc-e', { client });
  assert.equal(hasTaxonomy('svc-e'), true);

  rows['svc-e'] = null; // แถวยังอยู่แต่ config ว่าง
  await ensureTaxonomy('svc-e', { client, force: true });
  assert.equal(hasTaxonomy('svc-e'), false);
});

test('preloadTaxonomies: โหลดทุกร้านที่เคยแก้ตอนเริ่มเซิร์ฟเวอร์', async () => {
  const client = fakeClient({ rows: { p1: withGroup('แก้วสกรีน'), p2: withGroup('เสื้อยืด') } });
  assert.equal(await preloadTaxonomies(client), 2);
  assert.equal(taxonomyOf('p1').groups.some((g) => g.label === 'แก้วสกรีน'), true);
  assert.equal(taxonomyOf('p2').groups.some((g) => g.label === 'เสื้อยืด'), true);
  assert.equal(taxonomyOf('p1').groups.some((g) => g.label === 'เสื้อยืด'), false, 'ไม่ปนกันระหว่างร้าน');

  assert.equal(await preloadTaxonomies(fakeClient({ error: { message: 'nope' } })), 0);
  assert.equal(await preloadTaxonomies(fakeClient({ throws: true })), 0);
});

test('countJobsUsing: คืนเฉพาะหมวด/ประเภทที่ยังมีงานใช้ พร้อมจำนวน', async () => {
  const client = fakeClient({ jobCounts: { c_used00: 3, t_used00: 1 } });
  const used = await countJobsUsing(
    'u',
    { groupIds: ['c_used00', 'c_free00'], typeIds: ['t_used00', 't_free00'] },
    client
  );
  assert.deepEqual(used, [
    { kind: 'group', id: 'c_used00', count: 3 },
    { kind: 'type', id: 't_used00', count: 1 },
  ]);
  assert.ok(client.log.counts.every((c) => c.user === 'u'), 'นับเฉพาะงานของร้านนี้');

  await assert.rejects(countJobsUsing('u', { groupIds: ['x'] }, fakeClient({ error: new Error('db') })), /db/);
  assert.deepEqual(await countJobsUsing('u', {}, client), []);
});

// --- บันทึกจากหน้าแก้ไข ----------------------------------------------------------

function deps({ config = null, ready = true, used = [] } = {}) {
  const saved = [];
  return {
    saved,
    loadCategoryConfig: async () => (ready ? { config } : null),
    saveCategoryConfig: async (u, c) => void saved.push([u, c]),
    countJobsUsing: async () => used,
  };
}
const editedWith = (config, mutate) => {
  const groups = editorModel(config).groups.map((g) => ({ ...g, types: g.types.map((t) => ({ ...t })) }));
  mutate(groups);
  return { groups };
};

test('updateCategories: บันทึก แล้วร้านเห็นหมวดใหม่ทันทีโดยไม่ต้องรอรอบโหลด', async () => {
  const d = deps();
  const input = editedWith(null, (gs) => gs.splice(gs.length - 1, 0, { id: '', label: 'แก้วสกรีน', icon: '🥤', keys: 'แก้วสกรีน' }));
  const out = await updateCategories('save-a', input, d);
  assert.equal(out.ok, true);
  assert.equal(d.saved.length, 1);
  assert.equal(d.saved[0][0], 'save-a');
  assert.deepEqual(d.saved[0][1], out.config);
  assert.equal(taxonomyOf('save-a').classifyItem('แก้วสกรีน 10 ใบ').group.label, 'แก้วสกรีน');
});

test('updateCategories: ตารางยังไม่ได้สร้าง → 503 บอกให้รันไมเกรชัน ไม่บันทึกอะไร', async () => {
  const d = deps({ ready: false });
  const out = await updateCategories('save-b', editedWith(null, () => {}), d);
  assert.equal(out.ok, false);
  assert.equal(out.status, 503);
  assert.match(out.message, /019_category_settings\.sql/);
  assert.equal(d.saved.length, 0);
});

test('updateCategories: ข้อมูลไม่ถูกต้อง → 400 พร้อมเหตุผลที่อ่านออก ไม่บันทึก', async () => {
  const d = deps();
  const out = await updateCategories('save-c', editedWith(null, (gs) => gs.splice(gs.length - 1, 0, { id: '', label: 'งานป้าย' })), d);
  assert.equal(out.status, 400);
  assert.match(out.message, /งานป้าย.*ซ้ำ/);
  assert.equal(d.saved.length, 0);
  assert.equal((await updateCategories('save-c', null, d)).status, 400);
});

test('updateCategories: ลบหมวดที่ยังมีงานใช้ไม่ได้ → 409 บอกชื่อกับจำนวนงาน และแนะนำให้ซ่อน', async () => {
  const config = withGroup('แก้วสกรีน');
  const mine = config.groups.find((g) => g.custom);
  const d = deps({ config, used: [{ kind: 'group', id: mine.id, count: 4 }] });

  const out = await updateCategories('save-d', { groups: editorModel(config).groups.filter((g) => g.id !== mine.id) }, d);
  assert.equal(out.ok, false);
  assert.equal(out.status, 409);
  assert.match(out.message, /แก้วสกรีน/);
  assert.match(out.message, /4 งาน/);
  assert.match(out.message, /ซ่อน/);
  assert.equal(d.saved.length, 0);
});

test('updateCategories: ลบหมวดที่ไม่มีงานใช้แล้วได้ และหายจากความจำด้วย', async () => {
  const config = withGroup('แก้วสกรีน');
  const mine = config.groups.find((g) => g.custom);
  const d = deps({ config, used: [] });

  const out = await updateCategories('save-e', { groups: editorModel(config).groups.filter((g) => g.id !== mine.id) }, d);
  assert.equal(out.ok, true);
  assert.equal(d.saved.length, 1);
  assert.equal(taxonomyOf('save-e').findGroup(mine.id), null);
});

test('updateCategories: ไม่ถามฐานข้อมูลว่ามีงานใช้ไหม ถ้าไม่ได้ลบอะไร', async () => {
  const config = withGroup('แก้วสกรีน');
  let asked = 0;
  const d = { ...deps({ config }), countJobsUsing: async () => void (asked += 1) || [] };
  const out = await updateCategories('save-f', { groups: editorModel(config).groups }, d);
  assert.equal(out.ok, true);
  assert.equal(asked, 0);
});

test('updateCategories: เอาไปเรียกซ้ำด้วยของที่เก็บไว้ได้ผลเหมือนเดิม (บันทึกซ้ำไม่ทำให้เพี้ยน)', async () => {
  const first = normalizeConfig(editedWith(null, (gs) => gs.splice(gs.length - 1, 0, { id: '', label: 'แก้วสกรีน', keys: 'แก้วสกรีน' })));
  assert.ok(first.ok);
  const again = normalizeConfig({ groups: editorModel(first.config).groups }, first.config);
  assert.deepEqual(again.config, first.config);
});
