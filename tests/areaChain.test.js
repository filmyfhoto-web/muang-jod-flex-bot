import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNaturalJob } from '../src/utils/nlParser.js';
import { parseAreaPricing, matchSqmRate } from '../src/utils/area.js';

/* ร้านขอ "ความรวดเร็ว": พิมพ์บรรทัดเดียวแล้วให้ม่วงคูณให้
 *
 *   "งานโฟมบอร์ด รร สบกอน คนสั่งน้องทีน ขนาด 100*150*600"
 *   → 100 ซม. = 1 ม. · 150 ซม. = 1.5 ม. · 1 × 1.5 = 1.5 ตร.ม. × 600 = ฿900
 *
 * ของเดิมอ่าน 600 เป็นราคาเหมา งานนี้จึงออกมา ฿600 — คิดเงินขาดไป 300 บาท
 * เงียบ ๆ โดยไม่มีอะไรบนการ์ดบอกว่าอ่านคนละแบบกับที่ร้านคิด
 */

test('เลขสามตัวคูณกัน ตัวที่สามคือราคาต่อตารางเมตร', () => {
  const d = parseNaturalJob('งานโฟมบอร์ด รร สบกอน คนสั่งน้องทีน ขนาด 100*150*600');
  const it = d.items[0];

  assert.equal(d.total, 900, 'คิดเงินขาด — 600 ถูกอ่านเป็นราคาเหมา');
  assert.equal(it.unit_price, 900);
  assert.equal(d.customerName, 'น้องทีน');
  assert.equal(it.item_name, 'โฟมบอร์ด', 'ชื่อของกลายเป็นทั้งประโยค');
  assert.match(String(it.size), /100 × 150 ซม\./);

  // วิธีคิดต้องติดมาให้ร้านตรวจได้ ไม่ใช่โผล่มาแต่ยอดสุดท้าย
  assert.match(String(it.working), /1\.5 ตร\.ม\. × 600 = 900/);
});

test('เขียนได้ทั้งสองแบบ และได้เลขเดียวกัน', () => {
  const short = parseNaturalJob('โฟมบอร์ด 100*150*600');
  const words = parseNaturalJob('โฟมบอร์ด 100*150 ตรมละ 600');
  assert.equal(short.total, 900);
  assert.equal(words.total, 900, 'สองแบบให้คนละเลข');
  assert.equal(short.items[0].size, words.items[0].size);
});

/* ราคาเหมายังเขียนได้เหมือนเดิม — เว้นวรรค ไม่ใช่เครื่องหมายคูณ
 *
 * เส้นแบ่งนี้คือทั้งหมดที่กันไม่ให้ ฿600 กับ ฿900 สลับกัน จึงต้องมีเทสต์คุม
 */
test('เว้นวรรค = ราคาเหมา · คูณ = ราคาต่อตารางเมตร', () => {
  assert.equal(parseNaturalJob('โฟมบอร์ด 100*150 600').total, 600, 'ราคาเหมากลายเป็นเรต');
  assert.equal(parseNaturalJob('โฟมบอร์ด 100*150*600').total, 900);
});

test('ไม่ใช่ทุกเลขตัวที่สามที่เป็นราคา', () => {
  // กล่องสามมิติ — 15 ไม่ใช่เรตต่อตารางเมตร
  const box = parseNaturalJob('กล่อง 30*20*15 200 บาท');
  assert.equal(box.total, 200, 'ความหนาถูกอ่านเป็นราคาต่อตารางเมตร');

  // จำนวนชิ้นที่เขียนต่อท้าย ก็ไม่ใช่เรต
  assert.equal(matchSqmRate('160*300*2'), null);
  assert.equal(matchSqmRate('160*300*19'), null, 'ต่ำกว่ายี่สิบไม่ใช่เรต');
  assert.equal(matchSqmRate('160*300*20').rate, 20);
});

test('หน่วยที่เขียนมาเอง ยังเชื่อเหมือนเดิม', () => {
  // เมตร: 1.2 × 2.4 = 2.88 ตร.ม. × 450
  assert.equal(parseNaturalJob('โฟมบอร์ด 1.2*2.4*450').total, 1296);
  // เขียนหน่วยกำกับเอง
  const cm = parseAreaPricing(' ไวนิล 160ซม*300ซม*165 ');
  assert.equal(cm.rate, 165);
  assert.equal(cm.sqm, 4.8);
});

test('คำว่า "ตรมละ" ชนะรูปแบบสามตัวคูณเสมอ', () => {
  // เขียนมาทั้งสองอย่างในบรรทัดเดียว ต้องเชื่อคำที่พิมพ์ชัด ๆ
  const a = parseAreaPricing(' ไวนิล 160*300*99 ตรมละ 165 ');
  assert.equal(a.rate, 165, 'เลขลอย ๆ ชนะคำที่ร้านพิมพ์ชัดเจน');
});
