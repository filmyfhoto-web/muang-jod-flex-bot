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

/* ---------- ฉากเดินมุมสูง (bird's-eye) ----------
 * ร้านสั่ง (25 พ.ย. 69): "รูปแบบเวลาเดิน ฉันขอเป็นมุมสูงได้ไหม ไม่เอามุม
 * หน้าร้านแบบนี้" — ภาพมุมหน้าร้านที่อาบไว้ (art/scene-inside.png) เลิกใช้
 * เป็นฉากเดิน แทนด้วยแผนที่มองจากด้านบนที่วาดด้วยโค้ดทั้งฉาก สไตล์เกม
 * top-down (แผนที่มุมสูง + ตัวละครหันหน้าเข้ากล้องตามขนบ JRPG — สไปรต์ทีม
 * ชุดเดิมใช้ได้เลย) ผังสถานีคงตามร้านจริง และคีย์โซนเท่าชุดเดิมทุกตัว
 * ให้วิถีการทำงาน (playWorkFor) กับปุ่มเดินไม่ต้องแก้อะไร */
export const TOP = {
  w: 480, h: 560,
  zones: {
    office: { x: 120, y: 22, w: 240, h: 86, label: 'หลังร้าน' },
    stamp: { x: 20, y: 118, w: 74, h: 74, label: 'ตรายาง' },
    sticker: { x: 20, y: 206, w: 74, h: 94, label: 'สติ๊กเกอร์' },
    prep: { x: 20, y: 314, w: 74, h: 98, label: 'เตรียมไฟล์' },
    printer: { x: 150, y: 146, w: 180, h: 86, label: 'ปริ้นงาน' },
    copier: { x: 150, y: 266, w: 180, h: 86, label: 'ถ่ายเอกสาร' },
    photo: { x: 386, y: 118, w: 74, h: 64, label: 'อัดรูป' },
    frame: { x: 386, y: 198, w: 74, h: 162, label: 'ชั้นกรอบรูป' },
    bench: { x: 364, y: 384, w: 96, h: 64, label: 'ที่นั่งรอ' },
    counter: { x: 62, y: 432, w: 224, h: 52, label: 'เคาน์เตอร์รับงาน' },
    govinyl: { x: 318, y: 474, w: 142, h: 66, label: 'ส่งไปบ้านทำไวนิล' },
  },
  // จุดยืนทำงาน (ปลายเท้า) — อยู่บนพื้นข้างเฟอร์นิเจอร์ของโซนนั้น
  spots: {
    office: [240, 132], stamp: [122, 158], sticker: [122, 256], prep: [122, 362],
    printer: [240, 254], copier: [240, 376], photo: [356, 154], frame: [356, 282],
    bench: [336, 418], counter: [176, 512],
  },
  // วงเดินสำรอง (ใช้ตอนคืนทางหลังเดินงานในโหมดที่ไม่ wander)
  path: [[140, 132], [340, 132], [340, 254], [140, 254], [140, 376], [340, 376], [240, 430], [240, 512]],
  /* คนประจำสถานี (มองจากบน: ตัวอยู่หลังเฟอร์นิเจอร์ = นั่งทำงาน):
   * หญิงหลังเคาน์เตอร์ ประมวลหลังโต๊ะหลังร้าน — มะม่วงเดินเอง ป้ายตามตัว */
  people: [['หญิง', 120, 408], ['ประมวล', 240, 16]], // หญิงขยับขวา พ้นป้ายโซนเตรียมไฟล์
  seated: { ying: [120, 444], pramual: [240, 56] },
  dogArea: { x0: 28, x1: 150, y0: 526, y1: 548 }, // สนามหญ้าหน้าร้าน ฝั่งซ้ายของทางเดิน
  door: { x: 196, y: 526, w: 88 },
};

/* ป้ายโซนแบบคม: วาดด้วยฟอนต์จริงบนแคนวาสความละเอียดจอ แทนตัวหนังสือที่ฝังในรูป */
/* ป้ายโซนแบบเรียบ (ร้านขอไม่ให้เด่น): ตัวเล็ก สีหม่น ไม่มีเส้นขอบ
 * แต่กล่องยังต้องใหญ่พอ "คลุมป้ายเบลอที่ฝังในภาพ" เสมอ (minW/minH) */
function plateCover(g, text, cx, cy, minW = 0, size = 21, minH = 0) {
  g.font = `700 ${size}px 'Noto Sans Thai', Tahoma, sans-serif`;
  const w = Math.max(g.measureText(text).width + 26, minW);
  const h = Math.max(size + 15, minH);
  const x = Math.round(cx - w / 2), y = Math.round(cy - h / 2);
  g.fillStyle = '#3a3468';
  if (g.roundRect) { g.beginPath(); g.roundRect(x, y, w, h, 10); g.fill(); }
  else g.fillRect(x, y, w, h);
  g.fillStyle = '#ddd6f2'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, Math.round(cx), Math.round(cy + 1));
}

function sparkle(q, x, y, on) {
  if (!on) return;
  q.r(x - 1, y - 6, 3, 13, '#fff6d8'); q.r(x - 6, y - 1, 13, 3, '#fff6d8');
  q.r(x - 1, y - 1, 3, 3, '#ffd34d');
}

/* วาดฉากมุมสูงทั้งฉาก — โทนและองค์ประกอบตามภาพดีไซน์ที่ร้านอนุมัติ (ร้านย้ำ
 * 25 พ.ย. 69: "รูปแบบเดิม แต่เป็นมุมสูง"): พื้นกระเบื้องน้ำเงินลายโบราณ
 * ผนังครีมแขวนกรอบรูป+นาฬิกา เฟอร์นิเจอร์มีหน้าตู้/เงาแบบเกมมุมสูง 3/4
 * หน้าร้านกันสาดเขียวลายริ้ว + ป้ายไม้ชื่อร้าน + พุ่มไม้ + ทางเท้า
 * คนประจำสถานีวาด "ก่อน" เฟอร์นิเจอร์ของตัวเอง ให้โต๊ะ/เคาน์เตอร์บังช่วงขา
 * = ท่านั่งทำงานแบบเกมยุคเก่า */
