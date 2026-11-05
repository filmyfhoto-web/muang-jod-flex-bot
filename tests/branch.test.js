import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_BRANCHES,
  branchKeys,
  matchBranch,
  matchesAll,
  stripBranch,
  groupByBranch,
} from '../src/utils/branch.js';

const BRANCHES = DEFAULT_BRANCHES.map((b, i) => ({ ...b, id: `b${i + 1}` }));
const PRINT = BRANCHES[0];
const KLANG = BRANCHES[1];

test('ร้านตั้งต้นเป็นสองร้านที่เจ้าของบอกไว้ ตามลำดับนั้น', () => {
  assert.deepEqual(
    DEFAULT_BRANCHES.map((b) => b.name),
    ['นัฐภรณ์ ปริ้นงาน', 'นัฐภรณ์ เชียงกลาง'],
  );
});

/* นี่คือข้อที่พลาดแล้วเสียหายที่สุดของงานนี้
 *
 * ชื่อสองร้านขึ้นต้นด้วย "นัฐภรณ์" เหมือนกัน ถ้าจับคำนั้นแล้วตอบร้านแรก งาน
 * ครึ่งหนึ่งจะลงผิดร้านโดยไม่มีใครรู้จนกว่าจะปิดบัญชีแล้วยอดไม่ตรง
 */
test('คำที่ทั้งสองร้านมีเหมือนกัน ไม่ชี้ร้านไหนเลย', () => {
  assert.ok(!branchKeys(PRINT, BRANCHES).includes('นัฐภรณ์'), '"นัฐภรณ์" ไม่ควรชี้ร้านใดร้านหนึ่ง');
  assert.equal(matchBranch('นัฐภรณ์', BRANCHES), null);
  assert.equal(matchBranch('ดูงานนัฐภรณ์', BRANCHES), null);
});

test('คำที่ชี้ร้านเดียว จับได้ทั้งแบบเต็มและแบบสั้น', () => {
  for (const text of ['นัฐภรณ์ ปริ้นงาน', 'ดูงานนัฐภรณ์ ปริ้นงาน', 'ปริ้นงาน', 'ร้านปริ้น']) {
    assert.equal(matchBranch(text, BRANCHES)?.slug, 'print', text);
  }
  for (const text of ['นัฐภรณ์ เชียงกลาง', 'ดูงานนัฐภรณ์ เชียงกลาง', 'เชียงกลาง', 'ร้านเชียงกลาง']) {
    assert.equal(matchBranch(text, BRANCHES)?.slug, 'chiangklang', text);
  }
});

test('สะกดคนละแบบก็ยังเป็นร้านเดียวกัน', () => {
  // ร้านพิมพ์เองทุกแบบ ถ้าไม่รับไว้ ม่วงจะถามซ้ำทั้งที่บอกไปแล้ว
  for (const text of ['ปริ้นท์', 'ปริ้นต์', 'ปริ๊น', 'พริ้นท์', 'print']) {
    assert.equal(matchBranch(text, BRANCHES)?.slug, 'print', text);
  }
});

test('เว้นวรรคตามใจคนพิมพ์ ก็ยังจับได้', () => {
  assert.equal(matchBranch('นัฐภรณ์   ปริ้นงาน', BRANCHES)?.slug, 'print');
  assert.equal(matchBranch('นัฐภรณ์เชียงกลาง', BRANCHES)?.slug, 'chiangklang');
});

test('ประโยคที่พูดถึงทั้งสองร้าน ไม่ถูกตัดสินให้ร้านใดร้านหนึ่ง', () => {
  // "ดูงานปริ้นงานกับเชียงกลาง" ไม่ใช่คำสั่งลงร้าน มันคือคำสั่งดูทั้งสองร้าน
  assert.equal(matchBranch('ดูงานปริ้นงานกับเชียงกลาง', BRANCHES), null);
  assert.ok(matchesAll('ดูงานปริ้นงานกับเชียงกลาง', BRANCHES));
  assert.ok(matchesAll('ดูงานทั้งสองร้าน', BRANCHES));
  assert.ok(!matchesAll('ดูงานปริ้นงาน', BRANCHES));
});

test('ข้อความที่ไม่เกี่ยวกับร้านไหนเลย ได้ null', () => {
  assert.equal(matchBranch('ป้ายไวนิล 60x100 150 บาท', BRANCHES), null);
  assert.equal(matchBranch('', BRANCHES), null);
  assert.equal(matchBranch(null, BRANCHES), null);
});

/* ชื่อร้านต้องออกจากข้อความก่อนส่งให้ตัวอ่านงาน
 *
 * ไม่งั้น "นัฐภรณ์ ปริ้นงาน" จะถูกอ่านเป็นชื่อลูกค้า แล้วใบเสร็จจะออกในนาม
 * ร้านตัวเอง
 */
test('ตัดชื่อร้านออกแล้วเหลือแต่เนื้องาน', () => {
  assert.equal(
    stripBranch('นัฐภรณ์ ปริ้นงาน ป้ายไวนิล 60x100 150 บาท', PRINT, BRANCHES),
    'ป้ายไวนิล 60x100 150 บาท',
  );
  assert.equal(stripBranch('ร้านเชียงกลาง ตรายาง 2 อัน', KLANG, BRANCHES), 'ตรายาง 2 อัน');
  // ไม่มีร้าน = ไม่ตัดอะไร
  assert.equal(stripBranch('ป้ายไวนิล 150', null, BRANCHES), 'ป้ายไวนิล 150');
});

test('งานที่ยังไม่ระบุร้าน ไม่ถูกยัดเข้าร้านใดร้านหนึ่ง', () => {
  const jobs = [
    { id: 1, branch_id: 'b1' },
    { id: 2, branch_id: 'b2' },
    { id: 3, branch_id: null },
    { id: 4 },
    // ร้านที่ถูกลบไปแล้ว — id ค้างอยู่แต่ไม่มีร้านนั้นจริง
    { id: 5, branch_id: 'gone' },
  ];
  const { groups, unassigned } = groupByBranch(jobs, BRANCHES);

  assert.deepEqual(groups.map((g) => g.branch.slug), ['print', 'chiangklang']);
  assert.deepEqual(groups[0].jobs.map((j) => j.id), [1]);
  assert.deepEqual(groups[1].jobs.map((j) => j.id), [2]);
  assert.deepEqual(unassigned.map((j) => j.id), [3, 4, 5]);
});

test('มีร้านเดียว คำว่า "นัฐภรณ์" ก็ชี้ร้านนั้นได้', () => {
  // ความกำกวมมาจากการมีสองร้านที่ชื่อชนกัน ไม่ใช่จากตัวคำ
  const one = [PRINT];
  assert.equal(matchBranch('นัฐภรณ์', one)?.slug, 'print');
});
