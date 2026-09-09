// ตัดพื้นหลังลายตารางหมากรุกออกจากรูปมาสคอต
//
//   npm i --no-save sharp
//   node scripts/cutout-mascot.mjs <ไฟล์เข้า> public/brand/mascot-<ชื่อ>.png
//
// รูปที่เซฟมาจากเครื่องมือตัดพื้นหลังบางตัว "โปร่งใส" แค่ในสายตา — ลายตาราง
// ถูกอบลงไปในไฟล์จริง ๆ (ไม่มีช่อง alpha) เอาไปวางบนการ์ดสีเข้มแล้วจะเห็น
// เป็นสี่เหลี่ยมขาว-เทาแทนที่จะเป็นน้องหมาลอย ๆ
//
// วิธีตัด: ลายตารางมีแค่สองสีและเรียบสนิท ส่วนขนน้องหมามีเฉดไล่ตลอด จึงลบ
// เฉพาะพิกเซลที่ (1) ตรงกับสองสีนั้นแบบเป๊ะ ๆ และ (2) เดินจากขอบภาพเข้ามาถึงได้
// เงื่อนไขที่สองสำคัญ: ขนสีขาวสว่างพอ ๆ กับช่องขาว ถ้าดูแต่สีอย่างเดียวจะทะลุ
// เข้าไปเจาะขนเป็นรู แต่ขนที่อยู่ลึกเข้าไปเดินมาจากขอบไม่ถึง
import sharp from 'sharp';

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error('ใช้: node scripts/cutout-mascot.mjs <ไฟล์เข้า> <ไฟล์ออก.png>');
  process.exit(1);
}

const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width, height, channels } = info;
const at = (x, y) => (y * width + x) * channels;
console.log(`เข้า ${width}x${height}`);

// ลายตารางถูกบีบอัดมา สีจึงไม่นิ่ง (ช่องขาวแกว่ง 252-255 ช่องเทา 200-215)
// เทียบเป็น "ช่วง" แทนค่าเป๊ะ ๆ และดูด้วยว่าเป็นสีเทาจริง — R G B ต้องใกล้กัน
// ขนน้องหมามีสีอุ่นอมส้ม ช่องต่างของ R กับ B จึงกว้างกว่านี้เสมอ
function isGrey(i, maxSpread) {
  const r = data[i];
  const g = data[i + 1];
  const b = data[i + 2];
  return Math.max(r, g, b) - Math.min(r, g, b) <= maxSpread;
}

function looksLikeBackground(x, y) {
  const i = at(x, y);
  const r = data[i];
  if (r >= 246 && isGrey(i, 4)) return true; // ช่องขาว
  if (r >= 195 && r <= 222 && isGrey(i, 8)) return true; // ช่องเทา
  return false;
}

// เติมสีจากขอบภาพเข้ามา เฉพาะพิกเซลที่หน้าตาเป็นพื้นหลัง
const seen = new Uint8Array(width * height);
const queue = [];
const push = (x, y) => {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const k = y * width + x;
  if (seen[k] || !looksLikeBackground(x, y)) return;
  seen[k] = 1;
  queue.push(k);
};
for (let x = 0; x < width; x += 1) {
  push(x, 0);
  push(x, height - 1);
}
for (let y = 0; y < height; y += 1) {
  push(0, y);
  push(width - 1, y);
}
// เดินทีละ 1 และ "ก้าวข้าม" ทีละ 2 ด้วย — รอยต่อระหว่างช่องลายตารางเป็นเส้น
// จาง ๆ หนา 1-2 พิกเซลที่สีไม่เข้าเกณฑ์ ถ้าเดินทีละ 1 อย่างเดียวมันจะกลายเป็น
// กำแพงกั้น เหลือเป็นตารางจุดค้างอยู่บนพื้นหลัง ตัวน้องหมาเป็นก้อนหนา
// การก้าวข้าม 2 พิกเซลจึงไม่มีทางกระโดดทะลุเข้าไปข้างใน
for (let head = 0; head < queue.length; head += 1) {
  const k = queue[head];
  const x = k % width;
  const y = (k - x) / width;
  for (const step of [1, 2]) {
    push(x + step, y);
    push(x - step, y);
    push(x, y + step);
    push(x, y - step);
  }
}

