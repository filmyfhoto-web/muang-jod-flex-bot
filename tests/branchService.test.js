import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMockSupabase } from './helpers/mockSupabase.js';
import { listBranches, pickBranch, resolveBranch, setJobBranch } from '../src/services/branchService.js';

const USER = 'user-1';
const OTHER = 'user-2';

test('เปิดครั้งแรก ได้ร้านตั้งต้นสองร้านมาเลย ไม่ต้องตั้งเอง', async () => {
  const db = createMockSupabase();
  const branches = await listBranches(USER, db);

  assert.deepEqual(branches.map((b) => b.name), ['นัฐภรณ์ ปริ้นงาน', 'นัฐภรณ์ เชียงกลาง']);
  assert.deepEqual(branches.map((b) => b.slug), ['print', 'chiangklang']);
});

test('เปิดซ้ำไม่สร้างร้านเพิ่ม', async () => {
  const db = createMockSupabase();
  await listBranches(USER, db);
  const again = await listBranches(USER, db);
  assert.equal(again.length, 2);
});

test('ร้านของคนละบัญชีไม่ปนกัน', async () => {
  const db = createMockSupabase();
  const mine = await listBranches(USER, db);
  const theirs = await listBranches(OTHER, db);

  assert.equal(mine.length, 2);
  assert.equal(theirs.length, 2);
  // ชื่อเหมือนกันได้ แต่ต้องคนละแถว
  for (const b of theirs) assert.ok(!mine.some((m) => m.id === b.id), 'ร้านถูกใช้ร่วมกันข้ามบัญชี');
});

test('หาร้านได้ทั้งจาก id, slug และชื่อที่พิมพ์มา', async () => {
  const db = createMockSupabase();
  const [print] = await listBranches(USER, db);

  assert.equal((await resolveBranch(USER, print.id, db))?.slug, 'print');
  assert.equal((await resolveBranch(USER, 'chiangklang', db))?.slug, 'chiangklang');
  assert.equal((await resolveBranch(USER, 'ดูงานเชียงกลาง', db))?.slug, 'chiangklang');
  // กำกวม = ไม่เดา
  assert.equal(await resolveBranch(USER, 'นัฐภรณ์', db), null);
  assert.equal(await resolveBranch(USER, '', db), null);
});

test('pickBranch ไม่แตะฐานข้อมูล แต่ให้ผลเหมือนกัน', async () => {
  const db = createMockSupabase();
  const branches = await listBranches(USER, db);
  assert.equal(pickBranch(branches, 'ปริ้นงาน')?.slug, 'print');
  assert.equal(pickBranch(branches, branches[1].id)?.slug, 'chiangklang');
  assert.equal(pickBranch(branches, 'ไม่มีร้านนี้'), null);
});

test('ย้ายงานเข้าร้าน และย้ายกลับเป็นยังไม่ระบุได้', async () => {
  const db = createMockSupabase();
  const [print] = await listBranches(USER, db);
  const { data: job } = await db.from('jobs').insert({ user_id: USER, job_name: 'ป้าย' }).select('*').single();

  const moved = await setJobBranch(USER, job.id, print.id, db);
  assert.equal(moved.branch_id, print.id);

  const cleared = await setJobBranch(USER, job.id, null, db);
  assert.equal(cleared.branch_id, null);
});

/* id ของร้านมาจากปุ่มบนการ์ด ซึ่งถูกส่งต่อให้คนอื่นได้ ถ้าไม่ตรวจว่าร้านนั้น
 * เป็นของบัญชีเดียวกัน ปุ่มที่ถูกส่งต่อจะย้ายงานข้ามบัญชีได้
 */
test('ย้ายงานเข้าร้านของบัญชีอื่นไม่ได้', async () => {
  const db = createMockSupabase();
  await listBranches(USER, db);
  const [theirBranch] = await listBranches(OTHER, db);
  const { data: job } = await db.from('jobs').insert({ user_id: USER, job_name: 'ป้าย' }).select('*').single();

  assert.equal(await setJobBranch(USER, job.id, theirBranch.id, db), null);

  const { data: after } = await db.from('jobs').select('*').eq('id', job.id).maybeSingle();
  assert.ok(!after.branch_id, 'งานถูกย้ายข้ามบัญชีไปแล้ว');
});

test('งานของคนอื่น ย้ายไม่ได้แม้รู้ id', async () => {
  const db = createMockSupabase();
  const [mine] = await listBranches(USER, db);
  const { data: theirJob } = await db.from('jobs').insert({ user_id: OTHER, job_name: 'ป้าย' }).select('*').single();

  assert.equal(await setJobBranch(USER, theirJob.id, mine.id, db), null);
});

/* ฐานข้อมูลที่ยังไม่ได้รันไมเกรชัน 016 ต้องไม่ทำให้บอททั้งตัวล่ม — ช่วงระหว่าง
 * deploy โค้ดใหม่กับรันไมเกรชันเป็นช่วงที่ร้านยังใช้งานอยู่
 */
test('ยังไม่ได้รันไมเกรชัน บอทยังทำงานต่อได้แบบไม่มีร้าน', async () => {
  const broken = {
    from: () => ({
      select: () => ({ eq: async () => ({ data: null, error: { message: 'relation "branches" does not exist' } }) }),
    }),
  };
  assert.deepEqual(await listBranches(USER, broken), []);
});