export function drawTopInside(g, state, nowMs) {
  const q = px(g);
  const T = TOP;
  const tick = Math.floor(nowMs / 420);
  const beat = Math.floor(nowMs / 260);

  // โครงอาคาร: กรอบม่วง → คิ้วม่วงเข้ม → ผนังครีม (โทนผนังภาพอนุมัติ)
  q.r(0, 0, T.w, T.h, P.wallOut);
  q.r(6, 6, T.w - 12, T.h - 12, P.wallEdge);
  q.r(10, 10, T.w - 20, T.h - 20, P.wallIn);

  // พื้นกระเบื้องน้ำเงินลายโบราณ (หัวใจของภาพอนุมัติ): สองเฉดสลับ + ยาแนว + ลายดอกประปราย
  const FLX = 18, FLY = 46, FLW = T.w - 36, FLH = 446;
  q.r(FLX, FLY, FLW, FLH, '#4a5fb4');
  for (let r = 0; r * 40 < FLH; r++) for (let c = 0; c * 40 < FLW; c++) {
    const tx = FLX + c * 40, ty = FLY + r * 40;
    const tw = Math.min(40, FLX + FLW - tx), th = Math.min(40, FLY + FLH - ty);
    if ((r + c) % 2) q.r(tx, ty, tw, th, '#44579f');
    if ((c * 2 + r) % 5 === 0 && tw === 40 && th === 40) {
      q.r(tx + 16, ty + 12, 8, 16, '#6d82cc'); q.r(tx + 12, ty + 16, 16, 8, '#6d82cc');
      q.r(tx + 18, ty + 18, 4, 4, '#93a7e4');
      q.r(tx + 7, ty + 7, 3, 3, '#5d72c2'); q.r(tx + 30, ty + 7, 3, 3, '#5d72c2');
      q.r(tx + 7, ty + 30, 3, 3, '#5d72c2'); q.r(tx + 30, ty + 30, 3, 3, '#5d72c2');
    }
  }
  g.strokeStyle = '#7589d0'; g.lineWidth = 2;
  for (let gx = FLX + 40; gx < FLX + FLW; gx += 40) { g.beginPath(); g.moveTo(gx, FLY); g.lineTo(gx, FLY + FLH); g.stroke(); }
  for (let gy = FLY + 40; gy < FLY + FLH; gy += 40) { g.beginPath(); g.moveTo(FLX, gy); g.lineTo(FLX + FLW, gy); g.stroke(); }

  // ผนังหลังร้าน: กรอบรูปแขวนเรียงราย + นาฬิกา (ผนังในภาพเดิมแขวนกรอบรูปเต็ม)
  const FRW = ['#d4a53f', '#9570de', '#e86a5e', '#59c2b4', '#d4a53f', '#8a6a43'];
  [26, 50, 74, 368, 392, 416].forEach((fx, i) => {
    q.r(fx, 15, 18, 24, FRW[i]); q.r(fx + 3, 18, 12, 18, '#bfe3f2');
    q.r(fx + 5, 24, 8, 8, i % 2 ? '#9ed29a' : '#f0a05a');
  });
  q.r(437, 17, 20, 20, P.wallEdge); q.r(439, 19, 16, 16, '#fff6e8');
  q.r(446, 22, 2, 7, P.navy); q.r(446, 27, 6, 2, P.navy);

  // เฟอร์นิเจอร์มุมสูงแบบมีมิติ: หน้าบน + หน้าตู้เตี้ย ๆ ด้านล่าง + เงาทิ้งบนพื้น
  const unit = (x, y, w, h, top, front, edge, fh = 8) => {
    q.r(x + 4, y + h + fh - 2, w, 5, 'rgba(26, 32, 84, 0.35)');
    q.r(x, y, w, h + fh, edge);
    q.r(x + 2, y + h, w - 4, fh - 2, front);
    q.r(x + 2, y + 2, w - 4, h - 4, top);
  };

  // หลังร้าน: ประมวลนั่งคอม (ตัวก่อน โต๊ะทับช่วงขา = ท่านั่ง) + ตู้ทีวีมุมขวา + บับเบิลพิมพ์งาน
  personSprite(g, T.seated.pramual[0], T.seated.pramual[1], { pal: 2, frame: 'stand', s: 1.5 });
  unit(120, 44, 240, 40, P.woodLite, P.woodDark, '#8a6a43', 12);
  for (let k = 0; k < 5; k++) q.r(130 + k * 44, 49, 28, 2, '#d3a876'); // ลายไม้
  q.r(190, 50, 44, 30, '#2f2a44'); q.r(194, 54, 36, 18, '#9fd1ff'); // จอหลัก
  q.r(198, 58, 12, 3, '#e8f4ff');
  q.r(248, 54, 34, 26, '#2f2a44'); q.r(252, 58, 26, 16, '#cdbdf0'); // จอรอง
  q.r(146, 58, 26, 18, '#f6f2ff'); q.r(148, 55, 22, 4, '#e3dced'); // กองเอกสาร
  q.r(306, 60, 20, 14, '#f6f2ff'); q.r(332, 62, 10, 11, '#e86a5e'); q.r(342, 64, 3, 6, '#b04a3e'); // แก้วกาแฟ
  unit(392, 56, 58, 34, P.gray, P.grayDark, '#8f98a6', 8); // ตู้ทีวีหลังร้าน (แบบภาพเดิม)
  q.r(398, 60, 46, 26, '#2f2a44'); q.r(402, 64, 38, 18, '#7fb8e6'); q.r(404, 66, 14, 4, '#a9d7f2');
  q.r(286, 12, 22, 11, '#272148');
  for (let k = 0; k < 3; k++) q.r(290 + k * 6, 16, 3, 3, (beat + k) % 3 ? '#cdbdf0' : '#6d5a9e');

  // ผนังซ้าย: ตรายาง / ม้วนสติ๊กเกอร์สีสด / โต๊ะเตรียมไฟล์
  unit(22, 120, 70, 58, '#f3f0fb', '#c9c4de', '#8d87ad', 10);
  for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) {
    const sx = 28 + c * 20, sy = 128 + r * 23;
    q.r(sx + 2, sy, 8, 7, r ? '#b03a2e' : '#7a4a2f');
    q.r(sx, sy + 7, 12, 5, '#4a3650');
  }
  q.r(72, 122, 16, 13, '#e86a5e'); q.r(76, 118, 8, 6, '#b04a3e'); // กล่องหมึกแดง (แบบภาพเดิม)
  unit(22, 208, 70, 78, '#f3f0fb', '#c9c4de', '#8d87ad', 10);
  const ROLLS = ['#f08bb4', '#ffd34d', '#7fb8e6', '#9570de', '#7fd49a', '#f0a05a'];
  ROLLS.forEach((cc, i) => {
    const rx = 28 + (i % 2) * 30, ry = 214 + Math.floor(i / 2) * 24;
    q.r(rx, ry + 2, 26, 16, cc); q.r(rx + 2, ry, 22, 20, cc);
    q.r(rx + 9, ry + 6, 8, 8, '#f6f2ff'); q.r(rx + 11, ry + 8, 4, 4, '#cfc8e2'); // แกนม้วน
  });
  unit(22, 316, 70, 80, P.woodLite, P.woodDark, '#8a6a43', 10);
  q.r(30, 324, 40, 28, '#2f2a44'); q.r(34, 328, 32, 20, '#9fd1ff');
  q.r(38, 336, 12, 10, '#9ed29a'); q.r(52, 332, 10, 14, '#f0a05a'); // รูปงานลูกค้าบนจอ
  q.r(32, 358, 34, 10, '#4a4466');
  for (let k = 0; k < 4; k++) q.r(35 + k * 8, 361, 5, 4, '#6b6590'); // คีย์บอร์ด
  q.r(30, 374, 26, 18, '#f6f2ff'); q.r(62, 376, 24, 14, '#f08bb4'); // กระดาษ + แฟ้มงาน

  // เกาะกลาง: เครื่องปริ้นใหญ่สองเครื่อง (ถาดข้าง ไฟสถานะกะพริบ) / เครื่องถ่ายเอกสารกระจกสแกน
  for (const px0 of [154, 246]) {
    unit(px0, 150, 80, 60, P.gray, P.grayDark, '#8f98a6', 10);
    q.r(px0 - 5, 166, 7, 26, P.grayMid); q.r(px0 + 78, 166, 7, 26, P.grayMid); // ถาดกระดาษข้าง
    q.r(px0 + 6, 156, 68, 14, '#4a4466');
    q.r(px0 + 60, 159, 9, 7, (beat % 2) ? '#7fd49a' : '#3f8d50'); // ไฟสถานะ
    for (let v = 0; v < 3; v++) q.r(px0 + 8, 176 + v * 8, 64, 4, '#b5afd0');
    q.r(px0 + 22, 196, 38, 6, '#e8e3f2'); q.r(px0 + 18, 200, 44, 10, '#f6f2ff'); // งานพิมพ์ออก
  }
  unit(154, 270, 172, 58, P.gray, P.grayDark, '#8f98a6', 10);
  q.r(162, 276, 116, 26, '#bfe3f2'); q.r(166, 278, 32, 6, '#e4f5fc'); q.r(252, 292, 20, 6, '#e4f5fc'); // กระจกสแกน
  q.r(284, 276, 36, 26, '#4a4466');
  q.r(288, 280, 7, 7, '#7fd49a'); q.r(297, 280, 7, 7, '#ffd34d'); q.r(306, 280, 7, 7, '#e86a5e');
  q.r(288, 291, 25, 8, '#9fd1ff');
  q.r(170, 308, 56, 14, '#f6f2ff'); q.r(240, 310, 46, 10, '#f6f2ff');

  // ผนังขวา: เครื่องอัดรูป / ชั้นกรอบรูปแน่น ๆ / ม้านั่งรอ + ตู้น้ำดื่มขวดฟ้า
  unit(390, 120, 66, 48, '#f3f0fb', '#c9c4de', '#8d87ad', 10);
  q.r(396, 126, 26, 18, '#2f2a44'); q.r(399, 129, 20, 12, '#f08bb4');
  q.r(428, 126, 22, 16, '#59c2b4'); q.r(431, 129, 16, 10, '#bfe3f2');
  for (let i = 0; i < 3; i++) { q.r(396 + i * 20, 150, 16, 14, '#f6f2ff'); q.r(398 + i * 20, 152, 12, 8, ['#9ed29a', '#f0a05a', '#7fb8e6'][i]); }
  unit(390, 202, 66, 146, P.wood, P.woodDark, '#8a6a43', 10);
  const FR = ['#d4a53f', '#8a6a43', '#f6f2ff', '#9570de'];
  for (let r = 0; r < 4; r++) {
    const fy = 208 + r * 35;
    for (let c = 0; c < 2; c++) {
      const fx = 394 + c * 30;
      q.r(fx, fy, 26, 28, FR[(r + c) % FR.length]);
      q.r(fx + 4, fy + 4, 18, 20, '#bfe3f2');
      q.r(fx + 7, fy + 11, 12, 9, r % 2 ? '#9ed29a' : '#f0a05a');
    }
    q.r(392, fy + 30, 62, 3, '#6b4a2e'); // คานชั้นวาง
  }
  for (const by of [388, 414]) { // ม้านั่งไม้สองตัว
    unit(368, by, 60, 14, P.wood, P.woodDark, '#8a6a43', 6);
    for (let s2 = 0; s2 < 3; s2++) q.r(372 + s2 * 19, by + 3, 14, 8, '#b98d59');
  }
  q.r(438, 434, 20, 5, 'rgba(26, 32, 84, 0.35)');
  q.r(436, 398, 20, 38, '#f6f2ff'); q.r(438, 414, 12, 7, '#2f2a44'); // ตู้น้ำดื่ม
  q.r(438, 390, 16, 12, '#7fb8e6'); q.r(441, 386, 10, 6, '#5f9fd8'); // ขวดน้ำฟ้า
  q.r(443, 426, 7, 7, '#9fd1ff'); // แก้วน้ำ

  // เคาน์เตอร์รับงาน: หญิงนั่งหลัง ท็อปกระจกโชว์ของแบบภาพเดิม (หัวใจบริการเด้งเป็นจังหวะ)
  personSprite(g, T.seated.ying[0], T.seated.ying[1], { pal: 1, frame: 'stand', s: 1.5 });
  if (Math.floor(nowMs / 1500) % 3 === 0) {
    g.save(); g.translate(152, 424 - (beat % 2) * 2); g.scale(1.4, 1.4); heart(q, 0, 0); g.restore();
  }
  unit(66, 434, 216, 34, P.wood, P.woodDark, '#8a6a43', 16);
  q.r(74, 440, 200, 22, '#bfe3f2'); q.r(80, 443, 56, 5, '#e4f5fc'); q.r(196, 452, 40, 4, '#e4f5fc'); // ท็อปกระจก
  q.r(130, 438, 30, 22, '#2f2a44'); q.r(133, 441, 24, 14, '#9fd1ff'); // จอ POS
  q.r(170, 440, 16, 18, '#f6f2ff'); q.r(173, 443, 10, 10, '#272148'); // ป้าย QR
  q.r(206, 438, 28, 8, '#f6c0dc'); q.r(206, 444, 28, 12, '#f08bb4'); // งานพิมพ์ชมพู
  q.r(244, 442, 26, 6, '#ffd34d'); q.r(244, 448, 26, 9, '#f6f2ff'); // กองงานรอรับ

  // ---- หน้าร้าน (มองจากบน): กันสาดลายริ้ว + ป้ายไม้ชื่อร้าน + ทางเท้า + พุ่มไม้ ----
  q.r(10, 492, T.w - 20, 6, P.wallEdge);
  q.r(T.door.x, 492, T.door.w, 6, '#cdbfe8'); // ช่องประตูทางเข้า
  for (let ax = 10; ax < T.w - 10; ax += 24) q.r(ax, 498, Math.min(24, T.w - 10 - ax), 20, Math.floor(ax / 24) % 2 ? '#dff0d8' : P.green);
  q.r(10, 514, T.w - 20, 4, P.greenDark); // ชายกันสาด
  q.r(10, 518, T.w - 20, 42, '#b9d6a8'); // สนามหน้าร้าน
  for (let gx2 = 20; gx2 < T.w - 20; gx2 += 26) q.r(gx2, 526 + (gx2 % 78) / 6, 3, 3, P.grassDot);
  for (const [fx2, fy2] of [[44, 530], [98, 546], [152, 534]]) { // ดอกไม้เล็กบนสนาม
    q.r(fx2, fy2, 4, 4, P.pink); q.r(fx2 + 1, fy2 + 1, 2, 2, P.yellow);
  }
  q.r(T.door.x - 10, 518, T.door.w + 20, 42, '#cfcad8'); // ทางเดินเข้าร้าน
  for (let wy = 530; wy < 560; wy += 12) q.r(T.door.x - 10, wy, T.door.w + 20, 2, '#bdb7cc');
  for (const bx of [T.door.x - 36, T.door.x + T.door.w + 14]) { // พุ่มไม้ในกระถาง
    q.r(bx, 544, 22, 9, '#9a6b3f'); q.r(bx + 2, 547, 18, 4, '#7a5430');
    q.r(bx + 1, 527, 20, 18, '#3f9d5a'); q.r(bx + 4, 523, 14, 8, '#4fae68');
    q.r(bx + 5, 532, 4, 4, '#2f7d46'); q.r(bx + 13, 537, 4, 4, '#2f7d46');
  }
  g.font = "700 15px 'Noto Sans Thai', Tahoma, sans-serif"; // ป้ายไม้ชื่อร้านกลางกันสาด (แบบภาพอนุมัติ)
  const signW = g.measureText('นัฐภรณ์คัลเลอร์แล็บ').width + 34;
  q.r(240 - signW / 2 - 3, 494, signW + 6, 32, '#5f402a');
  q.r(240 - signW / 2, 497, signW, 26, '#8a5f3c');
  q.r(240 - signW / 2 + 4, 500, signW - 8, 3, '#a87c4f');
  q.t('นัฐภรณ์คัลเลอร์แล็บ', 240, 511, 15, '#ffe9c4');
  plateCover(g, '↑ ทางเข้า', 240, 547, 0, 12);

  // การ์ดส่งบ้านไวนิล (แตะแล้วไปหน้าเส้นทาง) — หน้าตาการ์ดแบบภาพเดิม: พื้นลาเวนเดอร์ขอบม่วง
  const gv = T.zones.govinyl;
  q.r(gv.x + 4, gv.y + gv.h, gv.w - 4, 6, 'rgba(26, 32, 84, 0.3)');
  q.r(gv.x, gv.y, gv.w, gv.h, '#7b57c8');
  q.r(gv.x + 4, gv.y + 4, gv.w - 8, gv.h - 8, '#efe6fb');
  g.save(); g.translate(gv.x + 36, gv.y + 34); g.scale(0.9, 0.9); motoSprite(g, 0, 0, 1, tick % 2); g.restore();
  q.t('ส่งไปบ้าน', gv.x + 97, gv.y + 24, 13, '#5a3fa8');
  q.t('ทำไวนิล', gv.x + 97, gv.y + 42, 13, '#5a3fa8');

  // น้องหมามะม่วง (เดินเองแถวหน้าร้าน ป้ายชื่อตามตัว)
  const dg = state.dog;
  dogSprite(q, dg.x, dg.y, Math.floor(nowMs / 300));
  if (dg.heartUntil > nowMs) heart(q, dg.x + 10, dg.y - 14);
  nameTag(g, 'มะม่วง', dg.x, dg.y - 24);

  // ทีมเดินทำงาน (สไปรต์ชุดเดียวกับเดิม) — ป้ายชื่อเก็บไว้วาดท้ายสุด
  const crewTags = []; // ป้ายชื่อทีมวาดท้ายสุด ให้ลอยเหนือป้ายโซน (ไม่โดนทับ)
  for (let i = 0; i < state.walkers.length; i++) {
    const wlk = state.walkers[i];
    const [x, y] = pointAt(wlk.path, wlk.t);
    const frame = walkFrame(wlk, nowMs);
    if (frame !== 'work') wlk.flip = walkFlip(wlk); // ตอนทำงานหันค้างไว้ท่าเดิม
    personSprite(g, x, y, { pal: wlk.pal ?? i, frame, flip: wlk.flip, s: 1.5 });
    if (frame === 'work' && tick % 3 === 0) sparkle(q, x + (wlk.flip ? -14 : 14), y - 20, true);
    const tag = wlk.name || (i === 0 ? state.walkerName : '');
    if (tag) crewTags.push([tag, x, y - 42]);
  }

  // ป้ายโซนเล็กไม่เด่น (กติกาเดิมของร้าน) ใต้เฟอร์นิเจอร์แต่ละจุด
  // — ยกเว้นเคาน์เตอร์: ป้ายวางบนหน้าเคาน์เตอร์แบบภาพอนุมัติ (ใต้โซนคือป้ายไม้ชื่อร้าน)
  for (const [id, z] of Object.entries(T.zones)) {
    if (id === 'govinyl') continue;
    const ly = id === 'counter' ? z.y + 42 : z.y + z.h + 11;
    plateCover(g, z.label, z.x + z.w / 2, ly, 0, 12);
  }
  for (const [who, px_, py_] of TOP.people) nameTag(g, who, px_, py_); // คนประจำสถานี
  for (const [tag, tx, ty] of crewTags) nameTag(g, tag, tx, ty); // ชื่อทีมเดินลอยบนสุด

  if (state.focusZone && T.zones[state.focusZone]) {
    const z = T.zones[state.focusZone];
    g.strokeStyle = P.yellow; g.lineWidth = 4; g.setLineDash([8, 6]);
    g.strokeRect(z.x - 3, z.y - 3, z.w + 6, z.h + 6); g.setLineDash([]);
  }
}

