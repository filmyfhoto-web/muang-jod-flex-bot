/* นัดพอน Sign Mockup — เวที 3 มิติ (three.js)
 * หน่วยในฉากเป็น "เมตร" ป้ายสร้างตามขนาดจริง (ซม. ÷ 100) พร้อมอุปกรณ์จริง:
 * ตาไก่ หมุดสแตนเลส โครงเหล็ก ขาโรลอัพ ขา X-Stand กล่องไฟ
 * ฉากสร้างจากโค้ดทั้งหมด (ผนัง อิฐ ตึกแถว รั้ว) — ไม่มีไฟล์รูปฉากให้โหลด ใช้ออฟไลน์ได้ */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const NS = (window.SignMockup = window.SignMockup || {});
const C = NS.core;

/* ---------------- ผิววัสดุ (วาดด้วย canvas) ---------------- */
let ANISO = 4;
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function mk(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
function tex(canvas, srgb = true) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = ANISO;
  return t;
}
function speckle(x, w, h, amt, seed) {
  const d = x.getImageData(0, 0, w, h);
  const r = rng(seed);
  for (let i = 0; i < d.data.length; i += 4) {
    const n = (r() - 0.5) * amt;
    d.data[i] += n;
    d.data[i + 1] += n;
    d.data[i + 2] += n;
  }
  x.putImageData(d, 0, 0);
}
// รอยด่างจาง ๆ วาดซ้ำขอบให้ต่อกันได้ไม่เห็นตะเข็บ
function blotches(x, w, h, n, alpha, seed, light = true) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const cx = r() * w;
    const cy = r() * h;
    const rad = (0.03 + r() * 0.12) * w;
    const dark = !light || r() < 0.5;
    const col = dark ? '0,0,0' : '255,255,255';
    for (const ox of [-w, 0, w]) {
      for (const oy of [-h, 0, h]) {
        const g = x.createRadialGradient(cx + ox, cy + oy, 0, cx + ox, cy + oy, rad);
        g.addColorStop(0, `rgba(${col},${alpha * (0.4 + r() * 0.6)})`);
        g.addColorStop(1, `rgba(${col},0)`);
        x.fillStyle = g;
        x.fillRect(cx + ox - rad, cy + oy - rad, rad * 2, rad * 2);
      }
    }
  }
}
const cache = {};
function once(key, make) {
  if (!cache[key]) cache[key] = make();
  return cache[key];
}

function plaster(base, seed) {
  return once('plaster' + base, () => {
    const c = mk(512, 512);
    const x = c.getContext('2d');
    x.fillStyle = base;
    x.fillRect(0, 0, 512, 512);
    blotches(x, 512, 512, 90, 0.05, seed);
    speckle(x, 512, 512, 12, seed + 1);
    const b = mk(512, 512);
    const y = b.getContext('2d');
    y.fillStyle = '#808080';
    y.fillRect(0, 0, 512, 512);
    blotches(y, 512, 512, 120, 0.12, seed + 2);
    speckle(y, 512, 512, 60, seed + 3);
    return { map: tex(c), bump: tex(b, false) };
  });
}

function tiles(key, n, px, base, groutCol, jitter, seed) {
  return once(key, () => {
    const c = mk(px, px);
    const x = c.getContext('2d');
    const rough = mk(px, px);
    const rx = rough.getContext('2d');
    const bump = mk(px, px);
    const bx = bump.getContext('2d');
    x.fillStyle = groutCol;
    x.fillRect(0, 0, px, px);
    rx.fillStyle = 'rgb(235,235,235)';
    rx.fillRect(0, 0, px, px);
    bx.fillStyle = 'rgb(40,40,40)';
    bx.fillRect(0, 0, px, px);
    const r = rng(seed);
    const s = px / n;
    const g = Math.max(3, px / 220);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const v = (r() - 0.5) * jitter;
        x.fillStyle = `rgb(${base[0] + v},${base[1] + v},${base[2] + v})`;
        x.fillRect(i * s + g / 2, j * s + g / 2, s - g, s - g);
        rx.fillStyle = 'rgb(80,80,80)';
        rx.fillRect(i * s + g / 2, j * s + g / 2, s - g, s - g);
        bx.fillStyle = 'rgb(205,205,205)';
        bx.fillRect(i * s + g / 2, j * s + g / 2, s - g, s - g);
      }
    }
    blotches(x, px, px, 60, 0.04, seed + 4);
    speckle(x, px, px, 10, seed + 5);
    speckle(rx, px, px, 30, seed + 6);
    return { map: tex(c), rough: tex(rough, false), bump: tex(bump, false) };
  });
}

// อิฐมอญ 22.5 × 7.5 ซม. (รวมปูน) — ผืนเดียวครอบ 90 × 90 ซม.
function bricks() {
  return once('bricks', () => {
    const px = 1024;
    const c = mk(px, px);
    const x = c.getContext('2d');
    const b = mk(px, px);
    const y = b.getContext('2d');
    x.fillStyle = '#c4bbae';
    x.fillRect(0, 0, px, px);
    y.fillStyle = 'rgb(35,35,35)';
    y.fillRect(0, 0, px, px);
    const cols = 4;
    const rows = 12;
    const bw = px / cols;
    const rh = px / rows;
    const m = 11;
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * (bw / 2);
      for (let k = -1; k <= cols; k++) {
        const kk = ((k % cols) + cols) % cols;
        const rr = rng(r * 31 + kk * 7 + 1);
        const a = rr();
        const bb = rr();
        x.fillStyle = `hsl(${10 + bb * 10},${36 + a * 16}%,${31 + a * 13}%)`;
        const x0 = k * bw + off + m / 2;
        x.fillRect(x0, r * rh + m / 2, bw - m, rh - m);
        const gr = x.createLinearGradient(0, r * rh, 0, (r + 1) * rh);
        gr.addColorStop(0, 'rgba(255,255,255,0.08)');
        gr.addColorStop(0.5, 'rgba(0,0,0,0)');
        gr.addColorStop(1, 'rgba(0,0,0,0.16)');
        x.fillStyle = gr;
        x.fillRect(x0, r * rh + m / 2, bw - m, rh - m);
        y.fillStyle = `rgb(${190 + a * 40},${190 + a * 40},${190 + a * 40})`;
        y.fillRect(x0, r * rh + m / 2, bw - m, rh - m);
      }
    }
    speckle(x, px, px, 26, 9);
    speckle(y, px, px, 70, 10);
    blotches(x, px, px, 40, 0.05, 12);
    return { map: tex(c), bump: tex(b, false) };
  });
}

// ประตูม้วน: ลอน 7.5 ซม. — ผืนครอบกว้าง 1 ม. สูง 75 ซม. (10 ลอน)
function shutterTex() {
  return once('shutter', () => {
    const c = mk(256, 512);
    const x = c.getContext('2d');
    const b = mk(256, 512);
    const y = b.getContext('2d');
    const rib = 512 / 10;
    for (let i = 0; i < 10; i++) {
      const y0 = i * rib;
      const g = x.createLinearGradient(0, y0, 0, y0 + rib);
      g.addColorStop(0, '#f1f2f3');
      g.addColorStop(0.18, '#d9dce0');
      g.addColorStop(0.7, '#bfc4c9');
      g.addColorStop(0.9, '#8d939a');
      g.addColorStop(1, '#6e747b');
      x.fillStyle = g;
      x.fillRect(0, y0, 256, rib);
      const h = y.createLinearGradient(0, y0, 0, y0 + rib);
      h.addColorStop(0, '#e0e0e0');
      h.addColorStop(0.6, '#a0a0a0');
      h.addColorStop(0.95, '#202020');
      h.addColorStop(1, '#101010');
      y.fillStyle = h;
      y.fillRect(0, y0, 256, rib);
    }
    speckle(x, 256, 512, 10, 21);
    return { map: tex(c), bump: tex(b, false) };
  });
}

function grassTex() {
  return once('grass', () => {
    const px = 512;
    const c = mk(px, px);
    const x = c.getContext('2d');
    x.fillStyle = '#6d8c43';
    x.fillRect(0, 0, px, px);
    blotches(x, px, px, 60, 0.12, 31);
    const r = rng(33);
    x.lineCap = 'round';
    for (let i = 0; i < 9000; i++) {
      const gx = r() * px;
      const gy = r() * px;
      const l = 3 + r() * 7;
      const v = r();
      x.strokeStyle = `hsl(${78 + v * 22},${38 + v * 20}%,${24 + v * 22}%)`;
      x.lineWidth = 1 + r();
      x.beginPath();
      x.moveTo(gx, gy);
      x.lineTo(gx + (r() - 0.5) * 3, gy - l);
      x.stroke();
    }
    return { map: tex(c) };
  });
}

function asphaltTex() {
  return once('asphalt', () => {
    const c = mk(256, 256);
    const x = c.getContext('2d');
    x.fillStyle = '#4a4b4e';
    x.fillRect(0, 0, 256, 256);
    speckle(x, 256, 256, 46, 41);
    blotches(x, 256, 256, 30, 0.08, 42);
    return { map: tex(c) };
  });
}

// ตาข่ายรั้ว: ช่องข้าวหลามตัด 6 ซม. — ผืนครอบ 12 × 12 ซม.
function chainTex() {
  return once('chain', () => {
    const c = mk(128, 128);
    const x = c.getContext('2d');
    x.strokeStyle = '#b8bec4';
    x.lineWidth = 5;
    x.lineCap = 'round';
    for (const o of [-128, -64, 0, 64, 128]) {
      x.beginPath();
      x.moveTo(o, 0);
      x.lineTo(o + 128, 128);
      x.moveTo(o + 128, 0);
      x.lineTo(o, 128);
      x.stroke();
    }
    return { map: tex(c) };
  });
}

