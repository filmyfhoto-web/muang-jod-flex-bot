import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { startCollecting, readTurn, acknowledgeFilled, nextSlot } from '../src/utils/slots.js';

/* ตอบข้ามช่องไม่ใช่ความผิด — บอกชื่อลูกค้าตอนถูกถามขนาด ม่วงจดให้จริงอยู่แล้ว
 * แต่ของเดิมกลับตอบว่า "ยังไม่เข้าใจ" เพราะนับเฉพาะช่องที่ "แก้" ไม่นับช่องที่
 * "เพิ่งกรอกครั้งแรก"
 */

test('บอกชื่อลูกค้าตอนถูกถามขนาด → จดลง customer และยังถามขนาดต่อ', () => {
  const s = { ...startCollecting('มีงานกรอบรูป'), asking: 'size' };
  const turn = readTurn(s, 'ลูกค้าคุณแอน');
  assert.deepEqual(turn.filled, ['customer']);
  assert.deepEqual(turn.changed, []);
  assert.equal(turn.state.fields.customer, 'คุณแอน');
  assert.equal(nextSlot(turn.state), 'size', 'คำถามเดิมยังรอคำตอบอยู่');
});

test('acknowledgeFilled บอกว่าจดอะไรไว้ให้ — ของว่างคืน null', () => {
  const s = { ...startCollecting('มีงานกรอบรูป'), asking: 'size' };
  const turn = readTurn(s, 'ลูกค้าคุณแอน');
  const said = acknowledgeFilled(turn.state, turn.filled);
  assert.ok(said.includes('ชื่อลูกค้า'), said);
  assert.ok(said.includes('คุณแอน'), said);
  assert.ok(said.startsWith('จด'), 'คนละคำกับ "แก้…" ของ acknowledge');
  assert.equal(acknowledgeFilled(turn.state, []), null);
});

test('collectFlow นับช่องที่เพิ่งกรอกเป็น "เข้าใจ" ด้วย', () => {
  const flow = readFileSync(new URL('../src/services/collectFlow.js', import.meta.url), 'utf8');
  assert.match(flow, /applied\.filled\?\.length \|\| applied\.changed\?\.length/);
  assert.match(flow, /acknowledgeFilled/);
  // คำสั่งคำตอบ ('ไม่แนบรูป') ก็นับเป็นการกรอก ไม่ใช่ความไม่เข้าใจ
  assert.match(flow, /filled: \[command\.field\]/);
});
