import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const dash = readFileSync(new URL('../public/liff/index.html', import.meta.url), 'utf8');

/* ร้านเปิดแอปแล้วเจอหน้าว่าง ไม่มีอะไรบอกว่าเกิดอะไรขึ้น
 *
 * ของเดิมความผิดพลาดตอนโหลดแท็บถูกโยนให้ toast ซึ่งจางหายไปในไม่กี่วินาที
 * เหลือหน้าว่าง ๆ ให้เดาเองว่าเน็ตไม่ดี เซิร์ฟเวอร์ล่ม หรือแอปพัง
 */

test('แท็บโหลดไม่ขึ้น ต้องบอกค้างไว้ ไม่ใช่ toast ที่จางหาย', () => {
  const show = dash.slice(dash.indexOf('async function show(name)'), dash.indexOf('const TAB_NAMES'));
  assert.match(show, /fatal\(/, 'ยังโยนให้ toast อยู่');
  assert.ok(!/catch \(err\) \{\s*toast\(err\.message, true\);\s*\}/.test(show), 'ยังจับแล้ว toast เฉย ๆ');

  // บอกชื่อแท็บที่เปิดไม่ขึ้นด้วย จะได้รู้ว่าพังตรงไหน
  assert.match(dash, /TAB_NAMES = \{ today: 'งานวันนี้'/);
});

test('มีปุ่มลองอีกครั้ง และแถบปุ่มยังอยู่ให้เปลี่ยนแท็บได้', () => {
  assert.match(dash, /id="fatal-retry"/);
  assert.match(dash, /retry: \(\) => show\(name\)/);
  // เปิดแอปไม่ขึ้นตั้งแต่แรก ให้โหลดหน้าใหม่ได้
  assert.match(dash, /retry: \(\) => location\.reload\(\)/);

  // แท็บเดียวพังไม่ควรยึดแถบปุ่มไปด้วย ร้านยังกดไปแท็บอื่นได้
  assert.match(dash, /\$\('nav'\)\.hidden = Boolean\(retry\) \? false : true;/);
});

test('ต่อเซิร์ฟเวอร์ไม่ติด ต่างจากเซิร์ฟเวอร์ตอบว่าผิดพลาด', () => {
  // เครื่องที่โฮสต์หลับเมื่อไม่มีคนใช้ ครั้งแรกของวันจึงอาจต่อไม่ติด
  assert.match(dash, /ต่อเซิร์ฟเวอร์ไม่ได้ค่ะ/);
  assert.match(dash, /เซิร์ฟเวอร์ตอบว่าผิดพลาด \(' \+ res\.status \+ '\)/);
});

test('เปลี่ยนแท็บแล้วข้อความผิดพลาดเก่าต้องหายไป', () => {
  assert.match(dash, /function clearFatal\(\)/);
  const show = dash.slice(dash.indexOf('async function show(name)'), dash.indexOf('const TAB_NAMES'));
  assert.match(show, /clearFatal\(\);/);
});

test('ธีมเป็นกรม-ทอง และใช้ฟอนต์ระบบของเครื่อง เหมือนหน้าอื่นในแอป', () => {
  assert.match(dash, /--accent: #35486E/);
  assert.match(dash, /--gold: #DDA83D/);
  assert.match(dash, /--bg: #EFF1F5/);

  const stack = dash.match(/font-family: ([^;]+);/)?.[1] || '';
  let at = -1;
  for (const font of ['-apple-system', 'SF Pro Text', 'Thonburi', 'Noto Sans Thai']) {
    const found = stack.indexOf(font);
    assert.ok(found > at, font + ' ผิดลำดับ');
    at = found;
  }
});
