import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildTaxonomy } from '../src/utils/taxonomy.js';
import { looksLikeWorkDetail, parseNaturalJob } from '../src/utils/nlParser.js';
import { startCollecting, readTurn, itemLabel } from '../src/utils/slots.js';
import { resolveMenuCommand } from '../src/utils/menuCommands.js';

/* ม่วงต้องรู้จักคำของร้านเอง — สองเคสจริงจากวันเดียวกัน:
 *
 *   1. ร้านสร้างประเภท "กรอบรูปงานสีดำ" แล้วพิมพ์ชื่อนั้นตรง ๆ กลับตกไป
 *      กรอบรูปธรรมดา เพราะชื่อที่ร้านตั้งไม่เคยเป็นคำค้น
 *   2. ม่วงถาม "ของลูกค้าท่านไหนคะ?" ร้านตอบ "หน้างานสีดำ" (รายละเอียดกรอบ)
 *      การ์ดเลยขึ้น ลูกค้า: หน้างานสีดำ — ศัพท์ช่างต้องไปอยู่รายละเอียดงาน
 */

const SHOP_CONFIG = {
  v: 1,
  groups: [
    { id: 'print' },
    { id: 'sign', types: [{ id: 't_68f18a', icon: '🔹', label: 'ฟิวเจอร์บอร์ดสติ๊กเกอร์', custom: true }] },
    { id: 'stamp' },
    { id: 'sticker', types: [{ id: 'sticker', label: 'สติ๊กเกอร์งานสีดำ' }] },
    { id: 'photo', icon: '🧵', types: [{ id: 't_f1c063', icon: '📦', label: 'กรอบรูปงานสีดำ', custom: true }] },
    { id: 'design' },
    { id: 'shipping', hidden: true },
  ],
};

test('ชื่อประเภทที่ร้านตั้งเป็นคำค้นอันดับแรก — พิมพ์ชื่อเต็มเข้าประเภทตัวเองเสมอ', () => {
  const tax = buildTaxonomy(SHOP_CONFIG);

  assert.equal(tax.classifyItem('กรอบรูปงานสีดำ')?.type?.id, 't_f1c063');
  assert.equal(tax.classifyItem('กรอบรูปงานสีดำ 2 บาน')?.type?.id, 't_f1c063');
  assert.equal(tax.classifyItem('ฟิวเจอร์บอร์ดสติ๊กเกอร์ 60x80')?.type?.id, 't_68f18a', 'custom ใต้หมวดป้ายต้องชนะสติ๊กเกอร์');
  // ชื่อที่ร้าน "เปลี่ยน" ให้ประเภทเดิม ก็พิมพ์ตามชื่อใหม่ได้
  assert.equal(tax.classifyItem('สติ๊กเกอร์งานสีดำ 20 ดวง')?.type?.id, 'sticker');

  // ของระบบเดิมห้ามเพี้ยน — คำค้นฐานยังทำงานทุกตัว (#180/#182 ยังศักดิ์สิทธิ์)
  assert.equal(tax.classifyItem('กรอบรูป 12x18')?.type?.id, 'frame');
  assert.equal(tax.classifyItem('การ์ดแต่งงาน')?.type?.id, 'print');
  assert.equal(tax.classifyItem('ปริ้นโฟมบอร์ด 60x160')?.type?.id, 'foamboard');
});

test('looksLikeWorkDetail: ศัพท์ช่างใช่ · ชื่อคน/หน่วยงานไม่ใช่', () => {
  for (const detail of ['หน้างานสีดำ', 'ขอบขาว', 'เคลือบด้าน', 'พื้นหลังสีขาว', 'แบบด่วน', 'ลายไทย', 'สีแดงทั้งแผ่น', 'ป้ายไวนิล']) {
    assert.equal(looksLikeWorkDetail(detail), true, `"${detail}" ควรเป็นรายละเอียดงาน`);
  }
  for (const name of ['ครูแอน', 'รร.สบกอน', 'ร้านป้ายเจริญ', 'คุณสมศรี', 'อบต.เชียงกลาง', 'สีดา', 'หน่อย', 'ป้าแดง']) {
    assert.equal(looksLikeWorkDetail(name), false, `"${name}" คือชื่อคน ห้ามโดนกัน`);
  }
});