// เก็บเฉพาะก้อนที่ใหญ่ที่สุด — ก็คือตัวน้องหมา
//
// สิ่งที่เหลือหลังเติมสีคือลายน้ำจาง ๆ กับเศษรอยต่อที่สีไม่เข้าเกณฑ์ ทั้งหมด
// เป็นจุดเล็ก ๆ กระจัดกระจาย ไม่ต่อกับตัวน้องหมา จึงไม่ต้องเดาสีมันอีก — อะไร
// ที่ไม่ได้ต่อกับก้อนใหญ่ที่สุด คือเศษ วิธีนี้ปลอดภัยกว่าการขยายช่วงสี เพราะ
// ไม่มีทางกินขนสีขาวของน้องหมาที่ติดกับพื้นหลังพอดี
const label = new Int32Array(width * height).fill(-1);
let best = { id: -1, size: 0 };
let nextId = 0;
const stack = [];
for (let start = 0; start < label.length; start += 1) {
  if (seen[start] || label[start] !== -1) continue;
  const id = nextId;
  nextId += 1;
  let size = 0;
  stack.length = 0;
  stack.push(start);
  label[start] = id;
  while (stack.length) {
    const k = stack.pop();
    size += 1;
    const x = k % width;
    const y = (k - x) / width;
    const step = (nx, ny) => {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) return;
      const nk = ny * width + nx;
      if (seen[nk] || label[nk] !== -1) return;
      label[nk] = id;
      stack.push(nk);
    };
    step(x + 1, y);
    step(x - 1, y);
    step(x, y + 1);
    step(x, y - 1);
  }
  if (size > best.size) best = { id, size };
}
let specks = 0;
for (let k = 0; k < label.length; k += 1) {
  if (seen[k] || label[k] === best.id) continue;
  seen[k] = 1;
  specks += 1;
}
console.log(`ก้อนหลัก ${best.size.toLocaleString()} px · เศษที่เก็บกวาด ${specks.toLocaleString()} px`);

// ขลิบขอบ: พิกเซลสีเทาที่ติดกับพื้นหลังคือรอยต่อของลายตารางที่ยังค้างเป็นฝ้า
// รอบตัว ขนจริงมีสีอุ่น ไม่ใช่สีเทา จึงไม่โดนขลิบไปด้วย
for (let pass = 0; pass < 2; pass += 1) {
  const fringe = [];
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const k = y * width + x;
      if (seen[k]) continue;
      const i = at(x, y);
      if (data[i] < 200 || !isGrey(i, 16)) continue;
      if (
        seen[k - 1] || seen[k + 1] || seen[k - width] || seen[k + width] ||
        seen[k - width - 1] || seen[k - width + 1] || seen[k + width - 1] || seen[k + width + 1]
      ) {
        fringe.push(k);
      }
    }
  }
  if (!fringe.length) break;
  for (const k of fringe) seen[k] = 1;
}

let cleared = 0;
for (let k = 0; k < seen.length; k += 1) {
  if (!seen[k]) continue;
  data[k * channels + 3] = 0;
  cleared += 1;
}

const out = await sharp(data, { raw: { width, height, channels } })
  .trim({ threshold: 1 }) // ตัดขอบโปร่งใสที่เหลือทิ้ง
  .png({ compressionLevel: 9 })
  .toFile(output);

console.log(
  `${output}  ${out.width}x${out.height}  ${(out.size / 1024).toFixed(0)} KB` +
    `  (ลบพื้นหลัง ${((cleared / (width * height)) * 100).toFixed(0)}%)`
);
