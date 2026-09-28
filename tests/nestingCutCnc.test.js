// นัดพอน: ทำมุมโค้ง (CNC) · หาเส้นกลาง (LED) · เส้นบอกขนาด · รันนัมเบอร์ · ปุ่มลัด
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const G = require('../adobe/nesting-cut/core/geometry.js');
const X = require('../adobe/nesting-cut/core/cnc.js');
const D = require('../adobe/nesting-cut/core/dimension.js');

const sq = (s, x = 0, y = 0) => [[x, y], [x + s, y], [x + s, y + s], [x, y + s]];
const L = [[0, 0], [40, 0], [40, 10], [10, 10], [10, 40], [0, 40]];

test('ทำมุมโค้ง: มุมในได้รัศมีดอก (เติมเนื้อ r²(1−π/4)) มุมนอกไม่เปลี่ยน', () => {
  const r = 3;
  const res = X.roundCorners([L], { rIn: r });
  assert.equal(res.loops.length, 1);
  assert.ok(Math.abs(res.loops[0].area - (700 + r * r * (1 - Math.PI / 4))) < 2.5);
  assert.equal(res.flags.length, 0);
  // มุมนอกของ L ยังแหลม: กรอบเท่าเดิม
  const b = G.bounds([res.loops[0].points]);
  assert.ok(Math.abs(b.maxX - 40) < 0.1 && Math.abs(b.maxY - 40) < 0.1);
});

test('ทำมุมโค้ง: รัศมีมุมนอกตัดมุมนูน 4 มุมของสี่เหลี่ยม', () => {
  const r = 3;
  const res = X.roundCorners([sq(20)], { rOut: r });
  assert.ok(Math.abs(res.loops[0].area - (400 - 4 * r * r * (1 - Math.PI / 4))) < 2.5);
});

test('ทำมุมโค้ง: ร่องแคบกว่าดอก 1/8 นิ้วถูกเตือน ร่องกว้างพอไม่เตือน', () => {
  const U = (w) => [[0, 0], [14, 0], [14, 48], [14 + w, 48], [14 + w, 0], [28 + w, 0], [28 + w, 60], [0, 60]];
  const narrow = X.roundCorners([U(2)], { rIn: X.BIT_RADIUS });
  assert.ok(narrow.flags.length >= 1);
  assert.equal(narrow.flags[0].kind, 'inner');
  const wide = X.roundCorners([U(8)], { rIn: X.BIT_RADIUS });
  assert.equal(wide.flags.length, 0);
});

test('ทำมุมโค้ง: เส้นตรงยาวยังตรง (ไม่มีมือจับ) ส่วนโค้งได้มือจับนุ่ม', () => {
  const ring = [[0, 0], [50, 0], [50.5, 0.1], [50.9, 0.5], [51, 1], [51, 30], [0, 30]];
  const bz = X.toBezier(ring, 2);
  assert.deepEqual(bz[0].r, bz[0].a); // ต้นเส้นตรงยาว 50 มม.
  assert.notDeepEqual(bz[2].l, bz[2].a); // จุดบนส่วนโค้ง
});

test('หาเส้นกลาง: แท่งตรง ยาวเท่าแกนกลางลบระยะเว้นปลาย และวัดความกว้างได้', () => {
  const res = X.centerline([[[0, 0], [100, 0], [100, 8], [0, 8]]], { stripWidth: 6, minRadius: 15, endMargin: 10 });
  assert.equal(res.stats.lines, 1);
  assert.ok(Math.abs(res.stats.length - (92 - 20)) < 2);
  assert.ok(Math.abs(res.stats.minWidth - 8) < 0.6);
  assert.equal(res.stats.narrow + res.stats.tight + res.stats.wide, 0);
});

test('หาเส้นกลาง: วงแหวนได้เส้นปิดวงเดียว เตือนแคบ / กว้างเกินตามแถบไฟ', () => {
  const ring = [];
  const hole = [];
  for (let i = 0; i < 96; i++) {
    const t = (i / 96) * 2 * Math.PI;
    ring.push([50 + 40 * Math.cos(t), 50 + 40 * Math.sin(t)]);
    hole.push([50 + 36 * Math.cos(-t), 50 + 36 * Math.sin(-t)]);
  }
  const res = X.centerline([ring, hole], { stripWidth: 6, minRadius: 15 });
  assert.equal(res.lines.length, 1);
  assert.ok(res.lines[0].closed);
  assert.ok(Math.abs(res.stats.length - 2 * Math.PI * 38) < 6);
  assert.ok(res.stats.narrow >= 1, 'กว้าง 4 มม. แคบกว่าแถบไฟ 6 มม.');
  const wide = X.centerline([[[0, 0], [120, 0], [120, 20], [0, 20]]], { stripWidth: 6 });
  assert.ok(wide.stats.wide >= 1, 'กว้าง 20 มม. > 2 × 6');
});

