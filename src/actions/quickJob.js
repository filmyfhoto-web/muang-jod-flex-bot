import { reply } from '../services/lineService.js';
import { startCollecting } from '../utils/slots.js';
import { startCollectFlow } from '../services/collectFlow.js';
import { QUICK_JOBS } from '../flex/quickReply.js';

/* ปุ่มลัดเหนือช่องพิมพ์ — กดแล้วม่วงถามต่อในแชต ไม่ใช่เปิดฟอร์ม
 *
 * ร้านบอกว่า "ตรงปุ่มกดให้เป็นบอทตอบเหมือนเดิม แล้วค่อยกดเข้าไปแก้ไขทีหลัง"
 *
 * ของเดิมปุ่มพวกนี้เป็นลิงก์เปิดฟอร์มจดด่วนที่มีชื่องานใส่ไว้ให้แล้ว ซึ่งแปลว่า
 * ทุกครั้งที่จะจดงานต้องเด้งออกจากแชตไปหน้าเว็บก่อน ตอนนี้ม่วงถามทีละข้อในแชต
 * ได้แล้ว การเปิดฟอร์มจึงเหลือไว้สำหรับ "แก้หลายช่องทีเดียว" ซึ่งคือปุ่ม ✏️ แก้ไข
 * บนการ์ดหลังบันทึก และปุ่มจดด่วนบนริชเมนูสำหรับคนที่อยากกรอกเองทั้งใบ
 */

// ชื่องานที่ปุ่มส่งมา ต้องเป็นชื่อที่อยู่ในปุ่มจริง ๆ ไม่ใช่อะไรก็ได้ที่ยัดมาใน
// postback — data ของ postback เป็นของที่ปลอมได้ ไม่ต่างจากข้อความที่พิมพ์เอง
const KNOWN = new Set(QUICK_JOBS.map((j) => j.name));

export async function quickJob({ replyToken, profile, params }) {
  const name = String(params?.name || '').trim();
  const collecting = KNOWN.has(name) ? startCollecting(name) : null;

  if (!collecting) {
    return reply(replyToken, {
      type: 'text',
      text: 'พิมพ์งานมาได้เลยค่ะ เช่น "มีงานกรอบรูป" แล้วม่วงจะถามต่อให้เองนะคะ 💜',
    });
  }

  return startCollectFlow(replyToken, profile, collecting);
}
