// ไดคัทตัวหนังสือ: สติ๊กเกอร์ตัวอักษรติดอะคริลิค (แผน + แผง + host.jsx)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const L = require('../adobe/nesting-cut/core/letter.js');
const read = (p) => readFileSync(new URL('../adobe/nesting-cut/' + p, import.meta.url), 'utf8');
const rect = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;

// ข้อความ 2 บรรทัด: พยัญชนะสูง 10 มม. · สระบนลอยห่าง 1 มม. (ต้องอยู่บรรทัดเดียวกัน) · บรรทัดสองห่าง 10 มม.
const TWO_LINES = [rect(0, 10, 8, 10), rect(10, 10, 8, 10), rect(10, 7, 4, 2), rect(0, 30, 8, 10), rect(10, 30, 8, 10)];

test('ไดคัทตัวหนังสือ: ขนาดตามป้าย · สระ/วรรณยุกต์อยู่บรรทัดเดียวกับพยัญชนะ · เส้นคั่นกลางช่องบรรทัด', () => {
  const keep = L.plan(TWO_LINES, { sizeMode: 'keep', margin: 5 });
  assert.equal(keep.k, 1);
  assert.ok(near(keep.w, 18) && near(keep.h, 33)); // y 7..40
  assert.ok(near(keep.boxW, 28) && near(keep.boxH, 43));
  assert.equal(keep.rows, 2);
  assert.equal(keep.rowsAt.length, 1);
  assert.ok(near(keep.rowsAt[0], (25 - 7) / 33)); // กลางช่อง 20..30
  const w = L.plan(TWO_LINES, { sizeMode: 'width', size: 360 });
  assert.ok(near(w.k, 20) && near(w.w, 360));
  const h = L.plan(TWO_LINES, { sizeMode: 'height', size: 66 });
  assert.ok(near(h.k, 2) && near(h.h, 66));
  // ช่องบรรทัดหลังย่อเหลือไม่ถึง 3 มม. → ไม่มีที่ให้มีดลง ถือเป็นบรรทัดเดียว (ไม่ตัดเส้นคั่น)
  const tiny = L.plan(TWO_LINES, { sizeMode: 'height', size: 8.25 });
  assert.equal(tiny.rowsAt.length, 0);
  // ปิดเส้นคั่น / ปิดกรอบ
  assert.equal(L.plan(TWO_LINES, { rows: false }).rowsAt.length, 0);
  const noBox = L.plan(TWO_LINES, { weed: false, margin: 5 });
  assert.equal(noBox.margin, 0);
  assert.ok(near(noBox.boxW, 18));
  assert.equal(L.plan([], {}), null);
});

test('ไดคัทตัวหนังสือ: กลับด้านติดหลังอะคริลิค · กรอบลอกเศษ · หมุน 90° ตรงกับ Illustrator', () => {
  const p = L.plan(TWO_LINES, { sizeMode: 'keep', margin: 5, mirror: true });
  const pc = L.piece(TWO_LINES, p);
  assert.deepEqual(pc.box, [28, 43]);
  // ชิ้นซ้ายสุด (x 0..8) กลับด้านแล้วไปอยู่ขวาสุด
  const xs = pc.rings[0].map((q) => q[0]);
  assert.ok(near(Math.min(...xs), 5 + 10) && near(Math.max(...xs), 5 + 18));
  assert.deepEqual(pc.frame, [[0, 0], [28, 0], [28, 43], [0, 43]]);
  assert.ok(near(pc.lines[0][0][1], 5 + p.rowsAt[0] * 33) && near(pc.lines[0][1][0], 28));
  // หมุน 90° ทวนเข็ม (Illustrator rotate(90)): จุดขวาบนของกรอบ → ซ้ายบน · กรอบ กว้าง ↔ สูง
  const r = L.piece(TWO_LINES, Object.assign({}, p, { rotated: true }));
  assert.deepEqual(r.box, [43, 28]);
  assert.deepEqual(r.frame[1], [0, 0]);
  assert.deepEqual(r.frame[0], [0, 28]);
});

