import { reply } from '../services/lineService.js';
import { startCollecting } from '../utils/slots.js';
import { startCollectFlow } from '../services/collectFlow.js';

/* ปุ่มลัดเหนือช่องพิมพ์ — กดแล้วม่วงถามต่อในแชต ไม่ใช่เปิดฟอร์ม
 *
 * ร้านบอกว่า "ตรงปุ่มกดให้เป็นบอทตอบเหมือนเดิม แล้วค่อยกดเข้าไปแก้ไขทีหลัง"
 *
 * ปุ่มมาจากหมวดของร้านเอง (quickReply.js) ชื่อที่ส่งมาจึงไม่ใช่ลิสต์ตายตัวอีกแล้ว —
 * ตรวจด้วยตัวจัดหมวดจริงแทน: ชื่อที่จัดหมวดได้คือชื่องานจริง ปลอม data มาได้ก็แค่
 * เท่ากับพิมพ์คำนั้นเองในแชต ซึ่งทำได้อยู่แล้วและไม่ไปไกลกว่าการเริ่มชุดคำถาม
 */
export async function quickJob({ replyToken, profile, params }) {
  const name = String(params?.name || '').trim();
  const collecting = name ? startCollecting(name) : null;

  if (!collecting) {
    return reply(replyToken, {
      type: 'text',
      text: 'พิมพ์งานมาได้เลยค่ะ เช่น "มีงานกรอบรูป" แล้วม่วงจะถามต่อให้เองนะคะ 💜',
    });
  }

  return startCollectFlow(replyToken, profile, collecting);
}