function skyTex(night) {
  return once('sky' + night, () => {
    const c = mk(1024, 512);
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 512);
    if (night) {
      g.addColorStop(0, '#05070f');
      g.addColorStop(0.47, '#1a2440');
      g.addColorStop(0.5, '#2a3350');
      g.addColorStop(1, '#0b0e16');
    } else {
      g.addColorStop(0, '#4f86c2');
      g.addColorStop(0.42, '#a9c9e3');
      g.addColorStop(0.5, '#e3ecef');
      g.addColorStop(0.52, '#c9d3c4');
      g.addColorStop(1, '#8a9a76');
    }
    x.fillStyle = g;
    x.fillRect(0, 0, 1024, 512);
    if (!night) {
      const r = rng(55);
      for (let i = 0; i < 26; i++) {
        const cx = r() * 1024;
        const cy = 60 + r() * 150;
        const w = 60 + r() * 140;
        const h = 10 + r() * 22;
        const cg = x.createRadialGradient(cx, cy, 0, cx, cy, w);
        cg.addColorStop(0, 'rgba(255,255,255,0.55)');
        cg.addColorStop(1, 'rgba(255,255,255,0)');
        x.save();
        x.translate(cx, cy);
        x.scale(1, h / w);
        x.translate(-cx, -cy);
        x.fillStyle = cg;
        x.fillRect(cx - w, cy - w, w * 2, w * 2);
        x.restore();
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.mapping = THREE.EquirectangularReflectionMapping;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

/* ---------------- ชิ้นส่วนเรขาคณิต ---------------- */
function std(o) {
  const m = new THREE.MeshStandardMaterial(o);
  m.envMapIntensity = LIGHT.env;
  return m;
}
const MAT = {};
function mats() {
  if (MAT.chrome) return MAT;
  MAT.chrome = std({ color: 0xe9eaec, metalness: 1, roughness: 0.14 });
  MAT.alu = std({ color: 0xc9cdd3, metalness: 0.85, roughness: 0.32 });
  MAT.darkAlu = std({ color: 0x4a4f57, metalness: 0.6, roughness: 0.4 });
  MAT.plastic = std({ color: 0x2b2f35, metalness: 0, roughness: 0.55 });
  MAT.steel = std({ color: 0x9aa1a8, metalness: 0.9, roughness: 0.35 });
  MAT.eyeHole = std({ color: 0x1b1b1b, roughness: 0.9 });
  MAT.back = std({ color: 0xe4e3df, roughness: 0.92 });
  MAT.foamEdge = std({ color: 0xf4f3ef, roughness: 0.85 });
  MAT.person = std({ color: 0xa3abbb, roughness: 0.62 });
  MAT.tie = std({ color: 0x151618, roughness: 0.6 });
  return MAT;
}
function shadowy(o, cast = true, receive = true) {
  o.traverse((m) => {
    if (m.isMesh) {
      m.castShadow = cast;
      m.receiveShadow = receive;
    }
  });
  return o;
}
const UP = new THREE.Vector3(0, 1, 0);
function rod(a, b, r, mat, seg = 12) {
  const d = new THREE.Vector3().subVectors(b, a);
  const len = d.length();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), mat);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(UP, d.normalize());
  return m;
}
// ระนาบที่ยืดจากเส้นโปรไฟล์ (z,y) ไปตามแกน x — ใช้ทำพื้นโค้งสตูดิโอ
function profileMesh(points, width, mat) {
  const pos = [];
  const uv = [];
  const idx = [];
  let acc = 0;
  for (let i = 0; i < points.length; i++) {
    if (i) acc += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
    pos.push(-width / 2, points[i][1], points[i][0], width / 2, points[i][1], points[i][0]);
    uv.push(0, acc, width, acc);
    if (i) {
      const a = (i - 1) * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return new THREE.Mesh(g, mat);
}
function plane(w, h, mat) {
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
}
function box(w, h, d, mat) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
}
function repeatOf(t, rx, ry) {
  const c = t.clone();
  c.needsUpdate = true;
  c.repeat.set(rx, ry);
  return c;
}
function floorMesh(w, d, set, opts = {}) {
  const m = std({
    map: repeatOf(set.map, w / opts.tile, d / opts.tile),
    roughnessMap: set.rough ? repeatOf(set.rough, w / opts.tile, d / opts.tile) : null,
    bumpMap: set.bump ? repeatOf(set.bump, w / opts.tile, d / opts.tile) : null,
    bumpScale: opts.bumpScale || 1,
    roughness: opts.roughness == null ? 1 : opts.roughness,
    metalness: 0,
  });
  const f = plane(w, d, m);
  f.rotation.x = -Math.PI / 2;
  f.receiveShadow = true;
  return f;
}

/* ---------------- ฉาก ---------------- */
function buildStudio() {
  const g = new THREE.Group();
  const R = 0.4;
  const pts = [[14, 0]];
  for (let i = 0; i <= 16; i++) {
    const a = -Math.PI / 2 - (Math.PI / 2) * (i / 16);
    pts.push([R + R * Math.cos(a), R + R * Math.sin(a)]);
  }
  pts.push([0, 12]);
  const cyc = profileMesh(pts.map(([z, y]) => [z, y]), 40, std({ color: 0xecebe7, roughness: 0.94 }));
  cyc.receiveShadow = true;
  g.add(cyc);
  return { group: g, bg: new THREE.Color(0xe7e5e0), fog: [0xe7e5e0, 14, 34], floorZ: 1.2, wallZ: 0, kind: 'indoor' };
}

function buildWall() {
  const g = new THREE.Group();
  const p = plaster('#e9e4db', 3);
  const wall = plane(30, 6, std({ map: repeatOf(p.map, 20, 4), bumpMap: repeatOf(p.bump, 20, 4), bumpScale: 0.6, roughness: 0.95 }));
  wall.position.set(0, 3, 0);
  wall.receiveShadow = true;
  g.add(wall);
  const base = box(30, 0.1, 0.014, std({ color: 0xd9d3c8, roughness: 0.55 }));
  base.position.set(0, 0.05, 0.007);
  base.receiveShadow = true;
  g.add(base);
  const t = tiles('tiles60', 2, 1024, [212, 205, 194], '#a29a8e', 12, 7);
  const f = floorMesh(30, 16, t, { tile: 1.2, roughness: 1, bumpScale: 0.8 });
  f.position.set(0, 0, 8);
  g.add(f);
  return { group: g, bg: new THREE.Color(0xcfc8bc), floorZ: 0.7, wallZ: 0, kind: 'indoor' };
}

function buildBrick() {
  const g = new THREE.Group();
  const b = bricks();
  const wall = plane(30, 6, std({ map: repeatOf(b.map, 30 / 0.9, 6 / 0.9), bumpMap: repeatOf(b.bump, 30 / 0.9, 6 / 0.9), bumpScale: 2.2, roughness: 0.92 }));
  wall.position.set(0, 3, 0);
  wall.receiveShadow = true;
  g.add(wall);
  const t = tiles('concrete', 1, 1024, [168, 164, 157], '#6f6b66', 0, 17);
  const f = floorMesh(30, 16, t, { tile: 2.4, roughness: 1, bumpScale: 0.5 });
  f.position.set(0, 0, 8);
  g.add(f);
  return { group: g, bg: new THREE.Color(0x9c8f84), floorZ: 0.7, wallZ: 0, kind: 'indoor' };
}

// ตึกแถว: ห้องละ 4 ม. ประตูม้วนสูง 2.7 ม. เสา กันสาด หน้าต่างชั้นสอง ทางเท้า ขอบถนน
function buildShop() {
  const g = new THREE.Group();
  const facade = plaster('#e8ddc7', 61);
  const facadeMat = std({ map: repeatOf(facade.map, 1.5, 1.5), bumpMap: repeatOf(facade.bump, 1.5, 1.5), bumpScale: 0.5, roughness: 0.92 });
  const pillarMat = std({ map: repeatOf(facade.map, 0.4, 2), color: 0xf1e7d4, roughness: 0.9 });
  const sh = shutterTex();
  const glass = std({ color: 0x27323e, metalness: 0.9, roughness: 0.06 });
  const frameMat = std({ color: 0xd8ccb6, roughness: 0.7 });
  const N = 9; // ตึกแถว 9 ห้อง หมุนกล้องไปไกล ๆ ก็ยังไม่สุดแถว
  const W = 4;
  const lower = new THREE.Group();
  const upper = new THREE.Group();
  for (let k = -4; k <= 4; k++) {
    const mx = k * W;
    // ประตูม้วน (ร่นเข้าไป 18 ซม.)
    const shutter = plane(3.3, 2.7, std({ map: repeatOf(sh.map, 3.3, 2.7 / 0.75), bumpMap: repeatOf(sh.bump, 3.3, 2.7 / 0.75), bumpScale: 1.5, metalness: 0.55, roughness: 0.42 }));
    shutter.position.set(mx, 1.35, -0.18);
    shutter.receiveShadow = true;
    lower.add(shutter);
    const bar = box(3.3, 0.12, 0.05, MAT.darkAlu);
    bar.position.set(mx, 0.06, -0.15);
    lower.add(bar);
    for (const s of [-1, 1]) {
      const rail = box(0.06, 2.7, 0.08, MAT.darkAlu);
      rail.position.set(mx + s * 1.62, 1.35, -0.14);
      lower.add(rail);
      const reveal = box(0.02, 2.7, 0.18, facadeMat);
      reveal.position.set(mx + s * 1.66, 1.35, -0.09);
      lower.add(reveal);
    }
    const soffit = box(3.34, 0.02, 0.18, facadeMat);
    soffit.position.set(mx, 2.7, -0.09);
    lower.add(soffit);
    // หน้าต่างชั้นสอง
    const win = new THREE.Group();
    const fr = box(2.1, 1.7, 0.08, frameMat);
    fr.position.set(0, 0, 0.0);
    win.add(fr);
    const gl = box(1.94, 1.54, 0.02, glass);
    gl.position.set(0, 0, 0.04);
    win.add(gl);
    const mull = box(0.06, 1.54, 0.03, frameMat);
    mull.position.set(0, 0, 0.055);
    win.add(mull);
    win.position.set(mx, 1.25, -0.05);
    upper.add(win);
  }
  // ผนังเหนือประตูม้วน (ที่ติดป้าย) + เสา
  const header = box(N * W, 1, 0.2, facadeMat);
  header.position.set(0, 0, -0.1);
  g.add(header);
  for (let k = -4; k <= 5; k++) {
    const p = box(0.36, 1, 0.34, pillarMat);
    p.position.set(k * W - W / 2, 0, -0.03);
    g.add(p);
    p.userData.pillar = true;
  }
  // กันสาดชั้นสอง
  const ledge = box(N * W, 0.14, 0.75, std({ color: 0xd9ccb3, roughness: 0.85 }));
  g.add(ledge);
  const upperWall = box(N * W, 4, 0.2, facadeMat);
  upperWall.position.set(0, 2, -0.16);
  upper.add(upperWall);
  // ทางเท้า ขอบถนน ถนน
  const pav = tiles('pavers', 4, 512, [178, 172, 162], '#7d776d', 18, 71);
  const walk = floorMesh(N * W + 10, 3, pav, { tile: 1.2, bumpScale: 0.8 });
  walk.position.set(0, 0, 1.5);
  g.add(walk);
  const curb = box(N * W + 10, 0.15, 0.15, std({ color: 0xb9b4aa, roughness: 0.9 }));
  curb.position.set(0, 0.0, 3.07);
  g.add(curb);
  const ap = asphaltTex();
  const road = floorMesh(N * W + 30, 30, { map: ap.map }, { tile: 2 });
  road.position.set(0, -0.12, 18.1);
  g.add(road);
  g.add(lower, upper);
  shadowy(g, true, true);
  road.castShadow = false;
  const env = { group: g, bg: new THREE.Color(0xbcc7cf), floorZ: 0.9, wallZ: 0, kind: 'street' };
  // ปรับความสูงผนังหน้าร้าน/กันสาดตามความสูงป้าย
  env.fit = (signTop) => {
    const ledgeY = Math.max(4.2, signTop + 0.3);
    const hh = ledgeY - 2.7;
    header.scale.y = hh;
    header.position.y = 2.7 + hh / 2;
    g.children.forEach((c) => {
      if (c.userData.pillar) {
        c.scale.y = ledgeY;
        c.position.y = ledgeY / 2;
      }
    });
    ledge.position.set(0, ledgeY + 0.07, 0.17);
    upper.position.y = ledgeY + 0.14;
  };
  env.fit(3.9);
  return env;
}

// รั้วตาข่ายกลางแจ้ง: เสาทุก 2.5 ม. ราวบน หญ้า แนวต้นไม้ ฟ้า
function buildFence() {
  const g = new THREE.Group();
  const gr = grassTex();
  const ground = floorMesh(120, 120, gr, { tile: 1.6 });
  ground.position.set(0, 0, 0);
  g.add(ground);
  const trees = new THREE.Group();
  const r = rng(77);
  const leaf = [0x4d7a3a, 0x5b8744, 0x426a33, 0x678f4c, 0x3d5f2f].map((c) => std({ color: c, roughness: 1 }));
  const trunk = std({ color: 0x5b4636, roughness: 0.9 });
  const sph = new THREE.IcosahedronGeometry(1, 3);
  for (let i = 0; i < 64; i++) {
    const x = (r() - 0.5) * 90;
    const z = -26 - r() * 26;
    const s = 1.8 + r() * 2.4;
    const tr = box(0.3, 2.2, 0.3, trunk);
    tr.position.set(x, 1.1, z);
    trees.add(tr);
    // ทรงพุ่มจากก้อนกลมหลายก้อน ให้ดูนุ่ม ไม่เหลี่ยม
    for (let j = 0; j < 4; j++) {
      const b = new THREE.Mesh(sph, leaf[(i + j) % leaf.length]);
      b.position.set(x + (r() - 0.5) * s, 2.2 + s * (0.7 + r() * 0.6), z + (r() - 0.5) * s * 0.6);
      const k = s * (0.55 + r() * 0.4);
      b.scale.set(k, k * (0.85 + r() * 0.3), k);
      trees.add(b);
    }
  }
  g.add(trees);
  const fence = new THREE.Group();
  const ch = chainTex();
  const meshMat = std({ map: repeatOf(ch.map, 25 / 0.12, 2 / 0.12), alphaTest: 0.45, metalness: 0.7, roughness: 0.45, side: THREE.DoubleSide });
  const mesh = plane(25, 1, meshMat);
  fence.add(mesh);
  const rail = rod(new THREE.Vector3(-12.5, 0, 0), new THREE.Vector3(12.5, 0, 0), 0.021, MAT.steel);
  fence.add(rail);
  const posts = [];
  for (let k = -5; k <= 4; k++) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1, 14), MAT.steel);
    p.position.set(1.25 + k * 2.5, 0, -0.03);
    fence.add(p);
    posts.push(p);
  }
  g.add(fence);
  shadowy(g, true, true);
  ground.castShadow = false;
  trees.traverse((m) => (m.castShadow = false));
  const env = { group: g, bg: null, sky: true, fog: [0xcfdde2, 18, 70], floorZ: 0.9, wallZ: 0.035, kind: 'outdoor' };
  env.fit = (signTop) => {
    const F = Math.max(1.8, signTop + 0.15);
    mesh.scale.y = F - 0.03;
    mesh.position.y = 0.03 + (F - 0.03) / 2;
    meshMat.map.repeat.set(25 / 0.12, (F - 0.03) / 0.12);
    rail.position.y = F;
    posts.forEach((p) => {
      p.scale.y = F + 0.06;
      p.position.y = (F + 0.06) / 2;
    });
  };
  env.fit(1.6);
  return env;
}

