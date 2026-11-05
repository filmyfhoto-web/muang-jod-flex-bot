// เครื่องมือใหม่ของนัดพอน: ไดคัทต่อเนื่อง (core/diecut.js) และไดคัทตามรูปทรง (core/contour.js)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const G = require('../adobe/nesting-cut/core/geometry.js');
const C = require('../adobe/nesting-cut/core/contour.js');
const D = require('../adobe/nesting-cut/core/diecut.js');

const A3 = { x: 20, y: 20, w: 257, h: 380 };

// ทุกจุดของเส้นต่อเนื่องต้องไม่อยู่ "ข้างใน" ดวงใด (อยู่บนขอบหรือในเนื้อกระดาษทิ้งเท่านั้น)
function assertOutsideCells(lay) {
  const shrunk = lay.ring.map(([x, y]) => [x * 0.98, y * 0.98]);
  for (const path of lay.paths) {
    for (let i = 0; i < path.points.length; i++) {
      const a = path.points[i];
      const b = path.points[(i + 1) % path.points.length];
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      for (const c of lay.cells) {
        for (const q of [a, mid]) {
          const local = [q[0] - c.x, q[1] - c.y];
          assert.ok(!G.pointInRing(local, shrunk), 'เส้นตัดผ่านกลางดวง');
        }
      }
    }
  }
}

test('ไดคัทต่อเนื่อง: วงกลมเรียงตรง — 1 แถว = 1 เส้น ไม่ตัดผ่านดวง', () => {
  const lay = D.layout({ area: A3, shape: 'circle', w: 40, h: 40, gap: 3 });
  assert.equal(lay.cols, Math.floor((257 + 3) / 43));
  assert.equal(lay.rows, Math.floor((380 + 3) / 43));
  assert.equal(lay.cells.length, lay.rows * lay.cols);
  assert.equal(lay.lifts, lay.rows);
  assert.ok(lay.paths.every((p) => p.closed));
  assertOutsideCells(lay);
  // ทุกดวงอยู่ในพื้นที่วาง (ไม่ล้ำระยะขอบ)
  for (const c of lay.cells) {
    assert.ok(c.x - 20 >= A3.x - 1e-9 && c.x + 20 <= A3.x + A3.w + 1e-9);
    assert.ok(c.y - 20 >= A3.y - 1e-9 && c.y + 20 <= A3.y + A3.h + 1e-9);
  }
});

test('ไดคัทต่อเนื่อง: สลับแถวแบบรังผึ้ง ได้ดวงมากกว่าเรียงตรง และยังห่างกันไม่น้อยกว่าระยะห่าง', () => {
  const straight = D.layout({ area: A3, shape: 'circle', w: 30, h: 30, gap: 2 });
  const hex = D.layout({ area: A3, shape: 'circle', w: 30, h: 30, gap: 2, stagger: true });
  assert.ok(hex.cells.length > straight.cells.length);
  assert.ok(Math.abs(hex.pitch.y - 32 * Math.sqrt(3) / 2) < 0.05);
  const rings = hex.cells.map((c) => [hex.ring.map(([x, y]) => [x + c.x, y + c.y])]);
  for (let i = 0; i < rings.length; i++) {
    for (let j = i + 1; j < rings.length; j++) {
      if (Math.hypot(hex.cells[i].x - hex.cells[j].x, hex.cells[i].y - hex.cells[j].y) > 40) continue;
      assert.ok(G.ringsDistance(rings[i], rings[j]) >= 2 - 0.05);
    }
  }
  assertOutsideCells(hex);
});

test('ไดคัทต่อเนื่อง: สี่เหลี่ยมชิดกันใช้เส้นตรงยาว (แถว+1) + (คอลัมน์+1) เส้น', () => {
  const lay = D.layout({ area: { x: 0, y: 0, w: 100, h: 60 }, shape: 'rect', w: 25, h: 20, gap: 0 });
  assert.equal(lay.cells.length, 12);
  assert.equal(lay.lifts, 4 + 5);
  assert.ok(lay.paths.every((p) => !p.closed && p.points.length === 2));
  assert.equal(Math.round(lay.cutLength), 4 * 100 + 5 * 60);
});

