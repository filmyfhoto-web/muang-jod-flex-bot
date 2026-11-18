import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createMockSupabase } from './helpers/mockSupabase.js';
import {
  saveHandNote,
  listHandNotes,
  deleteHandNote,
  NOTE_NOT_READY,
} from '../src/services/noteService.js';

/* สมุดเขียนมือ — ร้านขอ: "ฉันอยากสร้างสมุดจดแบบเขียนมือด้วยค่ะ ทำให้ได้ไหมคะ"
 * หน้ากระดาษให้เขียนด้วยนิ้ว/ปากกาบนจอ เก็บเป็นรูปทีละหน้าในที่เก็บไฟล์เดียว
 * กับหลักฐานงาน ตาราง hand_notes จดว่าหน้าไหนของใคร อยู่ไฟล์ไหน
 */

// mock ฐานข้อมูล + ที่เก็บไฟล์ปลอมที่จดว่าอัป/ลบไฟล์ไหนไปบ้าง
function fakeClient(db, log = { uploads: [], removed: [] }) {
  return {
    client: {
      from: (t) => db.from(t),
      storage: {
        from: () => ({
          upload: async (path) => {
            log.uploads.push(path);
            return { error: null };
          },
          createSignedUrl: async (path) => ({ data: { signedUrl: 'https://signed/' + path }, error: null }),
          remove: async (paths) => {
            log.removed.push(...paths);
            return { error: null };
          },
        }),
      },
    },
    log,
  };
}

test('เขียนหน้าแรก → เก็บเข้าเล่ม → เปิดเล่มเจอ ลิงก์เซ็นสดจาก path ที่จดไว้', async () => {
  const { client, log } = fakeClient(createMockSupabase());
  const saved = await saveHandNote('u1', { buffer: Buffer.from('png-bytes'), fileType: 'image/png' }, client);

  assert.equal(saved.ok, true);
  // ไฟล์ขึ้นที่เก็บไฟล์ใต้โฟลเดอร์ของร้าน และลิงก์ที่ได้คือลิงก์เซ็นของไฟล์นั้น
  assert.equal(log.uploads.length, 1);
  assert.match(log.uploads[0], /^u1\/notes\/page-[0-9a-f-]+\.png$/);
  assert.equal(saved.note.url, 'https://signed/' + log.uploads[0]);

  const got = await listHandNotes('u1', 60, client);
  assert.equal(got.ok, true);
  assert.equal(got.notes.length, 1);
  assert.equal(got.notes[0].url, 'https://signed/' + log.uploads[0]);
  // ตารางจด path ไม่จดลิงก์ — ลิงก์เซ็นมีวันหมดอายุ (บทเรียน QR ใน 012)
  assert.ok(!('path' in got.notes[0]), 'path เป็นเรื่องภายใน ไม่ส่งออกไปหน้าเว็บ');
});

test('เล่มเป็นของใครของมัน — เปิดเล่มคนอื่นต้องว่าง', async () => {
  const { client } = fakeClient(createMockSupabase());
  await saveHandNote('u1', { buffer: Buffer.from('x'), fileType: 'image/png' }, client);

  const other = await listHandNotes('u2', 60, client);
  assert.equal(other.notes.length, 0);
});

test('หน้าใหม่อยู่หน้าสุดของเล่ม (เรียงใหม่ก่อน)', async () => {
  const { client } = fakeClient(createMockSupabase());
  const first = await saveHandNote('u1', { buffer: Buffer.from('a'), fileType: 'image/png' }, client);
  const second = await saveHandNote('u1', { buffer: Buffer.from('b'), fileType: 'image/png' }, client);

  const got = await listHandNotes('u1', 60, client);
  assert.deepEqual(got.notes.map((n) => n.id), [second.note.id, first.note.id]);
});

test('ฉีกหน้า: แถวหาย ไฟล์ถูกลบตาม — ฉีกของคนอื่นหรือหน้าที่ไม่มีได้ 404', async () => {
  const { client, log } = fakeClient(createMockSupabase());
  const saved = await saveHandNote('u1', { buffer: Buffer.from('x'), fileType: 'image/png' }, client);

  // คนอื่นฉีกไม่ได้ — ไม่เจอหน้าในเล่มของเขา
  const stranger = await deleteHandNote('u2', saved.note.id, client);
  assert.equal(stranger.ok, false);
  assert.equal(stranger.status, 404);

  const torn = await deleteHandNote('u1', saved.note.id, client);
  assert.equal(torn.ok, true);
  assert.deepEqual(log.removed, log.uploads, 'ไฟล์ของหน้าที่ฉีกต้องถูกลบจากที่เก็บไฟล์ด้วย');
  assert.equal((await listHandNotes('u1', 60, client)).notes.length, 0);
});