test('หาเส้นกลาง: ตัว T ได้ 3 เส้นจากทางแยก ไม่มีกิ่งเศษที่มุม', () => {
  const T = [[0, 0], [60, 0], [60, 12], [36, 12], [36, 70], [24, 70], [24, 12], [0, 12]];
  const res = X.centerline([T], { stripWidth: 6, endMargin: 5 });
  assert.equal(res.stats.lines, 3);
});

test('เส้นบอกขนาด: หน่วย สเกล และตำแหน่งเส้น', () => {
  const PT = 72 / 25.4;
  assert.equal(D.formatLength(100 * PT, { unit: 'mm' }), '100.0 mm');
  assert.equal(D.formatLength(100 * PT, { unit: 'm', scale: 50, decimals: 2 }), '5.00 m');
  assert.equal(D.formatLength(25.4 * PT, { unit: 'in', decimals: 0 }), '1 in');
  const box = [0, 100, 200, 0];
  const w = D.dimension(box, 'w', { offset: 10, size: 8 });
  assert.equal(w.text.side, 'top');
  assert.deepEqual(w.lines[2], [0, 110, 200, 110]);
  assert.equal(w.arrows.length, 2);
  const h = D.dimension(box, 'h', { side: 'left', offset: 10, size: 8 });
  assert.deepEqual(h.lines[2], [-10, 100, -10, 0]);
  assert.ok(h.text.vertical);
  assert.deepEqual(D.unionBox([[0, 10, 5, 0], [3, 20, 9, 5]]), [0, 20, 9, 0]);
});

test('รันนัมเบอร์: เลขเริ่ม ก้าว (ติดลบได้) Prefix/Suffix และเติมศูนย์', () => {
  assert.equal(D.numberText(0, { start: 1, count: 120, prefix: 'No.' }), 'No.001');
  assert.equal(D.numberText(119, { start: 1, count: 120 }), '120');
  assert.equal(D.numberText(3, { start: 10, step: -5, count: 5 }), '-05');
  assert.equal(D.numberText(2, { start: 5, step: 5, pad: 4, suffix: '/A' }), '0015/A');
  assert.equal(D.numberText(2, { start: 5, pad: 0 }), '7');
  assert.equal(D.fillTemplate('คิว {%n} ({%n})', '07', true), 'คิว 07 (07)');
  assert.equal(D.fillTemplate('ไม่มีช่อง', '07', true), 'ไม่มีช่อง');
  assert.equal(D.fillTemplate('ไม่มีช่อง', '07', false), '07');
});

test('รันนัมเบอร์: เรียงตามแถว / คอลัมน์ และตำแหน่งเลขหน้า + Mirror หน้าคู่', () => {
  const at = (id, l, t) => ({ id, vb: [l, t, l + 50, t - 20] });
  const items = [at('b2', 100, 50), at('a1', 0, 100), at('b1', 0, 50), at('a2', 100, 101)];
  assert.deepEqual(D.orderItems(items, 'rows').map((i) => i.id), ['a1', 'a2', 'b1', 'b2']);
  assert.deepEqual(D.orderItems(items, 'cols').map((i) => i.id), ['a1', 'b1', 'a2', 'b2']);
  assert.deepEqual(D.orderItems(items, 'layer').map((i) => i.id), ['b2', 'a1', 'b1', 'a2']);
  const rect = [0, 842, 595, 0];
  assert.deepEqual(D.pagePosition(rect, 'bottom-right', 20, 10, false, 2), { x: 575, y: 20, justify: 'right' });
  assert.deepEqual(D.pagePosition(rect, 'bottom-right', 20, 10, true, 2), { x: 20, y: 20, justify: 'left' });
  assert.equal(D.pagePosition(rect, 'top-center', 20, 10, true, 3).justify, 'center');
});

