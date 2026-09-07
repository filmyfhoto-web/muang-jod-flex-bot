import { reply } from '../services/lineService.js';
import { getRecentJobs } from '../services/jobService.js';
import { recentJobsFlex } from '../flex/recentJobsFlex.js';

export async function recentJobs({ replyToken, profile }) {
  const jobs = await getRecentJobs(profile.id, 5);
  await reply(replyToken, recentJobsFlex(jobs));
}
