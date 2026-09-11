import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveJobName,
  guessCategory,
  itemIcon,
  classifyItem,
  classifyJob,
  categoryFields,
  jobCategory,
  categoryLabel,
  findGroup,
  findType,
  CATEGORY_GROUPS,
  OTHER_GROUP,
} from '../src/utils/category.js';

test('classifies signage items into งานป้าย and its types', () => {
  assert.equal(classifyItem('ป้ายไวนิล 60x100').type.id, 'vinyl');
  assert.equal(classifyItem('โฟมบอร์ด 40x60').type.id, 'foamboard');
  assert.equal(classifyItem('แบนเนอร์โรลอัพ').type.id, 'banner');
  assert.equal(classifyItem('ป้ายไวนิล').group.id, 'sign');
});

test('ตรายาง is its own kind of work, and "ปั๊ม" alone is not it', () => {
  assert.equal(classifyItem('ตรายาง ชื่อร้าน').type.id, 'stamp');
  assert.equal(classifyItem('ตรายางหมึกในตัว 2 อัน').type.id, 'stamp');
  assert.equal(classifyItem('ตราปั๊มโรงเรียน').type.id, 'stamp');
  assert.equal(classifyItem('ตรายาง').group.id, 'stamp', 'ตรายางเป็นหมวดของตัวเอง ไม่ได้ซ่อนใต้งานพิมพ์');
  // ค่าปั๊มน้ำมันไม่ใช่งานตรายาง คำว่า "ปั๊ม" เดี่ยว ๆ จึงไม่ใช่คำค้น
  assert.equal(classifyItem('ค่าน้ำมัน ปั๊มบางจาก'), null);
});

test('สติ๊กเกอร์ฟิวเจอร์บอร์ด wins over both halves it is made of', () => {
  // งานนี้เคยตกไปลงโฟมบอร์ดหรือสติ๊กเกอร์ แล้วแต่ว่าเจอคำไหนก่อน
  assert.equal(classifyItem('สติ๊กเกอร์ฟิวเจอร์บอร์ด 60x90').type.id, 'sticker_board');
  assert.equal(classifyItem('สติกเกอร์ฟิวเจอร์บอร์ด').type.id, 'sticker_board', 'ไม้ตรี ตกหล่นก็ต้องเข้า');
  assert.equal(classifyItem('สติ๊กเกอร์ติดฟิวเจอร์บอร์ด').type.id, 'sticker_board');
  // เขียนสลับลำดับคำก็ยังใช่ — ร้านไม่ได้พิมพ์ตามแบบฟอร์ม
  assert.equal(classifyItem('ฟิวเจอร์บอร์ดติดสติ๊กเกอร์').type.id, 'sticker_board');
  assert.equal(classifyItem('ฟิวเจอร์บอร์ดติดสติ๊กเกอร์').group.id, 'sticker');

  // ของอย่างเดียวยังอยู่หมวดเดิม
  assert.equal(classifyItem('ฟิวเจอร์บอร์ด A1').type.id, 'foamboard');
  assert.equal(classifyItem('สติ๊กเกอร์ไดคัท').type.id, 'sticker');
});

test('classifies print items into งานพิมพ์ and its types', () => {
  assert.equal(classifyItem('ถ่ายเอกสาร 20 แผ่น').type.id, 'copy');
  assert.equal(classifyItem('พิมพ์งาน A4').type.id, 'print');
  assert.equal(classifyItem('เข้าเล่มสันกาว').type.id, 'binding');
  assert.equal(classifyItem('อัดรูปด่วน').type.id, 'photo');
  assert.equal(classifyItem('สแกนเอกสาร').type.id, 'scan');
  assert.equal(classifyItem('ถ่ายเอกสาร').group.id, 'print');
});

test('classifies design, food and shipping', () => {
  assert.equal(classifyItem('ค่าออกแบบโลโก้').group.id, 'design');
  assert.equal(classifyItem('กาแฟ').group.id, 'food');
  assert.equal(classifyItem('ค่าจัดส่ง').group.id, 'shipping');
  assert.equal(classifyItem('ของแปลก'), null);
  assert.equal(classifyItem(''), null);
});

