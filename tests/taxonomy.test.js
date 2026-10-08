import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORY_GROUPS, OTHER_GROUP, BASE_TAXONOMY, resetTaxonomies } from '../src/utils/category.js';
import {
  LIMITS,
  PALETTE,
  emptyConfig,
  cleanKeys,
  allocateCode,
  nextColor,
  buildTaxonomy,
  editorModel,
  effective,
  normalizeConfig,
  parseNewCategoryName,
  addCustomGroup,
} from '../src/utils/taxonomy.js';

/* ร้านขอ "แก้ไขหมวดงานเองได้ เพราะมันจะมีเพิ่มเติม"
 *
 * ชุดหมวดของระบบเป็นแค่จุดเริ่ม — ร้านเปลี่ยนชื่อ ซ่อน เพิ่มหมวด/ประเภท และเพิ่มคำค้นเองได้
 * เทสต์ทั้งหมดทำเหมือนที่หน้าแก้ไขทำ: ขอโมเดลที่แก้ได้ → แก้ → ส่งกลับให้ตรวจ
 */

afterEach(() => resetTaxonomies());

// สิ่งที่หน้าแก้ไขทำ: เอาโมเดลมาแก้แล้วส่งทั้งรายการกลับไป
function edit(config, mutate) {
  const groups = editorModel(config).groups.map((g) => ({ ...g, types: g.types.map((t) => ({ ...t })) }));
  mutate(groups);
  return normalizeConfig({ groups }, config);
}
const must = (r) => {
  assert.ok(r.ok, r.message || 'ควรบันทึกได้');
  return r.config;
};
const group = (groups, id) => groups.find((g) => g.id === id);
const NEW_GROUP = (over = {}) => ({ id: '', label: 'แก้วสกรีน', icon: '🥤', color: '', keys: [], types: [], ...over });

// ---------------------------------------------------------------------------

test('ยังไม่เคยแก้อะไร = ชุดตั้งต้นของระบบทุกอย่าง (ไม่มีอะไรเปลี่ยนจากเดิม)', () => {
  for (const config of [null, undefined, emptyConfig(), { v: 1, groups: [] }]) {
    const tax = buildTaxonomy(config);
    assert.deepEqual(tax.groups.map((g) => g.id), CATEGORY_GROUPS.map((g) => g.id));
    assert.equal(tax.other.label, OTHER_GROUP.label);
    for (const item of ['ตรายาง ชื่อร้าน', 'ป้ายไวนิล 60x100', 'สติ๊กเกอร์ฟิวเจอร์บอร์ด', 'ถ่ายเอกสาร 10 แผ่น', 'ค่าน้ำมัน ปั๊มบางจาก']) {
      assert.deepEqual(
        [tax.classifyItem(item)?.group.id, tax.classifyItem(item)?.type?.id],
        [BASE_TAXONOMY.classifyItem(item)?.group.id, BASE_TAXONOMY.classifyItem(item)?.type?.id],
        item
      );
    }
  }
});

test('เปลี่ยนชื่อ ไอคอน สี ของหมวดตั้งต้น — ชื่อเดิมเก็บไว้ให้กด "คืนค่าเดิม"', () => {
  const config = must(
    edit(null, (gs) => {
      Object.assign(group(gs, 'print'), { label: 'งานปริ้นท์', icon: '🖨', color: '#112233' });
    })
  );
  assert.deepEqual(config.groups[0], { id: 'print', label: 'งานปริ้นท์', icon: '🖨', color: '#112233' });

  const tax = buildTaxonomy(config);
  const g = tax.findGroup('print');
  assert.deepEqual([g.label, g.icon, g.color], ['งานปริ้นท์', '🖨', '#112233']);
  assert.deepEqual(g.types.map((t) => t.id), ['copy', 'print', 'binding', 'scan'], 'ประเภทข้างในไม่หาย');

  const m = group(editorModel(config).groups, 'print');
  assert.deepEqual(m.base, { label: 'งานพิมพ์', icon: '🖨️', color: '#A78BFA' });
});

