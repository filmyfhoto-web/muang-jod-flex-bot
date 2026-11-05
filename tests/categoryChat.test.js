import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseAddCategory } from '../src/utils/categoryCommands.js';
import { resolveMenuCommand, suggestMenuCommand } from '../src/utils/menuCommands.js';
import { addCategory, NOT_READY_MESSAGE } from '../src/services/categoryService.js';
import { categoriesMessage, addedMessage, categoriesUrl } from '../src/actions/manageCategories.js';
import { resetTaxonomies, taxonomyOf, BASE_TAXONOMY } from '../src/utils/category.js';
import { addCustomGroup, buildTaxonomy, editorModel, normalizeConfig } from '../src/utils/taxonomy.js';

/* เพิ่มหมวดจากแชต — "เพิ่มหมวด 🥤 แก้วสกรีน" */

const handler = readFileSync(new URL('../src/handlers/messageHandler.js', import.meta.url), 'utf8');
const postback = readFileSync(new URL('../src/handlers/postbackHandler.js', import.meta.url), 'utf8');
const help = readFileSync(new URL('../src/actions/help.js', import.meta.url), 'utf8');

afterEach(() => resetTaxonomies());

test('เพิ่มหมวด <ชื่อ>: อ่านชื่อกับไอคอนออก', () => {
  assert.deepEqual(parseAddCategory('เพิ่มหมวด แก้วสกรีน'), { label: 'แก้วสกรีน', icon: '📦' });
  assert.deepEqual(parseAddCategory('เพิ่มหมวด 🥤 แก้วสกรีน'), { label: 'แก้วสกรีน', icon: '🥤' });
  assert.deepEqual(parseAddCategory('เพิ่มหมวดงาน 🥤แก้วสกรีน'), { label: 'แก้วสกรีน', icon: '🥤' });
  assert.deepEqual(parseAddCategory('สร้างหมวด เสื้อยืด'), { label: 'เสื้อยืด', icon: '📦' });
  assert.deepEqual(parseAddCategory('ตั้งหมวดใหม่ เสื้อยืด'), { label: 'เสื้อยืด', icon: '📦' });
  assert.deepEqual(parseAddCategory('เพิ่มหมวดใหม่: เสื้อยืด'), { label: 'เสื้อยืด', icon: '📦' });
  assert.deepEqual(parseAddCategory('หมวดใหม่ ของชำร่วย'), { label: 'ของชำร่วย', icon: '📦' });
  assert.deepEqual(parseAddCategory('ช่วยเพิ่มหมวด งานบุญ'), { label: 'งานบุญ', icon: '📦' });
  assert.deepEqual(parseAddCategory('  เพิ่มหมวด   แก้ว  สกรีน  '), { label: 'แก้ว สกรีน', icon: '📦' });
});

test('เพิ่มหมวด: คำสุภาพท้ายประโยคไม่เข้าไปเป็นชื่อหมวด', () => {
  assert.equal(parseAddCategory('เพิ่มหมวด แก้วสกรีน ด้วยค่ะ').label, 'แก้วสกรีน');
  assert.equal(parseAddCategory('เพิ่มหมวด แก้วสกรีนให้หน่อยนะคะ').label, 'แก้วสกรีน');
  assert.equal(parseAddCategory('ขอเพิ่มหมวด งานบุญ ครับ').label, 'งานบุญ');
});

test('ไม่ใช่คำสั่งเพิ่มหมวด: คำเดียวโดด ๆ / ข้อความจดงาน / หลายบรรทัด', () => {
  for (const t of [
    'เพิ่มหมวด',
    'เพิ่มหมวดงาน',
    'เพิ่มหมวด 🥤',
    'หมวดงาน',
    'เลือกหมวด',
    'ป้ายไวนิล 60x100 150 บาท',
    'ลูกค้าอยากเพิ่มหมวด',
    'เพิ่มรายการ แก้วสกรีน 300',
    'เพิ่มหมวด แก้ว\nป้ายไวนิล 150',
    '',
    null,
    undefined,
  ]) {
    assert.equal(parseAddCategory(t), null, JSON.stringify(t));
  }
});

