import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import express from 'express';
import { gameStatusOf, workPatch, gameJob, gameKindOf, WORK_STAGES } from '../src/utils/gameBridge.js';
import { TRANSITIONS, bkkTodayISO } from '../public/game/engine.js';
import { createApiRouter } from '../src/routes/api.js';

process.env.LIFF_ID = '1234567890-abcdefgh';

/* เกมหน้าร้านต่อกับงานจริงของม่วงจด (ร้านสั่ง 24 พ.ย. 69: "ไม่จำลองละค่ะ
 * ใช้ระบบจริงเลย") — สะพานนี้มีกติกาเหล็กสองข้อที่เทสต์ชุดนี้ตรึงไว้:
 *   1. เกมแตะเงินไม่ได้เลยสักช่อง (V2 §4 ห้ามเดา/ห้ามคิดเงินแทน)
 *   2. สถานะเกมไม่เก็บซ้ำกับของจริง — ยกเลิก/รับแล้ว/เสร็จ อ่านจากช่องเดิม
 */

const NOW = new Date('2026-11-23T18:30:00.000Z'); // = 24 พ.ย. 2026 01:30 เวลาไทย

// งานจริงที่ "จ่ายครบแล้ว" โดยเฉพาะ — ล่อให้ patch เผลอไปยุ่งเงินได้ง่ายสุด
const job = (over = {}) => ({
  id: 'j1',
  job_number: 'NP68-104',
  customer_name: 'โรงเรียนบ้านหนองแดง',
  job_name: 'ป้ายไวนิลงานกีฬาสี',
  category: 'sign',
  category_type: 'vinyl',
  total: 500,
  paid_amount: 500,
  balance_due: 0,
  payment_status: 'paid',
  status: 'active',
  job_date: '2026-11-20',
  due_date: '2026-11-25',
  created_at: '2026-11-20T03:00:00.000Z',
  items: [
    { item_name: 'ป้ายไวนิล 3×1 ม.', quantity: 2, unit: 'ผืน' },
    { item_name: 'สติกเกอร์โลโก้', quantity: 100, unit: 'ดวง' },
  ],
  ...over,
});

// ตัวแทนงานจริงที่ "ยืนอยู่" แต่ละสถานะของเกม
const AT = {
  queued: {},
  preparing: { work_status: 'preparing' },
  producing: { work_status: 'producing' },
  quality_check: { work_status: 'quality_check' },
  out_to_vinyl: { work_status: 'out_to_vinyl' },
  vinyl_production: { work_status: 'vinyl_production' },
  back_at_shop: { work_status: 'back_at_shop' },
  ready_for_pickup: { done_at: '2026-11-22T05:00:00.000Z' },
  picked_up: { done_at: '2026-11-22T05:00:00.000Z', picked_up_at: '2026-11-22T06:00:00.000Z' },
  canceled: { status: 'cancelled' },
};

test('เกมจริง: สถานะคิดจากช่องจริงก่อนเสมอ ไม่เก็บซ้ำ (ยกเลิก > รับแล้ว > เสร็จ > ขั้นผลิต)', () => {
  for (const [want, over] of Object.entries(AT)) assert.equal(gameStatusOf(job(over)), want, want);
  // รับแล้วชนะ work_status ที่ค้างอยู่ / ยกเลิกชนะทุกอย่าง
  assert.equal(gameStatusOf(job({ work_status: 'producing', picked_up_at: 'x' })), 'picked_up');
  assert.equal(gameStatusOf(job({ work_status: 'producing', status: 'cancelled', picked_up_at: 'x' })), 'canceled');
  // ค่ามั่วในช่องขั้นผลิต = ยังไม่เริ่ม (ไม่พัง ไม่เดา)
  assert.equal(gameStatusOf(job({ work_status: 'hack_the_shop' })), 'queued');
  assert.deepEqual(WORK_STAGES, ['preparing', 'producing', 'quality_check', 'out_to_vinyl', 'vinyl_production', 'back_at_shop']);
});