test('เก็บเฉพาะสิ่งที่ร้านแก้ — หมวดที่ไม่ได้แตะตามระบบไปเรื่อย ๆ ไม่ถูกแช่แข็ง', () => {
  const config = must(edit(null, () => {}));
  for (const g of config.groups) {
    assert.deepEqual(Object.keys(g), ['id'], `${g.id} ไม่ควรมีอะไรนอกจาก id`);
  }
  // ชื่อที่ร้านไม่ได้แก้ ถ้าระบบเปลี่ยนชื่อทีหลัง ก็ต้องตามระบบ — ไม่มี label เก็บอยู่ให้ทับ
  assert.ok(!JSON.stringify(config).includes('งานพิมพ์'));
});

test('ซ่อนหมวด: ไม่เสนอให้เลือก ไม่จัดงานใหม่เข้าไป แต่งานเก่ายังโชว์ชื่อหมวดถูก', () => {
  const tax = buildTaxonomy(
    must(
      edit(null, (gs) => {
        group(gs, 'stamp').hidden = true;
      })
    )
  );
  assert.ok(!tax.groups.some((g) => g.id === 'stamp'), 'ไม่อยู่ในรายการให้เลือก');
  assert.ok(tax.allGroups.some((g) => g.id === 'stamp'), 'แต่ยังอยู่ในชุดทั้งหมด');
  assert.equal(tax.classifyItem('ตรายาง ชื่อร้าน'), null, 'งานใหม่ไม่ถูกจัดเข้าหมวดที่ซ่อน');
  // งานที่จดไว้ก่อนหน้า
  const old = { category: 'stamp', category_type: 'stamp' };
  assert.equal(tax.categoryLabel(old), 'ตรายาง');
  assert.equal(tax.jobCategory(old).group.id, 'stamp');
});

test('ซ่อนประเภท: งานเก่าในประเภทนั้นยังโชว์ถูก แต่ไม่ถูกเสนอและไม่จับคำ', () => {
  const tax = buildTaxonomy(
    must(
      edit(null, (gs) => {
        group(gs, 'print').types.find((t) => t.id === 'scan').hidden = true;
      })
    )
  );
  assert.ok(!tax.findGroup('print').types.some((t) => t.id === 'scan'), 'ไม่อยู่ในประเภทที่เสนอ');
  assert.equal(tax.findType('scan').label, 'สแกนเอกสาร', 'แต่ยังหาเจอ');
  assert.equal(tax.classifyItem('สแกนเอกสาร 5 หน้า'), null);
  assert.equal(tax.categoryLabel({ category: 'print', category_type: 'scan' }), 'งานพิมพ์ / สแกนเอกสาร');
});

test('เพิ่มหมวดของร้านเอง: ได้ id รหัสเลขงาน และสีให้เอง', () => {
  const config = must(
    edit(null, (gs) => {
      gs.splice(gs.length - 1, 0, NEW_GROUP({ keys: 'แก้วสกรีน, แก้วน้ำ' }));
    })
  );
  const mine = config.groups.find((g) => g.custom);
  assert.match(mine.id, /^c_[a-z0-9]{6}$/);
  assert.equal(mine.code, 'XAA');
  assert.equal(mine.label, 'แก้วสกรีน');
  assert.equal(mine.icon, '🥤');
  assert.ok(PALETTE.includes(mine.color), 'สีมาจากชุดสีของหน้าแก้ไข');
  assert.deepEqual(mine.keys, ['แก้วสกรีน', 'แก้วน้ำ']);

  const tax = buildTaxonomy(config);
  assert.equal(tax.classifyItem('แก้วสกรีน 12 ใบ').group.id, mine.id, 'พิมพ์ชื่อของที่ตั้งไว้ → จัดเข้าหมวดใหม่');
  assert.equal(tax.categoryFields([{ item_name: 'แก้วน้ำ 50 ใบ' }]).category, mine.id);
  assert.equal(tax.deriveJobName([{ item_name: 'แก้วสกรีน 12 ใบ' }]), 'แก้วสกรีน');
  assert.equal(tax.itemIcon('แก้วสกรีน'), '🥤');
});