test('host.jsx + แผง: ฟังก์ชันของเครื่องมือ CNC / LED / Dimension / รันนัมเบอร์ / ปุ่มลัด', () => {
  const host = readFileSync(new URL('../adobe/nesting-cut/illustrator/host.jsx', import.meta.url), 'utf8');
  const main = readFileSync(new URL('../adobe/nesting-cut/illustrator/main.js', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../adobe/nesting-cut/illustrator.html', import.meta.url), 'utf8');
  const fns = ['np_readShapes', 'np_drawShapes', 'np_readBounds', 'np_drawDimensions', 'np_readTexts', 'np_setTexts',
    'np_readArtboards', 'np_pageNumbers', 'np_installQuickScript', 'np_panelReady'];
  for (const fn of fns) {
    assert.match(host, new RegExp('function ' + fn + '\\('));
    assert.ok(main.includes("'" + fn + "'"), fn + ' ถูกเรียกจากแผง');
  }
  for (const tool of ['nest', 'run', 'shape', 'corner', 'led', 'dim', 'number', 'hotkey']) {
    assert.ok(html.includes('data-tool="' + tool + '"'), 'แถบ ' + tool);
  }
  // ปุ่มลัด: แผงประกาศว่าเปิดอยู่ แล้วฟังเหตุการณ์ที่สคริปต์ส่งมา
  assert.match(host, /NP_PANEL_READY = true/);
  assert.match(main, /com\.nongploy\.nestingcut\.quick/);
});

const ST = require('../adobe/nesting-cut/core/stamp.js');

test('ตรายางเลเซอร์: เส้นตัดรอบงานตามรูปทรง + ระยะขอบ', () => {
  const L = [[0, 0], [10, 0], [10, 2], [2, 2], [2, 10], [0, 10]];
  const rect = ST.cutShape([L], null, { shape: 'rect', margin: 2 });
  assert.deepEqual(G.bounds(rect), { minX: -2, minY: -2, maxX: 12, maxY: 12 });
  const circle = ST.cutShape([L], null, { shape: 'circle', margin: 1 });
  const cb = G.bounds(circle);
  assert.ok(Math.abs(cb.maxX - cb.minX - 2 * (Math.hypot(5, 5) + 1)) < 0.01, 'วงกลมล้อมมุมงาน + ระยะขอบ');
  const contour = ST.cutShape([L], null, { shape: 'contour', margin: 2 });
  assert.equal(contour.length, 1);
  // ไม่มีเวกเตอร์ (ภาพ Raster) ใช้กรอบของชิ้นแทน
  const box = ST.cutShape([], { minX: 0, minY: 0, maxX: 30, maxY: 20 }, { shape: 'rounded', margin: 1, radius: 2 });
  assert.deepEqual(G.bounds(box), { minX: -1, minY: -1, maxX: 31, maxY: 21 });
});

test('ตรายางเลเซอร์: กลับด้าน + กลับสี — ตัวหนังสือเหลือนูน พื้นถูกยิงออก', () => {
  const L = [[0, 0], [10, 0], [10, 2], [2, 2], [2, 10], [0, 10]];
  const st = ST.stamp([L], null, { shape: 'rect', margin: 2, mirror: true, negative: true });
  // ขาตั้งของ L (x 0–2) กลับด้านไปอยู่ x 8–10
  assert.equal(ST.isEngraved([9, 5], st.engrave), false, 'ตัวหนังสือไม่ถูกยิง');
  assert.equal(ST.isEngraved([1, 5], st.engrave), true, 'ตำแหน่งเดิมก่อนกลับด้านเป็นพื้น');
  assert.equal(ST.isEngraved([5, 6], st.engrave), true, 'พื้นในกรอบถูกยิงออก');
  assert.equal(ST.isEngraved([13, 5], st.engrave), false, 'นอกเส้นตัด');
  const plain = ST.stamp([L], null, { shape: 'rect', margin: 2, mirror: false, negative: false });
  assert.equal(plain.engrave, null);
});

test('host.jsx + แผง: ตรายางเลเซอร์ และปุ่มล้างงานเก่า', () => {
  const host = readFileSync(new URL('../adobe/nesting-cut/illustrator/host.jsx', import.meta.url), 'utf8');
  const main = readFileSync(new URL('../adobe/nesting-cut/illustrator/main.js', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../adobe/nesting-cut/illustrator.html', import.meta.url), 'utf8');
  for (const fn of ['np_drawStamps', 'np_clearSheets', 'np_clearLayers']) {
    assert.match(host, new RegExp('function ' + fn + '\\('));
    assert.ok(main.includes("'" + fn + "'"));
  }
  assert.ok(html.includes('data-tool="stamp"'));
  assert.ok(html.includes('id="btnClear"'));
  // ชีตที่สร้างต้องมีชื่อขึ้นต้นด้วยเครื่องหมายเดียวกับที่ปุ่มล้างใช้หา
  assert.match(main, /name: SHEET_MARK \+ 'แผ่น '/);
});
