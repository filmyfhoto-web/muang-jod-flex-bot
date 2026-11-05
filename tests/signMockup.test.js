// นัดพอน Sign Mockup — ตรรกะล้วน: ขนาด ราคา ตาไก่ กล้อง และการบิดภาพตามมุมรูปจริง
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';

const require = createRequire(import.meta.url);
const C = require('../sign-mockup/core.js');

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

test('ราคา: ไวนิล 200×100 = 2 ตร.ม. × 150 = 300 บาท/ผืน, 3 ผืน = 900', () => {
  const q = C.quote({ type: 'vinyl', w: 200, h: 100, qty: 3, rate: '150' });
  assert.equal(q.has, true);
  near(q.area, 2);
  assert.equal(q.per, 300);
  assert.equal(q.total, 900);
  assert.equal(q.unit, 'sqm');
});

test('ราคา: โรลอัพคิดต่อชุด ไม่สนพื้นที่', () => {
  const q = C.quote({ type: 'rollup', w: 85, h: 200, qty: 2, rate: 950 });
  assert.equal(q.per, 950);
  assert.equal(q.total, 1900);
  assert.equal(q.unit, 'set');
});

test('ราคา: ไม่กรอกราคา → ไม่โชว์ราคา, จำนวนผิดถือเป็น 1', () => {
  const q = C.quote({ type: 'foam', w: 42, h: 59.4, qty: 'x', rate: '' });
  assert.equal(q.has, false);
  assert.equal(q.qty, 1);
  assert.equal(q.total, 0);
  // โฟมบอร์ด A2 = 0.25 ตร.ม. × 800 = 199.58 → ปัด 200
  assert.equal(C.quote({ type: 'foam', w: 42, h: 59.4, qty: 1, rate: 800 }).per, 200);
});

test('ข้อความขนาด: เกิน 1 เมตรมีหน่วยเมตรต่อท้าย', () => {
  assert.equal(C.sizeText(200, 100), '200 × 100 ซม. (2 × 1 ม.)');
  assert.equal(C.sizeText(85, 200), '85 × 200 ซม. (0.85 × 2 ม.)');
  assert.equal(C.sizeText(29.7, 42), '29.7 × 42 ซม.');
  assert.equal(C.fmtArea(200, 100), '2 ตร.ม.');
  assert.equal(C.fmtArea(29.7, 42), '0.12 ตร.ม.');
  assert.equal(C.baht(12500), '12,500');
});

test('ขนาดที่กรอก: ตัดค่าผิด ๆ และจำกัดช่วง', () => {
  assert.equal(C.clampCm('120', 1), 120);
  assert.equal(C.clampCm('1,200', 1), 1200);
  assert.equal(C.clampCm('abc', 77), 77);
  assert.equal(C.clampCm(1, 77), 5);
  assert.equal(C.clampCm(99999, 77), 2000);
  assert.equal(C.clampCm(29.74, 1), 29.7);
});

test('ตาไก่: 200×100 → มุม 4 + ขอบบน/ล่างข้างละ 3 + ข้างละ 1 = 12 ตัว ห่างไม่เกิน 50 ซม.', () => {
  const pts = C.eyelets(200, 100);
  assert.equal(pts.length, 12);
  const top = pts.filter((p) => p.side === 'top').map((p) => p.x).sort((a, b) => a - b);
  assert.equal(top.length, 5);
  near(top[0], 2.5);
  near(top[4], 197.5);
  for (let i = 1; i < top.length; i++) assert.ok(top[i] - top[i - 1] <= 50);
  // ป้ายเล็กเหลือแค่มุม
  assert.equal(C.eyelets(40, 30).length, 4);
});

test('รูปทรง: X-Stand กางขาตามแนวทแยง, โรลอัพมีฐาน, โครงมีความหนา', () => {
  const x = C.geometry('xstand', 60, 160);
  near(x.spread, (60 * 18) / 160);
  near(x.bw, 60 + 2 * x.spread);
  assert.equal(x.mount, 'floor');
  const r = C.geometry('rollup', 85, 200);
  assert.equal(r.fx, 4);
  assert.ok(r.bh > 200 && r.bh < 215);
  const f = C.geometry('frame', 200, 100);
  near(f.bw, 201.5);
  assert.equal(C.geometry('nope', 10, 10).type, 'vinyl');
});