test('หมวดใหม่ไม่ได้ใส่คำค้น: ยังเลือกเองได้ และงานเก่าโชว์ชื่อถูก', () => {
  const config = must(edit(null, (gs) => gs.splice(gs.length - 1, 0, NEW_GROUP({ label: 'งานบุญ' }))));
  const mine = config.groups.find((g) => g.custom);
  const tax = buildTaxonomy(config);
  assert.ok(tax.groups.some((g) => g.id === mine.id));
  assert.equal(tax.categoryLabel({ category: mine.id }), 'งานบุญ');
  assert.equal(tax.classifyItem('ผ้าป่า'), null, 'ไม่มีคำค้นก็ไม่จัดเองมั่ว');
});

test('คำที่ร้านตั้งเองชนะคำของระบบเมื่อซ้อนกัน', () => {
  // "สติ๊กเกอร์แก้ว" มีคำว่า สติ๊กเกอร์ ซึ่งเป็นของหมวดสติ๊กเกอร์ตั้งต้น
  const tax = buildTaxonomy(
    must(edit(null, (gs) => gs.splice(gs.length - 1, 0, NEW_GROUP({ keys: ['สติ๊กเกอร์แก้ว'] }))))
  );
  assert.equal(tax.classifyItem('สติ๊กเกอร์แก้ว 20 ดวง').group.label, 'แก้วสกรีน');
  assert.equal(tax.classifyItem('สติ๊กเกอร์ไดคัท').group.id, 'sticker', 'คำอื่นยังเข้าหมวดเดิม');
});

test('เพิ่มคำค้นให้ประเภทตั้งต้น: คำเดิมยังใช้ได้ คำใหม่ก็เข้า', () => {
  const config = must(
    edit(null, (gs) => {
      group(gs, 'print').types.find((t) => t.id === 'copy').keys = 'xerox\nซีร็อกซ์';
    })
  );
  const tax = buildTaxonomy(config);
  assert.equal(tax.classifyItem('xerox 10 แผ่น').type.id, 'copy');
  assert.equal(tax.classifyItem('ซีร็อกซ์ A4').type.id, 'copy');
  assert.equal(tax.classifyItem('ถ่ายเอกสาร').type.id, 'copy', 'คำตั้งต้นไม่หาย');
  assert.deepEqual(group(editorModel(config).groups, 'print').types[0].keys, ['xerox', 'ซีร็อกซ์']);
});

test('เพิ่มประเภทของร้านเองใต้หมวดตั้งต้น', () => {
  const config = must(
    edit(null, (gs) => {
      group(gs, 'print').types.push({ id: '', label: 'ทำปกรายงาน', icon: '📘', keys: ['ทำปก'] });
    })
  );
  const stored = group(config.groups, 'print').types[0];
  assert.match(stored.id, /^t_[a-z0-9]{6}$/);
  assert.equal(stored.custom, true);

  const tax = buildTaxonomy(config);
  const hit = tax.classifyItem('ทำปก รายงาน 5 เล่ม');
  assert.deepEqual([hit.group.id, hit.type.id], ['print', stored.id]);
  assert.equal(tax.categoryLabel({ category: 'print', category_type: stored.id }), 'งานพิมพ์ / ทำปกรายงาน');
});

test('เปลี่ยนลำดับ: หมวดที่ร้านลากไว้บนสุดอยู่บนสุดทุกที่', () => {
  const config = must(
    edit(null, (gs) => {
      const i = gs.findIndex((g) => g.id === 'stamp');
      gs.unshift(...gs.splice(i, 1));
    })
  );
  assert.equal(buildTaxonomy(config).groups[0].id, 'stamp');
  assert.equal(editorModel(config).groups[0].id, 'stamp');
  assert.equal(editorModel(config).groups.at(-1).id, 'other', 'งานทั่วไปอยู่ท้ายสุดเสมอ');
});

