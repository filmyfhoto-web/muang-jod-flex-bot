import { reply } from '../services/lineService.js';
import { getDashboard } from '../services/dashboardService.js';
import { dashboardFlex } from '../flex/dashboardFlex.js';
import { listExpenses, sumExpenses } from '../services/expenseService.js';
import { logger } from '../services/logger.js';

export async function todaySummary({ replyToken, profile }) {
  const dash = await getDashboard(profile.id, { recentLimit: 3 });

  // รายจ่ายวันนี้ประกบยอดรับ — อ่านพังได้ศูนย์ ไม่พาการ์ดสรุปล่ม
  let expense = null;
  try {
    const rows = await listExpenses(profile.id, {});
    if (rows.length) expense = { count: rows.length, total: sumExpenses(rows) };
  } catch (err) {
    logger.warn('summary.expenses_failed', { message: err?.message });
  }

  await reply(replyToken, dashboardFlex(dash, { expense }));
}
