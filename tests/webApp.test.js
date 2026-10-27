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
  // หน้าจัดการงานมีแถบล่างของตัวเองอยู่แล้ว — เพิ่มปุ่มจดให้ครบวง โดยปุ่มสมุด
  // ยังเป็น data-page ตัวแรก (เทสต์สมุดอ่านตัวแรก)
  const dash = read('index.html');
  assert.ok(dash.includes('data-page="/app/jot/"'), 'หน้าจัดการงานไม่มีปุ่มกลับไปจด');
  assert.equal(/data-page="([^"]+)"/.exec(dash)?.[1], '/app/book/', 'ปุ่มสมุดต้องเป็น data-page ตัวแรก');
});

test('หน้าจด: แถบบันทึกลอยเหนือแถบแอป — โหมดด่วน (แผ่นทับแชต) ไม่มีแถบแอป', () => {
  const css = read('jot/style.css');
  assert.match(css, /\.quickbar \{[^}]*bottom: calc\(52px \+ var\(--safe-bottom\)\)/, 'แถบบันทึกทับแถบแอป');
  assert.match(css, /body\.quick \.quickbar \{ bottom: 0;/, 'โหมดด่วนแถบบันทึกต้องกลับมาชิดล่าง');
  assert.match(css, /body\.quick \.appbar \{ display: none; \}/, 'โหมดด่วนไม่ควรมีแถบแอปให้หลุดออกจากแชต');
});
