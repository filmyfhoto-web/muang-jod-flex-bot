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

test('ป้ายกล่องไฟ: หนา 12 ซม. ขอบอะลูมิเนียม 4 ซม. คิดราคาต่อ ตร.ม. ติดผนัง', () => {
  assert.ok(C.TYPE_ORDER.includes('lightbox'));
  const g = C.geometry('lightbox', 120, 60);
  assert.equal(g.depth, 12);
  assert.equal(g.rim, 4);
  assert.equal(g.mount, 'wall');
  assert.ok(g.ex <= 3, 'ภาพ 2 มิติโชว์ความหนาเฉียงไม่เกิน 3 ซม.');
  assert.equal(C.quote({ type: 'lightbox', w: 120, h: 60, qty: 1, rate: 3500 }).per, 2520);
  for (const k of C.TYPE_ORDER) assert.ok(C.TYPES[k].presets.length >= 2, `${k} ต้องมีขนาดสำเร็จรูป`);
});

test('3 มิติ: import map ชี้ three.js ในเครื่อง และไฟล์ที่ scene3d.js ใช้มีครบ (ใช้ออฟไลน์ได้)', () => {
  const html = readFileSync(app('index.html'), 'utf8');
  const map = JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;
  assert.equal(map.three, './vendor/three.module.min.js');
  assert.ok(existsSync(app(map.three.slice(2))));
  assert.ok(html.includes('<script type="module" src="scene3d.js"></script>'));
  // module ต้องโหลดหลัง importmap
  assert.ok(html.indexOf('type="importmap"') < html.indexOf('type="module"'));
  const src = readFileSync(app('scene3d.js'), 'utf8');
  const addons = [...src.matchAll(/from 'three\/addons\/([^']+)'/g)].map((m) => m[1]);
  assert.ok(addons.length >= 3);
  for (const a of addons) assert.ok(existsSync(app('vendor/addons/' + a)), `ไม่มี vendor/addons/${a}`);
  const sw = readFileSync(app('sw.js'), 'utf8');
  for (const a of addons) assert.ok(sw.includes(`'vendor/addons/${a}'`), `sw.js ไม่ได้เก็บ ${a} ไว้ใช้ออฟไลน์`);
  assert.ok(sw.includes("'scene3d.js'") && sw.includes("'vendor/three.module.min.js'"));
});

test('ฉากประตู/ห้องเรียน: ป้ายเล็กติดบนบานระดับสายตา ป้ายใหญ่ติดเหนือวงกบ', () => {
  for (const k of ['classDoor', 'officeDoor', 'classroom']) assert.ok(C.SCENE_ORDER.includes(k), k);
  assert.equal(C.SCENE_ORDER[C.SCENE_ORDER.length - 1], 'photo');
  const plate = C.geometry('acrylic', 30, 10);
  assert.equal(C.resolveSpot('classDoor', 'auto', plate), 'door');
  assert.equal(C.mountBottom('classDoor', plate, 'auto'), 145); // กลางป้าย 150 ซม.
  const big = C.geometry('vinyl', 150, 40);
  assert.equal(C.resolveSpot('officeDoor', 'auto', big), 'above');
  assert.equal(C.mountBottom('officeDoor', big, 'auto'), 222); // เหนือประตู 210 + วงกบ
  // ป้ายสูงบนบานประตูไม่ทะลุขอบบนประตู
  const tall = C.geometry('foam', 60, 90);
  assert.ok(C.mountBottom('classDoor', tall, 'door') + 90 <= C.DOOR.h - 8);
  assert.equal(C.mountBottom('classDoor', C.geometry('vinyl', 60, 40), 'beside'), 130);
  // ห้องเรียน: เหนือกระดาน (ขอบบนกระดาน 210 + 15) และไม่มี "บนประตู"
  assert.equal(C.resolveSpot('classroom', 'door', big), 'above');
  assert.equal(C.mountBottom('classroom', big, 'above'), 225);
  // ฉากเดิมไม่สนตำแหน่ง
  assert.equal(C.resolveSpot('wall', 'door', big), null);
  assert.equal(C.mountBottom('shop', big, 'door'), 290);
});

test('สติ๊กเกอร์: แนบผิว ไม่มีความหนา ไม่มีระยะห่างจากผนัง คิดราคาต่อ ตร.ม.', () => {
  const g = C.geometry('sticker', 60, 20);
  assert.equal(g.depth, 0);
  assert.equal(g.gap, 0);
  assert.equal(g.mount, 'wall');
  assert.equal(C.quote({ type: 'sticker', w: 60, h: 20, qty: 10, rate: 400 }).total, 480);
});