export function hitTopZone(x, y) {
  for (const [id, z] of Object.entries(TOP.zones)) {
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
    for (const s of w.stops || []) { // ตัวเดินโหมด wander ไม่มี stops — ห้ามล้มทั้งเฟรม
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

/* ---------- ตัวละครทีมงาน (สไตล์เดียวกับคนในภาพฉาก) ----------
 *
 * ร้านบอก (25 พ.ย. 69): "เอาตัวละครฟิล์มให้มันเหมือนคนอื่นได้ไหม มันตลก" —
 * ตัวเดินแบบเก่าเป็นสี่เหลี่ยมเจ็ดก้อน ยืนข้างตัวละครในภาพแล้วโดด ตัวใหม่
 * วาดจากแผนที่พิกเซล 14×20 ช่อง: ผมมีทรง ตาสองข้าง เสื้อโปโลม่วงมีปกเข้ม
 * ป้ายชื่อเล็กบนอก กางเกงเข้ม รองเท้า — โทนเดียวกับยูนิฟอร์มทีมในภาพ
 * มีสามท่า: เดินสลับขา (a/b) และยืนทำงาน (work ถือกระดาษ) หันซ้ายขวาได้
 */
const SPRITE_W = 14;
const SPRITE_ROWS_TOP = [
  '.....HHHH.....',
  '....HHHHHH....',
  '....HHHHHH....',
  '....HSSSSH....',
  '....SESSES....',
  '....SSSSSS....',
  '.....SSSS.....',
  '.....DDDD.....',
  '...DDPPPPDD...',
  '...PPPPPPPP...',
  '...PPPWWPPP...',
  '...PPPPPPPP...',
  '...A.PPPP.A...',
];
const LEGS = {
  stand: ['....NNNNNN....', '....NNNNNN....', '....NN..NN....', '....NN..NN....', '....NN..NN....', '....BB..BB....', '..............'],
  a: ['....NNNNNN....', '....NNNNNN....', '...NNN..NN....', '...NN....NN...', '...NN....NN...', '..BBB....NN...', '.........BB...'],
  b: ['....NNNNNN....', '....NNNNNN....', '....NN..NNN...', '...NN....NN...', '...NN....NN...', '...NN....BBB..', '...BB.........'],
};
// ท่าทำงาน: ขายืนนิ่ง มือสองข้างถือกระดาษไว้ข้างหน้า
const WORK_TOP = SPRITE_ROWS_TOP.slice(0, 11).concat(['...PAWWWWAP...', '....AWWWWA....']);
const SPRITE_FRAMES = {
  a: SPRITE_ROWS_TOP.concat(LEGS.a),
  b: SPRITE_ROWS_TOP.concat(LEGS.b),
  stand: SPRITE_ROWS_TOP.concat(LEGS.stand),
  work: WORK_TOP.concat(LEGS.stand),
};
const SPRITE_H = SPRITE_FRAMES.a.length;
function compileFrame(rows) {
  const cells = [];
  rows.forEach((row, y) => { [...row].forEach((ch, x) => { if (ch !== '.') cells.push([x, y, ch]); }); });
  return cells;
}
const FRAME_CELLS = Object.fromEntries(Object.entries(SPRITE_FRAMES).map(([k, rows]) => [k, compileFrame(rows)]));
// ชุดสีทีมงาน — เสื้อม่วงเฉดใกล้กันแบบยูนิฟอร์ม ผมต่างกันพอจำคนออก
export const CREW_PALS = [
  { shirt: '#7b57c8', trim: '#5b3fa8', hair: '#3a2b33' },
  { shirt: '#8a63d6', trim: '#6a48b8', hair: '#6b4a33' },
  { shirt: '#6f4fbf', trim: '#54379e', hair: '#2e2a3c' },
  { shirt: '#9570de', trim: '#7452c2', hair: '#54351f' },
];
export function personSprite(g, x, y, { pal = 0, frame = 'stand', flip = false, s = 1 } = {}) {
  const p = CREW_PALS[((pal % CREW_PALS.length) + CREW_PALS.length) % CREW_PALS.length];
  const C = { H: p.hair, S: P.skin, A: P.skin, E: '#2d2340', P: p.shirt, D: p.trim, N: '#35314e', B: '#262038', W: '#f6f1ff' };
  const cell = 1.35 * s;
  const left = x - (SPRITE_W * cell) / 2;
  const top = y + 8 * s - SPRITE_H * cell; // เท้าแตะพื้นที่ y+8s (ใกล้ระยะตัวเดิม)
  for (const [cx, cy, ch] of FRAME_CELLS[frame] || FRAME_CELLS.stand) {
    g.fillStyle = C[ch];
    g.fillRect(left + (flip ? SPRITE_W - 1 - cx : cx) * cell, top + cy * cell, cell + 0.4, cell + 0.4);
  }
}
// กำลังเดินไปทางไหน (ไว้หันหน้าตามทาง) / เฟรมของตัวเดินตอนนี้
export function walkFlip(wlk) {
  const [x1] = pointAt(wlk.path, Math.max(0, wlk.t - 0.02));
  const [x2] = pointAt(wlk.path, Math.min(1, wlk.t + 0.02));
  return x2 < x1 - 0.5;
}
export function walkFrame(wlk, nowMs) {
  if (wlk.dwell > 0) return 'work'; // ถึงจุดงานแล้ว — ยืนถือใบงานทำงาน
  return Math.floor(nowMs / 150) % 2 ? 'a' : 'b';
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
    const frame = walkFrame(wlk, nowMs);
    if (frame !== 'work') wlk.flip = walkFlip(wlk);
    personSprite(g, x, y, { pal: wlk.pal ?? i, frame, flip: wlk.flip, s: 1 });
    const tag = wlk.name || (i === 0 ? state.walkerName : '');
    if (tag) nameTag(g, tag, x, y - 32);
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

/* ---------- ห้องทำไวนิล (ในบ้าน) — ผังอิงรูปถ่ายห้องจริงของร้าน ----------
 * เครื่องพิมพ์หน้ากว้าง Epson + จอ RIP, โต๊ะตัดเสื่อเขียว, เครื่องตอกตาไก่
 * บนรถเข็นสแตนเลส, ม้วนไวนิล, โต๊ะคอมสองจอ, ชั้นวาง+พัดลม, พื้นไม้ลามิเนต,
 * ป้ายโรงเรียนธีมอวกาศที่พิมพ์เสร็จวางบนพื้น, ประตูกระจก (มอไซค์จอดหน้าบ้าน) */
export const ROOM = {
  zones: {
    printer: { x: 248, y: 102, w: 200, h: 112, label: 'เครื่องพิมพ์ไวนิล' },
    rolls: { x: 206, y: 108, w: 40, h: 100, label: 'ม้วนไวนิล' },
    cut: { x: 25, y: 225, w: 212, h: 138, label: 'โต๊ะตัดงาน' },
    eyelet: { x: 325, y: 328, w: 132, h: 118, label: 'ตอกตาไก่' },
    desk: { x: 15, y: 375, w: 128, h: 108, label: 'โต๊ะคอม' },
    shelf: { x: 15, y: 142, w: 112, h: 80, label: 'ชั้นวัสดุ' },
    banner: { x: 145, y: 428, w: 192, h: 138, label: 'งานพิมพ์เสร็จ รอส่ง' },
    door: { x: 145, y: 552, w: 192, h: 46, label: 'ทางเข้า · มอไซค์จอดอยู่' },
  },
  labels: [
    ['เครื่องพิมพ์ไวนิล', 345, 112, 0], ['โต๊ะตัดงาน', 130, 237, 0],
    ['ตอกตาไก่', 390, 340, 0], ['โต๊ะคอม', 78, 388, 0], ['ทางเข้า', 240, 592, 0],
  ],
  spots: { printer: [345, 230], rolls: [228, 218], cut: [130, 372], eyelet: [392, 452], desk: [92, 492], door: [240, 555] },
  path: [[345, 230], [240, 300], [130, 372], [240, 425], [392, 452], [345, 230]],
};

export function buildRoomWalker() {
  return { path: ROOM.path, t: 0, dwell: 1200, speed: 30, color: P.purple, hair: '#4a3650', stops: [0.18, 0.42, 0.66, 0.9] };
}

export function hitRoomZone(x, y) {
  for (const [id, z] of Object.entries(ROOM.zones)) {
    if (x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h) return id;
  }
  return '';
}

export function drawVinylRoom(g, state, nowMs) {
  const q = px(g);
  // ผนังครีม + คิ้วเทาเข้มช่วงล่าง (ตามรูปจริง) + ไฟเพดาน
  q.r(0, 0, W, 132, '#f1e8d4');
  q.r(0, 96, W, 36, '#5a5f6b');
  q.r(60, 4, 150, 6, '#fffbe8'); q.r(280, 4, 150, 6, '#fffbe8');
  // หน้าต่างกลางคืน + ม่านขาว + แอร์ (เว้นช่องผนังให้เครื่องพิมพ์แยกชั้นชัด)
  q.r(268, 12, 162, 72, '#3a4668'); q.r(272, 16, 154, 64, '#1a2238');
  q.r(268, 12, 14, 72, '#f4f1ea'); q.r(416, 12, 14, 72, '#f4f1ea');
  q.r(292, 0, 86, 18, '#f6f4ee'); q.r(296, 13, 78, 3, '#d7d4cc'); // แอร์
  q.r(298, 4, 10, 6, '#9fd48f');
  // รูปครอบครัวบนผนัง (ตามบ้านจริง)
  q.r(140, 24, 44, 58, '#ffffff'); q.r(144, 28, 36, 50, '#cfd8e4');
  q.r(150, 44, 10, 22, '#8451bf'); q.r(164, 44, 10, 22, '#c0392b');
  q.r(152, 36, 7, 8, '#f6c89b'); q.r(166, 36, 7, 8, '#f6c89b');
  // พื้นไม้ลามิเนต
  for (let y = 132; y < H; y += 26) {
    q.r(0, y, W, 26, ((y / 26) | 0) % 2 ? '#c9a06a' : '#bf9661');
    q.r(0, y, W, 2, '#a97f4e');
    for (let x = ((y / 26) | 0) % 2 ? 40 : 110; x < W; x += 150) q.r(x, y + 2, 2, 24, '#a97f4e');
  }
  // ชั้นวางดำ + พัดลมตั้งพื้น (ฝั่งซ้าย)
  const sh = ROOM.zones.shelf;
  q.r(sh.x, sh.y, sh.w, sh.h, '#2d2a30');
  for (let r = 0; r < 3; r++) {
    q.r(sh.x + 5, sh.y + 7 + r * 25, sh.w - 10, 18, '#3c3844');
    for (let c = 0; c < 3; c++) q.r(sh.x + 9 + c * 34, sh.y + 10 + r * 25, 28, 12, ['#6b5d4a', '#4a6b5d', '#5d4a6b'][(r + c) % 3]);
  }
  q.r(150, 160, 6, 56, '#e8e6e0'); q.r(141, 142, 24, 24, '#f4f2ec'); q.r(146, 147, 14, 14, '#c9c6be'); // พัดลม
  // ม้วนไวนิลตั้งพิงผนัง (เริ่มใต้แนวคิ้ว)
  const ro = ROOM.zones.rolls;
  for (let i = 0; i < 3; i++) { q.r(ro.x + 4 + i * 12, 134, 10, 74, '#f4f1ea'); q.r(ro.x + 4 + i * 12, 134, 10, 6, '#d8d4cc'); }
  // เครื่องพิมพ์หน้ากว้าง Epson + จอ RIP (ตั้งบนพื้น แยกจากหน้าต่างชัด)
  const pr = ROOM.zones.printer;
  q.r(pr.x + 6, pr.y + 44, 168, 46, '#f4f2ee');            // ตัวเครื่องขาว
  q.r(pr.x + 6, pr.y + 34, 168, 14, '#23242a');            // ฝาบนดำ
  q.r(pr.x + 14, pr.y + 48, 120, 8, '#d9d6cf');
  q.r(pr.x + 150, pr.y + 50, 10, 6, '#79d69a');            // ไฟสถานะ
  q.r(pr.x + 30, pr.y + 90, 120, 12, '#ffffff');           // งานพิมพ์ไหลออก
  q.r(pr.x + 30, pr.y + 90, 120, 4, '#8451bf');
  q.r(pr.x + 12, pr.y + 90, 10, 22, '#3a3b40'); q.r(pr.x + 156, pr.y + 90, 10, 22, '#3a3b40'); // ขา
  q.r(pr.x + 36, pr.y + 102, 108, 10, '#b58256');          // แกนม้วน
  q.r(pr.x + 184, pr.y + 44, 12, 66, '#4a4b52');           // เสาจอ
  q.r(pr.x + 170, pr.y + 20, 40, 28, '#23242a'); q.r(pr.x + 173, pr.y + 23, 34, 22, '#cfe6ff'); // จอ RIP
  for (let i = 0; i < 4; i++) q.r(pr.x + 175 + i * 8, pr.y + 26, 6, 8, ['#ffd34d', '#f08cc3', '#6aa6ff', '#79d69a'][i]);
  // โต๊ะตัดงาน เสื่อเขียว + ป้ายแดงที่กำลังตัด + รางเหล็ก
  const ct = ROOM.zones.cut;
  q.r(ct.x, ct.y + 14, ct.w, 92, '#e8e4da');
  q.r(ct.x + 6, ct.y + 20, ct.w - 12, 80, '#3f8d60');
  for (let gx = ct.x + 6; gx < ct.x + ct.w - 12; gx += 24) q.r(gx, ct.y + 20, 1, 80, '#58a377');
  for (let gy = ct.y + 20; gy < ct.y + 98; gy += 20) q.r(ct.x + 6, gy, ct.w - 12, 1, '#58a377');
  q.r(ct.x + 26, ct.y + 34, 140, 34, '#c0392b'); q.r(ct.x + 36, ct.y + 44, 90, 7, '#f4f1ea'); // ป้ายแดง
  q.r(ct.x + 10, ct.y + 76, ct.w - 24, 7, '#aeb7c2');       // รางตัด
  q.r(ct.x + 8, ct.y + 106, 8, 26, '#9aa0a8'); q.r(ct.x + ct.w - 18, ct.y + 106, 8, 26, '#9aa0a8');
  // เครื่องตอกตาไก่บนรถเข็นสแตนเลส + ตะกร้าฟ้า (เครื่องวางบนชั้นแน่น)
  const ey = ROOM.zones.eyelet;
  q.r(ey.x + 12, ey.y + 44, 90, 8, '#c9ced6');             // หน้าชั้นบน
  q.r(ey.x + 16, ey.y + 52, 8, 52, '#b4bac4'); q.r(ey.x + 90, ey.y + 52, 8, 52, '#b4bac4');
  q.r(ey.x + 10, ey.y + 100, 94, 7, '#c9ced6');            // ชั้นล่าง
  q.r(ey.x + 20, ey.y + 10, 74, 36, '#2d2a30');            // ตัวเครื่องนั่งบนชั้น
  for (let i = 0; i < 3; i++) { q.r(ey.x + 28 + i * 20, ey.y + 18, 12, 12, '#d9d6cf'); q.r(ey.x + 31 + i * 20, ey.y + 21, 6, 6, '#8f98a6'); }
  q.r(ey.x + 82, ey.y + 14, 8, 8, '#e5484d');              // ปุ่มแดง
  q.r(ey.x + 102, ey.y + 84, 28, 26, '#3f7fd4'); q.r(ey.x + 106, ey.y + 88, 20, 18, '#5b99e8'); // ตะกร้าบนพื้น
  // โต๊ะคอมสองจอ + เก้าอี้ (จอวางบนโต๊ะ)
  const dk = ROOM.zones.desk;
  q.r(dk.x + 4, dk.y + 30, 112, 10, '#b58256');
  q.r(dk.x + 8, dk.y + 40, 8, 46, '#8a5f3c'); q.r(dk.x + 100, dk.y + 40, 8, 46, '#8a5f3c');
  q.r(dk.x + 10, dk.y + 6, 38, 24, '#23242a'); q.r(dk.x + 13, dk.y + 9, 32, 18, '#f6a3c8');
  q.r(dk.x + 54, dk.y + 10, 32, 20, '#23242a'); q.r(dk.x + 57, dk.y + 13, 26, 14, '#9ad0f0');
  q.r(dk.x + 90, dk.y + 20, 22, 10, '#8f98a6'); q.r(dk.x + 92, dk.y + 22, 18, 6, '#cfe6ff'); // โน้ตบุ๊ก
  q.r(dk.x + 118, dk.y + 58, 22, 10, '#3a3b40'); q.r(dk.x + 124, dk.y + 68, 8, 20, '#3a3b40'); // เก้าอี้
  q.r(dk.x + 116, dk.y + 40, 26, 18, '#4a4b52');
  // ป้ายโรงเรียนธีมอวกาศที่พิมพ์เสร็จ วางบนพื้น (งานจริงในรูป!)
  const bn = ROOM.zones.banner;
  q.r(bn.x, bn.y, bn.w, bn.h, '#5b3fa8'); q.r(bn.x + 4, bn.y + 4, bn.w - 8, bn.h - 8, '#6b4fc0');
  for (const [sx, sy] of [[20, 16], [60, 30], [120, 14], [160, 40], [30, 110], [150, 118], [90, 125]]) q.r(bn.x + sx, bn.y + sy, 3, 3, '#ffd34d');
  q.r(bn.x + 132, bn.y + 16, 26, 26, '#f09a4d'); q.r(bn.x + 136, bn.y + 28, 22, 5, '#d97f35'); // ดาวพฤหัส
  q.r(bn.x + 24, bn.y + 48, 144, 44, '#f6f2ff');           // แถบขาวกลาง
  for (let i = 0; i < 6; i++) { q.r(bn.x + 32 + i * 23, bn.y + 58, 10, 14, ['#e5484d', '#3f7fd4', '#22a06b', '#f09a4d', '#8451bf', '#f08cc3'][i]); q.r(bn.x + 34 + i * 23, bn.y + 54, 6, 6, '#f6c89b'); }
  q.r(bn.x + 14, bn.y + 100, 52, 26, '#f3c242'); q.r(bn.x + 20, bn.y + 106, 10, 8, '#cfe6ff'); q.r(bn.x + 36, bn.y + 106, 10, 8, '#cfe6ff'); // รถบัส
  q.r(bn.x + 18, bn.y + 124, 8, 8, '#2d2a3e'); q.r(bn.x + 50, bn.y + 124, 8, 8, '#2d2a3e');
  // ประตูไม้ขวา + ทางเข้ากระจกล่าง + มอไซค์จอดหน้าบ้าน
  q.r(452, 200, 26, 118, '#8a5f3c'); q.r(456, 206, 18, 106, '#9c6f47'); q.r(458, 252, 5, 5, '#5c3a22');
  const dr = ROOM.zones.door;
  q.r(dr.x - 10, dr.y, dr.w + 20, 46, '#2a3350');
  q.r(dr.x - 10, dr.y, 14, 46, '#f4f1ea'); q.r(dr.x + dr.w - 4, dr.y, 14, 46, '#f4f1ea');
  for (let i = 0; i < 4; i++) q.r(dr.x + 8 + i * 45, dr.y + 4, 40, 38, '#39456b');
  motoSprite(g, dr.x + dr.w / 2, dr.y + 30, 1, 0);          // มอไซค์ของฟิล์มจอดอยู่
  // ประกาย + ฟิล์มเดินทำงาน + ป้ายโซนคม
  const tick = Math.floor(nowMs / 420);
  sparkle(q, 310, 150, tick % 3 === 0); sparkle(q, 120, 250, tick % 4 === 2);
  const wlk = state.roomWalker;
  if (wlk) {
    const [x, y] = pointAt(wlk.path, wlk.t);
    const frame = walkFrame(wlk, nowMs);
    if (frame !== 'work') wlk.flip = walkFlip(wlk);
    personSprite(g, x, y, { pal: 0, frame, flip: wlk.flip, s: 1.25 });
    if (state.walkerName) nameTag(g, state.walkerName, x, y - 42);
  }
  for (const [text, lx, ly] of ROOM.labels) plateCover(g, text, lx, ly, 0, 13);
  if (state.focusZone && ROOM.zones[state.focusZone]) {
    const z = ROOM.zones[state.focusZone];
    g.strokeStyle = P.yellow; g.lineWidth = 3; g.setLineDash([7, 5]);
    g.strokeRect(z.x - 3, z.y - 3, z.w + 6, z.h + 6); g.setLineDash([]);
  }
}

export function drawScene(g, state, nowMs) {
  g.imageSmoothingEnabled = false;
  if (state.view === 'route') drawRoute(g, state, nowMs);
  else if (state.view === 'vinylroom') drawVinylRoom(g, state, nowMs);
  else drawTopInside(g, state, nowMs); // ฉากเดินมุมสูง (ร้านสั่ง 25 พ.ย. 69 เลิกมุมหน้าร้าน)
}

export function hitZone(x, y) {
  for (const [id, z] of Object.entries(ZONES)) {
    if (x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h) return id;
  }
  return '';
}
