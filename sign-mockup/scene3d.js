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

/* ฉากบัตร: "บนกระดาษ" — แผ่นกระดาษมีใย (เปลี่ยนสีได้) บัตรวางอยู่บนกระดาษ มองแบบภาพสินค้า */
function buildPaper() {
  const g = new THREE.Group();
  const c = mk(512, 512);
  const x = c.getContext('2d');
  x.fillStyle = '#ffffff';
  x.fillRect(0, 0, 512, 512);
  let seed = 11;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 2600; i++) {
    const px = r() * 512;
    const py = r() * 512;
    const a = r() * Math.PI;
    const l = 2 + r() * 10;
    x.strokeStyle = r() < 0.6 ? 'rgba(255,255,255,0.32)' : 'rgba(0,0,0,0.028)';
    x.lineWidth = 0.6 + r() * 0.7;
    x.beginPath();
    x.moveTo(px, py);
    x.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l);
    x.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = ANISO;
  tex.repeat.set(16, 12);
  const mat = std({ color: 0xf2f0ea, map: tex, roughness: 0.96 });
  const sheet = plane(4, 3, mat);
  sheet.position.set(0, 1.5, 0);
  sheet.receiveShadow = true;
  g.add(sheet);
  const env = { group: g, bg: new THREE.Color(0xf2f0ea), floorZ: 0.5, wallZ: 0, kind: 'indoor', cfg: {} };
  env.configure = (o) => {
    const p = C.PAPERS[o.paper] || C.PAPERS.white;
    mat.color.set(p.color);
    env.bg.set(p.color);
  };
  return env;
}

/* ฉากบัตร: "มือถือบัตร" — พื้นหลังนุ่ม ๆ (มือวาดติดไปกับบัตรใน layout) */
function buildHandScene() {
  const g = new THREE.Group();
  const c = mk(512, 512);
  const x = c.getContext('2d');
  const grd = x.createRadialGradient(256, 220, 0, 256, 256, 360);
  grd.addColorStop(0, '#f7f4ef');
  grd.addColorStop(0.6, '#e9e4dc');
  grd.addColorStop(1, '#d6cfc4');
  x.fillStyle = grd;
  x.fillRect(0, 0, 512, 512);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const back = plane(3, 3, new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  back.position.set(0, 1.5, -0.7);
  g.add(back);
  return { group: g, bg: new THREE.Color(0xd6cfc4), floorZ: 0.5, wallZ: 0, kind: 'indoor' };
}

/* ฉาก "บนโต๊ะ / เคาน์เตอร์": โต๊ะไม้สูง 75 ซม. ผนังร้านเบลอ ๆ ด้านหลัง — ของตั้งโต๊ะวางบนโต๊ะ ของแผ่นพิงยืนบนโต๊ะ */
function buildTableScene() {
  const g = new THREE.Group();
  const c = mk(1024, 256);
  const x = c.getContext('2d');
  x.fillStyle = '#9a6b45';
  x.fillRect(0, 0, 1024, 256);
  const r = rng(31);
  for (let i = 0; i < 70; i++) {
    const y = r() * 256;
    x.strokeStyle = r() < 0.5 ? 'rgba(60,32,14,0.28)' : 'rgba(255,220,180,0.12)';
    x.lineWidth = 1 + r() * 3;
    x.beginPath();
    x.moveTo(0, y);
    for (let px = 0; px <= 1024; px += 64) x.lineTo(px, y + Math.sin(px / 140 + i) * 5 * r());
    x.stroke();
  }
  const wood = new THREE.CanvasTexture(c);
  wood.colorSpace = THREE.SRGBColorSpace;
  wood.wrapS = wood.wrapT = THREE.RepeatWrapping;
  wood.anisotropy = ANISO;
  wood.repeat.set(2, 3);
  const top = box(3.2, 0.04, 1.2, std({ map: wood, roughness: 0.55 }));
  top.position.set(0, C.TABLE_H / 100 - 0.02, 0);
  top.receiveShadow = true;
  g.add(top);
  const bc = mk(512, 256);
  const bx = bc.getContext('2d');
  const grd = bx.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, '#ece4d8');
  grd.addColorStop(1, '#cbbba6');
  bx.fillStyle = grd;
  bx.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 14; i++) {
    bx.fillStyle = 'rgba(255,248,236,' + (0.15 + r() * 0.25) + ')';
    bx.beginPath();
    bx.arc(r() * 512, 40 + r() * 120, 8 + r() * 26, 0, Math.PI * 2);
    bx.fill();
  }
  const btex = new THREE.CanvasTexture(bc);
  btex.colorSpace = THREE.SRGBColorSpace;
  const back = plane(6, 3, new THREE.MeshBasicMaterial({ map: btex, toneMapped: false }));
  back.position.set(0, 1.2, -1.4);
  g.add(back);
  return { group: g, bg: new THREE.Color(0xcbbba6), floorZ: 0, floorY: C.TABLE_H / 100, wallZ: 0, kind: 'indoor' };
}

/* ฉาก "ห้องจัดงาน": ผ้าม่านฉากหลัง พรมเทาน้ำเงิน — แบ็คดรอป ธง โรลอัพ ตั้งบนพรม */
function buildEventScene() {
  const g = new THREE.Group();
  const c = mk(512, 256);
  const x = c.getContext('2d');
  x.fillStyle = '#2b3047';
  x.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 64; i++) {
    const px = i * 8;
    const gr = x.createLinearGradient(px, 0, px + 8, 0);
    gr.addColorStop(0, 'rgba(0,0,0,0.25)');
    gr.addColorStop(0.5, 'rgba(255,255,255,0.06)');
    gr.addColorStop(1, 'rgba(0,0,0,0.25)');
    x.fillStyle = gr;
    x.fillRect(px, 0, 8, 256);
  }
  const drape = new THREE.CanvasTexture(c);
  drape.colorSpace = THREE.SRGBColorSpace;
  drape.wrapS = drape.wrapT = THREE.RepeatWrapping;
  drape.repeat.set(6, 1);
  const wall = plane(30, 7, std({ map: drape, roughness: 0.95 }));
  wall.position.set(0, 3.5, 0);
  wall.receiveShadow = true;
  g.add(wall);
  const fc = mk(256, 256);
  const fx = fc.getContext('2d');
  fx.fillStyle = '#4c5466';
  fx.fillRect(0, 0, 256, 256);
  const r = rng(5);
  for (let i = 0; i < 4000; i++) {
    fx.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.08)';
    fx.fillRect(r() * 256, r() * 256, 1.5, 1.5);
  }
  const ft = new THREE.CanvasTexture(fc);
  ft.colorSpace = THREE.SRGBColorSpace;
  ft.wrapS = ft.wrapT = THREE.RepeatWrapping;
  ft.repeat.set(20, 10);
  const floor = plane(30, 16, std({ map: ft, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, 8);
  floor.receiveShadow = true;
  g.add(floor);
  return { group: g, bg: new THREE.Color(0x1e2233), floorZ: 1.2, wallZ: 0, kind: 'indoor' };
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
// road = ฉาก "ริมถนน" (ไม่มีรั้ว มีถนนลาดยาง + ทางเท้า) สำหรับบิลบอร์ด ธง ป้ายตั้งพื้น
function buildFence(road) {
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
  if (road) {
    const asphalt = std({ color: 0x3b3e43, roughness: 0.95 });
    const rd = plane(120, 7, asphalt);
    rd.rotation.x = -Math.PI / 2;
    rd.position.set(0, 0.012, 6.5);
    rd.receiveShadow = true;
    const walkMat = std({ color: 0xb9b4aa, roughness: 0.9 });
    const walk = box(120, 0.12, 1.8, walkMat);
    walk.position.set(0, 0.06, 2.1);
    walk.receiveShadow = true;
    const kerb = box(120, 0.15, 0.15, std({ color: 0xe6e3dc, roughness: 0.8 }));
    kerb.position.set(0, 0.075, 3.0);
    g.add(rd, walk, kerb);
    for (let i = -12; i <= 12; i++) {
      const dash = plane(1.6, 0.14, std({ color: 0xf2f0e8, roughness: 0.8 }));
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(i * 4, 0.015, 6.5);
      g.add(dash);
    }
  } else g.add(fence);
  shadowy(g, true, true);
  ground.castShadow = false;
  trees.traverse((m) => (m.castShadow = false));
  const env = { group: g, bg: null, sky: true, fog: [0xcfdde2, 18, 70], floorZ: 0.9, wallZ: 0.035, kind: 'outdoor' };
  if (road) return env;
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

// หน้าร้านกระจก: บานกระจกใหญ่กรอบอะลูมิเนียมทุก 4 ม. เห็นในร้าน (ชั้นวางของ ไฟเพดาน) · ป้ายคาดเหนือกระจก · ทางเท้า ถนน
function buildGlass() {
  const g = new THREE.Group();
  const facade = plaster('#e6dfd2', 67);
  const facadeMat = std({ map: repeatOf(facade.map, 1.5, 1.5), bumpMap: repeatOf(facade.bump, 1.5, 1.5), bumpScale: 0.5, roughness: 0.92 });
  const pillarMat = std({ map: repeatOf(facade.map, 0.4, 2), color: 0xefe8da, roughness: 0.9 });
  const N = 9;
  const W = 4;
  const P = 0.3;
  const GT = 2.7;
  const pw = W - P;
  // ภาพในร้าน (ชั้นวางของ) — เบลอนิดหน่อย มองผ่านกระจก
  const ic = mk(1024, 760);
  const ix = ic.getContext('2d');
  if (NS.render && NS.render.glassInterior) NS.render.glassInterior(ix, 0, 0, 1024, 760, 31);
  else {
    ix.fillStyle = '#3a352f';
    ix.fillRect(0, 0, 1024, 760);
  }
  const ib = mk(1024, 760);
  const bx = ib.getContext('2d');
  bx.filter = 'blur(3px)';
  bx.drawImage(ic, 0, 0);
  const inTex = canvasTex(ib);
  const backMat = std({ map: inTex, emissiveMap: inTex, emissive: 0xffffff, emissiveIntensity: 0.45, roughness: 1 });
  const wallIn = std({ color: 0x4a443c, roughness: 0.95 });
  const ceilIn = std({ color: 0x8d8478, emissive: 0x3a3226, roughness: 0.9 });
  const floorIn = std({ color: 0x3a342d, roughness: 0.8 });
  const glassMat = new THREE.MeshPhysicalMaterial({ color: 0xb8ccd4, metalness: 0, roughness: 0.04, transparent: true, opacity: 0.2, clearcoat: 1, clearcoatRoughness: 0.02, depthWrite: false, envMapIntensity: 1.3 });
  for (let k = -4; k <= 4; k++) {
    const mx = k * W;
    // ห้องในร้าน (กล่องมองจากด้านใน) ลึก 1.6 ม.
    const room = new THREE.Mesh(new THREE.BoxGeometry(pw, GT, 1.6), [wallIn, wallIn, ceilIn, floorIn, wallIn, backMat]);
    room.material.forEach((m) => (m.side = THREE.BackSide));
    room.position.set(mx, GT / 2, -0.8 - 0.02);
    room.receiveShadow = true;
    room.userData.noCast = true;
    g.add(room);
    const pane = plane(pw, GT - 0.08, glassMat);
    pane.position.set(mx, 0.08 + (GT - 0.08) / 2, 0);
    pane.renderOrder = 1;
    pane.userData.noCast = true;
    g.add(pane);
    // กรอบอะลูมิเนียม: บน ล่าง ข้าง
    const top = box(pw, 0.05, 0.07, MAT.alu);
    top.position.set(mx, GT - 0.025, 0);
    const sill = box(pw, 0.08, 0.08, MAT.darkAlu);
    sill.position.set(mx, 0.04, 0);
    g.add(top, sill);
    for (const sx of [-1, 1]) {
      const side = box(0.05, GT, 0.07, MAT.alu);
      side.position.set(mx + sx * (pw / 2 - 0.025), GT / 2, 0);
      g.add(side);
    }
  }
  for (let k = -4; k <= 5; k++) {
    const p = box(P, GT, 0.3, pillarMat);
    p.position.set(k * W - W / 2, GT / 2, 0);
    g.add(p);
  }
  // ป้ายคาดหน้าร้าน + ผนังชั้นบน
  const fascia = box(N * W, 0.7, 0.36, std({ color: 0x2e3239, roughness: 0.6, metalness: 0.2 }));
  fascia.position.set(0, GT + 0.35, 0);
  g.add(fascia);
  const upper = box(N * W, 3, 0.2, facadeMat);
  upper.position.set(0, GT + 0.7 + 1.5, -0.1);
  g.add(upper);
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
  shadowy(g, true, true);
  road.castShadow = false;
  g.traverse((m) => {
    if (m.userData.noCast) m.castShadow = false;
  });
  return { group: g, bg: new THREE.Color(0xbcc7cf), floorZ: 0.9, wallZ: 0, kind: 'street' };
}

const BUILD = { paper: buildPaper, hand: buildHandScene, table: buildTableScene, event: buildEventScene, studio: buildStudio, wall: buildWall, brick: buildBrick, shop: buildShop, glass: buildGlass, fence: () => buildFence(false), road: () => buildFence(true), classDoor: buildClassDoor, officeDoor: buildOfficeDoor, classroom: buildClassroom };

/* ---------------- ตัวป้าย ---------------- */
// หน้าป้าย: วัสดุแต่ละชนิดผิวไม่เหมือนกัน
function faceMat(type, map) {
  if (type === 'lightbox') return std({ map, emissiveMap: map, emissive: 0xffffff, emissiveIntensity: 0.18, roughness: 0.42 });
  const rough = { vinyl: 0.72, frame: 0.7, foam: 0.5, sticker: 0.36, acrylic: 0.6, rollup: 0.5, xstand: 0.55, card: 0.45 }[type] || 0.7;
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
  } else if (type === 'card') {
    // บัตรอาร์ตการ์ด 0.4 มม. ขอบกระดาษขาว ลอยหน้าพื้นหลังนิดหน่อยให้มีเงา (ภาพโชว์สินค้า)
    const d = 0.0004;
    const z0 = 0.0025;
    const b = box(w, h, d, [MAT.foamEdge, MAT.foamEdge, MAT.foamEdge, MAT.foamEdge, face, MAT.foamEdge]);
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

/* ---------- ชิ้นงานรูปทรงพิเศษ (มุมมน / วงกลม / ไดคัท) ----------
 * หน้างานเป็นภาพพื้นใส (ตัดรูปทรงแล้ว) → แผ่นเรียบซ้อนหลายชั้นตัดด้วย alphaTest เป็นความหนาตามรูปจริง เงาก็ตามรูป */
function silCanvas(src) {
  const c = mk(src.width, src.height);
  const x = c.getContext('2d');
  x.drawImage(src, 0, 0);
  x.globalCompositeOperation = 'source-in';
  x.fillStyle = '#ffffff';
  x.fillRect(0, 0, c.width, c.height);
  return c;
}
function shapedMats(sideColor, rough) {
  return {
    side: std({ color: sideColor, roughness: rough, alphaTest: 0.5, side: THREE.DoubleSide }),
    depth: new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, alphaTest: 0.5 }),
    dist: new THREE.MeshDistanceMaterial({ alphaTest: 0.5 }),
  };
}
// แผ่นหนา d เริ่มที่ z0: ชั้นขอบทุก ~1.2 มม. (ชั้นหลังสุดทอดเงา) + หน้างาน
function shapedSlab(g, w, h, face, M, z0, d) {
  const geo = new THREE.PlaneGeometry(w, h);
  const n = d > 0 ? Math.max(2, Math.min(10, Math.ceil(d / 0.0012) + 1)) : 0;
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(geo, M.side);
    m.position.z = z0 + (d * i) / n;
    m.customDepthMaterial = M.depth;
    m.customDistanceMaterial = M.dist;
    if (i > 0) m.userData.noCast = true;
    g.add(m);
  }
  const f = new THREE.Mesh(geo, face);
  f.position.z = z0 + d;
  f.customDepthMaterial = M.depth;
  f.customDistanceMaterial = M.dist;
  if (n) f.userData.noCast = true;
  g.add(f);
  return f;
}
function shapedFaceUpdater(M, extra = []) {
  let tex = null;
  return (faceTex) => {
    const src = faceTex && faceTex.image;
    if (!src) return;
    const t = canvasTex(silCanvas(src));
    for (const m of [M.side, M.depth, M.dist, ...extra]) {
      m.map = t;
      m.needsUpdate = true;
    }
    if (tex) tex.dispose();
    tex = t;
  };
}
function standoffsAt(g, pts, gap, t) {
  for (const [x, y] of pts) {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.0125, 0.0125, gap, 20), MAT.chrome);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(x, y, gap / 2);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.0125, 0.0128, 0.012, 24), MAT.chrome);
    cap.rotation.x = Math.PI / 2;
    cap.position.set(x, y, gap + t + 0.007);
    g.add(barrel, cap);
  }
}
function buildShaped(type, w, h, map, kind) {
  const g = new THREE.Group();
  const face = faceMat(type, map);
  face.alphaTest = 0.5;
  const acr = type === 'acrylic';
  const P = { foam: [0.002, 0.005, 0xf1efe9], card: [0.0025, 0.0004, 0xf4f3ef], sticker: [0.0008, 0, 0xffffff], acrylic: [kind === 'cut' ? 0.012 : 0.025, 0.008, 0xd3ebe6] }[type] || [0.002, 0.005, 0xf1efe9];
  const [z0, d, sideColor] = P;
  const M = shapedMats(sideColor, acr ? 0.12 : 0.85);
  if (type === 'sticker') {
    face.polygonOffset = true;
    face.polygonOffsetFactor = -2;
    face.polygonOffsetUnits = -2;
  }
  shapedSlab(g, w, h, face, M, z0, d);
  const extra = [];
  let front = z0 + d + 0.0002;
  if (acr) {
    // ผิวอะคริลิคใสเงาด้านหน้า (ตามรูป) + หมุดสแตนเลส (มุมมน: 4 มุม · วงกลม: 4 จุดในวง · ไดคัท: หมุดซ่อนหลังแผ่น)
    const gl = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, roughness: 0.03, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03, alphaTest: 0.05, depthWrite: false, envMapIntensity: LIGHT.env });
    const top = plane(w, h, gl);
    top.position.z = z0 + d + 0.0006;
    top.userData.noCast = true;
    g.add(top);
    extra.push(gl);
    const inset = Math.max(0.025, Math.min(w, h) * 0.07);
    const pts =
      kind === 'round'
        ? [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sy]) => [sx * (w / 2 - inset), sy * (h / 2 - inset)])
        : kind === 'circle'
          ? [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sy]) => [sx * w * 0.27, sy * h * 0.27])
          : [];
    standoffsAt(g, pts, z0, d);
    front = z0 + d + 0.001;
  }
  const setFace = shapedFaceUpdater(M, extra);
  setFace(map);
  const dispose = () => {
    M.depth.dispose();
    M.dist.dispose();
  };
  return { group: g, face, front, setFace, dispose, shaped: kind };
}