test('งานทั่วไป: เปลี่ยนชื่อได้ ซ่อนไม่ได้ ลบไม่ได้', () => {
  const config = must(
    edit(null, (gs) => {
      const other = group(gs, 'other');
      other.label = 'เบ็ดเตล็ด';
      other.hidden = true; // ส่งมาก็ไม่มีผล
    })
  );
  const tax = buildTaxonomy(config);
  assert.equal(tax.other.label, 'เบ็ดเตล็ด');
  assert.equal(tax.categoryFields([{ item_name: 'อะไรไม่รู้' }]).category, 'other');
  assert.equal(group(editorModel(config).groups, 'other').hidden, false);
  assert.equal(group(editorModel(config).groups, 'other').locked, true);

  // ไม่ส่งงานทั่วไปมาเลยก็ยังมีอยู่
  const noOther = normalizeConfig({ groups: editorModel(null).groups.filter((g) => g.id !== 'other') });
  assert.ok(noOther.ok);
  assert.equal(buildTaxonomy(noOther.config).other.id, 'other');
});

// --- กันข้อมูลเพี้ยน ----------------------------------------------------------

test('id ที่แต่งเองไม่ผ่าน: หมวดที่ไม่เคยมีอยู่จริงได้ id ใหม่จากระบบเสมอ', () => {
  const config = must(
    normalizeConfig({ groups: [{ id: 'c_zzzzzz', custom: true, code: 'ABC', label: 'ปลอม' }, { id: 'other' }] })
  );
  const mine = config.groups.find((g) => g.custom);
  assert.notEqual(mine.id, 'c_zzzzzz');
  assert.notEqual(mine.code, 'ABC', 'รหัสเลขงานจากหน้าเว็บไม่เอา ระบบออกให้เอง');
  assert.match(mine.code, /^X[A-Z]{2}$/);
});

test('รหัสเลขงานของหมวดเดิมไม่เปลี่ยน ไม่ว่าจะแก้อีกกี่รอบ', () => {
  const first = must(edit(null, (gs) => gs.splice(gs.length - 1, 0, NEW_GROUP({ label: 'แก้ว' }))));
  const a = first.groups.find((g) => g.custom);

  const second = must(
    edit(first, (gs) => {
      gs.splice(gs.length - 1, 0, NEW_GROUP({ label: 'เสื้อ' }));
      group(gs, a.id).label = 'แก้วน้ำ'; // เปลี่ยนชื่อ
      group(gs, a.id).code = 'ZZZ'; // พยายามแก้รหัส
    })
  );
  const a2 = group(second.groups, a.id);
  const b2 = second.groups.find((g) => g.custom && g.id !== a.id);
  assert.equal(a2.id, a.id, 'id เดิม');
  assert.equal(a2.code, a.code, 'รหัสเดิม');
  assert.equal(a2.label, 'แก้วน้ำ');
  assert.notEqual(b2.code, a.code, 'หมวดใหม่ไม่ได้รหัสชนกับของเดิม');
});

test('ชื่อซ้ำไม่ได้ — ทั้งชนกับหมวดตั้งต้นและชนกันเอง', () => {
  const dup = edit(null, (gs) => gs.splice(gs.length - 1, 0, NEW_GROUP({ label: 'งานพิมพ์' })));
  assert.equal(dup.ok, false);
  assert.match(dup.message, /งานพิมพ์.*ซ้ำ/);

  const twice = edit(null, (gs) => gs.splice(gs.length - 1, 0, NEW_GROUP({ label: 'ผ้า' }), NEW_GROUP({ label: ' ผ้า ' })));
  assert.equal(twice.ok, false, 'เว้นวรรคหัวท้ายไม่ทำให้รอดซ้ำ');

  const renamed = edit(null, (gs) => {
    group(gs, 'stamp').label = 'งานป้าย';
  });
  assert.equal(renamed.ok, false, 'เปลี่ยนไปใช้ชื่อเดียวกับหมวดอื่นก็ไม่ได้');

  const sameType = edit(null, (gs) => {
    group(gs, 'print').types.push({ id: '', label: 'สแกนเอกสาร' });
  });
  assert.equal(sameType.ok, false);
  assert.match(sameType.message, /สแกนเอกสาร.*ซ้ำ/);
});

