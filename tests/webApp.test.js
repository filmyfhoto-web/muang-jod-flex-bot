import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

/* ร้านสั่ง: "ออกแบบเป็นเว็บแอพออกมาเลยค่ะ เวลามีลูกค้ามาจะได้พิมพ์ลงบัญชีให้
 * ม่วงจด และปริ้นใบเสร็จออกมาได้" — เฟสแรกของการรื้อ: ทุกหน้าเป็นแอปเดียวกัน
 * (แถบแท็บ จด·งาน&เงิน·ลูกค้า) และติดตั้งเป็นแอปบนคอม/มือถือได้ (manifest)
 */

const read = (p) => readFileSync(new URL(`../public/liff/${p}`, import.meta.url), 'utf8');

test('ติดตั้งเป็นแอปได้: manifest ถูกต้อง เปิดมาที่หน้าจด และไอคอนมีไฟล์จริง', () => {
  const m = JSON.parse(read('manifest.webmanifest'));
  // ลูกค้าเดินเข้าร้าน = เปิดแอปมาต้องพร้อมจดทันที
  assert.equal(m.start_url, '/app/jot/');
  assert.equal(m.scope, '/app/');
  assert.equal(m.display, 'standalone');
  assert.equal(m.name, 'ม่วงจดให้');
  assert.ok(m.icons.length >= 2, 'ต้องมีไอคอนอย่างน้อยสองขนาด');
  for (const icon of m.icons) {
    const file = new URL('../public' + icon.src, import.meta.url);
    assert.ok(existsSync(file), `ไอคอน ${icon.src} ไม่มีไฟล์จริง`);
  }
});

test('ทุกหน้าเชื่อม manifest เดียวกัน — ติดตั้งจากหน้าไหนก็ได้แอปเดียวกัน', () => {
  for (const page of ['jot/index.html', 'index.html', 'book/index.html', 'ledger/index.html', 'categories/index.html']) {
    assert.ok(read(page).includes('href="/app/manifest.webmanifest"'), `${page} ไม่ได้เชื่อม manifest`);
  }
});

test('แถบแอป 3 แท็บ จด·งาน&เงิน·ลูกค้า อยู่บนหน้า จด/สมุด/บัญชี', () => {
  for (const page of ['jot/index.html', 'book/index.html', 'ledger/index.html']) {
    const html = read(page);
    const bar = html.slice(html.indexOf('class="appbar"'));
    assert.ok(bar.length > 20, `${page} ไม่มีแถบแอป`);
    for (const href of ['href="/app/jot/"', 'href="/app/"', 'href="/app/book/"']) {
      assert.ok(bar.includes(href), `${page} แถบแอปไม่มีลิงก์ ${href}`);
    }
  }
  // หน้าจัดการงานใช้แถบล่างของตัวเอง (nav) แต่สามปุ่มเดียวกับแถบแอป:
  // จด (ออกไปหน้าจด) · งาน & เงิน (แท็บ home ของหน้านี้) · ลูกค้า (ออกไปสมุด)
  const dash = read('index.html');
  assert.ok(dash.includes('data-page="/app/jot/"'), 'หน้าจัดการงานไม่มีปุ่มไปจด');
  assert.ok(dash.includes('data-page="/app/book/"'), 'หน้าจัดการงานไม่มีปุ่มไปลูกค้า');
  assert.ok(dash.includes('data-tab="home"'), 'หน้าจัดการงานไม่มีแท็บ งาน & เงิน');
});

/* ร้านย้ำอีกรอบ: "ฉันก็ยัง งง กับระบบ ช่วยทำระบบใหม่ให้เลยได้ไหม แล้วดูหน้าตา
 * เว็บก็เข้าใช้ยาก" — เฟสสองของการรื้อ: หน้าแรกของหน้าจัดการงานเป็น
 * "งาน & เงิน" ตามแบบร่าง สองตัวเลขใหญ่ + ลิสต์งานแตะได้ + แผ่นปุ่มใหญ่ต่องาน
 * หน้าเดิมทั้งหมด (คิวละเอียด/ค้างรับ/สรุป/ตั้งค่า) ยังเข้าได้จากปุ่มเล็ก + ?tab=
 */
