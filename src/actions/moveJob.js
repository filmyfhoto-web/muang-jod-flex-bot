import { reply } from '../services/lineService.js';
import { getLatestJob, getJobByNumber } from '../services/jobService.js';
import { listBranches, setJobBranch } from '../services/branchService.js';

/* "ย้าย MJ-SGN-0001 ไปร้านเชียงกลาง" / "ย้ายไปร้านปริ้น" (= งานล่าสุด)
 *
 * คำตอบทวนทั้งเลขงาน ชื่องาน และร้านปลายทางเสมอ — การย้ายผิดใบต้องถูกเห็น
 * ตรงนี้ ตอนที่พิมพ์ "ย้าย" กลับอีกครั้งเดียวก็แก้ได้
 */
export async function moveJob({ replyToken, profile }, move) {
  const job =
    move.ref === 'latest'
      ? await getLatestJob(profile.id)
      : await getJobByNumber(profile.id, move.ref);

  if (!job) {
    return reply(replyToken, {
      type: 'text',
      text:
        move.ref === 'latest'
          ? 'ยังไม่มีงานให้ย้ายเลยค่ะ 🤔'
          : `หางานเลข ${move.ref} ไม่เจอค่ะ 🤔 ลองเช็คเลขอีกทีนะคะ`,
    });
  }

  const branches = await listBranches(profile.id);
  const target = branches.find((b) => b.slug === move.branch.slug) || null;
  if (!target) {
    return reply(replyToken, { type: 'text', text: 'ไม่พบร้านนั้นแล้วค่ะ 🤔' });
  }

  const moved = await setJobBranch(profile.id, job.id, target.id);
  if (!moved) {
    return reply(replyToken, { type: 'text', text: 'ย้ายไม่สำเร็จค่ะ ลองใหม่อีกครั้งนะคะ 😢' });
  }

  return reply(replyToken, {
    type: 'text',
    text: `ย้าย ${job.job_number || 'งานล่าสุด'} (${job.job_name || 'งาน'}) ไปร้าน "${target.name}" แล้วค่ะ 💜`,
  });
}
