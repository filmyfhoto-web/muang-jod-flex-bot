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
  assert.match(html, /padding-bottom: calc\(78px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(html, /env\(safe-area-inset-top\)/);
  assert.ok(html.includes("font: 500 15.5px/1.5 'Noto Sans Thai'")); // น้ำหนักกลาง อ่านชัดตามที่ร้านขอ
});

test('เกม: ปุ่มแตะได้ขั้นต่ำ 44px ทั้งปุ่มทั่วไปและแท็บล่าง', () => {
  assert.match(html, /button \{ cursor: pointer; touch-action: manipulation; border: none; background: none; min-height: 44px; \}/);
  assert.match(html, /\.tabbar button \{[^}]*min-height: 54px/s);
  // จอคอมต้องเหมือนมือถือ: แถบล่างกว้างเท่าคอลัมน์แอป ไม่ยืดเต็มจอ
  assert.ok(html.includes('.tabbar { position: fixed; z-index: 50; left: 50%; transform: translateX(-50%); bottom: 0; width: min(520px, 100%);'));
  assert.ok(!html.includes('@media (min-width: 820px)'), 'game stays phone-width on desktop');
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
  for (const id of ['f-customer', 'f-kinds', 'f-items-list', 'f-add-item', 'f-received', 'f-due', 'f-urgent', 'f-assignee', 'f-note', 'p-text', 'p-parse']) {
    assert.ok(html.includes(`id="${id}"`), id);
  }
  assert.ok(html.includes('ตรวจก่อนบันทึกทุกครั้ง')); // ตัวช่วยแค่เติมช่อง คนเป็นผู้ยืนยัน
  assert.ok(html.includes('ตรวจความถูกต้องก่อนบันทึกนะคะ'));
  // ฟอร์มกระชับ (ร้านขอ): ช่องเสริมพับใน "แก้เพิ่มเติม" โชว์ประเภทปัจจุบันบนแถบ
  assert.ok(html.includes('<details class="fmore" id="f-more">'));
  assert.ok(html.includes('id="f-kind-now"'));
  assert.ok(html.includes("$('f-more').open = false;"));
  assert.ok(html.includes("$('f-more').open = true;"));
  // ปุ่ม .btn ต้องซ่อนได้จริง (display:inline-flex เคยทับ [hidden] ทำปุ่มลบโผล่)
  assert.ok(html.includes('.btn[hidden] { display: none; }'));
  // ฟิล์มเดินสุ่มได้ทั่วร้าน ไม่วนเส้นทางเดิม และกลับมาเดินต่อหลังถูกสั่งงาน
  assert.ok(html.includes('function wanderNext(w)'));
  assert.ok(html.includes("const ART_SPOT_KEYS = ['counter', 'prep', 'printer', 'copier', 'office', 'frame', 'sticker', 'stamp', 'photo', 'bench']"));
  assert.ok(html.includes("restorePath: art ? 'wander' : SC.WALK_LOOP"));
});