test('ไดคัทตัวหนังสือ: หลายชุดเต็มหน้าม้วน · หมุนเองเมื่อกว้างเกิน · เตือนชิ้นเล็ก/ตัวเล็ก/กว้างเกินม้วน', () => {
  const g = L.grid(5, 280, 100, 600, 5);
  assert.equal(g.cols, 2);
  assert.equal(g.rows, 3);
  assert.deepEqual(g.positions[1], [285, 0]);
  assert.deepEqual(g.positions[2], [0, 105]);
  assert.ok(near(g.w, 565) && near(g.h, 310) && g.fits);
  assert.equal(L.grid(3, 100, 50, 0, 5).cols, 1); // ไม่จำกัดหน้าม้วน → แถวเดียวลงมา
  // งานยาว 900 มม. บนม้วน 600 → หมุนวิ่งตามความยาวม้วน
  const long = [rect(0, 0, 90, 10)];
  const p = L.plan(long, { sizeMode: 'width', size: 900, margin: 5, roll: 600, copies: 2, gap: 5 });
  assert.equal(p.rotated, true);
  assert.equal(p.layout.cols, 2); // กรอบ 110 × 910 หลังหมุน → 2 ชุดวางข้างกันบนหน้าม้วน 600
  assert.ok(near(p.layout.h, 910));
  assert.equal(p.warnings.length, 0);
  const never = L.plan(long, { sizeMode: 'width', size: 900, roll: 600, rotate: 'never' });
  assert.equal(never.rotated, false);
  assert.deepEqual(never.warnings.map((w) => w.code), ['TOO_WIDE']);
  // ชิ้นเล็กกว่า 2 มม. (จุด/รูในตัว) + ตัวอักษรเตี้ยกว่า 8 มม.
  const small = L.plan([rect(0, 0, 5, 6), rect(6, 0, 5, 6), rect(12, 5, 1, 1)], { minPiece: 2 });
  assert.equal(small.tiny, 1);
  assert.deepEqual(small.warnings.map((w) => w.code), ['TINY', 'SMALL']);
  assert.equal(L.median([5, 1, 3]), 3);
});

