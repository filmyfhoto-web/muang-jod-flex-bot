import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BASE_TAXONOMY } from '../src/utils/category.js';

/* ร้านพิมพ์ "กรอบ 12 18" แล้วช่องเงินขึ้น "ตร.ม. ละ (บาท)" — "งานกรอบก็ต้องเป็น
 * บานละเท่าไหร่งี้ไหม ... บางทีมันไม่ได้เป็น ตรม ทั้งหมด"
 *
 * kind.js คือตัวจับชนิดงานฝั่งเบราว์เซอร์ ใช้รายการ pricing ที่เซิร์ฟเวอร์สรุปจาก
 * ระบบหมวดงาน (pricingEntries) — สองฝั่งต้องมองงานเดียวกันเป็นชนิดเดียวกันเสมอ
 * ไม่งั้นฟอร์มขึ้นหน่วยหนึ่ง แต่เลขงานออกอีกหมวดหนึ่ง
 */

function loadKind() {
  const src = readFileSync(new URL('../public/liff/jot/kind.js', import.meta.url), 'utf8');
  const sandbox = {};
  new Function('globalThis', `${src}\nreturn globalThis.MJKind;`)(sandbox);
  return sandbox.MJKind;
}

const MJKind = loadKind();
const ENTRIES = BASE_TAXONOMY.pricingEntries;

test('ชนิดงานหลักของร้านได้หน่วยราคาถูกตัว — เคสจริงคือ "กรอบ 12 18"', () => {
  const at = (name) => MJKind.match(name, ENTRIES)?.price;
  assert.deepEqual(at('กรอบ 12 18'), { mode: 'piece', unit: 'บาน' });
  assert.deepEqual(at('กรอบรูป A4'), { mode: 'piece', unit: 'บาน' });
  assert.deepEqual(at('ตรายาง ชื่อร้าน'), { mode: 'piece', unit: 'อัน' });
  assert.deepEqual(at('อัดรูป 4x6'), { mode: 'piece', unit: 'ใบ' });
  assert.deepEqual(at('ป้ายไวนิล 160x300'), { mode: 'sqm', unit: 'ผืน' });
  assert.deepEqual(at('โฟมบอร์ด A1'), { mode: 'sqm', unit: 'แผ่น' });
  assert.deepEqual(at('สติ๊กเกอร์ไดคัท'), { mode: 'sheet', unit: 'แผ่น' });
  assert.deepEqual(at('ถ่ายเอกสาร 100 ชุด'), { mode: 'sheet', unit: 'แผ่น' });
  assert.deepEqual(at('PRINT a4'), { mode: 'piece', unit: 'ใบ' }, 'คำอังกฤษไม่สนตัวพิมพ์');

  // ไม่รู้จัก = null ให้ฟอร์มตัดสินเอง (ต่อชิ้นเมื่อยังไม่ใส่เรต) ไม่ใช่เดามั่ว
  assert.equal(MJKind.match('ของแปลกไม่มีในระบบ', ENTRIES), null);
  assert.equal(MJKind.match('', ENTRIES), null);
  assert.equal(MJKind.match('กรอบรูป', []), null);
  assert.equal(MJKind.match('กรอบรูป', null), null);
});

test('ลำดับการจับคำตรงกับเซิร์ฟเวอร์ทุกชื่อ — คำซ้อนหมวดต้องเลือกตัวเดียวกัน', () => {
  const pairLabel = (hit) =>
    !hit ? null : !hit.type || hit.type.label === hit.group.label ? hit.group.label : `${hit.group.label} / ${hit.type.label}`;
  for (const name of [
    'ปริ้นโฟมบอร์ด 60x160', // เคยออกเลขงานผิดเป็น PRN มาแล้ว — วัสดุต้องชนะคำกริยา
    'สติ๊กเกอร์ฟิวเจอร์บอร์ด',
    'ฟิวเจอร์บอร์ดติดสติ๊กเกอร์', // กติกา all: เขียนสลับลำดับคำก็ต้องเข้า
    'ปริ้นรูป 4x6',
    'รูปหน้างานพร้อมกรอบ',
    'ปริ้น A4 50 แผ่น',
    'ป้ายอะคริลิค',
    'เข้าเล่มสันกาว',
  ]) {
    assert.equal(MJKind.match(name, ENTRIES)?.label ?? null, pairLabel(BASE_TAXONOMY.classifyItem(name)), name);
  }
});
