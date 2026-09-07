import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveJobName, guessCategory, itemIcon } from '../src/utils/category.js';

test('recognises print / signage jobs', () => {
  const items = [{ item_name: 'ป้ายไวนิล' }, { item_name: 'โฟมบอร์ด' }];
  assert.equal(deriveJobName(items), 'งานพิมพ์ / ป้ายโฆษณา');
  assert.equal(guessCategory(items)?.icon, '🪧');
});

test('recognises document / design / food categories', () => {
  assert.equal(deriveJobName([{ item_name: 'ถ่ายเอกสาร' }]), 'งานเอกสาร / ถ่ายเอกสาร');
  assert.equal(deriveJobName([{ item_name: 'ค่าออกแบบโลโก้' }]), 'งานออกแบบ');
  assert.equal(deriveJobName([{ item_name: 'กาแฟ' }]), 'อาหาร & เครื่องดื่ม');
});

test('falls back to item names when no category matches', () => {
  assert.equal(deriveJobName([{ item_name: 'ของแปลก' }]), 'ของแปลก');
  assert.equal(deriveJobName([{ item_name: 'ของแปลก' }, { item_name: 'อีกอัน' }]), 'ของแปลก +1 รายการ');
  assert.equal(deriveJobName([]), null);
});

test('item icons', () => {
  assert.equal(itemIcon('ป้ายไวนิล 60x100'), '🪧');
  assert.equal(itemIcon('สติกเกอร์'), '🏷️');
  assert.equal(itemIcon('อะไรก็ไม่รู้'), '📦');
});
