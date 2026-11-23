/* NATTAPRON 8-BIT — pixel scene renderer.
 * Layout follows the real shop photos / shop_pixel_floorplan: curved wooden
 * receiving counter front-left, ornate blue tile floor, central rows of big
 * gray copiers/printers, file-prep desk + sticker/stamp shelves left, frame
 * shelves + waiting bench right, back office with TV + clock, green facade
 * with the wooden nameplate, the shop dog by the counter — plus the separate
 * vinyl-workshop route map. Purely visual: this module knows nothing about
 * orders and can never change a job's status. */

import { pointAt, pathLength } from './engine.js';

export const W = 480;
export const H = 600;

/* ---------- palette (soft lavender 8-bit per the approved reference) ---------- */
const P = {
  grass: '#9ed29a', grassDot: '#8cc489',
  wallOut: '#b9ace4', wallIn: '#f4eddf', wallEdge: '#6f5fae',
  tileA: '#a9c0e8', tileB: '#9db7e4', tileDot: '#89a6dc', tileLine: '#b9cdf0',
  wood: '#c08b57', woodDark: '#8a5f3c', woodLite: '#e2bb8a',
  navy: '#312b5e', plate: '#3a3470', plateText: '#fff6e8',
  gray: '#ccd3dc', grayDark: '#8f98a6', grayMid: '#aeb7c2',
  green: '#58b368', greenDark: '#3f8d50',
  glass: '#c5e6f4', glassLite: '#e4f5fc',
  purple: '#7c6cd8', purpleDark: '#5a4bb0', pink: '#f08cc3',
  skin: '#f6c89b', hair: '#4a3650',
  yellow: '#ffd34d', red: '#e86a5e', teal: '#59c2b4',
  road: '#8d8f98', roadLite: '#a6a8b0', dash: '#f6e9b0',
  path: '#5f8fe8',
};

/* ---------- zones (workstations; coords in scene space) ---------- */
export const ZONES = {
  office: { x: 36, y: 44, w: 408, h: 72, label: 'หลังร้าน / ตรวจงาน' },
  prep: { x: 28, y: 138, w: 112, h: 84, label: 'เตรียมไฟล์' },
  sticker: { x: 28, y: 244, w: 104, h: 96, label: 'สติ๊กเกอร์ / ตรายาง' },
  photo: { x: 28, y: 362, w: 104, h: 78, label: 'ถ่ายรูป / อัดรูป' },
  copier: { x: 164, y: 142, w: 160, h: 86, label: 'ถ่ายเอกสาร' },
  printer: { x: 164, y: 254, w: 160, h: 86, label: 'ปริ้นงาน' },
  frame: { x: 352, y: 136, w: 100, h: 170, label: 'ชั้นกรอบรูป' },
  bench: { x: 352, y: 330, w: 100, h: 96, label: 'ที่นั่งรอ' },
  counter: { x: 28, y: 458, w: 184, h: 64, label: 'เคาน์เตอร์รับงาน' },
  door: { x: 236, y: 530, w: 104, h: 54, label: 'ทางเข้า' },
};

/* Where a walker stands when working at a zone. */
export const SPOTS = {
  office: [240, 102], prep: [86, 196], sticker: [82, 300], photo: [82, 404],
  copier: [244, 206], printer: [244, 318], frame: [400, 290], bench: [400, 400],
  counter: [120, 444], door: [288, 540],
};

/* Blue dotted walking loop (matches the reference: counter → copier → printer → office → counter). */
export const WALK_LOOP = [
  SPOTS.counter, [244, 444], SPOTS.copier, SPOTS.printer, [244, 120], SPOTS.office,
  [150, 120], SPOTS.prep, [86, 444], SPOTS.counter,
];

const LOOP_B = [SPOTS.frame, [400, 444], [300, 444], SPOTS.counter, [244, 420], SPOTS.photo, [86, 350], SPOTS.sticker, [244, 350], SPOTS.frame];

/* ---------- approved mockup artwork mode ----------
 * The INSIDE scene can render the hand-approved pixel illustration
 * (art/scene-inside.png, cropped from the reference the shop picked) instead
 * of the code-painted floor. Walkers/heart/taps are drawn on top; the art is
 * decoration only and the coordinates below map its zones. */
