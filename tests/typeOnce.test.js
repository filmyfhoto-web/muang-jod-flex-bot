import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import express from 'express';
import { splitDump } from '../src/utils/dumpSplit.js';
import { createApiRouter } from '../src/routes/api.js';

process.env.LIFF_ID = '1234567890-abcdefgh';

const form = readFileSync(new URL('../public/liff/jot/index.html', import.meta.url), 'utf8');
const script = readFileSync(new URL('../public/liff/jot/script.js', import.meta.url), 'utf8');

/* ร้านบอกว่า "ขอแบบกระชับ ตารางไม่เยอะ ไม่พิมพ์หลายรอบ"
 *
 * ฟอร์มจดงานมีสิบช่องต่อหนึ่งรายการ (ชื่อ · รายละเอียด · กว้าง · ยาว · จำนวน ·
 * หน่วย · วิธีคิด · เรต · ราคาต่อชิ้น · ยอดรวม) ซึ่งร้านต้องไล่กรอกเองทุกช่อง
 * ทั้งที่พิมพ์ประโยคเดียวในแชตแล้วม่วงอ่านออกมาตั้งนานแล้ว
 */

function serve() {
  const app = express();
  app.use(express.json());
  app.use('/api', createApiRouter({
    verify: async () => ({ userId: 'U1' }),
    resolveProfile: async () => ({ id: 'u1', line_user_id: 'U1' }),
  }));
  return app.listen(0);
}

