import { reply } from '../services/lineService.js';
import { getState, setState, clearState, STATES } from '../services/stateService.js';
import { createJob } from '../services/jobService.js';
import { makeDraft } from '../utils/jobDraft.js';
import { todayISO } from '../utils/dates.js';
import { formatBaht } from '../utils/currency.js';
import { logger } from '../services/logger.js';

/* บันทึกงานที่แยกไว้ทั้งหมดในครั้งเดียว
 *
 * ร้านจดรวดเดียวทั้งวัน ม่วงแยกให้ ร้านกดยืนยันทีเดียว
 */

export function draftsFrom(jobs = [], jobDate = todayISO()) {
  return jobs.map((j) =>
    makeDraft({
      jobName: j.jobName,
      customerName: j.customerName,
      jobDate,
      items: j.items,
      subtotal: j.subtotal,
      discount: j.discount || 0,
      total: j.total,
      paidAmount: j.paidAmount || 0,
    })
  );
}

/* บันทึกทีละใบ แล้วรายงานตามจริง
 *
 * บันทึกสิบงานแล้วงานที่เจ็ดล้ม ไม่ได้แปลว่าอีกเก้างานต้องหายไปด้วย — เก็บ
 * ที่บันทึกได้ไว้ แล้วบอกตรง ๆ ว่าอันไหนไม่เข้า พร้อมเก็บเฉพาะอันที่เหลือไว้
 * ในสถานะ กดบันทึกซ้ำได้โดยไม่ซ้ำของเดิม
 */
export async function confirmSaveDump({ replyToken, profile }) {
  const st = await getState(profile.id);
  const jobs = st?.context?.dump;

  if (st?.state !== STATES.CONFIRMING_DUMP || !Array.isArray(jobs) || !jobs.length) {
    return reply(replyToken, {
      type: 'text',
      text: 'ไม่พบรายการที่รอบันทึกค่ะ พิมพ์รายการงานมาใหม่ได้เลยนะคะ 💜',
    });
  }

  const jobDate = st?.context?.jobDate || todayISO();
  const saved = [];
  const failed = [];

  for (const job of jobs) {
    try {
      const [draft] = draftsFrom([job], jobDate);
      await createJob(profile.id, draft);
      saved.push(job);
    } catch (err) {
      logger.error('dump.save_failed', { no: job.no, message: err?.message });
      failed.push(job);
    }
  }

  if (!saved.length) {
    return reply(replyToken, {
      type: 'text',
      text: 'ขออภัยค่ะ บันทึกไม่สำเร็จเลยสักงาน 😢 กด "✅ บันทึกทั้งหมด" อีกครั้งได้นะคะ',
    });
  }

  const total = saved.reduce((s, j) => s + (Number(j.total) || 0), 0);

  if (failed.length) {
    // เหลือเฉพาะอันที่ยังไม่เข้า กดซ้ำแล้วจะไม่ได้ของซ้ำ
    await setState(profile.id, STATES.CONFIRMING_DUMP, {
      ...st.context,
      dump: failed.map((j, i) => ({ ...j, no: i + 1 })),
    });
    return reply(replyToken, {
      type: 'text',
      text:
        `บันทึกแล้ว ${saved.length} งาน รวม ${formatBaht(total)} ค่ะ\n` +
        `แต่มี ${failed.length} งานที่ยังไม่เข้า: ${failed.map((j) => j.customerName || j.jobName).join(', ')}\n` +
        'กด "✅ บันทึกทั้งหมด" บนการ์ดอีกครั้ง ม่วงจะลองเฉพาะที่เหลือให้ค่ะ 💜',
    });
  }

  await clearState(profile.id);
  return reply(replyToken, {
    type: 'text',
    text:
      `บันทึกให้แล้ว ${saved.length} งาน รวม ${formatBaht(total)} ค่ะ 💜\n` +
      'ดูทั้งหมดได้ที่เมนู "คิวงาน" หรือพิมพ์ "งานวันนี้" ได้เลยนะคะ',
  });
}

export async function cancelSaveDump({ replyToken, profile }) {
  await clearState(profile.id);
  return reply(replyToken, {
    type: 'text',
    text: 'ยกเลิกแล้วค่ะ ยังไม่ได้บันทึกอะไรลงระบบนะคะ ❌',
  });
}
