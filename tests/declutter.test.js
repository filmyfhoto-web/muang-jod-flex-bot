import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* ร้านบอก "ออกแบบทุกหน้าให้ใหม่ได้ไหม มันดูกรอกเยอะไป"
 *
 * คำตอบไม่ใช่ตัดช่องทิ้ง (ทุกช่องมีคนเคยขอ) แต่คือ "เห็นเฉพาะที่ใช้ทุกใบ
 * ที่เหลือพับไว้" — ของที่พับต้องยังอยู่ครบ กดเดียวถึง และใบที่กรอกของใน
 * พับไว้แล้วต้องกางมาให้เอง
 */

const read = (p) => readFileSync(new URL(`../public/liff/${p}`, import.meta.url), 'utf8');
const jot = read('jot/index.html');
const jotJs = read('jot/script.js');
const dash = read('index.html');

const between = (s, from, to, start = 0) => {
  const a = s.indexOf(from, start);
  assert.ok(a >= 0, `ไม่เจอ ${from}`);
  const b = s.indexOf(to, a);
  assert.ok(b > a, `ไม่เจอ ${to} หลัง ${from}`);
  return s.slice(a, b);
};

// --- ฟอร์มจด -------------------------------------------------------------------

test('ฟอร์มจด: บรรทัดงานเห็นแค่ ชื่อ · ขนาด/จำนวน · เงิน — ที่เหลือพับใน "เพิ่มเติม"', () => {
  const tpl = between(jot, '<template id="tpl-item">', '</template>');
  const extra = between(tpl, '<details class="extra">', '</details>');

  // ของที่พับ: รายละเอียด หน่วย วิธีคิดราคา แนบรูป
  for (const cls of ['i-detail', 'i-unit', 'i-ratemode', 'i-file']) {
    assert.ok(extra.includes(`class="${cls}"`) || extra.includes(`class="${cls} `) || extra.includes(cls), `${cls} ต้องอยู่ในพับ`);
  }
  // ของที่เห็นเสมอ: ชื่อ ขนาด จำนวน ช่องเงิน — ต้องอยู่นอกพับ
  const beforeExtra = tpl.slice(0, tpl.indexOf('<details class="extra">'));
  for (const cls of ['i-name', 'i-w', 'i-h', 'i-qty', 'i-rate']) {
    assert.ok(beforeExtra.includes(`class="${cls}"`) || beforeExtra.includes(cls), `${cls} ต้องเห็นเสมอ`);
  }
  // รูปที่แนบแล้วต้องเห็นเสมอ — พรีวิวอยู่นอกพับ
  assert.ok(!extra.includes('class="preview"'), 'พรีวิวรูปต้องไม่อยู่ในพับ');
  assert.ok(tpl.indexOf('class="preview"') > tpl.indexOf('</details>'), 'พรีวิวอยู่หลังพับ');

  // ใบที่มีรายละเอียด/รูปอยู่แล้ว กางพับมาให้เอง ไม่มีข้อมูลซ่อนหาย
  assert.match(jotJs, /extra\.open = Boolean\(item\.detail \|\| item\.image\)/);
});

test('ฟอร์มจด: วันที่จด/รับเงินมาแล้ว/หมายเหตุ พับไว้ตั้งแต่เปิดหน้า (เหมือนโหมดด่วน)', () => {
  assert.ok(jot.includes('<details class="more" id="more">'), '#more ต้องไม่ติด open มา');
  assert.ok(!jot.includes('<details class="more" id="more" open>'));
});

// --- แดชบอร์ด ------------------------------------------------------------------

test('คิวงาน: แผงสถานะพับทุกใบ แตะแถวถึงกาง (ทีละใบ) — ปุ่มทั้งเจ็ดยังอยู่ครบ', () => {
  assert.match(dash, /function attachPanel\(parent, row, job\)/);
  // ทั้งคิวงานและหน้าหมวดใช้ทางเดียวกัน
  assert.match(dash, /attachPanel\(parent, jobRow\(j, \{ queue: true/);
  assert.match(dash, /if \(opts && opts\.panel\) attachPanel\(el, row, j\);/);
  // กางทีละใบ และจำใบที่กางไว้ข้ามการวาดใหม่ (กดปุ่มสถานะแล้วแผงไม่หุบหนี)
  assert.match(dash, /let queueOpenJob = null;/);
  assert.match(dash, /queueOpenJob = show \? job\.id : null;/);
  assert.match(dash, /const open = queueOpenJob === job\.id;/);
  // แถวที่กางได้มีลูกศรบอก ไม่ใช่ให้เดาเอง
  assert.match(dash, /\.job\.has-sp::after/);
});

test('คิวงาน: ตัวกรองรอง (แบ่งกอง/แยกตามเงิน) พับไว้ หัวพับบอกค่าที่เลือกอยู่', () => {
  const fil = between(dash, '<details class="fil" id="t-filter-more">', '</details>');
  assert.ok(fil.includes('id="t-queue-group"'), 'ปุ่มแบ่งกองอยู่ในพับ');
  assert.ok(fil.includes('id="t-queue-money"'), 'ปุ่มแยกตามเงินอยู่ในพับ');
  assert.ok(!fil.includes('id="t-queue-filter"'), 'ปุ่มหลัก ทั้งหมด/ค้างรับ/รับแล้ว ไม่ถูกพับ');
  assert.ok(!fil.includes('id="t-money-sum"'), 'สรุปกองเงินอยู่นอกพับ — กรองอยู่ต้องเห็นยอดเสมอ');

  // หัวพับบอกค่า และตั้งตัวกรองไว้แล้วเปิดหน้ามาใหม่ พับต้องกางให้เห็นเอง
  assert.match(dash, /\$\('t-filter-note'\)\.textContent =/);
  assert.match(dash, /if \(queueGroup !== 'day' \|\| queueMoney !== 'all'\) fil\.open = true;/);
  // กองเงินว่าง: ปุ่มสลับกองอยู่ในพับ ต้องกางไว้ ไม่งั้นติดอยู่ในกองว่าง
  assert.match(dash, /\$\('t-filter-more'\)\.open = true;/);
});

test('งานวันนี้: การ์ดสัดส่วน (ไว้ดู) อยู่ใต้คิวงาน (ไว้ทำ)', () => {
  const today = between(dash, '<section id="v-today"', '</section>');
  assert.ok(today.indexOf('id="t-recent"') < today.indexOf('id="t-share-card"'));
});

test('ตั้งค่า: ช่องข้อมูลร้านพับไว้ กดแก้ถึงกาง', () => {
  const fold = between(dash, '<details class="fil" id="sh-fold">', '</details>');
  for (const id of ['sh-name', 'sh-phone', 'sh-address', 'sh-tax', 'sh-footer', 'sh-save']) {
    assert.ok(fold.includes(`id="${id}"`), `${id} ต้องอยู่ในพับ`);
  }
  assert.ok(!dash.includes('<details class="fil" id="sh-fold" open>'));
});
