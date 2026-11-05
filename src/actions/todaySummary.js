import { reply } from '../services/lineService.js';
import { getDashboard } from '../services/dashboardService.js';
import { dashboardFlex } from '../flex/dashboardFlex.js';
import { listExpenses, sumExpenses } from '../services/expenseService.js';
import { getBookJobs } from '../services/jobService.js';
import { moneyToday } from '../utils/ledger.js';
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

  /* สามก้อนเงินที่ร้านขอให้แยก: เก็บแล้ว (สด/โอน) · เก็บจากบัญชีเก่า · ลงบัญชีรอเก็บ
   *
   * ต้องมองงานทุกวัน ไม่ใช่แค่งานที่จดวันนี้ — เงินที่ตามเก็บจากบัญชีเก่าได้วันนี้
   * มาจากงานของวันก่อน ส่วนยอดค้างสะสมยิ่งเป็นของเก่าล้วน ๆ (สูตรเดียวกับ
   * หน้าใบลงบัญชี) อ่านพังการ์ดยังขึ้น แค่ไม่มีแถวเงินก้อนนี้
   */
  let money = null;
  try {
    const jobs = await getBookJobs(profile.id, 400);
    money = moneyToday(jobs, dash.summary.date);
  } catch (err) {
    logger.warn('summary.money_failed', { message: err?.message });
  }

  await reply(replyToken, dashboardFlex(dash, { expense, money }));
}