test('กล้อง: ไวนิล 2 เมตรบนผนัง เห็นพื้น คนยืนข้าง ๆ ไม่ล้นจอ', () => {
  const g = C.geometry('vinyl', 200, 100);
  const cam = C.camera({ scene: 'wall', g, W: 1600, H: 1000, person: true, zoom: 1 });
  assert.equal(cam.person, true);
  assert.ok(cam.floorY < 1000, 'พื้นต้องอยู่ในภาพ');
  const topY = cam.floorY - cam.top * cam.s;
  assert.ok(topY >= 1000 * 0.07 - 1e-6, 'ขอบบนป้ายไม่ล้น');
  assert.ok(cam.left >= 0);
  const personRight = cam.personX + (C.PERSON.w / 2) * cam.s;
  assert.ok(personRight <= 1600);
});

test('กล้อง: ป้าย A3 ซูมเข้าให้เห็นงาน คนที่ใหญ่เกินจอถูกซ่อน', () => {
  const g = C.geometry('foam', 29.7, 42);
  const cam = C.camera({ scene: 'wall', g, W: 1600, H: 1000, person: true, zoom: 1 });
  assert.ok(g.bh * cam.s >= 1000 * 0.35, 'ป้ายสูงอย่างน้อย ~1/3 จอ');
  assert.equal(cam.person, false);
  const cy = cam.floorY - (cam.bottom + g.bh / 2) * cam.s;
  near(cy, 470, 1);
});

test('กล้อง: หน้าร้านแขวนป้ายเหนือประตูม้วน, โรลอัพตั้งพื้น', () => {
  const g = C.geometry('vinyl', 300, 100);
  assert.equal(C.mountBottom('shop', g), 290);
  assert.equal(C.mountBottom('shop', C.geometry('rollup', 85, 200)), 0);
  const cam = C.camera({ scene: 'shop', g, W: 1600, H: 1000, person: true });
  assert.ok(cam.floorY - cam.top * cam.s >= 69);
});

test('ผืนภาพ: อัตโนมัติ — ป้ายตั้งใช้แนวตั้ง, รูปลูกค้าใช้สัดส่วนรูป', () => {
  assert.deepEqual(C.canvasSize('auto', C.geometry('rollup', 85, 200)), { W: 1200, H: 1500 });
  assert.deepEqual(C.canvasSize('auto', C.geometry('vinyl', 200, 100)), { W: 1600, H: 1000 });
  assert.deepEqual(C.canvasSize('square', C.geometry('vinyl', 200, 100)), { W: 1300, H: 1300 });
  assert.deepEqual(C.canvasSize('auto', null, { w: 4000, h: 3000 }), { W: 1600, H: 1200 });
  assert.deepEqual(C.canvasSize('auto', null, { w: 3000, h: 4000 }), { W: 1200, H: 1600 });
});

test('สัดส่วนรูป: ปรับความสูงป้ายตามรูป และบอกเมื่อไม่ตรง', () => {
  assert.equal(C.heightForImage(200, 3000, 1500), 100);
  assert.equal(C.heightForImage(85, 850, 2000), 200);
  assert.equal(C.ratioMismatch(200, 100, 3000, 1500), false);
  assert.equal(C.ratioMismatch(200, 100, 1000, 1000), true);
  const cr = C.coverCrop(1000, 1000, 200, 100);
  near(cr.sw, 1000);
  near(cr.sh, 500);
  near(cr.sy, 250);
  const ct = C.containRect(1000, 1000, 200, 100);
  near(ct.dw, 100);
  near(ct.dx, 50);
});

