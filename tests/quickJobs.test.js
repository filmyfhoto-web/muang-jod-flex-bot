import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { quickReplyBlock, defaultItems, quickJobItems } from '../src/flex/quickReply.js';
import { classifyJob, classifyItem, findType } from '../src/utils/category.js';
import { buildTaxonomy } from '../src/utils/taxonomy.js';

const jot = readFileSync(new URL('../public/liff/jot/script.js', import.meta.url), 'utf8');

/* แถบปุ่มงานมาจากหมวดของร้านเอง — ร้านขอ "อัพเดตและแก้ไขปุ่มงานด่วนให้เข้ากับ
 * หมวดงาน": ร้านแก้หมวดเองได้อยู่แล้ว แถบนี้ต้องไล่ตาม ไม่ใช่ลิสต์ตายตัวในไฟล์
 */

// ปุ่มงานไม่ต้องใช้ LIFF แล้ว (กดแล้วม่วงถามต่อในแชต) เหลือแค่ "หมวดงาน" ที่ต้อง
// ใช้ — tests/setup.js ตั้งใจไม่ตั้ง LIFF ไว้ ซึ่งเป็นเคสที่เทสต์ท้าย ๆ คุมอยู่
function withLiff(fn) {
  const had = process.env.LIFF_ID;
  process.env.LIFF_ID = '1234567890-AbCdEfGh';
  try {
    return fn();
  } finally {
    if (had === undefined) delete process.env.LIFF_ID;
    else process.env.LIFF_ID = had;
  }
}

test('แถบตั้งต้น = กระจกริชเมนู และปุ่มงานตามหมวดยังครบในชุดของการ์ดจดด่วน', () => {
  /* เดิมแถบตั้งต้นเป็นปุ่มงานตามหมวด + ลิงก์หมวดงาน — ร้านดูจอคอมแล้วสั่ง
   * (25 พ.ย. 69) "ฉันอยากให้เมนูแบบริชเมนู" จึงเปลี่ยนแถบเป็นเมนูหลักทั้งชุด
   * (postback ล้วน ใช้ได้ไม่ง้อ LIFF) ส่วนกติกาปุ่มงานตามหมวดถูกตรวจต่อที่
   * quickJobItems ตรง ๆ ซึ่งการ์ด "จดด่วน" ยังใช้อยู่เหมือนเดิม */
  const items = withLiff(() => quickReplyBlock().items);
  assert.ok(items.length <= 13, 'LINE รับได้ 13 ปุ่ม');
  for (const i of items) {
    assert.ok(i.action.label.length <= 20, `label too long (${i.action.label.length}): ${i.action.label}`);
    assert.equal(i.action.type, 'postback', `${i.action.label} ยังเด้งออกไปหน้าเว็บ`);
  }
  const data = items.map((i) => new URLSearchParams(i.action.data).get('action'));
  for (const a of ['add_job', 'recent_jobs', 'pending_payment', 'pick_category', 'create_bill', 'open_game', 'open_sign', 'open_dashboard', 'help']) {
    assert.ok(data.includes(a), `ปุ่มริชเมนูหาย: ${a}`);
  }

  // หกงานเดิมที่ร้านกดจริงยังอยู่ครบในชุดปุ่มงาน (ของการ์ดจดด่วน)
  const names = quickJobItems().map((i) => i.name);
  for (const want of ['กรอบรูป', 'ป้ายไวนิล', 'โฟมบอร์ด', 'สติ๊กเกอร์', 'สติ๊กเกอร์ฟิวเจอร์บอร์ด', 'ตรายาง']) {
    assert.ok(names.includes(want), `"${want}" หายไปจากชุดปุ่มงาน`);
  }
  // ชื่อที่ปุ่มส่งคือชื่อประเภทเต็ม ๆ — ทุกปุ่มต้องจัดหมวดเข้า "ประเภทของตัวเอง"
  for (const name of names) {
    const hit = classifyJob([{ item_name: name }]);
    assert.equal(hit?.type?.label, name, `"${name}" ไปลง ${hit?.type?.label || hit?.group?.label || 'งานทั่วไป'}`);
  }
});