test('คำสั่งในเมนู: เพิ่มหมวด/แก้ไขหมวด → หน้าจัดการหมวด; คำสั่งเดิมไม่เปลี่ยน', () => {
  for (const t of ['เพิ่มหมวด', 'เพิ่มหมวดงาน', 'แก้ไขหมวด', 'แก้ไขหมวดงาน', 'จัดการหมวด', 'ตั้งค่าหมวด', 'หมวดของร้าน', 'แก้ไขหมวดงานให้หน่อยค่ะ', '✏️ แก้ไขหมวด']) {
    assert.equal(resolveMenuCommand(t), 'manage_categories', t);
  }
  // คำที่มีอยู่แล้วต้องยังเป็นเหมือนเดิม ไม่ถูกดึงไปที่ใหม่
  for (const t of ['เลือกหมวด', 'หมวดงาน', 'เปลี่ยนหมวด']) {
    assert.equal(resolveMenuCommand(t), 'pick_category', t);
  }
  assert.equal(resolveMenuCommand('แก้ไขล่าสุด'), 'edit_latest');
  // คำสั่งที่มีชื่อต่อท้ายเป็นของ parseAddCategory ไม่ใช่เมนู
  assert.equal(resolveMenuCommand('เพิ่มหมวด แก้วสกรีน'), null);
  // ประโยคที่มีคำอยู่ข้างใน เสนอเป็นปุ่มถามกลับ ไม่สั่งทำเอง
  assert.equal(suggestMenuCommand('อยากเพิ่มหมวดใหม่ได้ไหม'), 'manage_categories');
});

test('ต่อสายถูกที่: ข้อความแชตจับ "เพิ่มหมวด" ก่อนอ่านเป็นงาน และ postback รู้จัก manage_categories', () => {
  const fn = handler.slice(handler.indexOf('export async function handleTextMessage'));
  const at = (needle) => {
    const i = fn.indexOf(needle);
    assert.ok(i > 0, `ไม่เจอ ${needle}`);
    return i;
  };
  assert.ok(at('parseAddCategory(text)') > at('resolveMenuCommand(text)'), 'เมนูตรงตัวมาก่อน');
  assert.ok(at('parseAddCategory(text)') < at('splitLeadingAddJob(text)'), 'ต้องมาก่อนการอ่านเป็นงาน');
  assert.ok(at('parseAddCategory(text)') < at('getState(profile.id)'), 'ใช้ได้ทุกสถานะ เหมือนคำสั่งเมนู');
  assert.match(handler, /addCategoryFromChat\(\{ replyToken, profile \}, newCategory\)/);
  assert.match(postback, /case 'manage_categories':\s*\n\s*return manageCategories\(ctx\)/);
  assert.match(help, /เพิ่มหมวด 🥤 แก้วสกรีน/);
  assert.match(help, /แก้ไขหมวด/);
});

// --- บันทึกลงชุดหมวดของร้าน ----------------------------------------------------------

function deps({ config = null, ready = true } = {}) {
  const saved = [];
  return {
    saved,
    loadCategoryConfig: async () => (ready ? { config } : null),
    saveCategoryConfig: async (u, c) => void saved.push([u, c]),
  };
}

test('addCategory: เพิ่มแล้วจดลงความจำทันที และชื่อหมวดเป็นคำค้นให้เอง', async () => {
  const d = deps();
  const out = await addCategory('chat-a', { label: 'แก้วสกรีน', icon: '🥤' }, d);
  assert.equal(out.ok, true);
  assert.equal(out.group.label, 'แก้วสกรีน');
  assert.equal(out.group.icon, '🥤');
  assert.equal(out.group.code, 'XAA');
  assert.equal(d.saved.length, 1);
  assert.deepEqual(out.group.keys, ['แก้วสกรีน']);

  const hit = taxonomyOf('chat-a').classifyItem('แก้วสกรีน 12 ชิ้น');
  assert.equal(hit.group.id, out.group.id, 'พิมพ์ชื่อหมวดแล้วเข้าหมวดทันที');
  assert.equal(taxonomyOf('chat-b'), BASE_TAXONOMY, 'ร้านอื่นไม่เห็น');
});

test('addCategory: เพิ่มต่อจากของเดิม ไม่ทับ — หมวดเดิมคงรหัสเลขงาน', async () => {
  const first = addCustomGroup(null, { label: 'แก้วสกรีน', icon: '🥤' }).config;
  const d = deps({ config: first });
  const out = await addCategory('chat-c', { label: 'เสื้อยืด', icon: '👕' }, d);
  assert.equal(out.ok, true);
  assert.equal(out.group.label, 'เสื้อยืด', 'ได้หมวดใหม่ ไม่ใช่หมวดเดิม');
  assert.equal(out.group.code, 'XAB');
  const kept = out.config.groups.find((g) => g.label === 'แก้วสกรีน');
  assert.equal(kept.code, 'XAA');
  assert.equal(kept.id, first.groups.find((g) => g.custom).id);
});