/* สแตนดี้ไดคัท: ฟิวเจอร์บอร์ด 5 มม. ตัดตามรูป ฐานตรง เอนหลัง 6° มีขาค้ำด้านหลัง (ตั้งพื้น) */
const STANDEE_TILT = 0.105;
function buildStandee(w, h, map) {
  const g = new THREE.Group();
  const d = 0.005;
  const face = faceMat('foam', map);
  face.alphaTest = 0.5;
  const M = shapedMats(0xf4f3ef, 0.85);
  const board = new THREE.Group();
  const slab = new THREE.Group();
  shapedSlab(slab, w, h, face, M, 0, d);
  slab.position.y = h / 2;
  board.add(slab);
  board.rotation.x = -STANDEE_TILT;
  g.add(board);
  const c = Math.cos(STANDEE_TILT);
  const sn = Math.sin(STANDEE_TILT);
  const at = (x, y, z) => [x, y * c + z * sn, -y * sn + z * c];
  // ขาค้ำ: แผ่นโฟมกว้าง 10 ซม. จากหลังแผ่นที่ 60% ของความสูง ลงพื้นเฉียงไปข้างหลัง
  const hs = h * 0.6;
  const A = at(0, hs, -0.002);
  const B = [0, 0.004, -hs * 0.57];
  const dy = A[1] - B[1];
  const dz = A[2] - B[2];
  const L = Math.hypot(dy, dz);
  const strut = box(Math.min(0.1, w * 0.3), L, 0.005, MAT.foamEdge);
  strut.position.set(0, (A[1] + B[1]) / 2, (A[2] + B[2]) / 2);
  strut.rotation.x = Math.atan2(dz, dy);
  g.add(strut);
  const setFace = shapedFaceUpdater(M);
  setFace(map);
  const corners = [at(-w / 2, h, d), at(w / 2, h, d), at(w / 2, 0, d), at(-w / 2, 0, d)];
  const dispose = () => {
    M.depth.dispose();
    M.dist.dispose();
  };
  return { group: g, face, front: d, faceY: [0, h * c], corners, setFace, dispose, shaped: 'cut' };
}

/* สติ๊กเกอร์ติดกระจก (แนบผิวกระจกด้านนอก): print = พิมพ์สีทึบ · frost = ฟิล์มฝ้าขุ่น ลายตัดใส · oneway = ตาข่ายรูพรุน */
function buildWindow(w, h, map, look, shaped, edge) {
  const g = new THREE.Group();
  const film = look.film || 'print';
  const face =
    film === 'frost'
      ? std({ color: 0xffffff, transparent: true, depthWrite: false, roughness: 0.8 })
      : std({ map, roughness: film === 'oneway' ? 0.55 : 0.3, metalness: 0, alphaTest: shaped ? 0.5 : 0 });
  face.polygonOffset = true;
  face.polygonOffsetFactor = -2;
  face.polygonOffsetUnits = -2;
  const m = plane(w, h, face);
  m.position.z = 0.0012;
  m.renderOrder = 2;
  m.userData.noCast = true;
  g.add(m);
  let tex = null;
  const setFace = (faceTex, e) => {
    if (film === 'print') return;
    const src = faceTex && faceTex.image;
    if (!src || !NS.render || !NS.render.filmArt) return;
    const t = canvasTex(NS.render.filmArt(src, film, e || edge, src.width / (w * 100)));
    if (film === 'oneway' && !shaped) t.userData.mimeType = 'image/jpeg';
    face.map = t;
    face.needsUpdate = true;
    if (tex) tex.dispose();
    tex = t;
  };
  setFace(map, edge);
  const dispose = () => {
    if (tex) tex.dispose();
  };
  return { group: g, face, front: 0.0014, setFace, dispose, shaped };
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

/* ป้ายโครงการ CNC: แผ่นอะลูมิเนียมคอมโพสิตบนโครงเหล็ก (หนา 5 ซม.) ขอบอะลูมิเนียม ตั้งเสาเหล็กกล่องคู่บนฐานปูน
 * ตัวอักษร/โลโก้ (ส่วนที่สีต่างจากพื้นงาน) ตัด CNC ยกนูน 1.5 ซม. — ซ้อนแผ่นตัดรูปหลายชั้นให้เห็นความหนาเวลามองเฉียง
 * แผ่นหน้าเป็นสีพื้นของงาน · ตัวนูนทอดเงาลงบนแผ่นจริง */
function buildCnc(w, h, map, edge, steel) {
  const g = new THREE.Group();
  const G = C.geometry('cnc', w * 100, h * 100, steel);
  const posts = !G.noPosts;
  const lift = G.lift / 100;
  const post = G.post / 100;
  const cap = G.cap / 100;
  const relief = G.relief / 100;
  const T = G.depth / 100;
  // มีเสา: จุดตั้งอยู่ที่พื้น หน้าแผ่นอยู่ที่ z = 0 · ไม่มีเสา: จุดตั้งอยู่กลางป้าย แผ่นลอยจากผนัง 1 ซม.
  const cy = posts ? lift + h / 2 : 0;
  const z0 = posts ? 0 : T + 0.01;
  const bgCol = (e) => new THREE.Color().setRGB(e[0] / 255, e[1] / 255, e[2] / 255, THREE.SRGBColorSpace);
  const plate = std({ color: bgCol(edge), roughness: 0.38, metalness: 0.12 });
  const back = std({ color: 0x8e9299, roughness: 0.6, metalness: 0.3 });
  const panel = new THREE.Mesh(new THREE.BoxGeometry(w, h, T), [MAT.alu, MAT.alu, MAT.alu, MAT.alu, plate, back]);
  panel.position.set(0, cy, z0 - T / 2);
  g.add(panel);
  // ตัวนูน: ชั้นหน้าเป็นสีงานจริง ชั้นในมืดลง (ด้านข้างตัวอักษร)
  const front = std({ alphaTest: 0.5, roughness: 0.3, metalness: 0.04 });
  const side = std({ alphaTest: 0.5, roughness: 0.5, color: 0x6a6a6a });
  const depthMat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, alphaTest: 0.5 });
  const geo = new THREE.PlaneGeometry(w, h);
  const N = 7;
  for (let i = 0; i < N; i++) {
    const m = new THREE.Mesh(geo, i === N - 1 ? front : side);
    m.position.set(0, cy, z0 + 0.0015 + ((relief - 0.0015) * i) / (N - 1));
    m.customDepthMaterial = depthMat;
    g.add(m);
  }
  let tex = null;
  const setFace = (faceTex, e) => {
    const src = faceTex && faceTex.image;
    if (!src || !NS.render || !NS.render.letterMask) return;
    if (e) plate.color.copy(bgCol(e));
    const t = new THREE.CanvasTexture(NS.render.letterMask(src, e || edge));
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = ANISO;
    for (const m of [front, side, depthMat]) {
      m.map = t;
      m.needsUpdate = true;
    }
    if (tex) tex.dispose();
    tex = t;
  };
  setFace(map, edge);
  // เสาเหล็กกล่องคู่ + ฝาปิดหัวเสา + ฐานปูน + ขายึดแผ่น
  const postM = steel && steel.color ? metalMat(C.metalColor(steel.color)) : std({ color: 0x3c4047, roughness: 0.5, metalness: 0.4 });
  const concrete = std({ color: 0xa8a59e, roughness: 0.95 });
  const ph = lift + h + cap;
  if (!posts) {
    // ขายึดหลังแผ่น (เห็นตอนมองด้านข้าง)
    for (const s of [-1, 1])
      for (const y of [h / 2 - 0.1, -h / 2 + 0.1]) {
        const br = box(0.04, 0.03, 0.012, MAT.darkAlu);
        br.position.set(s * (w / 2 - 0.12), y, 0.006);
        g.add(br);
      }
    const dispose = () => {
      if (tex) tex.dispose();
      depthMat.dispose();
    };
    return { group: g, face: null, front: z0 + relief, setFace, dispose };
  }
  for (const s of [-1, 1]) {
    const x = s * (w / 2 + post / 2);
    const p = box(post, ph, post, postM);
    p.position.set(x, ph / 2, -T / 2);
    const top = box(post + 0.014, 0.012, post + 0.014, postM);
    top.position.set(x, ph + 0.006, -T / 2);
    const foot = box(post + 0.16, 0.07, post + 0.16, concrete);
    foot.position.set(x, 0.035, -T / 2);
    g.add(p, top, foot);
    for (const y of [lift + 0.08, lift + h - 0.08]) {
      const br = box(0.05, 0.035, T + 0.012, MAT.darkAlu);
      br.position.set(s * (w / 2 + 0.012), y, -T / 2);
      g.add(br);
    }
  }
  const dispose = () => {
    if (tex) tex.dispose();
    depthMat.dispose();
  };
  return { group: g, face: null, front: 0, faceY: [lift, lift + h], setFace, dispose };
}

/* ป้ายขาตั้งโครงเหล็ก: เหล็กกล่องเชื่อม (ทำสีดำ) — กรอบป้าย + คร่าว · เสา 2 ต้นคือด้านข้างกรอบต่อลงพื้น
 * ฐานสี่เหลี่ยม (แนวลึก 2 + แนวขวาง 2) หรือขาตัว T · หน้าป้ายเป็นแผ่นบางติดหน้าโครง (ซ่อนได้ = โชว์เฉพาะโครง) */
