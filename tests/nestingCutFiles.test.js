// เส้นตัดจากภาพ, มาร์ก/หัวงาน, ไฟล์สั่งเครื่องตัด, แพ็ก Photoshop → Illustrator
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const G = require('../adobe/nesting-cut/core/geometry.js');
const C = require('../adobe/nesting-cut/core/contour.js');
const L = require('../adobe/nesting-cut/core/layout.js');
const F = require('../adobe/nesting-cut/core/cutfile.js');
const P = require('../adobe/nesting-cut/core/pack.js');

// วงกลม anti-alias ในภาพขนาด w×h (ค่า alpha 0–255)
function disk(w, h, cx, cy, r, holeR = 0) {
  const a = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      let v = Math.max(0, Math.min(1, r + 0.5 - d));
      if (holeR) v -= Math.max(0, Math.min(1, holeR + 0.5 - d));
      a[y * w + x] = Math.round(v * 255);
    }
  }
  return a;
}

const radii = (pts, cx, cy) => pts.map((p) => Math.hypot(p[0] - cx, p[1] - cy));

test('contour: ขอบวงกลมตรงเป๊ะระดับเศษพิกเซล', () => {
  const loops = C.traceAlpha({ width: 200, height: 200, alpha: disk(200, 200, 100, 100, 60) });
  assert.equal(loops.length, 1);
  for (const r of radii(loops[0].points, 100, 100)) assert.ok(Math.abs(r - 60) < 0.5, `r=${r}`);
});

test('contour: เว้นระยะเส้นตัดออกจากขอบเท่ากันรอบตัว', () => {
  const loops = C.traceAlpha({ width: 200, height: 200, alpha: disk(200, 200, 100, 100, 50) }, { offsetPx: 12 });
  assert.equal(loops.length, 1);
  for (const r of radii(loops[0].points, 100, 100)) assert.ok(Math.abs(r - 62) < 1, `r=${r}`);
});

test('contour: รูตรงกลางถูกถม (ตัดแค่ขอบนอก) เว้นแต่สั่งไม่ถม', () => {
  const alpha = disk(200, 200, 100, 100, 60, 30);
  assert.equal(C.traceAlpha({ width: 200, height: 200, alpha }).length, 1);
  assert.equal(C.traceAlpha({ width: 200, height: 200, alpha }, { fillHoles: false }).length, 2);
});

test('contour: ฝุ่นจุดเล็กถูกทิ้ง ชิ้นใกล้กันรวมเป็นเส้นเดียวเมื่อเว้นขอบกว้างพอ', () => {
  const w = 300;
  const h = 120;
  const a = new Uint8Array(w * h);
  const b1 = disk(w, h, 80, 60, 40);
  const b2 = disk(w, h, 200, 60, 40);
  for (let i = 0; i < a.length; i++) a[i] = Math.max(b1[i], b2[i]);
  a[5 * w + 290] = 255; // ฝุ่น
  assert.equal(C.traceAlpha({ width: w, height: h, alpha: a }, { offsetPx: 3 }).length, 2);
  assert.equal(C.traceAlpha({ width: w, height: h, alpha: a }, { offsetPx: 25 }).length, 1);
});

test('contour: รับภาพ RGBA จาก canvas ได้', () => {
  const alpha = disk(40, 40, 20, 20, 12);
  const data = new Uint8ClampedArray(40 * 40 * 4);
  alpha.forEach((v, i) => (data[i * 4 + 3] = v));
  assert.equal(C.traceAlpha({ width: 40, height: 40, data }).length, 1);
});

test('layout: มาร์กวงกลม 4 มุม อยู่ในแผ่น และห่างขอบตามตั้ง', () => {
  const m = { type: 'circle', size: 5, inset: 10 };
  const shapes = L.markShapes(600, 800, m);
  assert.equal(shapes.length, 4);
  const centers = shapes.map((g) => [g.parts[0].cx, g.parts[0].cy]);
  assert.deepEqual(centers, [[12.5, 12.5], [587.5, 12.5], [12.5, 787.5], [587.5, 787.5]]);
});