test('หมวดใหม่/ประเภทใหม่ที่ไม่มีชื่อ บันทึกไม่ได้', () => {
  const g = edit(null, (gs) => gs.splice(gs.length - 1, 0, NEW_GROUP({ label: '   ' })));
  assert.equal(g.ok, false);
  assert.match(g.message, /ต้องมีชื่อ/);

  const t = edit(null, (gs) => group(gs, 'sign').types.push({ id: '', label: '' }));
  assert.equal(t.ok, false);
  assert.match(t.message, /ต้องมีชื่อ/);

  // หมวดตั้งต้นที่ลบชื่อทิ้ง = กลับไปใช้ชื่อเดิม ไม่ใช่ชื่อว่าง
  const blank = must(edit(null, (gs) => (group(gs, 'sign').label = '')));
  assert.equal(buildTaxonomy(blank).findGroup('sign').label, 'งานป้าย');
});

test('ขีดจำกัด: ชื่อยาวเกินถูกตัด รายการเกินถูกปฏิเสธ', () => {
  const long = must(edit(null, (gs) => gs.splice(gs.length - 1, 0, NEW_GROUP({ label: 'ก'.repeat(100) }))));
  assert.equal(Array.from(long.groups.find((g) => g.custom).label).length, LIMITS.label);

  const tooMany = edit(null, (gs) => {
    for (let i = 0; i < LIMITS.groups; i += 1) gs.splice(gs.length - 1, 0, NEW_GROUP({ label: `หมวด ${i}` }));
  });
  assert.equal(tooMany.ok, false);
  assert.match(tooMany.message, /มากเกินไป/);

  const manyTypes = edit(null, (gs) => {
    for (let i = 0; i < LIMITS.typesPerGroup + 1; i += 1) group(gs, 'sign').types.push({ id: '', label: `แบบ ${i}` });
  });
  assert.equal(manyTypes.ok, false);

  assert.equal(normalizeConfig(null).ok, false);
  assert.equal(normalizeConfig({}).ok, false);
  assert.equal(normalizeConfig({ groups: 'x' }).ok, false);
});

test('ข้อมูลในฐานข้อมูลเพี้ยน ก็ไม่ทำให้ระบบล่ม', () => {
  const messy = {
    groups: [
      null,
      5,
      'print',
      { id: 7 },
      { id: 'c_bad', custom: true, label: 'สั้นไป' },
      { id: 'print', types: 'oops', label: 123 },
      { id: 'sign', types: [null, { id: 3 }, { id: 'vinyl', label: 'ไวนิลพิเศษ', keys: 5 }] },
      { id: 'c_abc123', custom: true, label: 'ของจริง', types: [{ id: 'x', label: 'id ไม่ใช่ t_' }] },
    ],
  };
  const tax = buildTaxonomy(messy);
  assert.ok(CATEGORY_GROUPS.every((g) => tax.findGroup(g.id)), 'หมวดตั้งต้นครบ');
  assert.equal(tax.findType('vinyl').label, 'ไวนิลพิเศษ');
  assert.equal(tax.findGroup('c_abc123').label, 'ของจริง');
  assert.equal(tax.findGroup('c_abc123').types.length, 0, 'ประเภทที่ id ไม่ได้มาจากระบบไม่เอา');
  assert.equal(tax.findGroup('c_bad'), null);
  assert.doesNotThrow(() => editorModel(messy));
});

// --- ลบ -----------------------------------------------------------------------