/* ---------------- ฉากในอาคาร: ประตู ห้องเรียน ---------------- */
// ลายไม้: สักบานลูกฟัก (ประตูห้องเรียน) / โอ๊คบานเรียบ (ห้องทำงาน) — ผืนเดียวคลุมทั้งบาน
function woodTex(kind) {
  return once('wood' + kind, () => {
    const W = 512;
    const H = 1024;
    const c = mk(W, H);
    const x = c.getContext('2d');
    const b = mk(W, H);
    const y = b.getContext('2d');
    const base = kind === 'teak' ? [136, 86, 50] : [198, 164, 122];
    x.fillStyle = `rgb(${base.join(',')})`;
    x.fillRect(0, 0, W, H);
    y.fillStyle = '#909090';
    y.fillRect(0, 0, W, H);
    const r = rng(kind === 'teak' ? 91 : 92);
    for (let i = 0; i < 280; i++) {
      const gx = r() * W;
      const dark = r() < 0.62;
      const a = 0.05 + r() * 0.12;
      x.strokeStyle = dark ? `rgba(60,30,10,${a})` : `rgba(255,232,196,${a * 0.6})`;
      x.lineWidth = 0.6 + r() * 2.2;
      const amp = 2 + r() * 6;
      const fr = 0.003 + r() * 0.01;
      const ph = r() * 6;
      x.beginPath();
      x.moveTo(gx, 0);
      for (let yy = 0; yy <= H; yy += 16) x.lineTo(gx + Math.sin(yy * fr + ph) * amp, yy);
      x.stroke();
    }
    speckle(x, W, H, 8, 93);
    if (kind === 'teak') {
      for (const [px, py, pw, ph] of [[0.16, 0.07, 0.68, 0.37], [0.16, 0.53, 0.68, 0.39]]) {
        const X0 = px * W;
        const Y0 = py * H;
        const PW = pw * W;
        const PH = ph * H;
        const bev = 20;
        x.strokeStyle = 'rgba(40,20,8,0.6)';
        x.lineWidth = 4;
        x.strokeRect(X0, Y0, PW, PH);
        x.strokeStyle = 'rgba(255,220,180,0.28)';
        x.lineWidth = 2;
        x.strokeRect(X0 + bev, Y0 + bev, PW - 2 * bev, PH - 2 * bev);
        y.fillStyle = '#404040';
        y.fillRect(X0, Y0, PW, PH);
        y.fillStyle = '#b4b4b4';
        y.fillRect(X0 + bev, Y0 + bev, PW - 2 * bev, PH - 2 * bev);
      }
    }
    return { map: tex(c), bump: tex(b, false) };
  });
}

// พื้นหินขัด (ทางเดินอาคารเรียน) — ผืนครอบ 1.2 × 1.2 ม. เส้นทองเหลืองที่ขอบ
function terrazzo() {
  return once('terrazzo', () => {
    const px = 1024;
    const c = mk(px, px);
    const x = c.getContext('2d');
    x.fillStyle = '#b8b4ac';
    x.fillRect(0, 0, px, px);
    const r = rng(101);
    const chips = ['#ecebe7', '#3e3c39', '#8f8b84', '#d6cab4', '#6e6a63', '#c9c6bf'];
    for (let i = 0; i < 14000; i++) {
      x.fillStyle = chips[(r() * chips.length) | 0];
      const cx = r() * px;
      const cy = r() * px;
      const sz = 1.5 + r() * r() * 9;
      x.beginPath();
      x.moveTo(cx + sz, cy);
      for (let k = 1; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2 + r();
        x.lineTo(cx + Math.cos(a) * sz * (0.6 + r() * 0.5), cy + Math.sin(a) * sz * (0.6 + r() * 0.5));
      }
      x.fill();
    }
    x.fillStyle = '#a08a55';
    x.fillRect(0, 0, px, 3);
    x.fillRect(0, 0, 3, px);
    return { map: tex(c) };
  });
}

// พื้นไม้ลามิเนต: แผ่นกว้าง 20 ซม. ยาว 1.2 ม. วางสลับรอยต่อ — ผืนครอบ 1.2 × 1.2 ม.
function laminate() {
  return once('laminate', () => {
    const px = 1024;
    const c = mk(px, px);
    const x = c.getContext('2d');
    const rows = 6;
    const rh = px / rows;
    const r = rng(111);
    for (let i = 0; i < rows; i++) {
      const off = ((i * 0.37) % 1) * px;
      for (const ox of [off - px, off]) {
        const v = (r() - 0.5) * 26;
        x.fillStyle = `rgb(${178 + v},${138 + v},${98 + v * 0.8})`;
        x.fillRect(ox, i * rh, px, rh);
        for (let k = 0; k < 40; k++) {
          x.strokeStyle = `rgba(80,45,20,${0.04 + r() * 0.08})`;
          x.lineWidth = 0.6 + r() * 1.6;
          const yy = i * rh + r() * rh;
          x.beginPath();
          x.moveTo(ox, yy);
          for (let xx = 0; xx <= px; xx += 32) x.lineTo(ox + xx, yy + Math.sin(xx * 0.01 + k) * 2);
          x.stroke();
        }
        x.fillStyle = 'rgba(40,24,10,0.45)';
        x.fillRect(ox + px - 2, i * rh, 2, rh);
      }
      x.fillStyle = 'rgba(40,24,10,0.4)';
      x.fillRect(0, i * rh, px, 2);
    }
    speckle(x, px, px, 8, 112);
    return { map: tex(c) };
  });
}

// บอร์ดไม้ก๊อกติดกระดาษสี (บอร์ดนิเทศ)
function corkTex() {
  return once('cork', () => {
    const c = mk(640, 360);
    const x = c.getContext('2d');
    x.fillStyle = '#b78656';
    x.fillRect(0, 0, 640, 360);
    speckle(x, 640, 360, 70, 121);
    const r = rng(122);
    const papers = ['#fff6a8', '#ffd1dc', '#c9ecff', '#d6f5c7', '#ffffff', '#ffe1b3'];
    for (let i = 0; i < 9; i++) {
      const w = 90 + r() * 80;
      const h = 60 + r() * 70;
      const px = 20 + (i % 3) * 205 + r() * 30;
      const py = 20 + Math.floor(i / 3) * 112 + r() * 15;
      x.save();
      x.translate(px + w / 2, py + h / 2);
      x.rotate((r() - 0.5) * 0.12);
      x.fillStyle = 'rgba(0,0,0,0.18)';
      x.fillRect(-w / 2 + 3, -h / 2 + 4, w, h);
      x.fillStyle = papers[i % papers.length];
      x.fillRect(-w / 2, -h / 2, w, h);
      x.fillStyle = 'rgba(40,50,70,0.35)';
      for (let l = 0; l < 4; l++) x.fillRect(-w / 2 + 10, -h / 2 + 14 + l * 12, w * (0.4 + r() * 0.45), 4);
      x.fillStyle = ['#d33', '#36c', '#2a2'][i % 3];
      x.beginPath();
      x.arc(0, -h / 2 + 6, 5, 0, Math.PI * 2);
      x.fill();
      x.restore();
    }
    return { map: tex(c) };
  });
}

// พื้นกระเบื้องดินเผาลาย 30 ซม. แบบทางเดิน/ห้องเรียนโรงเรียน — ผืนครอบ 1.2 ม. เงาวาว
function clayTiles() {
  return once('clay', () => {
    const px = 1024;
    const n = 4;
    const sz = px / n;
    const c = mk(px, px);
    const x = c.getContext('2d');
    const rough = mk(px, px);
    const rx = rough.getContext('2d');
    x.fillStyle = '#c9ad8c';
    x.fillRect(0, 0, px, px);
    rx.fillStyle = 'rgb(210,210,210)';
    rx.fillRect(0, 0, px, px);
    const r = rng(161);
    const gap = 6;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const v = (r() - 0.5) * 20;
        const X0 = i * sz + gap / 2;
        const Y0 = j * sz + gap / 2;
        const S = sz - gap;
        const gr = x.createLinearGradient(X0, Y0, X0 + S, Y0 + S);
        gr.addColorStop(0, `rgb(${152 + v},${70 + v * 0.5},${46 + v * 0.4})`);
        gr.addColorStop(1, `rgb(${130 + v},${56 + v * 0.5},${37 + v * 0.4})`);
        x.fillStyle = gr;
        x.fillRect(X0, Y0, S, S);
        // ลายนูนสีอ่อน: กรอบใน + ข้าวหลามตัดกลาง + จุดมุม
        x.strokeStyle = 'rgba(232,180,140,0.5)';
        x.lineWidth = 3;
        x.strokeRect(X0 + S * 0.1, Y0 + S * 0.1, S * 0.8, S * 0.8);
        x.fillStyle = 'rgba(232,180,140,0.55)';
        const cx = X0 + S / 2;
        const cy = Y0 + S / 2;
        const d = S * 0.09;
        x.beginPath();
        x.moveTo(cx, cy - d);
        x.lineTo(cx + d, cy);
        x.lineTo(cx, cy + d);
        x.lineTo(cx - d, cy);
        x.closePath();
        x.fill();
        for (const [ox, oy] of [[0.1, 0.1], [0.9, 0.1], [0.1, 0.9], [0.9, 0.9]]) {
          x.beginPath();
          x.arc(X0 + S * ox, Y0 + S * oy, S * 0.025, 0, Math.PI * 2);
          x.fill();
        }
        rx.fillStyle = 'rgb(55,55,55)';
        rx.fillRect(X0, Y0, S, S);
      }
    }
    speckle(x, px, px, 10, 162);
    return { map: tex(c), rough: tex(rough, false) };
  });
}

// ผนังทาสีสองสี (ล่าง / บน) เว้นช่องประตูได้ — UV เป็นหน่วยเมตร ใช้วัสดุชุดเดียวทั้งผนัง
function toneMats(tone) {
  const t = C.WALL_TONES[tone] || C.WALL_TONES.pink;
  const p = plaster('#f3efe7', 131);
  const mat = (col) => {
    const m = std({ map: p.map, bumpMap: p.bump, bumpScale: 0.5, color: new THREE.Color(col), roughness: 0.9 });
    m.map.repeat.set(1, 1);
    return m;
  };
  return { lower: mat(t.lower), upper: mat(t.upper) };
}
function setTone(mats, tone) {
  const t = C.WALL_TONES[tone] || C.WALL_TONES.pink;
  mats.lower.color.set(t.lower);
  mats.upper.color.set(t.upper);
}
function wallRect(x0, x1, y0, y1, mat) {
  const w = x1 - x0;
  const h = y1 - y0;
  const geo = new THREE.PlaneGeometry(w, h);
  const uv = geo.attributes.uv;
  const pos = geo.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) + x0 + w / 2) / 1.5, (pos.getY(i) + y0 + h / 2) / 1.5);
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x0 + w / 2, y0 + h / 2, 0);
  m.receiveShadow = true;
  return m;
}
// open = { x0, x1, y1 } ช่องประตู (เว้นไว้) หรือ null
function paintedWall(w, h, mats, split, open) {
  const g = new THREE.Group();
  const L = -w / 2;
  const R = w / 2;
  const rects = open ? [[L, open.x0, 0, h], [open.x1, R, 0, h], [open.x0, open.x1, open.y1, h]] : [[L, R, 0, h]];
  const stripe = std({ color: 0x8a9a9a, roughness: 0.6 });
  for (const [a, b, c, d] of rects) {
    if (b - a < 0.001 || d - c < 0.001) continue;
    if (c < split) g.add(wallRect(a, b, c, Math.min(d, split), mats.lower));
    if (d > split) g.add(wallRect(a, b, Math.max(c, split), d, mats.upper));
    if (c < split && d > split) {
      const st = box(b - a, 0.02, 0.006, stripe);
      st.position.set((a + b) / 2, split, 0.003);
      g.add(st);
    }
  }
  return g;
}

/* ประตูบานเดี่ยวขนาดใดก็ได้ (เมตร) — จุดเริ่มคือกึ่งกลางพื้นหน้าผนัง
 * panel = บานไม้สักลูกฟัก มือจับแบบด้ามจับ + กลอน (ประตูห้องเรียน) / flush = บานเรียบ มือจับก้านโยก
 * side = ฝั่งมือจับ (+1 ขวา, −1 ซ้าย) */
