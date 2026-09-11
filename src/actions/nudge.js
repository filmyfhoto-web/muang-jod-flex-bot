import { reply } from '../services/lineService.js';
import { setNudgeEnabled } from '../services/nudgeService.js';
import { nudgePreview } from '../utils/nudgeMessages.js';

// เปิด/ปิด "ม่วงทักก่อน"
//
// ปุ่มปิดอยู่บนข้อความที่ทักไปเอง ทางออกจึงอยู่ตรงที่ที่คนอยากออก ไม่ใช่ใน
// หน้าตั้งค่าที่ต้องไปหา และคำตอบตอนปิดต้องไม่งอน — คนที่กดปิดกำลังบอกว่า
// ไม่อยากได้ ไม่ใช่กำลังขอให้ชวนอีกที

export async function nudgeOff({ replyToken, profile }) {
  const ok = await setNudgeEnabled(profile.id, false);
  return reply(replyToken, {
    type: 'text',
    text: ok
      ? 'ได้เลยค่ะ ม่วงจะไม่ทักก่อนแล้วนะคะ 💜\nอยากให้ทักอีกเมื่อไหร่ พิมพ์ "ทักได้" มาได้ตลอดค่ะ'
      : 'ตอนนี้บันทึกไม่สำเร็จค่ะ 😢 ลองใหม่อีกครั้งนะคะ',
  });
}

// "ทดสอบทัก" — เห็นเลยว่าม่วงจะพูดยังไง โดยไม่ต้องรอให้หายไปสามวันจริง ๆ
//
// ของแบบนี้ถ้าดูไม่ได้จนกว่าจะถึงเวลา ก็แก้คำพูดไม่ได้จนกว่าจะถึงเวลาเหมือนกัน
// ส่งมาให้ครบทุกชั้น เพราะสิ่งที่อยากรู้คือ "น้ำเสียงใช่มั้ย" ไม่ใช่ประโยคเดียว
export async function nudgeTest({ replyToken, profile }) {
  return reply(replyToken, { type: 'text', text: nudgePreview(profile.display_name) });
}

export async function nudgeOn({ replyToken, profile }) {
  const ok = await setNudgeEnabled(profile.id, true);
  return reply(replyToken, {
    type: 'text',
    text: ok
      ? 'ยินดีเลยค่ะ 🐶 ถ้าหายไปหลายวันม่วงจะทักไปนะคะ'
      : 'ตอนนี้บันทึกไม่สำเร็จค่ะ 😢 ลองใหม่อีกครั้งนะคะ',
  });
}
