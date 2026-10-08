import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  BASE_TAXONOMY,
  registerTaxonomy,
  taxonomyOf,
  hasTaxonomy,
  resetTaxonomies,
  customCodeOf,
  customGroupIdOfCode,
  jobCategory,
  categoryLabel,
  classifyItem,
  categoryFields,
  deriveJobName,
  findGroup,
} from '../src/utils/category.js';
import { addCustomGroup, buildTaxonomy } from '../src/utils/taxonomy.js';
import { categoryCode, formatJobNumber, parseJobNumber, jobCode, auditCodes } from '../src/utils/jobNumber.js';
import { buildBook } from '../src/utils/customerBook.js';

/* ชุดหมวดของแต่ละร้านอยู่ในหน่วยความจำ — ทุกที่ที่โชว์ชื่อหมวดเรียกฟังก์ชันที่ไม่ต้องรอ
 * ร้านที่ไม่ได้แก้อะไรต้องเห็นพฤติกรรมเดิมทุกอย่าง และร้านที่แก้แล้วต้องเห็นของตัวเองทุกหน้า
 */

afterEach(() => resetTaxonomies());

function shop(label, keys = [label]) {
  const r = addCustomGroup(null, { label, icon: '🥤', keys });
  assert.ok(r.ok, r.message);
  const tax = buildTaxonomy(r.config);
  const mine = tax.allGroups.find((g) => g.custom);
  return { tax, group: mine, config: r.config };
}

test('ไม่มีร้านไหนแก้อะไร: ทุกฟังก์ชันตอบเหมือนชุดตั้งต้น', () => {
  assert.equal(taxonomyOf('nobody'), BASE_TAXONOMY);
  assert.equal(taxonomyOf(undefined), BASE_TAXONOMY);
  assert.equal(hasTaxonomy('nobody'), false);
  assert.equal(classifyItem('ตรายาง').group.id, 'stamp');
  assert.equal(categoryLabel({ category: 'sign', category_type: 'vinyl' }), 'งานป้าย / ป้ายไวนิล');
});

test('ลงทะเบียน → ร้านนั้นเห็นหมวดของตัวเอง; ถอนออก → กลับเป็นชุดตั้งต้น', () => {
  const a = shop('แก้วสกรีน');
  registerTaxonomy('u1', a.tax);
  assert.equal(hasTaxonomy('u1'), true);
  assert.equal(taxonomyOf('u1'), a.tax);
  assert.equal(taxonomyOf('u2'), BASE_TAXONOMY, 'ร้านอื่นไม่เห็น');

  registerTaxonomy('u1', null);
  assert.equal(hasTaxonomy('u1'), false);
  assert.equal(taxonomyOf('u1'), BASE_TAXONOMY);

  registerTaxonomy('', a.tax); // ไม่มีเจ้าของ → ไม่จด
  assert.equal(hasTaxonomy(''), false);
});

test('งานที่ถือ user_id มา หาชุดหมวดของเจ้าของเอง ไม่ต้องไล่ส่ง userId ไปทุกการ์ด', () => {
  const a = shop('แก้วสกรีน');
  registerTaxonomy('u1', a.tax);
  registerTaxonomy('u2', shop('เสื้อยืด').tax);

  const job = { user_id: 'u1', category: a.group.id };
  assert.equal(categoryLabel(job), 'แก้วสกรีน');
  assert.equal(jobCategory(job).group.id, a.group.id);

  // ร้านอื่นเปิดงานของร้านนี้ไม่ได้อยู่แล้ว แต่ถ้ามาก็ไม่ล้ม — ตกไปเป็นงานทั่วไป
  assert.equal(categoryLabel({ user_id: 'u2', category: a.group.id }), 'งานทั่วไป');
  // ส่งเจ้าของมาตรง ๆ ก็ได้ ชนะ user_id ในงาน
  assert.equal(categoryLabel({ user_id: 'u2', category: a.group.id }, 'u1'), 'แก้วสกรีน');
  // หรือส่งชุดหมวดมาทั้งชุด
  assert.equal(categoryLabel({ category: a.group.id }, a.tax), 'แก้วสกรีน');
});

test('มีร้านเดียวที่แก้ไว้: ตัวแยกคำที่ไม่รู้ว่าใครพิมพ์ (nlParser, slots) ใช้ชุดของร้านนั้น', () => {
  const a = shop('แก้วสกรีน');
  registerTaxonomy('u1', a.tax);
  assert.equal(classifyItem('แก้วสกรีน 12 ใบ').group.id, a.group.id);
  assert.equal(categoryFields([{ item_name: 'แก้วสกรีน' }]).category, a.group.id);
  assert.equal(deriveJobName([{ item_name: 'แก้วสกรีน' }]), 'แก้วสกรีน');
  assert.equal(findGroup(a.group.id)?.label, 'แก้วสกรีน');
});