function makeDoor(style, W, H, side = 1, withFrame = true) {
  const g = new THREE.Group();
  const fw = 0.07;
  const fd = 0.03;
  const ld = 0.04;
  const wood = woodTex(style === 'panel' ? 'teak' : 'oak');
  const leafMat = std({ map: wood.map, bumpMap: wood.bump, bumpScale: 2.5, roughness: style === 'panel' ? 0.55 : 0.42 });
  const edgeMat = std({ color: style === 'panel' ? 0x6a4226 : 0xb38c60, roughness: 0.6 });
  const leaf = box(W - 0.01, H - 0.01, ld, [edgeMat, edgeMat, edgeMat, edgeMat, leafMat, edgeMat]);
  leaf.position.set(0, 0.01 + (H - 0.01) / 2, ld / 2 + 0.004);
  g.add(leaf);
  if (withFrame) {
    const frameMat = style === 'panel' ? std({ color: 0x5c3920, roughness: 0.6 }) : std({ color: 0xf1eee8, roughness: 0.45 });
    for (const sx of [-1, 1]) {
      const f = box(fw, H + fw, fd, frameMat);
      f.position.set(sx * (W / 2 + fw / 2), (H + fw) / 2, fd / 2);
      g.add(f);
    }
    const top = box(W + 2 * fw, fw, fd, frameMat);
    top.position.set(0, H + fw / 2, fd / 2);
    g.add(top);
  }
  const fz = ld + 0.004;
  const hw = new THREE.Group();
  const hx = side * (W / 2 - 0.075);
  if (style === 'panel') {
    // มือจับแบบด้าม (ตั้ง) + กลอนประตูทองเหลืองเก่า
    const brass = std({ color: 0x6b5a45, metalness: 0.8, roughness: 0.45 });
    for (const y of [0.98, 1.18]) {
      hw.add(rod(new THREE.Vector3(hx, y, fz), new THREE.Vector3(hx, y, fz + 0.05), 0.008, brass));
      const plate = box(0.03, 0.03, 0.006, brass);
      plate.position.set(hx, y, fz + 0.003);
      hw.add(plate);
    }
    hw.add(rod(new THREE.Vector3(hx, 0.95, fz + 0.05), new THREE.Vector3(hx, 1.21, fz + 0.05), 0.011, brass));
    const bx = side * (W / 2 - 0.13);
    const bplate = box(0.17, 0.04, 0.006, MAT.steel);
    bplate.position.set(bx, 1.36, fz + 0.003);
    hw.add(bplate);
    hw.add(rod(new THREE.Vector3(bx - 0.1, 1.36, fz + 0.016), new THREE.Vector3(bx + 0.1, 1.36, fz + 0.016), 0.008, MAT.steel));
    const knob = rod(new THREE.Vector3(bx - side * 0.02, 1.36, fz + 0.016), new THREE.Vector3(bx - side * 0.02, 1.36, fz + 0.045), 0.006, MAT.steel);
    hw.add(knob);
  } else {
    const rose = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.01, 24), MAT.chrome);
    rose.rotation.x = Math.PI / 2;
    rose.position.set(hx, 1.0, fz + 0.005);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.045, 12), MAT.chrome);
    neck.rotation.x = Math.PI / 2;
    neck.position.set(hx, 1.0, fz + 0.03);
    const lever = new THREE.Mesh(new RoundedBoxGeometry(0.13, 0.02, 0.018, 2, 0.008), MAT.chrome);
    lever.position.set(hx - side * 0.055, 1.0, fz + 0.05);
    const key = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.008, 20), MAT.chrome);
    key.rotation.x = Math.PI / 2;
    key.position.set(hx, 0.9, fz + 0.004);
    hw.add(rose, neck, lever, key);
  }
  g.add(hw);
  g.userData.face = fz;
  g.userData.hw = hw;
  return shadowy(g, true, true);
}

// หน้าต่างบานเกล็ด + เหล็กดัด (มีแสงสว่างข้างนอกหลังกระจก) — วางชิดผนังที่ z=0
function louverWindow(w, h) {
  const g = new THREE.Group();
  const outside = plane(w, h, new THREE.MeshBasicMaterial({ color: 0xe6f1f5 }));
  outside.position.z = 0.004;
  g.add(outside);
  const fr = MAT.darkAlu;
  for (const [bw, bh, x, y] of [[w, 0.04, 0, h / 2], [w, 0.04, 0, -h / 2], [0.04, h, -w / 2, 0], [0.04, h, w / 2, 0], [0.03, h, 0, 0]]) {
    const b = box(bw, bh, 0.05, fr);
    b.position.set(x, y, 0.025);
    g.add(b);
  }
  const glass = std({ color: 0xc3d8de, roughness: 0.06, metalness: 0.25, transparent: true, opacity: 0.5 });
  const n = Math.floor((h - 0.06) / 0.095);
  for (let i = 0; i < n; i++) {
    for (const sx of [-1, 1]) {
      const sl = box(w / 2 - 0.05, 0.1, 0.005, glass);
      sl.rotation.x = -0.5;
      sl.position.set((sx * w) / 4, -h / 2 + 0.07 + i * 0.095, 0.03);
      g.add(sl);
    }
  }
  const bar = std({ color: 0x2f3338, metalness: 0.6, roughness: 0.45 });
  for (let x = -w / 2 + 0.1; x < w / 2 - 0.05; x += 0.12) {
    const b = box(0.012, h - 0.04, 0.012, bar);
    b.position.set(x, 0, 0.06);
    g.add(b);
  }
  g.traverse((m) => {
    if (m.isMesh) m.castShadow = false;
  });
  return g;
}

function ceiling(w, d, y, z0, color) {
  const c = plane(w, d, std({ color, roughness: 0.95 }));
  c.rotation.x = Math.PI / 2;
  c.position.set(0, y, z0 + d / 2);
  c.receiveShadow = true;
  return c;
}

function noCast(g) {
  g.traverse((m) => {
    if (m.isMesh) m.castShadow = false;
  });
  return g;
}

function disposeTree(o) {
  o.traverse((m) => {
    if (m.isMesh) {
      m.geometry.dispose();
      (Array.isArray(m.material) ? m.material : [m.material]).forEach((mm) => {
        if (!Object.values(MAT).includes(mm) && !mm.userData.keep) mm.dispose();
      });
    }
  });
}

// ห้องเรียนด้านหลังช่องประตู (เห็นตอนเปิดประตู): พื้นดินเผา หน้าต่างบานเกล็ด ไฟนีออน โต๊ะเรียน
function interiorRoom(cx, tone) {
  const g = new THREE.Group();
  const mats = toneMats(tone);
  mats.lower.color.multiplyScalar(0.8);
  mats.upper.color.multiplyScalar(0.8);
  const f = floorMesh(8, 7, clayTiles(), { tile: 1.2, roughness: 1 });
  f.material.color.setScalar(0.8);
  f.position.set(cx, 0.001, -3.7);
  g.add(f);
  const back = paintedWall(8, 3.2, mats, 1.0, null);
  back.position.set(cx, 0, -7.2);
  g.add(back);
  for (const sx of [-1, 1]) {
    const side = paintedWall(7, 3.2, mats, 1.0, null);
    side.rotation.y = sx * Math.PI / 2;
    side.position.set(cx - sx * 4, 0, -3.7);
    g.add(side);
  }
  for (const x of [-2.4, 0, 2.4]) {
    const wdw = louverWindow(1.6, 1.2);
    wdw.position.set(cx + x, 1.65, -7.19);
    g.add(wdw);
  }
  const ceil = plane(8, 7, std({ color: 0xcfcdc8, roughness: 0.95 }));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(cx, 3.2, -3.7);
  g.add(ceil);
  const tube = std({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.3 });
  for (const z of [-2, -4.8]) {
    const l = box(1.22, 0.04, 0.12, tube);
    l.position.set(cx, 3.17, z);
    g.add(l);
  }
  const wood = std({ color: 0xa8865e, roughness: 0.55 });
  const metal = std({ color: 0x4d5763, metalness: 0.5, roughness: 0.45 });
  for (const [x, z] of [[-1.6, -2.4], [-0.3, -2.4], [1.0, -2.4], [-1.6, -3.8], [-0.3, -3.8], [1.0, -3.8], [-0.3, -5.2], [1.0, -5.2]]) g.add(studentSet(cx + x, z, wood, metal));
  g.traverse((m) => {
    if (m.isMesh) m.castShadow = false;
  });
  return g;
}

/* ฉากประตู: ประตู/ผนัง/ห้องด้านหลังสร้างใหม่ตามขนาดป้ายและการเปิด-ปิดประตู
 * cfg: { spot, dw, dh (เมตร), open, tone } */
function doorScene(env, style, wallFor, opts) {
  const dyn = new THREE.Group();
  env.group.add(dyn);
  let key = '';
  env.cfg = { spot: null, dw: C.DOOR.w / 100, dh: C.DOOR.h / 100, open: false, tone: 'pink', oCx: 0 };
  env.configure = (cfg) => {
    const open = !!(opts.canOpen && cfg.open && (cfg.spot === 'full' || cfg.spot === 'door'));
    const k = [cfg.dw.toFixed(3), cfg.dh.toFixed(3), open, cfg.tone, cfg.spot === 'full'].join('|');
    env.cfg = Object.assign({}, cfg, { open, oCx: open ? cfg.dw + 0.1 : 0 });
    if (k === key) return;
    key = k;
    disposeTree(dyn);
    dyn.clear();
    const { dw, dh } = env.cfg;
    const oCx = env.cfg.oCx;
    const ow = dw;
    const opening = { x0: oCx - ow / 2, x1: oCx + ow / 2, y1: dh };
    dyn.add(wallFor(opening, cfg.tone));
    // วงกบรอบช่องประตู + ความหนาผนัง
    const frameMat = style === 'panel' ? std({ color: 0x5c3920, roughness: 0.6 }) : std({ color: 0xf1eee8, roughness: 0.45 });
    for (const sx of [-1, 1]) {
      const f = box(0.07, dh + 0.07, 0.03, frameMat);
      f.position.set(oCx + sx * (ow / 2 + 0.035), (dh + 0.07) / 2, 0.015);
      dyn.add(f);
      const rev = box(0.02, dh, 0.2, std({ color: 0xd8d2c6, roughness: 0.9 }));
      rev.position.set(oCx + sx * (ow / 2 - 0.01), dh / 2, -0.1);
      dyn.add(rev);
    }
    const top = box(ow + 0.14, 0.07, 0.03, frameMat);
    top.position.set(oCx, dh + 0.035, 0.015);
    dyn.add(top);
    const head = box(ow, 0.02, 0.2, std({ color: 0xd8d2c6, roughness: 0.9 }));
    head.position.set(oCx, dh - 0.01, -0.1);
    dyn.add(head);
    // บานประตู: ปิด = อยู่ในช่อง / เปิด = พับชิดผนังข้างช่อง (บานพับฝั่งช่องประตู มือจับอีกฝั่ง)
    const door = makeDoor(style, dw, dh, open ? -1 : 1, false);
    door.position.set(0, 0, open ? 0.003 : 0);
    dyn.add(door);
    env.leafFace = door.userData.face + (open ? 0.003 : 0);
    // ป้ายเต็มบาน: มือจับ/กลอนยึดทับป้าย
    door.userData.hw.position.z = cfg.spot === 'full' ? 0.01 : 0;
    if (opts.canOpen) dyn.add(interiorRoom(oCx, cfg.tone));
    else {
      const back = plane(ow + 0.2, dh + 0.1, std({ color: 0x2a2826, roughness: 1 }));
      back.position.set(oCx, dh / 2, -0.2);
      dyn.add(back);
    }
    if (opts.decorate) opts.decorate(dyn, env.cfg);
    shadowy(door, true, true);
  };
  const half = () => env.cfg.dw / 2 + 0.07;
  env.spotX = (spot, w) => (spot === 'beside' ? half() + 0.2 + w / 2 : 0);
  env.spotZ = (spot) => (spot === 'door' || spot === 'full' ? env.leafFace + 0.002 : 0.002);
  env.floorX = (w) => env.cfg.oCx + env.cfg.dw / 2 + 0.52 + w / 2;
  env.focus = () => {
    const c = env.cfg;
    const x0 = -c.dw / 2 - 0.07;
    const x1 = c.open ? c.oCx + c.dw / 2 + 0.07 : c.dw / 2 + 0.07;
    return new THREE.Box3(new THREE.Vector3(x0, 0, 0), new THREE.Vector3(x1, c.dh + 0.1, 0.06));
  };
  env.configure({ spot: null, dw: C.DOOR.w / 100, dh: C.DOOR.h / 100, open: false, tone: 'pink' });
  return env;
}