test('ป้ายเต็มบานประตูห้องเรียน 80×200: ติดเต็มบานอัตโนมัติ บานประตูใหญ่กว่าป้ายขอบละ 1.5 ซม.', () => {
  const g = C.geometry('vinyl', 80, 200);
  assert.equal(C.resolveSpot('classDoor', 'auto', g), 'full');
  assert.deepEqual(C.doorSize('classDoor', 'auto', g), { w: 83, h: 204 });
  const bottom = C.mountBottom('classDoor', g, 'auto');
  assert.equal(bottom, 2.5);
  assert.ok(bottom + 200 <= 204, 'ป้ายต้องอยู่ในบานประตู');
  // ป้ายเล็กยังติดบนบานขนาดมาตรฐาน
  assert.deepEqual(C.doorSize('classDoor', 'auto', C.geometry('acrylic', 40, 15)), { w: 90, h: 210 });
  // มีขนาดสำเร็จรูปประตูในไวนิลและสติ๊กเกอร์
  assert.ok(C.TYPES.vinyl.presets.some((p) => p[0] === 80 && p[1] === 200));
  assert.ok(C.TYPES.sticker.presets.some((p) => p[0] === 80 && p[1] === 200));
  // สีผนังอาคารเรียน: ชมพู-ฟ้าแบบรูปที่ร้านส่งมา
  assert.equal(C.TONE_ORDER[0], 'pink');
  for (const k of C.TONE_ORDER) assert.match(C.WALL_TONES[k].lower, /^#[0-9a-f]{6}$/);
  assert.ok(C.SCENES.classDoor.canOpen);
});

test('ใบเสนอราคา: เลขที่ตามวันเวลา (ปี พ.ศ.) และยอดเงินเป็นตัวหนังสือ', () => {
  assert.equal(C.quoteNo(new Date(2026, 10, 5, 14, 3)), 'Q691105-1403');
  assert.equal(C.bahtText(0), 'ศูนย์บาทถ้วน');
  assert.equal(C.bahtText(11), 'สิบเอ็ดบาทถ้วน');
  assert.equal(C.bahtText(21), 'ยี่สิบเอ็ดบาทถ้วน');
  assert.equal(C.bahtText(101), 'หนึ่งร้อยเอ็ดบาทถ้วน');
  assert.equal(C.bahtText(1520), 'หนึ่งพันห้าร้อยยี่สิบบาทถ้วน');
  assert.equal(C.bahtText('2,021'), 'สองพันยี่สิบเอ็ดบาทถ้วน');
  assert.equal(C.bahtText(1000000), 'หนึ่งล้านบาทถ้วน');
  assert.equal(C.bahtText(11000000), 'สิบเอ็ดล้านบาทถ้วน');
  assert.equal(C.bahtText(12.5), 'สิบสองบาทห้าสิบสตางค์');
  // ความหนาแกน Z มีครบทุกชนิดป้าย (โชว์ในกล่องขนาด)
  for (const k of C.TYPE_ORDER) assert.ok(C.DEPTH[k], k);
});

test('PDF ใบเสนอราคา: ไฟล์ถูกโครงสร้าง (xref ชี้ตำแหน่ง obj ถูกทุกตัว) ฝังรูป JPEG เต็มหน้า A4', () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 0xff, 0xd9]);
  const pdf = C.pdfFromJpeg(jpeg, 1240, 1754);
  const s = Buffer.from(pdf).toString('latin1');
  assert.ok(s.startsWith('%PDF-1.4'));
  assert.ok(s.trimEnd().endsWith('%%EOF'));
  assert.match(s, /\/MediaBox \[0 0 595\.28 841\.89\]/);
  assert.match(s, /\/Width 1240 \/Height 1754 .*\/Filter \/DCTDecode \/Length 10/);
  // รูปฝังทั้งไฟล์ไม่เพี้ยน
  const at = s.indexOf('stream\n') + 7;
  assert.deepEqual([...pdf.slice(at, at + jpeg.length)], [...jpeg]);
  // xref: ตำแหน่งของ obj 1..5 ตรงจริง และ startxref ชี้ตาราง xref
  const startxref = +s.match(/startxref\n(\d+)/)[1];
  assert.equal(s.slice(startxref, startxref + 4), 'xref');
  const rows = s.slice(startxref).split('\n').slice(3, 8);
  rows.forEach((r, i) => {
    const off = +r.slice(0, 10);
    assert.equal(s.slice(off, off + `${i + 1} 0 obj`.length), `${i + 1} 0 obj`);
  });
  // ความยาว content stream ตรงกับที่ประกาศ
  const m = s.match(/5 0 obj\n<< \/Length (\d+) >>\nstream\n([^\n]*)\nendstream/);
  assert.equal(+m[1], m[2].length);
});

