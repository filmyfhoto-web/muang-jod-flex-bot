import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ledger = readFileSync(new URL('../public/liff/ledger/index.html', import.meta.url), 'utf8');
const book = readFileSync(new URL('../public/liff/book/index.html', import.meta.url), 'utf8');
const dash = readFileSync(new URL('../public/liff/index.html', import.meta.url), 'utf8');

test('ไฟล์ที่ส่งให้คนทำบัญชี เปิดใน Excel แล้วภาษาไทยไม่เพี้ยน', () => {
  /* ต้องมี BOM นำหน้า ไม่งั้น Excel เดาว่าเป็นรหัสภาษาอื่น แล้วชื่อลูกค้า
   * กลายเป็นตัวขยะทั้งไฟล์ ซึ่งคนทำบัญชีเปิดมาแล้วอ่านไม่ออกสักแถว
   */
  assert.match(ledger, /'\\ufeff' \+ out\.join/);
  assert.match(ledger, /charset=utf-8/);

  // ชื่อไฟล์บอกวันที่ จะได้ไม่ทับกันเวลาส่งหลายวัน
  assert.match(ledger, /'muangjod-ledger-' \+ led\.date \+ '\.csv'/);
});

test('ไฟล์มีคอลัมน์ที่คนทำบัญชีต้องใช้ และมียอดสรุปท้ายไฟล์', () => {
  for (const col of ['ลำดับ', 'เลขที่งาน', 'ลูกค้า', 'งาน', 'ประเภท', 'รับโดย', 'จำนวนเงิน']) {
    assert.ok(ledger.includes(`'${col}'`), 'ไม่มีคอลัมน์ ' + col);
  }
  assert.ok(ledger.includes("'รวมรับเป็นเงินทั้งสิ้น'"));
  // ยอดค้างต้องแยกไว้ ไม่ปนกับรายรับ
  assert.ok(ledger.includes("'ค้างรับยกไป (ยังไม่ได้เก็บเงิน)'"));
});

test('ค่าที่มีจุลภาคหรือเครื่องหมายคำพูด ไม่ทำให้คอลัมน์เลื่อน', () => {
  // ชื่องานอย่าง "ป้าย 1x3 ม., 2 ผืน" มีจุลภาคอยู่ในตัว ถ้าไม่ครอบจะกลาย
  // เป็นสองคอลัมน์ แล้วยอดเงินไปโผล่ผิดช่องทั้งแถว
  assert.match(ledger, /\/\[",\\n\]\/\.test\(t\)/);
  assert.match(ledger, /t\.replace\(\/"\/g, '""'\)/);
});

test('วันที่ไม่มีรายการ ไม่มีปุ่มบันทึกไฟล์ให้กดจนได้ไฟล์เปล่า', () => {
  assert.match(ledger, /\$\('save'\)\.hidden = !led\.jobCount;/);
});

test('เปิดบนคอมแล้วไม่ยืดเต็มจอจนอ่านไม่รู้เรื่อง', () => {
  // ร้านสั่งรอบล่าสุด "เอาหน้าตาแบบใช้ในมือถือ" — ทุกหน้าเป็นคอลัมน์มือถือกลางจอ
  for (const [name, page] of [['สมุดลูกค้า', book], ['ใบลงบัญชี', ledger]]) {
    assert.match(page, /main \{ max-width: 430px; margin-inline: auto; \}/, name);
  }
});

/* ร้านเคยขอแถบข้างแบบ mac บนคอม แล้วสั่งใหม่ชัดกว่า: "ออกแบบหน้าตาใหม่ให้ดูง่าย
 * เอาหน้าตาแบบใช้ในมือถือ" (แนบตัวอย่างเว็บคอลัมน์แคบกลางจอมา) — แถบข้างจึง
 * ถูกถอด บนคอมก็เป็นแถบล่างเหมือนมือถือเป๊ะ
 */
test('บนจอคอม หน้าตาเหมือนมือถือ — ไม่มีแถบข้าง เหลือแถบล่างทุกขนาดจอ', () => {
  assert.ok(!dash.includes('@media (min-width: 900px)'), 'แถบข้างจอคอมต้องถูกถอดแล้ว');
  assert.ok(!dash.includes('padding-left: 236px'), 'เนื้อหาต้องไม่เว้นที่ให้แถบข้างอีก');
  // แถบล่างยังตรึงล่างจอ และปุ่มถูกบีบให้อยู่กลางเท่าคอลัมน์มือถือ
  assert.match(dash, /nav \{\s*\n\s*position: fixed; left: 0; right: 0; bottom: 0;/);
  assert.match(dash, /max\(4px, calc\(\(100% - 430px\) \/ 2\)\)/);
});

/* ช่องวันที่ของเบราว์เซอร์แสดงตามภาษาเครื่อง ซึ่งขึ้นเป็น 09/30/2026 แบบ
 * อเมริกันบนแอปภาษาไทย และสั่งให้แสดงแบบไทยไม่ได้
 */
test('วันที่บนใบเป็นแบบไทย และเลื่อนวันได้', () => {
  // เขียนวันที่ไทยเอง แล้ววางช่องจริงทับแบบโปร่งใส แตะยังได้ปฏิทินของเครื่อง
  assert.match(ledger, /\$\('shown'\)\.textContent = thaiDate\(led\.date\);/);
  assert.match(ledger, /\.pick input \{[^}]*opacity: 0/s);

  // เลื่อนทีละวันด้วยตัวเลขของวันที่ ไม่ใช่เวลาจริง จะได้ไม่โดนเขตเวลาดึง
  assert.match(ledger, /function shiftDay\(iso, step\)/);
  assert.match(ledger, /new Date\(iso \+ 'T12:00:00Z'\)/);
  assert.match(ledger, /\$\('prev'\)\.onclick/);
  assert.match(ledger, /\$\('next'\)\.onclick/);

  // วันในอนาคตยังไม่มีเงินให้ลง
  assert.match(ledger, /\$\('next'\)\.disabled = led\.date >= todayTH\(\);/);
});