test('บอกว่าร้านลบอะไรไป — ให้ชั้นบนตรวจว่ายังมีงานใช้อยู่ไหม', () => {
  const withGroup = must(
    edit(null, (gs) => {
      gs.splice(gs.length - 1, 0, NEW_GROUP({ label: 'แก้ว', types: [{ id: '', label: 'แก้วพลาสติก' }] }));
      group(gs, 'print').types.push({ id: '', label: 'ทำปก' });
    })
  );
  const g = withGroup.groups.find((x) => x.custom);
  const gType = g.types[0].id;
  const pType = group(withGroup.groups, 'print').types[0].id;

  const removedType = normalizeConfig(
    { groups: editorModel(withGroup).groups.map((x) => (x.id === 'print' ? { ...x, types: x.types.filter((t) => t.id !== pType) } : x)) },
    withGroup
  );
  assert.deepEqual(removedType.removed, { groupIds: [], typeIds: [pType] });

  const removedGroup = normalizeConfig({ groups: editorModel(withGroup).groups.filter((x) => x.id !== g.id) }, withGroup);
  assert.deepEqual(removedGroup.removed.groupIds, [g.id]);
  assert.ok(removedGroup.removed.typeIds.includes(gType), 'ประเภทใต้หมวดที่ถูกลบก็ถูกลบด้วย');

  const none = normalizeConfig({ groups: editorModel(withGroup).groups }, withGroup);
  assert.deepEqual(none.removed, { groupIds: [], typeIds: [] });
});

test('หมวดตั้งต้นลบไม่ได้ — ไม่ส่งมาก็ยังอยู่ (ต้องกด "ซ่อน")', () => {
  const r = normalizeConfig({ groups: editorModel(null).groups.filter((g) => g.id !== 'stamp') });
  const tax = buildTaxonomy(must(r));
  assert.ok(tax.findGroup('stamp'), 'ยังอยู่');
  assert.equal(tax.categoryLabel({ category: 'stamp' }), 'ตรายาง');
});

// --- เครื่องมือย่อย ---------------------------------------------------------------

test('cleanKeys: รับข้อความหรืออาร์เรย์ ตัดคำสั้น คำซ้ำ และตัวพิมพ์', () => {
  assert.deepEqual(cleanKeys('แก้ว, แก้วน้ำ\nก\n  แก้ว  \nCup'), ['แก้ว', 'แก้วน้ำ', 'cup']);
  assert.deepEqual(cleanKeys(['  ตรา  ยาง ', 'ตรา ยาง', 'x']), ['ตรา ยาง']);
  assert.deepEqual(cleanKeys(null), []);
  assert.deepEqual(cleanKeys(42), []);
  assert.equal(cleanKeys(Array.from({ length: 50 }, (_, i) => `คำที่ ${i}`)).length, LIMITS.keys);
  assert.equal(cleanKeys(['ก'.repeat(200)])[0].length, LIMITS.keyLength);
});

test('allocateCode: ขึ้นต้น X ไม่ชนหมวดตั้งต้น ไม่ซ้ำ และไม่รีไซเคิลของที่ใช้อยู่', () => {
  assert.equal(allocateCode(new Set()), 'XAA');
  assert.equal(allocateCode(new Set(['XAA'])), 'XAB');
  assert.equal(allocateCode(new Set(['XAA', 'XAB', 'XAC'])), 'XAD');
  const row = new Set(Array.from({ length: 26 }, (_, j) => 'XA' + String.fromCharCode(65 + j)));
  assert.equal(allocateCode(row), 'XBA');
  const all = new Set();
  for (let i = 0; i < 26; i += 1) for (let j = 0; j < 26; j += 1) all.add('X' + String.fromCharCode(65 + i) + String.fromCharCode(65 + j));
  assert.equal(allocateCode(all), null, 'หมดแล้วคืน null ไม่ใช่รหัสซ้ำ');
});

test('nextColor: เลือกสีที่ยังไม่มีหมวดไหนใช้ก่อน', () => {
  assert.equal(nextColor([]), PALETTE[0]);
  assert.equal(nextColor([PALETTE[0].toLowerCase()]), PALETTE[1]);
  assert.equal(nextColor(PALETTE.slice(0, 3)), PALETTE[3]);
  assert.ok(PALETTE.includes(nextColor(PALETTE)), 'ใช้หมดแล้วก็วนกลับ');
});

