import { reply } from '../services/lineService.js';
import { getDashboard } from '../services/dashboardService.js';
import { dashboardFlex } from '../flex/dashboardFlex.js';

export async function todaySummary({ replyToken, profile }) {
  const dash = await getDashboard(profile.id, { recentLimit: 3 });
  await reply(replyToken, dashboardFlex(dash));
}
