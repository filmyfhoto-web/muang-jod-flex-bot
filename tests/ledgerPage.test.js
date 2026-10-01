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
  // หน้างานวันนี้จำกัดความกว้างไว้อยู่แล้ว สองหน้าใหม่ต้องทำเหมือนกัน
  for (const [name, page] of [['สมุดลูกค้า', book], ['ใบลงบัญชี', ledger]]) {
    assert.match(page, /@media \(min-width: 720px\)/, name);
    assert.match(page, /main \{ max-width: 640px; margin-inline: auto; \}/, name);
  }
});

/* ร้านขอ "เอาเครื่องมือกดอยู่ไว้แบบระบบ mac" — บนคอมแถบปุ่มย้ายไปอยู่ข้างซ้าย
 * บนมือถือยังเป็นแถบล่างเหมือนเดิม เพราะนิ้วโป้งอยู่ตรงนั้น
 */
test('บนจอคอม แถบปุ่มอยู่ข้างซ้าย และเนื้อหาไม่โดนทับ', () => {
  const wide = dash.slice(dash.indexOf('@media (min-width: 900px)'));
  assert.ok(wide, 'ไม่มีกฎสำหรับจอกว้าง');

  const rule = wide.slice(0, wide.indexOf('\n  }\n'));
  assert.match(rule, /padding-left: 236px/, 'เนื้อหาไม่ได้เว้นที่ให้แถบปุ่ม');
  assert.match(wide, /width: 236px/);
  assert.match(wide, /flex-direction: column/);
  assert.match(wide, /border-right: 1px solid var\(--line\)/);
});