const parse = async (port, text) => {
  const res = await fetch(`http://127.0.0.1:${port}/api/parse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  return { status: res.status, body: await res.json() };
};

test('พิมพ์ทีเดียว แล้วม่วงกรอกตารางให้', async () => {
  const server = serve();
  const { port } = server.address();
  try {
    const { status, body } = await parse(port, 'งานไวนิล งานสีดำน้องป่านสั่ง\nขนาด 0.6*1.6  1 ผืน\n200 บาท');
    assert.equal(status, 200);

    const d = body.draft;
    assert.equal(d.customerName, 'น้องป่าน');
    assert.equal(d.items.length, 1, 'ควรเป็นของชิ้นเดียว');
    assert.equal(d.items[0].item_name, 'ไวนิล');
    assert.equal(d.items[0].quantity, 1);
    assert.equal(d.items[0].unit_price, 200);
    assert.equal(d.total, 200);
    assert.match(String(d.items[0].size), /0\.6 × 1\.6/);

    // คิดตามตารางเมตรก็กรอกให้ได้เหมือนกัน
    const sqm = await parse(port, 'ไวนิล 160x300 ตรมละ 165');
    assert.equal(sqm.body.draft.total, 792);
  } finally {
    server.close();
  }
});

test('ไม่ได้พิมพ์อะไรมา ก็บอกไปตรง ๆ ไม่ใช่กรอกช่องว่างให้', async () => {
  const server = serve();
  const { port } = server.address();
  try {
    assert.equal((await parse(port, '   ')).status, 400);
    assert.equal((await parse(port, '')).status, 400);
  } finally {
    server.close();
  }
});

/* หลายงานหลายลูกค้าในข้อความเดียว ฟอร์มนี้กรอกได้ทีละงาน
 *
 * บอกไปว่าเหลืออีกกี่งาน ดีกว่ากลืนหายไปเงียบ ๆ แล้วร้านมารู้ทีหลังตอนที่งาน
 * ของลูกค้าอีกสามคนไม่เคยถูกบันทึก
 */
test('พิมพ์มาหลายงาน ต้องบอกว่าเหลืออีกกี่งาน', async () => {
  const server = serve();
  const { port } = server.address();
  try {
    const { body } = await parse(port, 'พี่นก ป้ายไวนิล 2 ป้าย ป้ายละ 350\nครูแดง ตรายาง 1 อัน 300');
    assert.equal(body.more, 1, 'งานของลูกค้าอีกคนหายไปเงียบ ๆ');
    assert.equal(body.draft.customerName, 'พี่นก');

    // งานเดียว ไม่ต้องเตือนอะไร
    const one = await parse(port, 'ไวนิล 160x300 ตรมละ 165');
    assert.equal(one.body.more, 0);
  } finally {
    server.close();
  }
});

/* งานเดียวที่เขียนหลายบรรทัด ต้องเป็นรายการเดียว
 *
 * ของเดิมทางกองอ่านทีละบรรทัด ใบเสร็จจึงได้สองรายการ — "ผืน ฿0" กับ "งาน ฿200"
 * — ทั้งที่ลูกค้าสั่งป้ายผืนเดียว (ยอดรวมถูก แต่บนใบเสร็จอ่านไม่รู้เรื่อง)
 *
 * เส้นแบ่งคือ "มีบรรทัดเดียวที่มีราคา" ไม่ใช่เดาจากชื่อ — ขนาดกับจำนวนไม่มี
 * ราคาของตัวเอง มันเป็นรายละเอียดของราคาบรรทัดนั้น
 */
test('ขนาดกับราคาที่แยกบรรทัดกัน เป็นของชิ้นเดียว', () => {
  const { jobs, total } = splitDump('งานไวนิล งานสีดำน้องป่านสั่ง\nขนาด 0.6*1.6  1 ผืน\n200 บาท');

  assert.equal(jobs.length, 1);
  assert.equal(total, 200);
  assert.equal(jobs[0].items.length, 1, 'บรรทัดราคากลายเป็นรายการที่สอง');
  assert.equal(jobs[0].items[0].item_name, 'ไวนิล', 'ชื่อของอยู่บนหัวเรื่อง ต้องเอามาด้วย');
});

/* แต่บรรทัดที่มีราคาของตัวเอง คือของคนละชิ้น ห้ามยุบรวม
 *
 * เคยใช้ classifyItem ตัดสินแทน แล้วบรรทัด "รูปครูยิ้ม 1*1.5*700 = 1,050
 * 2 อัน 1050*2 = 2,100" อ่านไม่ออกว่ามีชื่อของ สองบรรทัดจึงโดนยุบรวมกัน
 * แล้วเงินหายไป ฿2,100 เงียบ ๆ
 */
test('บรรทัดที่มีราคาของตัวเอง ไม่ถูกยุบรวมจนเงินหาย', () => {
  const worked = splitDump(
    'โฟมบอร์ด รร สบกอน\nรูปครูยิ้ม 1*1.5*700 = *1,050*  2 อัน 1050*2 = *2,100*\nสแตนดี้ สูง 0.6*1.7  ชุดละ 1400   1400*2=2800'
  );
  assert.equal(worked.total, 4900, 'เงินหายไปจากการยุบบรรทัด');
  assert.equal(worked.jobs[0].items.length, 2);

  // ของคนละอย่างที่ต่างมีราคา ยังแยกกันเหมือนเดิม
  const two = splitDump('พี่ต่าย\nสติ๊กเกอร์ 50 ดวง ดวงละ 5\nตรายาง 1 อัน 250');
  assert.equal(two.jobs[0].items.length, 2);
  assert.equal(two.total, 500);

  // ใบสั่งเจ็ดบรรทัดของโรงเรียน ยังได้ยอดเดิม
  const school = splitDump(
    'รร สบกอน\nโฟมบอร์ด\nรูปครูยิ้ม 1*1.5*700*2=2,100\nรูปครูออฟ 1*1.5*700*2=2,100\nป้ายเกษียณ 1.2*1.7*600*2=2,448\nสแตนดี้ สูง\n0.6*1.7*700*2=1,428+200=1,628'
  );
  assert.equal(school.total, 8276);
  assert.equal(school.jobs[0].items.length, 4);
});

test('ฟอร์มจดงานมีช่องพิมพ์ทีเดียว และใช้ตัวอ่านตัวเดียวกับในแชต', () => {
  assert.match(form, /id="p-text"/, 'ไม่มีช่องพิมพ์ทีเดียว');
  assert.match(form, /id="p-go"/);
  assert.match(script, /async function pasteFill\(\)/);
  assert.match(script, /'\/api\/parse'/, 'ไม่ได้ยิงไปที่ตัวอ่านจริง');

  // กรอกให้แล้วยังแก้ได้ทุกช่องเหมือนเดิม — ใช้ตัวเติมฟอร์มตัวเดียวกับที่ใช้
  // ตอนเปิดงานเก่ามาแก้ ไม่ใช่ทางเติมอีกทางที่มีวันเพี้ยนไปคนละแบบ
  assert.match(script, /fromDraft\(body\.draft\)/);
  assert.match(script, /renderItems\(\)/);
});
