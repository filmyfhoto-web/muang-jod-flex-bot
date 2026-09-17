import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareForVision, needsShrink, MAX_EDGE, PASS_THROUGH_BYTES } from '../src/services/imagePrep.js';
import { readImage } from '../src/services/visionService.js';

/* ไฟล์ที่ลูกค้าส่งมา ต้องอ่านได้ ไม่ใช่โดนปัดตกเพราะใหญ่
 *
 * ร้านส่งภาพมาว่า "ถ้าลูกค้าส่งมาแบบนี้ฉันอยากให้ม่วงอ่านได้เลย" — ไฟล์
 * "รับขุดบ่อน้ำตื้น..png" 27.42 MB ส่งมาเป็นไฟล์แนบ ไม่ใช่รูปในแชต
 *
 * รูปที่ส่งเป็น "รูป" ไลน์บีบมาให้แล้วเหลือหลักหนึ่งถึงสองเมกฯ แต่รูปที่ส่งเป็น
 * "ไฟล์" มาเต็มความละเอียดเดิม แล้วชนเพดานของตัวอ่าน (10 MB ต่อรูป นับแบบ
 * base64 ซึ่งพองขึ้นอีกราวหนึ่งในสาม)
 */

// รูปใหญ่จริง ๆ ไม่ใช่บัฟเฟอร์ปลอม — ต้องพิสูจน์ว่าย่อของจริงได้
async function bigPng({ width = 4200, height = 5600 } = {}) {
  const { default: sharp } = await import('sharp');
  // ภาพรบกวนล้วน บีบไม่ลง เลยได้ PNG ใหญ่แบบที่กล้องมือถือ/สแกนเนอร์ส่งมาจริง
  const px = width * height * 3;
  const noise = Buffer.allocUnsafe(px);
  let seed = 12345;
  for (let i = 0; i < px; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    noise[i] = (seed >> 16) & 0xff;
  }
  return sharp(noise, { raw: { width, height, channels: 3 } }).png({ compressionLevel: 0 }).toBuffer();
}

async function smallJpeg() {
  const { default: sharp } = await import('sharp');
  return sharp({ create: { width: 800, height: 600, channels: 3, background: '#ffffff' } })
    .jpeg({ quality: 80 })
    .toBuffer();
}

test('รูปเล็กไม่ถูกแตะต้อง — บีบซ้ำมีแต่ทำให้ตัวหนังสือเบลอ', async () => {
  const small = await smallJpeg();
  assert.ok(small.length < PASS_THROUGH_BYTES);
  assert.equal(needsShrink(small), false);

  const out = await prepareForVision(small, 'image/jpeg');
  assert.equal(out.shrunk, false);
  assert.equal(out.mimeType, 'image/jpeg');
  assert.ok(out.buffer === small, 'บัฟเฟอร์ต้องเป็นตัวเดิม ไม่ใช่ของที่เข้ารหัสใหม่');
});

test('ไฟล์แบบที่ลูกค้าส่งมา (PNG หลายสิบเมกฯ) ย่อแล้วส่งอ่านได้', async () => {
  const { default: sharp } = await import('sharp');
  const huge = await bigPng();
  // ต้องใหญ่กว่าเพดานของตัวอ่านจริง ๆ ไม่งั้นเทสต์นี้ไม่ได้ทดสอบอะไร
  assert.ok(huge.length > 20 * 1024 * 1024, `รูปทดสอบเล็กไป: ${huge.length}`);
  assert.equal(needsShrink(huge), true);

  const out = await prepareForVision(huge, 'image/png');
  assert.ok(out, 'ย่อไม่สำเร็จ');
  assert.equal(out.shrunk, true);
  assert.equal(out.mimeType, 'image/jpeg');

  // เพดานจริงคือ 10 MB แบบ base64 — ของที่ย่อแล้วต้องผ่านแบบไม่ต้องลุ้น
  const base64Bytes = Math.ceil(out.buffer.length / 3) * 4;
  assert.ok(base64Bytes < 10 * 1024 * 1024, `ยัง base64 เกิน 10MB: ${base64Bytes}`);
  assert.ok(out.buffer.length < huge.length / 10, 'ย่อแล้วยังใหญ่เกือบเท่าเดิม');

  // และต้องยังเป็นรูปที่เปิดได้ ขนาดพอดีกับที่ตัวอ่านใช้จริง
  const meta = await sharp(out.buffer).metadata();
  assert.equal(meta.format, 'jpeg');
  assert.ok(Math.max(meta.width, meta.height) <= MAX_EDGE, `ด้านยาว ${meta.width}x${meta.height}`);
  // สัดส่วนเดิมต้องไม่เพี้ยน ไม่งั้นตัวหนังสือในใบสั่งงานจะยืด
  assert.ok(Math.abs(meta.width / meta.height - 4200 / 5600) < 0.01);
});

test('readImage ส่งรูปที่ย่อแล้วให้ตัวอ่าน ไม่ใช่ของดิบ', async () => {
  const huge = await bigPng({ width: 3600, height: 4800 });
  let sawBytes = null;
  let sawType = null;

  const read = await readImage(huge, 'image/png', {
    visionExtract: async (buffer, mimeType) => {
      sawBytes = buffer.length;
      sawType = mimeType;
      return { kind: 'job', jobName: 'รับขุดบ่อน้ำตื้น', total: 0, items: [{ item_name: 'ป้ายไวนิล', quantity: 1, unit_price: 0 }] };
    },
  });

  assert.ok(sawBytes, 'ตัวอ่านไม่ถูกเรียกเลย');
  assert.ok(sawBytes < huge.length / 10, `ส่งของดิบไป ${sawBytes} จาก ${huge.length}`);
  assert.equal(sawType, 'image/jpeg');
  assert.equal(read?.kind, 'job');
  assert.equal(read.jobName, 'รับขุดบ่อน้ำตื้น');
});

test('ย่อไม่ได้ ก็ไม่ส่งของใหญ่ไปให้โดนปฏิเสธ', async () => {
  const huge = Buffer.alloc(30 * 1024 * 1024, 7); // ไม่ใช่รูปจริง ย่อไม่ได้แน่นอน
  let called = false;
  const read = await readImage(huge, 'image/png', {
    visionExtract: async () => {
      called = true;
      return { kind: 'job', total: 0, items: [] };
    },
  });
  assert.equal(called, false, 'ส่งของที่ย่อไม่ได้ไปให้ตัวอ่าน');
  assert.equal(read, null);
});

test('sharp ใช้ไม่ได้ ก็ไม่ล้ม แค่อ่านไฟล์ใหญ่ไม่ได้', async () => {
  const huge = Buffer.alloc(30 * 1024 * 1024, 7);
  assert.equal(await prepareForVision(huge, 'image/png', { sharp: null }), null);
  // ของเล็กยังผ่านได้เหมือนเดิม ไม่ต้องพึ่ง sharp เลย
  const small = await smallJpeg();
  const out = await prepareForVision(small, 'image/jpeg', { sharp: null });
  assert.equal(out.shrunk, false);
});
