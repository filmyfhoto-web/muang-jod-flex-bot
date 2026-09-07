import { reply } from '../services/lineService.js';
import { getReport } from '../services/jobService.js';
import { generateAndStoreReportCSV } from '../services/reportService.js';
import { reportCardFlex, reportMenuFlex } from '../flex/reportFlex.js';
import { logger } from '../services/logger.js';

// postback action=report_menu (or text command) — show the period picker.
export async function reportMenu({ replyToken }) {
  await reply(replyToken, reportMenuFlex());
}

// postback action=report_daily / report_weekly / report_monthly.
export async function report(ctx, period) {
  const { replyToken, profile } = ctx;
  const data = await getReport(profile.id, period);
  await reply(replyToken, reportCardFlex(data));
}

// postback action=export_csv — build this month's CSV for THIS user only,
// store it privately, and reply with a signed download link.
export async function exportCsv({ replyToken, profile }) {
  try {
    const { filename, signedUrl, rowCount } = await generateAndStoreReportCSV(profile.id, 'monthly');
    if (!signedUrl) {
      return reply(replyToken, {
        type: 'text',
        text: 'ขออภัยค่ะ สร้างลิงก์ดาวน์โหลดไม่สำเร็จ ลองใหม่อีกครั้งนะคะ',
      });
    }
    return reply(replyToken, {
      type: 'text',
      text:
        `📄 รายงาน CSV เดือนนี้พร้อมแล้วค่ะ (${rowCount} รายการ)\n` +
        `ไฟล์: ${filename}\n\n` +
        `ลิงก์ (ใช้ได้ 7 วัน):\n${signedUrl}`,
    });
  } catch (err) {
    logger.error('report.export_failed', { message: err?.message });
    return reply(replyToken, {
      type: 'text',
      text: 'ขออภัยค่ะ ส่งออก CSV ไม่สำเร็จ ลองใหม่อีกครั้งนะคะ 💜',
    });
  }
}