export const ART = {
  w: 838, h: 840, src: './art/scene-inside.png',
  zones: {
    office: { x: 280, y: 8, w: 330, h: 125, label: 'หลังร้าน / ตรวจงาน' },
    stamp: { x: 55, y: 120, w: 185, h: 95, label: 'ตรายาง' },
    sticker: { x: 55, y: 218, w: 185, h: 90, label: 'สติ๊กเกอร์' },
    prep: { x: 18, y: 312, w: 215, h: 160, label: 'เตรียมไฟล์' },
    printer: { x: 245, y: 150, w: 225, h: 180, label: 'ปริ้นงาน' },
    copier: { x: 245, y: 338, w: 225, h: 180, label: 'ถ่ายเอกสาร' },
    frame: { x: 560, y: 128, w: 245, h: 295, label: 'ชั้นกรอบรูป' },
    bench: { x: 600, y: 430, w: 210, h: 195, label: 'ที่นั่งรอ' },
    counter: { x: 18, y: 478, w: 365, h: 185, label: 'เคาน์เตอร์รับงาน' },
    door: { x: 255, y: 695, w: 320, h: 140, label: 'ทางเข้า' },
    govinyl: { x: 628, y: 672, w: 205, h: 110, label: 'ส่งไปบ้านทำไวนิล' },
  },
  spots: {
    counter: [330, 545], prep: [150, 430], printer: [365, 260], copier: [365, 445],
    office: [430, 100], frame: [650, 310], photo: [150, 430], sticker: [150, 265],
    stamp: [150, 175], bench: [690, 530], door: [420, 745],
  },
  path: [[392, 592], [455, 556], [455, 332], [462, 215], [442, 138]],
  dogHeart: [60, 650],
  /* ป้ายชื่อโซนที่ฝังในภาพจะมัวเมื่อย่อ/ขยายตามจอ — วาดป้ายคมทับที่ตำแหน่งเดิม
   * [ข้อความ, กลางป้าย x, y, ความกว้างขั้นต่ำให้คลุมป้ายเดิมมิด] (วัดจากภาพจริง) */
  labels: [
    ['หลังร้าน', 413, 46, 124], ['ตรายาง', 148, 156, 114], ['สติ๊กเกอร์', 151, 259, 132],
    ['เตรียมไฟล์', 130, 365, 146], ['ปริ้นงาน', 400, 279, 134], ['ถ่ายเอกสาร', 409, 405, 168],
    ['ชั้นกรอบรูป', 699, 243, 172], ['ที่นั่งรอ', 710, 504, 126],
    ['เคาน์เตอร์รับงาน', 191, 629, 228], ['ทางเข้า', 413, 819, 140],
  ],
};
export const ART_LOOP = [...ART.path, ...[...ART.path].reverse().slice(1)];

export function buildArtWalker() {
  return { path: ART_LOOP, t: 0, dwell: 900, speed: 42, color: P.purple, hair: '#4a3650', stops: [0.22, 0.48, 0.74, 0.97] };
}

/* ป้ายโซนแบบคม: วาดด้วยฟอนต์จริงบนแคนวาสความละเอียดจอ แทนตัวหนังสือที่ฝังในรูป */
function plateCover(g, text, cx, cy, minW = 0, size = 21) {
  g.font = `800 ${size}px 'Noto Sans Thai', Tahoma, sans-serif`;
  const w = Math.max(g.measureText(text).width + 30, minW);
  const h = 38; // สูงพอคลุมป้ายเดิมในภาพ (~34px) เสมอ
  const x = Math.round(cx - w / 2), y = Math.round(cy - h / 2);
  g.fillStyle = '#272148';
  if (g.roundRect) { g.beginPath(); g.roundRect(x, y, w, h, 12); g.fill(); }
  else g.fillRect(x, y, w, h);
  g.strokeStyle = 'rgba(255,255,255,.4)'; g.lineWidth = 1.5;
  if (g.roundRect) { g.beginPath(); g.roundRect(x + 1, y + 1, w - 2, h - 2, 11); g.stroke(); }
  g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, Math.round(cx), Math.round(cy + 1));
}

function sparkle(q, x, y, on) {
  if (!on) return;
  q.r(x - 1, y - 6, 3, 13, '#fff6d8'); q.r(x - 6, y - 1, 13, 3, '#fff6d8');
  q.r(x - 1, y - 1, 3, 3, '#ffd34d');
}

