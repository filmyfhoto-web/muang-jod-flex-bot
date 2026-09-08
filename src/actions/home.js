import { reply } from '../services/lineService.js';
import { getDashboard } from '../services/dashboardService.js';
import { homeFlex } from '../flex/homeFlex.js';
import { logger } from '../services/logger.js';

// postback action=home — the mascot panel on the Rich Menu.
//
// The numbers are a nicety, not the point: someone who tapped the dog wants
// the buttons. So a failed lookup still sends the card, with zeroes.
export async function home({ replyToken, profile }) {
  let summary = { date: new Date(), total: 0, jobCount: 0, pending: 0 };
  try {
    const dash = await getDashboard(profile.id, { recentLimit: 0 });
    summary = dash.summary;
  } catch (err) {
    logger.warn('home.summary_failed', { message: err?.message });
  }
  return reply(replyToken, homeFlex(summary, { displayName: profile.display_name }));
}