test('เกมจริง: workPatch เดินได้ตามตาราง TRANSITIONS ของเกมเป๊ะ และยกเลิกจากเกมไม่ได้', () => {
  const ALL = Object.keys(TRANSITIONS);
  for (const from of ALL) {
    for (const to of ALL) {
      const legal = from !== 'canceled' && to !== 'canceled' && (TRANSITIONS[from] || []).includes(to);
      const r = workPatch(job(AT[from]), to, NOW);
      assert.equal(r !== null, legal, `${from} → ${to}`);
      if (r) assert.equal(r.from, from);
    }
  }
});

test('เกมจริง: patch แตะได้แค่ 4 ช่องงาน — ช่องเงินทุกช่องห้ามโผล่ (V2 §4)', () => {
  // ใช้งานที่จ่ายครบแล้วเป็นเหยื่อล่อ: ถ้า patch เผลอยุ่งเงินจะเห็นทันที
  const ALLOWED = new Set(['done_at', 'picked_up_at', 'work_status', 'work_history']);
  const MONEY = ['paid_amount', 'balance_due', 'payment_status', 'booked_at', 'pay_method', 'paid_at', 'total'];
  for (const from of Object.keys(TRANSITIONS)) {
    for (const to of TRANSITIONS[from] || []) {
      const r = workPatch(job(AT[from]), to, NOW);
      if (!r) continue; // คู่ที่มี canceled ถูกปัดไปแล้ว
      for (const k of Object.keys(r.patch)) assert.ok(ALLOWED.has(k), `${from}→${to} เขียนช่อง ${k}`);
      for (const m of MONEY) assert.ok(!(m in r.patch), `${from}→${to} แตะเงิน ${m}`);
    }
  }
});

test('เกมจริง: เดินหน้า-ถอยหลังเขียนช่องถูกตัว และประวัติต่อท้ายไม่เกิน 50 แถว', () => {
  // รอคิว → เตรียมไฟล์: แค่ขั้นผลิต ไม่มีประทับเวลา
  const start = workPatch(job(), 'preparing', NOW).patch;
  assert.equal(start.work_status, 'preparing');
  assert.ok(!('done_at' in start) && !('picked_up_at' in start));
  assert.deepEqual(start.work_history.at(-1), { from: 'queued', to: 'preparing', at: NOW.toISOString() });

  // ตรวจงาน → พร้อมรับ: ประทับ done_at (ช่อง "ทำเสร็จ" จริงของม่วงจด)
  const ready = workPatch(job(AT.quality_check), 'ready_for_pickup', NOW).patch;
  assert.equal(ready.done_at, NOW.toISOString());

  // พร้อมรับ → ลูกค้ารับ: ประทับ picked_up_at และ done_at เดิมไม่หาย
  const picked = workPatch(job(AT.ready_for_pickup), 'picked_up', NOW).patch;
  assert.equal(picked.picked_up_at, NOW.toISOString());
  assert.equal(picked.done_at, AT.ready_for_pickup.done_at);

  // พร้อมรับ → ถอยกลับไปตรวจใหม่: ล้างทั้ง done_at และ picked_up_at พร้อมกัน
  const back = workPatch(job(AT.ready_for_pickup), 'quality_check', NOW).patch;
  assert.equal(back.done_at, null);
  assert.equal(back.picked_up_at, null);
  assert.equal(back.work_status, 'quality_check');

  // ถอยไป "รอคิว" = ล้างขั้นผลิต (ไม่เก็บคำว่า queued ให้รก)
  assert.equal(workPatch(job(AT.preparing), 'queued', NOW), null); // preparing ถอยไป queued ไม่ได้ตามตาราง
  const reopenLike = workPatch(job(AT.quality_check), 'producing', NOW).patch;
  assert.equal(reopenLike.work_status, 'producing');

  // ประวัติยาว 60 แถว → เหลือ 50 แถวท้าย (แถวใหม่อยู่ท้ายสุด)
  const long = workPatch(job({ work_history: Array.from({ length: 60 }, (_, i) => ({ from: 'x', to: 'y', at: String(i) })) }), 'preparing', NOW).patch;
  assert.equal(long.work_history.length, 50);
  assert.equal(long.work_history.at(-1).to, 'preparing');
});

