// NATTAPRON 8-BIT — page/PWA/server pins: มือถือพอดีจอ ปุ่มแตะได้ ≥44px
// ป้ายความจริง (LOCAL DEMO / ไม่ใช่ GPS / ตัวอย่าง) และบล็อกแอนิเมชันห้ามแตะใบงาน
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../public/game/index.html', import.meta.url), 'utf8');
const sw = readFileSync(new URL('../public/game/sw.js', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../public/game/manifest.webmanifest', import.meta.url), 'utf8'));
const scene = readFileSync(new URL('../public/game/scene.js', import.meta.url), 'utf8');
const server = readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');

test('เกม: หน้าเพจเป็น PWA มือถือ — viewport/manifest/sw/safe-area/ไทย', () => {
  assert.match(html, /<html lang="th">/);
  assert.match(html, /viewport-fit=cover/);
  assert.match(html, /<link rel="manifest" href="\.\/manifest\.webmanifest">/);
  assert.match(html, /serviceWorker.*register\('\.\/sw\.js', \{ scope: '\.\/' \}\)/s);
  assert.match(html, /html, body \{ overflow-x: hidden; \}/);
  assert.match(html, /padding-bottom: calc\(86px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(html, /env\(safe-area-inset-top\)/);
  assert.ok(html.includes("font: 15px/1.5 'Noto Sans Thai'"));
});

test('เกม: ปุ่มแตะได้ขั้นต่ำ 44px ทั้งปุ่มทั่วไปและแท็บล่าง', () => {
  assert.match(html, /button \{ cursor: pointer; touch-action: manipulation; border: none; background: none; min-height: 44px; \}/);
  assert.match(html, /\.tabbar button \{[^}]*min-height: 58px/s);
  assert.match(html, /\.rk button \{ width: 44px; height: 44px; min-height: 44px/);
  assert.match(html, /\.m-head \.x \{ width: 44px; height: 44px/);
});

test('เกม: ครบ 5 จอ + แท็บล่าง 5 ปุ่ม + มุมมอง INSIDE/คิวงาน/ไวนิล', () => {
  for (const id of ['scr-home', 'scr-queue', 'scr-new', 'scr-report', 'scr-settings']) {
    assert.ok(html.includes(`id="${id}"`), id);
  }
  for (const id of ['tab-home', 'tab-queue', 'tab-new', 'tab-report', 'tab-settings']) {
    assert.ok(html.includes(`id="${id}"`), id);
  }
  for (const id of ['seg-inside', 'seg-queue', 'seg-vinyl']) assert.ok(html.includes(`id="${id}"`), id);
  assert.ok(html.includes('หน้าร้าน') && html.includes('จัดการงาน') && html.includes('รายงาน') && html.includes('ตั้งค่า'));
  assert.ok(html.includes('ใบงานของฉัน') && html.includes('บอร์ดงาน · ร้านนัฐภรณ์'));
});

test('เกม: ป้ายความจริงครบ — LOCAL DEMO / จำลองไม่ใช่ GPS / ตัวอย่าง / เก็บในเครื่อง', () => {
  assert.ok(html.includes('LOCAL DEMO'));
  assert.ok(html.includes('ไม่ใช่ GPS และไม่เปลี่ยนสถานะงานจริง'));
  assert.ok(html.includes('b-sample') && html.includes('>ตัวอย่าง<'));
  assert.ok(html.includes('ยังไม่ซิงก์ข้ามเครื่องพนักงาน'));
  assert.ok(html.includes('ยังไม่เชื่อมม่วงจด / LINE OA / NATTA GROUP'));
  assert.ok(scene.includes('ไม่ใช่แผนที่ GPS'));
  assert.ok(scene.includes('นัฐภรณ์คัลเลอร์แล็ป')); // ป้ายไม้ชื่อร้านจริง
});

test('เกม: ทุกการย้ายสถานะต้องผ่าน confirm และบันทึกเวลารับจริง', () => {
  assert.match(html, /function confirmMove\(id, to\)/);
  assert.match(html, /if \(!window\.confirm\(msg\)\) return;/);
  assert.ok(html.includes('ระบบจะบันทึกวันเวลารับจริงทันที'));
  assert.ok(html.includes("E.applyTransition(j, to, { now: new Date(), by: settings.me || '' })"));
});

test('เกม: บล็อกแอนิเมชัน (frame/stepVinylSim) ไม่แตะใบงานและไม่เรียก applyTransition', () => {
  const start = html.indexOf('function frame(t)');
  const end = html.indexOf('function paintVinylStages');
  assert.ok(start > 0 && end > start);
  const animBlock = html.slice(start, end);
  assert.ok(!animBlock.includes('applyTransition'), 'animation must never change status');
  assert.ok(!animBlock.includes('orders'), 'animation must not read/write orders');
  assert.ok(html.includes('VISUAL ONLY'));
});

test('เกม: manifest/sw พร้อมติดตั้งและออฟไลน์', () => {
  assert.equal(manifest.name, 'NATTAPRON 8-BIT AUTO SHOP');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  assert.equal(manifest.theme_color, '#7c6cd8');
  assert.deepEqual(manifest.icons.map((i) => i.sizes), ['192x192', '512x512']);
  assert.match(sw, /const CACHE = 'np8-v\d+'/);
  for (const f of ['./index.html', './engine.js', './scene.js', './manifest.webmanifest']) {
    assert.ok(sw.includes(`'${f}'`), f);
  }
  assert.ok(sw.includes("keys.filter((k) => k !== CACHE && k.startsWith('np8-'))")); // ล้างแคชรุ่นเก่า
  assert.ok(sw.includes("caches.match('./index.html')")); // เปิดออฟไลน์ได้
});

test('เกม: เสิร์ฟที่ /game บนเซิร์ฟเวอร์เดิม แยกจากม่วงจด และไม่แคชหน้าเก่าค้าง', () => {
  assert.match(server, /app\.use\(\s*'\/game',\s*express\.static\('public\/game', \{\s*extensions: \['html'\],\s*setHeaders: \(res\) => res\.set\('Cache-Control', 'no-cache'\),\s*\}\)\s*\)/s);
});

test('เกม: ฟอร์มรับงานใหม่มีช่องครบตามสเปก + ตัวช่วยอ่านข้อความ', () => {
  for (const id of ['f-customer', 'f-kinds', 'f-title', 'f-qty', 'f-unit', 'f-received', 'f-due', 'f-urgent', 'f-assignee', 'f-note', 'p-text', 'p-parse']) {
    assert.ok(html.includes(`id="${id}"`), id);
  }
  assert.ok(html.includes('ตรวจก่อนบันทึกทุกครั้ง')); // ตัวช่วยแค่เติมช่อง คนเป็นผู้ยืนยัน
  assert.ok(html.includes('ตรวจความถูกต้องก่อนบันทึกนะคะ'));
});

test('เกม: แถวงานเป็น div role=button (ห้ามปุ่มซ้อนปุ่น) + กดคีย์บอร์ดเปิดได้', () => {
  // ปุ่ม ▲▼ อยู่ในแถว ถ้าแถวเป็น <button> เบราว์เซอร์จะดันปุ่มในหลุดออกนอกแถว
  assert.match(html, /<div class="jrow \$\{j\.priority === 'urgent' \? 'urgent' : ''\}" role="button" tabindex="0" data-open=/);
  assert.ok(!html.includes('<button class="jrow'), 'job row must not be a <button>');
  assert.match(html, /ev\.key === 'Enter' \|\| ev\.key === ' '/);
});

test('เกม: ภาพดีไซน์ที่อนุมัติถูกใช้เป็นฉาก/ไอคอนจริง และมีฉากสำรองถ้าภาพไม่มา', () => {
  // ไฟล์อาร์ตครบทุกชิ้นที่หน้าเพจ/sw อ้างถึง
  const art = ['scene-inside', 'hd-printer', 'hd-frames', 'tab-queue', 'tab-vinyl',
    'st-wait', 'st-doing', 'st-done', 'nav-home', 'nav-queue', 'nav-report', 'nav-set', 'job-printer'];
  for (const f of art) {
    const buf = readFileSync(new URL(`../public/game/art/${f}.png`, import.meta.url));
    assert.ok(buf.length > 200, f + ' exists');
    assert.equal(buf.toString('latin1', 1, 4), 'PNG', f + ' is png');
  }
  assert.ok(html.includes("artImg.src = './art/scene-inside.png'"));
  // โหลดภาพไม่ได้ → ใช้ฉากที่วาดด้วยโค้ด (drawScene เช็ก artImg ก่อน)
  assert.ok(html.includes('const artOn = () => artImg.complete && artImg.naturalWidth > 0'));
  assert.ok(scene.includes('else if (state.artImg && state.artImg.complete && state.artImg.naturalWidth) drawArtInside'));
  // ปุ่มรถส่งไวนิลใช้ปุ่มที่อยู่ในภาพ (โซน govinyl) แทนปุ่มลอย
  assert.ok(scene.includes("govinyl: { x: 628"));
  assert.ok(html.includes("if (z === 'govinyl') { setView('route'); return; }"));
  assert.ok(html.includes("$('btn-vinyl-go').hidden = v !== 'inside' || artOn();"));
  // กฎ display ของปุ่มลอยต้องไม่ทับ [hidden] (เคยเป็นบั๊ก)
  assert.ok(html.includes('.stage .go-vinyl[hidden] { display: none; }'));
  // sw แคชภาพฉากไว้ใช้ออฟไลน์
  assert.ok(sw.includes("'./art/scene-inside.png'"));
  assert.ok(sw.includes("'./art/job-printer.png'"));
});

test('เกม: localStorage มีกันพัง และย้ายคิวจากต้นแบบเก่าอัตโนมัติ', () => {
  assert.ok(html.includes("const KEY = 'np8_orders_v1'"));
  assert.ok(html.includes("const OLD_KEY = 'nattapron_vinyl_mobile_queue_v3'"));
  assert.match(html, /catch \{ storageOK = false; orders = E\.demoOrders\(\); \}/);
  assert.ok(html.includes('ส่งออกไฟล์สำรองก่อนปิดหน้านี้'));
});
