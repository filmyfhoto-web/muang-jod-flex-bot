import { reply } from '../services/lineService.js';
import { listBranches, pickBranch } from '../services/branchService.js';
import { getBookJobs } from '../services/jobService.js';
import { summarizeBranches, branchDetail } from '../utils/branchSummary.js';
import { branchOverviewFlex, branchDetailFlex } from '../flex/branchFlex.js';

/* "ดูงานนัฐภรณ์ ปริ้นงาน" → เฉพาะร้านนั้น · "ดูงานทั้งสองร้าน" → การ์ดรวม
 *
 * มาได้สองทาง: พิมพ์ในแชต (messageHandler จับชื่อร้านให้แล้ว) หรือกดปุ่ม
 * action=branch_view&branch=<slug> บนการ์ด
 */
export async function branchView({ replyToken, profile, params }, picked = null) {
  const branches = await listBranches(profile.id);
  if (!branches.length) {
    return reply(replyToken, {
      type: 'text',
      text: 'ยังไม่มีร้านในระบบเลยค่ะ เดี๋ยวม่วงตั้งให้ตอนจดงานใบแรกนะคะ 💜',
    });
  }

  const jobs = await getBookJobs(profile.id);
  const branch = picked?.branch
    ? pickBranch(branches, picked.branch.slug || picked.branch.name)
    : params?.branch
      ? pickBranch(branches, params.branch)
      : null;

  if (!branch) {
    return reply(replyToken, branchOverviewFlex(summarizeBranches(jobs, branches)));
  }

  const other = branches.find((b) => b.id !== branch.id) || null;
  return reply(replyToken, branchDetailFlex(branch, branchDetail(jobs, branch), { other }));
}