export function drawArtInside(g, img, state, nowMs) {
  const q = px(g);
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, 0, 0, ART.w, ART.h);
  const tick = Math.floor(nowMs / 420);
  sparkle(q, 505, 205, tick % 3 === 0);
  sparkle(q, 536, 212, tick % 3 === 1);
  sparkle(q, 700, 90, tick % 4 === 2);
  for (let i = 0; i < state.walkers.length; i++) {
    const wlk = state.walkers[i];
    const [x, y] = pointAt(wlk.path, wlk.t);
    g.save(); g.translate(x, y); g.scale(2.6, 2.6);
    person(q, 0, 0, wlk.color, wlk.hair, Math.floor(nowMs / 160));
    g.restore();
    if (i === 0 && state.walkerName) nameTag(g, state.walkerName, x, y - 82); // ป้ายชื่อ "ฟิล์ม"
  }
  if (state.dog.heartUntil > nowMs) {
    g.save(); g.translate(ART.dogHeart[0], ART.dogHeart[1]); g.scale(2, 2);
    heart(q, 0, 0); g.restore();
  }
  for (const [text, lx, ly, minW] of ART.labels) plateCover(g, text, lx, ly, minW);
  if (state.focusZone && ART.zones[state.focusZone]) {
    const z = ART.zones[state.focusZone];
    g.strokeStyle = P.yellow; g.lineWidth = 5; g.setLineDash([10, 7]);
    g.strokeRect(z.x - 4, z.y - 4, z.w + 8, z.h + 8); g.setLineDash([]);
  }
}

export function hitArtZone(x, y) {
  for (const [id, z] of Object.entries(ART.zones)) {
    if (x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h) return id;
  }
  return '';
}

/* ---------- route map (shop → vinyl workshop; schematic, NOT GPS) ---------- */
export const SHOP_RT = { x: 24, y: 416, w: 150, h: 128 };
export const VINYL_RT = { x: 292, y: 70, w: 164, h: 150 };
export const ROAD = [
  [142, 520], [142, 548], [262, 548], [262, 380], [206, 380], [206, 300],
  [330, 300], [330, 240], [376, 240], [376, 202],
];

/* ---------- walkers (visual only) ---------- */
export function buildWalkers() {
  return [
    { path: WALK_LOOP, t: 0, dwell: 0, speed: 26, color: P.purple, hair: '#4a3650', stops: [0, 0.18, 0.36, 0.58, 0.78] },
    { path: LOOP_B, t: 0.4, dwell: 0, speed: 22, color: P.pink, hair: '#6b4a33', stops: [0.1, 0.35, 0.62, 0.86] },
  ];
}

/* Advance walker positions. Returns the same array mutated IN PLACE on purpose
 * (it is private visual state owned by the page, holding only coordinates —
 * there is no job data anywhere in a walker). */
export function tickWalkers(walkers, dtMs) {
  for (const w of walkers) {
    if (w.dwell > 0) { w.dwell -= dtMs; continue; }
    const len = pathLength(w.path) || 1;
    const prev = w.t;
    w.t += (w.speed * dtMs) / 1000 / len;
    if (w.t >= 1) w.t -= 1;
    for (const s of w.stops) {
      if (prev < s && w.t >= s) { w.dwell = 1400; w.t = s; break; }
    }
  }
  return walkers;
}

/* ---------- tiny pixel helpers ---------- */
function px(g) {
  return {
    r(x, y, w, h, c) { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); },
    t(s, x, y, size = 10, color = P.plateText, align = 'center', weight = 700) {
      g.fillStyle = color; g.textAlign = align; g.textBaseline = 'middle';
      g.font = `${weight} ${size}px 'Noto Sans Thai',Tahoma,sans-serif`;
      g.fillText(s, Math.round(x), Math.round(y));
    },
  };
}

function plate(q, label, cx, y, size = 9) {
  const w = label.length * (size * 0.62) + 16;
  q.r(cx - w / 2, y, w, 16, P.plate);
  q.r(cx - w / 2 + 1, y + 1, w - 2, 14, P.navy);
  q.t(label, cx, y + 8.5, size);
}

function person(q, x, y, shirt, hair, step = 0, flip = false) {
  const lx = flip ? -1 : 1;
  q.r(x - 5, y - 18, 10, 7, hair);           // hair
  q.r(x - 4, y - 13, 8, 6, P.skin);           // face
  q.r(x - 2 * lx - 1, y - 11, 2, 2, '#2d2340');
  q.r(x - 6, y - 7, 12, 10, shirt);           // shirt
  q.r(x - 8, y - 6, 2, 6, P.skin); q.r(x + 6, y - 6, 2, 6, P.skin);
  const a = step % 2 === 0;
  q.r(x - 4, y + 3, 3, a ? 6 : 4, '#3b3260'); // legs
  q.r(x + 1, y + 3, 3, a ? 4 : 6, '#3b3260');
}

