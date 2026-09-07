import { reply } from '../services/lineService.js';
import { getTodaySummary } from '../services/jobService.js';
import { todaySummaryFlex } from '../flex/todaySummaryFlex.js';

export async function todaySummary({ replyToken, profile }) {
  const summary = await getTodaySummary(profile.id);
  await reply(replyToken, todaySummaryFlex(summary));
}