test('ไดคัทต่อเนื่อง: มุมมน / วงรี / ตามเส้นไดคัทของงาน และเพดาน 400 ดวง', () => {
  for (const shape of ['rounded', 'oval']) {
    const lay = D.layout({ area: A3, shape, w: 50, h: 30, radius: 4, gap: 3, stagger: shape === 'oval' });
    assert.ok(lay.cells.length > 0);
    assertOutsideCells(lay);
  }
  const heart = [[0, 10], [10, 0], [20, 10], [10, 25]];
  const art = D.layout({ area: A3, shape: 'artwork', ring: heart, gap: 3 });
  assert.equal(Math.round(art.w), 20);
  assertOutsideCells(art);
  const tiny = D.layout({ area: A3, shape: 'circle', w: 5, h: 5, gap: 1 });
  assert.equal(tiny.cells.length, 400);
  assert.ok(tiny.capped);
});

// ภาพจำลอง: พื้นม่วงอ่อนทึบ + เงาจาง ๆ + สี่เหลี่ยมสีกรมตรงกลาง
function photo(w, h) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const k = (y * w + x) * 4;
      let c = [232, 225, 241];
      if (x >= 25 && x < 75 && y >= 20 && y < 80) c = [200, 194, 208]; // เงา (มืดลง ~14%)
      if (x >= 30 && x < 70 && y >= 25 && y < 75) c = [31, 42, 68];
      data.set([c[0], c[1], c[2], 255], k);
    }
  }
  return { width: w, height: h, data };
}

test('ไดคัทตามรูปทรง: ลบพื้นหลังรูปถ่าย (สีพื้น + เงา) แล้วได้ขอบของตัวงาน', () => {
  const img = photo(100, 100);
  const withShadow = C.backgroundMask(img, { tolerance: 20, shadow: 0 });
  assert.deepEqual(withShadow.bg, { r: 232, g: 225, b: 241 });
  let loops = C.traceAlpha(withShadow, { simplifyPx: 0.3 });
  assert.equal(Math.round(G.bounds([loops[0].points]).maxX - G.bounds([loops[0].points]).minX), 50); // ติดเงามาด้วย
  const noShadow = C.backgroundMask(img, { tolerance: 20, shadow: 50 });
  const stats = {};
  loops = C.traceAlpha(noShadow, { simplifyPx: 0.3, stats });
  const b = G.bounds([loops[0].points]);
  assert.equal(Math.round(b.maxX - b.minX), 40);
  assert.equal(Math.round(b.maxY - b.minY), 50);
  assert.equal(stats.shapes, 1);
  // ภาพพื้นใส: ไม่แตะอะไร
  const clear = { width: 4, height: 4, data: new Uint8ClampedArray(64) };
  assert.equal(C.backgroundMask(clear, {}).bg, null);
});

test('ไดคัทตามรูปทรง: รูเล็กเกินตัดถูกข้าม รูใหญ่เก็บไว้ และนับสรุปให้', () => {
  const W = 80;
  const alpha = new Uint8Array(W * W);
  for (let y = 10; y < 70; y++) for (let x = 10; x < 70; x++) alpha[y * W + x] = 255;
  for (let y = 20; y < 22; y++) for (let x = 20; x < 22; x++) alpha[y * W + x] = 0; // รู 2×2
  for (let y = 40; y < 60; y++) for (let x = 40; x < 60; x++) alpha[y * W + x] = 0; // รู 20×20
  const stats = {};
  const loops = C.traceAlpha({ width: W, height: W, alpha }, { fillHoles: false, minHolePx: 25, stats });
  assert.equal(stats.holes, 1);
  assert.equal(stats.holesSkipped, 1);
  assert.equal(loops.filter((l) => l.hole).length, 1);
});

test('ไดคัทตามรูปทรง: เผื่อระยะแบบมุมแหลม / ตัดมุม / มน และรวมเส้นที่ชนกัน', () => {
  const sq = [[0, 0], [10, 0], [10, 10], [0, 10]];
  const area = (join, extra = {}) => C.offsetOutline([sq], { offset: 2, join, cell: 0.05, ...extra })[0].area;
  assert.ok(Math.abs(area('miter') - 196) < 1.5);
  assert.ok(Math.abs(area('bevel') - 188) < 1.5);
  assert.ok(Math.abs(area('round') - (100 + 4 * 20 + Math.PI * 4)) < 1.5);
  // มุมแหลมเกินขีดจำกัด → ตัดมุม
  assert.ok(Math.abs(area('miter', { miterLimit: 1.2 }) - 188) < 1.5);
  // รูปตัว L: มุมเว้าไม่เกิดห่วงเกิน
  const L = [[0, 0], [20, 0], [20, 5], [5, 5], [5, 20], [0, 20]];
  const l = C.offsetOutline([L], { offset: 3, join: 'miter', cell: 0.05 });
  assert.equal(l.length, 1);
  assert.ok(Math.abs(l[0].area - (26 * 26 - 15 * 15)) < 2);
  // สองดวงห่าง 3 มม. เผื่อ 2 มม. → ชนกัน รวมเป็นเส้นเดียว
  const two = C.offsetOutline([sq, sq.map(([x, y]) => [x + 13, y])], { offset: 2, join: 'round', cell: 0.05 });
  assert.equal(two.length, 1);
  // รูข้างในหดเข้า
  const hole = [[3, 3], [3, 7], [7, 7], [7, 3]];
  const h = C.offsetOutline([sq, hole], { offset: 1, join: 'miter', cell: 0.05 });
  assert.equal(h.filter((x) => x.hole).length, 1);
  assert.ok(Math.abs(h.find((x) => x.hole).area - 4) < 0.6);
});

