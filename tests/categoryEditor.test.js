import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { categoryGroupsFlex, categoryTypesFlex, categoryBrowseFlex } from '../src/flex/categoryPickerFlex.js';
import { BASE_TAXONOMY } from '../src/utils/category.js';
import { normalizeConfig, editorModel, buildTaxonomy } from '../src/utils/taxonomy.js';

/* ตัวเลือกหมวดในแชต + หน้าแก้ไขหมวด ต้องเห็นหมวดที่ร้านตั้งเอง และไม่เห็นหมวดที่ซ่อน */

const editor = readFileSync(new URL('../public/liff/categories/index.html', import.meta.url), 'utf8');
const dash = readFileSync(new URL('../public/liff/index.html', import.meta.url), 'utf8');

function shopTaxonomy() {
  const base = editorModel(null).groups.map((g) => ({ ...g, types: g.types.map((t) => ({ ...t })) }));
  const groups = base.map((g) => {
    if (g.id === 'stamp') return { ...g, hidden: true };
    if (g.id === 'sign') return { ...g, label: 'ป้ายและโฆษณา', types: g.types.map((t) => (t.id === 'banner' ? { ...t, hidden: true } : t)) };
    if (g.id === 'print') return { ...g, types: [...g.types, { id: '', label: 'ทำปกรายงาน', icon: '📘', keys: ['ทำปก'] }] };
    return g;
  });
  groups.splice(groups.length - 1, 0, { id: '', label: 'แก้วสกรีน', icon: '🥤', keys: ['แก้วสกรีน'], types: [] });
  const r = normalizeConfig({ groups });
  assert.ok(r.ok, r.message);
  const tax = buildTaxonomy(r.config);
  return { tax, mine: tax.groups.find((g) => g.custom) };
}

test('ตัวเลือกหมวดในแชต: โชว์หมวดที่ร้านเพิ่ม ใช้ชื่อที่ร้านตั้ง ไม่โชว์ที่ซ่อน', () => {
  const { tax, mine } = shopTaxonomy();
  const json = JSON.stringify(categoryGroupsFlex('job-1', tax));

  assert.ok(json.includes('แก้วสกรีน'));
  assert.ok(json.includes(`action=pick_category&group=${mine.id}&jobId=job-1`));
  assert.ok(json.includes('ป้ายและโฆษณา'), 'ชื่อที่ร้านเปลี่ยน');
  assert.ok(!json.includes('งานป้าย'), 'ไม่เหลือชื่อเดิม');
  assert.ok(!json.includes('group=stamp'), 'หมวดที่ซ่อนไม่ขึ้นให้เลือก');
  assert.ok(json.includes('group=other'), 'งานทั่วไปยังอยู่');

  // ไม่ส่งชุดหมวดมา = ชุดตั้งต้นเหมือนเดิม
  const base = JSON.stringify(categoryGroupsFlex('job-1'));
  assert.ok(base.includes('group=stamp'));
  assert.equal(base, JSON.stringify(categoryGroupsFlex('job-1', BASE_TAXONOMY)));
});

test('ตัวเลือกประเภท: หมวดที่ร้านเพิ่มเองเลือกได้ทั้งหมวด ประเภทที่เพิ่มขึ้นให้เลือก ที่ซ่อนไม่ขึ้น', () => {
  const { tax, mine } = shopTaxonomy();

  const own = JSON.stringify(categoryTypesFlex(mine.id, 'job-1', tax));
  assert.ok(own.includes(`action=pick_category&group=${mine.id}&type=&jobId=job-1`), 'ไม่มีประเภทย่อย = เลือกทั้งหมวด');
  assert.ok(own.includes('ไม่ต้องระบุหมวดย่อย'));

  const print = JSON.stringify(categoryTypesFlex('print', 'job-1', tax));
  const custom = tax.findGroup('print').types.find((t) => t.custom);
  assert.ok(print.includes('ทำปกรายงาน'));
  assert.ok(print.includes(`group=print&type=${custom.id}&jobId=job-1`));

  const sign = JSON.stringify(categoryTypesFlex('sign', 'job-1', tax));
  assert.ok(sign.includes('ป้ายไวนิล'));
  assert.ok(!sign.includes('แบนเนอร์'), 'ประเภทที่ซ่อนไม่ขึ้นให้เลือก');

  // postback ของ LINE ยาวได้ไม่เกิน 300 ตัวอักษร
  for (const m of JSON.stringify(categoryGroupsFlex('0123456789abcdef0123456789abcdef0123', tax)).matchAll(/"data":"([^"]+)"/g)) {
    assert.ok(m[1].length <= 300, m[1]);
  }
});