function dogSprite(q, x, y, wag = 0) {
  q.r(x - 7, y - 4, 14, 7, '#f6f1e8');        // body
  q.r(x - 7, y - 4, 5, 4, '#c09a6c');         // patch
  q.r(x + 4, y - 9, 6, 6, '#f6f1e8');         // head
  q.r(x + 5, y - 11, 2, 3, '#c09a6c'); q.r(x + 8, y - 11, 2, 3, '#c09a6c'); // ears
  q.r(x + 8, y - 7, 1, 1, '#2d2340');         // eye
  q.r(x - 9, y - 6 + (wag % 2), 3, 3, '#e8e0d2'); // tail
  q.r(x - 5, y + 3, 2, 2, '#d9d0bf'); q.r(x + 2, y + 3, 2, 2, '#d9d0bf');
}

function heart(q, x, y) {
  q.r(x - 3, y - 2, 2, 2, P.pink); q.r(x + 1, y - 2, 2, 2, P.pink);
  q.r(x - 3, y, 6, 2, P.pink); q.r(x - 2, y + 2, 4, 1, P.pink); q.r(x - 1, y + 3, 2, 1, P.pink);
}

function copierSprite(q, x, y, s = 1) {
  q.r(x, y + 34 * s, 64 * s, 8 * s, P.grayDark);
  q.r(x, y, 64 * s, 36 * s, P.gray);
  q.r(x + 4 * s, y - 6 * s, 40 * s, 8 * s, P.grayMid);
  q.r(x + 8 * s, y - 4 * s, 26 * s, 4 * s, '#f8fafc');
  q.r(x + 6 * s, y + 6 * s, 52 * s, 10 * s, P.grayMid);
  q.r(x + 48 * s, y + 8 * s, 7 * s, 4 * s, '#79d69a');
  q.r(x + 8 * s, y + 20 * s, 44 * s, 8 * s, '#f8fafc');
}

function bigPrinter(q, x, y) {
  q.r(x, y + 30, 92, 8, P.grayDark);
  q.r(x, y, 92, 32, '#dde2e9');
  q.r(x + 6, y + 6, 80, 8, '#5c6aa8');
  q.r(x + 10, y + 8, 56, 4, '#fff');
  q.r(x + 6, y + 18, 80, 6, P.grayMid);
  for (let i = 0; i < 4; i++) q.r(x + 70 + i * 4, y + 19, 2, 4, ['#ffd34d', '#f08cc3', '#6aa6ff', '#79d69a'][i]);
}

function shelfFrames(q, z) {
  q.r(z.x, z.y, z.w, z.h, P.woodDark);
  for (let r = 0; r < 4; r++) {
    q.r(z.x + 6, z.y + 8 + r * 40, z.w - 12, 32, P.woodLite);
    for (let c = 0; c < 3; c++) {
      const fx = z.x + 10 + c * 29, fy = z.y + 12 + r * 40;
      q.r(fx, fy, 24, 24, ['#caa14f', '#8a5f3c', '#d8d8e0'][(r + c) % 3]);
      q.r(fx + 4, fy + 4, 16, 16, ['#eef4ff', '#ffe9f4', '#eaffe9'][(r + c * 2) % 3]);
    }
  }
}

function tiles(q, x, y, w, h) {
  for (let ty = y; ty < y + h; ty += 24) {
    for (let tx = x; tx < x + w; tx += 24) {
      q.r(tx, ty, 24, 24, ((tx + ty) / 24) % 2 ? P.tileA : P.tileB);
      q.r(tx + 1, ty + 1, 22, 1, P.tileLine);
      q.r(tx + 9, ty + 9, 6, 6, P.tileDot);
      q.r(tx + 11, ty + 4, 2, 2, P.tileDot); q.r(tx + 11, ty + 18, 2, 2, P.tileDot);
      q.r(tx + 4, ty + 11, 2, 2, P.tileDot); q.r(tx + 18, ty + 11, 2, 2, P.tileDot);
    }
  }
}

function dottedPath(g, points, color = P.path) {
  g.save();
  g.strokeStyle = color; g.lineWidth = 3; g.setLineDash([1, 9]); g.lineCap = 'round';
  g.beginPath();
  g.moveTo(points[0][0], points[0][1]);
  for (const p of points.slice(1)) g.lineTo(p[0], p[1]);
  g.stroke();
  g.restore();
}