test('เกม: ใบจดหลายรายการต่อใบ (ลูกค้าทำหลายอย่าง) — ฟอร์ม/โมดัล/แถวคิว', () => {
  // กล่องใบจดรายการ + เพิ่ม/ลบแถว + หัวใบม่วงแบบใบจด
  assert.ok(html.includes('class="sliphead">🧾 ใบจดรายการ'));
  for (const c of ['it-title', 'it-qty', 'it-unit', 'it-del']) assert.ok(html.includes(`class="${c}"`), c);
  assert.ok(html.includes('＋ เพิ่มรายการ'));
  assert.ok(html.includes('บรรทัดละรายการ')); // ตัวช่วยอ่านรับหลายบรรทัด
  assert.ok(html.includes('E.parseThaiOrderLines('));
  // โมดัลโชว์ทุกรายการ และแถวคิวสรุปจำนวนรายการ
  assert.ok(html.includes('id="j-items"'));
  assert.ok(html.includes('รายการ (${items.length})'));
  assert.ok(html.includes("`${n} รายการ · ${esc(j.items.map((it) => it.title).join(', '))}`"));
  // บันทึกใช้ sanitizeItems และช่องเดี่ยวเดิม = รายการแรก (ของเก่าอ่านได้)
  assert.ok(html.includes('E.sanitizeItems(collectItems())'));
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

test('เกม: ตัวหนังสือคมบนมือถือ — แคนวาสตาม devicePixelRatio + ป้ายโซนวาดทับแบบคม', () => {
  // backing store = ขนาดแสดงผล × DPR แล้ว scale บริบท (ตัวหนังสือ/สไปรต์คมทุกจอ)
  assert.ok(html.includes('const dpr = Math.min(window.devicePixelRatio || 1, 3)'));
  assert.ok(html.includes('scene.scale = w / lw;'));
  assert.ok(html.includes('g.setTransform(scene.scale || 1, 0, 0, scene.scale || 1, 0, 0);'));
  // คลิกใช้พิกัด logical ไม่ใช่พิกเซลจอ
  assert.ok(html.includes('(scene.logicalW || cv.width)'));
  // ป้ายชื่อโซนในภาพถูกวาดทับด้วยฟอนต์จริง (ภาพ upscale แล้วป้ายเดิมมัว)
  // ป้ายโซนย่อให้ไม่เด่น (ร้านขอ) แต่กล่องยังคลุมป้ายเบลอเดิมในภาพ (minW/minH)
  assert.ok(scene.includes('function plateCover(g, text, cx, cy, minW = 0, size = 21, minH = 0)'));
  assert.ok(scene.includes('for (const [text, lx, ly, minW] of ART.labels) plateCover(g, text, lx, ly, minW, 15, 38);'));
  assert.ok(scene.includes("['เคาน์เตอร์รับงาน', 191, 629, 228]"));
  assert.ok(scene.includes("g.imageSmoothingQuality = 'high';"));
});

test('เกม: ฟิล์มมีชื่อลอยหัว + วิถีการทำงานหลังยืนยัน + มอไซค์แทนรถบรรทุก', () => {
  // ตัวละครหลักชื่อ "ฟิล์ม" (ร้านตั้ง) — ถ้าตั้ง "เครื่องนี้คือใคร" ใช้ชื่อนั้นแทน
  assert.ok(html.includes("scene.walkerName = settings.me || 'ฟิล์ม'"));
  assert.ok(scene.includes('export function nameTag(g, text, x, y)'));
  // ทีมงานในภาพตามที่ร้านตั้ง: หญิง (เคาน์เตอร์), เจ้ปิ่น (ยืนถืองาน), ประมวล (คอมหลังร้าน)
  assert.ok(scene.includes("people: [['หญิง', 222, 458], ['เจ้ปิ่น', 517, 430], ['ประมวล', 332, 94]]"));
  assert.ok(scene.includes('for (const [who, px_, py_] of ART.people) nameTag(g, who, px_, py_);'));
  // ยืนยันสถานะจริงแล้วตัวละครถึงออกไปทำ (ภาพตามหลังการยืนยัน ไม่ใช่ตัวเปลี่ยนสถานะ)
  assert.ok(html.includes('function playWorkFor(to, kind)'));
  assert.ok(html.includes('const went = playWorkFor(to, next.kind);'));
  assert.match(html, /case 'preparing':\s*\n\s*walkTo\('prep'/);
  assert.match(html, /case 'out_to_vinyl':[\s\S]{0,200}rideAnim\.mode = 'out'/);
  assert.match(html, /case 'back_at_shop':[\s\S]{0,200}rideAnim\.mode = 'back'/);
  assert.match(html, /case 'picked_up':\s*\n\s*scene\.dog\.heartUntil/);
  // มอไซค์ (ร้านจริงขับส่งงาน) แทนรถบรรทุกทุกจุด
  assert.ok(scene.includes('export function motoSprite'));
  assert.ok(!scene.includes('truckSprite'));
  assert.ok(html.includes('ให้มอไซค์วิ่งหนึ่งรอบ'));
  assert.ok(!html.includes('🚚'));
});

test('เกม: ห้องทำไวนิลจำลองจากรูปถ่ายห้องจริง + สลับเส้นทาง/ในห้อง + วิถีงานพาเข้าห้อง', () => {
  // ฉากห้อง: เครื่องพิมพ์ใหญ่ โต๊ะตัด ตอกตาไก่ ม้วนไวนิล โต๊ะคอม งานพิมพ์เสร็จ ทางเข้า(มอไซค์จอด)
  assert.ok(scene.includes('export function drawVinylRoom'));
  for (const z of ['printer', 'cut', 'eyelet', 'rolls', 'desk', 'banner', 'door']) {
    assert.ok(new RegExp(`${z}: \\{ x: `).test(scene), 'ROOM zone ' + z);
  }
  assert.ok(scene.includes("label: 'ตอกตาไก่'"));
  assert.ok(scene.includes('export function hitRoomZone'));
  // ปุ่มสลับ เส้นทาง ↔ ในห้องไวนิล + ป้ายความจริงของห้อง
  assert.ok(html.includes('id="v-route"') && html.includes('id="v-room"'));
  assert.ok(html.includes('ผังอิงรูปถ่ายห้อง'));
  // วิถีงาน: ถึงบ้านไวนิล (จบขาออก) และกดเริ่มผลิต → เข้าไปเห็นฟิล์มทำงานในห้อง
  assert.match(html, /case 'vinyl_production':\s*\n\s*roomWalkTo\('printer'/);
  assert.ok(html.includes("roomWalkTo('printer', scene.walkerName + 'ถึงบ้านไวนิลแล้ว"));
  assert.ok(html.includes("if (scene.view === 'vinylroom') {")); // แตะโซนในห้องมีป้ายบอก
});

test('เกม: localStorage มีกันพัง และย้ายคิวจากต้นแบบเก่าอัตโนมัติ', () => {
  assert.ok(html.includes("const KEY = 'np8_orders_v1'"));
  assert.ok(html.includes("const OLD_KEY = 'nattapron_vinyl_mobile_queue_v3'"));
  assert.match(html, /catch \{ storageOK = false; orders = E\.demoOrders\(\); \}/);
  assert.ok(html.includes('ส่งออกไฟล์สำรองก่อนปิดหน้านี้'));
});