// ทางเดินหน้าห้องเรียน: ผนังสองสี (เปลี่ยนสีได้) ประตูไม้ หน้าต่างบานเกล็ด พื้นกระเบื้องดินเผา
function buildClassDoor() {
  const g = new THREE.Group();
  const f = floorMesh(20, 3.3, clayTiles(), { tile: 1.2, roughness: 1 });
  f.position.set(0, 0, 1.65);
  g.add(f);
  // ขอบทางเดิน: สเต็ปลง 15 ซม. สู่ลานคอนกรีต (ไม่มีกำแพงบังกล้องที่ถอยออกไปไกล)
  const edge = box(20, 0.15, 0.12, std({ color: 0xb9b2a6, roughness: 0.9 }));
  edge.position.set(0, -0.075, 3.36);
  g.add(noCast(edge));
  g.add(noCast(ceiling(20, 3.45, 3.2, 0, 0xf5f3ee)));
  const yard = floorMesh(60, 40, tiles('concrete', 1, 1024, [168, 164, 157], '#6f6b66', 0, 17), { tile: 2.4, roughness: 1 });
  yard.position.set(0, -0.15, 23.4);
  g.add(yard);
  const env = { group: g, bg: new THREE.Color(0xd8e7ee), floorZ: 0.8, wallZ: 0, kind: 'indoor' };
  return doorScene(
    env,
    'panel',
    (opening, tone) => {
      const mats = toneMats(tone);
      const w = paintedWall(20, 3.2, mats, 1.05, opening);
      // หน้าต่างบานเกล็ดที่ไม่ชนประตู/ช่องประตู
      for (const x of [-3.9, -2.3, 2.3, 3.9]) {
        if (Math.abs(x - (opening.x0 + opening.x1) / 2) < (opening.x1 - opening.x0) / 2 + 0.75) continue;
        if (Math.abs(x) < env.cfg.dw / 2 + 0.75) continue;
        const wdw = louverWindow(1.2, 1.1);
        wdw.position.set(x, 1.65, 0);
        w.add(wdw);
      }
      return w;
    },
    { canOpen: true }
  );
}

// ประตูห้องทำงาน/ห้องประชุม: ผนังเทาอ่อน ประตูไม้โอ๊คบานเรียบ พื้นไม้ ต้นไม้ในกระถาง รูปติดผนัง
function buildOfficeDoor() {
  const g = new THREE.Group();
  const p = plaster('#e6e4df', 141);
  const wallMat = std({ map: p.map, bumpMap: p.bump, bumpScale: 0.4, roughness: 0.92 });
  wallMat.userData.keep = true; // ใช้ซ้ำทุกครั้งที่สร้างผนังใหม่
  const f = floorMesh(14, 8, laminate(), { tile: 1.2, roughness: 0.55 });
  f.position.set(0, 0, 4);
  g.add(f);
  g.add(noCast(ceiling(14, 8, 2.8, 0, 0xf7f6f3)));
  for (const sx of [-1, 1]) {
    const side = plane(8, 2.8, std({ color: 0xe2e0db, roughness: 0.95 }));
    side.rotation.y = (-sx * Math.PI) / 2;
    side.position.set(sx * 7, 1.4, 4);
    g.add(noCast(side));
  }
  const lamp = std({ color: 0xffffff, emissive: 0xfff6e6, emissiveIntensity: 1.4 });
  for (const x of [-2.5, 0, 2.5]) {
    for (const z of [1.2, 3.5]) {
      const d = new THREE.Mesh(new THREE.CircleGeometry(0.07, 24), lamp);
      d.rotation.x = Math.PI / 2;
      d.position.set(x, 2.795, z);
      g.add(d);
    }
  }
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.13, 0.36, 28), std({ color: 0xf2f0ec, roughness: 0.35 }));
  pot.position.set(-1.25, 0.18, 0.35);
  g.add(pot);
  // ลิ้นมังกร: ใบแบนยาวตั้งตรง ปลายแหลม
  const leafM = [0x2f6b3a, 0x3d7d45, 0x4a8a4e, 0x6b9b4f].map((c) => std({ color: c, roughness: 0.55, side: THREE.DoubleSide }));
  const r = rng(151);
  const blade = new THREE.ConeGeometry(0.04, 1, 4, 1);
  blade.translate(0, 0.5, 0);
  for (let i = 0; i < 14; i++) {
    const l = new THREE.Mesh(blade, leafM[i % leafM.length]);
    const a = r() * Math.PI * 2;
    const rr = 0.02 + r() * 0.09;
    const hh = 0.45 + r() * 0.45;
    l.scale.set(0.8 + r() * 0.6, hh, 0.22);
    l.position.set(-1.25 + Math.cos(a) * rr, 0.34, 0.35 + Math.sin(a) * rr);
    l.rotation.set(Math.sin(a) * 0.18 * (0.5 + r()), r() * Math.PI, Math.cos(a) * 0.18 * (0.5 + r()));
    g.add(l);
  }
  const soil = new THREE.Mesh(new THREE.CircleGeometry(0.155, 24), std({ color: 0x3b2b20, roughness: 1 }));
  soil.rotation.x = -Math.PI / 2;
  soil.position.set(-1.25, 0.34, 0.35);
  g.add(soil);
  const art = mk(300, 200);
  const ax = art.getContext('2d');
  const ag = ax.createLinearGradient(0, 0, 300, 200);
  ag.addColorStop(0, '#d9c7a8');
  ag.addColorStop(1, '#8aa1b1');
  ax.fillStyle = ag;
  ax.fillRect(0, 0, 300, 200);
  ax.fillStyle = 'rgba(255,255,255,0.35)';
  ax.beginPath();
  ax.arc(200, 80, 50, 0, Math.PI * 2);
  ax.fill();
  ax.fillStyle = 'rgba(40,60,80,0.45)';
  ax.fillRect(0, 140, 300, 60);
  const frame = box(0.92, 0.62, 0.03, std({ color: 0x2a2a2a, roughness: 0.4 }));
  frame.position.set(-2.6, 1.55, 0.015);
  const pic = plane(0.84, 0.54, std({ map: tex(art), roughness: 0.6 }));
  pic.position.set(-2.6, 1.55, 0.031);
  g.add(frame, pic);
  shadowy(g, true, true);
  f.castShadow = false;
  const env = { group: g, bg: new THREE.Color(0xe8e6e2), floorZ: 0.8, wallZ: 0, kind: 'indoor' };
  return doorScene(
    env,
    'flush',
    (opening) => {
      const w = new THREE.Group();
      const parts = [[-7, opening.x0, 0, 2.8], [opening.x1, 7, 0, 2.8], [opening.x0, opening.x1, opening.y1, 2.8]];
      for (const [a, b, c, d] of parts) if (b - a > 0.001 && d - c > 0.001) w.add(wallRect(a, b, c, d, wallMat));
      const base = std({ color: 0xf4f2ee, roughness: 0.5 });
      for (const [a, b] of [[-7, opening.x0 - 0.07], [opening.x1 + 0.07, 7]]) {
        const bb = box(b - a, 0.08, 0.012, base);
        bb.position.set((a + b) / 2, 0.04, 0.006);
        w.add(bb);
      }
      return w;
    },
    { canOpen: false }
  );
}

function studentSet(x, z, wood, metal) {
  const g = new THREE.Group();
  const top = box(0.6, 0.025, 0.42, wood);
  top.position.set(0, 0.72, 0);
  g.add(top);
  for (const [lx, lz] of [[-0.27, -0.18], [0.27, -0.18], [-0.27, 0.18], [0.27, 0.18]]) {
    const l = box(0.025, 0.71, 0.025, metal);
    l.position.set(lx, 0.355, lz);
    g.add(l);
  }
  const seat = box(0.38, 0.02, 0.36, wood);
  seat.position.set(0, 0.44, 0.42);
  const back = box(0.38, 0.26, 0.02, wood);
  back.position.set(0, 0.68, 0.6);
  g.add(seat, back);
  for (const [lx, lz] of [[-0.17, 0.27], [0.17, 0.27], [-0.17, 0.58], [0.17, 0.58]]) {
    const l = box(0.02, 0.44, 0.02, metal);
    l.position.set(lx, 0.22, lz);
    g.add(l);
  }
  g.position.set(x, 0, z);
  return g;
}

// ในห้องเรียน: ไวท์บอร์ด โต๊ะครู โต๊ะนักเรียน หน้าต่างบานเกล็ด บอร์ดนิเทศ นาฬิกา ไฟเพดาน
function buildClassroom() {
  const g = new THREE.Group();
  const RW = 8;
  const RD = 10;
  const RH = 3.2;
  const mats = toneMats('pink');
  g.add(paintedWall(RW, RH, mats, 1.05, null));
  for (const sx of [-1, 1]) {
    const side = paintedWall(RD, RH, mats, 1.05, null);
    side.rotation.y = -sx * Math.PI / 2;
    side.position.set((sx * RW) / 2, 0, RD / 2);
    g.add(noCast(side));
  }
  const f = floorMesh(RW, RD, clayTiles(), { tile: 1.2, roughness: 1 });
  f.position.set(0, 0, RD / 2);
  g.add(f);
  g.add(noCast(ceiling(RW, RD, RH, 0, 0xf6f5f1)));
  // ไวท์บอร์ด 240 × 120 ซม.
  const bw = C.BOARD.w / 100;
  const bh = C.BOARD.h / 100;
  const by = C.BOARD.y0 / 100 + bh / 2;
  const board = box(bw, bh, 0.02, std({ color: 0xf8f9f9, roughness: 0.14 }));
  board.position.set(0, by, 0.012);
  g.add(board);
  for (const [w, h, x, y] of [[bw + 0.04, 0.025, 0, by + bh / 2], [bw + 0.04, 0.025, 0, by - bh / 2], [0.025, bh, -bw / 2, by], [0.025, bh, bw / 2, by]]) {
    const b = box(w, h, 0.03, MAT.alu);
    b.position.set(x, y, 0.015);
    g.add(b);
  }
  const tray = box(bw * 0.8, 0.025, 0.07, MAT.alu);
  tray.position.set(0, by - bh / 2 - 0.02, 0.04);
  g.add(tray);
  // หน้าต่างผนังซ้าย ประตู + บอร์ดนิเทศ + นาฬิกา ผนังขวา
  for (const z of [2.2, 4.6, 7.0]) {
    const wdw = louverWindow(1.7, 1.25);
    wdw.rotation.y = Math.PI / 2;
    wdw.position.set(-RW / 2, 1.65, z);
    g.add(wdw);
  }
  const door = makeDoor('panel', C.DOOR.w / 100, C.DOOR.h / 100);
  door.rotation.y = -Math.PI / 2;
  door.position.set(RW / 2, 0, 1.3);
  g.add(door);
  const cork = box(1.8, 1.0, 0.02, [MAT.darkAlu, MAT.darkAlu, MAT.darkAlu, MAT.darkAlu, std({ map: corkTex().map, roughness: 0.85 }), MAT.darkAlu]);
  cork.rotation.y = -Math.PI / 2;
  cork.position.set(RW / 2 - 0.012, 1.55, 3.7);
  g.add(cork);
  const clockFace = mk(256, 256);
  const cx = clockFace.getContext('2d');
  cx.fillStyle = '#ffffff';
  cx.beginPath();
  cx.arc(128, 128, 126, 0, Math.PI * 2);
  cx.fill();
  cx.strokeStyle = '#222';
  cx.lineWidth = 10;
  cx.stroke();
  cx.lineCap = 'round';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    cx.lineWidth = i % 3 ? 4 : 8;
    cx.beginPath();
    cx.moveTo(128 + Math.sin(a) * 100, 128 - Math.cos(a) * 100);
    cx.lineTo(128 + Math.sin(a) * 114, 128 - Math.cos(a) * 114);
    cx.stroke();
  }
  cx.lineWidth = 9;
  cx.beginPath();
  cx.moveTo(128, 128);
  cx.lineTo(128 + 52, 128 - 30);
  cx.stroke();
  cx.lineWidth = 6;
  cx.beginPath();
  cx.moveTo(128, 128);
  cx.lineTo(128 - 18, 128 - 88);
  cx.stroke();
  const clock = new THREE.Mesh(new THREE.CircleGeometry(0.16, 40), std({ map: tex(clockFace), roughness: 0.4 }));
  clock.rotation.y = -Math.PI / 2;
  clock.position.set(RW / 2 - 0.02, 2.45, 5.6);
  g.add(clock);
  // โต๊ะครู + โต๊ะนักเรียน 3 แถว
  const wood = std({ color: 0xc9a274, roughness: 0.55 });
  const metal = std({ color: 0x55606e, metalness: 0.5, roughness: 0.45 });
  const desk = box(1.2, 0.72, 0.6, std({ color: 0xd9dcdf, metalness: 0.2, roughness: 0.5 }));
  desk.position.set(-2.4, 0.36, 1.0);
  const deskTop = box(1.24, 0.03, 0.64, wood);
  deskTop.position.set(-2.4, 0.735, 1.0);
  g.add(desk, deskTop);
  for (const z of [3.2, 4.5, 5.8]) for (const x of [-2.6, -1.3, 0, 1.3, 2.6]) g.add(studentSet(x, z, wood, metal));
  // ไฟเพดาน
  const tube = std({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.3 });
  for (const x of [-2, 0, 2]) {
    for (const z of [1.8, 4.6, 7.4]) {
      const l = box(0.14, 0.04, 1.22, tube);
      l.position.set(x, RH - 0.03, z);
      g.add(noCast(l));
    }
  }
  shadowy(g, true, true);
  f.castShadow = false;
  const env = { group: g, bg: new THREE.Color(0xeeece6), floorZ: 0.6, wallZ: 0, kind: 'indoor' };
  env.configure = (cfg) => setTone(mats, cfg.tone);
  env.spotX = (spot, w) => (spot === 'beside' ? bw / 2 + 0.35 + w / 2 : 0);
  env.spotZ = () => 0.002;
  env.floorX = (w) => bw / 2 + 0.5 + w / 2;
  env.focus = () => new THREE.Box3(new THREE.Vector3(-bw / 2 - 0.05, C.BOARD.y0 / 100 - 0.05, 0), new THREE.Vector3(bw / 2 + 0.05, (C.BOARD.y0 + C.BOARD.h) / 100 + 0.05, 0.05));
  return env;
}