test('ไดคัทตัวหนังสือ: แผง (เครื่องมือใหม่ · ไม่ซ่อนช่อง) + host.jsx (ไฟล์ใหม่ · รวมตัวซ้อน · กลับด้าน · CutContour)', () => {
  const html = read('illustrator.html');
  assert.match(html, /<option value="letter" data-tool="letter">ไดคัทตัวหนังสือ<\/option>/);
  assert.match(html, /<section class="card" id="secLetter" data-for="letter">/);
  assert.match(html, /<script src="core\/letter\.js"><\/script>/);
  assert.match(html, /id="vecPreviewCard" data-for="corner led stamp letter"/);
  for (const k of ['ltSizeMode', 'ltSize', 'ltSide', 'ltUnite', 'ltWeed', 'ltMargin', 'ltRows', 'ltCopies', 'ltRoll', 'ltGap', 'ltMinPiece', 'ltRotate']) assert.match(html, new RegExp('data-setting="' + k + '"'), k);
  const main = read('illustrator/main.js');
  assert.match(main, /letter: 'ltStatus'/);
  assert.match(main, /\['letter', '🔤', /);
  assert.match(main, /letter: 'เลือกตัวหนังสือ/);
  assert.match(main, /if \(\/\^lt\[A-Z\]\/\.test\(key\)\) return letterReplan\(\);/); // ปรับค่า → ตัวอย่างเปลี่ยนทันที
  assert.match(main, /\$\('ltSize'\)\.disabled = s\.ltSizeMode === 'keep';/); // ปิดช่อง ไม่ซ่อน (แผงไม่เด้ง)
  assert.match(main, /ltSide: 'back',/); // ค่าเริ่มต้น: ติดหลังอะคริลิคใส (กลับด้าน)
  assert.match(main, /mirror: s\.ltSide !== 'front',/);
  assert.match(main, /host\.call\('np_letterCut', job\)/);
  const host = read('illustrator/host.jsx');
  const fn = host.slice(host.indexOf('function np_letterMake('), host.indexOf('// ---------------------------------------------------------------- clear old work'));
  assert.match(fn, /app\.documents\.add\(srcDoc\.documentColorSpace/); // ไฟล์ใหม่ ของเดิมไม่ถูกแตะ
  assert.match(fn, /np_outlineTexts\(g, 0\)/);
  assert.match(fn, /executeMenuCommand\('Live Pathfinder Add'\);\n\s*app\.executeMenuCommand\('expandStyle'\);/);
  assert.match(fn, /if \(args\.mirror\) g\.resize\(-100, 100,/);
  assert.match(fn, /if \(args\.rotate\) cg\.rotate\(90\);/); // ตรงกับ L.piece (หมุนทวนเข็ม)
  assert.match(fn, /np_spotColor\(np_spot\(doc, args\.spotName \|\| 'CutContour'\)\)/);
  assert.match(host, /it\.filled = false;\n\s*it\.stroked = true;\n\s*it\.strokeColor = color;/);
  assert.match(host, /t === 'RasterItem' \|\| t === 'PlacedItem'/); // รูปภาพตัดสติ๊กเกอร์ไม่ได้
  assert.match(host, /function np_letterCut\(args\) \{\n\s*var keepCS = null;/); // พิกัดเอกสารเหมือนรันนัมเบอร์
  assert.match(read('illustrator/demo.js'), /np_letterCut: function/);
  assert.match(read('CHANGELOG.md'), /## 1\.14\.0\n\n- เครื่องมือใหม่ “ไดคัทตัวหนังสือ”/);
});

test('ไดคัทตัวหนังสือ: อ่านจากรูป (JPG/PNG) → ลบพื้น หาขอบ รูในตัวอักษรยังเป็นรู · ส่งเส้นให้ host วาด', () => {
  const C = require('../adobe/nesting-cut/core/contour.js');
  // รูปตัว O สีดำบนพื้นขาว (เหมือนไฟล์ JPG ที่ลูกค้าส่งมา)
  const W = 120;
  const H = 120;
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const d = Math.hypot(x - 60, y - 60);
      const ink = d <= 40 && d >= 22;
      const k = (y * W + x) * 4;
      data[k] = data[k + 1] = data[k + 2] = ink ? 15 : 250;
      data[k + 3] = 255;
    }
  }
  // แบบเดิม (ไล่จากขอบ) รูในตัว O ไม่หาย → ตัวหนังสือต้องลบสีพื้นทั้งรูป (global)
  const flood = C.backgroundMask({ width: W, height: H, data }, { tolerance: 60, shadow: 0 });
  assert.equal(C.traceAlpha(flood, { threshold: 128, minAreaPx: 9, fillHoles: false, minHolePx: 4 }).length, 1);
  const mask = C.backgroundMask({ width: W, height: H, data }, { tolerance: 60, shadow: 0, global: true });
  assert.ok(mask.bg, 'หาสีพื้นจากขอบรูปได้');
  const loops = C.traceAlpha(mask, { threshold: 128, offsetPx: 0, minAreaPx: 9, fillHoles: false, minHolePx: 4, simplifyPx: 0.35 });
  assert.equal(loops.length, 2);
  assert.deepEqual(loops.map((l) => !!l.hole), [false, true]); // วงนอก + รูในตัว O
  const main = read('illustrator/main.js');
  assert.match(main, /\.call\('np_exportSelection', \{ ppi: 600, maxPx: 3000, kind: 'letter' \}\)/);
  assert.match(main, /fillHoles: false, \/\/ รูในตัวอักษร/);
  assert.match(main, /shadow: 0, global: true \}\);/);
  assert.match(main, /polys\.push\(LT\.roundPoly\(ring\)\);/); // ส่งเป็นเส้นหลายเหลี่ยม (เบา + วาดเร็ว)
  assert.match(main, /unite: !!s\.ltUnite && !v\.colors,/); // ขอบจากพิกเซลรวมกันอยู่แล้ว ไม่ต้อง Pathfinder
  assert.match(main, /if \(!mask\.bg && opaque\) throw new Error\('หาสีพื้นของรูปไม่เจอ/);
  const html = read('illustrator.html');
  assert.match(html, /<select data-setting="ltSource">/);
  assert.match(html, /data-setting="ltTol"/);
  const host = read('illustrator/host.jsx');
  assert.match(host, /if \(traced\) \{\n\s*\/\/ letters traced from a picture[^\n]*\n(\s*\/\/[^\n]*\n)*\s*var cp = g\.compoundPathItems\.add\(\);/);
  assert.match(host, /if \(args\.polys && args\.polys\.length\) tp\.setEntirePath\(list\[t1\]\);/); // 1 คำสั่งต่อเส้น ไม่ตั้งมือจับทีละจุด
});

// รูปตัวหนังสือ 2 สี (เทาเข้ม + ทอง) บนพื้นครีม · ขอบตัวอักษรเบลอ (สีผสมกับพื้น) + เส้นบางที่สีจาง
function twoInkPicture() {
  const W = 160;
  const H = 80;
  const data = new Uint8ClampedArray(W * H * 4);
  const bg = [252, 247, 235];
  const gray = [56, 60, 58];
  const gold = [122, 96, 43];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let ink = null;
      let cov = 0;
      // แท่งเทา (ตัวหนา) ขอบเบลอ 2 พิกเซล
      const dg = Math.max(Math.abs(x - 40) - 20, Math.abs(y - 25) - 12);
      if (dg < 1) { ink = gray; cov = Math.min(1, (1 - dg) / 2); }
      // เส้นบางสีเทา (ไม่เคยทึบเต็ม: 60%) — ต้องอยู่ไฟล์สีเทา ไม่ใช่สีใหม่
      if (y >= 50 && y <= 51 && x >= 15 && x <= 70) { ink = gray; cov = 0.6; }
      // แท่งทอง
      const dd = Math.max(Math.abs(x - 115) - 20, Math.abs(y - 40) - 15);
      if (dd < 1) { ink = gold; cov = Math.min(1, (1 - dd) / 2); }
      const k = (y * W + x) * 4;
      for (let c = 0; c < 3; c++) data[k + c] = Math.round(ink ? bg[c] + (ink[c] - bg[c]) * cov : bg[c]);
      data[k + 3] = 255;
    }
  }
  return { width: W, height: H, data };
}

test('ไดคัทตัวหนังสือ: อ่านรูปหลายสี → แยกสีหมึก (สีจาง/ขอบเบลอรวมกับหมึกเดิม) · ขอบสีเทาไม่หลุดไปไฟล์สีทอง', () => {
  const C = require('../adobe/nesting-cut/core/contour.js');
  const img = twoInkPicture();
  const mask = C.backgroundMask(img, { tolerance: 60, shadow: 0, global: true });
  const inks = L.inkColors(img, mask, { max: 6 });
  assert.equal(inks.length, 2, JSON.stringify(inks));
  const names = inks.map((c) => L.colorName(c.rgb)).sort();
  assert.deepEqual(names, ['ดำ', 'ทอง'].sort()); // เทาเข้มมาก (56,60,58) เรียกว่า ดำ
  const iGold = inks.findIndex((c) => L.colorName(c.rgb) === 'ทอง');
  const iGray = 1 - iGold;
  const aGray = L.colorAlpha(img, mask, inks, iGray).alpha;
  const aGold = L.colorAlpha(img, mask, inks, iGold).alpha;
  const at = (x, y) => y * img.width + x;
  // ขอบซ้ายของแท่งเทา (สีผสมเทา–ครีม) เป็นของสีเทา
  assert.ok(aGray[at(20, 25)] > 0 && aGold[at(20, 25)] === 0);
  // เส้นบางสีจางก็เป็นของสีเทา
  assert.ok(aGray[at(40, 50)] > 100 && aGold[at(40, 50)] === 0);
  // แท่งทองเป็นของสีทองเท่านั้น
  assert.ok(aGold[at(115, 40)] > 200 && aGray[at(115, 40)] === 0);
  // หาขอบทีละสี: สีเทา 2 ชิ้น (แท่ง + เส้นบาง) · สีทอง 1 ชิ้น
  const tr = (a) => C.traceAlpha(a, { threshold: 128, offsetPx: 0, minAreaPx: 9, fillHoles: false, minHolePx: 4, simplifyPx: 0.5 });
  assert.equal(tr(L.colorAlpha(img, mask, inks, iGray)).length, 2);
  assert.equal(tr(L.colorAlpha(img, mask, inks, iGold)).length, 1);
});

test('ไดคัทตัวหนังสือ: ทิ้งกรอบ/เส้นตรงยาวที่ติดมากับรูป · ทิ้งจุดเล็ก · ชื่อสีไทย · ตัวเลขทศนิยม 2 ตำแหน่ง', () => {
  const letters = [rect(10, 10, 8, 12), rect(20, 10, 8, 12), rect(30, 10, 8, 12), rect(10, 30, 8, 12)];
  const frame = rect(0, 0, 100, 60); // กรอบรอบงาน (วงนอก)
  const inner = rect(1, 1, 98, 58); // ขอบในของกรอบ
  const divider = rect(5, 26, 80, 0.6); // เส้นคั่นยาว
  const dash = rect(40, 15, 6, 1); // ขีด “–” ในข้อความ ไม่ใช่กรอบ
  const ring = [...letters, frame, inner, divider, dash];
  const typical = L.typicalHeight(L.ringHeights(ring));
  assert.equal(typical, 12);
  assert.deepEqual(L.frameIndex(ring, typical), [4, 5, 6]);
  // จุดไข่ปลา 0.5 มม. ทิ้ง · ตัวอักษรเก็บ (หลังย่อ/ขยาย k)
  assert.deepEqual(L.keepIndex([rect(0, 0, 0.5, 0.5), rect(0, 0, 8, 12)], 1, 1), [1]);
  assert.deepEqual(L.keepIndex([rect(0, 0, 0.5, 0.5)], 4, 1), [0]); // ขยาย 4 เท่าแล้วใหญ่พอ
  assert.equal(L.colorName([47, 90, 58]), 'เขียวเข้ม');
  assert.equal(L.colorName([156, 122, 60]), 'ทอง');
  assert.equal(L.colorName([14, 14, 14]), 'ดำ');
  assert.equal(L.hex([47, 90, 58]), '#2f5a3a');
  assert.deepEqual(L.roundPoly([[1.23456, -7.891]]), [[1.23, -7.89]]);
  const main = read('illustrator/main.js');
  assert.match(main, /var frames = noFrame \? LT\.frameIndex\(c\.rings, typical\) : \[\];/);
  assert.match(main, /var split = !!s\.ltSplit && on\.length > 1;/); // หลายสี → ไฟล์ละสี
  assert.match(main, /var ref = \[p\.src\.minX \/ K, -p\.src\.minY \/ K, p\.src\.maxX \/ K, -p\.src\.maxY \/ K\];/); // กรอบเดียวกันทุกสี
  const host = read('illustrator/host.jsx');
  assert.match(host, /var gb = refRect \? refRect\.geometricBounds : g\.geometricBounds;/);
  assert.match(host, /if \(args\.marks && args\.weed && m >= 8\) \{/); // เครื่องหมาย + ตรงกันทุกไฟล์สี
  const html = read('illustrator.html');
  for (const k of ['ltSplit', 'ltDrop', 'ltNoFrame']) assert.match(html, new RegExp('data-setting="' + k + '"'), k);
  assert.match(html, /<div id="ltColors" class="lt-colors">/);
});