test('เมนูดูงานตามหมวด: หมวดใหม่เข้าลิงก์ได้ หมวดที่ซ่อนไม่ขึ้น', () => {
  const { tax, mine } = shopTaxonomy();
  const flex = categoryBrowseFlex((id) => `https://liff.example/?category=${id}`, tax);
  const json = JSON.stringify(flex);
  assert.ok(json.includes(`category=${mine.id}`));
  assert.ok(json.includes('แก้วสกรีน'));
  assert.ok(!json.includes('category=stamp'));
  assert.ok(json.includes('category=other'));
});

// --- หน้าแก้ไข -------------------------------------------------------------------

test('หน้าแก้ไขหมวด: มีของที่ต้องใช้ครบ และคุยกับ API เส้นทางเดียวกับที่เซิร์ฟเวอร์มี', () => {
  for (const id of ['list', 'add-group', 'save', 'save-note', 'not-ready', 'back']) {
    assert.ok(editor.includes(`id="${id}"`), `ไม่มี #${id}`);
  }
  assert.match(editor, /api\('\/categories'\)/, 'อ่านด้วย GET');
  assert.match(editor, /api\('\/categories', \{ method: 'PUT'/, 'บันทึกด้วย PUT');
  assert.match(editor, /liff\.init\(/);
  assert.match(editor, /Authorization: 'Bearer '/);
});

test('หน้าแก้ไขหมวด: ชื่อหมวดเป็นของที่ร้านพิมพ์เอง ห้ามเอาไปเขียนเป็น HTML', () => {
  // innerHTML ใช้ได้เฉพาะข้อความตายตัวกับข้อความผิดพลาดที่ล้างแล้วตอนเปิดหน้าไม่ได้
  const uses = editor.split('\n').filter((l) => l.includes('innerHTML'));
  assert.ok(uses.length <= 2, uses.join('\n'));
  for (const l of uses) assert.match(l, /document\.body\.innerHTML = /);
  assert.ok(!/\.insertAdjacentHTML|document\.write\(/.test(editor));
  assert.match(editor, /el\.append\(kid\.nodeType \? kid : document\.createTextNode\(String\(kid\)\)\)/, 'ข้อความทุกอันผ่าน createTextNode');
});

test('หน้าแก้ไขหมวด: id ชั่วคราวของหมวด/ประเภทใหม่ไม่ถูกส่งไปเซิร์ฟเวอร์ (ให้เซิร์ฟเวอร์ออก id จริง)', () => {
  assert.match(editor, /id: String\(g\.id\)\.startsWith\('new-'\) \? '' : g\.id/);
  assert.match(editor, /id: String\(t\.id\)\.startsWith\('new-'\) \? '' : t\.id/);
});

test('หน้าแก้ไขหมวด: ปุ่มกลับพาไปที่ตั้งค่าด้วยที่อยู่เต็ม (เปิดจาก LIFF ที่ไม่มีสแลชท้ายก็ไม่หลง)', () => {
  assert.match(editor, /location\.href = '\/app\/\?tab=settings'/);
  assert.ok(!/location\.href = '\.\.?\//.test(editor));
  assert.match(editor, /confirm\('ยังไม่ได้บันทึก/, 'กลับทั้งที่ยังไม่บันทึก ต้องถามก่อน');
});

test('หน้าแก้ไขหมวด: งานทั่วไปเลื่อน/ซ่อน/ลบไม่ได้ ส่วนหมวดตั้งต้นลบไม่ได้ (มีแต่ซ่อน)', () => {
  assert.match(editor, /if \(!g\.locked\) \{/, 'ส่วนคำค้น/ประเภท/ซ่อน/ลบ ไม่ขึ้นให้งานทั่วไป');
  assert.match(editor, /g\.custom \? h\('button', \{ type: 'button', class: 'btn danger'/, 'ปุ่มลบมีเฉพาะหมวดที่ร้านเพิ่มเอง');
  assert.match(editor, /const del = t\.custom \?/, 'ลบประเภทได้เฉพาะที่ร้านเพิ่มเอง');
});

test('แดชบอร์ด: มีทางเข้าหน้าแก้ไขหมวดจากตั้งค่า และซ่อนหมวดที่ร้านซ่อน', () => {
  assert.match(dash, /\$\('s-cats'\)\.onclick = \(\) => \(location\.href = '\/app\/categories\/'\)/);
  assert.match(dash, /api\('\/categories'\)/, 'ดึงหมวดของร้านหลังล็อกอิน');
  assert.match(dash, /!x\.hidden|!g\.hidden/, 'ไม่เสนอหมวด/ประเภทที่ซ่อน');
});
