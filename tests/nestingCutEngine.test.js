// เอนจินจัดวางของปลั๊กอิน Adobe "น้องพลอย Nesting Cut" (adobe/nesting-cut/core)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const G = require('../adobe/nesting-cut/core/geometry.js');
const N = require('../adobe/nesting-cut/core/nest.js');
const B = require('../adobe/nesting-cut/core/bridge.js');

const square = (s) => [[[0, 0], [s, 0], [s, s], [0, s]]];
const rect = (w, h) => [[[0, 0], [w, 0], [w, h], [0, h]]];
const circle = (r, n = 48) => [Array.from({ length: n }, (_, i) => [r * Math.cos((2 * Math.PI * i) / n), r * Math.sin((2 * Math.PI * i) / n)])];
const triangle = [[[0, 0], [80, 0], [40, 15]]];
const lShape = [[[0, 0], [60, 0], [60, 15], [15, 15], [15, 60], [0, 60]]];
const roll = (w) => ({ area: { x: 5, y: 5, w, h: 5000 } });

// ทุกคู่ที่วางต้องห่างกันไม่น้อยกว่า spacing และอยู่ในพื้นที่วาง
function checkLayout(result, shapes, plan, spacing) {
  let minGap = Infinity;
  for (const sheet of result.sheets) {
    const placed = sheet.placements.map((p) => ({ p, rings: G.transformRings(shapes[p.partIndex], p) }));
    for (const { rings } of placed) {
      const b = G.bounds(rings);
      assert.ok(b.minX >= plan.area.x - 1e-6 && b.maxX <= plan.area.x + plan.area.w + 1e-6, 'อยู่ในหน้ากว้าง');
      assert.ok(b.minY >= plan.area.y - 1e-6 && b.maxY <= plan.area.y + plan.area.h + 1e-6, 'อยู่ในความยาว');
    }
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i].p.bbox;
        const b = placed[j].p.bbox;
        if (a.maxX + spacing < b.minX || b.maxX + spacing < a.minX || a.maxY + spacing < b.minY || b.maxY + spacing < a.minY) continue;
        minGap = Math.min(minGap, G.ringsDistance(placed[i].rings, placed[j].rings));
      }
    }
  }
  assert.ok(minGap >= spacing - 1e-6, `ระยะห่างน้อยสุด ${minGap} ต้องไม่ต่ำกว่า ${spacing}`);
  return minGap;
}

test('nest: สี่เหลี่ยมวางชิดกันพอดีระยะห่าง ไม่เสียเศษจากตาราง', () => {
  const plan = { area: { x: 5, y: 5, w: 203, h: 1000 } };
  const r = N.nest([{ rings: square(100), quantity: 4 }], plan, { spacing: 3, cellSize: 1, iterations: 1 });
  assert.equal(r.placedCount, 4);
  const xs = r.sheets[0].placements.map((p) => Math.round(p.tx)).sort((a, b) => a - b);
  assert.deepEqual(xs, [5, 5, 108, 108]);
  assert.equal(Math.round(r.sheets[0].contentMaxY), 208);
  assert.equal(checkLayout(r, [square(100)], plan, 3), 3);
});

test('nest: รูปผสมหลายแบบ ไม่ทับกัน ห่างตามที่ตั้ง อยู่ในม้วน', () => {
  const shapes = [circle(20), square(30), triangle, lShape];
  const plan = roll(590);
  const r = N.nest(
    shapes.map((rings, i) => ({ rings, quantity: [25, 12, 10, 8][i] })),
    plan,
    { spacing: 2.5, cellSize: 1, iterations: 4 }
  );
  assert.equal(r.placedCount, 55);
  assert.equal(r.totalCount, 55);
  assert.equal(r.unplaced.length, 0);
  checkLayout(r, shapes, plan, 2.5);
});

test('nest: หมุนได้เฉพาะมุมที่อนุญาต และห้ามหมุนรายชิ้นได้', () => {
  const r = N.nest(
    [
      { rings: rect(80, 20), quantity: 6, rotations: [0] },
      { rings: lShape, quantity: 6 },
    ],
    roll(300),
    { spacing: 2, rotations: 'quarter', iterations: 2 }
  );
  for (const p of r.sheets[0].placements) {
    if (p.partIndex === 0) assert.equal(p.angle, 0);
    else assert.ok([0, 90, 180, 270].includes(p.angle));
  }
});

test('nest: ม้วนแคบ ชิ้นยาวถูกหมุนเพื่อให้ลงได้', () => {
  const plan = { area: { x: 0, y: 0, w: 60, h: 1000 } };
  const r = N.nest([{ rings: rect(100, 40), quantity: 2 }], plan, { spacing: 2, iterations: 1 });
  assert.equal(r.placedCount, 2);
  assert.ok(r.sheets[0].placements.every((p) => p.angle === 90 || p.angle === 270));
  checkLayout(r, [rect(100, 40)], plan, 2);
});