test('เกมจริง: gameJob แปลงใบงานจริงให้เกมอ่าน — เลขงานจริงคงเดิม เงินไม่ส่งไปเลย', () => {
  const g = gameJob(job());
  assert.equal(g.no, 'NP68-104'); // เลขงานห้ามเปลี่ยน — เกมแสดงเลขจริง
  assert.equal(g.id, 'j1');
  assert.equal(g.customer, 'โรงเรียนบ้านหนองแดง');
  assert.equal(g.title, 'ป้ายไวนิลงานกีฬาสี');
  assert.deepEqual(g.items[0], { title: 'ป้ายไวนิล 3×1 ม.', qty: 2, unit: 'ผืน' });
  assert.equal(g.items.length, 2);
  assert.equal(g.kind, 'vinyl');
  assert.equal(g.received, '2026-11-20');
  assert.equal(g.due, '2026-11-25');
  assert.equal(g.status, 'queued');
  assert.equal(g.sample, false); // งานจริงไม่มีวันติดป้ายตัวอย่าง
  for (const m of ['total', 'paid_amount', 'balance_due', 'payment_status', 'pay_method']) {
    assert.ok(!(m in g), `เงินรั่วไปหน้าเกม: ${m}`);
  }

  // เวลารับจริง: ISO ตรง ๆ + วันที่แบบไทย (ข้ามเที่ยงคืน UTC ต้องได้วันไทยถูก)
  const p = gameJob(job(AT.picked_up));
  assert.equal(p.status, 'picked_up');
  assert.equal(p.pickedAt, '2026-11-22T06:00:00.000Z');
  assert.equal(p.pickedDate, '2026-11-22'); // 13:00 เวลาไทยวันเดียวกัน
  const lateNight = gameJob(job({ ...AT.ready_for_pickup, picked_up_at: '2026-11-23T18:30:00.000Z' }));
  assert.equal(lateNight.pickedDate, '2026-11-24'); // 01:30 เวลาไทย = วันถัดไป

  // ไม่มีรายการย่อย → ใช้ชื่องานเป็นรายการเดียว / ไม่มีชื่องาน → รายการแรกขึ้นแทน
  const bare = gameJob(job({ items: [], job_name: '' }));
  assert.equal(bare.items.length, 1);
  assert.equal(bare.title, 'งานไม่ระบุชื่อ');
  const fromItem = gameJob(job({ job_name: '' }));
  assert.equal(fromItem.title, 'ป้ายไวนิล 3×1 ม.');

  // งานด่วน: ของจริงไม่มีช่องด่วน — ถึง/เลยวันนัดถือว่าด่วน
  const today = bkkTodayISO();
  assert.equal(gameJob(job({ due_date: today })).priority, 'urgent');
  assert.equal(gameJob(job({ due_date: '2099-01-01' })).priority, 'normal');
  assert.equal(gameJob(job({ due_date: null })).priority, 'normal');
});

test('เกมจริง: แปลงหมวดงานจริง → สายงานในเกม (งานป้ายทุกชนิดเดินสายไวนิล)', () => {
  assert.equal(gameKindOf({ category: 'sign', category_type: 'foamboard' }), 'vinyl');
  assert.equal(gameKindOf({ category: 'print', category_type: 'copy' }), 'print');
  assert.equal(gameKindOf({ category: 'stamp' }), 'stamp');
  assert.equal(gameKindOf({ category: 'sticker' }), 'sticker');
  assert.equal(gameKindOf({ category: 'design' }), 'design');
  assert.equal(gameKindOf({ category: 'photo', job_name: 'อัดรูป 4×6' }), 'photo');
  assert.equal(gameKindOf({ category: 'photo', job_name: 'กรอบรูปทอง 20×24' }), 'frame');
  assert.equal(gameKindOf({ category: 'shipping' }), 'print'); // หมวดที่เกมไม่มีสาย → เครื่องพิมพ์
  assert.equal(gameKindOf({}), 'print');
});

test('เกมจริง: updateJob ยอมรับช่องของเกม (ชื่อนอกรายการถูกทิ้งเงียบ ๆ — เคยพลาดมาแล้ว)', () => {
  const src = readFileSync(new URL('../src/services/jobService.js', import.meta.url), 'utf8');
  assert.ok(src.includes("'work_status',"));
  assert.ok(src.includes("'work_history',"));
});

