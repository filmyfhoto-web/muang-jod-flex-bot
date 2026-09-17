import { logger } from './logger.js';

/* ย่อรูปก่อนส่งให้ม่วงอ่าน
 *
 * ร้านถามว่า "ถ้าลูกค้าส่งมาแบบนี้ฉันอยากให้ม่วงอ่านได้เลย" พร้อมภาพไฟล์
 * "รับขุดบ่อน้ำตื้น..png" ขนาด 27.42 MB ที่ลูกค้าส่งมาเป็นไฟล์แนบ ไม่ใช่รูป
 *
 * รูปที่ส่งเป็น "รูป" ในไลน์ ไลน์บีบให้เหลือหลักหนึ่งถึงสองเมกฯ มาให้แล้ว แต่รูป
 * ที่ส่งเป็น "ไฟล์" มาเต็มความละเอียดเดิม ซึ่งชนเพดานสองชั้น:
 *   1. ด่านขนาดไฟล์ของบอทเอง (MAX_UPLOAD_MB)
 *   2. เพดานของตัวอ่านรูป — รับได้ 10 MB ต่อรูป และนับแบบ base64 ซึ่งพองขึ้น
 *      อีกราวหนึ่งในสาม ไฟล์ 27 MB จึงกลายเป็น 36 MB ส่งไปก็โดนปฏิเสธ
 *
 * และต่อให้ส่งได้ ตัวอ่านก็ย่อเหลือด้านยาว 2576 จุดอยู่ดี — ส่งของใหญ่กว่านั้น
 * ไปคือจ่ายค่าเน็ตกับเวลารอเปล่า ๆ ย่อเองตั้งแต่ต้นทางจึงได้ทั้งอ่านออกและเร็วขึ้น
 */

// ด้านยาวที่ตัวอ่านใช้จริง — ย่อให้เท่านี้พอ ใหญ่กว่านี้ไม่ได้อ่านออกขึ้น
export const MAX_EDGE = 2576;

// ไม่เกินเท่านี้ส่งดิบ ๆ ได้เลย ไม่ต้องบีบซ้ำ
//
// เพดานจริงคือ 10 MB แบบ base64 (≈ 7.5 MB ดิบ) เผื่อไว้ที่ 5 MB เพราะการบีบ
// ซ้ำทำให้ตัวหนังสือในรูปเบลอ ซึ่งเป็นสิ่งเดียวที่เราต้องการอ่านจากรูปพวกนี้
export const PASS_THROUGH_BYTES = 5 * 1024 * 1024;

// เป้าหลังย่อ ต้องต่ำกว่าเพดานแบบไม่ต้องลุ้น
const TARGET_BYTES = 4 * 1024 * 1024;

const QUALITIES = [86, 78, 68, 55];

// โหลด sharp ตอนใช้จริง เหมือน SDK ตัวอ่าน — เครื่องไหนไม่มีก็ยังรันได้
// แค่อ่านไฟล์ใหญ่ไม่ได้ ไม่ใช่บอททั้งตัวล่ม
let sharpPromise = null;
async function loadSharp() {
  if (!sharpPromise) {
    sharpPromise = import('sharp')
      .then((m) => m.default || m)
      .catch((err) => {
        logger.warn('imageprep.sharp_unavailable', { message: err?.message });
        return null;
      });
  }
  return sharpPromise;
}

export function needsShrink(buffer) {
  return Boolean(buffer) && buffer.length > PASS_THROUGH_BYTES;
}

/* คืนรูปที่พร้อมส่งให้ตัวอ่าน หรือ null เมื่อย่อไม่ได้
 *
 * รูปเล็กอยู่แล้วคืนของเดิมทั้งดุ้น ไม่แตะต้อง — การบีบ JPEG ซ้ำกินตัวหนังสือ
 * เล็ก ๆ ในใบสั่งงานไปทีละนิด และนั่นคือส่วนที่ต้องอ่านให้ออก
 */
export async function prepareForVision(buffer, mimeType, deps = {}) {
  if (!buffer?.length) return null;
  if (!needsShrink(buffer)) return { buffer, mimeType, shrunk: false };

  const sharp = deps.sharp !== undefined ? deps.sharp : await loadSharp();
  if (!sharp) return null;

  try {
    /* คลายรูปใหญ่แค่รอบเดียว
     *
     * เครื่องที่บอทรันอยู่มีแรมจำกัด และการคลาย PNG ยี่สิบกว่าล้านจุดคือส่วนที่
     * แพงที่สุดของงานนี้ ย่อลงให้เสร็จในรอบเดียวก่อน แล้วถ้ายังใหญ่ไปค่อยเข้ารหัส
     * ซ้ำจากตัวเล็กที่ได้มาแล้ว ซึ่งถูกกว่ากันคนละเรื่อง
     *
     * rotate() ไม่ใส่องศา = หมุนตาม EXIF ของกล้อง รูปที่ถ่ายแนวตั้งจะได้ไม่ตะแคง
     * limitInputPixels: ปล่อยรูปสแกนใหญ่ ๆ ผ่าน ไม่ใช่โยน error ทิ้ง
     */
    let out = await sharp(buffer, { limitInputPixels: 2 ** 30, failOn: 'none', sequentialRead: true })
      .rotate()
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: QUALITIES[0], mozjpeg: true })
      .toBuffer();

    // ไล่คุณภาพลงทีละขั้นจนพอดีเพดาน เริ่มจากคมที่สุดเสมอ — ใบสั่งงานที่อ่าน
    // ไม่ออกเพราะบีบแรงไป ไม่ได้ช่วยอะไรเลยแม้จะส่งสำเร็จ
    for (const quality of QUALITIES.slice(1)) {
      if (out.length <= TARGET_BYTES) break;
      out = await sharp(out).jpeg({ quality, mozjpeg: true }).toBuffer();
    }

    // ยังไม่ลงอีก: ย่อด้านยาวลงครึ่งหนึ่งแล้วลองรอบสุดท้าย
    if (out.length > TARGET_BYTES) {
      out = await sharp(out)
        .resize({ width: Math.round(MAX_EDGE / 2), height: Math.round(MAX_EDGE / 2), fit: 'inside' })
        .jpeg({ quality: 70, mozjpeg: true })
        .toBuffer();
    }

    if (out.length > TARGET_BYTES) {
      logger.warn('imageprep.still_too_big', { from: buffer.length, to: out.length });
      return null;
    }
    logger.info('imageprep.shrunk', { from: buffer.length, to: out.length });
    return { buffer: out, mimeType: 'image/jpeg', shrunk: true };
  } catch (err) {
    logger.error('imageprep.failed', { message: err?.message });
    return null;
  }
}