const BUILD = { studio: buildStudio, wall: buildWall, brick: buildBrick, shop: buildShop, fence: buildFence, classDoor: buildClassDoor, officeDoor: buildOfficeDoor, classroom: buildClassroom };

/* ---------------- ตัวป้าย ---------------- */
// หน้าป้าย: วัสดุแต่ละชนิดผิวไม่เหมือนกัน
function faceMat(type, map) {
  if (type === 'lightbox') return std({ map, emissiveMap: map, emissive: 0xffffff, emissiveIntensity: 0.18, roughness: 0.42 });
  const rough = { vinyl: 0.72, frame: 0.7, foam: 0.5, sticker: 0.36, acrylic: 0.6, rollup: 0.5, xstand: 0.55 }[type] || 0.7;
  return std({ map, roughness: rough, metalness: 0 });
}

// ไวนิลตึงจากตาไก่ — ผิวป่องกลางนิด ๆ เป็นคลื่นจาง ๆ เหมือนผ้าใบจริง
function bulge(w, h, u, v) {
  const A = Math.min(0.007, 0.0035 + 0.0012 * Math.min(w, h));
  const env = Math.sin(Math.PI * u) * Math.sin(Math.PI * v);
  return A * env * (0.75 + 0.25 * Math.sin(u * Math.PI * Math.max(2, w * 2.4) + v * 4.1));
}

function buildVinyl(w, h, map) {
  const g = new THREE.Group();
  const sx = Math.min(140, Math.max(10, Math.round(w * 30)));
  const sy = Math.min(90, Math.max(8, Math.round(h * 30)));
  const geo = new THREE.PlaneGeometry(w, h, sx, sy);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const u = (pos.getX(i) + w / 2) / w;
    const v = (pos.getY(i) + h / 2) / h;
    pos.setZ(i, bulge(w, h, u, v));
  }
  geo.computeVertexNormals();
  const face = faceMat('vinyl', map);
  const front = new THREE.Mesh(geo, face);
  const back = new THREE.Mesh(geo, std({ color: 0xe9e8e4, roughness: 0.92, side: THREE.BackSide }));
  front.position.z = back.position.z = 0.004;
  g.add(front, back);
  const pts = C.eyelets(w * 100, h * 100).map((p) => {
    const x = p.x / 100 - w / 2;
    const y = h / 2 - p.y / 100;
    return { x, y, z: 0.004 + bulge(w, h, p.x / 100 / w, 1 - p.y / 100 / h), side: p.side };
  });
  const ring = new THREE.TorusGeometry(0.0105, 0.0034, 10, 24);
  const hole = new THREE.CircleGeometry(0.0072, 18);
  for (const p of pts) {
    const t = new THREE.Mesh(ring, MAT.chrome);
    t.position.set(p.x, p.y, p.z + 0.0012);
    g.add(t);
    const d = new THREE.Mesh(hole, MAT.eyeHole);
    d.position.set(p.x, p.y, p.z + 0.0006);
    g.add(d);
  }
  return { group: g, face, front: 0.006, eyelets: pts };
}

function buildBoard(type, w, h, map, edge) {
  const g = new THREE.Group();
  const face = faceMat(type, map);
  let front = 0;
  if (type === 'frame' || type === 'foam') {
    const d = type === 'frame' ? 0.03 : 0.005;
    const sideMat =
      type === 'frame' ? std({ color: new THREE.Color().setRGB(edge[0] / 255, edge[1] / 255, edge[2] / 255, THREE.SRGBColorSpace), roughness: 0.7 }) : MAT.foamEdge;
    const b = box(w, h, d, [sideMat, sideMat, sideMat, sideMat, face, MAT.back]);
    const z0 = type === 'frame' ? 0 : 0.002; // โฟมบอร์ดติดเทปกาวสองหน้า
    b.position.z = z0 + d / 2;
    g.add(b);
    front = z0 + d;
  } else if (type === 'sticker') {
    // สติ๊กเกอร์แนบผิว (ผนัง/บานประตู) เคลือบเงานิด ๆ
    face.polygonOffset = true;
    face.polygonOffsetFactor = -2;
    face.polygonOffsetUnits = -2;
    const st = plane(w, h, face);
    st.position.z = 0.0008;
    g.add(st);
    front = 0.001;
  } else if (type === 'acrylic') {
    // พิมพ์หลังแผ่นใสหนา 8 มม. ลอยจากผนัง 2.5 ซม. ด้วยหมุดสแตนเลส 4 มุม
    const gap = 0.025;
    const t = 0.008;
    const print = plane(w, h, face);
    print.position.z = gap + 0.0004;
    g.add(print);
    const slabMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0,
      roughness: 0.03,
      transmission: 1,
      thickness: t,
      ior: 1.49,
      attenuationColor: new THREE.Color(0xcfeee6),
      attenuationDistance: 0.25,
      specularIntensity: 1,
      clearcoat: 1,
      clearcoatRoughness: 0.03,
      envMapIntensity: LIGHT.env,
    });
    const slab = box(w, h, t, slabMat);
    slab.position.z = gap + t / 2 + 0.0008;
    slab.castShadow = false;
    g.add(slab);
    const inset = Math.max(0.025, Math.min(w, h) * 0.07);
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        const x = sx * (w / 2 - inset);
        const y = sy * (h / 2 - inset);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.0125, 0.0125, gap, 20), MAT.chrome);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(x, y, gap / 2);
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.0125, 0.0128, 0.012, 24), MAT.chrome);
        cap.rotation.x = Math.PI / 2;
        cap.position.set(x, y, gap + t + 0.007);
        g.add(barrel, cap);
      }
    }
    front = gap + t + 0.001;
  } else if (type === 'lightbox') {
    // กล่องอะลูมิเนียมหนา 12 ซม. ขอบกว้าง 4 ซม. หน้าป้ายเรืองแสง
    const d = 0.12;
    const rim = 0.04;
    const backBox = box(w - 0.004, h - 0.004, d - 0.01, std({ color: 0x3d4148, metalness: 0.5, roughness: 0.5 }));
    backBox.position.z = (d - 0.01) / 2;
    g.add(backBox);
    const rims = [
      [w, rim, 0, h / 2 - rim / 2],
      [w, rim, 0, -h / 2 + rim / 2],
      [rim, h - rim * 2, -w / 2 + rim / 2, 0],
      [rim, h - rim * 2, w / 2 - rim / 2, 0],
    ];
    for (const [rw, rh, x, y] of rims) {
      const b = new THREE.Mesh(new RoundedBoxGeometry(rw, rh, d, 2, 0.006), MAT.alu);
      b.position.set(x, y, d / 2);
      g.add(b);
    }
    const panel = plane(w - rim * 2, h - rim * 2, face);
    panel.position.z = d - 0.006;
    g.add(panel);
    front = d;
  }
  return { group: g, face, front };
}

function buildRollup(w, h, map) {
  const g = new THREE.Group();
  const face = faceMat('rollup', map);
  const y0 = 0.075;
  const banner = plane(w, h, face);
  banner.position.set(0, y0 + h / 2, 0);
  const back = plane(w, h, std({ color: 0xbfc2c6, roughness: 0.6, side: THREE.BackSide }));
  back.position.copy(banner.position);
  g.add(banner, back);
  const cas = new THREE.Mesh(new RoundedBoxGeometry(w + 0.06, 0.1, 0.12, 4, 0.025), MAT.alu);
  cas.position.set(0, 0.062, 0);
  g.add(cas);
  for (const s of [-1, 1]) {
    const cap = new THREE.Mesh(new RoundedBoxGeometry(0.026, 0.104, 0.124, 3, 0.012), MAT.plastic);
    cap.position.set(s * (w / 2 + 0.03), 0.062, 0);
    const foot = new THREE.Mesh(new RoundedBoxGeometry(0.05, 0.014, 0.4, 2, 0.005), MAT.darkAlu);
    foot.position.set(s * (w / 2 - 0.09), 0.007, 0);
    g.add(cap, foot);
  }
  const top = y0 + h;
  g.add(rod(new THREE.Vector3(0, 0.11, -0.04), new THREE.Vector3(0, top - 0.01, -0.04), 0.009, MAT.alu));
  const rail = new THREE.Mesh(new RoundedBoxGeometry(w + 0.012, 0.024, 0.016, 2, 0.006), MAT.alu);
  rail.position.set(0, top + 0.006, 0.002);
  g.add(rail);
  return { group: g, face, front: 0.002, faceY: [y0, top] };
}

function buildXstand(w, h, map) {
  const g = new THREE.Group();
  const face = faceMat('xstand', map);
  const lift = 0.18;
  const banner = plane(w, h, face);
  banner.position.set(0, lift + h / 2, 0);
  const back = plane(w, h, std({ color: 0xd7d8da, roughness: 0.7, side: THREE.BackSide }));
  back.position.copy(banner.position);
  g.add(banner, back);
  const z = -0.018;
  const hub = new THREE.Vector3(0, lift + h * 0.45, z - 0.01);
  const spread = (w * lift) / h;
  const r = 0.0065;
  const legsTo = [new THREE.Vector3(-(w / 2 + spread), 0.01, z - 0.04), new THREE.Vector3(w / 2 + spread, 0.01, z - 0.04)];
  g.add(rod(hub, new THREE.Vector3(-w / 2, lift + h, z), r, MAT.darkAlu));
  g.add(rod(hub, new THREE.Vector3(w / 2, lift + h, z), r, MAT.darkAlu));
  for (const p of legsTo) g.add(rod(hub, p, r, MAT.darkAlu));
  g.add(rod(hub, new THREE.Vector3(0, 0.01, -0.42), r, MAT.darkAlu));
  const hubM = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.03, 16), MAT.plastic);
  hubM.rotation.x = Math.PI / 2;
  hubM.position.copy(hub);
  g.add(hubM);
  for (const p of [...legsTo, new THREE.Vector3(0, 0.01, -0.42)]) {
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.014, 12, 8), MAT.plastic);
    f.position.copy(p);
    g.add(f);
  }
  for (const [x, y] of [[-w / 2, lift + h], [w / 2, lift + h], [-w / 2, lift], [w / 2, lift]]) {
    const hook = box(0.03, 0.014, 0.012, MAT.plastic);
    hook.position.set(x, y, 0.004);
    g.add(hook);
  }
  return { group: g, face, front: 0.001, faceY: [lift, lift + h] };
}