test('a job takes the category of its first recognised item', () => {
  const items = [{ item_name: 'ของแปลก' }, { item_name: 'ป้ายไวนิล' }, { item_name: 'ถ่ายเอกสาร' }];
  assert.equal(classifyJob(items).type.id, 'vinyl');
  assert.deepEqual(categoryFields(items), { category: 'sign', category_type: 'vinyl' });
  assert.deepEqual(categoryFields([{ item_name: 'ของแปลก' }]), { category: 'other', category_type: null });
  assert.deepEqual(categoryFields([]), { category: 'other', category_type: null });
});

test('a stored category wins over re-classifying the items', () => {
  const job = { category: 'print', category_type: 'copy', items: [{ item_name: 'ป้ายไวนิล' }] };
  assert.equal(jobCategory(job).group.id, 'print');
  assert.equal(categoryLabel(job), 'งานพิมพ์ / ถ่ายเอกสาร');

  // งานที่จดไว้ก่อนตรายาง/สติ๊กเกอร์แยกออกมาเป็นหมวดของตัวเอง ยังมีหมวดเก่าติดอยู่
  // ประเภทเจาะจงกว่า จึงชนะ ไม่งั้นงานเดิมโชว์ผิดหมวดตลอดไป
  assert.equal(jobCategory({ category: 'print', category_type: 'stamp' }).group.id, 'stamp');
  assert.equal(categoryLabel({ category: 'sign', category_type: 'sticker' }), 'สติ๊กเกอร์');
  // หมวดที่มีประเภทเดียวชื่อเดียวกัน ไม่ต้องพูดสองครั้ง
  assert.equal(categoryLabel({ category: 'stamp', category_type: 'stamp' }), 'ตรายาง');

  // No stored category: fall back to the items.
  assert.equal(categoryLabel({ items: [{ item_name: 'ป้ายไวนิล' }] }), 'งานป้าย / ป้ายไวนิล');
  // Nothing at all: the catch-all group, never a crash.
  assert.equal(categoryLabel({}), OTHER_GROUP.label);
});

test('group and type lookups', () => {
  assert.equal(findGroup('sign').label, 'งานป้าย');
  assert.equal(findGroup('other').label, OTHER_GROUP.label);
  assert.equal(findGroup('nope'), null);
  assert.equal(findType('vinyl').label, 'ป้ายไวนิล');
  assert.equal(findType('nope'), null);
});

test('every group and type has an id, label, icon — and unique ids', () => {
  const groupIds = new Set();
  const typeIds = new Set();
  for (const g of CATEGORY_GROUPS) {
    assert.ok(g.id && g.label && g.icon && g.color, `group ${g.id} incomplete`);
    assert.ok(!groupIds.has(g.id), `duplicate group id ${g.id}`);
    groupIds.add(g.id);
    for (const t of g.types) {
      assert.ok(t.id && t.label && t.icon && t.keys.length, `type ${t.id} incomplete`);
      // The picker shows this to a shop owner, so it must read as a
      // description, never as the keyword list used for matching.
      assert.ok(t.hint, `type ${t.id} has no hint`);
      assert.ok(!t.keys.includes(t.hint), `type ${t.id} hint looks like a keyword`);
      assert.ok(!typeIds.has(t.id), `duplicate type id ${t.id}`);
      typeIds.add(t.id);
    }
  }
});

test('job headings and item icons', () => {
  assert.equal(deriveJobName([{ item_name: 'ป้ายไวนิล' }, { item_name: 'โฟมบอร์ด' }]), 'งานป้าย / ป้ายไวนิล');
  assert.equal(deriveJobName([{ item_name: 'ถ่ายเอกสาร' }]), 'งานพิมพ์ / ถ่ายเอกสาร');
  assert.equal(deriveJobName([{ item_name: 'ของแปลก' }]), 'ของแปลก');
  assert.equal(deriveJobName([{ item_name: 'ของแปลก' }, { item_name: 'อีกอัน' }]), 'ของแปลก +1 รายการ');
  assert.equal(deriveJobName([]), null);

  assert.equal(guessCategory([{ item_name: 'ป้ายไวนิล' }]).groupLabel, 'งานป้าย');
  assert.equal(guessCategory([{ item_name: 'ของแปลก' }]), null);
  assert.equal(itemIcon('สติ๊กเกอร์'), '🏷️');
  assert.equal(itemIcon('อะไรก็ไม่รู้'), '📦');
});
