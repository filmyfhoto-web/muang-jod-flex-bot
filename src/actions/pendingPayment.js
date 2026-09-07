import { reply } from '../services/lineService.js';
import { getPendingJobs } from '../services/jobService.js';
import { pendingPaymentFlex } from '../flex/pendingPaymentFlex.js';

export async function pendingPayment({ replyToken, profile }) {
  const jobs = await getPendingJobs(profile.id);
  await reply(replyToken, pendingPaymentFlex(jobs));
}