test('host.jsx: มีฟังก์ชันของเครื่องมือใหม่ที่แผงเรียกใช้', () => {
  const host = readFileSync(new URL('../adobe/nesting-cut/illustrator/host.jsx', import.meta.url), 'utf8');
  const main = readFileSync(new URL('../adobe/nesting-cut/illustrator/main.js', import.meta.url), 'utf8');
  for (const fn of ['np_exportSelection', 'np_readClipPaths', 'np_drawDieCut', 'np_drawPolys']) {
    assert.match(host, new RegExp('function ' + fn + '\\('));
  }
  for (const fn of ['np_exportSelection', 'np_readClipPaths', 'np_drawDieCut']) assert.ok(main.includes("'" + fn + "'"));
  assert.match(host, /sh\.cutPolys/);
});

test('host.jsx: จำมาร์ก Graphtec จากเลเยอร์ margin / color / reg_* ของไฟล์ต้นแบบ (DOM ปลอม)', () => {
  const host = readFileSync(new URL('../adobe/nesting-cut/illustrator/host.jsx', import.meta.url), 'utf8');
  const main = readFileSync(new URL('../adobe/nesting-cut/illustrator/main.js', import.meta.url), 'utf8');
  assert.ok(main.includes("'np_readMarks'"));
  // อาร์ตบอร์ด 0..900 x, y บน 1368 → ล่าง 0 (pt, y ขึ้น)
  const path = (pts, extra = {}) => ({
    typename: 'PathItem',
    closed: true,
    filled: true,
    fillColor: { typename: 'CMYKColor', cyan: 0, magenta: 0, yellow: 0, black: 100 },
    stroked: false,
    pathPoints: pts.map(([x, y]) => ({ anchor: [x, y], leftDirection: [x, y], rightDirection: [x, y] })),
    geometricBounds: [Math.min(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1]))],
    ...extra,
  });
  const layer = (name, items) => ({ name, pageItems: items, layers: [] });
  const doc = {
    name: 'template.ai',
    artboards: Object.assign([{ artboardRect: [0, 1368, 907.2, 0] }], { getActiveArtboardIndex: () => 0 }),
    layers: [
      layer('margin 0.000000 0.000000 0.000000 0.000000', []),
      layer('color 0 0 0 255 0 0 0 255 17.007874', []),
      layer('reg_2 0.00 0.00 0.00 0.00 25.00 25.00 25.00 25.00', []),
      layer('reg_1 1 1 1.00 1.00 8.00 100.00 1 0 0 0 0.00', [
        { typename: 'GroupItem', pageItems: [path([[28, 1340], [99, 1340], [99, 1337], [28, 1337]]), path([[2000, 10], [2010, 10], [2010, 0]])] },
      ]),
      layer('ไฟล์ปริ้นชิ้นงาน', [path([[100, 100], [200, 100], [200, 200]])]),
    ],
  };
  const ctx = vm.createContext({ $: { global: {} }, app: { documents: [doc], activeDocument: doc } });
  vm.runInContext(host + '\nthis.api = { np_readMarks: np_readMarks, np_regMarkLayer: np_regMarkLayer };', ctx);
  const r = JSON.parse(JSON.stringify(ctx.api.np_readMarks({})));
  assert.equal(r.layers.length, 4);
  assert.equal(r.layers[3], 'reg_1 1 1 1.00 1.00 8.00 100.00 1 0 0 0 0.00');
  assert.equal(r.items.length, 1, 'เฉพาะของบนอาร์ตบอร์ดที่เปิดอยู่ ในเลเยอร์ reg');
  assert.deepEqual(r.items[0].pts[0], [28, 28, 28, 28, 28, 28]);
  assert.equal(r.items[0].layer, r.layers[3]);
  assert.deepEqual(r.items[0].fill, { t: 'cmyk', v: [0, 0, 0, 100] });
  assert.equal(ctx.api.np_regMarkLayer(r.layers), r.layers[3]);
});

