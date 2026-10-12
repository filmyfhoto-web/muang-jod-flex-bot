import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { startCollecting, turnUnderstands } from '../src/utils/slots.js';
import { collectEscape, isWholeNewJob } from '../src/handlers/messageHandler.js';

/* หนีจากวงถามเมื่อข้อความคืองานใหม่ ไม่ใช่คำตอบ
 *
 * เคสจริง: คำถาม "ขนาดเท่าไหร่คะ?" ค้างอยู่ ร้านพิมพ์ "งานพิมพ์การ์ด" แล้ว
 * "งานพิมพ์" — ของเดิมตอบ "ยังไม่เข้าใจ" ซ้ำสองรอบ ต้องเปลี่ยนเป็นพับชุดคำถาม
 * เดิมแล้วพาไปจดงานใหม่ โดยที่ "คำตอบจริง" ของคำถามเดิมยังต้องชนะเสมอ
 */

const frameAsking = (asking = 'size') => ({ ...startCollecting('มีงานกรอบรูป'), asking });

test('turnUnderstands: คำตอบ/คำสั่ง/คำข้าม อ่านออก — ชื่องานลอย ๆ อ่านไม่ออก', () => {
  const s = frameAsking('size');
  for (const answer of ['12x18 นิ้ว', '12 × 18', 'คุณแอน', 'ลูกค้าคุณแอน', 'ข้าม', 'ยกเลิก', 'ย้อนกลับ', 'เปลี่ยนเป็น 3 กรอบ']) {
    assert.equal(turnUnderstands(s, answer), true, `"${answer}" ควรอ่านออก`);
  }
  assert.equal(turnUnderstands({ ...s, asking: 'unitPrice' }, '600'), true, 'เลขตอนถามราคา = คำตอบ');
  assert.equal(turnUnderstands({ ...s, asking: 'due' }, 'พรุ่งนี้'), true, 'วันตอนถามวันนัด = คำตอบ');
  for (const notAnswer of ['งานพิมพ์การ์ด', 'งานพิมพ์', 'งานป้าย', 'สวัสดีจ้า']) {
    assert.equal(turnUnderstands(s, notAnswer), false, `"${notAnswer}" ไม่ใช่คำตอบ`);
  }
});

test('collectEscape: ชื่อชนิดงาน → สลับชุดคำถาม · งานทั้งบรรทัด → จดงานใหม่', () => {
  const s = frameAsking('size');

  const card = collectEscape(s, 'งานพิมพ์การ์ด');
  assert.equal(card?.kind, 'switch');
  assert.equal(card.collecting.workType, 'copy');

  assert.equal(collectEscape(s, 'การ์ดแต่งงาน')?.kind, 'switch');
  assert.equal(collectEscape(s, 'งานป้ายไวนิล')?.kind, 'switch');

  // ของมีชื่อ+ราคาแต่เลขไม่เข้าช่องไหนของชุดคำถามเดิม → จดเป็นงานใหม่
  assert.equal(collectEscape(s, 'นามบัตร 500')?.kind, 'job');
  // ใบงานเต็ม ๆ ("2 อัน" เข้าช่องจำนวนได้) ถูกดักที่ isWholeNewJob ก่อนถึงตัวหนี
  // ในสาขาจริงของ messageHandler — เส้นนั้นคือ handleNewJob เหมือนเดิม
  assert.equal(isWholeNewJob('ตรายาง 2 อัน อันละ 250'), true);
});

test('collectEscape: คำตอบไม่มีวันหนี — เลขลอย ๆ ก็ไม่ใช่งานใหม่', () => {
  const s = frameAsking('size');
  for (const answer of ['12x18', '12 × 18 นิ้ว', 'คุณแอน', 'ข้าม', 'ยกเลิก']) {
    assert.equal(collectEscape(s, answer), null, `"${answer}" ต้องอยู่ในวงถามต่อ`);
  }
  // "600" ตอนถูกถามขนาด: looksLikeJob มองเป็นงานได้ แต่ไม่มีของให้จัดหมวด —
  // ต้องไม่หนีไปล้างชุดคำถาม (วงถามจะถามย้ำพร้อมปุ่มช่วยเอง)
  assert.equal(collectEscape(s, '600'), null);
  assert.equal(collectEscape(null, 'งานพิมพ์การ์ด'), null, 'ไม่มีชุดคำถามก็ไม่มีอะไรให้หนี');
});

test('สาขา COLLECTING เรียงลำดับถูก: งานทั้งใบ → ตัวหนี → ค่อยอ่านเป็นคำตอบ', () => {
  const src = readFileSync(new URL('../src/handlers/messageHandler.js', import.meta.url), 'utf8');
  const from = src.indexOf('STATES.COLLECTING_JOB');
  const block = src.slice(from, src.indexOf('WAITING_FOR_EDIT', from));
  assert.ok(block.indexOf('isWholeNewJob(text)') > -1);
  assert.ok(block.indexOf('isWholeNewJob(text)') < block.indexOf('collectEscape'));
  assert.ok(block.indexOf('collectEscape') < block.indexOf('handleCollectTurn'));
  assert.match(block, /พับคำถาม/, 'สลับงานต้องบอกว่าพับชุดคำถามเดิมไว้');

  // ตัวหนีต้องเช็กว่า "อ่านออกไหม" ก่อนเสมอ — คำตอบชนะทุกอย่าง
  const fn = src.slice(src.indexOf('export function collectEscape'), src.indexOf('async function handleDump'));
  assert.ok(fn.indexOf('turnUnderstands') < fn.indexOf('looksLikeJob'));
});