test('"หน้างาน" ไม่ถูกตัดกลางคำอีกแล้ว — รายละเอียดแสดงตามเนื้อหาที่ร้านพิมพ์', () => {
  const parsed = parseNaturalJob('กรอบรูป 12x18 นิ้ว หน้างานสีดำ 600');
  assert.equal(parsed.customerName, null, 'รายละเอียดต้องไม่กลายเป็นลูกค้า');
  assert.equal(parsed.items.length, 1);
  assert.match(parsed.items[0].size || '', /หน้างานสีดำ/, `ได้ "${parsed.items[0].size}" — คำของร้านต้องอยู่ครบคำ`);
  assert.doesNotMatch(parsed.items[0].size || '', /หน้า สีดำ/, 'ยังโดนตัดกลางคำอยู่');
});

test('ตอบศัพท์ช่างตอนถูกถามชื่อ → จดเป็นรายละเอียด ไม่ใช่ลูกค้า (พิมพ์ "ลูกค้า …" ค่อยเป็นชื่อ)', () => {
  const asking = { ...startCollecting('มีงานกรอบรูป'), asking: 'customer' };

  const turn = readTurn(asking, 'หน้างานสีดำ');
  assert.equal(turn.state.fields.customer, undefined, 'ห้ามลงช่องลูกค้า');
  assert.deepEqual(turn.filled, ['detail'], 'ต้องจดลงช่องรายละเอียด (นับเป็นเข้าใจ ไม่ใช่ miss)');
  assert.equal(turn.state.fields.detail, 'หน้างานสีดำ');
  assert.match(itemLabel(turn.state), /หน้างานสีดำ/, 'รายละเอียดต้องตามไปอยู่ในชื่อรายการ');

  // ทางหนีชัดเจน: ร้านยืนยันว่าเป็นชื่อจริง
  const forced = readTurn(asking, 'ลูกค้า หน้างานสีดำ');
  assert.equal(forced.state.fields.customer, 'หน้างานสีดำ');

  // คำตอบชื่อปกติยังเหมือนเดิมทุกอย่าง
  const normal = readTurn(asking, 'คุณแอน');
  assert.equal(normal.state.fields.customer, 'คุณแอน');
});

test('สาขาร่างรอชื่อ (CONFIRMING_JOB) มีตัวกันเดียวกัน และบอกทางหนีในข้อความ', () => {
  const src = readFileSync(new URL('../src/handlers/messageHandler.js', import.meta.url), 'utf8');
  const from = src.indexOf('parseCustomerName(text)');
  const block = src.slice(from, from + 2200);
  assert.match(block, /looksLikeWorkDetail\(typed, profile\.id\)/);
  assert.match(block, /ดูเป็นรายละเอียดงาน/);
  assert.match(block, /พิมพ์ "ลูกค้า \$\{typed\}"/, 'ไม่ได้บอกทางหนี');
  // ต่อท้าย size ของรายการแรก — รายละเอียดไปอยู่กับของ ไม่หายเงียบ
  assert.match(block, /\[items\[0\]\.size, typed\]\.filter\(Boolean\)\.join\(' · '\)/);
});

test('คำสั่งย้ายหมวดเข้าใจได้จากที่ร้านพิมพ์', () => {
  for (const word of ['ย้ายหมวด', 'ย้ายงาน', 'ย้ายหมวดงาน', 'ขอย้ายหมวดหน่อย']) {
    assert.equal(resolveMenuCommand(word), 'move_category', word);
  }
  // ของเดิมไม่ขยับ: "เปลี่ยนหมวด" ยังหมายถึงใบล่าสุด
  assert.equal(resolveMenuCommand('เปลี่ยนหมวด'), 'pick_category');
});