// วัสดุเหล็กตามสีที่เลือก ('inox' = สแตนเลสเงา)
function metalMat(color, fallback) {
  if (color === 'inox') return std({ color: 0xd5d8dd, roughness: 0.28, metalness: 0.85 });
  return std({ color: new THREE.Color(color || fallback), roughness: 0.5, metalness: 0.25 });
}
function buildStand(w, h, map, steel) {
  const g = new THREE.Group();
  const G = C.geometry('stand', w * 100, h * 100, steel);
  const o = G.steel;
  const T = o.T / 100;
  const total = o.total / 100;
  const D = o.depth / 100;
  const lift = total - h;
  const steelM = metalMat(o.color, '#1f2125');
  const tube = (bw, bh, bd, x, y, z) => {
    const m = box(bw, bh, bd, steelM);
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  const baseH = T;
  // เสา/กรอบแนวตั้ง
  for (const s of [-1, 1]) tube(T, total - baseH, T, s * (w / 2 - T / 2), baseH + (total - baseH) / 2, 0);
  // กรอบบน กรอบล่าง
  tube(w - 2 * T, T, T, 0, total - T / 2, 0);
  tube(w - 2 * T, T, T, 0, lift + T / 2, 0);
  // คร่าวนอน / คร่าวตั้ง
  const innerW = w - 2 * T;
  const innerH = h - 2 * T;
  const segH = (innerH - o.nh * T) / (o.nh + 1);
  const segW = (innerW - o.nv * T) / (o.nv + 1);
  const ys = [];
  for (let i = 0; i < o.nh; i++) {
    const y = lift + T + (i + 1) * segH + i * T + T / 2;
    ys.push(y);
    tube(innerW, T, T, 0, y, 0);
  }
  for (let j = 0; j < o.nv; j++) {
    const x = -w / 2 + T + (j + 1) * segW + j * T + T / 2;
    for (let i = 0; i <= o.nh; i++) {
      const y0 = lift + T + i * (segH + T);
      tube(T, segH, T, x, y0 + segH / 2, 0);
    }
  }
  // ฐาน
  if (o.base === 'rect') {
    for (const s of [-1, 1]) tube(T, T, D, s * (w / 2 - T / 2), T / 2, 0);
    for (const s of [-1, 1]) tube(w - 2 * T, T, T, 0, T / 2, s * (D / 2 - T / 2));
  } else {
    const cap = std({ color: 0x0e0f11, roughness: 0.7 });
    for (const s of [-1, 1]) {
      tube(T, T, D, s * (w / 2 - T / 2), T / 2, 0);
      for (const z of [-1, 1]) {
        const c = box(T * 1.05, T * 1.05, 0.006, cap);
        c.position.set(s * (w / 2 - T / 2), T / 2, z * (D / 2 + 0.003));
        g.add(c);
      }
    }
  }
  // หน้าป้าย (แผ่นบาง 4 มม. ขอบขาว) ติดหน้าโครง
  const face = faceMat('foam', map);
  const edgeM = std({ color: 0xeceae5, roughness: 0.6 });
  const back = std({ color: 0xdedcd6, roughness: 0.7 });
  const panel = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.004), [edgeM, edgeM, edgeM, edgeM, face, back]);
  panel.position.set(0, lift + h / 2, T / 2 + 0.002);
  panel.visible = !o.frameOnly;
  g.add(panel);
  const front = o.frameOnly ? T / 2 : T / 2 + 0.004;
  const dims = [
    { a: new THREE.Vector3(-w / 2, 0, front), b: new THREE.Vector3(-w / 2, total, front), text: 'สูงรวม ' + C.fmtCm(o.total) + ' ซม.', off: 34 },
    { a: new THREE.Vector3(w / 2, 0.002, -D / 2), b: new THREE.Vector3(w / 2, 0.002, D / 2), text: 'ฐานลึก ' + C.fmtCm(o.depth) + ' ซม.', off: 30 },
  ];
  return { group: g, face, front, faceY: [lift, total], dims };
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

/* ---------------- ป้ายเพิ่มเติม: ตัวอักษร · นีออน · ป้ายยื่น · ธงญี่ปุ่น · แบ็คดรอป · บิลบอร์ด · ป้ายตั้งโต๊ะ ---------------- */
// รวมแท่งกลมหลายเส้นเป็นก้อนเดียว (โครงทรัส/ราวกันตก) — วาดเร็ว ส่งออก .glb ได้
function mergedRods(segs, r, mat, seg = 8) {
  const pos = [];
  const nor = [];
  const idx = [];
  let base = 0;
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  for (const [a, b] of segs) {
    const d = new THREE.Vector3().subVectors(b, a);
    const len = d.length();
    if (len < 1e-6) continue;
    const geo = new THREE.CylinderGeometry(r, r, len, seg, 1, true);
    q.setFromUnitVectors(UP, d.clone().normalize());
    m4.compose(a.clone().addScaledVector(d, 0.5), q, one);
    geo.applyMatrix4(m4);
    const p = geo.attributes.position.array;
    const n = geo.attributes.normal.array;
    const ix = geo.index.array;
    for (let i = 0; i < p.length; i++) {
      pos.push(p[i]);
      nor.push(n[i]);
    }
    for (let i = 0; i < ix.length; i++) idx.push(ix[i] + base);
    base += p.length / 3;
    geo.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setIndex(idx);
  return new THREE.Mesh(geo, mat);
}
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
// ภาพตัวอักษรสีเดียว (ใช้กับวัสดุโลหะ/ดำ/ขาว) จากภาพตัวอักษรสีตามงาน
function tintCanvas(src, color) {
  const c = mk(src.width, src.height);
  const x = c.getContext('2d');
  x.drawImage(src, 0, 0);
  x.globalCompositeOperation = 'source-in';
  x.fillStyle = color;
  x.fillRect(0, 0, c.width, c.height);
  return c;
}
// แสงฟุ้ง: วาดภาพลงกลางผืนที่ใหญ่กว่า (sx, sy เท่า) แล้วเบลอ
function glowCanvas(src, sx, sy, blur, color) {
  const c = mk(Math.round(src.width * sx), Math.round(src.height * sy));
  const x = c.getContext('2d');
  const s = color ? tintCanvas(src, color) : src;
  x.filter = 'blur(' + blur + 'px)';
  const ox = (c.width - src.width) / 2;
  const oy = (c.height - src.height) / 2;
  x.drawImage(s, ox, oy);
  x.drawImage(s, ox, oy);
  return c;
}
const canvasTex = (cv) => {
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = ANISO;
  return t;
};

/* ป้ายตัวอักษรติดผนัง: ตัวอักษรหนา 3 ซม. ลอยจากผนัง 2.5 ซม. (ไม่มีแผ่นพื้น) — ส่วนที่สีต่างจากพื้นงานคือตัวอักษร
 * วัสดุ: สีตามงาน / สแตนเลส / ทอง / ดำ / ขาว · ไฟ: ส่องหลัง (แสงฟุ้งบนผนัง) / ไฟหน้า (หน้าตัวอักษรเรืองแสง) */
const LETTER_METAL = { inox: ['#d8dbdf', 0.9, 0.22], gold: ['#d6ae55', 0.9, 0.26], black: ['#1d1e21', 0.15, 0.6], white: ['#f2f1ec', 0, 0.45] };
function buildLetters(w, h, map, edge, look) {
  const g = new THREE.Group();
  const G = C.geometry('letters', w * 100, h * 100);
  const gap = G.gap / 100;
  const T = G.relief / 100;
  const mtl = LETTER_METAL[look.mat];
  const front = std({ alphaTest: 0.5, roughness: mtl ? mtl[2] : 0.32, metalness: mtl ? mtl[1] : 0.02 });
  const side = std({ alphaTest: 0.5, roughness: 0.45, metalness: mtl ? mtl[1] * 0.8 : 0.05, color: mtl ? new THREE.Color(mtl[0]).multiplyScalar(0.6) : 0x707070 });
  const depthMat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, alphaTest: 0.5 });
  const geo = new THREE.PlaneGeometry(w, h);
  const N = 9;
  for (let i = 0; i < N; i++) {
    const m = new THREE.Mesh(geo, i === N - 1 ? front : side);
    m.position.z = gap + (T * i) / (N - 1);
    m.customDepthMaterial = depthMat;
    g.add(m);
  }
  const haloMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, opacity: 0 });
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.3, h * 1.7), haloMat);
  halo.position.z = 0.004;
  halo.visible = look.light === 'halo';
  g.add(halo);
  let texs = [];
  const setFace = (faceTex, e) => {
    const src = faceTex && faceTex.image;
    if (!src || !NS.render || !NS.render.letterMask) return;
    const L = NS.render.letterMask(src, e || edge);
    const t = canvasTex(mtl ? tintCanvas(L, '#ffffff') : L);
    if (mtl) front.color.set(mtl[0]);
    for (const m of [front, side, depthMat]) {
      m.map = t;
      m.needsUpdate = true;
    }
    if (look.light === 'front') {
      front.emissiveMap = t;
      front.emissive.set(0xffffff);
    }
    const ht = canvasTex(glowCanvas(L, 1.3, 1.7, Math.max(6, L.width * 0.02), '#fff1d8'));
    haloMat.map = ht;
    haloMat.needsUpdate = true;
    texs.forEach((x) => x.dispose());
    texs = [t, ht];
  };
  setFace(map, edge);
  const setNight = (night) => {
    front.emissiveIntensity = look.light === 'front' ? (night ? 1.15 : 0.1) : 0;
    haloMat.opacity = night ? 1 : 0.22;
    haloMat.color.setScalar(night ? 1.8 : 1);
  };
  setNight(false);
  const dispose = () => {
    texs.forEach((x) => x.dispose());
    depthMat.dispose();
  };
  return { group: g, face: null, front: gap + T, setFace, setNight, selfLit: look.light !== 'none', dispose };
}

/* ป้ายไฟนีออน LED: หลอดนีออนตามขอบตัวอักษร บนแผ่นอะคริลิคใสลอยจากผนัง 3 ซม. — กลางคืนเรืองแสง ส่องผนังรอบ ๆ */
function buildNeon(w, h, map, edge, look) {
  const g = new THREE.Group();
  const gap = 0.03;
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, 0.005),
    new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, roughness: 0.04, metalness: 0, clearcoat: 1, depthWrite: false })
  );
  board.position.z = gap;
  g.add(board);
  for (const sx of [-1, 1])
    for (const sy of [-1, 1]) {
      const p = rod(V3(sx * (w / 2 - 0.03), sy * (h / 2 - 0.03), 0), V3(sx * (w / 2 - 0.03), sy * (h / 2 - 0.03), gap + 0.008), 0.007, MAT.chrome);
      g.add(p);
    }
  const tubeMat = new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.05, toneMapped: false });
  const tube = new THREE.Mesh(new THREE.PlaneGeometry(w, h), tubeMat);
  tube.position.z = gap + 0.009;
  g.add(tube);
  const glowMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.2, h * 1.2), glowMat);
  glow.position.z = gap + 0.011;
  g.add(glow);
  const spillMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, opacity: 0 });
  const spill = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.8, h * 2), spillMat);
  spill.position.z = 0.003;
  g.add(spill);
  let texs = [];
  const setFace = (faceTex, e) => {
    const src = faceTex && faceTex.image;
    if (!src || !NS.render || !NS.render.neonArt) return;
    const a = NS.render.neonArt(src, e || edge, look.neon);
    const tt = canvasTex(a.tube);
    const gt = canvasTex(glowCanvas(a.glow, 1.2, 1.2, 0));
    // แสงตกบนผนัง: ซ้อนแสงฟุ้งหลายชั้นให้เข้มพอ แล้วเบลอกว้าง
    const sc = mk(Math.round(a.glow.width * 1.8), Math.round(a.glow.height * 2));
    const sx = sc.getContext('2d');
    sx.filter = 'blur(' + Math.max(16, a.glow.width * 0.09) + 'px)';
    sx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 6; i++) sx.drawImage(a.tube, (sc.width - a.glow.width) / 2, (sc.height - a.glow.height) / 2);
    const st2 = canvasTex(sc);
    tubeMat.map = tt;
    glowMat.map = gt;
    spillMat.map = st2;
    for (const m of [tubeMat, glowMat, spillMat]) m.needsUpdate = true;
    texs.forEach((x) => x.dispose());
    texs = [tt, gt, st2];
  };
  setFace(map, edge);
  const setNight = (night) => {
    tubeMat.color.setScalar(night ? 1.25 : 0.95);
    glowMat.opacity = night ? 0.85 : 0.4;
    spillMat.opacity = night ? 1 : 0;
    spillMat.color.setScalar(night ? 1.3 : 1); // แสงนีออนตกบนผนังรอบ ๆ
  };
  setNight(false);
  const dispose = () => texs.forEach((x) => x.dispose());
  return { group: g, face: null, front: gap + 0.01, setFace, setNight, selfLit: true, dispose };
}

/* ป้ายยื่น (แขวนสองหน้า): กล่องหนา 12 ซม. ตั้งฉากกับผนัง พิมพ์ทั้งสองหน้า แขวนใต้แขนเหล็ก — เปิดไฟได้ (กล่องไฟ) */
function buildBlade(w, h, map, look) {
  const g = new THREE.Group();
  const D = 0.12;
  const arm = 0.15;
  const face = faceMat('lightbox', map);
  const rim = std({ color: 0xeef0f2, metalness: 0.6, roughness: 0.35 });
  const bx = new THREE.Mesh(new THREE.BoxGeometry(D, h, w), [face, face, rim, rim, rim, rim]);
  bx.position.set(0, 0, arm + w / 2);
  g.add(bx);
  const y = h / 2 + 0.06;
  const bar = box(0.025, 0.035, arm + w + 0.04, MAT.plastic);
  bar.position.set(0, y, (arm + w + 0.04) / 2);
  const plate = box(0.12, 0.2, 0.012, MAT.plastic);
  plate.position.set(0, y - 0.04, 0.006);
  g.add(bar, plate);
  g.add(rod(V3(0, y - 0.1, 0.01), V3(0, y, arm * 0.9), 0.008, MAT.plastic)); // ค้ำยัน
  for (const z of [arm + w * 0.15, arm + w * 0.85]) g.add(rod(V3(0, h / 2, z), V3(0, y - 0.017, z), 0.004, MAT.chrome));
  const setNight = (night) => {
    face.emissiveIntensity = look.lit ? (night ? 0.82 : 0.14) : 0;
  };
  setNight(false);
  const x = -D / 2 - 0.001;
  const corners = [[x, h / 2, arm], [x, h / 2, arm + w], [x, -h / 2, arm + w], [x, -h / 2, arm]];
  return { group: g, face, front: D / 2, corners, setNight, selfLit: !!look.lit };
}

/* ธงญี่ปุ่น: ผืนธงพลิ้วนิด ๆ แขวนราวบน เสาข้างซ้าย ปักในฐานถ่วงน้ำ — ชายธงลอยจากพื้น 30 ซม. */
function buildFlag(w, h, map) {
  const g = new THREE.Group();
  const lift = 0.3;
  const poleX = -w / 2 - 0.025;
  const top = lift + h + 0.08;
  const geo = new THREE.PlaneGeometry(w, h, 24, 40);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const u = (pos.getX(i) + w / 2) / w;
    const v = (pos.getY(i) + h / 2) / h;
    pos.setZ(i, Math.sin(u * Math.PI * 1.4 + v * 2.4) * 0.028 * u + Math.sin(v * 8 + u * 3) * 0.006 * u);
  }
  geo.computeVertexNormals();
  const face = std({ map, roughness: 0.78, side: THREE.DoubleSide });
  const flag = new THREE.Mesh(geo, face);
  flag.position.set(0, lift + h / 2, 0);
  g.add(flag);
  g.add(rod(V3(poleX, 0.12, 0), V3(poleX, top, 0), 0.016, MAT.alu));
  g.add(rod(V3(poleX, lift + h + 0.012, 0), V3(w / 2 + 0.012, lift + h + 0.012, 0), 0.008, MAT.alu));
  const capM = new THREE.Mesh(new THREE.SphereGeometry(0.022, 16, 10), MAT.plastic);
  capM.position.set(poleX, top + 0.01, 0);
  g.add(capM);
  for (const yy of [lift + 0.02, lift + h * 0.5]) {
    const clip = box(0.03, 0.02, 0.03, MAT.plastic);
    clip.position.set(poleX + 0.01, yy, 0);
    g.add(clip);
  }
  const baseM = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.13, 32), MAT.plastic);
  baseM.position.set(poleX, 0.065, 0);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.08, 16), MAT.plastic);
  neck.position.set(poleX, 0.16, 0);
  g.add(baseM, neck);
  return { group: g, face, front: 0.03, faceY: [lift, lift + h] };
}