test('เกมจริง: API /game ครบวงจร — อ่านคิวจริง เดินสถานะถูกกติกา เงินไม่ถูกแตะ', async () => {
  const rows = { j1: job() };
  const saved = [];
  const app = express();
  app.use(express.json());
  app.use(
    '/api',
    createApiRouter({
      verify: async () => ({ userId: 'U1' }),
      resolveProfile: async () => ({ id: 'u1', line_user_id: 'U1' }),
      getJobById: async (_u, id) => (rows[id] ? structuredClone(rows[id]) : null),
      updateJob: async (_u, id, patch) => {
        saved.push(structuredClone(patch));
        Object.assign(rows[id], patch);
        return structuredClone(rows[id]);
      },
      getQueueJobs: async () => [structuredClone(rows.j1)],
    })
  );
  const server = app.listen(0);
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}/api`;
  const work = (id, to) =>
    fetch(`${base}/game/jobs/${id}/work`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to }),
    });

  try {
    // อ่านคิว: ได้ใบงานรูปแบบเกม เลขงานจริง และไม่มีช่องเงินติดมา
    const list = await (await fetch(`${base}/game/jobs`)).json();
    assert.equal(list.jobs.length, 1);
    assert.equal(list.jobs[0].no, 'NP68-104');
    assert.equal(list.jobs[0].status, 'queued');
    assert.ok(!('balance_due' in list.jobs[0]) && !('total' in list.jobs[0]));

    // เดินถูกกติกา: รอคิว → เตรียมไฟล์
    const ok = await work('j1', 'preparing');
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).job.status, 'preparing');
    assert.equal(saved.at(-1).work_status, 'preparing');

    // เดินข้ามขั้น: เตรียมไฟล์ → พร้อมรับ ไม่ได้ (ไม่อยู่ในตาราง)
    const bad = await work('j1', 'ready_for_pickup');
    assert.equal(bad.status, 400);
    assert.equal((await bad.json()).from, 'preparing');

    // ไหลตามสายจริงจนลูกค้ารับ — จุดเสี่ยงเงินทุกจุดต้องสะอาด
    for (const to of ['producing', 'quality_check', 'ready_for_pickup', 'picked_up']) {
      const r = await work('j1', to);
      assert.equal(r.status, 200, to);
    }
    assert.ok(rows.j1.picked_up_at, 'บันทึกเวลารับจริงลงช่องจริง');
    for (const patch of saved) {
      for (const m of ['paid_amount', 'balance_due', 'payment_status', 'booked_at', 'pay_method', 'paid_at']) {
        assert.ok(!(m in patch), `patch จากเกมแตะเงิน: ${m}`);
      }
    }
    assert.equal(rows.j1.paid_amount, 500, 'ยอดจ่ายเดิมอยู่ครบ');
    assert.equal(rows.j1.balance_due, 0);

    // รับแล้วคือจบทาง / ยกเลิกจากเกมไม่ได้ / งานที่ไม่มีอยู่ = 404
    assert.equal((await work('j1', 'queued')).status, 400);
    assert.equal((await work('j1', 'canceled')).status, 400);
    assert.equal((await work('ghost', 'preparing')).status, 404);

    // ฐานข้อมูลยังไม่รัน migration 025 → บอกตรง ๆ ว่าต้องทำอะไร (503 ไม่ใช่ 500)
    const app2 = express();
    app2.use(express.json());
    app2.use(
      '/api',
      createApiRouter({
        verify: async () => ({ userId: 'U1' }),
        resolveProfile: async () => ({ id: 'u1', line_user_id: 'U1' }),
        getJobById: async () => job(),
        updateJob: async () => {
          const err = new Error("Could not find the 'work_status' column of 'jobs' in the schema cache");
          err.code = 'PGRST204';
          throw err;
        },
      })
    );
    const s2 = app2.listen(0);
    try {
      const miss = await fetch(`http://127.0.0.1:${s2.address().port}/api/game/jobs/j1/work`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: 'preparing' }),
      });
      assert.equal(miss.status, 503);
      assert.match((await miss.json()).message, /025_game_work_status/);
    } finally {
      s2.close();
    }
  } finally {
    server.close();
  }
});