test('layout: มาร์ก L หันมุมออกนอกแผ่น, Silhouette มี 3 มุม, มาร์กกลางตามระยะ', () => {
  const Ls = L.markShapes(300, 400, { type: 'L', size: 20, thick: 0.5, inset: 10 });
  assert.equal(Ls.length, 4);
  assert.deepEqual(Ls[3].bbox, { x: 270, y: 370, w: 20, h: 20 });
  assert.equal(L.markShapes(210, 297, { type: 'silhouette', size: 20, thick: 0.5, inset: 10, square: 5 }).length, 3);
  const mid = L.markShapes(600, 2000, { type: 'circle', size: 5, inset: 10, every: 500 });
  assert.equal(mid.length, 4 + 2 * 3);
});

test('layout: ม้วน — หัวงานอยู่ระหว่างมาร์กบน, ความยาวจริงตัดตามงาน + ที่ให้มาร์กล่าง', () => {
  const plan = L.planSheet({
    width: 600,
    length: null,
    margin: 5,
    marks: { type: 'circle', size: 5, inset: 10, clearance: 4 },
    header: { enabled: true, height: 18, gap: 3 },
  });
  assert.equal(plan.roll, true);
  assert.deepEqual(plan.headerBox, { x: 19, y: 5, w: 562, h: 18 });
  assert.equal(plan.area.y, 26);
  assert.equal(plan.obstacles.length, 2, 'ม้วนยังไม่รู้ความยาว — กันแค่มาร์กบน');
  assert.equal(L.finalLength(plan, 300.2), Math.ceil(300.2 + 19));
});

test('layout: แผ่นขนาดคงที่ — กันมาร์กทั้ง 4 มุม ความยาวเท่าแผ่น', () => {
  const plan = L.planSheet({ width: 297, length: 420, margin: 5, marks: { type: 'square', size: 5, inset: 10, clearance: 3 } });
  assert.equal(plan.obstacles.length, 4);
  assert.equal(L.finalLength(plan, 100), 420);
  assert.ok(plan.area.h < 420);
});

test('cutfile: เส้นข้างในตัดก่อนเส้นที่ล้อม และเริ่มจากจุดใกล้หัวมีด', () => {
  const outer = { closed: true, points: [[0, 0], [100, 0], [100, 100], [0, 100]] };
  const inner = { closed: true, points: [[40, 40], [60, 40], [60, 60], [40, 60]] };
  const far = { closed: true, points: [[300, 300], [310, 300], [310, 310], [300, 310]] };
  const order = F.orderPaths([outer, far, inner], [0, 0]);
  assert.deepEqual(order.map((p) => p.points.length && p.points[0]), [[40, 40], [0, 0], [300, 300]]);
});

test('cutfile: PLT หมุนงาน 90° แต่ไม่กลับด้าน (ทิศการวนเหมือน DXF)', () => {
  const tri = { closed: true, points: [[10, 10], [50, 10], [10, 30]] };
  const size = { width: 600, length: 400 };
  const plt = F.toHPGL([tri], size, { feed: 'x' });
  assert.equal(plt, 'IN;\nPA;\nSP1;\nPU400,400;\nPD400,2000,1200,400,400,400;\nPU0,0;\nSP0;\n');
  const signed = (pts) => G.signedArea(pts);
  const pltPts = tri.points.map((p) => F.mapPlt(p, size, 'x'));
  const dxfPts = tri.points.map((p) => [p[0], size.length - p[1]]);
  assert.equal(Math.sign(signed(pltPts)), Math.sign(signed(dxfPts)));
  assert.equal(Math.sign(signed(tri.points.map((p) => F.mapPlt(p, size, 'y')))), Math.sign(signed(dxfPts)));
});

test('cutfile: overcut ตัดเลยจุดเริ่มตามระยะที่ขอ', () => {
  const sq = { closed: true, points: [[0, 0], [10, 0], [10, 10], [0, 10]] };
  const plt = F.toHPGL([sq], { width: 100, length: 100 }, { feed: 'y', overcut: 2 });
  assert.match(plt, /PD400,4000,400,3600,0,3600,0,4000,80,4000;/);
});

