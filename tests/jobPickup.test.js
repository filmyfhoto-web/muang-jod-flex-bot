import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import express from 'express';
import { jobState, pickupPatch, JOB_STATES } from '../src/utils/jobState.js';
import { createApiRouter } from '../src/routes/api.js';

process.env.LIFF_ID = '1234567890-abcdefgh';

/* ร้านขอปุ่มสามปุ่มบนคิวงาน: ✅ รับแล้ว · 📛 ค้างจ่าย · ❎ ยังไม่มารับ
 *
 * สามอย่างนี้เป็นสองเรื่องซ้อนกัน — "ของออกจากร้านไปหรือยัง" กับ "ได้เงินหรือ
 * ยัง" ของเดิมมีแต่เรื่องเงิน งานที่ทำเสร็จวางรออยู่หน้าร้าน กับงานที่ลูกค้า
 * หอบไปแล้วแต่ยังไม่จ่าย จึงหน้าตาเหมือนกันเป๊ะ ทั้งที่ต้องตามคนละแบบ
 */

const NOW = new Date('2026-09-25T02:00:00.000Z');
const job = (over = {}) => ({ id: 'j1', total: 600, paid_amount: 0, balance_due: 600, ...over });

test('สามสถานะคิดจากของที่เก็บไว้จริง ไม่ได้เก็บซ้ำอีกช่อง', () => {
  assert.equal(jobState(job()), 'waiting', 'ยังไม่มารับ');
  assert.equal(jobState(job({ picked_up_at: NOW.toISOString() })), 'owed', 'มารับแล้วแต่ยังไม่จ่าย');
  assert.equal(
    jobState(job({ picked_up_at: NOW.toISOString(), paid_amount: 600, balance_due: 0 })),
    'done'
  );

  // จ่ายมาก่อนแล้วยังไม่มารับ เป็นเรื่องปกติ — ต้องยังเป็น "ยังไม่มารับ"
  assert.equal(jobState(job({ paid_amount: 600, balance_due: 0 })), 'waiting');

  assert.deepEqual(JOB_STATES.map((s) => s.id), ['done', 'owed', 'waiting']);
});

test('✅ รับแล้ว = ของออกไปและเก็บเงินครบ', () => {
  assert.deepEqual(pickupPatch(job(), 'done', NOW), {
    picked_up_at: NOW.toISOString(),
    paid_amount: 600,
    balance_due: 0,
    payment_status: 'paid',
  });

  // มัดจำไว้ 300 แล้วมารับจ่ายส่วนที่เหลือ ก็ต้องเป็นจ่ายครบ
  assert.equal(pickupPatch(job({ paid_amount: 300, balance_due: 300 }), 'done', NOW).paid_amount, 600);
});

test('📛 ค้างจ่าย ไม่ไปลบเงินมัดจำที่รับมาแล้ว', () => {
  // ค้างอยู่จริง ไม่ต้องไปยุ่งกับเงิน แค่บอกว่าของออกไปแล้ว
  assert.deepEqual(pickupPatch(job({ paid_amount: 300, balance_due: 300 }), 'owed', NOW), {
    picked_up_at: NOW.toISOString(),
  });
  assert.deepEqual(pickupPatch(job(), 'owed', NOW), { picked_up_at: NOW.toISOString() });

  /* แต่กดปุ่มนี้บนงานที่เคยทำเครื่องหมายว่าจ่ายครบ คือการแก้ว่า "ยังไม่ได้เงิน"
   * ยอดที่จ่ายต้องกลับเป็นศูนย์ ไม่งั้นป้ายกับตัวเลขพูดคนละเรื่อง
   */
  assert.deepEqual(pickupPatch(job({ paid_amount: 600, balance_due: 0 }), 'owed', NOW), {
    picked_up_at: NOW.toISOString(),
    paid_amount: 0,
    balance_due: 600,
    payment_status: 'pending',
  });
});

test('❎ ยังไม่มารับ ไม่ไปยุ่งกับเงินที่จ่ายมาแล้ว', () => {
  // จ่ายล่วงหน้าแล้วยังไม่มารับ เป็นเรื่องปกติ กดปุ่มนี้ต้องไม่ลบเงินทิ้ง
  assert.deepEqual(pickupPatch(job({ picked_up_at: NOW.toISOString(), paid_amount: 600, balance_due: 0 }), 'waiting', NOW), {
    picked_up_at: null,
  });
  assert.equal(pickupPatch(job(), 'ไม่รู้จัก', NOW), null, 'สถานะที่ไม่รู้จักต้องไม่เขียนอะไร');
});