// หุ่นคนสเกลแบบโมเดลสถาปัตย์ สูง 170 ซม. — ไว้เทียบขนาดป้าย
function buildPerson() {
  const g = new THREE.Group();
  const m = mats().person;
  const limb = (a, b, r0, r1) => {
    const d = new THREE.Vector3().subVectors(b, a);
    const len = d.length();
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, len, 18, 1), m);
    mesh.position.copy(a).addScaledVector(d, 0.5);
    mesh.quaternion.setFromUnitVectors(UP, d.normalize());
    return mesh;
  };
  const ball = (x, y, z, r, sx = 1, sy = 1, sz = 1) => {
    const b = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), m);
    b.position.set(x, y, z);
    b.scale.set(sx, sy, sz);
    return b;
  };
  const V = (x, y, z = 0) => new THREE.Vector3(x, y, z);
  for (const s of [-1, 1]) {
    // ขา: ต้นขา เข่า หน้าแข้ง ข้อเท้า เท้า
    g.add(limb(V(s * 0.09, 0.9), V(s * 0.085, 0.49, 0.01), 0.078, 0.06));
    g.add(ball(s * 0.085, 0.49, 0.01, 0.058));
    g.add(limb(V(s * 0.085, 0.49, 0.01), V(s * 0.08, 0.08), 0.054, 0.04));
    g.add(ball(s * 0.08, 0.075, 0, 0.042));
    const foot = new THREE.Mesh(new RoundedBoxGeometry(0.09, 0.06, 0.25, 3, 0.025), m);
    foot.position.set(s * 0.085, 0.03, 0.05);
    g.add(foot);
    // แขน: ไหล่ ต้นแขน ศอก แขนล่าง มือ
    g.add(ball(s * 0.2, 1.405, 0, 0.058));
    g.add(limb(V(s * 0.205, 1.4), V(s * 0.225, 1.12, 0.01), 0.048, 0.04));
    g.add(ball(s * 0.225, 1.12, 0.01, 0.04));
    g.add(limb(V(s * 0.225, 1.12, 0.01), V(s * 0.235, 0.86, 0.03), 0.038, 0.03));
    g.add(ball(s * 0.237, 0.83, 0.035, 0.042, 0.8, 1.25, 0.6));
  }
  // ลำตัว: เอวคอด อกกว้าง (หมุนโปรไฟล์ แล้วบีบให้แบน)
  const prof = [
    [0.0, 0.84], [0.13, 0.85], [0.15, 0.9], [0.14, 0.98], [0.12, 1.06], [0.135, 1.16], [0.16, 1.28], [0.17, 1.36], [0.15, 1.42], [0.08, 1.46], [0.0, 1.47],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const torso = new THREE.Mesh(new THREE.LatheGeometry(prof, 32), m);
  torso.scale.set(1.12, 1, 0.66);
  g.add(torso);
  g.add(limb(V(0, 1.44), V(0, 1.53), 0.05, 0.046));
  g.add(ball(0, 1.6, 0.008, 0.1, 0.92, 1.14, 1.0));
  return shadowy(g, true, true);
}