test('addCategory: ชื่อซ้ำ → 400 ไม่บันทึก · ตารางยังไม่มี → 503 พร้อมบอกให้รันไมเกรชัน', async () => {
  const d = deps();
  const dup = await addCategory('chat-d', { label: 'งานป้าย' }, d);
  assert.equal(dup.ok, false);
  assert.equal(dup.status, 400);
  assert.match(dup.message, /ซ้ำ/);
  assert.equal(d.saved.length, 0);

  const nt = await addCategory('chat-d', { label: 'แก้วสกรีน' }, deps({ ready: false }));
  assert.equal(nt.status, 503);
  assert.equal(nt.message, NOT_READY_MESSAGE);
  assert.match(nt.message, /019_category_settings\.sql/);
});

// --- ข้อความที่ตอบกลับ --------------------------------------------------------------------

test('การ์ดรายการหมวด: โชว์หมวดที่ใช้อยู่ ทำเครื่องหมายหมวดที่ร้านเพิ่ม บอกหมวดที่ซ่อน มีปุ่มไปหน้าแก้ไข', () => {
  const base = editorModel(null).groups.map((g) => ({ ...g, types: [] }));
  const r = normalizeConfig({
    groups: [
      ...base.slice(0, -1).map((g) => (g.id === 'stamp' ? { ...g, hidden: true } : g)),
      { id: '', label: 'แก้วสกรีน', icon: '🥤', keys: ['แก้วสกรีน'] },
      base.at(-1),
    ],
  });
  assert.ok(r.ok, r.message);
  const tax = buildTaxonomy(r.config);

  const msg = categoriesMessage(tax, 'https://liff.line.me/1234567890-abc/categories');
  const json = JSON.stringify(msg);
  assert.equal(msg.type, 'flex');
  assert.ok(json.includes('แก้วสกรีน'));
  assert.ok(json.includes('✨'), 'หมวดที่ร้านเพิ่มเองมีเครื่องหมาย');
  assert.ok(json.includes('ซ่อนอยู่: ตรายาง'), 'หมวดที่ซ่อนบอกไว้ท้ายการ์ด');
  assert.ok(json.includes('งานทั่วไป'));
  assert.ok(json.includes('"uri":"https://liff.line.me/1234567890-abc/categories"'));
  assert.ok(json.includes('เพิ่มหมวด 🥤 แก้วสกรีน'), 'บอกวิธีเพิ่มจากแชต');
  assert.ok(msg.contents.footer.contents[0].action.label.length <= 20);

  // ไม่มีลิงก์ให้เปิด = ไม่มีปุ่ม (ปุ่มลิงก์ว่างทำให้ LINE ปฏิเสธทั้งข้อความ)
  assert.equal(categoriesMessage(tax, null).contents.footer, undefined);
});

test('การ์ดรายการหมวด: หมวดเยอะเกินก็ไม่ยาวเกิน บอกว่ามีอีกกี่หมวด', () => {
  let config = null;
  for (let i = 0; i < 20; i += 1) config = addCustomGroup(config, { label: `หมวด ${i}` }).config;
  const json = JSON.stringify(categoriesMessage(buildTaxonomy(config), null));
  assert.match(json, /และอีก \d+ หมวด/);
});

test('ข้อความหลังเพิ่มหมวด: ยกตัวอย่างให้พิมพ์ตาม และมีปุ่มไปแก้ไขต่อ', () => {
  const msg = addedMessage({ label: 'แก้วสกรีน', icon: '🥤' }, 'https://liff.line.me/1234567890-abc/categories');
  assert.match(msg.text, /เพิ่มหมวด "🥤 แก้วสกรีน" แล้วค่ะ/);
  assert.match(msg.text, /"แก้วสกรีน 12 ชิ้น 300"/);
  assert.equal(msg.quickReply.items[0].action.type, 'uri');
  assert.ok(msg.quickReply.items[0].action.label.length <= 20);
  assert.equal(addedMessage({ label: 'x', icon: '📦' }, null).quickReply, undefined);
});

test('ลิงก์หน้าแก้ไขหมวด: LIFF ก่อน ไม่มีก็ใช้ที่อยู่เว็บ ไม่มีทั้งคู่ = ไม่มี', () => {
  assert.equal(categoriesUrl({ LIFF_ID: '1234567890-abcdefgh' }), 'https://liff.line.me/1234567890-abcdefgh/categories');
  assert.equal(categoriesUrl({ PUBLIC_BASE_URL: 'https://shop.example.com/' }), 'https://shop.example.com/app/categories/');
  assert.equal(categoriesUrl({}), null);
});
