import { reply } from '../services/lineService.js';
import { setState, STATES } from '../services/stateService.js';

const PROMPT = `📝 บันทึกงานใหม่

พิมพ์รายละเอียดงานได้เลยค่ะ

ตัวอย่าง:
ป้ายไวนิล 60x100 150 บาท
โฟมบอร์ด 40x60 250 บาท

ม่วงจดจะช่วยจัดรายการให้ค่ะ 💜`;

// Triggered by postback action=add_job. Prompt user then wait for job text.
export async function addJob({ replyToken, profile }) {
  await setState(profile.id, STATES.WAITING_FOR_JOB, {});
  await reply(replyToken, { type: 'text', text: PROMPT });
}