test('host.jsx: อ่านเทมเพลตร้าน — กรอบมาร์ก CM5, หลบหัวงาน, ข้ามพื้นหลังเต็มหน้า/ต้นแบบ/ดวงรอบก่อน (DOM ปลอม)', () => {
  const host = readFileSync(new URL('../adobe/nesting-cut/illustrator/host.jsx', import.meta.url), 'utf8');
  // อาร์ตบอร์ด 13×19 นิ้ว = 936 × 1368 pt (y ขึ้น: บน 1368 ล่าง 0)
  const docRef = { typename: 'Document' };
  const item = (typename, b, extra = {}) => ({ typename, visibleBounds: b, hidden: false, note: '', clipped: false, ...extra });
  const layer = (name, items, visible = true) => {
    const lay = { typename: 'Layer', name, visible, pageItems: items, layers: [], parent: docRef, locked: false };
    items.forEach((it) => (it.layer = lay));
    return lay;
  };
  const L1 = (x0, y0, x1, y1) => item('PathItem', [x0, y0, x1, y1]);
  // มาร์ก 4 มุมอยู่ในกลุ่มเดียว (กรอบกลุ่ม = ทั้งหน้า) → ต้องแตกกลุ่มเป็นมาร์กทีละตัว
  const marks = item('GroupItem', [14, 1354, 922, 14], {
    pageItems: [L1(14, 1354, 71, 1297), L1(865, 1354, 922, 1297), L1(14, 71, 71, 14), L1(865, 71, 922, 14)],
  });
  const header = item('GroupItem', [318, 1360, 618, 1260]);
  const background = item('PathItem', [0, 1368, 936, 0]);
  const part = item('GroupItem', [400, 700, 500, 640]);
  const old = item('GroupItem', [100, 500, 160, 460], { note: 'nongploy-nestingcut' });
  const hiddenStuff = item('PathItem', [300, 300, 400, 200]);
  const doc = {
    name: 'template.ai',
    artboards: Object.assign([{ artboardRect: [0, 1368, 936, 0], name: 'A1' }], { getActiveArtboardIndex: () => 0 }),
    layers: [
      layer('margin 0.000000 0.000000 0.000000 0.000000', []),
      layer('reg_1 1 1 1.00 1.00 8.00 100.00 1 0 0 0 0.00', [marks]),
      layer('หัวงาน', [header, background]),
      layer('งาน', [part, old]),
      layer('ซ่อน', [hiddenStuff], false),
    ],
  };
  const ctx = vm.createContext({ $: { global: {} }, app: { documents: [doc], activeDocument: doc } });
  vm.runInContext(host + '\nthis.api = { np_readTemplate: np_readTemplate, np_removeTagged: np_removeTagged, NP: NP };', ctx);
  ctx.api.NP.parts = [part];
  const t = JSON.parse(JSON.stringify(ctx.api.np_readTemplate({})));
  assert.equal(t.w, 936);
  assert.equal(t.h, 1368);
  assert.equal(t.marks, 4);
  assert.deepEqual(t.frame, { x: 14, y: 14, w: 908, h: 1340 });
  assert.equal(t.boxes.length, 5, 'มาร์ก 4 + หัวงาน 1 (ไม่นับพื้นหลังเต็มหน้า ต้นแบบ ดวงรอบก่อน และเลเยอร์ที่ซ่อน)');
  assert.deepEqual(t.boxes.find((b) => !b.mark), { x: 318, y: 8, w: 300, h: 100, mark: 0 });
  assert.equal(t.parts, 1);
  assert.equal(t.old, 1);
  // เรียงใหม่: ลบเฉพาะของที่ปลั๊กอินวางไว้บนอาร์ตบอร์ดนี้
  let removed = 0;
  old.remove = () => removed++;
  part.remove = () => assert.fail('ห้ามลบงานของร้าน');
  header.remove = () => assert.fail('ห้ามลบหัวงาน');
  assert.equal(ctx.api.np_removeTagged(doc, [0, 1368, 936, 0]), 1);
  assert.equal(removed, 1);
});
