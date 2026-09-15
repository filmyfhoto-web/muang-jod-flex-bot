import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { quickReplyBlock, defaultItems, QUICK_JOBS, QUICK_LINKS } from '../src/flex/quickReply.js';
import { classifyJob, findType } from '../src/utils/category.js';

const jot = readFileSync(new URL('../public/liff/jot/script.js', import.meta.url), 'utf8');

// The shop asked for the bar above the keyboard to be the three jobs they do
// all day, and said "เราไม่เอาออกบิลละ เรากรอกเสร็จออกใบเสร็จเลย".

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

test('the bar is the jobs this shop does and nothing else', () => {
  // "เอาตัวเลือกด้านหลังออกทั้งหมดให้มีแค่ กรอบรูป งานป้าย งานโฟมบอร์ด งานสติ๊กเกอร์"
  // — the rest have their own buttons on the rich menu, and a second copy here
  // made the bar long enough to need swiping, which pushed the jobs off it.
  // Two more were added later ("อยู่ในคีลัดเลยค่ะ ข้างๆสติ๊กเกอร์").
  const items = withLiff(() => quickReplyBlock().items);

  assert.deepEqual(items.map((i) => i.action.label), [
    '🖼 งานกรอบรูป',
    '🪧 งานป้าย',
    '🧊 งานโฟมบอร์ด',
    '🏷 งานสติ๊กเกอร์',
    '📋 สติ๊กเกอร์บอร์ด',
    '🔖 ตรายาง',
    // ร้านขอไว้ว่า "ตรงเมนูด่วนด้านหลังตรายาง เพิ่มหมวดงานให้หน่อย" — ท้ายสุด
    // เพราะปุ่มอื่นคือ "จดงานชนิดนี้" ส่วนปุ่มนี้คือ "ขอดูงานที่จดไปแล้ว"
    '📂 หมวดงาน',
  ]);
  assert.equal(items.length, QUICK_JOBS.length + QUICK_LINKS.length, 'something else crept back onto the bar');
  assert.ok(items.length <= 13, 'LINE รับได้ 13 ปุ่ม');
  // LINE counts UTF-16 units, so an emoji costs two of the twenty.
  for (const i of items) assert.ok(i.action.label.length <= 20, `label too long (${i.action.label.length}): ${i.action.label}`);

  /* ร้านบอกว่า "ตรงปุ่มกดให้เป็นบอทตอบเหมือนเดิม แล้วค่อยกดเข้าไปแก้ไขทีหลัง"
   * ปุ่มงานเคยเป็นลิงก์เปิดฟอร์มจดด่วน แปลว่าจะจดงานทีต้องเด้งออกจากแชตไปหน้าเว็บ
   * ก่อนทุกครั้ง ตอนนี้ม่วงถามทีละข้อในแชตได้แล้ว ปุ่มจึงพาเข้าบทสนทนา ส่วนฟอร์ม
   * เหลือไว้ตอนอยากแก้หลายช่องทีเดียว */
  for (const i of items.slice(0, QUICK_JOBS.length)) {
    assert.equal(i.action.type, 'postback', `${i.action.label} ยังเด้งออกไปหน้าเว็บ`);
    assert.match(i.action.data, /^action=quick_job&name=/);
  }
  // ชื่องานที่ส่งไปต้องอ่านกลับมาได้ตรงตัว ไม่ใช่โดน encode แล้วเพี้ยน
  const names = items.slice(0, QUICK_JOBS.length).map((i) => new URLSearchParams(i.action.data).get('name'));
  assert.deepEqual(names, QUICK_JOBS.map((j) => j.name));

  // "หมวดงาน" ยังเป็นลิงก์ เพราะมันคือหน้าเว็บจริง ๆ ไม่ใช่บทสนทนา
  assert.equal(items.at(-1).action.type, 'uri');
  assert.match(items.at(-1).action.uri, /\?tab=category$/, 'หมวดงานไม่ได้เปิดหน้าหมวด');
});

test('every button on the bar files the job in the right place', () => {
  // ป้ายปุ่มสั้นกว่าชื่องานได้ แต่ชื่อที่ส่งไปให้ม่วงอ่านต้องเป็นชื่อที่ระบบแยก
  // หมวดออก ไม่งั้นกดปุ่มแล้วงานไปกองรวมที่ "งานทั่วไป" และม่วงจะถามชุดคำถาม
  // พื้นฐานแทนชุดของงานชนิดนั้น
  const expected = {
    กรอบรูป: 'frame',
    ป้ายไวนิล: 'vinyl',
    โฟมบอร์ด: 'foamboard',
    'สติ๊กเกอร์': 'sticker',
    'สติ๊กเกอร์ฟิวเจอร์บอร์ด': 'sticker_board',
    ตรายาง: 'stamp',
  };
  for (const job of QUICK_JOBS) {
    const hit = classifyJob([{ item_name: job.name }]);
    assert.equal(hit?.type.id, expected[job.name], `"${job.name}" ไปลง ${hit?.type.label || 'งานทั่วไป'}`);
  }
  assert.deepEqual(QUICK_JOBS.map((j) => j.name).sort(), Object.keys(expected).sort(), 'a button has no expectation');
});

test('tapping a job button starts the conversation, not a form', () => {
  const json = withLiff(() => JSON.stringify(quickReplyBlock()));
  assert.ok(!json.includes('create_bill'), 'ออกบิล is still on the bar');
  assert.ok(!json.includes('/jot?quick=1'), 'ปุ่มงานยังเปิดฟอร์มอยู่');

  // และมีคนรับปุ่มนั้นจริง ๆ อยู่ปลายทาง
  const router = readFileSync(new URL('../src/handlers/postbackHandler.js', import.meta.url), 'utf8');
  const allowed = readFileSync(new URL('../src/utils/validation.js', import.meta.url), 'utf8');
  assert.match(router, /case 'quick_job':/);
  assert.match(allowed, /'quick_job'/, 'quick_job ไม่อยู่ในรายการที่อนุญาต');

  // ชื่องานที่ยัดมาใน postback ต้องเป็นชื่อที่อยู่ในปุ่มจริง ๆ — data ปลอมได้
  const action = readFileSync(new URL('../src/actions/quickJob.js', import.meta.url), 'utf8');
  assert.match(action, /const KNOWN = new Set\(QUICK_JOBS\.map/);
  assert.match(action, /KNOWN\.has\(name\) \? startCollecting\(name\) : null/);
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

test('with no LIFF app the bar is never empty, or the old one is stuck forever', () => {
  // LINE only swaps the bar when a message arrives carrying one. A message
  // with no bar does not clear the old one — it leaves it on screen. So an
  // empty bar meant the shop kept seeing the buttons from before the change
  // and never the new ones, which is exactly what they reported.
  const items = defaultItems();
  assert.ok(items.length > 0, 'an empty bar strands whatever was last shown');
  assert.ok(items.every((i) => !i.uri), 'a link to nowhere is on the bar');
  assert.ok(items.every((i) => i.action), 'a button with nothing behind it');
  // ปุ่มงานไม่ต้องพึ่ง LIFF อีกแล้ว ยังอยู่ครบแม้ไม่ได้ตั้ง — หายไปแค่ "หมวดงาน"
  assert.equal(items.length, QUICK_JOBS.length, 'ปุ่มงานหายไปตอนไม่มี LIFF');
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
