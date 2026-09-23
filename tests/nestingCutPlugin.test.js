// ส่วนที่รันใน Illustrator/Photoshop จริงเทสต์บน Node ไม่ได้ทั้งหมด — เทสต์เท่าที่ทำได้:
// host.jsx ต้องเป็น ES3 + ASCII ล้วน, สูตรวางชิ้นของ host.jsx ตรงกับเอนจิน (กับ DOM ปลอม),
// และไฟล์ที่ manifest / HTML อ้างถึงต้องมีอยู่จริง
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'adobe', 'nesting-cut');
const HOST = readFileSync(path.join(ROOT, 'illustrator', 'host.jsx'), 'utf8');
const B = require('../adobe/nesting-cut/core/bridge.js');

test('host.jsx: ASCII ล้วน (ExtendScript อ่านด้วย code page ของเครื่อง)', () => {
  const bad = [...HOST].findIndex((c) => c.charCodeAt(0) > 0x7e || (c.charCodeAt(0) < 0x20 && !'\n\r\t'.includes(c)));
  assert.equal(bad, -1, `ตัวอักษรนอก ASCII ที่ตำแหน่ง ${bad}`);
});

test('host.jsx: ไม่ใช้ syntax/API ที่ ExtendScript (ES3) ไม่มี', () => {
  const code = HOST.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  for (const [re, what] of [
    [/=>/, 'arrow function'],
    [/\b(let|const|class)\s/, 'let/const/class'],
    [/`/, 'template literal'],
    [/\.(forEach|map|filter|reduce|some|every|indexOf|includes|find|trim)\(/, 'ES5+ Array/String method'],
    [/\bJSON\./, 'JSON'],
    [/\bObject\.(keys|assign|entries)/, 'Object.*'],
    [/,\s*[}\]]/, 'trailing comma'],
  ]) {
    assert.ok(!re.test(code), `ห้ามใช้ ${what}`);
  }
  new vm.Script(HOST); // อ่าน syntax ผ่าน
});

// ---- DOM ของ Illustrator แบบปลอม: พอให้ np_stockFor / np_placePiece ทำงาน ----
class FakeItem {
  constructor(typename, pts, doc) {
    this.typename = typename;
    this.pts = pts.map((p) => p.slice());
    this.children = [];
    this.doc = doc;
    this.parent = null;
  }
  all() {
    return this.pts.concat(...this.children.map((c) => c.all()));
  }
  get position() {
    const ps = this.all();
    return [Math.min(...ps.map((p) => p[0])), Math.max(...ps.map((p) => p[1]))];
  }
  clone(doc) {
    const c = new FakeItem(this.typename, this.pts, doc);
    this.children.forEach((k) => c.add(k.clone(doc)));
    return c;
  }
  add(c) {
    c.parent = this;
    this.children.push(c);
    return c;
  }
  shift(dx, dy) {
    this.pts = this.pts.map(([x, y]) => [x + dx, y + dy]);
    this.children.forEach((c) => c.shift(dx, dy));
  }
  duplicate(container) {
    const c = this.clone(container.doc);
    if (container.doc !== this.doc) c.shift(container.doc.offset[0], container.doc.offset[1]); // ข้ามเอกสารแล้วพิกัดเลื่อน
    return container.add(c);
  }
  translate(dx, dy) {
    this.shift(dx, dy);
  }
  // หมุนทวนเข็ม (แกน y ขึ้น) รอบจุดที่ Illustrator เลือกเอง — ตั้งใจให้ไม่ใช่จุดกลางเป๊ะ ๆ
  rotate(angle) {
    const ps = this.all();
    const cx = (Math.min(...ps.map((p) => p[0])) + Math.max(...ps.map((p) => p[0]))) / 2 + 7.3;
    const cy = (Math.min(...ps.map((p) => p[1])) + Math.max(...ps.map((p) => p[1]))) / 2 - 3.1;
    const c = Math.cos((angle * Math.PI) / 180);
    const s = Math.sin((angle * Math.PI) / 180);
    const rot = (item) => {
      item.pts = item.pts.map(([x, y]) => [cx + c * (x - cx) - s * (y - cy), cy + s * (x - cx) + c * (y - cy)]);
      item.children.forEach(rot);
    };
    rot(this);
  }
  remove() {
    this.parent.children.splice(this.parent.children.indexOf(this), 1);
  }
  get pathItems() {
    return {
      add: () => {
        const p = this.add(new FakeItem('PathItem', [], this.doc));
        p.setEntirePath = (arr) => (p.pts = arr.map((q) => q.slice()));
        Object.defineProperty(p, 'pathPoints', { get: () => p.pts.map((q) => ({ anchor: q.slice() })) });
        return p;
      },
    };
  }
  get groupItems() {
    return { add: () => this.add(new FakeItem('GroupItem', [], this.doc)) };
  }
}

test('host.jsx: วางชิ้นตรงตำแหน่งที่เอนจินคิดไว้ ไม่ว่า Illustrator จะหมุนรอบจุดไหน', () => {
  const ctx = vm.createContext({
    $: { global: {} },
    ElementPlacement: { PLACEATEND: 'end', PLACEATBEGINNING: 'begin', PLACEBEFORE: 'before' },
    Transformation: { CENTER: 'center' },
  });
  vm.runInContext(HOST + '\nthis.api = { np_stockFor: np_stockFor, np_placePiece: np_placePiece, NP: NP };', ctx);
  const { api } = ctx;

  const srcDoc = { offset: [0, 0] };
  const layoutDoc = { offset: [37.5, -12.25] };
  const tri = [
    [300, 500],
    [380, 500],
    [340, 560],
  ];
  const source = new FakeItem('PathItem', tri, srcDoc);
  api.NP.parts = [source];
  api.NP.stock = [];
  const layer = new FakeItem('Layer', [], layoutDoc);
  const [ox, oy] = [1000, 2000]; // มุมซ้ายบนอาร์ตบอร์ดในเอกสารเลย์เอาต์

  for (const angle of [0, 90, 180, 270, 45, 30]) {
    const cmd = B.placementForIllustrator({ angle, tx: 55.5, ty: 120.25 });
    const g = api.np_placePiece(api.np_stockFor(0, layer), layer, { ...cmd, name: 'x' }, ox, oy);
    assert.equal(g.children.length, 1, 'จุดช่วยต้องถูกลบทิ้ง');
    const got = g.children[0].pts;
    tri.forEach((p, i) => {
      const want = B.applyIllustratorPlacement(p, cmd, ox, oy);
      assert.ok(Math.abs(got[i][0] - want[0]) < 1e-6 && Math.abs(got[i][1] - want[1]) < 1e-6, `angle ${angle} จุด ${i}`);
    });
  }
});

test('ปลั๊กอิน: ไฟล์ที่ manifest / HTML อ้างถึงมีครบ', () => {
  const cep = readFileSync(path.join(ROOT, 'CSXS', 'manifest.xml'), 'utf8');
  for (const m of cep.matchAll(/>\.\/([^<]+)</g)) assert.ok(existsSync(path.join(ROOT, m[1])), `CEP: ${m[1]}`);
  assert.match(cep, /<Host Name="ILST"/);

  const uxp = JSON.parse(readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  assert.equal(uxp.manifestVersion, 5);
  assert.equal(uxp.host.app, 'PS');
  assert.ok(existsSync(path.join(ROOT, uxp.main)));
  const icons = [...uxp.icons, ...uxp.entrypoints.flatMap((e) => e.icons || [])];
  for (const icon of icons) {
    for (const s of icon.scale) {
      const file = icon.path.replace(/\.png$/, `@${s}x.png`);
      assert.ok(existsSync(path.join(ROOT, file)), `UXP icon: ${file}`);
    }
  }

  for (const html of ['illustrator.html', 'photoshop.html']) {
    const src = readFileSync(path.join(ROOT, html), 'utf8');
    for (const m of src.matchAll(/(?:src|href)="([^"#:]+)"/g)) assert.ok(existsSync(path.join(ROOT, m[1])), `${html}: ${m[1]}`);
  }
});

test('ปลั๊กอิน: core ใช้ได้ทั้งแบบ <script> (window.NestingCut) และ require()', () => {
  const win = {};
  const ctx = vm.createContext({ window: win, Map, Set, Promise, setTimeout, performance });
  for (const f of ['geometry', 'nest', 'contour', 'layout', 'cutfile', 'pack', 'bridge']) {
    vm.runInContext(readFileSync(path.join(ROOT, 'core', f + '.js'), 'utf8'), ctx, { filename: f + '.js' });
  }
  assert.deepEqual(Object.keys(win.NestingCut).sort(), ['bridge', 'contour', 'cutfile', 'geometry', 'layout', 'nest', 'pack']);
  assert.equal(typeof win.NestingCut.nest.nest, 'function');
});