/* ---------- INSIDE scene ---------- */
export function drawInside(g, state, nowMs) {
  const q = px(g);
  q.r(0, 0, W, H, P.wallOut);
  q.r(12, 12, W - 24, H - 40, P.wallEdge);
  q.r(16, 16, W - 32, H - 48, P.wallIn);
  tiles(q, 24, 36, W - 48, H - 84);

  // back office
  const of = ZONES.office;
  q.r(of.x - 4, of.y - 8, of.w + 8, of.h + 8, '#e7dcc4');
  q.r(of.x, of.y, of.w, of.h, '#efe6d0');
  q.r(of.x + 150, of.y + 26, 110, 30, P.woodDark); q.r(of.x + 154, of.y + 22, 102, 28, P.wood); // desk
  q.r(of.x + 170, of.y + 10, 30, 18, '#5c6aa8'); q.r(of.x + 173, of.y + 13, 24, 12, '#cfe6ff'); // monitor
  q.r(of.x + 320, of.y + 8, 56, 32, '#2d2a3e'); q.r(of.x + 324, of.y + 12, 48, 24, '#141225'); // TV
  for (let i = 0; i < 6; i++) q.r(of.x + 326 + i * 8, of.y + 14, 6, 20, ['#e86a5e', '#ffd34d', '#79d69a', '#6aa6ff', '#f08cc3', '#d8d8e0'][i]);
  q.r(of.x + 22, of.y + 6, 30, 30, '#6b5a3f'); q.r(of.x + 25, of.y + 9, 24, 24, '#fffdf6'); // clock
  q.r(of.x + 36, of.y + 11, 2, 3, '#8a7a5c'); q.r(of.x + 36, of.y + 28, 2, 3, '#8a7a5c');
  q.r(of.x + 27, of.y + 20, 3, 2, '#8a7a5c'); q.r(of.x + 44, of.y + 20, 3, 2, '#8a7a5c');
  const mins = Math.floor(nowMs / 60000) % 720;
  const hx = of.x + 37, hy = of.y + 21;
  g.strokeStyle = '#2d2340'; g.lineWidth = 2; g.beginPath(); g.moveTo(hx, hy);
  g.lineTo(hx + Math.sin((mins / 60) * Math.PI / 6) * 7, hy - Math.cos((mins / 60) * Math.PI / 6) * 7); g.stroke();
  g.beginPath(); g.moveTo(hx, hy); g.lineTo(hx + Math.sin((mins % 60) * Math.PI / 30) * 9, hy - Math.cos((mins % 60) * Math.PI / 30) * 9); g.stroke();

  // prep desk (left)
  const pr = ZONES.prep;
  q.r(pr.x, pr.y + 18, pr.w, pr.h - 18, P.wood); q.r(pr.x + 4, pr.y + 14, pr.w - 8, 10, P.woodLite);
  q.r(pr.x + 10, pr.y + 26, 34, 22, '#5c6aa8'); q.r(pr.x + 13, pr.y + 29, 28, 16, '#cfe6ff');
  q.r(pr.x + 56, pr.y + 30, 40, 8, '#fffdf6'); q.r(pr.x + 56, pr.y + 42, 40, 8, '#ffeccf');
  q.r(pr.x + 60, pr.y + 58, 30, 14, '#efe2c8');

  // sticker / stamp shelves
  const st = ZONES.sticker;
  q.r(st.x, st.y, st.w, st.h, P.woodDark);
  for (let r = 0; r < 3; r++) {
    q.r(st.x + 5, st.y + 7 + r * 30, st.w - 10, 23, P.woodLite);
    for (let c = 0; c < 4; c++) q.r(st.x + 9 + c * 23, st.y + 11 + r * 30, 18, 15, ['#f08cc3', '#6aa6ff', '#ffd34d', '#79d69a', '#e86a5e', '#b9ace4'][(r * 4 + c) % 6]);
  }

  // photo corner
  const ph = ZONES.photo;
  q.r(ph.x, ph.y, ph.w, ph.h - 20, '#9fd4ef'); q.r(ph.x + 6, ph.y + 6, ph.w - 12, ph.h - 32, '#d7f0fb'); // backdrop
  q.r(ph.x + 36, ph.y + 44, 10, 22, '#6b5a84'); q.r(ph.x + 30, ph.y + 34, 22, 14, '#453a5e'); q.r(ph.x + 36, ph.y + 38, 8, 6, '#9fd4ef'); // camera

  // copier + printer rows (center)
  copierSprite(q, ZONES.copier.x + 6, ZONES.copier.y + 18); copierSprite(q, ZONES.copier.x + 86, ZONES.copier.y + 18);
  bigPrinter(q, ZONES.printer.x + 6, ZONES.printer.y + 16); copierSprite(q, ZONES.printer.x + 104, ZONES.printer.y + 20, 0.82);

  // frame shelf + bench (right)
  shelfFrames(q, ZONES.frame);
  const be = ZONES.bench;
  for (let i = 0; i < 2; i++) {
    q.r(be.x + 4, be.y + 8 + i * 44, be.w - 24, 12, P.wood);
    q.r(be.x + 4, be.y + 20 + i * 44, 6, 14, P.woodDark); q.r(be.x + be.w - 26, be.y + 20 + i * 44, 6, 14, P.woodDark);
  }
  q.r(be.x + be.w - 16, be.y + 40, 14, 34, '#dfe9f2'); q.r(be.x + be.w - 13, be.y + 46, 8, 12, '#9fd4ef'); // water cooler

  // walking path (visual only)
  dottedPath(g, WALK_LOOP);

  // curved receiving counter (front-left, wood + glass top like the real one)
  const co = ZONES.counter;
  q.r(co.x, co.y, co.w - 22, co.h - 14, P.wood);
  q.r(co.x + co.w - 36, co.y + 8, 22, co.h - 22, P.wood);               // curve step 1
  q.r(co.x + co.w - 22, co.y + 18, 12, co.h - 36, P.wood);              // curve step 2
  for (let i = 0; i < 8; i++) q.r(co.x + 6 + i * 20, co.y + 16, 12, co.h - 34, P.woodDark); // slats
  q.r(co.x, co.y, co.w - 22, 10, '#a7e0e4'); q.r(co.x + co.w - 36, co.y + 8, 24, 8, '#a7e0e4'); // glass top
  q.r(co.x, co.y, co.w - 22, 3, '#c8484f');                              // red trim like photos
  q.r(co.x + 120, co.y - 14, 26, 14, '#5c6aa8'); q.r(co.x + 123, co.y - 11, 20, 9, '#cfe6ff'); // POS screen
  q.r(co.x + 14, co.y - 10, 22, 12, '#3b3752'); q.r(co.x + 16, co.y - 8, 12, 6, '#9fe8c8'); // cash register
  q.r(co.x + 30, co.y - 7, 4, 2, '#ffd34d'); q.r(co.x + 30, co.y - 4, 4, 2, '#ffd34d');

  // facade: green wall + glass doors + wooden nameplate + entrance
  q.r(16, H - 72, W - 32, 44, P.green);
  q.r(16, H - 72, W - 32, 6, P.greenDark);
  const dr = ZONES.door;
  q.r(dr.x - 6, dr.y - 10, dr.w + 12, 52, '#e8f3f8');
  q.r(dr.x, dr.y - 4, 48, 44, P.glass); q.r(dr.x + 52, dr.y - 4, 48, 44, P.glass);
  q.r(dr.x + 4, dr.y, 40, 36, P.glassLite); q.r(dr.x + 56, dr.y, 40, 36, P.glassLite);
  q.r(dr.x + 46, dr.y - 4, 4, 44, '#f8fbfd');
  q.r(dr.x - 38, dr.y - 26, dr.w + 78, 20, P.woodDark);                  // nameplate
  q.r(dr.x - 35, dr.y - 24, dr.w + 72, 16, P.wood);
  q.t('นัฐภรณ์คัลเลอร์แล็ป', dr.x + dr.w / 2, dr.y - 16, 11, '#fff3d8');
  for (const bx of [40, 150, 370, 430]) { // bushes / planters
    q.r(bx, H - 52, 22, 14, '#7a4f33'); q.r(bx - 3, H - 66, 28, 16, '#4f9e5c'); q.r(bx + 3, H - 74, 16, 12, '#6fbe77');
  }
  q.t('▼ ทางเข้า', dr.x + dr.w / 2, H - 20, 10, '#2f5d3a');

  // zone labels
  plate(px(g), ZONES.office.label, of.x + 90, of.y + 50);
  plate(px(g), ZONES.prep.label, pr.x + pr.w / 2, pr.y - 4);
  plate(px(g), ZONES.sticker.label, st.x + st.w / 2 + 6, st.y - 4);
  plate(px(g), ZONES.photo.label, ph.x + ph.w / 2 + 4, ph.y - 4);
  plate(px(g), ZONES.copier.label, ZONES.copier.x + 80, ZONES.copier.y - 6);
  plate(px(g), ZONES.printer.label, ZONES.printer.x + 80, ZONES.printer.y - 4);
  plate(px(g), ZONES.frame.label, ZONES.frame.x + ZONES.frame.w / 2, ZONES.frame.y - 4);
  plate(px(g), ZONES.bench.label, be.x + be.w / 2, be.y - 4);
  plate(px(g), ZONES.counter.label, co.x + co.w / 2 - 10, co.y + co.h - 6);

  // walkers + dog
  for (let i = 0; i < state.walkers.length; i++) {
    const wlk = state.walkers[i];
    const [x, y] = pointAt(wlk.path, wlk.t);
    person(q, x, y, wlk.color, wlk.hair, Math.floor(nowMs / 160));
    if (i === 0 && state.walkerName) nameTag(g, state.walkerName, x, y - 32);
  }
  const dg = state.dog;
  dogSprite(q, dg.x, dg.y, Math.floor(nowMs / 300));
  if (dg.heartUntil > nowMs) heart(q, dg.x + 10, dg.y - 14);

  // highlighted zone marker (tap feedback)
  if (state.focusZone && ZONES[state.focusZone]) {
    const z = ZONES[state.focusZone];
    g.strokeStyle = P.yellow; g.lineWidth = 3; g.setLineDash([6, 4]);
    g.strokeRect(z.x - 3, z.y - 3, z.w + 6, z.h + 6); g.setLineDash([]);
  }
}