/* ฉากแบ็คดรอป: โครงทรัสอะลูมิเนียม 30 ซม. (เสา 2 ข้าง + คานบน) ไวนิลขึงด้านในด้วยยางยืด — ชายล่างลอยจากพื้น 10 ซม. */
function trussSegs(x0, y0, z0, x1, y1, z1, T) {
  // ทรัสสี่เหลี่ยมตามแกนยาว (แกนที่ต่างกันมากที่สุด) — คอร์ด 4 เส้น + ตัวเฉียงซิกแซก 4 ด้าน
  const L = [x1 - x0, y1 - y0, z1 - z0];
  const ax = L.map(Math.abs).indexOf(Math.max(...L.map(Math.abs)));
  const len = Math.abs(L[ax]);
  const o = [x0, y0, z0];
  const others = [0, 1, 2].filter((i) => i !== ax);
  const corner = (a, b, t) => {
    const p = o.slice();
    p[ax] += Math.sign(L[ax]) * t;
    p[others[0]] += a ? T : 0;
    p[others[1]] += b ? T : 0;
    return V3(p[0], p[1], p[2]);
  };
  const chords = [];
  const lace = [];
  const cs = [[0, 0], [1, 0], [1, 1], [0, 1]];
  for (const [a, b] of cs) chords.push([corner(a, b, 0), corner(a, b, len)]);
  const n = Math.max(1, Math.round(len / T));
  for (let s = 0; s < 4; s++) {
    const [a1, b1] = cs[s];
    const [a2, b2] = cs[(s + 1) % 4];
    for (let i = 0; i < n; i++) {
      const t0 = (len * i) / n;
      const t1 = (len * (i + 1)) / n;
      lace.push(i % 2 ? [corner(a1, b1, t0), corner(a2, b2, t1)] : [corner(a2, b2, t0), corner(a1, b1, t1)]);
    }
  }
  return { chords, lace };
}
function buildBackdrop(w, h, map) {
  const g = new THREE.Group();
  const T = 0.3;
  const lift = 0.1;
  const H = lift + h + T;
  const alu = std({ color: 0xcfd3d8, metalness: 0.85, roughness: 0.3 });
  const parts = [trussSegs(-w / 2 - T, 0, -T / 2, -w / 2 - T, H - T, -T / 2, T), trussSegs(w / 2, 0, -T / 2, w / 2, H - T, -T / 2, T), trussSegs(-w / 2 - T, H - T, -T / 2, w / 2 + T, H - T, -T / 2, T)];
  g.add(mergedRods([].concat(...parts.map((p) => p.chords)), 0.024, alu, 10));
  g.add(mergedRods([].concat(...parts.map((p) => p.lace)), 0.009, alu, 6));
  for (const x of [-w / 2 - T / 2, w / 2 + T / 2]) {
    const bp = box(T + 0.14, 0.012, T + 0.14, MAT.darkAlu);
    bp.position.set(x, 0.006, 0);
    g.add(bp);
  }
  const face = std({ map, roughness: 0.7 });
  const vin = plane(w, h, face);
  vin.position.set(0, lift + h / 2, 0.002);
  const back = plane(w, h, std({ color: 0xbfc2c6, roughness: 0.7, side: THREE.BackSide }));
  back.position.copy(vin.position);
  g.add(vin, back);
  // ยางยืดยึดไวนิลกับทรัส ทุก ๆ ~50 ซม.
  const ties = [];
  const nx = Math.max(2, Math.round(w / 0.5));
  for (let i = 0; i <= nx; i++) {
    const x = -w / 2 + (w * i) / nx;
    ties.push([V3(x, lift + h, 0.002), V3(x, H - T, 0)]);
  }
  const ny = Math.max(2, Math.round(h / 0.5));
  for (let i = 0; i <= ny; i++) {
    const y = lift + (h * i) / ny;
    ties.push([V3(-w / 2, y, 0.002), V3(-w / 2 - 0.02, y, 0)], [V3(w / 2, y, 0.002), V3(w / 2 + 0.02, y, 0)]);
  }
  g.add(mergedRods(ties, 0.003, MAT.tie, 5));
  return { group: g, face, front: 0.003, faceY: [lift, lift + h] };
}

/* บิลบอร์ด: ป้ายบนโครงกล่องลึก 40 ซม. เสาเดี่ยวกลาง ฐานปูน ทางเดินซ่อมบำรุงมีราว ไฟส่องบนแขนยื่น */
function buildBillboard(w, h, map, look) {
  const g = new THREE.Group();
  const G = C.geometry('billboard', w * 100, h * 100);
  const lift = G.lift / 100;
  const D = 0.4;
  const face = std({ map, roughness: 0.62 });
  const panel = plane(w, h, face);
  panel.position.set(0, lift + h / 2, 0.002);
  g.add(panel);
  const steel = std({ color: 0x8b9097, metalness: 0.7, roughness: 0.45 });
  const frame = box(w + 0.12, h + 0.12, D, steel);
  frame.position.set(0, lift + h / 2, -D / 2);
  g.add(frame);
  const R = Math.min(0.45, 0.18 + w * 0.02);
  const poleZ = -D - R - 0.05;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(R, R * 1.1, lift + h * 0.5, 32), steel);
  pole.position.set(0, (lift + h * 0.5) / 2, poleZ);
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(R * 2.2, R * 2.4, 0.35, 32), std({ color: 0xa8a59e, roughness: 0.95 }));
  foot.position.set(0, 0.175, poleZ);
  g.add(pole, foot);
  for (const yy of [lift + 0.3, lift + h - 0.3]) {
    const beam = box(Math.min(w * 0.7, 6), 0.18, Math.abs(poleZ) - D + 0.1, steel);
    beam.position.set(0, yy, (poleZ - D) / 2);
    g.add(beam);
  }
  // ทางเดิน + ราวกันตก
  const walk = box(w, 0.04, 0.7, std({ color: 0x5d6168, metalness: 0.6, roughness: 0.6 }));
  walk.position.set(0, lift - 0.12, 0.3);
  g.add(walk);
  const rail = [];
  const np = Math.max(2, Math.round(w / 1.5));
  for (let i = 0; i <= np; i++) {
    const x = -w / 2 + (w * i) / np;
    rail.push([V3(x, lift - 0.1, 0.63), V3(x, lift + 0.9, 0.63)]);
  }
  rail.push([V3(-w / 2, lift + 0.9, 0.63), V3(w / 2, lift + 0.9, 0.63)], [V3(-w / 2, lift + 0.45, 0.63), V3(w / 2, lift + 0.45, 0.63)]);
  g.add(mergedRods(rail, 0.022, steel, 8));
  // ไฟส่อง
  const lampMat = std({ color: 0x2b2f35, roughness: 0.4, emissive: 0xfff3d6, emissiveIntensity: 0 });
  const nl = Math.max(2, Math.round(w / 2.5));
  const arms = [];
  for (let i = 0; i < nl; i++) {
    const x = -w / 2 + (w * (i + 0.5)) / nl;
    arms.push([V3(x, lift + h + 0.05, 0), V3(x, lift + h + 0.45, 0.9)]);
    const head = box(0.35, 0.12, 0.22, lampMat);
    head.position.set(x, lift + h + 0.42, 0.95);
    head.rotation.x = 0.6;
    g.add(head);
  }
  g.add(mergedRods(arms, 0.03, steel, 8));
  const setNight = (night) => {
    lampMat.emissiveIntensity = look.lit && night ? 2.5 : 0;
  };
  return { group: g, face, front: 0.003, faceY: [lift, lift + h], setNight, selfLit: !look.lit };
}

/* ป้ายตั้งโต๊ะ: อะคริลิคใสพับ L เอนหลัง 10° เสียบกระดาษพิมพ์ ฐานลึก 7 ซม. */
function buildTableStand(w, h, map) {
  const g = new THREE.Group();
  const tilt = 0.17;
  const acr = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, roughness: 0.04, metalness: 0, clearcoat: 1, depthWrite: false });
  const base = box(w + 0.012, 0.004, 0.07, acr);
  base.position.set(0, 0.002, -0.02);
  g.add(base);
  const holder = new THREE.Group();
  holder.position.set(0, 0.004, 0);
  holder.rotation.x = -tilt;
  const face = std({ map, roughness: 0.5 });
  const print = plane(w, h, face);
  print.position.set(0, h / 2 + 0.003, 0);
  const backP = plane(w, h, std({ color: 0xf2f1ee, roughness: 0.8, side: THREE.BackSide }));
  backP.position.copy(print.position);
  const slab = box(w + 0.012, h + 0.008, 0.003, acr);
  slab.position.set(0, h / 2 + 0.004, 0.0025);
  const slab2 = slab.clone();
  slab2.position.z = -0.0025;
  holder.add(print, backP, slab, slab2);
  g.add(holder);
  const ct = Math.cos(tilt);
  const sn = Math.sin(tilt);
  const yz = (y) => [0.004 + (y + 0.003) * ct, -(y + 0.003) * sn + 0.004];
  const [y0, z0] = yz(0);
  const [y1, z1] = yz(h);
  const corners = [[-w / 2, y1, z1], [w / 2, y1, z1], [w / 2, y0, z0], [-w / 2, y0, z0]];
  return { group: g, face, front: 0.004, faceY: [0.004, 0.004 + h * ct], corners };
}

/* ปฏิทินตั้งโต๊ะ: ขาตั้งจั่ว (บอร์ดหน้าเอนหลัง + บอร์ดหลัง) · สันห่วงลวดตามขอบบน · หน้า 13 แผ่น (ปก + 12 เดือน) แขวนจากห่วง
 * ปก = ลายงาน (map) · เดือน = รูปประจำเดือน (NS.calPhotos) หรือลายปก + ตารางวันที่ (ทำตอนต้องใช้)
 * model.setPage(k): พลิกหน้าข้ามห่วงไปด้านหลัง (k = 0..12 ทศนิยมได้ = กำลังพลิก)
 * model.setExplode(e): 12 เดือนบินออกจากห่วงไปลอยเรียงเป็นผนัง 3×4 เหนือปฏิทิน (0..1 · ทีละแผ่นต่อกัน) ปกอยู่ที่เดิม */
const CAL_PAGES = 13;
function buildDeskCal(w, h, map) {
  const g = new THREE.Group();
  const a = 0.3; // บอร์ดหน้าเอนหลัง ~17°
  const yTop = (h + 0.014) * Math.cos(a);
  const Lf = yTop / Math.cos(a);
  const D = Math.max(h * 0.5, Lf * Math.sin(a) + 0.03);
  const b = Math.max(0.12, Math.atan((D - Lf * Math.sin(a)) / yTop));
  const Lb = yTop / Math.cos(b);
  const zTop = D / 2 - Lf * Math.sin(a);
  const hinge = new THREE.Vector3(0, yTop + 0.002, zTop);
  const board = std({ color: 0x23262c, roughness: 0.62, metalness: 0 });
  const paperBack = std({ color: 0xf3f2ee, roughness: 0.85, side: THREE.BackSide });
  // บอร์ดหน้า/หลัง หมุนรอบแนวห่วง
  const fb = new THREE.Group();
  fb.position.copy(hinge);
  fb.rotation.x = -a;
  const fbm = box(w + 0.006, Lf, 0.0022, board);
  fb.add(fbm);
  fbm.position.set(0, -Lf / 2, -0.0016);
  const bb = new THREE.Group();
  bb.position.copy(hinge);
  bb.rotation.x = b;
  const bbm = box(w + 0.006, Lb, 0.0022, board);
  bb.add(bbm);
  bbm.position.set(0, -Lb / 2, 0.0016);
  g.add(fb, bb);
  // หน้าปฏิทิน: ขอบบนอยู่ใต้ห่วง 4 มม.
  const pageGeo = new THREE.PlaneGeometry(w, h).translate(0, -h / 2 - 0.004, 0);
  const face = std({ map, roughness: 0.5, metalness: 0 });
  const monthMats = [];
  const pages = [];
  for (let i = 0; i < CAL_PAGES; i++) {
    const pg = new THREE.Group();
    pg.position.copy(hinge);
    const mat = i === 0 ? face : std({ color: 0xffffff, roughness: 0.55, metalness: 0 });
    if (i) monthMats.push(mat);
    const front = new THREE.Mesh(pageGeo, mat);
    const back = new THREE.Mesh(pageGeo, paperBack);
    pg.add(front, back);
    pg.userData.i = i;
    pages.push(pg);
    g.add(pg);
  }
  // ห่วงลวด (ช่องเปิดหันลงหลัง)
  const ringGeo = new THREE.TorusGeometry(0.0052, 0.00075, 6, 20, Math.PI * 2 * 0.86);
  const metal = std({ color: 0xdfe2e6, metalness: 0.85, roughness: 0.28 });
  const n = Math.max(6, Math.floor((w - 0.01) / 0.0085));
  const x0 = -((n - 1) * 0.0085) / 2;
  for (let i = 0; i < n; i++) {
    const r = new THREE.Mesh(ringGeo, metal);
    r.position.set(x0 + i * 0.0085, hinge.y - 0.0012, hinge.z);
    r.rotation.set(0, Math.PI / 2, 0);
    r.rotateZ(-0.9);
    g.add(r);
  }
  let pageK = 0;
  let explode = 0;
  const ease = (t) => t * t * (3 - 2 * t);
  function place() {
    pages.forEach((pg, i) => {
      const f = Math.max(0, Math.min(1, pageK - i));
      const th = -a + (b - 2 * Math.PI + a) * ease(f);
      pg.rotation.set(th, 0, 0);
      // ซ้อนกันบนบอร์ด: หน้าที่ยังไม่พลิก ปกอยู่นอกสุด · พลิกแล้วซ้อนออกด้านนอกบอร์ดหลัง
      const off = f < 0.5 ? 0.0006 + (CAL_PAGES - 1 - i) * 0.00035 : -0.0006 - i * 0.00035;
      pg.position.copy(hinge);
      pg.children.forEach((m) => (m.position.z = off));
      if (explode > 0 && i > 0 && f < 0.5) {
        // บินไปช่องของเดือน (ม.ค. ซ้ายบน → ธ.ค. ขวาล่าง) แถวข้างโค้งเข้าหากลาง · ระหว่างบินโค้งออกหน้า หมุนนิด ๆ
        const t = ease(Math.max(0, Math.min(1, explode * 1.5 - (i - 1) * 0.045)));
        if (t > 0) {
          const col = (i - 1) % 3;
          const row = Math.floor((i - 1) / 3);
          const side = col - 1;
          const tx = side * w * 1.1;
          const ty = yTop + h * 0.4 + (3 - row) * h * 1.12 + h + 0.004;
          const tz = hinge.z - 0.03 + Math.abs(side) * w * 0.16;
          const arc = Math.sin(Math.PI * t);
          pg.position.set(hinge.x + (tx - hinge.x) * t, hinge.y + (ty - hinge.y) * t, hinge.z + (tz - hinge.z) * t + arc * h * 0.28);
          pg.rotation.set(-a * (1 - t), -side * 0.3 * t, arc * 0.18 * (side || 1));
          pg.children.forEach((m) => (m.position.z = 0));
        }
      }
    });
  }
  place();
  // ผิวหน้ารายเดือน: ทำเมื่อต้องใช้ (พลิก/กาง/วิดีโอ/ไฟล์ 3 มิติ) — ลายปกเปลี่ยนก็ทำใหม่
  let dirty = true;
  let src = map;
  function ensureMonths() {
    if (!dirty || !NS.render || !NS.render.calPage) return;
    dirty = false;
    const year = (NS.calYear || (C.calYear && C.calYear())) || new Date().getFullYear() + 1;
    const photos = Array.isArray(NS.calPhotos) && NS.calPhotos.length ? NS.calPhotos : null;
    const W = 1024;
    const H = Math.max(400, Math.min(1400, Math.round((1024 * h) / w)));
    monthMats.forEach((m, k) => {
      const c = NS.render.calPage({ photo: photos ? photos[k % photos.length] : src && src.image, month: C.calMonth(year, k), W, H, accent: NS.calAccent || '#c0392b' });
      if (m.map) m.map.dispose();
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = ANISO;
      t.userData.mimeType = 'image/jpeg';
      m.map = t;
      m.needsUpdate = true;
    });
  }
  const bottom = yTop - (0.004 + h) * Math.cos(a);
  const top = yTop - 0.004 * Math.cos(a);
  const zf = (y) => hinge.z + ((hinge.y - y) * Math.tan(a));
  const corners = [[-w / 2, top, zf(top) + 0.005], [w / 2, top, zf(top) + 0.005], [w / 2, bottom, zf(bottom) + 0.005], [-w / 2, bottom, zf(bottom) + 0.005]];
  return {
    group: g,
    face,
    front: D / 2,
    faceY: [bottom, top],
    corners,
    calendar: true,
    pages: CAL_PAGES,
    tilt: a,
    setFace(m) {
      src = m;
      if (!(Array.isArray(NS.calPhotos) && NS.calPhotos.length)) dirty = true;
    },
    refreshMonths() {
      dirty = true;
    },
    ensureMonths,
    setPage(k) {
      pageK = Math.max(0, Math.min(CAL_PAGES - 1, k));
      if (pageK > 0) ensureMonths();
      place();
    },
    setExplode(e) {
      explode = Math.max(0, Math.min(1, e));
      if (explode > 0) ensureMonths();
      place();
    },
    dispose() {
      monthMats.forEach((m) => m.map && m.map.dispose());
    },
  };
}

