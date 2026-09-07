import { reply } from '../services/lineService.js';
import { setState, STATES } from '../services/stateService.js';
import { getLatestJob } from '../services/jobService.js';
import { jobCardMessage } from '../flex/jobCard.js';

const EDIT_GUIDE = `✏️ ต้องการแก้ไขอะไรคะ?

พิมพ์ในรูปแบบนี้ได้เลยค่ะ
• ชื่องาน: ป้ายงานวัด
• ลูกค้า: ร้านกาแฟ
• สถานะ: จ่ายแล้ว / ค้างรับ / จ่ายบางส่วน
• ราคา: 500
• หมายเหตุ: ส่งของวันจันทร์

พิมพ์หลายบรรทัดพร้อมกันได้ค่ะ 💜`;

// Triggered by postback action=edit_latest. Show current job then wait for edits.
export async function editLatest({ replyToken, profile }) {
  const latest = await getLatestJob(profile.id);

  if (!latest) {
    await reply(replyToken, {
      type: 'text',
      text: 'ยังไม่มีงานให้แก้ไขเลยค่ะ ลองบันทึกงานก่อนนะคะ 💜',
    });
    return;
  }

  await setState(profile.id, STATES.WAITING_FOR_EDIT, { jobId: latest.id });
  await reply(replyToken, [
    jobCardMessage(latest, 'งานล่าสุดของคุณ'),
    { type: 'text', text: EDIT_GUIDE },
  ]);
}