/* ---------- vinyl route scene ---------- */
function houseSprite(q, x, y, w, h, roof, label) {
  q.r(x + 5, y + 6, w, h, '#8c8f85');
  q.r(x, y, w, h, '#f1e8d2');
  q.r(x - 8, y - 14, w + 16, 20, roof);
  q.r(x + w / 2 - 12, y + h - 26, 24, 26, '#5d4a6e');
  for (let i = 0; i < Math.floor(w / 34); i++) q.r(x + 8 + i * 32, y + 14, 20, 16, '#bfe3f2');
  if (label) plate(q, label, x + w / 2, y - 34, 10);
}

function treeSprite(q, x, y) {
  q.r(x - 2, y, 6, 14, '#7a4f33');
  q.r(x - 10, y - 12, 22, 14, '#4f9e5c'); q.r(x - 6, y - 20, 14, 12, '#6fbe77');
}

/* มอเตอร์ไซค์ส่งงาน — ร้านจริงขับมอไซค์ไปบ้านทำไวนิล (ร้านสั่งเปลี่ยนจากรถบรรทุก) */
export function motoSprite(g, x, y, dir = 1, bounce = 0) {
  g.save();
  g.translate(Math.round(x), Math.round(y) + (bounce % 2));
  if (dir < 0) g.scale(-1, 1);
  const q = px(g);
  q.r(-16, 2, 9, 9, '#2d2a3e'); q.r(8, 2, 9, 9, '#2d2a3e');   // wheels
  q.r(-13, 5, 3, 3, bounce % 2 ? '#8f98a6' : '#c9ced6');
  q.r(11, 5, 3, 3, bounce % 2 ? '#c9ced6' : '#8f98a6');
  q.r(-12, -2, 24, 6, '#8451bf');                               // frame
  q.r(8, -8, 8, 7, '#6b3fa8');                                  // tank+bar
  q.r(14, -11, 3, 5, '#4a3650');                                // handlebar
  q.r(-19, -12, 10, 11, '#f6f1e8');                             // vinyl roll rack
  q.r(-19, -9, 10, 3, '#f08cc3');
  // คนขับ (ฟิล์ม): ขา เสื้อม่วง หมวกกันน็อกขาวคาดม่วง
  q.r(2, -6, 4, 8, '#3b3260');
  q.r(-4, -16, 11, 11, '#8451bf');
  q.r(-2, -24, 9, 8, '#f6c89b');
  q.r(-4, -28, 13, 6, '#f6f1e8'); q.r(-4, -24, 13, 2, '#8451bf'); // helmet
  g.restore();
}

