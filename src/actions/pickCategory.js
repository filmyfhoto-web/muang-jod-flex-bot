import { reply } from '../services/lineService.js';
import { getJobById, getLatestJob, updateJob } from '../services/jobService.js';
import { categoryGroupsFlex, categoryTypesFlex } from '../flex/categoryPickerFlex.js';
import { jobCardMessage } from '../flex/jobCard.js';
import { findGroup, findType, categoryLabel } from '../utils/category.js';

// action=pick_category — one action, three steps:
//   no group          -> show the kinds of work
//   group, no type    -> show that kind's types
//   group + type      -> save it on the job and confirm
//
// `jobId` is optional: without one the latest job is re-categorised, which is
// what "เลือกหมวด" from the menu means.
export async function pickCategory({ replyToken, profile, params }) {
  const { group: groupId, type: typeId, jobId } = params || {};

  if (!groupId) {
    return reply(replyToken, categoryGroupsFlex(jobId));
  }

  const group = findGroup(groupId);
  if (!group) {
    return reply(replyToken, categoryGroupsFlex(jobId));
  }

  // A group with types still needs a type chosen; `type=` (empty) means
  // "the group is enough", which is how the catch-all is picked.
  if (typeId === undefined) {
    return reply(replyToken, categoryTypesFlex(group.id, jobId));
  }

  const job = jobId ? await getJobById(profile.id, jobId) : await getLatestJob(profile.id);
  if (!job) {
    return reply(replyToken, {
      type: 'text',
      text: 'ยังไม่มีงานให้เปลี่ยนหมวดเลยค่ะ ลองบันทึกงานก่อนนะคะ 💜',
    });
  }

  const type = typeId ? findType(typeId) : null;
  const updated = await updateJob(profile.id, job.id, {
    category: group.id,
    category_type: type?.id || null,
  });
  if (!updated) {
    return reply(replyToken, { type: 'text', text: 'ไม่พบงานนี้ค่ะ' });
  }

  const full = { ...job, ...updated, items: job.items || [] };
  return reply(replyToken, [
    { type: 'text', text: `จัดเข้าหมวด "${categoryLabel(full)}" ให้แล้วค่ะ 💜` },
    jobCardMessage(full, 'เปลี่ยนหมวดเรียบร้อย'),
  ]);
}
