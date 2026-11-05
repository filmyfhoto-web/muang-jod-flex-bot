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

const BUILD = { studio: buildStudio, wall: buildWall, brick: buildBrick, shop: buildShop, fence: buildFence };

/* ---------------- ตัวป้าย ---------------- */
// หน้าป้าย: วัสดุแต่ละชนิดผิวไม่เหมือนกัน
function faceMat(type, map) {
  if (type === 'lightbox') return std({ map, emissiveMap: map, emissive: 0xffffff, emissiveIntensity: 0.18, roughness: 0.42 });
  const rough = { vinyl: 0.72, frame: 0.7, foam: 0.5, acrylic: 0.6, rollup: 0.5, xstand: 0.55 }[type] || 0.7;
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
    let baseY;
    let z;
    if (model.floor) {
      baseY = 0;
      z = env.floorZ;
      signRoot.position.set(0, 0, z);
    } else {
      baseY = C.mountBottom(sceneKey, g) / 100;
      // ป้ายกว้างเกินช่วงเสา (3.6 ม.) ต้องยึดหน้าเสา
      z = sceneKey === 'shop' && w > 3.6 ? 0.15 : env.wallZ;
      signRoot.position.set(0, baseY + h / 2, z);
    }
    const top = model.floor ? (model.faceY ? model.faceY[1] : h) : baseY + h;
    if (env.fit) env.fit(top);
    // คนยืนเทียบ ข้างขวาของป้าย หันเข้าหาป้ายนิดหนึ่ง
    person.visible = !!cur.person;
    const px = w / 2 + 0.55 + (model.type === 'xstand' ? 0.15 : 0);
    const pz = model.floor ? z + 0.05 : sceneKey === 'shop' ? 0.75 : sceneKey === 'fence' ? 0.5 : 0.45;
    person.position.set(px, 0, pz);
    person.rotation.y = -0.38;
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
  };
  function aimFor(name, aspect) {
    const v = VIEWS[name] || VIEWS.angle;
    const b = bounds(true);
    const c = b.getCenter(new THREE.Vector3());
    const size = b.getSize(new THREE.Vector3());
    const vf = THREE.MathUtils.degToRad(camera.fov);
    const hf = 2 * Math.atan(Math.tan(vf / 2) * aspect);
    const span = Math.abs(Math.cos(v.az)) * size.x + Math.abs(Math.sin(v.az)) * size.z;
    const dist = Math.max(size.y / 2 / Math.tan(vf / 2), span / 2 / Math.tan(hf / 2)) * 1.22 + size.z / 2;
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
    const personChanged = !!st.person !== !!cur.person;
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
    requestRender() {
      needs = true;
    },
  };
}

NS.createStage3d = createStage;
window.dispatchEvent(new Event('signmockup-3d'));