test('แถบตามหมวดของร้านจริง: ประเภทที่ร้านตั้งเองนำหน้า และกดแล้วเข้าประเภทตัวเอง', () => {
  // config จริงของร้าน ณ วันที่เขียน (ย่อ): custom สองตัว + เปลี่ยนชื่อ sticker
  const tax = buildTaxonomy({
    v: 1,
    groups: [
      { id: 'print' },
      { id: 'sign', types: [{ id: 't_68f18a', icon: '🔹', label: 'ฟิวเจอร์บอร์ดสติ๊กเกอร์', custom: true }] },
      { id: 'stamp' },
      { id: 'sticker', types: [{ id: 'sticker', label: 'สติ๊กเกอร์งานสีดำ' }] },
      { id: 'photo', icon: '🧵', types: [{ id: 't_f1c063', icon: '📦', label: 'กรอบรูปงานสีดำ', custom: true }] },
      { id: 'design' },
      { id: 'shipping', hidden: true },
    ],
  });

  const items = quickJobItems(tax);
  assert.ok(items.length <= 12);
  for (const i of items) assert.ok(i.label.length <= 20, i.label);

  // ของที่ร้านเพิ่มเองขึ้นก่อนเสมอ — คือเหตุผลที่ร้านขอให้แถบ "เข้ากับหมวดงาน"
  assert.equal(items[0].name, 'ฟิวเจอร์บอร์ดสติ๊กเกอร์');
  assert.equal(items[1].name, 'กรอบรูปงานสีดำ');
  assert.match(items[1].label, /^📦 /, 'ไอคอนที่ร้านตั้งไม่ขึ้น');

  // ชื่อที่ร้านเปลี่ยนให้ประเภทเดิมก็ขึ้นแถบตามนั้น และหมวดที่ซ่อนไม่โผล่
  assert.ok(items.some((i) => i.name === 'สติ๊กเกอร์งานสีดำ'));
  assert.ok(!items.some((i) => i.name === 'ค่าจัดส่ง'), 'หมวดที่ซ่อนยังโผล่บนแถบ');

  // กดแล้วเข้า "ประเภทของตัวเอง" จริง ผ่านตัวจัดหมวดของร้านชุดเดียวกัน
  assert.equal(tax.classifyItem('ฟิวเจอร์บอร์ดสติ๊กเกอร์')?.type?.id, 't_68f18a');
  assert.equal(tax.classifyItem('กรอบรูปงานสีดำ')?.type?.id, 't_f1c063');
});

test('tapping a job button starts the conversation, not a form', () => {
  const json = withLiff(() => JSON.stringify(quickReplyBlock()));
  // แถบตั้งต้นเป็นกระจกริชเมนูแล้ว (25 พ.ย. 69) — ออกใบเสร็จจึง "ต้องอยู่" บนแถบ
  assert.ok(json.includes('create_bill'), 'ปุ่มออกใบเสร็จหายจากเมนู');
  assert.ok(!json.includes('/jot?quick=1'), 'ปุ่มงานยังเปิดฟอร์มอยู่');

  // และมีคนรับปุ่มนั้นจริง ๆ อยู่ปลายทาง
  const router = readFileSync(new URL('../src/handlers/postbackHandler.js', import.meta.url), 'utf8');
  const allowed = readFileSync(new URL('../src/utils/validation.js', import.meta.url), 'utf8');
  assert.match(router, /case 'quick_job':/);
  assert.match(allowed, /'quick_job'/, 'quick_job ไม่อยู่ในรายการที่อนุญาต');

  // ชื่อจากปุ่มตรวจด้วยตัวจัดหมวดจริง ไม่ใช่ลิสต์ตายตัว — data ปลอมมาได้ก็แค่
  // เท่ากับพิมพ์คำนั้นเอง ซึ่งไปได้ไกลสุดแค่เริ่มชุดคำถาม
  const action = readFileSync(new URL('../src/actions/quickJob.js', import.meta.url), 'utf8');
  assert.match(action, /const collecting = name \? startCollecting\(name\) : null/);
  assert.doesNotMatch(action, /QUICK_JOBS/, 'ยังพึ่งลิสต์ตายตัวอยู่');
});

test('a framed job lands in its own category, not in "everything else"', () => {
  // There was no กรอบรูป before, so this shop's own work — "รูปหน้างานพร้อมกรอบ"
  // — fell through to งานทั่วไป.
  assert.ok(findType('frame'), 'no กรอบรูป type');
  for (const name of ['กรอบรูป 8x10', 'รูปหน้างานพร้อมกรอบ', 'ใส่กรอบ A4']) {
    const hit = classifyJob([{ item_name: name }]);
    assert.equal(hit?.type.id, 'frame', `"${name}" was filed as ${hit?.type.label || 'งานทั่วไป'}`);
  }

  // And it must not have eaten the type next to it.
  assert.equal(classifyJob([{ item_name: 'อัดรูป 4x6' }])?.type.id, 'photo');
  assert.equal(classifyJob([{ item_name: 'ป้ายไวนิล 2x3' }])?.type.id, 'vinyl');
  assert.equal(classifyJob([{ item_name: 'โฟมบอร์ด A1' }])?.type.id, 'foamboard');
});

test('the form fills the name in, but never over work already in progress', () => {
  assert.match(jot, /params\.get\('name'\)/, 'nothing reads ?name=');
  // Only into a first row that is still empty: a shop with a half-typed job
  // who taps the bar must not lose it.
  assert.match(jot, /state\.items\.length === 1 && !state\.items\[0\]\.name && !state\.items\[0\]\.total/);
});

