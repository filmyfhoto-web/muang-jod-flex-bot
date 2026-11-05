import { reply } from '../services/lineService.js';
import { getJobsByCategory } from '../services/jobService.js';
import { taxonomyOf } from '../utils/category.js';
import { moveCategoryGroupsFlex, categoryJobsFlex } from '../flex/categoryPickerFlex.js';
import { formatThaiDate } from '../utils/dates.js';
import { formatBaht } from '../utils/currency.js';

/* ย้ายงานข้ามหมวด — ร้านขอ "เลือกหางานในหมวดแล้วย้ายได้"
 *
 * พิมพ์ "ย้ายหมวด" → เลือกหมวดที่งานอยู่ (action=cat_jobs) → เลือกงานจากรายการ
 * (เลขงาน+วันที่กำกับ งานชื่อซ้ำกันเลยไม่หลงใบ) → เข้าตัวเลือกหมวดเดิม
 * (pick_category&jobId=…) ซึ่งบันทึกด้วย updateJob ตัวเดิม — ไม่มีกติกาใหม่
 * เรื่องข้อมูล และเลขงานไม่ถูกเปลี่ยนตอนย้าย
 */
export async function moveCategoryStart({ replyToken, profile }) {
  return reply(replyToken, moveCategoryGroupsFlex(taxonomyOf(profile.id)));
}

// action=cat_jobs&group=<id>
export async function categoryJobs({ replyToken, profile, params }) {
  const tax = taxonomyOf(profile.id);
  const group = tax.findGroup(params?.group);
  if (!group) return reply(replyToken, moveCategoryGroupsFlex(tax));

  const jobs = await getJobsByCategory(profile.id, group.id, 60);
  return reply(replyToken, categoryJobsFlex(group, jobs, { formatDate: formatThaiDate, formatMoney: formatBaht }));
}
