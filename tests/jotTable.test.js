import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { COLORS } from '../src/flex/theme.js';

/* ร้านขอ: "ปรับให้กรอกเป็นตารางก็ได้ค่ะ จะได้กรอกง่าย กดเป็นปุ่มมันยาก
 * เป็นตารางแล้วเรากดเลือก หน่วยงาน ลงบัญชี ยังไม่จ่าย หน้าร้าน ใบแจ้งยอด
 * แล้วก็ออกใบเสร็จได้ เอากระชับ" และ "ตัวหนังสือเหมือน mac ไอโฟน โทนสี
 * ส้ม กรม ขาว แต่ยังคงมีน้องหมานะคะ"
 */

const read = (p) => readFileSync(new URL(`../public/liff/${p}`, import.meta.url), 'utf8');
const html = read('jot/index.html');
const css = read('jot/style.css');
const js = read('jot/script.js');

test('ชิปเงินแถวเดียว ยังไม่จ่าย/ลงบัญชี/จ่ายสด/โอน — ลงท่อ payMethod เดิมของ API', () => {
  for (const pay of ['data-pay=""', 'data-pay="account"', 'data-pay="cash"', 'data-pay="transfer"']) {
    assert.ok(html.includes(pay), `ไม่มีชิป ${pay}`);
  }
  assert.match(js, /state\.payMethod = b\.dataset\.pay/);

  // จ่ายสดครบ/โอนครบ = รับเท่ายอดเก็บ แม้แก้รายการทีหลังยอดก็ตามไป — กติกา
  // เดียวกับพิมพ์ "จ่ายสด" ในแชตโดยไม่บอกจำนวน
  assert.match(js, /state\.payMethod === 'cash' \|\| state\.payMethod === 'transfer'\s*\?\s*chargeAmount\(\)/);

  // ช่องมัดจำย้ายมาอยู่การ์ดเงิน และหายไปตอนเลือกจ่ายครบ (ไม่มีอะไรให้มัดจำ)
  const paycard = html.slice(html.indexOf('id="paycard"'), html.indexOf('id="summary"'));
  assert.ok(paycard.includes('id="f-paid"'), 'ช่องมัดจำไม่ได้อยู่การ์ดเงิน');
  assert.match(js, /dep\.hidden = state\.payMethod === 'cash' \|\| state\.payMethod === 'transfer'/);

  // ร่างจากแชต ("ลงบัญชี" ท้ายประโยค) เปิดมาชิปต้องติดถูกอันตั้งแต่แรก
  assert.match(js, /function syncPayChips\(\)/);
  assert.match(js, /syncPayChips\(\);\s*\n\s*paintKind\(\);/, 'syncHeaderFields ไม่ได้จัดชิปให้');

  // สรุปบอก "ลงบัญชีไว้" ต่างจากค้างรับเฉย ๆ — มันคือค้างรับที่ลงสมุดแล้ว
  assert.match(js, /account: 'ลงบัญชีไว้'/);

  // แก้งานเก่า (?job=) เงินแก้จากหน้าจัดการงาน — ชิปโชว์ไว้ก็หลอกว่ากดแล้วมีผล
  assert.match(js, /\$\('#paycard'\)\.hidden = true;/);
});

test('ป้ายเดาหน่วยงาน/หน้าร้าน ใช้กติกาเดียวกับคิวงานและสมุดเป๊ะ', () => {
  const dash = read('index.html');
  const jotRe = /const ORG_RE = (\/\^.*?\/);/.exec(js)?.[1];
  const dashRe = /const ORG_RE = (\/\^.*?\/);/.exec(dash)?.[1];
  assert.ok(jotRe && dashRe, 'หา ORG_RE ไม่เจอ');
  assert.equal(jotRe, dashRe, 'สองหน้าเดาหน่วยงานคนละกติกา — โรงเรียนเดียวกันจะขึ้นคนละชนิด');

  assert.ok(html.includes('id="kind-pill"'), 'ไม่มีป้ายชนิดลูกค้า');
  assert.match(js, /pill\.textContent = org \? '🏛 หน่วยงาน' : '🏠 หน้าร้าน'/);
});