test('โฮโมกราฟี: มุมทั้งสี่ตรงจุด และสี่เหลี่ยมผืนผ้าเป็นการย่อขยายธรรมดา', () => {
  const q = [{ x: 100, y: 80 }, { x: 520, y: 120 }, { x: 500, y: 400 }, { x: 90, y: 360 }];
  const H = C.homography(q);
  const corners = [[0, 0], [1, 0], [1, 1], [0, 1]];
  corners.forEach(([u, v], i) => {
    const p = C.project(H, u, v);
    near(p.x, q[i].x, 1e-6);
    near(p.y, q[i].y, 1e-6);
  });
  const R = C.homography([{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 100 }, { x: 0, y: 100 }]);
  const mid = C.project(R, 0.5, 0.5);
  near(mid.x, 100);
  near(mid.y, 50);
  assert.equal(C.isConvex(q), true);
  assert.equal(C.isConvex([q[0], q[2], q[1], q[3]]), false);
  assert.equal(C.pointInQuad({ x: 300, y: 240 }, q), true);
  assert.equal(C.pointInQuad({ x: 10, y: 10 }, q), false);
});

test('ข้อความเล็ก ๆ: เบอร์โทร วันที่ไทย ป้ายชื่อขนาดสำเร็จรูป', () => {
  assert.equal(C.phoneText('081-234-5678'), 'โทร 081-234-5678');
  assert.equal(C.phoneText('โทร 02-111'), 'โทร 02-111');
  assert.equal(C.phoneText('  '), '');
  assert.equal(C.thaiDate(new Date(2026, 10, 5)), '5 พ.ย. 2569');
  assert.equal(C.presetLabel([42, 59.4, 'A2']), 'A2');
  assert.equal(C.presetLabel([200, 100]), '200×100');
});

test('ราคา: เศษสตางค์ปัดขึ้นเป็นบาท — 300×202.5 = 6.075 ตร.ม. × 150 = 911.25 → 912', () => {
  const q = C.quote({ type: 'vinyl', w: 300, h: 202.5, qty: 2, rate: 150 });
  assert.equal(q.per, 912);
  assert.equal(q.total, 1824);
  assert.equal(C.fmtAreaExact(300, 202.5), '6.075 ตร.ม.');
  assert.equal(C.fmtArea(300, 202.5), '6.08 ตร.ม.');
});

const app = (p) => new URL(`../sign-mockup/${p}`, import.meta.url);

test('ติดตั้งเป็นแอปได้: manifest ครบ ไอคอนมีไฟล์จริง และหน้าเว็บเชื่อมไว้', () => {
  const m = JSON.parse(readFileSync(app('manifest.webmanifest'), 'utf8'));
  assert.equal(m.display, 'standalone');
  assert.equal(m.start_url, './');
  assert.equal(m.scope, './');
  const sizes = m.icons.map((i) => i.sizes);
  assert.ok(sizes.includes('192x192') && sizes.includes('512x512'), 'Chrome ต้องมีไอคอน 192 และ 512');
  assert.ok(m.icons.some((i) => i.purpose === 'maskable'));
  for (const icon of m.icons) assert.ok(existsSync(app(icon.src)), `ไอคอน ${icon.src} ไม่มีไฟล์จริง`);
  const html = readFileSync(app('index.html'), 'utf8');
  assert.ok(html.includes('href="manifest.webmanifest"'));
  assert.ok(html.includes('id="installBtn"'), 'ต้องมีปุ่มติดตั้งโปรแกรม');
  for (const js of ['core.js', 'render.js', 'app.js']) assert.ok(html.includes(`src="${js}"`), `หน้าเว็บไม่ได้โหลด ${js}`);
});

test('service worker: ไฟล์ที่เก็บไว้ใช้ออฟไลน์มีอยู่จริงทุกไฟล์ (ขาดไฟล์เดียวติดตั้งไม่ผ่าน)', () => {
  const sw = readFileSync(app('sw.js'), 'utf8');
  const list = sw.match(/var APP = \[([\s\S]*?)\];/)[1].match(/'([^']+)'/g).map((s) => s.slice(1, -1));
  assert.ok(list.length >= 8);
  for (const f of list) if (f !== './') assert.ok(existsSync(app(f)), `sw.js อ้าง ${f} แต่ไม่มีไฟล์`);
  for (const f of ['index.html', 'app.css', 'core.js', 'render.js', 'app.js']) assert.ok(list.includes(f), `sw.js ไม่ได้เก็บ ${f}`);
});

test('เซิร์ฟเวอร์บอตเสิร์ฟแอปที่ /sign', () => {
  const server = readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
  assert.match(server, /app\.use\(\s*'\/sign',\s*express\.static\('sign-mockup'/);
});
