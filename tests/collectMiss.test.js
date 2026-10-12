import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { startCollecting, readTurn, parseCollectCommand } from '../src/utils/slots.js';

/* "ยังไม่เข้าใจ" ห้ามวนซ้ำ — เคสจริงร้านเจอข้อความเดิมเป๊ะสองรอบติดจนคิดว่าบอทพัง
 *
 * ครั้งแรก: ถามย้ำพร้อมปุ่มทางออก (ข้าม/ย้อนกลับ/ยกเลิก) — คำช่วยที่จมในข้อความ
 * ยาวร้านไม่เห็น ครั้งที่สองติดกัน: พับชุดคำถาม ปล่อยร้านเป็นอิสระ
 */

const flow = readFileSync(new URL('../src/services/collectFlow.js', import.meta.url), 'utf8');
const handler = readFileSync(new URL('../src/handlers/messageHandler.js', import.meta.url), 'utf8');

test('ปุ่มทางออกทุกคำโยงกับตัวอ่านจริง — กดแล้วไม่มีทางกลายเป็นพลาดซ้ำ', () => {
  assert.equal(parseCollectCommand('ยกเลิก')?.kind, 'cancel');
  assert.equal(parseCollectCommand('ย้อนกลับ')?.kind, 'back');
  // "ข้าม" เป็นคำข้ามใน readTurn — ช่องที่ถามอยู่ถูกบันทึกว่าข้ามแล้ว
  const s = { ...startCollecting('มีงานกรอบรูป'), asking: 'size' };
  const turn = readTurn(s, 'ข้าม');
  assert.ok(turn.state.skipped.includes('size'));
});

test('collectFlow: มีตัวนับพลาด ครั้งแรกมีปุ่ม ครั้งที่สองพับชุดคำถาม', () => {
  assert.match(flow, /collect\.misses \|\| 0/, 'ไม่มีตัวนับพลาด');
  assert.match(flow, /misses >= 2/, 'ไม่มีเพดานพลาดสองครั้ง');
  assert.match(flow, /misses >= 2[\s\S]{0,200}clearState\(profile\.id\)/, 'พลาดครบแล้วต้องปล่อยร้านเป็นอิสระ');
  assert.match(flow, /ม่วงพับชุดคำถามไว้ก่อนนะคะ/, 'ไม่มีข้อความบอกว่าพับให้แล้ว');
  assert.match(flow, /missButtons/, 'ครั้งแรกไม่มีปุ่มช่วย');
  // understood รีเซ็ตตัวนับ — พลาดแบบไม่ติดกันไม่โดนพับ
  assert.match(flow, /understood \? 0 :/);
  // ปุ่มประกอบจาก ข้าม / ย้อนกลับ(เมื่อมีข้อก่อนหน้า) / ยกเลิก
  const buttons = flow.slice(flow.indexOf('function missButtons'), flow.indexOf('export async function startCollectFlow'));
  for (const label of ["'ข้าม'", "'ย้อนกลับ'", "'ยกเลิก'"]) assert.ok(buttons.includes(label), label);
  assert.match(buttons, /previousSlot\(collect\)/, '"ย้อนกลับ" ต้องโผล่เฉพาะตอนมีข้อก่อนหน้า');
});

test('"ย้อนกลับ" ตอนยังอยู่ข้อแรก ไม่ใช่เรื่องไม่เข้าใจ — บอกตรง ๆ แล้วถามต่อ', () => {
  assert.match(flow, /ยังเป็นข้อแรกอยู่ค่ะ/);
  const back = flow.indexOf("command?.kind === 'back' && !target");
  assert.ok(back > -1 && back < flow.indexOf('if (target) {'), 'ต้องดักก่อนเส้นลืมค่า');
});

test('โหมดรอจดงาน (ปุ่ม "มีงานให้จด"): ชื่อชนิดงานเริ่มชุดคำถามได้ และไม่ตอบซ้ำรอบที่สาม', () => {
  // เคสจริง: ร้านกดปุ่มแล้วพิมพ์ "การ์ดแต่งงาน" → "พิมพ์การ์ด" → "งานพิมพ์"
  // ได้ "ยังไม่เห็นตัวเลข" เป๊ะ ๆ สามรอบ ทั้งที่ม่วงแนะนำเองว่าพิมพ์ชื่องานมาได้
  const from = handler.indexOf('if (current === STATES.WAITING_FOR_JOB || current === STATES.CONFIRMING_JOB) {');
  const block = handler.slice(from, handler.indexOf('STATES.COLLECTING_JOB', from));
  assert.match(block, /const collecting = startCollecting\(text\)/, 'โหมดรอจดงานไม่ลองอ่านชื่อชนิดงาน');
  assert.ok(block.indexOf('startCollecting') < block.indexOf('WAITING_JOB_REPLY'), 'ต้องลองก่อนตอบไม่เข้าใจ');
  assert.match(block, /misses >= 2/, 'ไม่มีเพดานตอบซ้ำ');
  assert.match(block, /ม่วงขอพักโหมดจดไว้ก่อนนะคะ/);
});
