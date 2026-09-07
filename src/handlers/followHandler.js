import { reply } from '../services/lineService.js';
import { clearState } from '../services/stateService.js';

const WELCOME = `สวัสดีค่ะ ม่วงจดยินดีต้อนรับ 💜

ม่วงจดเป็นผู้ช่วยจดงานสำหรับร้านค้าและธุรกิจเล็ก ๆ ค่ะ

สิ่งที่ม่วงจดช่วยได้:
📝 บันทึกงานและราคา
📎 แนบสลิป/หลักฐาน
🕘 ดูรายการงานล่าสุด
📊 สรุปยอดวันนี้
💰 ติดตามงานค้างรับ

กดเมนูด้านล่างเพื่อเริ่มใช้งานได้เลยค่ะ`;

// New follower / unblock: greet and reset any stale state.
export async function handleFollow(event, profile) {
  await clearState(profile.id);
  await reply(event.replyToken, { type: 'text', text: WELCOME });
}