test('อัปเดตอัตโนมัติ: รุ่นใน app.js ตรงกับ service worker และไฟล์ใหม่ (งานของฉัน / ส่งออก 3 มิติ) เก็บออฟไลน์ครบ', () => {
  const app = readFileSync(new URL('../sign-mockup/app.js', import.meta.url), 'utf8');
  const sw = readFileSync(new URL('../sign-mockup/sw.js', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../sign-mockup/index.html', import.meta.url), 'utf8');
  const appVer = app.match(/APP_VERSION = '([\d.]+)'/)[1];
  const swVer = sw.match(/VERSION = 'sign-mockup-([\d.]+)'/)[1];
  assert.equal(appVer, swVer, 'เลื่อนรุ่นใน app.js กับ sw.js ให้ตรงกัน ไม่งั้นแอปที่ติดตั้งไว้ไม่อัปเดต');
  for (const f of ['jobs.js', 'vendor/addons/exporters/GLTFExporter.js', 'vendor/addons/utils/TextureUtils.js']) {
    assert.ok(sw.includes(`'${f}'`), f);
    assert.ok(existsSync(new URL('../sign-mockup/' + f, import.meta.url)), f);
  }
  // jobs.js ต้องโหลดก่อน app.js
  assert.ok(html.indexOf('src="jobs.js"') > 0 && html.indexOf('src="jobs.js"') < html.indexOf('src="app.js"'));
  assert.match(app, /reg\.update\(\)/);
  assert.match(app, /controllerchange/);
  // ตัวส่งออก glb import แบบ dynamic ผ่าน import map
  const s3 = readFileSync(new URL('../sign-mockup/scene3d.js', import.meta.url), 'utf8');
  assert.match(s3, /import\('three\/addons\/exporters\/GLTFExporter\.js'\)/);
});

test('ทุก id ที่ app.js เรียกด้วย $(...) มีอยู่จริงใน index.html', () => {
  const app = readFileSync(new URL('../sign-mockup/app.js', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../sign-mockup/index.html', import.meta.url), 'utf8');
  const ids = new Set([...app.matchAll(/\$\('([A-Za-z0-9_-]+)'\)/g)].map((m) => m[1]));
  const missing = [...ids].filter((id) => !html.includes(`id="${id}"`));
  assert.deepEqual(missing, []);
});

test('ทุกชนิดป้ายมีไอคอนบนการ์ด (ไม่โชว์คำว่า undefined)', () => {
  const app = readFileSync(new URL('../sign-mockup/app.js', import.meta.url), 'utf8');
  const block = app.slice(app.indexOf('var TYPE_ICON = {'), app.indexOf('function buildTypes'));
  for (const k of C.TYPE_ORDER) assert.match(block, new RegExp(`\\n\\s+${k}:\\s*\\n?\\s*'<svg`), k);
});

test('โลโก้ร้าน NATTAPRON: ไฟล์มีจริง ใช้ที่แถบบน/ใบเสนอราคา/เสื้อตัวการ์ตูน และเก็บไว้ใช้ออฟไลน์', () => {
  const html = readFileSync(new URL('../sign-mockup/index.html', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../sign-mockup/app.js', import.meta.url), 'utf8');
  const sw = readFileSync(new URL('../sign-mockup/sw.js', import.meta.url), 'utf8');
  const s3 = readFileSync(new URL('../sign-mockup/scene3d.js', import.meta.url), 'utf8');
  for (const f of ['brand/ntp-logo.png', 'brand/ntp-mark.png']) {
    assert.ok(existsSync(new URL('../sign-mockup/' + f, import.meta.url)), f);
    assert.ok(html.includes(f), 'index.html ' + f);
    assert.ok(app.includes(`'${f}'`), 'app.js ' + f);
    assert.ok(sw.includes(`'${f}'`), 'sw.js ' + f);
  }
  // PNG จริง (ไม่ใช่ไฟล์เสีย) และเล็กพอโหลดเร็ว
  for (const f of ['brand/ntp-logo.png', 'brand/ntp-mark.png', 'icons/icon-512.png']) {
    const b = readFileSync(new URL('../sign-mockup/' + f, import.meta.url));
    assert.deepEqual([...b.slice(0, 4)], [0x89, 0x50, 0x4e, 0x47], f);
    assert.ok(b.length < 80 * 1024, f + ' ' + b.length);
  }
  // คนเทียบขนาด = รูปการ์ตูนเจ้าของร้าน (ทั้ง 3 มิติ และ 2 มิติ) เก็บไว้ใช้ออฟไลน์
  const m = 'brand/mascot.webp';
  const b = readFileSync(new URL('../sign-mockup/' + m, import.meta.url));
  assert.equal(b.slice(0, 4).toString('latin1'), 'RIFF');
  assert.equal(b.slice(8, 12).toString('latin1'), 'WEBP');
  assert.ok(b.length < 120 * 1024, m + ' ' + b.length);
  assert.ok(app.includes(`'${m}'`) && sw.includes(`'${m}'`));
  assert.match(s3, /NS\.BRAND && NS\.BRAND\.mascot/);
  assert.match(app, /R\.setMascot\(img\)/);
});

test('ป้ายโครงการ CNC: ตั้งเสาคู่ แผ่นลอยจากพื้น 80 ซม. อักษรนูน 1.5 ซม. คิดราคาต่อป้าย', () => {
  assert.ok(C.TYPE_ORDER.includes('cnc'));
  const g = C.geometry('cnc', 240, 120);
  assert.equal(g.mount, 'floor');
  assert.equal(g.lift, 80);
  assert.equal(g.relief, 1.5);
  assert.equal(g.fx, g.post); // แผ่นอยู่ระหว่างเสา
  assert.equal(g.bw, 240 + 2 * g.post + g.ex);
  assert.equal(g.bh, g.cap + 120 + 80 + g.ex);
  assert.equal(C.mountBottom('shop', g, 'auto'), 0);
  const q = C.quote({ type: 'cnc', w: 240, h: 120, qty: 2, rate: 8500 });
  assert.equal(q.unit, 'set');
  assert.equal(q.total, 17000);
  assert.ok(C.DEPTH.cnc);
  // คนสูง 170 ซม. ยืนข้างป้ายได้พอดีจอ
  const cam = C.camera({ scene: 'studio', g, W: 1600, H: 1132, person: true, zoom: 1 });
  assert.ok(cam.person);
});

test('ป้ายโครงการ CNC เลือก "ไม่มีเสา ติดผนัง" ได้: ไม่มีเสา/ฐาน ติดผนังตามฉาก · ค่าเริ่มต้นยังมีเสา', async () => {
  assert.equal(C.cncPosts(undefined), true);
  assert.equal(C.cncPosts({ color: '#1f2125' }), true);
  assert.equal(C.cncPosts({ posts: false }), false);
  const g = C.geometry('cnc', 240, 120, { posts: false });
  assert.equal(g.mount, 'wall');
  assert.equal(g.noPosts, true);
  assert.equal(g.lift, 0);
  assert.equal(g.fx, 0);
  assert.equal(g.bw, 240 + g.ex);
  assert.equal(g.bh, 120 + g.ex);
  assert.equal(g.relief, 1.5);
  assert.equal(C.mountBottom('shop', g, 'auto'), 290); // เหนือประตูม้วนหน้าร้าน
  assert.ok(C.mountBottom('wall', g, 'auto') > 0);
  const { readFileSync } = await import('node:fs');
  const html = readFileSync(new URL('../sign-mockup/index.html', import.meta.url), 'utf8');
  assert.match(html, /id="cncPostSeg"[\s\S]*data-posts="1"[\s\S]*data-posts="0"/);
  const app = readFileSync(new URL('../sign-mockup/app.js', import.meta.url), 'utf8');
  assert.match(app, /setSteel\('posts', on\)/);
  const s3 = readFileSync(new URL('../sign-mockup/scene3d.js', import.meta.url), 'utf8');
  assert.match(s3, /C\.geometry\('cnc', w \* 100, h \* 100, steel\)/);
  assert.match(s3, /model\.floor = C\.geometry\(s\.type/);
});

test('โครงเหล็กขาตั้ง 80×120 สูงรวม 150 ฐานลึก 60 เหล็ก 25 มม. เข้ามุม 45°: 9 ชิ้น รวม 805 ซม. (ตรงกับโปรแกรมช่าง)', () => {
  const r = C.steelCut('stand', 80, 120, {});
  assert.equal(r.opts.total, 150);
  assert.equal(r.opts.depth, 60);
  assert.equal(r.opts.nh, 1);
  assert.equal(r.opts.nv, 0);
  assert.equal(r.pieces, 9);
  assert.equal(r.total, 805);
  const len = Object.fromEntries(r.parts.map((p) => [p.name, [p.qty, p.len]]));
  assert.deepEqual(len['เสาและกรอบแนวตั้ง'], [2, 147.5]);
  assert.deepEqual(len['คานกรอบบน'], [1, 80]);
  assert.deepEqual(len['คานกรอบล่าง'], [1, 75]);
  assert.deepEqual(len['คร่าวนอน'], [1, 75]);
  assert.deepEqual(len['ฐานแนวลึก'], [2, 60]);
  assert.deepEqual(len['คานฐานแนวขวาง'], [2, 80]);
  assert.equal(r.opts.bayW, 75);
  assert.equal(r.opts.bayH, 56.3);
  // เหล็กเส้น 6 ม. 2 เส้น (เผื่อคมเลื่อย 3 มม.)
  assert.equal(r.pack.count, 2);
  for (const b of r.pack.bars) {
    const used = b.cuts.reduce((s, c) => s + c, 0) + (b.cuts.length - 1) * C.KERF;
    assert.ok(used <= C.STOCK + 1e-9);
    assert.ok(Math.abs(C.STOCK - used - b.left) < 0.11);
  }
  // 25×25×1.2 มม. ≈ 0.897 กก./ม. → 8.05 ม. ≈ 7.2 กก.
  assert.equal(r.kgPerM, 0.897);
  assert.equal(r.kg, 7.2);
});

test('โครงเหล็ก: ตัดตรงชนคานอยู่ระหว่างเสา, ขาตัว T, กรอบติดผนัง, ปรับค่าเอง และเหล็กยาวเกิน 6 ม.', () => {
  const butt = C.steelCut('stand', 80, 120, { cut: 'butt' });
  assert.equal(butt.total, 790); // คานบน + คานฐาน 2 เส้น สั้นลงข้างละ 2.5
  const feet = C.steelCut('stand', 80, 120, { base: 'feet' });
  assert.equal(feet.parts.find((p) => p.name.startsWith('ขาฐาน')).qty, 2);
  assert.ok(!feet.parts.some((p) => p.name === 'คานฐานแนวขวาง'));
  const wall = C.steelCut('wall', 300, 150, {});
  assert.deepEqual(wall.parts.map((p) => p.name), ['กรอบแนวตั้ง', 'กรอบแนวนอน', 'คร่าวนอน', 'คร่าวตั้ง']);
  assert.equal(wall.opts.nv, 2);
  assert.equal(wall.parts.find((p) => p.name === 'คร่าวตั้ง').qty, 6); // 2 แถว × (คร่าวนอน 2 + 1) ช่อง
  const custom = C.steelCut('stand', 120, 180, { total: 250, depth: 90, nh: 0, nv: 2, tube: 38, wall: 2, price: 450 });
  assert.equal(custom.opts.total, 250);
  assert.equal(custom.opts.depth, 90);
  assert.equal(custom.opts.nh, 0);
  assert.equal(custom.opts.nv, 2);
  assert.equal(custom.cost, custom.pack.count * 450);
  // ความสูงรวมต่ำกว่าป้ายไม่ได้
  assert.equal(C.steelOpts(80, 120, { total: 50 }).total, 122.5);
  const big = C.packBars([700, 300, 300]);
  assert.deepEqual(big.over, [700]);
  assert.equal(big.count, 2); // 300 + 300 + คมเลื่อย 3 มม. เกิน 6 ม. → ต้องใช้ 2 เส้น
  assert.equal(C.packBars([300, 299.7]).count, 1);
  // ชนิดป้ายขาตั้ง: สูงรวม/ฐานจากตั้งค่าโครงเหล็ก
  const g = C.geometry('stand', 80, 120, { total: 180 });
  assert.equal(g.mount, 'floor');
  assert.equal(g.lift, 60);
  assert.equal(g.total, 180);
});

test('ตัวเลือกของร้าน: ไฟล์นำเข้าถูกตรวจทุกช่อง (สี #rrggbb เท่านั้น ชื่อไม่มีแท็ก) สีผนังเพิ่ม/ลบได้', () => {
  const o = C.normalizeOptions({
    themes: [{ id: 'c-abc', name: '<img src=x onerror=1>แดง', bg: '#FF0000', bg2: 'red;background:url(x)', title: '#fff', pillBg: '#00ff00' }, 'x', null],
    tones: [{ name: 'ฟ้า', upper: '#aaccee', lower: '#336699' }],
    presets: { vinyl: [[150, 60], [150, 60], ['x', 1]], bogus: [[1, 1]] },
    hideTypes: ['xstand', 'nope', 'xstand'],
    hideScenes: ['brick'],
  });
  assert.equal(o.themes.length, 3);
  assert.equal(o.themes[0].id, 'c-abc');
  assert.equal(o.themes[0].bg, '#ff0000');
  assert.equal(o.themes[0].bg2, '#2d3d6b'); // ค่าแปลก ๆ ใช้ค่าเริ่มต้น
  assert.equal(o.themes[0].title, '#ffffff');
  assert.ok(!/[<>]/.test(o.themes[0].name));
  for (const t of o.themes) {
    assert.match(t.id, /^c-[a-z0-9_-]+$/i);
    for (const k of ['bg', 'bg2', 'title', 'sub', 'pillBg', 'pillFg']) assert.match(t[k], /^#[0-9a-f]{6}$/);
  }
  assert.deepEqual(o.presets, { vinyl: [[150, 60]] });
  assert.deepEqual(o.hideTypes, ['xstand']);
  assert.deepEqual(o.hideScenes, ['brick']);
  // ซ่อนชนิดป้ายหมดไม่ได้
  assert.equal(C.normalizeOptions({ hideTypes: C.TYPE_ORDER }).hideTypes.length, C.TYPE_ORDER.length - 1);
  // สีผนังของร้านต่อท้ายสีมาตรฐาน แล้วลบออกได้
  const before = C.TONE_ORDER.slice();
  C.applyTones(o.tones);
  const id = o.tones[0].id;
  assert.equal(C.TONE_ORDER[C.TONE_ORDER.length - 1], id);
  assert.equal(C.WALL_TONES[id].upper, '#aaccee');
  C.applyTones([]);
  assert.deepEqual(C.TONE_ORDER, before);
  assert.equal(C.WALL_TONES[id], undefined);
  // สีโครงเหล็ก / ฟอนต์
  assert.equal(C.metalColor('inox'), 'inox');
  assert.equal(C.metalColor('url(javascript:x)'), '#1f2125');
  assert.equal(C.steelOpts(80, 120, { color: '#E9E8E4' }).color, '#e9e8e4');
  assert.equal(C.fontCssUrl('Chakra Petch'), 'https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@400;500;600;700&display=swap');
  assert.equal(C.fontCssUrl('Itim'), 'https://fonts.googleapis.com/css2?family=Itim&display=swap');
  assert.equal(C.fontCssUrl('NotAFont'), '');
});

test('บัตร/บัตรสมนาคุณ: ชนิดใหม่ คิดราคาต่อใบ · เลขรันเติม 0 ครบหลัก · ตำแหน่งเลข + ต้นขั้ว', () => {
  assert.ok(C.TYPE_ORDER.includes('card'));
  assert.equal(C.TYPES.card.unit, 'pcs');
  assert.equal(C.TYPES.card.small, true);
  const g = C.geometry('card', 18, 7);
  assert.equal(g.type, 'card');
  assert.equal(g.mount, 'wall');
  assert.ok(g.depth > 0 && g.depth < 0.1);
  const q = C.quote({ type: 'card', w: 18, h: 7, qty: 500, rate: 2.5 });
  assert.equal(q.unit, 'pcs');
  assert.equal(q.total, 1500); // ราคาต่อใบปัดเป็นบาท (3) × 500
  assert.ok(C.depthText('card'));

  const r = C.normalizeRun({ prefix: 'No.', start: 95, digits: 4, pos: 'br', stub: 5, color: 'red', size: 'xl' });
  assert.equal(r.color, '#c8102e'); // สีผิดรูปแบบ → ค่าเริ่มต้น
  assert.equal(r.size, 'm');
  assert.equal(C.runText(r, 0), 'No.0095');
  assert.equal(C.runText(r, 10), 'No.0105');
  assert.equal(C.runDigits(C.normalizeRun({ start: 12345, digits: 3 }), 0), '12345'); // เลขยาวกว่าหลักไม่ตัดทิ้ง
  assert.equal(C.normalizeRun({ prefix: '<b>เลขที่ (A)' }).prefix, 'bเลขที่ A'); // ตัดอักขระที่ทำให้ PDF/HTML พัง
  const lay = C.runSlots(r, 18, 7);
  assert.equal(lay.stub, 5);
  assert.equal(lay.slots.length, 2);
  const main = lay.slots[0];
  assert.equal(main.anchor, 'right');
  assert.equal(main.x, 17.5);
  assert.equal(main.y, 6.5); // ล่าง: ห่างขอบ 5 มม.
  assert.equal(lay.slots[1].anchor, 'center');
  assert.equal(lay.slots[1].x, 2.5);
  // ต้นขั้วกว้างจนเหลือที่ไม่พอ → ไม่ทำต้นขั้ว
  assert.equal(C.runSlots(C.normalizeRun({ stub: 17 }), 18, 7).stub, 0);
  // ข้อความชิดขวา: ตัวเลขจบพอดีขอบขวา
  const lab = C.runLabel(main, 0.6, 4);
  assert.ok(Math.abs(lab.digitsX + 4 * C.DIGIT_EM * main.size - 17.5) < 1e-9);
  assert.ok(Math.abs(lab.left - (lab.digitsX - 0.6)) < 1e-9);
});

test('จัดหน้าพิมพ์บัตร: เผื่อตัดตก 2 มม. ขอบกระดาษ 1.2 ซม. เลือกแนวที่ได้มากกว่า · เส้นตัดอยู่นอกบัตร', () => {
  const a4 = C.impose(18, 7, 21, 29.7);
  assert.equal(a4.rot, false);
  assert.equal(a4.n, 3);
  assert.equal(a4.gap, 0.4);
  const a3 = C.impose(18, 7, 29.7, 42);
  assert.equal(a3.rot, true); // หมุนบัตรได้ 6 ใบ (ไม่หมุนได้ 5)
  assert.equal(a3.n, 6);
  const nc = C.impose(9, 5.5, 21, 29.7);
  assert.equal(nc.n, 8); // นามบัตร 9×5.5 บน A4 = 2 × 4
  // ทุกใบ (รวมตัดตก) อยู่ในกระดาษ ห่างขอบอย่างน้อย 1.2 − 0.2 ซม. และไม่ทับกัน
  for (const L of [a4, a3, nc]) {
    for (const c of L.cells) {
      assert.ok(c.x - L.bleed >= 1 - 1e-9 && c.y - L.bleed >= 1 - 1e-9);
      assert.ok(c.x + L.w + L.bleed <= L.sw - 1 + 1e-9 && c.y + L.h + L.bleed <= L.sh - 1 + 1e-9);
    }
    const marks = C.cropMarks(L);
    assert.equal(marks.length, (L.cols * 2 + L.rows * 2) * 2);
    for (const m of marks) {
      const inside = (x, y) => x > L.x0 - L.bleed && x < L.x0 + L.gw + L.bleed && y > L.y0 - L.bleed && y < L.y0 + L.gh + L.bleed;
      assert.ok(!inside(m[0], m[1]) && !inside(m[2], m[3]), 'เส้นตัดต้องไม่ทับงาน');
      assert.ok(Math.min(m[0], m[2]) >= 0 && Math.max(m[0], m[2]) <= L.sw && Math.min(m[1], m[3]) >= 0 && Math.max(m[1], m[3]) <= L.sh);
    }
  }
  const plan = C.printPlan(18, 7, 100, 'a4', { prefix: 'No.', start: 1, digits: 4 });
  assert.equal(plan.perSheet, 3);
  assert.equal(plan.sheets, 34);
  assert.equal(plan.spare, 2);
  assert.equal(plan.first, 'No.0001');
  assert.equal(plan.last, 'No.0100');
  assert.equal(C.printPlan(40, 40, 10, 'a4').perSheet, 0); // ใหญ่เกินกระดาษ
});

test('PDF ไฟล์พิมพ์: หลายหน้า รูปบัตรฝังครั้งเดียว ตัวเลขรันเป็นตัวอักษรเรียงครบทุกใบ', () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9]);
  const run = C.normalizeRun({ prefix: 'No.', start: 1, digits: 4 });
  const plan = C.printPlan(18, 7, 7, 'a4', run);
  const pdf = C.pdfRun({
    sheet: plan.sheet,
    layout: plan.layout,
    card: { w: 18, h: 7 },
    art: { jpeg, pw: 10, ph: 4 },
    qty: 7,
    run,
    labels: [{ digitsX: 15, y: 0.8, size: 0.42 }, { digitsX: 1.5, y: 0.8, size: 0.42, stub: true }],
    color: '#c8102e',
    note: '18 x 7 cm',
  });
  const txt = Buffer.from(pdf).toString('latin1');
  assert.ok(txt.startsWith('%PDF-1.4'));
  assert.match(txt, /\/Count 3 /); // 7 ใบ ÷ 3 ใบ/แผ่น = 3 แผ่น
  assert.equal((txt.match(/\/Subtype \/Image/g) || []).length, 1);
  assert.equal((txt.match(/\/Im0 Do/g) || []).length, 7);
  for (let i = 1; i <= 7; i++) assert.equal((txt.match(new RegExp('\\(000' + i + '\\) Tj', 'g')) || []).length, 2, 'เลข ' + i + ' ต้องอยู่ทั้งตัวบัตรและต้นขั้ว');
  assert.ok(!txt.includes('(0008)'));
  assert.match(txt, /\/BaseFont \/Helvetica-Bold/);
  assert.match(txt, /0\.784 0\.063 0\.18 rg/); // สีเลข #c8102e
  // xref ชี้ตำแหน่งวัตถุถูกต้อง
  const start = +txt.slice(txt.lastIndexOf('startxref') + 10).trim().split('\n')[0];
  assert.equal(txt.slice(start, start + 4), 'xref');
  const offs = txt.slice(start).split('\n').slice(3, 9).map((l) => +l.slice(0, 10));
  offs.forEach((o, i) => assert.equal(txt.slice(o, o + String(i + 1).length + 6), i + 1 + ' 0 obj'));
  // บัตรหมุนบนกระดาษ A3: ตัวเลขหมุนตาม
  const p3 = C.printPlan(18, 7, 6, 'a3', run);
  const rot = Buffer.from(C.pdfRun({ sheet: p3.sheet, layout: p3.layout, card: { w: 18, h: 7 }, art: { jpeg, pw: 10, ph: 4 }, qty: 6, run, labels: [{ digitsX: 15, y: 0.8, size: 0.42 }], color: '#000000' })).toString('latin1');
  assert.match(rot, /BT \/F1 [\d.]+ Tf [\d. ]+ rg 0 1 -1 0 /);
  // ไม่เปิดเลขรัน: ไม่มีตัวเลขบนบัตร มีแต่รูป + เส้นตัด
  const plain = Buffer.from(C.pdfRun({ sheet: plan.sheet, layout: plan.layout, card: { w: 18, h: 7 }, art: { jpeg, pw: 10, ph: 4 }, qty: 3, run: null, labels: [], color: '#000' })).toString('latin1');
  assert.ok(!/\/F1 [\d.]+ Tf/.test(plain));
});

test('ชนิดงานของร้าน: เพิ่มเองได้ ยืมหน้าตาชนิดมาตรฐาน · ข้อมูลถูกตรวจ · ลบแล้วหายจากรายการ', () => {
  const o = C.normalizeOptions({
    types: [
      { id: 'u-plaswood1', name: 'ป้ายพลาสวูด<script>', base: 'foam', unit: 'sqm', word: 'แผ่น', presets: [[60, 90], ['x', 5], [120, 240]], desc: 'หนา 5 มม.' },
      { id: 'u-queue', name: 'บัตรคิว', base: 'card', unit: 'pcs', presets: [] },
      { id: 'u-hack', name: 'โครงเหล็กแอบ', base: 'stand' }, // ขาตั้งเหล็กยืมไม่ได้ → โฟมบอร์ด
      { id: '../bad', name: '' },
    ],
    presets: { 'u-plaswood1': [[30, 45]], 'u-nope': [[10, 10]] },
    hideTypes: ['u-queue', 'u-nope'],
  });
  assert.equal(o.types.length, 4);
  assert.equal(o.types[0].name, 'ป้ายพลาสวูดscript');
  assert.deepEqual(o.types[0].presets, [[60, 90], [120, 240]]);
  assert.equal(o.types[2].base, 'foam');
  assert.match(o.types[3].id, /^u-[a-z0-9]+$/);
  assert.equal(o.types[3].name, 'งานของร้าน');
  assert.deepEqual(Object.keys(o.presets), ['u-plaswood1']);
  assert.deepEqual(o.hideTypes, ['u-queue']);
  try {
    C.applyTypes(o.types);
    assert.ok(C.TYPE_ORDER.includes('u-plaswood1'));
    assert.equal(C.baseType('u-plaswood1'), 'foam');
    assert.equal(C.baseType('u-queue'), 'card');
    const g = C.geometry('u-plaswood1', 60, 90);
    assert.equal(g.type, 'foam');
    assert.equal(g.kind, 'u-plaswood1');
    assert.equal(g.depth, C.geometry('foam', 60, 90).depth);
    assert.equal(C.TYPES['u-queue'].unit, 'pcs');
    assert.ok(C.TYPES['u-queue'].presets.length > 0, 'ไม่ใส่ขนาด → ใช้ขนาดของหน้าตาที่ยืม');
    assert.equal(C.quote({ type: 'u-plaswood1', w: 100, h: 100, qty: 1, rate: 450 }).total, 450);
    assert.equal(C.depthText('u-plaswood1'), C.depthText('foam'));
  } finally {
    C.applyTypes([]);
  }
  assert.ok(!C.TYPES['u-plaswood1']);
  assert.deepEqual(C.TYPE_ORDER, C.BASE_TYPES);
  assert.equal(C.baseType('u-plaswood1'), 'vinyl');
  assert.deepEqual(C.parseSizes('60x90, 120 × 240\n30*45; abc, 60x90'), [[60, 90], [120, 240], [30, 45]]);
});

test('แอป: ช่องรันนัมเบอร์ / ไฟล์พิมพ์ / ชนิดงานของร้าน ต่อสายครบ และงานชนิดของร้านไม่หายตอนเปิดแอปใหม่', async () => {
  const { readFileSync } = await import('node:fs');
  const html = readFileSync(new URL('../sign-mockup/index.html', import.meta.url), 'utf8');
  for (const id of ['runPane', 'runOn', 'runPrefix', 'runStart', 'runDigits', 'runStub', 'runPos', 'runSize', 'runColors', 'fmtPrint', 'sheetSeg', 'optMyTypes', 'optAddType', 'typeDlg', 'tyBase', 'tyUnit', 'tySave']) {
    assert.match(html, new RegExp('id="' + id + '"'), id);
  }
  const app = readFileSync(new URL('../sign-mockup/app.js', import.meta.url), 'utf8');
  // ลงทะเบียนชนิดของร้านก่อนโหลดสถานะ
  assert.ok(app.indexOf('C.applyTypes(C.normalizeOptions(') < app.indexOf('var st = load();'));
  assert.match(app, /if \(fmt === 'print'\) return buildPrint\(\);/);
  assert.match(app, /C\.pdfRun\(/);
  const s3 = readFileSync(new URL('../sign-mockup/scene3d.js', import.meta.url), 'utf8');
  assert.match(s3, /const bt = C\.baseType\(s\.type\)/);
  assert.match(s3, /type === 'card'/);
});

test('ไฟล์ HTML พรีวิว 3 มิติ: ไฟล์เดียวจบ ฝังโมเดล/ตัวดู/รูปสำรอง · ข้อความลูกค้าไม่กลายเป็นโค้ด', async () => {
  const html = C.viewerFile({
    title: 'ป้ายขาตั้ง<img src=x onerror=alert(1)>',
    size: '80 × 120 ซม.',
    customer: 'โรงเรียน"บ้านนา',
    shop: 'นัดพอน',
    phone: 'โทร 081-234-5678',
    logo: 'javascript:alert(1)',
    css: 'body{color:red}</style><script>alert(1)</script>',
    viewerJs: 'window.NTPViewer={mount:function(){}};var s="</script><b>";',
    glb: 'Z2xURgIAAAA=',
    poster: '/9j/4AAQ',
    name: 'sign3d-"x</script>',
  });
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(!html.includes('<img src=x'));
  assert.ok(!html.includes('javascript:'), 'โลโก้รับเฉพาะ data:image');
  assert.equal((html.match(/<\/script>/g) || []).length, 3); // glb + ตัวดู + ตัวเริ่ม
  assert.equal((html.match(/<\/style>/g) || []).length, 1);
  assert.match(html, /href="tel:0812345678"/);
  assert.match(html, /<script type="application\/octet-stream" id="glb">Z2xURgIAAAA=<\/script>/);
  assert.match(html, /id="poster"[^>]*src="data:image\/jpeg;base64,\/9j\/4AAQ"[^>]*hidden/);
  assert.match(html, /NTPViewer\.mount\(\{ glb: u\.buffer/);
  assert.ok(!/https?:\/\/[^"]*\.js/.test(html), 'ไม่โหลดสคริปต์จากเน็ต');
  assert.throws(() => C.viewerFile({ glb: '"><script>' }), /base64/);
  const app = (await import('node:fs')).readFileSync(new URL('../sign-mockup/app.js', import.meta.url), 'utf8');
  assert.match(app, /if \(fmt === 'html'\) return buildHtml\(\);/);
  assert.match(app, /fetchText\('vendor\/viewer3d\.standalone\.js'\)/);
});

test('ฉากบัตร: "บนกระดาษ" (เลือกสีกระดาษ) + "มือถือบัตร" โชว์เฉพาะงานบัตร · ฉากหน้าร้าน/ประตูไม่โชว์กับบัตร', async () => {
  assert.deepEqual(C.SCENE_ORDER.slice(0, 2), ['paper', 'hand']);
  assert.equal(C.sceneFits('paper', 'card'), true);
  assert.equal(C.sceneFits('hand', 'card'), true);
  assert.equal(C.sceneFits('paper', 'vinyl'), false);
  assert.equal(C.sceneFits('hand', 'stand'), false);
  for (const k of ['shop', 'fence', 'classDoor', 'officeDoor', 'classroom']) assert.equal(C.sceneFits(k, 'card'), false, k);
  for (const k of ['studio', 'wall', 'brick']) assert.equal(C.sceneFits(k, 'card') && C.sceneFits(k, 'vinyl'), true, k);
  assert.equal(C.defaultScene('card'), 'paper');
  assert.equal(C.defaultScene('vinyl'), 'shop');
  for (const k of C.PAPER_ORDER) assert.match(C.PAPERS[k].color, /^#[0-9a-f]{6}$/);
  // ชนิดของร้านที่ยืมหน้าตาบัตร ใช้ฉากบัตรได้
  try {
    C.applyTypes([{ id: 'u-queue1', name: 'บัตรคิว', base: 'card', unit: 'pcs', presets: [[7, 10]] }]);
    assert.equal(C.sceneFits('hand', 'u-queue1'), true);
    assert.equal(C.defaultScene('u-queue1'), 'paper');
  } finally {
    C.applyTypes([]);
  }
  const { readFileSync } = await import('node:fs');
  const render = readFileSync(new URL('../sign-mockup/render.js', import.meta.url), 'utf8');
  assert.match(render, /SCENE_DRAW = \{ paper: scenePaper, hand: sceneHand,/);
  assert.match(render, /SCENE_AFTER = \{ hand: sceneHandAfter \}/);
  const s3 = readFileSync(new URL('../sign-mockup/scene3d.js', import.meta.url), 'utf8');
  assert.match(s3, /BUILD = \{ paper: buildPaper, hand: buildHandScene,/);
  assert.match(s3, /if \(hand\) signRoot\.remove\(handG\)/); // มือไม่ถูกนับในกรอบกล้อง
  const app = readFileSync(new URL('../sign-mockup/app.js', import.meta.url), 'utf8');
  assert.match(app, /if \(k !== 'photo' && !C\.sceneFits\(k, st\.type\)\) return;/);
});

test('แบบให้ลูกค้าเลือก 2 แบบในหน้าเดียว: เก็บภาพไว้ในเครื่อง · ส่งออก JPG/PDF', async () => {
  const { readFileSync } = await import('node:fs');
  const html = readFileSync(new URL('../sign-mockup/index.html', import.meta.url), 'utf8');
  for (const id of ['cmpPane', 'cmpThumb0', 'cmpThumb1', 'cmpSet0', 'cmpSet1', 'cmpDel0', 'cmpDel1', 'cmpMake', 'fmtCompare', 'cmpOutSeg']) assert.match(html, new RegExp('id="' + id + '"'), id);
  const app = readFileSync(new URL('../sign-mockup/app.js', import.meta.url), 'utf8');
  assert.match(app, /if \(fmt === 'compare'\) return buildCompare\(\);/);
  assert.match(app, /NS\.jobs\.put\(Object\.assign\(\{ id: 'opt-cmp-' \+ i/);
  // งานในรายการ "งานของฉัน" ไม่มีภาพเทียบแบบปน (id ขึ้นต้น opt-)
  const jobs = readFileSync(new URL('../sign-mockup/jobs.js', import.meta.url), 'utf8');
  assert.match(jobs, /j\.id\.indexOf\('opt-'\) !== 0/);
});