test('กดปุ่มแล้วบันทึกจริงผ่าน API', async () => {
  const saved = [];
  const rows = { j1: job() };
  const app = express();
  app.use(express.json());
  app.use(
    '/api',
    createApiRouter({
      verify: async () => ({ userId: 'U1' }),
      resolveProfile: async () => ({ id: 'u1', line_user_id: 'U1' }),
      getJobById: async (_u, id) => (rows[id] ? { ...rows[id] } : null),
      updateJob: async (_u, id, patch) => {
        saved.push(patch);
        Object.assign(rows[id], patch);
        return { ...rows[id] };
      },
    })
  );

  const post = (id, state) =>
    fetch(`http://127.0.0.1:${port}/api/jobs/${id}/state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state }),
    });

  const server = app.listen(0);
  const { port } = server.address();
  try {
    const done = await post('j1', 'done');
    assert.equal(done.status, 200);
    assert.equal((await done.json()).job.payment_status, 'paid');
    assert.equal(saved[0].balance_due, 0);

    const back = await post('j1', 'waiting');
    assert.equal(back.status, 200);
    assert.equal((await back.json()).job.picked_up_at, null);
    // เงินที่จ่ายมาแล้วต้องไม่หายไปกับการบอกว่ายังไม่มารับ
    assert.equal(rows.j1.paid_amount, 600);

    assert.equal((await post('j1', 'มั่ว')).status, 400, 'สถานะมั่วต้องไม่ผ่าน');
    assert.equal((await post('ไม่มีงานนี้', 'done')).status, 404);
  } finally {
    server.close();
  }
});

test('หน้าเว็บมีแผงสถานะเลือกอิสระ และใช้กติกาเดียวกับฝั่งเซิร์ฟเวอร์', () => {
  const page = readFileSync(new URL('../public/liff/index.html', import.meta.url), 'utf8');

  /* ร้านขอ "เอาเลือกแบบนี้ดีกว่า": แก้ไข · ทำเสร็จ · ลูกค้ารับแล้ว ·
   * ได้รับเงิน (จ่ายสด) · ยังไม่ได้รับเงิน (ลงบัญชี) — เลือกอิสระ ไม่ใช่สี่ขั้นต่อกัน
   */
  for (const label of ['แก้ไข', 'ทำเสร็จ', 'ลูกค้ารับแล้ว', 'ได้รับเงิน', 'จ่ายสด', 'ยังไม่ได้รับเงิน', 'ลงบัญชี']) {
    assert.ok(page.includes(label), 'ไม่มีปุ่ม ' + label);
  }
  assert.match(page, /function statusPanel\(job\)/);
  assert.match(page, /'\/jobs\/' \+ job\.id \+ '\/status'/, 'ปุ่มไม่ได้ยิงไปที่ปลายทางจริง');

  // กติกาอ่านสถานะต้องตรงกับ src/utils/jobState.js ไม่งั้นหน้าจอกับฐานข้อมูลจะ
  // บอกคนละอย่างบนงานเดียวกัน แล้วปุ่มจะเด้งกลับที่เดิมทุกครั้งที่กด
  const fn = page.slice(page.indexOf('function jobStatusOf'), page.indexOf('function jobStatusOf') + 700);
  for (const field of ['done_at', 'picked_up_at', 'balance_due', 'booked_at', 'pay_method']) {
    assert.ok(fn.includes(field), 'การอ่านสถานะไม่ได้ดู ' + field);
  }

  // ป้ายสถานะการจ่ายออกจากแถวในคิวแล้ว สองป้ายที่พูดคนละคำบนแถวเดียวทำให้ต้อง
  // หยุดอ่านว่าอันไหนคืออันจริง
  const row = page.slice(page.indexOf('function jobRow'), page.indexOf('function renderJobs'));
  assert.match(row, /el\.querySelector\('\.badge'\)\.remove\(\);/);

  // ยิงพลาดต้องถอยค่ากลับ ไม่ใช่ทิ้งหน้าจอไว้คนละเรื่องกับฐานข้อมูล
  const bar = page.slice(page.indexOf('function statusPanel'), page.indexOf('function renderQueue'));
  assert.match(bar, /const before = \{/);
  assert.match(bar, /Object\.assign\(job, before\)/, 'ยิงพลาดแล้วไม่ถอยค่ากลับ');

  // ปุ่มสี่ขั้นเดิมและสามปุ่มเก่าไม่มีใครเรียกแล้ว ต้องไม่เหลือโค้ดตายไว้ให้เข้าใจผิด
  assert.ok(!page.includes('function stageBar'));
  assert.ok(!page.includes('function stateBar'));
  assert.ok(!page.includes('jobStateOf'));
  assert.ok(!page.includes('jobStageOf'));
});