/* ---------------- เวที ---------------- */
// ความสว่าง: ตั้งให้สีหน้าป้ายบนจอใกล้สีงานพิมพ์จริง (ลูกค้าดูสีจากภาพนี้)
// วัดแล้ว: มุมหน้าตรง สีบนจอ (43,58,104) เทียบงานจริง (44,59,105)
const LIGHT = { exposure: 0.6, key: 1.6, hemi: 0.42, fill: 0.35, env: 0.72, outKey: 2.0, outHemi: 0.6 };
export function createStage(opts) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = LIGHT.exposure;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  ANISO = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const maxTex = renderer.capabilities.maxTextureSize;
  mats();

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const roomEnv = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
  scene.environment = roomEnv;

  const camera = new THREE.PerspectiveCamera(32, 1.6, 0.03, 300);
  const controls = new OrbitControls(camera, opts.eventsEl);
  controls.enableDamping = true;
  controls.dampingFactor = 0.09;
  controls.maxPolarAngle = Math.PI * 0.82;
  controls.minDistance = 0.25;
  controls.maxDistance = 45;
  controls.screenSpacePanning = true;
  controls.zoomSpeed = 0.8;
  controls.rotateSpeed = 0.7;

  const hemi = new THREE.HemisphereLight(0xfbf7ef, 0x8d8576, 0.55);
  const key = new THREE.DirectionalLight(0xfff3e3, 2.2);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0005;
  key.shadow.normalBias = 0.03;
  const fill = new THREE.DirectionalLight(0xe2ebff, 0.45);
  const spot = new THREE.SpotLight(0xffe7c2, 0, 0, Math.PI / 6, 0.55, 1.4);
  spot.castShadow = true;
  spot.shadow.mapSize.set(1024, 1024);
  spot.shadow.bias = -0.0015;
  spot.shadow.normalBias = 0.04;
  const glowLight = new THREE.PointLight(0xffffff, 0, 0, 2);
  scene.add(hemi, key, key.target, fill, fill.target, spot, spot.target, glowLight);

  const envs = {};
  let envKey = null;
  const signRoot = new THREE.Group();
  scene.add(signRoot);
  const person = buildPerson();
  scene.add(person);
  const ties = new THREE.Group();
  scene.add(ties);
  let glow = null;

  let model = null;
  let curSpot = null;
  let signKey = '';
  let faceTex = null;
  let faceKey = '';
  let cur = { scene: 'studio', type: 'vinyl', w: 2, h: 1, person: true, night: false };
  let view = 'angle';
  let needs = true;
  let show = null;
  let lastSize = [0, 0];

  function getEnv(k) {
    if (!envs[k]) {
      envs[k] = BUILD[k]();
      envs[k].group.visible = false;
      scene.add(envs[k].group);
    }
    return envs[k];
  }

  function disposeGroup(o) {
    o.traverse((m) => {
      if (m.isMesh) {
        m.geometry.dispose();
        const ms = Array.isArray(m.material) ? m.material : [m.material];
        ms.forEach((mm) => {
          if (!Object.values(MAT).includes(mm)) mm.dispose();
        });
      }
    });
  }

  function makeTexture(canvas) {
    let src = canvas;
    if (Math.max(canvas.width, canvas.height) > maxTex) {
      const f = maxTex / Math.max(canvas.width, canvas.height);
      src = mk(Math.floor(canvas.width * f), Math.floor(canvas.height * f));
      src.getContext('2d').drawImage(canvas, 0, 0, src.width, src.height);
    }
    const t = new THREE.CanvasTexture(src);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = ANISO;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    return t;
  }

  function rebuildSign(s) {
    if (model) {
      signRoot.remove(model.group);
      disposeGroup(model.group);
    }
    const w = s.w / 100;
    const h = s.h / 100;
    const map = faceTex;
    if (s.type === 'vinyl') model = buildVinyl(w, h, map);
    else if (s.type === 'rollup') model = buildRollup(w, h, map);
    else if (s.type === 'xstand') model = buildXstand(w, h, map);
    else model = buildBoard(s.type, w, h, map, s.edge || [120, 120, 120]);
    model.type = s.type;
    model.w = w;
    model.h = h;
    model.floor = C.TYPES[s.type].mount === 'floor';
    shadowy(model.group, true, true);
    if (s.type === 'vinyl') model.group.children.slice(0, 2).forEach((m) => (m.receiveShadow = false));
    if (s.type === 'sticker') model.group.traverse((m) => (m.castShadow = m.receiveShadow = false));
    signRoot.add(model.group);
  }

  // ตำแหน่งป้าย/คน/ไฟ ตามฉาก
  function layout(sceneKey) {
    const env = getEnv(sceneKey);
    for (const k in envs) envs[k].group.visible = k === sceneKey;
    envKey = sceneKey;
    const g = C.geometry(cur.type, cur.w, cur.h);
    const w = model.w;
    const h = model.h;
    const spot = C.resolveSpot(sceneKey, cur.spot, g);
    curSpot = spot;
    if (env.configure) {
      const ds = C.doorSize(sceneKey, cur.spot, g);
      env.configure({ spot, dw: ds.w / 100, dh: ds.h / 100, open: !!cur.doorOpen, tone: cur.tone || 'pink' });
    }
    let baseY;
    let z;
    if (model.floor) {
      baseY = 0;
      z = env.floorZ;
      signRoot.position.set(env.floorX ? env.floorX(w) : 0, 0, z);
    } else {
      baseY = C.mountBottom(sceneKey, g, spot) / 100;
      // ป้ายกว้างเกินช่วงเสา (3.6 ม.) ต้องยึดหน้าเสา
      z = env.spotZ ? env.spotZ(spot) : sceneKey === 'shop' && w > 3.6 ? 0.15 : env.wallZ;
      signRoot.position.set(env.spotX ? env.spotX(spot, w) : 0, baseY + h / 2, z);
    }
    const top = model.floor ? (model.faceY ? model.faceY[1] : h) : baseY + h;
    if (env.fit) env.fit(top);
    // คนยืนเทียบ ข้างขวาของป้าย หันเข้าหาป้ายนิดหนึ่ง
    person.visible = !!cur.person;
    // ประตูเปิดอยู่ขวามือ → ให้คนยืนซ้ายแทน จะได้ไม่บังช่องประตู
    const left = !!(env.cfg && env.cfg.open && !model.floor);
    const px = left ? signRoot.position.x - w / 2 - 0.55 : signRoot.position.x + w / 2 + 0.55 + (model.type === 'xstand' ? 0.15 : 0);
    const pz = model.floor ? z + 0.05 : sceneKey === 'shop' ? 0.75 : sceneKey === 'fence' ? 0.5 : 0.45;
    person.position.set(px, 0, pz);
    person.rotation.y = left ? 0.38 : -0.38;
    // เคเบิลไทร์ตาไก่บนรั้ว / หมุดยึดบนผนัง
    ties.clear();
    if (model.eyelets) {
      const geo = sceneKey === 'fence' ? once('tieGeo', () => new THREE.TorusGeometry(0.012, 0.0022, 6, 14, Math.PI * 1.3)) : once('screwGeo', () => new THREE.CylinderGeometry(0.0055, 0.0055, 0.006, 14));
      const mat = sceneKey === 'fence' ? MAT.tie : MAT.chrome;
      for (const p of model.eyelets) {
        const m = new THREE.Mesh(geo, mat);
        if (sceneKey === 'fence') {
          const ang = { top: Math.PI / 2, bottom: -Math.PI / 2, left: Math.PI, right: 0 }[p.side];
          m.rotation.set(0, 0, ang - Math.PI * 0.65);
          m.position.set(p.x, p.y, p.z);
        } else {
          m.rotation.x = Math.PI / 2;
          m.position.set(p.x, p.y, p.z + 0.004);
        }
        m.castShadow = true;
        ties.add(m);
      }
      ties.position.copy(signRoot.position);
      ties.visible = true;
    } else ties.visible = false;
    applyLights();
    needs = true;
  }

  function bounds(withPerson) {
    const b = new THREE.Box3().setFromObject(signRoot);
    if (withPerson && person.visible) b.union(new THREE.Box3().setFromObject(person));
    // ฉากประตู/ห้องเรียน: ให้เห็นประตูหรือกระดานทั้งบานด้วย
    const env = envs[envKey];
    if (withPerson && env && env.focus) b.union(env.focus(curSpot));
    return b;
  }

  function applyLights() {
    const env = envs[envKey];
    const night = !!cur.night;
    const b = bounds(true);
    const c = b.getCenter(new THREE.Vector3());
    const size = b.getSize(new THREE.Vector3());
    const R = Math.max(size.x, size.y, 1.5) * 0.75 + 1;
    // ไฟหลักจากซ้ายบนด้านหน้า
    key.position.set(c.x - R * 0.9, c.y + R * 1.6, c.z + R * 1.4);
    key.target.position.copy(c);
    const sc = key.shadow.camera;
    sc.left = -R;
    sc.right = R;
    sc.top = R;
    sc.bottom = -R;
    sc.near = 0.1;
    sc.far = R * 6;
    sc.updateProjectionMatrix();
    fill.position.set(c.x + R * 1.5, c.y + R * 0.4, c.z + R * 1.2);
    fill.target.position.copy(c);
    const outdoor = env.kind === 'outdoor';
    if (night) {
      scene.environment = null;
      hemi.color.set(0x8fa3d6);
      hemi.groundColor.set(0x1b1f2a);
      hemi.intensity = 0.08;
      key.intensity = 0;
      fill.intensity = 0.05;
      scene.background = env.sky ? skyTex(true) : new THREE.Color(0x0d1018);
      scene.fog = env.fog ? new THREE.Fog(0x0b0e15, env.fog[1], env.fog[2]) : null;
      renderer.toneMappingExposure = LIGHT.exposure * 1.15;
    } else {
      scene.environment = roomEnv;
      hemi.color.set(outdoor ? 0xdbe8ff : 0xfbf7ef);
      hemi.groundColor.set(outdoor ? 0x6c7a4a : 0x8d8576);
      hemi.intensity = outdoor ? LIGHT.outHemi : LIGHT.hemi;
      key.intensity = outdoor ? LIGHT.outKey : LIGHT.key;
      fill.intensity = LIGHT.fill;
      scene.background = env.sky ? skyTex(false) : env.bg;
      scene.fog = env.fog ? new THREE.Fog(env.fog[0], env.fog[1], env.fog[2]) : null;
      renderer.toneMappingExposure = LIGHT.exposure * (outdoor ? 0.95 : 1);
    }
    // กลางคืน: กล่องไฟสว่างเอง ป้ายอื่นมีสปอตไลท์ส่อง
    const lb = model.type === 'lightbox';
    if (model.face) model.face.emissiveIntensity = lb ? (night ? 0.82 : 0.16) : 0;
    const fc = new THREE.Vector3();
    signRoot.getWorldPosition(fc);
    const faceC = model.floor ? new THREE.Vector3(fc.x, (model.faceY[0] + model.faceY[1]) / 2, fc.z) : fc.clone();
    if (night && !lb) {
      spot.intensity = 26 * Math.max(1, model.w * model.h);
      spot.position.set(faceC.x, faceC.y + Math.max(1.1, model.h * 0.9), faceC.z + Math.max(1.0, model.w * 0.55));
      spot.target.position.copy(faceC);
      spot.angle = Math.min(1.2, Math.atan2(Math.max(model.w, model.h) * 0.75, spot.position.distanceTo(faceC)) + 0.15);
    } else spot.intensity = 0;
    if (night && lb) {
      // ไฟจากหน้ากล่องส่องผนัง/พื้นรอบ ๆ (วางห่างหน้าป้าย ไม่ให้หน้าป้ายสว่างจนขาว)
      glowLight.intensity = 0.9 * Math.max(0.6, model.w * model.h);
      glowLight.position.set(faceC.x, faceC.y - model.h * 0.2, faceC.z + 1.3);
    } else glowLight.intensity = 0;
    if (glow) {
      scene.remove(glow);
      glow.material.map.dispose();
      glow.material.dispose();
      glow.geometry.dispose();
      glow = null;
    }
    if (night && lb) glow = makeGlow(model.w, model.h, faceC);
    needs = true;
  }

  // แสงฟุ้งรอบกล่องไฟตอนกลางคืน
  function makeGlow(w, h, c) {
    const cv = mk(256, 256);
    const x = cv.getContext('2d');
    const g = x.createRadialGradient(128, 128, 70, 128, 128, 128);
    g.addColorStop(0, 'rgba(255,248,232,0.16)');
    g.addColorStop(1, 'rgba(255,250,235,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 256, 256);
    const t = new THREE.CanvasTexture(cv);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.7 + 0.6, h * 1.9 + 0.6), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.position.set(c.x, c.y, c.z + 0.125);
    scene.add(m);
    return m;
  }

  /* ---------- กล้อง ---------- */
  const VIEWS = {
    front: { az: 0, el: 0.03 },
    angle: { az: -0.42, el: 0.1 },
    eye: { az: -0.18, eye: 1.6 },
    side: { az: -1.0, el: 0.08 },
    close: { az: -0.22, el: 0.04, tight: true }, // ใกล้ป้าย: เห็นงานชัด ไม่เอาคน/ประตูมาคิดระยะ
  };
  function aimFor(name, aspect) {
    const v = VIEWS[name] || VIEWS.angle;
    const b = bounds(!v.tight);
    const c = b.getCenter(new THREE.Vector3());
    const size = b.getSize(new THREE.Vector3());
    const vf = THREE.MathUtils.degToRad(camera.fov);
    const hf = 2 * Math.atan(Math.tan(vf / 2) * aspect);
    const span = Math.abs(Math.cos(v.az)) * size.x + Math.abs(Math.sin(v.az)) * size.z;
    const dist = Math.max(size.y / 2 / Math.tan(vf / 2), span / 2 / Math.tan(hf / 2)) * (v.tight ? 1.55 : 1.22) + size.z / 2;
    const target = c.clone();
    const pos = new THREE.Vector3();
    if (v.eye != null) {
      // มุมคนเดินผ่าน: กล้องสูงระดับสายตา 1.6 ม.
      const d = Math.max(dist, 2.2);
      pos.set(c.x + Math.sin(v.az) * d, v.eye, c.z + Math.cos(v.az) * d);
    } else {
      pos.set(c.x + Math.sin(v.az) * Math.cos(v.el) * dist, c.y + Math.sin(v.el) * dist, c.z + Math.cos(v.az) * Math.cos(v.el) * dist);
    }
    pos.y = Math.max(0.2, pos.y);
    return { pos, target };
  }
  function frame(name) {
    view = name || view;
    const a = aimFor(view, camera.aspect);
    camera.position.copy(a.pos);
    controls.target.copy(a.target);
    const wallish = !(envKey === 'studio' && model && model.floor);
    controls.minAzimuthAngle = wallish ? -1.35 : -Infinity;
    controls.maxAzimuthAngle = wallish ? 1.35 : Infinity;
    controls.update();
    needs = true;
  }

  // หมุนโชว์: ส่ายกล้องไปมาช้า ๆ (ตั้งพื้นในสตูดิโอหมุนรอบ)
  function startShow() {
    const off = new THREE.Vector3().subVectors(camera.position, controls.target);
    const sph = new THREE.Spherical().setFromVector3(off);
    show = { t0: performance.now(), sph, target: controls.target.clone(), full: envKey === 'studio' && model.floor };
    controls.enabled = false;
  }
  function stopShow() {
    if (!show) return;
    show = null;
    controls.enabled = true;
    controls.update();
  }
  function stepShow(now) {
    const t = (now - show.t0) / 1000;
    const s = show.sph.clone();
    s.theta = show.full ? show.sph.theta + t * 0.45 : Math.sin(t * 0.55) * 0.62;
    camera.position.setFromSpherical(s).add(show.target);
    camera.lookAt(show.target);
  }

  /* ---------- วาด ---------- */
  let raf = 0;
  function tick(now) {
    raf = requestAnimationFrame(tick);
    let moved = false;
    if (show) {
      stepShow(now);
      moved = true;
    } else if (controls.update()) moved = true;
    if (camera.position.y < 0.12) camera.position.y = 0.12; // ไม่ให้กล้องมุดพื้น
    if (moved || needs) {
      needs = false;
      renderer.render(scene, camera);
      if (opts.onFrame) opts.onFrame();
    }
  }
  controls.addEventListener('change', () => {
    needs = true;
  });
  raf = requestAnimationFrame(tick);

  function setSize(w, h) {
    w = Math.max(2, Math.round(w));
    h = Math.max(2, Math.round(h));
    if (w === lastSize[0] && h === lastSize[1]) return;
    const oldAspect = camera.aspect;
    lastSize = [w, h];
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (Math.abs(oldAspect - camera.aspect) > 0.05 && model) frame(view);
    needs = true;
  }

  // st: { type, w, h (ซม.), scene, person, night, face (canvas), faceKey, edge }
  function update(st) {
    let reframe = false;
    if (st.faceKey !== faceKey) {
      const old = faceTex;
      faceTex = makeTexture(st.face);
      faceKey = st.faceKey;
      if (model && model.face) {
        model.face.map = faceTex;
        if (model.face.emissiveMap) model.face.emissiveMap = faceTex;
        model.face.needsUpdate = true;
      }
      if (old) old.dispose();
    }
    const sk = [st.type, st.w, st.h, (st.edge || []).map(Math.round).join(',')].join('|');
    const geomChanged = sk !== signKey;
    const sceneChanged = st.scene !== cur.scene || !envKey;
    const personChanged = !!st.person !== !!cur.person || st.spot !== cur.spot || !!st.doorOpen !== !!cur.doorOpen;
    cur = Object.assign({}, cur, st);
    if (geomChanged) {
      rebuildSign(st);
      signKey = sk;
      reframe = true;
    }
    if (sceneChanged || personChanged) reframe = true;
    layout(st.scene);
    if (reframe) frame(view);
    needs = true;
  }

  function setView(name) {
    stopShow();
    frame(name);
  }

  // จุดมุมหน้าป้ายบนจอ (−1..1) สำหรับวาดเส้นบอกขนาด และหัวคนสำหรับป้าย "คนสูง 170 ซม."
  function projected() {
    if (!model) return null;
    camera.updateMatrixWorld();
    const w = model.w;
    const h = model.h;
    let pts;
    if (model.floor) {
      const [y0, y1] = model.faceY;
      pts = [[-w / 2, y1], [w / 2, y1], [w / 2, y0], [-w / 2, y0]].map(([x, y]) => new THREE.Vector3(x, y, model.front));
    } else pts = [[-w / 2, h / 2], [w / 2, h / 2], [w / 2, -h / 2], [-w / 2, -h / 2]].map(([x, y]) => new THREE.Vector3(x, y, model.front));
    const face = pts.map((p) => {
      const v = signRoot.localToWorld(p.clone()).project(camera);
      return { x: v.x, y: v.y, z: v.z };
    });
    let head = null;
    if (person.visible) {
      const v = person.localToWorld(new THREE.Vector3(0, 1.78, 0)).project(camera);
      if (v.z < 1) head = { x: v.x, y: v.y };
    }
    return { face, head, visible: face.every((p) => p.z < 1) };
  }

  // วาดภาพขนาดใดก็ได้ (ส่งออก) แล้วคืนขนาดพรีวิวเดิม
  function renderAt(w, h, draw) {
    const keep = lastSize.slice();
    const pr = projected;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    draw(renderer.domElement, pr());
    renderer.setSize(keep[0], keep[1], false);
    camera.aspect = keep[0] / keep[1];
    camera.updateProjectionMatrix();
    needs = true;
  }

  // ภาพย่อของแต่ละฉาก (ใช้ป้ายปัจจุบัน มุมเฉียง)
  function thumb(key, out) {
    if (!model || !BUILD[key]) return;
    const keepEnv = envKey;
    const keepPos = camera.position.clone();
    const keepTarget = controls.target.clone();
    const keepAspect = camera.aspect;
    const keepSize = lastSize.slice();
    cur.scene = key;
    layout(key);
    renderer.setSize(out.width, out.height, false);
    camera.aspect = out.width / out.height;
    camera.updateProjectionMatrix();
    const a = aimFor('angle', camera.aspect);
    camera.position.copy(a.pos);
    camera.lookAt(a.target);
    renderer.render(scene, camera);
    const x = out.getContext('2d');
    x.drawImage(renderer.domElement, 0, 0, out.width, out.height);
    cur.scene = keepEnv;
    layout(keepEnv);
    renderer.setSize(keepSize[0], keepSize[1], false);
    camera.aspect = keepAspect;
    camera.updateProjectionMatrix();
    camera.position.copy(keepPos);
    controls.target.copy(keepTarget);
    camera.lookAt(keepTarget);
    needs = true;
  }

  // ไฟล์ 3 มิติ (.glb) เฉพาะตัวป้าย (ขอบล่างวางที่พื้น y = 0) — เปิดดูได้ใน Windows 3D Viewer / เว็บดูไฟล์ glb / ส่งต่อให้ทีมออกแบบ
  async function exportGLB() {
    if (!model) throw new Error('ยังไม่มีป้าย');
    const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
    const root = new THREE.Group();
    root.name = 'NadponSign';
    const lift = model.floor ? 0 : model.h / 2;
    const s = model.group.clone(true);
    s.position.y += lift;
    root.add(s);
    if (ties.visible && ties.children.length) {
      const t = ties.clone(true);
      t.position.set(0, lift, 0);
      root.add(t);
    }
    // แสง/สไปรต์เรืองแสงไม่ใช่ตัวป้าย ไม่ต้องใส่ในไฟล์
    const drop = [];
    root.traverse((o) => {
      if (o.isLight || o.isSprite) drop.push(o);
    });
    drop.forEach((o) => o.parent && o.parent.remove(o));
    root.updateMatrixWorld(true);
    return new GLTFExporter().parseAsync(root, { binary: true, onlyVisible: true, maxTextureSize: 2048 });
  }

  function setEnvIntensity() {
    scene.traverse((m) => {
      if (m.isMesh) (Array.isArray(m.material) ? m.material : [m.material]).forEach((mm) => (mm.envMapIntensity = LIGHT.env));
    });
  }

  return {
    // ใช้ตอนปรับแสงเท่านั้น
    tune(o) {
      Object.assign(LIGHT, o);
      setEnvIntensity();
      applyLights();
    },
    canvas: renderer.domElement,
    setSize,
    update,
    setView,
    get view() {
      return view;
    },
    startShow,
    stopShow,
    get showing() {
      return !!show;
    },
    setEnabled(on) {
      controls.enabled = on && !show;
      if (!on) stopShow();
    },
    projected,
    renderAt,
    thumb,
    exportGLB,
    // กลับไปมุมกล้องเริ่มต้นของมุมที่เลือกอยู่
    resetView() {
      stopShow();
      frame(view);
    },
    requestRender() {
      needs = true;
    },
  };
}

NS.createStage3d = createStage;
window.dispatchEvent(new Event('signmockup-3d'));