test('effective: สีเสียหรือไอคอนว่างใช้ค่าตั้งต้น', () => {
  const { groups } = effective({ groups: [{ id: 'print', color: 'red', icon: '   ', label: '  ' }] });
  const print = groups.find((g) => g.id === 'print');
  assert.deepEqual([print.color, print.icon, print.label], ['#A78BFA', '🖨️', 'งานพิมพ์']);
  assert.equal(groups[0].id, 'print');
});

test('editorModel: มีทุกอย่างที่หน้าแก้ไขต้องใช้', () => {
  const m = editorModel(null);
  assert.deepEqual(m.groups.map((g) => g.id), [...CATEGORY_GROUPS.map((g) => g.id), 'other']);
  assert.equal(m.limits.groups, LIMITS.groups);
  assert.deepEqual(m.palette, PALETTE);
  const print = group(m.groups, 'print');
  assert.equal(print.code, 'PRN');
  assert.equal(print.custom, false);
  assert.deepEqual(print.types[0], {
    id: 'copy', label: 'ถ่ายเอกสาร', icon: '📄', hidden: false, custom: false, keys: [],
    builtinKeys: ['ถ่ายเอกสาร', 'ถ่ายเอก', 'copy'], base: { label: 'ถ่ายเอกสาร', icon: '📄' },
  });
  assert.equal(group(m.groups, 'other').locked, true);
});

test('parseNewCategoryName: อีโมจิหน้าชื่อเป็นไอคอน', () => {
  assert.deepEqual(parseNewCategoryName('🥤 แก้วสกรีน'), { label: 'แก้วสกรีน', icon: '🥤' });
  assert.deepEqual(parseNewCategoryName('🥤แก้วสกรีน'), { label: 'แก้วสกรีน', icon: '🥤' });
  assert.deepEqual(parseNewCategoryName('แก้วสกรีน'), { label: 'แก้วสกรีน', icon: '📦' });
  assert.deepEqual(parseNewCategoryName('  แก้ว   สกรีน  '), { label: 'แก้ว สกรีน', icon: '📦' });
  assert.equal(parseNewCategoryName(''), null);
  assert.equal(parseNewCategoryName('   '), null);
  assert.equal(parseNewCategoryName('🥤'), null, 'มีแต่ไอคอนไม่มีชื่อ');
  assert.equal(parseNewCategoryName(null), null);
  assert.equal(Array.from(parseNewCategoryName('ก'.repeat(100)).label).length, LIMITS.label);
});

test('addCustomGroup: เพิ่มจากแชตต่อท้าย ก่อนงานทั่วไป และชนชื่อไม่ได้', () => {
  const r1 = addCustomGroup(null, { label: 'แก้วสกรีน', icon: '🥤', keys: ['แก้วสกรีน'] });
  assert.ok(r1.ok);
  const order = editorModel(r1.config).groups.map((g) => g.label);
  assert.equal(order.at(-1), 'งานทั่วไป');
  assert.equal(order.at(-2), 'แก้วสกรีน');
  assert.equal(buildTaxonomy(r1.config).classifyItem('แก้วสกรีน 10 ใบ').group.label, 'แก้วสกรีน');

  const r2 = addCustomGroup(r1.config, { label: 'เสื้อ' });
  assert.ok(r2.ok);
  assert.equal(r2.config.groups.filter((g) => g.custom).length, 2);
  assert.equal(r2.config.groups.find((g) => g.label === 'แก้วสกรีน').code, 'XAA', 'หมวดเดิมไม่เปลี่ยนรหัส');
  assert.equal(r2.config.groups.find((g) => g.label === 'เสื้อ').code, 'XAB');

  assert.equal(addCustomGroup(r2.config, { label: 'เสื้อ' }).ok, false, 'ชื่อซ้ำ');
  assert.equal(addCustomGroup(r2.config, { label: 'งานป้าย' }).ok, false, 'ชนหมวดตั้งต้น');
});