test('บันทึกแล้วมี ใบแจ้งยอด/ใบเสร็จ/จดใบต่อไป ตรงหน้า — โหมดด่วนยังปิดกลับแชตเหมือนเดิม', () => {
  for (const id of ['id="done"', 'id="d-no"', 'id="d-receipt"', 'id="d-bill"', 'id="d-again"']) {
    assert.ok(html.includes(id), `ไม่มี ${id}`);
  }
  assert.match(js, /if \(!editingJobId && !quick && body\.job\?\.id\)/, 'หน้าเต็มไม่ขึ้นการ์ดหลังบันทึก');

  // ใบเสร็จ: endpoint เดิมของหน้าจัดการงาน (ใช้บิลเดิมของงาน ไม่ออกใบซ้อน)
  // และเปิดผ่าน liff.openWindow เพราะ window.open โดนบล็อกในเบราว์เซอร์ของ LINE
  assert.match(js, /\/api\/jobs\/' \+ encodeURIComponent\(doneJob\.id\) \+ '\/receipt'/);
  assert.match(js, /liff\.openWindow\(\{ url, external: false \}\)/);

  // ใบแจ้งยอด: สมุดของเจ้านี้ ด้วยกุญแจแบบเดียวกับ accountKey ฝั่งเซิร์ฟเวอร์
  assert.match(js, /'\/app\/book\/\?key=' \+ encodeURIComponent\(custKey\(doneJob\.customer_name/);
  // ไม่มีชื่อลูกค้า = ไม่มีเจ้าให้เปิดสมุด ปุ่มต้องหาย ไม่ใช่พาไปหน้าว่าง
  assert.match(js, /\$\('#d-bill'\)\.hidden = !String\(job\.customer_name/);
});

/* ร้านถาม "ทำไมดูในคอมไม่ขึ้น" หลังอัปเดต — ของเดิม maxAge 5 นาทีให้เบราว์เซอร์
 * จำหน้าแบบไม่ถามเซิร์ฟเวอร์ แท็บบนคอมที่เปิดค้างจึงโชว์หน้าเก่า
 */
test('หน้าแอปเช็กของใหม่กับเซิร์ฟเวอร์ทุกครั้ง — อัปเดตแล้วคอมเห็นของใหม่หลังรีเฟรชธรรมดา', async () => {
  const { readFileSync } = await import('node:fs');
  const server = readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
  // no-cache = ถามทุกครั้ง ไฟล์ไม่เปลี่ยนได้ 304 ถูก ๆ — ห้ามกลับไปใช้ maxAge กับหน้าแอป
  assert.match(server, /setHeaders: \(res\) => res\.set\('Cache-Control', 'no-cache'\)/);
  assert.ok(!/express\.static\('public\/liff', \{ maxAge/.test(server), 'หน้าแอปถูกจำแบบไม่ถามอีกแล้ว');
  // รูปโลโก้/มาสคอตนาน ๆ เปลี่ยนที จำยาว ๆ ได้เหมือนเดิม
  assert.match(server, /express\.static\('public\/brand', \{ maxAge: '1d' \}\)/);
});

test('โทนส้ม-กรม-ขาว ย้ายพร้อมกันทุกหน้า และฟอนต์ระบบแบบไอโฟนนำหน้า', () => {
  // ค่ากลางอยู่ theme.js — การ์ดในแชตกับหน้าเว็บทุกหน้าถือ --gold ตัวเดียวกัน
  assert.equal(COLORS.gold.toLowerCase(), '#ee7b2f', 'ส้มกลางของการ์ดแชตหาย');
  for (const page of ['index.html', 'book/index.html', 'ledger/index.html', 'categories/index.html']) {
    assert.match(read(page), /--gold: #EE7B2F/, `${page} ยังเป็นทองเดิม`);
  }
  assert.match(css, /--gold: #ee7b2f/, 'ฟอร์มจดยังเป็นทองเดิม');

  // "ตัวหนังสือเหมือน mac ไอโฟน" — ฟอนต์ระบบนำ ไทยบนแอปเปิลตกที่ Thonburi
  // ก่อนเว็บฟอนต์ Noto (ที่ยังโหลดไว้ให้แอนดรอยด์)
  const stack = /body \{[\s\S]*?font-family:\s*([^;]+);/.exec(css)?.[1] || '';
  const order = ['-apple-system', 'SF Pro Text', 'Thonburi', 'Noto Sans Thai'];
  let at = -1;
  for (const f of order) {
    const i = stack.indexOf(f);
    assert.ok(i > at, `${f} ผิดลำดับในฟอนต์ของฟอร์มจด`);
    at = i;
  }

  // น้องหมายังอยู่ — หัวหน้า bar กับบับเบิลทักทาย
  assert.ok(html.includes('/brand/ui/happy.png'), 'น้องหมาหายไปจากฟอร์ม');

  // แถบยอด+บันทึกลอยล่างอยู่ทุกโหมดแล้ว ไม่ใช่เฉพาะจดด่วน
  assert.match(js, /\n\$\('#quickbar'\)\.hidden = false;/);
});

/* ร้านสั่ง "บอทแยกลงบัญชี และ โรงเรียนให้อัตโนมัติ" — ฝั่งฟอร์ม: พิมพ์ชื่อ
 * โรงเรียน/หน่วยงานแล้วชิป "ลงบัญชี" ติดเอง (ยังแตะเปลี่ยนได้เสมอ) ฝั่ง
 * เซิร์ฟเวอร์มีกติกาเดียวกันใน createJob — เทสต์อยู่ใน services.test.js
 */
test('ชื่อหน่วยงานติดชิปลงบัญชีให้เอง — ร้านแตะชิปเองแล้วห้ามเดาทับ', () => {
  const js = read('jot/script.js');
  assert.match(js, /let payTouched = false/);
  assert.match(js, /payTouched = true;\n  state\.payMethod = b\.dataset\.pay;/, 'แตะชิป = การตัดสินใจของร้าน');
  assert.match(js, /if \(!payTouched && !editingJobId && !\(Number\(state\.paid\) > 0\)\)/);
  assert.match(js, /const want = org \? 'account' : ''/);
  // ถอยกลับเฉพาะค่าที่ตัวเองเดาไว้ ไม่แตะค่าที่มาจากร่าง/แชต
  assert.match(js, /const can = org \? !state\.payMethod : state\.payMethod === 'account'/);
  // ร่างจากแชตและร่างค้างที่พกเรื่องเงินมา = ร้านพูดไว้แล้ว ปักธงกันเดาทับ
  const guards = js.match(/payTouched = payTouched \|\| Boolean\(state\.payMethod\) \|\| Number\(state\.paid\) > 0;/g) || [];
  assert.ok(guards.length >= 2, 'ร่างจากแชต/ร่างค้าง ต้องปักว่าร้านตัดสินใจแล้ว');
});
