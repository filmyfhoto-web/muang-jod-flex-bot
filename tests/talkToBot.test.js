import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isJobEntry, QUIT_WORDS } from '../src/handlers/messageHandler.js';

const handler = readFileSync(new URL('../src/handlers/messageHandler.js', import.meta.url), 'utf8');

// ร้านบอกว่า "คุยกับบอทก็ไม่ได้จ้า" แล้วส่งรูปมา: พิมพ์ถามว่า "เรื่องชือบอทำไง
// ม่วง" แล้วได้ร่างงานชื่อ "เรื่องชือบอ ไง ม่วง" ยอด ฿0 กลับมา
//
// ต้นเหตุ: ระหว่างรอ/ยืนยันงาน ทุกข้อความถูกอ่านเป็นงานใหม่หมด และร่างที่เพิ่ง
// เกิดก็ค้างสถานะไว้ต่อ — พิมพ์อะไรไปก็ได้ร่าง ฿0 ใหม่ วนอยู่อย่างนั้นจนกว่าจะ
// กด ✅ หรือ ❌ ซึ่งการ์ดอาจเลื่อนพ้นจอไปแล้ว

test('a sentence with no number in it is talking, not jotting', () => {
  assert.equal(isJobEntry('เรื่องชือบอทำไง ม่วง'), false);
  assert.equal(isJobEntry('ม่วงทำอะไรได้บ้าง'), false);
  assert.equal(isJobEntry('สวัสดีจ้า'), false);
  assert.equal(isJobEntry(''), false);
  assert.equal(isJobEntry(undefined), false);
});

test('a job is still a job, priced or not', () => {
  assert.equal(isJobEntry('ป้ายไวนิล 60x100 150 บาท'), true);
  // ใบสั่งงานที่ถ่ายมามักไม่มีราคา ขนาดอย่างเดียวก็ยังเป็นงาน
  assert.equal(isJobEntry('ไวนิล 160x300'), true);
  assert.equal(isJobEntry('สแตนตี้ 2 ตัว'), true);
  // เลขไทยก็นับ
  assert.equal(isJobEntry('ป้ายไวนิล ๒ ผืน'), true);
});

test('"ยกเลิก" typed out is a way back, because the card scrolls away', () => {
  for (const word of ['ยกเลิก', 'ยกเลิกค่ะ', 'ไม่เอา', 'ไม่เอาแล้ว', 'พอแล้วจ้า', 'หยุด']) {
    assert.ok(QUIT_WORDS.test(word), `"${word}" ไม่ได้พาออกจากโหมดจดงาน`);
  }
  // แต่ต้องไม่ไปกลืนงานที่ขึ้นต้นคล้าย ๆ กัน
  assert.equal(QUIT_WORDS.test('ยกเลิกงาน ป้ายไวนิล 500'), false);
  assert.equal(QUIT_WORDS.test('ป้ายไวนิล'), false);
});

test('a message that is not a job leaves the draft alone and says so', () => {
  const block = handler.slice(
    handler.indexOf('if (current === STATES.WAITING_FOR_JOB || current === STATES.CONFIRMING_JOB) {'),
    handler.indexOf('if (current === STATES.WAITING_FOR_EDIT)')
  );
  assert.match(block, /if \(isJobEntry\(text\)\)/, 'every message is still read as a job');
  assert.match(block, /QUIT_WORDS\.test/, 'no typed way out of the draft');
  assert.match(block, /clearState\(profile\.id\)/, '"ยกเลิก" does not actually clear the draft');
  // ตอบกลับ ไม่ใช่เงียบ และไม่ใช่สร้างร่างใหม่
  assert.match(block, /DRAFT_WAITING_REPLY/, 'the shop is left guessing why nothing happened');
  // ร่างบนจอ กับ "รอให้พิมพ์งาน" เป็นคนละเรื่อง ข้อความต้องตรงกับที่เห็นอยู่
  assert.match(block, /hasDraft \? DRAFT_WAITING_REPLY : WAITING_JOB_REPLY/, 'both states are told the same thing');
  assert.ok(
    block.indexOf('handleNewJob') < block.indexOf('DRAFT_WAITING_REPLY'),
    'a job entry must still reach the draft first'
  );
});