test('nest: ชิ้นใหญ่กว่าหน้ากว้างทุกมุม → บอกว่าวางไม่ได้ ไม่ค้าง', () => {
  const r = N.nest([{ rings: rect(300, 300), quantity: 3 }, { rings: square(20), quantity: 2 }], roll(200), { spacing: 2 });
  assert.equal(r.placedCount, 2);
  assert.deepEqual(r.unplaced.map((u) => [u.index, u.count]), [[0, 3]]);
});

test('nest: แผ่นความยาวจำกัด → ขึ้นแผ่นใหม่', () => {
  const plan = { area: { x: 0, y: 0, w: 100, h: 100 } };
  const r = N.nest([{ rings: square(45), quantity: 9 }], plan, { spacing: 2, iterations: 1 });
  assert.equal(r.placedCount, 9);
  assert.equal(r.sheets.length, 3);
  assert.deepEqual(r.sheets.map((s) => s.placements.length), [4, 4, 1]);
});

test('nest: ไม่วางทับสิ่งกีดขวาง (มาร์ก/หัวงาน)', () => {
  const obstacle = { x: 0, y: 0, w: 40, h: 40 };
  const plan = { area: { x: 0, y: 0, w: 100, h: 300 }, obstacles: [obstacle] };
  const r = N.nest([{ rings: square(30), quantity: 5 }], plan, { spacing: 2, iterations: 1 });
  for (const p of r.sheets[0].placements) {
    const b = p.bbox;
    const overlaps = b.minX < obstacle.x + obstacle.w && b.maxX > obstacle.x && b.minY < obstacle.y + obstacle.h && b.maxY > obstacle.y;
    assert.ok(!overlaps, 'ต้องไม่ทับสิ่งกีดขวาง');
  }
});

test('nest: รูในชิ้นงาน — ปิด fillHoles แล้วชิ้นเล็กเข้าไปอยู่ในรูได้', () => {
  // สี่เหลี่ยม 25 มม. ใหญ่เกินจะแทรกมุมข้างวงแหวน — ถ้าไม่ลงรูก็ต้องลงไปต่อข้างล่าง
  const ring = [circle(40, 64)[0], circle(28, 64)[0]];
  const parts = [{ rings: ring, quantity: 1 }, { rings: square(25), quantity: 1 }];
  const plan = { area: { x: 0, y: 0, w: 90, h: 500 } };
  const filled = N.nest(parts, plan, { spacing: 2, fillHoles: true, iterations: 1 });
  const holes = N.nest(parts, plan, { spacing: 2, fillHoles: false, iterations: 1 });
  assert.ok(filled.sheets[0].contentMaxY >= 99, 'ถมรู: สี่เหลี่ยมต้องไปอยู่นอกวงแหวน');
  assert.equal(Math.round(holes.sheets[0].contentMaxY), 80, 'ไม่ถมรู: สี่เหลี่ยมอยู่ในรู ม้วนสั้นเท่าวงแหวน');
  checkLayout(holes, [ring, square(25)], plan, 2);
});

test('nest: bleed ของชิ้นงานกันระยะเพิ่ม', () => {
  const plan = { area: { x: 0, y: 0, w: 1000, h: 100 } };
  const r = N.nest([{ rings: square(20), quantity: 2, bleed: 3 }], plan, { spacing: 2, rotations: 'none', iterations: 1 });
  const [a, b] = r.sheets[0].placements.map((p) => p.tx).sort((x, y) => x - y);
  assert.ok(b - a - 20 >= 2 + 2 * 3 - 1e-6, 'ห่างเท่า spacing + bleed ทั้งสองข้าง');
});

test('nest: ผลเหมือนเดิมทุกครั้ง (seed เดียวกัน)', () => {
  const parts = [{ rings: circle(12), quantity: 20 }, { rings: triangle, quantity: 10 }];
  const a = N.nest(parts, roll(300), { spacing: 2, iterations: 6, seed: 7 });
  const b = N.nest(parts, roll(300), { spacing: 2, iterations: 6, seed: 7 });
  assert.deepEqual(
    a.sheets[0].placements.map((p) => [p.angle, p.tx, p.ty]),
    b.sheets[0].placements.map((p) => [p.angle, p.tx, p.ty])
  );
});

test('nestAsync: ให้ผลเดียวกับ nest และรายงานความคืบหน้า', async () => {
  const parts = [{ rings: circle(10), quantity: 12 }];
  const seen = [];
  const r = await N.nestAsync(parts, roll(200), { spacing: 2, iterations: 3 }, (f) => seen.push(f));
  assert.equal(r.placedCount, 12);
  assert.ok(seen.length >= 1 && seen[seen.length - 1] === 1);
});

test('rasterize: มุมฉากหมุนแล้วขนาดตารางตรงกัน (ไม่มีเศษ cos/sin)', () => {
  const m0 = N.rasterize(rect(50, 20), 0, 1, 1, true);
  const m90 = N.rasterize(rect(50, 20), 90, 1, 1, true);
  assert.equal(m0.w, m90.h);
  assert.equal(m0.h, m90.w);
  assert.equal(m0.cells, m90.cells);
});