/* ป้ายชื่อเล็ก ๆ ลอยเหนือหัวตัวละคร */
export function nameTag(g, text, x, y) {
  g.font = "800 15px 'Noto Sans Thai', Tahoma, sans-serif";
  const w = g.measureText(text).width + 18;
  const h = 24;
  const bx = Math.round(x - w / 2), by = Math.round(y - h);
  g.fillStyle = '#272148';
  if (g.roundRect) { g.beginPath(); g.roundRect(bx, by, w, h, 8); g.fill(); }
  else g.fillRect(bx, by, w, h);
  g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, Math.round(x), by + h / 2 + 1);
}

export function drawRoute(g, state, nowMs) {
  const q = px(g);
  q.r(0, 0, W, H, P.grass);
  for (let y = 0; y < H; y += 26) for (let x = 0; x < W; x += 26) if ((x + y) % 78 === 0) q.r(x + 8, y + 12, 8, 5, P.grassDot);

  // road
  g.strokeStyle = P.road; g.lineWidth = 34; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(ROAD[0][0], ROAD[0][1]); for (const p of ROAD.slice(1)) g.lineTo(p[0], p[1]); g.stroke();
  g.strokeStyle = P.roadLite; g.lineWidth = 26; g.stroke();
  g.strokeStyle = P.dash; g.lineWidth = 3; g.setLineDash([12, 12]); g.stroke(); g.setLineDash([]);

  for (const [tx, ty] of [[60, 180], [150, 120], [420, 320], [70, 320], [260, 160], [420, 480], [180, 560], [340, 560]]) treeSprite(q, tx, ty);

  // shop (green facade + nameplate, bottom-left)
  const sh = SHOP_RT;
  houseSprite(q, sh.x, sh.y, sh.w, sh.h - 30, P.greenDark, '');
  q.r(sh.x - 8, sh.y - 14, sh.w + 16, 20, P.green);
  q.r(sh.x + 14, sh.y - 10, sh.w - 28, 12, P.wood); q.t('ร้านนัฐภรณ์', sh.x + sh.w / 2, sh.y - 4, 10, '#fff3d8');
  plate(q, 'ร้านนัฐภรณ์คัลเลอร์แล็ป', sh.x + sh.w / 2 + 10, sh.y + sh.h - 18, 10);

  // vinyl workshop (top-right) with large-format printer + ink colors
  const vh = VINYL_RT;
  houseSprite(q, vh.x, vh.y, vh.w, vh.h - 24, '#b3574a', 'บ้านทำไวนิล');
  q.r(vh.x + 16, vh.y + 44, vh.w - 32, 34, '#3b3752');
  q.r(vh.x + 22, vh.y + 50, vh.w - 44, 12, '#5c6aa8');
  q.r(vh.x + 24, vh.y + 66, vh.w - 48, 6, '#f6f1e8');
  for (let i = 0; i < 5; i++) q.r(vh.x + 26 + i * 22, vh.y + 80, 16, 10, ['#ffd34d', '#f08cc3', '#6aa6ff', '#79d69a', '#e86a5e'][i]);
  for (let i = 0; i < 3; i++) q.r(vh.x + vh.w - 14, vh.y + 30 + i * 16, 8, 12, ['#f08cc3', '#6aa6ff', '#ffd34d'][i]); // rolls

  plate(q, 'เส้นทางส่งงานไวนิล (ภาพจำลอง)', W / 2, 18, 10);
  q.t('ไม่ใช่แผนที่ GPS · ระยะและเวลาไม่ใช่ของจริง', W / 2, 44, 9, '#2f5d3a');

  // มอไซค์ส่งงาน (ฟิล์มขับ)
  const mo = state.moto;
  if (mo && mo.visible) {
    const pts = mo.back ? [...ROAD].reverse() : ROAD;
    const [x, y] = pointAt(pts, mo.t);
    motoSprite(g, x, y - 10, mo.back ? -1 : 1, Math.floor(nowMs / 110));
    if (state.walkerName) nameTag(g, state.walkerName, x, y - 48);
  } else {
    motoSprite(g, ROAD[0][0], ROAD[0][1] - 10, 1, 0);
  }
}

export function drawScene(g, state, nowMs) {
  g.imageSmoothingEnabled = false;
  if (state.view === 'route') drawRoute(g, state, nowMs);
  else if (state.artImg && state.artImg.complete && state.artImg.naturalWidth) drawArtInside(g, state.artImg, state, nowMs);
  else drawInside(g, state, nowMs);
}

export function hitZone(x, y) {
  for (const [id, z] of Object.entries(ZONES)) {
    if (x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h) return id;
  }
  return '';
}