// หุ่นคนสเกลแบบโมเดลสถาปัตย์ สูง 170 ซม. — ไว้เทียบขนาดป้าย
/* ---------------- คนเทียบขนาด: การ์ตูนเจ้าของร้าน (รูปวาดจริง) สูง 170 ซม. ----------------
 * เป็นป้ายรูปคนตั้งพื้นที่หันหน้าเข้ากล้องเสมอ (หมุนรอบแกนตั้งอย่างเดียว เท้าติดพื้นทุกมุม)
 * สีตรงตามรูปวาด (ไม่ผ่านการปรับแสงของฉาก) กลางคืนหรี่ลง · มีเงาตามรูปร่าง + เงานุ่มใต้เท้า */
const PERSON_H = 1.72; // รูปวัดจากปลายผมถึงพื้นรองเท้า (ศีรษะสูง 170 ซม. + ผม)
function buildPerson() {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.4, toneMapped: false, side: THREE.DoubleSide });
  mat.visible = false;
  const card = new THREE.Mesh(new THREE.PlaneGeometry(0.55, PERSON_H).translate(0, PERSON_H / 2, 0), mat);
  card.castShadow = true;
  card.receiveShadow = false;
  g.add(card);
  // หันเข้ากล้องทุกครั้งก่อนวาด (ใช้ได้กับภาพพรีวิว ภาพส่งออก และภาพย่อฉาก)
  const wp = new THREE.Vector3();
  card.onBeforeRender = (r, s, cam) => {
    wp.setFromMatrixPosition(g.matrixWorld);
    card.rotation.y = Math.atan2(cam.position.x - wp.x, cam.position.z - wp.z) - g.rotation.y;
    card.updateMatrixWorld();
  };
  // เงานุ่มใต้เท้า
  const bc = mk(128, 64);
  const bx = bc.getContext('2d');
  const grd = bx.createRadialGradient(64, 32, 0, 64, 32, 64);
  grd.addColorStop(0, 'rgba(0,0,0,0.42)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  bx.setTransform(1, 0, 0, 0.5, 0, 16);
  bx.fillStyle = grd;
  bx.fillRect(0, 0, 128, 128);
  const blobTex = new THREE.CanvasTexture(bc);
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.36), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, toneMapped: false }));
  blob.rotation.x = -Math.PI / 2;
  blob.position.set(0, 0.004, 0.02);
  g.add(blob);
  const src = (NS.BRAND && NS.BRAND.mascot) || 'brand/mascot.webp';
  new THREE.TextureLoader().load(src, (t) => {
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = ANISO;
    const w = (PERSON_H * t.image.width) / t.image.height;
    card.geometry.dispose();
    card.geometry = new THREE.PlaneGeometry(w, PERSON_H).translate(0, PERSON_H / 2, 0);
    mat.map = t;
    mat.visible = true;
    mat.needsUpdate = true;
    card.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: t, alphaTest: 0.4, side: THREE.DoubleSide });
    if (NS.requestRender) NS.requestRender();
  });
  // กลางคืน: หรี่รูปลงให้กลืนกับฉาก
  g.userData.night = (on) => {
    mat.color.setScalar(on ? 0.4 : 1);
    blob.material.opacity = on ? 0.5 : 1;
  };
  return g;
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
  // ฉากบัตร: มือจับบัตร (ภาพวาด 2 ชั้น: หลังบัตร / ทับหน้าบัตร) · บัตรซ้อนใต้บัตรบนกระดาษ — ติดไปกับตัวบัตร
  // (ใส่ใน signRoot เฉพาะตอนใช้ ไม่งั้นกรอบคำนวณมุมกล้องจะนับรวม)
  const handG = new THREE.Group();
  let handKey = '';
  const stackG = new THREE.Group();
  let stackKey = '';
  function clearGroup(gr) {
    gr.children.slice().forEach((m) => {
      gr.remove(m);
      m.geometry.dispose();
      if (m.material.map) m.material.map.dispose();
      if (m.material !== MAT.foamEdge) m.material.dispose();
    });
  }
  function buildHandPlanes(w, h) {
    clearGroup(handG);
    if (!NS.render || !NS.render.handArt) return;
    const art = NS.render.handArt(64, w * 100, h * 100);
    const cx = -w / 2 + (art.x0 + art.wcm / 2) / 100;
    const cy = -h / 2 + (art.y1 - art.hcm / 2) / 100;
    const front = (model && model.front) || 0.003;
    [[art.back, 0.0012], [art.front, front + 0.0015]].forEach(([cv, z]) => {
      const t = new THREE.CanvasTexture(cv);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = ANISO;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(art.wcm / 100, art.hcm / 100), new THREE.MeshBasicMaterial({ map: t, transparent: true, alphaTest: 0.03, toneMapped: false }));
      m.position.set(cx, cy, z);
      handG.add(m);
    });
  }
  // เงานุ่มใต้กองบัตร (วาดเป็นภาพ ได้เงาสวยทุกเครื่อง ไม่ขึ้นกับความคมของแผนที่เงา)
  let shadowTex = null;
  function softShadow() {
    if (shadowTex) return shadowTex;
    const c = mk(256, 256);
    const x = c.getContext('2d');
    x.filter = 'blur(14px)';
    x.fillStyle = 'rgba(0,0,0,0.55)';
    x.fillRect(40, 40, 176, 176);
    shadowTex = new THREE.CanvasTexture(c);
    return shadowTex;
  }
  function buildStack(w, h) {
    clearGroup(stackG);
    const pad = 0.012;
    const sm = new THREE.MeshBasicMaterial({ map: softShadow().clone(), transparent: true, depthWrite: false, opacity: 0.55, toneMapped: false });
    sm.map.needsUpdate = true;
    // ภาพเงา 256 จุด: ช่องทึบ 176 จุดตรงกลาง → ขยายให้ส่วนทึบเท่าบัตร
    const sh = new THREE.Mesh(new THREE.PlaneGeometry((w + pad) * (256 / 176), (h + pad) * (256 / 176)), sm);
    sh.position.set(0.0035, -0.005, 0.0002);
    stackG.add(sh);
    for (let i = 1; i <= 2; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.0004), MAT.foamEdge);
      b.position.set(0.0012 * i, -0.0018 * i, 0.0025 - 0.0007 * i);
      b.rotation.z = 0.004 * i;
      b.castShadow = true;
      b.receiveShadow = true;
      stackG.add(b);
    }
  }
  function smallNow() {
    return !!(C.TYPES[cur.type] && C.TYPES[cur.type].small);
  }
  let glow = null;

  let model = null;
  let curSpot = null;
  let signKey = '';
  let faceTex = null;
  let faceKey = '';
  let cur = { scene: 'studio', type: 'vinyl', w: 2, h: 1, person: true, night: false };
  let view = 'angle';
  let needs = true;
  NS.requestRender = () => {
    needs = true; // เท็กซ์เจอร์ที่โหลดตามมา (โลโก้บนเสื้อ)
  };
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
    t.userData.mimeType = 'image/jpeg'; // หน้าป้ายทึบแสง — ไฟล์ .glb ใช้ JPEG เล็กกว่า PNG หลายเท่า
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    return t;
  }

  function rebuildSign(s) {
    if (model) {
      signRoot.remove(model.group);
      if (model.dispose) model.dispose();
      disposeGroup(model.group);
    }
    const w = s.w / 100;
    const h = s.h / 100;
    const map = faceTex;
    // ชนิดงานของร้านใช้หน้าตาของชนิดมาตรฐานที่เลือกไว้
    const bt = C.baseType(s.type);
    if (bt === 'vinyl') model = buildVinyl(w, h, map);
    else if (bt === 'rollup') model = buildRollup(w, h, map);
    else if (bt === 'xstand') model = buildXstand(w, h, map);
    else if (bt === 'cnc') model = buildCnc(w, h, map, s.edge || [31, 42, 77], s.steel);
    else if (bt === 'stand') model = buildStand(w, h, map, s.steel);
    else if (bt === 'letters') model = buildLetters(w, h, map, s.edge || [31, 42, 77], C.normalizeLook(s.look));
    else if (bt === 'neon') model = buildNeon(w, h, map, s.edge || [31, 42, 77], C.normalizeLook(s.look));
    else if (bt === 'blade') model = buildBlade(w, h, map, C.normalizeLook(s.look));
    else if (bt === 'flag') model = buildFlag(w, h, map);
    else if (bt === 'backdrop') model = buildBackdrop(w, h, map);
    else if (bt === 'billboard') model = buildBillboard(w, h, map, C.normalizeLook(s.look));
    else if (bt === 'tablestand') model = buildTableStand(w, h, map);
    else if (bt === 'deskcal') model = buildDeskCal(w, h, map);
    else if (bt === 'standee') model = buildStandee(w, h, map);
    else if (bt === 'window') model = buildWindow(w, h, map, C.normalizeLook(s.look), s.shaped || '', s.edge || [255, 255, 255]);
    else if (s.shaped && ['foam', 'acrylic', 'card', 'sticker'].indexOf(bt) >= 0) model = buildShaped(bt, w, h, map, s.shaped);
    else model = buildBoard(bt, w, h, map, s.edge || [120, 120, 120]);
    model.type = bt;
    model.w = w;
    model.h = h;
    // ชื่อวัสดุหน้าป้าย: ตัวดู 3 มิติหาเจอแล้วแสดงสีตรงไฟล์งานพิมพ์
    (Array.isArray(model.face) ? model.face : [model.face]).forEach((m) => {
      if (m && m.isMaterial) m.name = 'NadponFace';
    });
    model.floor = C.geometry(s.type, s.w, s.h, s.steel).mount === 'floor';
    shadowy(model.group, true, true);
    if (bt === 'vinyl') model.group.children.slice(0, 2).forEach((m) => (m.receiveShadow = false));
    if (bt === 'sticker' || bt === 'window') model.group.traverse((m) => (m.castShadow = m.receiveShadow = false));
    model.group.traverse((m) => {
      if (m.userData.noCast) m.castShadow = false;
    });
    signRoot.add(model.group);
  }

  // ตำแหน่งป้าย/คน/ไฟ ตามฉาก
  function layout(sceneKey) {
    const env = getEnv(sceneKey);
    for (const k in envs) envs[k].group.visible = k === sceneKey;
    envKey = sceneKey;
    const g = C.geometry(cur.type, cur.w, cur.h, cur.steel);
    const w = model.w;
    const h = model.h;
    const spot = C.resolveSpot(sceneKey, cur.spot, g);
    curSpot = spot;
    if (env.configure) {
      const ds = C.doorSize(sceneKey, cur.spot, g);
      env.configure({ spot, dw: ds.w / 100, dh: ds.h / 100, open: !!cur.doorOpen, tone: cur.tone || 'pink', paper: cur.paper || 'white' });
    }
    let baseY;
    let z;
    if (model.floor) {
      baseY = env.floorY || 0; // ฉากโต๊ะ: ตั้งบนโต๊ะ
      z = env.floorZ;
      signRoot.position.set(env.floorX ? env.floorX(w) : 0, baseY, z);
    } else {
      baseY = C.mountBottom(sceneKey, g, spot) / 100;
      // ป้ายกว้างเกินช่วงเสา (3.6 ม.) ต้องยึดหน้าเสา
      z = env.spotZ ? env.spotZ(spot) : sceneKey === 'shop' && w > 3.6 ? 0.15 : env.wallZ;
      signRoot.position.set(env.spotX ? env.spotX(spot, w) : 0, baseY + h / 2, z);
    }
    const top = model.floor ? baseY + (model.faceY ? model.faceY[1] : h) : baseY + h;
    if (env.fit) env.fit(top);
    // ฉากบัตร: มือจับ (บัตรเอียงนิดหน่อยแบบถือจริง) · บัตรซ้อนบนกระดาษ
    const handOn = sceneKey === 'hand';
    signRoot.rotation.z = handOn ? -0.05 : 0;
    if (handOn) {
      const hk = w + '|' + h + '|' + model.type;
      if (hk !== handKey || !handG.children.length) {
        buildHandPlanes(w, h);
        handKey = hk;
      }
      if (!handG.parent) signRoot.add(handG);
    } else if (handG.parent) signRoot.remove(handG);
    const stackOn = sceneKey === 'paper' && model.type === 'card' && !model.shaped; // บัตรรูปทรงพิเศษ ไม่ซ้อนบัตรสี่เหลี่ยมไว้ใต้
    if (stackOn) {
      const sk2 = w + '|' + h;
      if (sk2 !== stackKey) {
        buildStack(w, h);
        stackKey = sk2;
      }
      if (!stackG.parent) signRoot.add(stackG);
    } else if (stackG.parent) signRoot.remove(stackG);
    // คนยืนเทียบ ข้างขวาของป้าย หันเข้าหาป้ายนิดหนึ่ง
    person.visible = !!cur.person;
    // ประตูเปิดอยู่ขวามือ → ให้คนยืนซ้ายแทน จะได้ไม่บังช่องประตู
    const left = !!(env.cfg && env.cfg.open && !model.floor);
    const px = left ? signRoot.position.x - w / 2 - 0.55 : signRoot.position.x + w / 2 + 0.55 + (model.type === 'xstand' ? 0.15 : 0);
    const pz = model.floor ? z + 0.05 : sceneKey === 'shop' ? 0.75 : sceneKey === 'fence' ? 0.5 : 0.45;
    person.position.set(px, 0, pz);
    person.rotation.y = left ? 0.38 : -0.38;
    person.userData.night(!!cur.night);
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
    // ฉากมือถือบัตร: คิดกรอบจากบัตร + โคนนิ้ว/ฝ่ามือบางส่วน ให้แขนเสื้อล้นขอบภาพลงไปเหมือนรูปถ่ายจริง
    const hand = !!handG.parent;
    if (hand) signRoot.remove(handG);
    const b = new THREE.Box3().setFromObject(signRoot);
    if (hand) {
      signRoot.add(handG);
      b.min.x -= 0.03;
      b.min.y -= 0.05;
    }
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
    // งานชิ้นเล็ก (บัตร): ไฟ/เงาบีบเข้าหาชิ้นงาน เงาจะได้คม
    const R = smallNow() ? Math.max(size.x, size.y, 0.12) * 0.75 + 0.2 : Math.max(size.x, size.y, 1.5) * 0.75 + 1;
    key.shadow.normalBias = smallNow() ? 0.0008 : 0.03; // ค่าเดิม 3 ซม. ทำให้เงาบัตร (ห่างกระดาษ 2.5 มม.) หายหมด
    key.shadow.bias = smallNow() ? -0.00005 : -0.0005;
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
    // ป้ายที่มีไฟของตัวเอง (ตัวอักษรไฟ นีออน ป้ายยื่นกล่องไฟ) / ปิดไฟ (บิลบอร์ดไม่เปิดไฟส่อง)
    if (model.setNight) model.setNight(night);
    const selfLit = lb || !!model.selfLit;
    const fc = new THREE.Vector3();
    signRoot.getWorldPosition(fc);
    const faceC = model.floor ? new THREE.Vector3(fc.x, fc.y + (model.faceY[0] + model.faceY[1]) / 2, fc.z) : fc.clone();
    if (night && !selfLit) {
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
    video: { az: 0, el: 0.05, tight: true }, // วิดีโอ Reels: ป้ายเต็มตา (คนยืนอาจล้นขอบภาพได้)
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
    if (v.eye != null && !smallNow()) {
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
    // มือถือบัตรเป็นภาพวาดแบน ไม่ให้หมุนไปด้านข้างมาก
    const lim = envKey === 'hand' ? 0.6 : wallish ? 1.35 : Infinity;
    controls.minAzimuthAngle = -lim;
    controls.maxAzimuthAngle = lim;
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
    if (video || promo) return; // กำลังทำวิดีโอ: วาดทีละเฟรมเอง
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

  // ระหว่างทำวิดีโอ: ขนาดภาพ/สถานะงานที่แอปส่งมา เก็บไว้ใช้ตอนทำเสร็จ (ไม่ให้ฉากเดิมหรือขนาดจอแทรกเข้ามาในคลิป)
  let pendSize = null;
  let pendState = null;
  function flushPending() {
    const sz = pendSize;
    const u = pendState;
    pendSize = pendState = null;
    if (sz) setSize(sz[0], sz[1]);
    if (u) update(u);
  }
  function setSize(w, h) {
    if (video || promo) {
      pendSize = [w, h];
      return;
    }
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
    if (promo) {
      pendState = st;
      return;
    }
    let reframe = false;
    if (st.faceKey !== faceKey) {
      const old = faceTex;
      faceTex = makeTexture(st.face);
      if (st.shaped) faceTex.userData.mimeType = 'image/png'; // งานรูปทรงพิเศษ: พื้นใส ต้องเก็บเป็น PNG
      faceKey = st.faceKey;
      if (model && model.face) {
        model.face.map = faceTex;
        if (model.face.emissiveMap) model.face.emissiveMap = faceTex;
        model.face.needsUpdate = true;
      }
      if (model && model.setFace) model.setFace(faceTex, st.edge);
      if (old) old.dispose();
    }
    const sk = [st.type, st.w, st.h, (st.edge || []).map(Math.round).join(','), st.type === 'stand' ? JSON.stringify(st.steel || {}) : st.type === 'cnc' ? ((st.steel && st.steel.color) || '') + (C.cncPosts(st.steel) ? '' : '|wall') : '', ['letters', 'neon', 'blade', 'billboard'].indexOf(C.baseType(st.type)) >= 0 ? JSON.stringify(C.normalizeLook(st.look)) : C.baseType(st.type) === 'window' ? C.normalizeLook(st.look).film : '', st.shaped || ''].join('|');
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
    if (model.corners) pts = model.corners.map(([x, y, z]) => new THREE.Vector3(x, y, z)); // หน้าป้ายไม่ได้หันเข้ากล้อง (ป้ายยื่น / ป้ายตั้งโต๊ะเอน)
    else if (model.floor) {
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
    // เส้นบอกขนาดเพิ่มของชิ้นงาน (ความสูงรวม / ความลึกฐาน)
    const extra = (model.dims || []).map((d) => {
      const a = signRoot.localToWorld(d.a.clone()).project(camera);
      const b = signRoot.localToWorld(d.b.clone()).project(camera);
      return { a: { x: a.x, y: a.y, z: a.z }, b: { x: b.x, y: b.y, z: b.z }, text: d.text, off: d.off };
    });
    return { face, head, extra, visible: face.every((p) => p.z < 1) };
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

  /* วิดีโอ (Reels แนวตั้ง): beginVideo → videoFrame(t) ทีละเฟรม (t = 0..1) → endVideo คืนกล้อง/ขนาดเดิม
   * กล้องส่ายจากซ้ายไปขวาช้า ๆ ซูมเข้านิด ๆ (ป้ายตั้งพื้นในสตูดิโอ หมุนรอบ) */
  let video = null;
  function beginVideo(w, h) {
    stopShow();
    video = { size: lastSize.slice(), pos: camera.position.clone(), keep: controls.target.clone(), aspect: camera.aspect };
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    // บัตรบนกระดาษ: เงานุ่มใต้กองบัตรใหญ่กว่าบัตรมาก ไม่เอามาคิดกรอบ (บัตรจะเล็กนิดเดียว)
    const stack = !!stackG.parent;
    if (stack) signRoot.remove(stackG);
    const a = aimFor('video', camera.aspect);
    if (stack) signRoot.add(stackG);
    video.aim = a.target;
    video.sph = new THREE.Spherical().setFromVector3(new THREE.Vector3().subVectors(a.pos, a.target));
    video.full = envKey === 'studio' && !!model && model.floor;
    video.lim = envKey === 'hand' ? 0.3 : smallNow() ? 0.38 : 0.48;
  }
  function videoFrame(t) {
    const v = video;
    if (!v) return null;
    const e = t * t * (3 - 2 * t);
    const s = v.sph.clone();
    s.theta = v.full ? v.sph.theta - 0.7 + e * 1.4 : v.sph.theta + (e - 0.5) * 2 * v.lim;
    s.phi = Math.max(0.2, v.sph.phi - 0.05 * Math.sin(Math.PI * t));
    s.radius = v.sph.radius * (1.02 - 0.16 * e);
    camera.position.setFromSpherical(s).add(v.aim);
    if (camera.position.y < 0.12) camera.position.y = 0.12;
    camera.lookAt(v.aim);
    renderer.render(scene, camera);
    return renderer.domElement;
  }
  function endVideo() {
    const v = video;
    if (!v) return;
    video = null;
    renderer.setSize(v.size[0], v.size[1], false);
    camera.aspect = v.aspect;
    camera.updateProjectionMatrix();
    camera.position.copy(v.pos);
    controls.target.copy(v.keep);
    camera.lookAt(controls.target);
    controls.update();
    flushPending();
    needs = true;
  }

  /* ---------- วิดีโอโปรโมท 5 ฉาก (แบบโฆษณาสินค้า) ----------
   * ชิ้นงานตั้งบนพื้นดำมันวาว มีเงาสะท้อน ฉากหลังมืดแสงม่วงจาง ๆ ไฟขอบด้านหลัง
   * ① ใกล้มาก ส่ายช้า ② เฉียง หมุนเข้าหาหน้า ③ หน้าตรง (ปฏิทิน: พลิกหน้า) ④ มุมข้าง (ปฏิทิน: กางทุกเดือนลอยเป็นชั้น) ⑤ ภาพรวม + ปิดท้าย
   * beginPromo(w, h) → promoFrame(วินาที) ทีละเฟรม → endPromo() คืนฉากเดิมทั้งหมด */
  const PROMO_CUTS = [0, 3, 6.2, 9.6, 12.8, 16];
  let promo = null;
  let promoKit = null;
  function promoParts() {
    if (promoKit) return promoKit;
    const bc = mk(270, 480);
    const back = new THREE.CanvasTexture(bc);
    back.colorSpace = THREE.SRGBColorSpace;
    // พื้น: กลางโปร่งนิด ๆ ให้เห็นเงาสะท้อน · ขอบจางหายไปกับฉากหลัง
    const ac = mk(256, 256);
    const ax = ac.getContext('2d');
    const ag = ax.createRadialGradient(128, 128, 0, 128, 128, 128);
    ag.addColorStop(0, '#9c9c9c');
    ag.addColorStop(0.08, '#d0d0d0');
    ag.addColorStop(0.22, '#f2f2f2');
    ag.addColorStop(0.55, '#c8c8c8');
    ag.addColorStop(1, '#000000');
    ax.fillStyle = ag;
    ax.fillRect(0, 0, 256, 256);
    const alpha = new THREE.CanvasTexture(ac);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(1, 72), new THREE.MeshStandardMaterial({ color: 0x0b0a12, roughness: 0.26, metalness: 0, transparent: true, alphaMap: alpha, envMapIntensity: 0.16 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    const rim = new THREE.DirectionalLight(0xb9a8ff, 0); // ไฟขอบด้านหลัง (ม่วง)
    const kick = new THREE.DirectionalLight(0xffa3d2, 0); // ไฟข้างขวา (ชมพู)
    const group = new THREE.Group();
    group.add(floor, rim, rim.target, kick, kick.target);
    promoKit = { back, bc, floor, rim, kick, group };
    return promoKit;
  }
  // ธีมสีฉาก: ฉากหลังไล่สีวงกลม (กลาง → ขอบ) · สีพื้น · สีไฟขอบ/ไฟข้าง · ฉากสว่าง
  const PROMO_LOOK = { bg: ['#5a4090', '#221a3e', '#07060c'], floor: '#0b0a12', rim: '#b9a8ff', kick: '#ffa3d2', light: false };
  function promoLook(P, look) {
    const L = Object.assign({}, PROMO_LOOK, look || {});
    const hex = (v, d) => (/^#[0-9a-f]{6}$/i.test(String(v)) ? v : d);
    const bx = P.bc.getContext('2d');
    const bg = bx.createRadialGradient(135, 205, 6, 135, 235, 330);
    bg.addColorStop(0, hex(L.bg[0], PROMO_LOOK.bg[0]));
    bg.addColorStop(0.42, hex(L.bg[1], PROMO_LOOK.bg[1]));
    bg.addColorStop(1, hex(L.bg[2], PROMO_LOOK.bg[2]));
    bx.fillStyle = bg;
    bx.fillRect(0, 0, 270, 480);
    P.back.needsUpdate = true;
    P.floor.material.color.set(hex(L.floor, PROMO_LOOK.floor));
    P.floor.material.roughness = L.light ? 0.2 : 0.26;
    P.rim.color.set(hex(L.rim, PROMO_LOOK.rim));
    P.kick.color.set(hex(L.kick, PROMO_LOOK.kick));
    return L;
  }
  // มุมหน้าชิ้นงานในโลก (ซ้ายบน ขวาบน ขวาล่าง ซ้ายล่าง) → จุดกลาง กว้าง สูง แกนขวา/บน/ทิศหน้า
  function faceFrame() {
    const w = model.w;
    const h = model.h;
    let pts;
    if (model.corners) pts = model.corners.map(([x, y, z]) => new THREE.Vector3(x, y, z));
    else if (model.floor) {
      const [y0, y1] = model.faceY;
      pts = [[-w / 2, y1], [w / 2, y1], [w / 2, y0], [-w / 2, y0]].map(([x, y]) => new THREE.Vector3(x, y, model.front));
    } else pts = [[-w / 2, h / 2], [w / 2, h / 2], [w / 2, -h / 2], [-w / 2, -h / 2]].map(([x, y]) => new THREE.Vector3(x, y, model.front || 0.003));
    pts = pts.map((p) => signRoot.localToWorld(p));
    const c = pts.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(0.25);
    const right = new THREE.Vector3().subVectors(pts[1], pts[0]);
    const up = new THREE.Vector3().subVectors(pts[0], pts[3]);
    const fw = right.length();
    const fh = up.length();
    right.normalize();
    up.normalize();
    const n = new THREE.Vector3().crossVectors(right, up).normalize();
    return { c, fw, fh, right, up, n, az: Math.atan2(n.x, n.z), el: Math.asin(Math.max(-1, Math.min(1, n.y))) };
  }
  function beginPromo(w, h, look) {
    if (!model) return false;
    stopShow();
    const P = promoParts();
    const p = (promo = { size: lastSize.slice(), pos: camera.position.clone(), keep: controls.target.clone(), aspect: camera.aspect, fov: camera.fov, w, h, cal: !!model.calendar });
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = 34;
    camera.updateProjectionMatrix();
    for (const k in envs) envs[k].group.visible = false;
    person.visible = false;
    ties.visible = false;
    if (glow) glow.visible = false;
    if (handG.parent) signRoot.remove(handG);
    if (stackG.parent) signRoot.remove(stackG);
    signRoot.rotation.set(0, 0, 0);
    signRoot.position.set(0, 0, 0);
    if (p.cal) {
      model.setExplode(0);
      model.setPage(0);
    }
    // ตั้งบนพื้นกลางเวที (ป้ายติดผนังก็ตั้งพื้นโชว์)
    signRoot.updateMatrixWorld(true);
    const b0 = new THREE.Box3().setFromObject(signRoot);
    p.base = new THREE.Vector3(-(b0.min.x + b0.max.x) / 2, -b0.min.y + 0.0004, -(b0.min.z + b0.max.z) / 2);
    signRoot.position.copy(p.base);
    signRoot.updateMatrixWorld(true);
    p.box = new THREE.Box3().setFromObject(signRoot);
    p.face = faceFrame();
    // ปฏิทินกางหน้า: ยกทั้งชุดขึ้นลอย ให้หน้าล่างสุดไม่จมพื้น
    if (p.cal) {
      model.setExplode(1);
      signRoot.updateMatrixWorld(true);
      const bx = new THREE.Box3().setFromObject(signRoot);
      p.lift = Math.max(0, p.box.min.y - bx.min.y);
      bx.translate(new THREE.Vector3(0, p.lift, 0));
      p.boxX = bx;
      model.setExplode(0);
    }
    const c = p.box.getCenter(new THREE.Vector3());
    const R = Math.max(0.05, p.box.getSize(new THREE.Vector3()).length() / 2);
    p.R = R;
    P.floor.scale.setScalar(Math.max(R * 30, 4));
    P.floor.position.set(c.x, 0, c.z);
    scene.add(P.group);
    p.light = !!promoLook(P, look).light;
    scene.background = P.back;
    // ฉากสว่าง: ชดเชยการปรับโทนสีของภาพ ไม่ให้ฉากหลังขาวกลายเป็นเทาหม่น
    p.bgI = scene.backgroundIntensity;
    scene.backgroundIntensity = p.light ? 1.9 : 1.45;
    scene.fog = null;
    scene.environment = roomEnv;
    renderer.toneMappingExposure = LIGHT.exposure;
    // ไฟ: หลักซ้ายบนหน้า (มีเงา) + ไฟขอบหลัง + ไฟข้าง
    const L = Math.max(R, 0.15) * (p.cal ? 1.6 : 1);
    key.position.set(c.x - L * 1.5, c.y + L * 2.6, c.z + L * 2.1);
    key.target.position.copy(c);
    key.intensity = LIGHT.key;
    const sc = key.shadow.camera;
    sc.left = -L * 1.6;
    sc.right = L * 1.6;
    sc.top = L * 1.6;
    sc.bottom = -L * 1.6;
    sc.near = 0.05;
    sc.far = L * 9;
    sc.updateProjectionMatrix();
    fill.position.set(c.x + L * 2.2, c.y + L * 0.8, c.z + L * 1.6);
    fill.target.position.copy(c);
    fill.intensity = LIGHT.fill * 0.85;
    hemi.intensity = LIGHT.hemi * (p.light ? 1 : 0.7);
    spot.intensity = 0;
    P.rim.position.set(c.x + L * 0.8, c.y + L * 2.2, c.z - L * 2.6);
    P.rim.target.position.copy(c);
    P.rim.intensity = p.light ? 0.9 : 1.5;
    P.kick.position.set(c.x + L * 2.6, c.y + L * 0.5, c.z - L * 0.4);
    P.kick.target.position.copy(c);
    P.kick.intensity = p.light ? 0.4 : 0.6;
    return true;
  }
  const smooth = (t) => {
    t = Math.max(0, Math.min(1, t));
    return t * t * (3 - 2 * t);
  };
  // ระยะกล้องที่ทำให้ครึ่งกว้าง hw / ครึ่งสูง hh พอดีช่วงภาพแนวตั้ง zone = [บน, ล่าง] (สัดส่วนของความสูงภาพ)
  function promoDist(hw, hh, zone) {
    const tV = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const tH = tV * camera.aspect;
    return Math.max(hw / (tH * 0.92), hh / (tV * (zone[1] - zone[0])));
  }
  // กล้องแต่ละช่วง: { t (จุดเล็ง), az, el, d, zone, k (หน้าปฏิทิน), ex (กาง) }
  function promoShot(i, u) {
    const p = promo;
    const F = p.face;
    const e = smooth(u);
    const c = p.box.getCenter(new THREE.Vector3());
    const R = p.R;
    const full = [0.33, 0.93]; // ช่วงภาพที่วางชิ้นงาน (บนเว้นให้ข้อความหัวเรื่อง)
    if (i === 0) {
      // ใกล้มาก: มุมซ้ายบนของหน้า (ปฏิทิน: ห่วงลวด + ภาพปก)
      const t = F.c.clone().addScaledVector(F.up, F.fh * 0.26).addScaledVector(F.right, -F.fw * 0.18);
      const d = ((F.fw * 0.36) / (Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * camera.aspect)) * (1.06 - 0.12 * e);
      return { t, az: F.az - 0.55 + 0.25 * e, el: Math.max(0.12, F.el * 0.7 + 0.24 - 0.06 * e), d, zone: [0.12, 1.02] };
    }
    if (i === 1) {
      return { t: c, az: F.az + 0.9 - 0.62 * e, el: 0.3 + 0.05 * e, d: promoDist(R * 0.95, R * 0.95, full) * (1.08 - 0.08 * e), zone: full };
    }
    if (i === 2) {
      // หน้าตรง: ปฏิทินพลิก 3 หน้า (พลิกแล้วค้างให้อ่าน)
      let k = 0;
      if (p.cal) {
        const q = Math.max(0, Math.min(2.9999, ((u - 0.06) / 0.86) * 3));
        k = Math.floor(q) + smooth((q - Math.floor(q)) / 0.42);
        if (u > 0.92) k = 3;
      }
      const zf = p.cal ? [0.4, 0.95] : full; // ปฏิทิน: เว้นที่ด้านบนให้หน้าที่กำลังพลิก
      return { t: F.c, az: F.az + 0.12 - 0.14 * e, el: F.el + 0.07, d: promoDist(F.fw * 0.56, F.fh * 0.58, zf) * (1.14 - 0.12 * e), zone: zf, k };
    }
    if (i === 3) {
      if (p.cal) {
        // 12 เดือนบินออกไปเรียงเป็นผนังเหนือปฏิทิน: กล้องถอยออกตามไปพร้อมกัน แล้วส่ายช้า ๆ
        const x = Math.max(0, Math.min(1, (u - 0.04) / 0.5));
        const m = smooth(x);
        const bx = p.box.clone().union(p.boxX);
        const cc = c.clone().lerp(bx.getCenter(new THREE.Vector3()), m);
        const sz = p.box.getSize(new THREE.Vector3()).lerp(bx.getSize(new THREE.Vector3()), m);
        const zone = [0.38, 0.97];
        return { t: cc, az: F.az - 0.34 + 0.24 * e, el: 0.14 + 0.04 * e, d: promoDist(Math.max(sz.x, sz.z) * 0.56, sz.y * 0.54, zone) * (1.04 - 0.04 * e), zone, ex: x, lift: p.lift * m };
      }
      // มุมต่ำด้านซ้าย ดูหนา/ขอบงาน
      return { t: c, az: F.az - 0.8 + 0.34 * e, el: 0.06 + 0.06 * e, d: promoDist(R * 0.9, R * 0.9, full) * (1.02 - 0.06 * e), zone: full };
    }
    // ภาพรวม + ปิดท้าย (ล่างเว้นให้แถบชื่อร้าน/เบอร์โทร) · ปฏิทินพับหน้ากลับเข้าที่
    const back = p.cal ? 1 - Math.max(0, Math.min(1, u / 0.3)) : 0;
    const zone = [0.34, 0.62];
    let t = c;
    let d = promoDist(R * 0.92, R * 0.92, zone) * (1.0 + 0.1 * e);
    if (back > 0) {
      const bx = p.box.clone().union(p.boxX);
      const sb = smooth(back);
      t = c.clone().lerp(bx.getCenter(new THREE.Vector3()), sb);
      const sz = p.box.getSize(new THREE.Vector3()).lerp(bx.getSize(new THREE.Vector3()), sb);
      d = Math.max(d, promoDist(Math.max(sz.x, sz.z) * 0.56, sz.y * 0.54, zone));
    }
    return { t, az: F.az + 0.42 - 0.3 * e, el: 0.24 - 0.04 * e, d, zone, ex: back, lift: p.cal ? p.lift * back : 0 };
  }
  // วาด 2 รอบ: ① ชิ้นงานกลับหัวใต้พื้น (เงาสะท้อน) ② ของจริง + พื้นมัน (โปร่งนิด ๆ) ทับ
  function promoRender(lift) {
    const p = promo;
    const P = promoKit;
    const y = p.base.y + (lift || 0);
    renderer.autoClear = false;
    renderer.clear();
    P.floor.visible = false;
    signRoot.scale.y = -1;
    signRoot.position.set(p.base.x, -y, p.base.z);
    renderer.render(scene, camera);
    signRoot.scale.y = 1;
    signRoot.position.set(p.base.x, y, p.base.z);
    P.floor.visible = true;
    const bg = scene.background;
    scene.background = null;
    renderer.clearDepth();
    renderer.render(scene, camera);
    scene.background = bg;
    renderer.autoClear = true;
  }
  function promoFrame(sec) {
    const p = promo;
    if (!p) return null;
    let i = 0;
    while (i < 4 && sec >= PROMO_CUTS[i + 1]) i++;
    const u = Math.max(0, Math.min(1, (sec - PROMO_CUTS[i]) / (PROMO_CUTS[i + 1] - PROMO_CUTS[i])));
    const s = promoShot(i, u);
    if (p.cal) {
      model.setExplode(s.ex || 0);
      model.setPage(s.k || 0);
    }
    const ce = Math.cos(s.el);
    camera.position.set(s.t.x + Math.sin(s.az) * ce * s.d, s.t.y + Math.sin(s.el) * s.d, s.t.z + Math.cos(s.az) * ce * s.d);
    if (camera.position.y < 0.015) camera.position.y = 0.015;
    camera.lookAt(s.t);
    // เลื่อนภาพให้ชิ้นงานอยู่กลางช่วง zone (ไม่เปลี่ยนมุมมอง)
    const mid = (s.zone[0] + s.zone[1]) / 2;
    camera.setViewOffset(p.w, p.h, 0, -(mid - 0.5) * p.h, p.w, p.h);
    camera.updateProjectionMatrix();
    promoRender(s.lift);
    return renderer.domElement;
  }
  function endPromo() {
    const p = promo;
    if (!p) return;
    promo = null;
    if (promoKit) {
      scene.remove(promoKit.group);
      promoKit.rim.intensity = 0;
      promoKit.kick.intensity = 0;
    }
    renderer.autoClear = true;
    scene.backgroundIntensity = p.bgI == null ? 1 : p.bgI;
    signRoot.scale.set(1, 1, 1);
    if (model && model.calendar) {
      model.setExplode(0);
      model.setPage(0);
    }
    camera.clearViewOffset();
    camera.fov = p.fov;
    renderer.setSize(p.size[0], p.size[1], false);
    camera.aspect = p.aspect;
    camera.updateProjectionMatrix();
    if (model) layout(cur.scene); // ฉาก คน ไฟ ฉากหลัง ตำแหน่งป้าย กลับเหมือนเดิม
    camera.position.copy(p.pos);
    controls.target.copy(p.keep);
    camera.lookAt(controls.target);
    controls.update();
    flushPending();
    needs = true;
  }

  // ภาพย่อของแต่ละฉาก (ใช้ป้ายปัจจุบัน มุมเฉียง)
  function thumb(key, out) {
    if (!model || !BUILD[key] || video || promo) return;
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
  // o.scene = ใส่ฉากที่เปิดอยู่ด้วย (หน้าร้าน ผนัง ประตู ฯลฯ + คนยืนเทียบ) ลูกค้าเห็นป้ายติดที่หน้างานเหมือนในแอป
  async function exportGLB(o) {
    if (!model) throw new Error('ยังไม่มีป้าย');
    if (model.ensureMonths) model.ensureMonths();
    if (o && o.scene && envKey && envs[envKey]) return exportSceneGLB();
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

  /* ป้าย + ฉาก: ตำแหน่งจริงในฉาก (ไม่ย้ายป้ายลงพื้น) · มุมกล้องตอนนี้เป็นมุมเริ่มต้นของตัวดู (extras npScene)
   * ผิวฉากที่ไม่โปร่งใสเก็บเป็น JPEG ไฟล์ไม่ใหญ่ · คนยืนเทียบหันเข้ากล้อง (ตัวดูหมุนตามกล้องให้เอง) */
  async function exportSceneGLB() {
    const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
    const root = new THREE.Group();
    root.name = 'NadponScene';
    const env = envs[envKey].group.clone(true);
    env.name = 'NadponEnv';
    env.visible = true;
    root.add(env);
    const sg = signRoot.clone(true);
    sg.name = 'NadponSignRoot';
    root.add(sg);
    if (ties.visible && ties.children.length) root.add(ties.clone(true));
    if (person.visible) {
      const pp = person.clone(true);
      pp.name = 'NadponPerson';
      pp.rotation.set(0, 0, 0);
      pp.children[0].name = 'NadponPersonCard';
      pp.children[0].rotation.set(0, Math.atan2(camera.position.x - person.position.x, camera.position.z - person.position.z), 0);
      root.add(pp);
    }
    const drop = [];
    root.traverse((m) => {
      if (m.isLight || m.isSprite || m.isPoints || m.isLine) drop.push(m);
      else if (m.isMesh) {
        (Array.isArray(m.material) ? m.material : [m.material]).forEach((mm) => {
          if (!mm || mm.transparent || mm.alphaTest > 0) return;
          ['map', 'roughnessMap', 'metalnessMap', 'normalMap', 'aoMap', 'bumpMap', 'emissiveMap'].forEach((k) => {
            if (mm[k] && !mm[k].userData.mimeType) mm[k].userData.mimeType = 'image/jpeg';
          });
        });
      }
    });
    drop.forEach((m) => m.parent && m.parent.remove(m));
    root.updateMatrixWorld(true);
    const b = bounds(false);
    const fc = b.getCenter(new THREE.Vector3());
    const fs = b.getSize(new THREE.Vector3());
    // ทิศหน้าป้าย (ซูมดูป้ายเข้าทางนี้): ป้ายยื่นหน้าตั้งฉากกับผนัง → ด้านที่หันหากล้อง · ป้ายอื่นหันออกจากผนัง
    const blade = model.type === 'blade';
    const nrm = blade ? [camera.position.x >= fc.x ? 1 : -1, 0, 0] : [0, 0, 1];
    root.userData.npScene = {
      pos: camera.position.toArray().map((v) => +v.toFixed(4)),
      target: controls.target.toArray().map((v) => +v.toFixed(4)),
      fov: camera.fov,
      aspect: +camera.aspect.toFixed(4),
      focus: [fc.x, fc.y, blade ? fc.z : b.max.z].map((v) => +v.toFixed(4)),
      size: [+(blade ? fs.z : fs.x).toFixed(4), +fs.y.toFixed(4)],
      normal: nrm,
      az: [controls.minAzimuthAngle, controls.maxAzimuthAngle].map((v) => (isFinite(v) ? +v.toFixed(4) : null)),
      floor: !!(model && model.floor),
      bg: envs[envKey].sky ? '#a9c9e3' : '#' + (envs[envKey].bg || new THREE.Color(0xe7e5e0)).getHexString(),
      fog: envs[envKey].fog ? [+envs[envKey].fog[1], +envs[envKey].fog[2]] : null,
    };
    return new GLTFExporter().parseAsync(root, { binary: true, onlyVisible: true, maxTextureSize: 2048 });
  }

  /* 3 มิติบนรูปหน้างาน: ตัวป้าย + รูปถ่ายเป็นฉากหลัง + คนยืนเทียบ (ถ้าเปิด)
   * หากล้องของรูปจาก 4 มุมป้ายที่ลากไว้ (C.photoCamera) แล้ววางทุกจุดของรูปบนแนวรังสีจากกล้องเดิม ไปชนผนัง (ระนาบเดียวกับป้าย)
   * → มุมเริ่มต้นเห็นเหมือนรูปเป๊ะ ขยับมุมได้นิดหน่อย ซูมเข้าไปดูป้ายใกล้ ๆ ได้ (ป้ายคมกว่ารูป)
   * ข้อมูลกล้องเก็บใน extras (npPhoto) ของไฟล์ ตัวดูใช้ตั้งมุมเริ่มต้น · o = { image, W, H, quad: [4 จุดพิกเซล], feet: {x,y}|null } */
  async function exportPhotoGLB(o) {
    if (!model) throw new Error('ยังไม่มีป้าย');
    const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
    const P = buildPhotoRoot(o);
    const glb = await new GLTFExporter().parseAsync(P.root, { binary: true, onlyVisible: true, maxTextureSize: 2048 });
    P.dispose();
    return glb;
  }
  // ฉากรูปหน้างาน (ป้าย + ฉากหลังแบบกล่อง + คน) — ใช้ทั้งไฟล์ .glb และรูป 3 มิติ Facebook
  function buildPhotoRoot(o) {
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
    const drop = [];
    root.traverse((m) => {
      if (m.isLight || m.isSprite) drop.push(m);
    });
    drop.forEach((m) => m.parent && m.parent.remove(m));
    root.updateMatrixWorld(true);
    // กรอบป้ายมองจากด้านหน้า = สี่เหลี่ยมที่ลากมุมไว้บนรูป
    const box = new THREE.Box3().setFromObject(root);
    const w = box.max.x - box.min.x;
    const h = box.max.y - box.min.y;
    const cx = (box.min.x + box.max.x) / 2;
    const cy = (box.min.y + box.max.y) / 2;
    const front = typeof model.front === 'number' ? Math.min(model.front, box.max.z) : box.max.z;
    const W = o.W;
    const H = o.H;
    const cam = C.photoCamera(o.quad, W, H, w, h);
    // โลกของป้ายแบบ OpenCV (X ขวา Y ลง Z เข้าผนัง) → three.js (Y ขึ้น Z ออกจากผนัง)
    const toThree = (P) => new THREE.Vector3(P[0] + cx, cy - P[1], front - P[2]);
    const dirThree = (v) => new THREE.Vector3(v[0], -v[1], -v[2]);
    const camPos = toThree(cam.C);
    const dist = camPos.distanceTo(new THREE.Vector3(cx, cy, front));
    const far = Math.max(dist * 4, 25);

    // ฉากหลังแบบกล่อง: ผนังหลังป้าย 1 ซม. (ไม่ซ้อนกับป้าย) + พื้นแนวนอนหน้าผนัง
    // ระดับพื้น = เท้าคนยืนเทียบ (ภาพ 2 มิติวางให้แล้ว) หรือประมาณจากป้าย (ติดผนัง: ขอบล่างสูงจากพื้น ~1.5 ม. ลบครึ่งป้าย · ตั้งพื้น: ขอบล่าง)
    const zBack = front - box.min.z + 0.01;
    let yGround;
    if (o.feet) yGround = C.photoDepthPoint(cam, o.feet.x, o.feet.y, Math.max(0.5, cam.t[2] - 0.3))[1];
    else yGround = h / 2 + (model.floor ? 0 : Math.max(0.4, Math.min(3, 1.5 - h / 2)));
    const NX = 96;
    const NY = Math.max(24, Math.round((NX * H) / W));
    const pos = new Float32Array((NX + 1) * (NY + 1) * 3);
    const uv = new Float32Array((NX + 1) * (NY + 1) * 2);
    for (let j = 0, k = 0; j <= NY; j++) {
      for (let i = 0; i <= NX; i++, k++) {
        const P = toThree(C.photoBoxPoint(cam, (i / NX) * W, (j / NY) * H, zBack, yGround, far));
        pos[k * 3] = P.x;
        pos[k * 3 + 1] = P.y;
        pos[k * 3 + 2] = P.z;
        uv[k * 2] = i / NX;
        uv[k * 2 + 1] = 1 - j / NY;
      }
    }
    const idx = [];
    for (let j = 0; j < NY; j++) {
      for (let i = 0; i < NX; i++) {
        const a = j * (NX + 1) + i;
        const b = a + 1;
        const c = a + NX + 1;
        const d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    const k = Math.min(1, 2048 / Math.max(W, H));
    const pc = mk(Math.round(W * k), Math.round(H * k));
    pc.getContext('2d').drawImage(o.image, 0, 0, pc.width, pc.height);
    const tex = new THREE.CanvasTexture(pc);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.userData.mimeType = 'image/jpeg';
    const bg = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, side: THREE.DoubleSide }));
    bg.name = 'NadponPhoto';
    root.add(bg);

    // คนยืนเทียบ: เท้าตรงจุดเดียวกับภาพ 2 มิติ ระยะห่างจากกล้องเท่าป้าย (ภาพ 2 มิติคิดขนาดคนจากป้าย) ขยับมาหน้า 30 ซม. หันเข้ากล้อง
    if (o.feet && cur.person) {
      const fp = toThree(C.photoDepthPoint(cam, o.feet.x, o.feet.y, Math.max(0.5, cam.t[2] - 0.3)));
      const pp = person.clone(true);
      pp.visible = true;
      pp.position.copy(fp);
      pp.rotation.set(0, Math.atan2(camPos.x - fp.x, camPos.z - fp.z), 0);
      pp.traverse((m) => {
        if (m.isMesh) m.rotation.y = 0;
      });
      root.add(pp);
    }

    const right = dirThree(cam.R[0]);
    const up = dirThree(cam.R[1]).negate();
    const back = dirThree(cam.R[2]).negate();
    const quat = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, back));
    root.userData.npPhoto = {
      pos: camPos.toArray().map((v) => +v.toFixed(5)),
      quat: quat.toArray().map((v) => +v.toFixed(6)),
      fov: +((2 * Math.atan(H / 2 / cam.f) * 180) / Math.PI).toFixed(4),
      aspect: +(W / H).toFixed(5),
      target: [cx, cy, front].map((v) => +v.toFixed(5)),
      size: [+w.toFixed(4), +h.toFixed(4)],
    };
    root.updateMatrixWorld(true);
    return {
      root,
      W,
      H,
      camPos,
      quat,
      fov: (2 * Math.atan(H / 2 / cam.f) * 180) / Math.PI,
      dispose() {
        tex.dispose();
        geo.dispose();
        bg.material.dispose();
      },
    };
  }

  /* รูป 3 มิติของ Facebook: รูป + แผนที่ความลึก (ขาว = ใกล้ ดำ = ไกล) ขนาดเดียวกัน
   * ฉาก 3 มิติ = มุมกล้องตอนนี้ · o.photo = ฉากรูปหน้างาน (ข้อมูลเดียวกับ exportPhotoGLB) มุมกล้องตอนถ่าย
   * ความลึกเรนเดอร์จากโมเดลจริง (ป้าย คน ผนัง พื้น) — ไม่ต้องเดา · o.long = ด้านยาวของรูป (พิกเซล) */
  function fbPhoto(o) {
    o = o || {};
    if (!model) throw new Error('ยังไม่มีป้าย');
    stopShow();
    const L = o.long || 1600;
    const keepSize = lastSize.slice();
    const keepBg = scene.background;
    const keepFog = scene.fog;
    const hidden = [];
    const hide = (m) => {
      if (m.visible) {
        m.visible = false;
        hidden.push(m);
      }
    };
    let cam3;
    let P = null;
    let w;
    let h;
    if (o.photo) {
      P = buildPhotoRoot(o.photo);
      const k = L / Math.max(P.W, P.H);
      w = Math.round(P.W * k);
      h = Math.round(P.H * k);
      cam3 = new THREE.PerspectiveCamera(P.fov, P.W / P.H, 0.05, 400);
      cam3.position.copy(P.camPos);
      cam3.quaternion.copy(P.quat);
      for (const kk in envs) hide(envs[kk].group);
      [signRoot, person, ties].forEach(hide);
      scene.add(P.root);
      scene.fog = null; // รูปถ่ายไม่ให้หมอกทับ
    } else {
      const a = camera.aspect;
      w = a >= 1 ? L : Math.round(L * a);
      h = a >= 1 ? Math.round(L / a) : L;
      cam3 = camera.clone();
      cam3.aspect = w / h;
      cam3.near = Math.max(0.02, camera.near);
      cam3.far = Math.min(camera.far, 400);
    }
    cam3.updateProjectionMatrix();
    cam3.updateMatrixWorld(true);
    renderer.setSize(w, h, false);
    renderer.render(scene, cam3);
    const color = mk(w, h);
    color.getContext('2d').drawImage(renderer.domElement, 0, 0, w, h);

    // ความลึก: วัสดุทุกชิ้นเป็น MeshDepthMaterial (เก็บค่า 32 บิตใน RGBA) — ชิ้นที่มีลายโปร่ง (คน ป้ายไดคัท) ตัดตามลาย
    const swaps = [];
    const cache = new Map();
    scene.traverseVisible((m) => {
      if (!m.isMesh) return;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      const soft = mats.every((mm) => mm && mm.transparent && !(mm.alphaTest > 0) && mm.depthWrite === false);
      if (soft) return hide(m); // เงาเบลอ แสงฟุ้ง ไม่ใช่ผิววัตถุ
      const dm = mats.map((mm) => {
        if (!cache.has(mm)) {
          const cut = mm && (mm.alphaTest > 0 || mm.transparent) && mm.map;
          cache.set(mm, new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: cut ? mm.map : null, alphaTest: cut ? Math.max(0.3, mm.alphaTest || 0) : 0, side: mm ? mm.side : THREE.FrontSide }));
        }
        return cache.get(mm);
      });
      swaps.push([m, m.material]);
      m.material = Array.isArray(m.material) ? dm : dm[0];
    });
    scene.background = null;
    scene.fog = null;
    const rt = new THREE.WebGLRenderTarget(w, h);
    const keepClear = renderer.getClearColor(new THREE.Color());
    const keepAlpha = renderer.getClearAlpha();
    renderer.setClearColor(0xffffff, 1);
    renderer.setRenderTarget(rt);
    renderer.clear();
    renderer.render(scene, cam3);
    const px = new Uint8Array(w * h * 4);
    renderer.readRenderTargetPixels(rt, 0, 0, w, h, px);
    renderer.setRenderTarget(null);
    renderer.setClearColor(keepClear, keepAlpha);
    rt.dispose();
    swaps.forEach(([m, mat]) => (m.material = mat));
    cache.forEach((dm) => dm.dispose());

    // z-buffer → ระยะจริง → ความใกล้ (1/ระยะ) ปรับช่วงตามฉาก ขาวสุด = ใกล้สุด
    const n = cam3.near;
    const f = cam3.far;
    const dist = new Float32Array(w * h);
    const vals = [];
    for (let i = 0; i < w * h; i++) {
      const d = (255 / 256) * (px[i * 4] / 255 / 16777216 + px[i * 4 + 1] / 255 / 65536 + px[i * 4 + 2] / 255 / 256 + px[i * 4 + 3] / 255);
      if (d >= 0.9999) {
        dist[i] = Infinity;
        continue;
      }
      const z = (n * f) / (f - d * (f - n));
      dist[i] = z;
      if (i % 7 === 0) vals.push(z);
    }
    vals.sort((a, b) => a - b);
    const z0 = vals.length ? vals[Math.floor(vals.length * 0.01)] : 1;
    const z1 = vals.length ? vals[Math.floor(vals.length * 0.99)] : 10;
    const depth = mk(w, h);
    const dx = depth.getContext('2d');
    const img = dx.createImageData(w, h);
    const i0 = 1 / Math.max(1e-3, z0);
    const i1 = 1 / Math.max(z0 * 1.01, z1);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const z = dist[(h - 1 - y) * w + x]; // พิกเซลจาก GPU กลับหัว
        const g = z === Infinity ? 0 : Math.max(0, Math.min(1, (1 / z - i1) / (i0 - i1)));
        const v = Math.round(g * 255);
        const j = (y * w + x) * 4;
        img.data[j] = img.data[j + 1] = img.data[j + 2] = v;
        img.data[j + 3] = 255;
      }
    }
    dx.putImageData(img, 0, 0);

    hidden.forEach((m) => (m.visible = true));
    scene.background = keepBg;
    scene.fog = keepFog;
    if (P) {
      scene.remove(P.root);
      P.dispose();
    }
    renderer.setSize(keepSize[0], keepSize[1], false);
    camera.updateProjectionMatrix();
    needs = true;
    return { color, depth };
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
    // ปฏิทินตั้งโต๊ะ: พลิกหน้า k (0..12) + กางหน้า e (0..1) · รูปประจำเดือนเปลี่ยน → ทำผิวหน้าใหม่
    calendarPose(k, e) {
      if (!model || !model.calendar) return false;
      model.setExplode(e || 0);
      model.setPage(k || 0);
      needs = true;
      return true;
    },
    refreshCalendar() {
      if (model && model.refreshMonths) model.refreshMonths();
      needs = true;
    },
    exportPhotoGLB,
    fbPhoto,
    beginVideo,
    videoFrame,
    endVideo,
    beginPromo,
    promoFrame,
    endPromo,
    promoBusy: () => !!promo,
    promoCuts: PROMO_CUTS,
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