test('ตารางยังไม่ได้รัน migration 024 — บอกตรง ๆ ทั้งตอนเก็บและตอนเปิดเล่ม', async () => {
  // client ที่ตาราง hand_notes ไม่มีจริง (Postgres ตอบ relation does not exist)
  const err = { message: 'relation "public.hand_notes" does not exist' };
  const q = {
    insert() { return this; },
    select() { return this; },
    eq() { return this; },
    order() { return this; },
    limit() { return this; },
    async single() { return { data: null, error: err }; },
    async maybeSingle() { return { data: null, error: err }; },
    then(resolve) { resolve({ data: null, error: err }); },
  };
  const client = {
    from: () => q,
    storage: { from: () => ({ upload: async () => ({ error: null }) }) },
  };

  const saved = await saveHandNote('u1', { buffer: Buffer.from('x'), fileType: 'image/png' }, client);
  assert.deepEqual([saved.ok, saved.status, saved.message], [false, 503, NOTE_NOT_READY]);

  const listed = await listHandNotes('u1', 60, client);
  assert.deepEqual([listed.ok, listed.status, listed.message], [false, 503, NOTE_NOT_READY]);
});

/* เส้นทาง API — รูปเข้าทางเดียวกับรูปแนบงาน (decodeDataUrl คุมชนิด/ขนาดไฟล์)
 * และคำตอบ "ยังไม่ได้รัน migration" ของ service ต้องไหลออกไปตามรหัสจริง ไม่กลายเป็น 500
 */
test('api มีเส้นทางสมุดครบ: เปิดเล่ม เก็บหน้า ฉีกหน้า', () => {
  const api = readFileSync(new URL('../src/routes/api.js', import.meta.url), 'utf8');
  assert.ok(api.includes("router.get('/notes'"));
  assert.ok(api.includes("router.post('/notes'"));
  assert.ok(api.includes("router.delete('/notes/:id'"));
  const notesPart = api.slice(api.indexOf("router.get('/notes'"));
  assert.ok(notesPart.includes('decodeDataUrl(req.body?.image)'), 'รูปหน้าสมุดต้องผ่านด่านเดียวกับรูปแนบงาน');
  assert.ok(notesPart.includes('res.status(got.status).json'), 'รหัส 503/404 จาก service ต้องส่งต่อตามจริง');
});

/* หน้าเว็บ /app/note/ — กระดาษเขียนด้วยนิ้วจริง ๆ ไม่ใช่ช่องพิมพ์ */
test('หน้าเว็บสมุด: เขียนด้วยนิ้วบน canvas จอไม่เลื่อนตาม เก็บเป็นรูป PNG เข้าเล่ม', () => {
  const html = readFileSync(new URL('../public/liff/note/index.html', import.meta.url), 'utf8');

  // เขียนด้วย pointer events บน canvas — touch-action: none กันจอเลื่อนตอนลากนิ้ว
  assert.ok(html.includes('<canvas id="paper">'));
  assert.match(html, /touch-action: none/);
  assert.match(html, /addEventListener\('pointerdown'/);
  assert.match(html, /addEventListener\('pointermove'/);
  assert.match(html, /setPointerCapture\(e\.pointerId\)/);

  // ความคมบนจอ Retina — วาดที่ devicePixelRatio ไม่ใช่ขนาด CSS
  assert.match(html, /devicePixelRatio/);

  // เก็บเข้าเล่ม = PNG ไป POST /notes · เปิดเล่ม GET /notes · ฉีกหน้า DELETE พร้อมถามก่อน
  assert.match(html, /toDataURL\('image\/png'\)/);
  assert.match(html, /api\('\/notes', \{ method: 'POST'/);
  assert.match(html, /api\('\/notes'\)/);
  assert.match(html, /api\('\/notes\/' \+ viewing\.id, \{ method: 'DELETE' \}\)/);
  assert.match(html, /confirm\('ฉีกหน้านี้ออกจากเล่มเลยนะคะ/);

  // ย้อนได้ทีละเส้น ล้างทั้งหน้าต้องถามก่อน หน้าเปล่าไม่ให้เก็บ
  assert.match(html, /strokes\.pop\(\); repaint\(\);/);
  assert.match(html, /confirm\('ล้างหน้ากระดาษนี้ทิ้งเลยนะคะ\?'\)/);
  assert.match(html, /ยังไม่ได้เขียนอะไรเลยค่ะ/);

  // กระดาษสูงพอดีหน้าต่าง (ร้านชอบ "พอดีกับหน้าต่าง") และคอลัมน์มือถือกลางจอ
  assert.match(html, /window\.innerHeight - top - toolsH/);
  assert.match(html, /max-width: 430px/);
  assert.match(html, /addEventListener\('resize', fitPaper\)/);
});

test('หน้าแรกมีปุ่มเข้า สมุดเขียนมือ', () => {
  const dash = readFileSync(new URL('../public/liff/index.html', import.meta.url), 'utf8');
  assert.ok(dash.includes('<a href="/app/note/">📒 สมุดเขียนมือ</a>'));
});