test('หน้าแรกเป็น งาน & เงิน: ตัวเลขจากใบลงบัญชีจริง แตะงานแล้วได้แผ่นปุ่มใหญ่', () => {
  const dash = read('index.html');

  // เปิดมาที่ home และ deep link เดิม (?tab=/?edit=) ยังเข้าหน้าเดิมได้
  assert.match(dash, /await show\(TABS\.includes\(want\) \? want : 'home'\)/);
  assert.ok(dash.includes('<section id="v-home"'), 'ไม่มีหน้า งาน & เงิน');

  // สองตัวเลขหัวหน้าอ่านจาก /ledger (แหล่งเดียวกับใบลงบัญชี) — ไม่คำนวณเอง
  // โหลดพังขีดไว้ ไม่เดาตัวเลขเงิน (กติกา V2 §4)
  assert.match(dash, /api\('\/ledger'\)\.catch\(\(\) => null\)/);
  assert.match(dash, /\$\('h-got'\)\.textContent = led \? thb\(led\.total\) : '—'/);
  assert.match(dash, /\$\('h-owe'\)\.textContent = led \? thb\(led\.carry\?\.owed \|\| 0\) : '—'/);

  // แผ่นปุ่มใหญ่: เก็บสด/โอนยิง POST /status ตัวเดิมของแผงคิว ใบเสร็จเส้นเดิม
  // ของหน้าแก้ไข ส่วนแก้ไขเปิด openEdit — ไม่มีเส้นใหม่ให้เพี้ยนจากกัน
  assert.match(dash, /sheetMoney\('cash'/);
  assert.match(dash, /sheetMoney\('transfer'/);
  assert.match(dash, /'\/jobs\/' \+ homeJob\.id \+ '\/status', \{ method: 'POST', body: JSON\.stringify\(\{ money \}\) \}/);
  assert.match(dash, /'\/jobs\/' \+ homeJob\.id \+ '\/receipt', \{ method: 'POST' \}/);
  assert.match(dash, /\$\('hs-edit'\)\.onclick/);

  // จ่ายครบแล้วปุ่มเก็บเงินต้องหาย ไม่ชวนเก็บซ้ำ
  assert.match(dash, /\$\('hs-cash'\)\.hidden = paidUp/);

  // ออกจากหน้าแก้ไขแล้วกลับหน้าแรกใหม่ ไม่หลงไปหน้าเก่า
  assert.match(dash, /show\(tab === 'edit' \? 'home' : tab\)/);
});

/* ร้านย้ำ: "อยากสร้างเป็นแอพออกมาค่ะ แต่ก็สามารถทำงานใน ม่วงจดในไลน์ได้" —
 * มันคือเว็บเดียวกันสองประตูอยู่แล้ว ที่เพิ่มคือปุ่มติดตั้งกดเดียวจบ
 */
test('ปุ่มติดตั้งแอป กดเดียวขึ้นกล่องติดตั้ง — ใน LINE ไม่มีวันโผล่มากวน', () => {
  const html = read('jot/index.html');
  const js = read('jot/script.js');
  assert.ok(html.includes('<div class="install" id="install" hidden>'), 'แถบติดตั้งต้องซ่อนมาแต่แรก');
  // โผล่เมื่อเบราว์เซอร์บอกว่าติดตั้งได้เท่านั้น (LINE/iPhone ไม่ยิงอีเวนต์นี้)
  assert.match(js, /addEventListener\('beforeinstallprompt'/);
  assert.match(js, /installEvent\.prompt\(\)/);
  // โหมดด่วนทับแชตไม่ชวนติดตั้ง และกดปิดแล้วจำ ไม่ชวนซ้ำทุกวัน
  assert.match(js, /if \(!off && !quick\) \$\('#install'\)\.hidden = false/);
  assert.match(js, /muangjod\.install\.dismissed/);
});

/* ร้านสั่งสั้น ๆ: "ไม่เอาขอบมน" — ทุกหน้าของแอปเป็นเหลี่ยมทั้งแผง
 * ที่เหลือกลมได้มีแค่วงกลมแท้ ๆ (รูปโปรไฟล์/จุด/เลขคิว = 50%)
 * โทเคนมุม (--r / --radius) ต้องเป็นศูนย์ด้วย ไม่งั้น var() คือขอบมนแฝง
 */
test('ไม่เอาขอบมน: ทุกหน้าเป็นเหลี่ยม เหลือได้เฉพาะวงกลมแท้ ๆ', () => {
  for (const page of ['index.html', 'jot/index.html', 'jot/style.css', 'book/index.html', 'ledger/index.html', 'categories/index.html']) {
    const src = read(page);
    const bad = [...src.matchAll(/border-radius:\s*([^;"}]+)/g)]
      .map((m) => m[1].trim())
      .filter((v) => !(v === '0' || v === '50%' || v === 'var(--r)' || v === 'var(--radius)'));
    assert.deepEqual(bad, [], `${page} ยังมีขอบมน: ${bad.join(', ')}`);
    const tok = /--r(?:adius)?:\s*([^;]+);/.exec(src);
    if (tok) assert.equal(tok[1].trim(), '0', `${page} โทเคนมุมยังมน`);
  }
});

test('หน้าจด: แถบบันทึกลอยเหนือแถบแอป — โหมดด่วน (แผ่นทับแชต) ไม่มีแถบแอป', () => {
  const css = read('jot/style.css');
  assert.match(css, /\.quickbar \{[^}]*bottom: calc\(52px \+ var\(--safe-bottom\)\)/, 'แถบบันทึกทับแถบแอป');
  assert.match(css, /body\.quick \.quickbar \{ bottom: 0;/, 'โหมดด่วนแถบบันทึกต้องกลับมาชิดล่าง');
  assert.match(css, /body\.quick \.appbar \{ display: none; \}/, 'โหมดด่วนไม่ควรมีแถบแอปให้หลุดออกจากแชต');
});