test('bridge: คำสั่งวางของ Illustrator ให้ผลตรงกับเอนจินทุกมุม', () => {
  const k = B.MM_PER_PT;
  const aiPts = [[100, 700], [180.5, 640.25], [-20, 10]];
  for (const angle of [0, 90, 180, 270, 45, 15]) {
    const pl = { angle, tx: 123.4, ty: 567.8 };
    const cmd = B.placementForIllustrator(pl);
    const [L, T] = [36, 1200];
    for (const p of aiPts) {
      const q = G.transformPoint(B.aiToEngine(p), pl); // mm บนแผ่น, y ลง
      const expected = [L + q[0] / k, T - q[1] / k]; // กลับเป็น pt ของอาร์ตบอร์ด
      const got = B.applyIllustratorPlacement(p, cmd, L, T);
      assert.ok(Math.abs(got[0] - expected[0]) < 1e-6 && Math.abs(got[1] - expected[1]) < 1e-6, `angle ${angle}`);
    }
  }
});

test('bridge: เส้นเบซิเยร์ของ Illustrator → วง mm (กลับแกน y) ตัดเส้นเปิดทิ้ง', () => {
  const box = G.ringToBezier([[0, 0], [72, 0], [72, 72], [0, 72]]);
  const rings = B.subpathsToRings([{ closed: true, points: box }, { closed: false, points: box }]);
  assert.equal(rings.length, 1);
  const b = G.bounds(rings);
  assert.deepEqual([b.minX, b.minY, b.maxX, b.maxY].map((v) => +v.toFixed(3)), [0, -25.4, 25.4, 0]);
  assert.equal(B.subpathsToPolylines([{ closed: false, points: box }])[0].closed, false);
});

test('geometry: เบซิเยร์วงกลมแบนลงแล้วรัศมีคลาดไม่เกินค่าที่ขอ', () => {
  const r = 50;
  const k = 0.5522847498 * r;
  const pts = [
    { a: [r, 0], l: [r, -k], r: [r, k] },
    { a: [0, r], l: [k, r], r: [-k, r] },
    { a: [-r, 0], l: [-r, k], r: [-r, -k] },
    { a: [0, -r], l: [-k, -r], r: [k, -r] },
  ];
  const poly = G.flattenBezier(pts, true, 0.05);
  assert.ok(poly.length > 16);
  for (const p of poly) assert.ok(Math.abs(Math.hypot(p[0], p[1]) - r) < 0.08);
  const smooth = G.smoothRing(G.simplifyRing(poly, 0.05), 60);
  assert.equal(smooth.length > 4, true);
});

test('fillSheet: วงกลมเรียงแบบเยื้องแถว (รังผึ้ง) ได้มากกว่าตาราง ไม่ทับกัน อยู่ในแผ่น', () => {
  const plan = { area: { x: 10, y: 10, w: 310, h: 462 } };
  const r = N.fillSheet({ rings: circle(15, 64) }, plan, { spacing: 1, rotations: 'quarter' });
  const grid = Math.floor(311 / 31) * Math.floor(463 / 31); // 10 × 14 แบบแถวตรง
  assert.ok(r.placedCount > grid, `${r.placedCount} ต้องมากกว่าแบบตาราง ${grid}`);
  assert.equal(r.totalCount, r.placedCount);
  assert.equal(r.sheets.length, 1);
  checkLayout(r, [circle(15, 64)], plan, 1);
});

test('fillSheet: สามเหลี่ยมสลับหัวท้ายได้มากกว่าวางทีละดวง', () => {
  const tri = [[[0, 0], [40, 0], [20, 30]]];
  const plan = { area: { x: 0, y: 0, w: 300, h: 300 } };
  const r = N.fillSheet({ rings: tri }, plan, { spacing: 1, rotations: 'quarter' });
  const plain = N.nest([{ rings: tri, quantity: 500 }], plan, { spacing: 1, maxSheets: 1, iterations: 1 });
  assert.ok(r.placedCount >= plain.placedCount);
  const angles = [...new Set(r.sheets[0].placements.map((p) => p.angle))];
  assert.equal(angles.length, 2, 'สลับหัวท้าย = สองมุมที่ต่างกัน 180°');
  assert.equal(Math.abs(angles[0] - angles[1]), 180);
  checkLayout(r, [tri], plan, 1);
});

test('fillSheet: หลบมาร์ก/หัวงาน', () => {
  const obstacle = { x: 0, y: 0, w: 60, h: 60 };
  const plan = { area: { x: 0, y: 0, w: 200, h: 200 }, obstacles: [obstacle] };
  const r = N.fillSheet({ rings: square(18) }, plan, { spacing: 2 });
  for (const p of r.sheets[0].placements) {
    const b = p.bbox;
    assert.ok(!(b.minX < 60 && b.maxX > 0 && b.minY < 60 && b.maxY > 0), 'ต้องไม่ทับสิ่งกีดขวาง');
  }
});