test('แถบตั้งต้นคือกระจกริชเมนู — ปุ่มชุดเดียวกับริชเมนูทุกใบ ใช้ได้ไม่ง้อ LIFF', () => {
  /* เดิมแถบนี้เป็นปุ่มจดงานตามหมวด — ร้านดูจอคอมแล้วสั่ง (25 พ.ย. 69)
   * "ฉันอยากให้เมนูแบบริชเมนู" คำสั่งใหม่ล่าสุดแทนที่: บนคอมริชเมนูไม่แสดง
   * แถบนี้จึงต้องเป็นเมนูหลักตัวเดียวกัน (ปุ่มจดตามหมวดยังอยู่ในการ์ดจดด่วน) */
  const items = defaultItems();
  assert.ok(items.length > 0 && items.length <= 13, 'an empty bar strands whatever was last shown');
  assert.ok(items.every((i) => !i.uri && i.action), 'ทุกปุ่มเป็น postback ไม่พึ่ง LIFF');
  const actions = items.map((i) => i.action);
  for (const a of ['add_job', 'recent_jobs', 'attach_evidence', 'pending_payment', 'pick_category', 'create_bill', 'open_game', 'open_sign', 'open_dashboard', 'help']) {
    assert.ok(actions.includes(a), `ปุ่มริชเมนูหาย: ${a}`);
  }
  assert.ok(items.every((i) => i.label.length <= 20), 'ป้ายยาวเกินกติกา LINE');
  // ปุ่มงานตามหมวดยังมีชีวิต (การ์ดจดด่วนใช้) — แค่ไม่ใช่แถบตั้งต้นแล้ว
  assert.ok(quickJobItems().every((i) => i.action === 'quick_job' && classifyItem(i.name)));
});

test('the receipt is reachable from the screen the shop finishes a job on', () => {
  const dash = readFileSync(new URL('../public/liff/index.html', import.meta.url), 'utf8');
  assert.ok(dash.includes('id="e-receipt"'), 'no receipt button on the edit form');
  assert.match(dash, /\/receipt', \{ method: 'POST' \}/);
  // In LINE's own browser, which can save the image; window.open is blocked there.
  assert.match(dash, /liff\.openWindow\(\{ url/);
});

// ร้านถามว่า "ทำไมจดด่วนถึงไม่ขึ้นหน้าใหม่ ไปขึ้นหน้าเดิมทำไม" พร้อมรูปฟอร์มที่
// เปิดมาแล้วมีงานเก่าค้างอยู่ครบหกรายการ

test('opening the form gives a new page, not yesterday\'s job', () => {
  // ของเดิม start() เรียก loadDraft() แล้วยัดร่างกลับเข้าฟอร์มเลย
  assert.doesNotMatch(jot, /if \(!loadDraft\(\)\) state\.items = \[blankItem\(\)\]/, 'ยังเด้งร่างเก่าเข้าฟอร์มเอง');
  assert.match(jot, /state\.items = \[blankItem\(\)\];/, 'ไม่ได้เริ่มที่ฟอร์มเปล่า');

  // ของที่ค้างไว้ไม่ได้หาย แต่มารอเป็นปุ่มให้กดเอง
  assert.match(jot, /function peekDraft\(\)/, 'ไม่มีทางดูร่างโดยไม่เอาเข้าฟอร์ม');
  assert.match(jot, /function offerDraft\(saved\)/);
  assert.match(jot, /มีงานที่ค้างไว้/);
  assert.match(jot, /\$\('#resume-yes'\)\.onclick/, 'กู้คืนไม่ได้');
  assert.match(jot, /\$\('#resume-no'\)\.onclick/, 'ทิ้งไม่ได้');

  // ฟอร์มเปล่าที่เปิดแล้วปิดเฉย ๆ ไม่นับเป็นงานค้าง
  assert.match(jot, /if \(!written && !String\(saved\.customer \|\| ''\)\.trim\(\)/);

  // ?draft=1 กับ ?job= ไปดึงของจริงมาใส่อยู่แล้ว แถบกู้คืนไม่ต้องโผล่มาซ้อน
  assert.match(jot, /params\.get\('draft'\) === '1' \|\| params\.get\('job'\) \? null : peekDraft\(\)/);

  const html = readFileSync(new URL('../public/liff/jot/index.html', import.meta.url), 'utf8');
  assert.ok(html.includes('id="resume"') && html.includes('id="resume-yes"'), 'ไม่มีแถบกู้คืนในหน้า');
});

test('editing a saved job never leaks into the quick-jot draft', () => {
  // นี่คือต้นเหตุที่ร้านเจอ: เปิดงานที่บันทึกแล้วมาแก้ (?job=…) พอแตะช่องไหนก็ตาม
  // paint() เรียก saveDraft() งานเก่าจึงถูกเขียนลงร่าง แล้วครั้งต่อไปที่กดจดด่วน
  // มันเด้งกลับขึ้นมาทั้งใบ
  const fn = jot.slice(jot.indexOf('function saveDraft()'), jot.indexOf('function peekDraft()'));
  assert.match(fn, /if \(editingJobId\) return;/, 'แก้งานเก่าแล้วยังเขียนทับร่างอยู่');
  assert.match(fn, /savedAt: Date\.now\(\)/, 'ร่างไม่รู้ว่าค้างไว้ตั้งแต่เมื่อไหร่');
});
