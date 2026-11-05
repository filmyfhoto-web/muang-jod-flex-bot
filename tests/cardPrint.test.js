import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyItem } from '../src/utils/category.js';
import { startCollecting, nextQuestion } from '../src/utils/slots.js';
import { isWholeNewJob, looksLikePricelessJob } from '../src/handlers/messageHandler.js';

/* "งานพิมพ์การ์ด" ต้องเป็นงานพิมพ์ — เคสจริงร้านพิมพ์คำนี้ (และ "การ์ดแต่งงาน"
 * "พิมพ์การ์ด" "งานพิมพ์") แล้วม่วงไม่รู้จักสักคำ เพราะคำค้นมีแต่ "พิมพ์งาน"
 * (เรียงกลับกัน) ส่วน "การ์ด" ไม่มีเลย ทั้งที่ร้านพิมพ์การ์ดเป็นงานหลัก
 */

test('การ์ด/พิมพ์ เข้าหมวดงานพิมพ์ — ตาข่ายท้ายเดิม (priority -5) คำวัสดุยังชนะ', () => {
  for (const name of ['งานพิมพ์การ์ด', 'การ์ดแต่งงาน', 'พิมพ์การ์ด', 'งานพิมพ์', 'การ์ด 100 ใบ']) {
    const hit = classifyItem(name);
    assert.equal(hit?.type?.id, 'print', `"${name}" ได้ ${hit?.type?.id || 'ไม่รู้จัก'}`);
  }

  // ของเดิมห้ามเพี้ยน — คำวัสดุ/คำเจาะจงกว่าชนะคำกริยาพิมพ์/ปริ้นเสมอ (#180)
  assert.equal(classifyItem('ปริ้นโฟมบอร์ด 60x160')?.type?.id, 'foamboard');
  assert.equal(classifyItem('พิมพ์ป้ายไวนิล 60x100')?.type?.id, 'vinyl');
  assert.equal(classifyItem('ปริ้นรูป 4x6')?.type?.id, 'photo');
  assert.equal(classifyItem('สติ๊กเกอร์การ์ด 20 ดวง')?.type?.id, 'sticker');
  assert.equal(classifyItem('การ์ดใส่กรอบ')?.type?.id, 'frame');
  assert.equal(classifyItem('พิมพ์เขียว A0')?.type?.id, 'print', 'ตาข่ายท้ายยังรับงานพิมพ์จริง');
});

test('พิมพ์ชื่องานการ์ดแล้วม่วงเริ่มถามต่อได้จริง ไม่ใช่เงียบหรือวนถามเดิม', () => {
  for (const name of ['งานพิมพ์การ์ด', 'การ์ดแต่งงาน']) {
    const collecting = startCollecting(name);
    assert.ok(collecting, `"${name}" ไม่เริ่มชุดคำถาม`);
    assert.equal(nextQuestion(collecting)?.text, 'ขาวดำหรือสีคะ?', 'ชุดคำถามงานพิมพ์');
  }

  // เส้นทางที่เคสจริงต้องวิ่ง: ไม่ใช่งานทั้งใบ (ไม่มีราคา/เลข) → ต้องไปทาง
  // เริ่มชุดคำถาม/สลับชุดคำถาม เท่านั้น
  assert.equal(isWholeNewJob('งานพิมพ์การ์ด'), false);
  assert.equal(looksLikePricelessJob('งานพิมพ์การ์ด'), false, 'ไม่มีตัวเลข = ยังไม่ใช่ใบงาน');
});