test('มีหลายร้านแก้ไว้: ตัวแยกคำที่ไม่รู้ว่าใครพิมพ์ รู้จักคำของทุกร้าน ไม่ปล่อยให้เป็น "ชื่อคน"', () => {
  const a = shop('แก้วสกรีน');
  const b = shop('เสื้อยืด');
  registerTaxonomy('u1', a.tax);
  registerTaxonomy('u2', b.tax);

  assert.equal(classifyItem('แก้วสกรีน 12 ใบ').group.label, 'แก้วสกรีน');
  assert.equal(classifyItem('เสื้อยืด 3 ตัว').group.label, 'เสื้อยืด');
  assert.equal(classifyItem('ตรายาง').group.id, 'stamp', 'ของระบบยังอยู่');

  // แต่ถ้ารู้ว่าใครถาม ได้เฉพาะของคนนั้น
  assert.equal(classifyItem('เสื้อยืด 3 ตัว', 'u1'), null);
  assert.equal(classifyItem('เสื้อยืด 3 ตัว', 'u2').group.label, 'เสื้อยืด');
});

test('รหัสเลขงานของหมวดที่ร้านเพิ่มเอง', () => {
  const a = shop('แก้วสกรีน');
  assert.equal(customCodeOf(a.group.id), null, 'ยังไม่ลงทะเบียน → ยังไม่รู้จัก');
  assert.equal(categoryCode(a.group.id), 'GEN', 'ไม่รู้จักก็ตกที่ GEN ไม่ใช่ undefined');

  registerTaxonomy('u1', a.tax);
  assert.equal(customCodeOf(a.group.id), 'XAA');
  assert.equal(customGroupIdOfCode('XAA'), a.group.id);
  assert.equal(customGroupIdOfCode('XZZ'), null);
  assert.equal(customCodeOf('print'), null, 'หมวดของระบบไม่ใช่ของร้าน');

  assert.equal(categoryCode(a.group.id), 'XAA');
  assert.equal(formatJobNumber(a.group.id, 7), 'MJ-XAA-0007');
  assert.deepEqual(parseJobNumber('MJ-XAA-0007'), { code: 'XAA', category: a.group.id, seq: 7 });
  assert.equal(jobCode({ user_id: 'u1', category: a.group.id }), 'XAA');
  assert.equal(parseJobNumber('MJ-XAB-0001').category, null, 'รหัสที่ไม่มีใครใช้อ่านได้แต่ไม่รู้หมวด');

  // หมวดของระบบเลขงานเหมือนเดิมทุกตัว
  assert.equal(formatJobNumber('stamp', 3), 'MJ-STP-0003');
  assert.deepEqual(parseJobNumber('MJ-STP-0003'), { code: 'STP', category: 'stamp', seq: 3 });
  assert.deepEqual(auditCodes(), { missing: [], duplicated: [] });
});

test('เปลี่ยนชื่อหมวดแล้ว เลขงานเก่ายังชี้หมวดเดิม (รหัสผูกกับหมวด ไม่ใช่กับชื่อ)', () => {
  const first = shop('แก้วสกรีน');
  registerTaxonomy('u1', first.tax);
  const before = formatJobNumber(first.group.id, 1);

  // เปลี่ยนชื่อหมวดเดียวกัน (id เดิม)
  const renamed = buildTaxonomy({
    groups: first.config.groups.map((g) => (g.id === first.group.id ? { ...g, label: 'แก้วพิมพ์ลาย' } : g)),
  });
  registerTaxonomy('u1', renamed);
  assert.equal(formatJobNumber(first.group.id, 1), before);
  assert.equal(parseJobNumber(before).category, first.group.id);
  assert.equal(categoryLabel({ user_id: 'u1', category: first.group.id }), 'แก้วพิมพ์ลาย');
});

test('สมุดลูกค้า: งานหน้าร้านจัดกลุ่มตามหมวดของร้านนั้น (ชื่อ ไอคอน สีที่ร้านตั้ง)', () => {
  const a = shop('แก้วสกรีน');
  registerTaxonomy('u1', a.tax);
  const job = (id, category) => ({
    id, user_id: 'u1', customer_name: '', category, job_name: 'x', job_date: '2026-09-30',
    status: 'active', total: 300, paid_amount: 300, balance_due: 0, created_at: '2026-09-30T08:00:00Z',
  });
  const book = buildBook([job('j1', a.group.id), job('j2', a.group.id), job('j3', 'stamp')]);
  const mine = book.walkins.find((c) => c.id === a.group.id);
  assert.deepEqual([mine.label, mine.icon, mine.jobCount, mine.total], ['แก้วสกรีน', '🥤', 2, 600]);
  assert.equal(mine.color, a.group.color);
  assert.equal(book.walkins.find((c) => c.id === 'stamp').label, 'ตรายาง');

  // หมวดที่ไม่มีใครรู้จัก (เช่น ถูกลบไปแล้วโดยตรงในฐานข้อมูล) ตกไปงานทั่วไป ไม่ล้ม
  const orphan = buildBook([job('j4', 'c_gone00')]);
  assert.equal(orphan.walkins[0].label, 'งานทั่วไป');
});