test('cutfile: SVG และ DXF มีครบทุกเส้น หน่วย mm', () => {
  const paths = [
    { closed: true, points: [[1, 2], [3, 2], [3, 4]] },
    { closed: false, points: [[5, 5], [6, 6]] },
  ];
  const svg = F.toSVG(paths, { width: 600, length: 250.5 }, { title: 'งาน <ทดสอบ>' });
  assert.match(svg, /width="600mm" height="250.5mm" viewBox="0 0 600 250.5"/);
  assert.equal((svg.match(/<path /g) || []).length, 2);
  assert.match(svg, /M1 2L3 2L3 4Z/);
  assert.match(svg, /งาน &lt;ทดสอบ&gt;/);
  const dxf = F.toDXF(paths, { width: 600, length: 250.5 });
  assert.equal((dxf.match(/\r\nPOLYLINE\r\n/g) || []).length, 2);
  assert.match(dxf, /\r\n20\r\n248.5\r\n/); // y กลับขึ้น: 250.5 − 2
  assert.ok(dxf.endsWith('EOF\r\n'));
});

test('pack: อ่านจำนวนจากชื่อเลเยอร์', () => {
  assert.equal(P.parseQty('โลโก้ร้าน x20'), 20);
  assert.equal(P.parseQty('logo ×5'), 5);
  assert.equal(P.parseQty('ป้าย*3'), 3);
  assert.equal(P.parseQty('สติ๊กเกอร์ 50 ดวง'), 50);
  assert.equal(P.parseQty('box'), null);
  assert.equal(P.parseQty('max'), null);
});

const psContents = (unit, k) => ({
  pathComponents: [
    {
      subpathListKey: [
        {
          closedSubpath: true,
          points: [
            [10, 10],
            [110, 10],
            [110, 60],
          ].map(([x, y]) => ({
            anchor: { horizontal: { _unit: unit, _value: x * k }, vertical: { _unit: unit, _value: y * k } },
            forward: { horizontal: { _unit: unit, _value: (x + 5) * k }, vertical: { _unit: unit, _value: y * k } },
          })),
        },
      ],
    },
  ],
});

test('pack: path ของ Photoshop → พิกเซล (รองรับทั้ง pixelsUnit และ distanceUnit)', () => {
  const px = P.psPathToSubpaths(psContents('pixelsUnit', 1), { ppi: 300 });
  assert.deepEqual(px[0].points[1], { a: [110, 10], l: [110, 10], r: [115, 10] });
  const pt = P.psPathToSubpaths(psContents('distanceUnit', 72 / 300), { ppi: 300, width: 200, height: 100 });
  assert.deepEqual(pt[0].points[2].a.map((v) => +v.toFixed(6)), [110, 60]);
  // บางรุ่นติดป้าย distanceUnit แต่ส่งค่าเป็นพิกเซล — ดูจากขนาดเอกสารแล้วเลือกแบบที่ลงตัว
  const mislabeled = P.psPathToSubpaths(psContents('distanceUnit', 1), { ppi: 300, width: 200, height: 100 });
  assert.deepEqual(mislabeled[0].points[2].a, [110, 60]);
});

test('pack: ตรวจแพ็กแล้วแปลงเป็นพิกัด Illustrator', () => {
  const pack = P.makePack({
    document: 'a.psd',
    ppi: 144,
    items: [{ name: 'ดาว', image: '01-ดาว.png', widthPx: 288, heightPx: 144, quantity: 3, cut: psContents('pixelsUnit', 1).pathComponents[0].subpathListKey.map((s) => ({ closed: true, points: s.points.map((p) => ({ a: [p.anchor.horizontal._value, p.anchor.vertical._value] })) })) }],
  });
  assert.equal(P.validatePack(JSON.parse(JSON.stringify(pack))).items.length, 1);
  const ai = P.itemToIllustrator(pack.items[0], 144, [100, 500]);
  assert.equal(ai.widthPt, 144);
  assert.deepEqual(ai.cut[0].points[1].a, [155, 495]);
  assert.throws(() => P.validatePack({ format: 'x' }), /ไม่ใช่แพ็ก/);
  assert.throws(() => P.validatePack({ ...pack, items: [{ name: 'a', image: 'a.png', widthPx: 1, heightPx: 1 }] }), /ไม่มีเส้นตัด/);
});

test('pack: ชื่อไฟล์ปลอดภัย ภาษาไทยยังอยู่', () => {
  assert.equal(P.safeFileName('โลโก้/ร้าน: "ใหม่"?'), 'โลโก้ ร้าน ใหม่');
  assert.equal(P.safeFileName('   ', 'x'), 'x');
});
