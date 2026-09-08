import { reply } from '../services/lineService.js';
import { getLatestJob, getJobById } from '../services/jobService.js';
import { createReminder, cancelReminder, getUpcomingReminders } from '../services/reminderService.js';
import { remindPickerFlex, reminderSetFlex } from '../flex/reminderFlex.js';
import { resolveRemindAt, findChoice } from '../utils/remindTimes.js';
import { formatThaiDateTime } from '../utils/dates.js';
import { formatBaht } from '../utils/currency.js';

// action=remind_job — offer the times. Attaches to a named job, else the
// latest one, else stands alone as a plain nudge.
export async function remindPrompt({ replyToken, profile, params }) {
  const job = params?.jobId ? await getJobById(profile.id, params.jobId) : await getLatestJob(profile.id);
  return reply(replyToken, remindPickerFlex(job));
}

// action=set_reminder&when=…&jobId=…
export async function setReminder({ replyToken, profile, params }) {
  const choice = findChoice(params?.when);
  if (!choice) {
    return reply(replyToken, { type: 'text', text: 'ไม่รู้จักเวลานี้ค่ะ ลองกด "ตั้งแจ้งเตือนงาน" ใหม่นะคะ' });
  }

  const remindAt = resolveRemindAt(choice.id);
  const job = params?.jobId ? await getJobById(profile.id, params.jobId) : null;

  const message = job
    ? `งาน "${job.job_name}"${job.customer_name ? ` ของ${job.customer_name}` : ''} ยอด ${formatBaht(Number(job.total) || 0)}`
    : 'ถึงเวลาดูงานที่ค้างอยู่แล้วค่ะ';

  const reminder = await createReminder(profile.id, { jobId: job?.id || null, message, remindAt });
  if (!reminder) {
    return reply(replyToken, { type: 'text', text: 'ตั้งเตือนไม่สำเร็จค่ะ ลองใหม่อีกครั้งนะคะ' });
  }

  return reply(replyToken, reminderSetFlex(reminder, job));
}

// action=cancel_reminder&reminderId=…
export async function cancelReminderAction({ replyToken, profile, params }) {
  const cancelled = params?.reminderId ? await cancelReminder(profile.id, params.reminderId) : null;
  return reply(replyToken, {
    type: 'text',
    text: cancelled ? 'ยกเลิกการเตือนแล้วค่ะ 💜' : 'ไม่พบการเตือนนี้ หรือถูกยกเลิกไปแล้วค่ะ',
  });
}

// action=my_reminders — what is still queued.
export async function listReminders({ replyToken, profile }) {
  const rows = await getUpcomingReminders(profile.id);
  if (!rows.length) {
    return reply(replyToken, {
      type: 'text',
      text: 'ยังไม่มีการแจ้งเตือนที่ตั้งไว้ค่ะ\nกด "ตั้งแจ้งเตือนงาน" เพื่อให้ม่วงจดเตือนได้นะคะ ⏰',
    });
  }

  const lines = rows
    .slice(0, 10)
    .map((r, i) => `${i + 1}. ${formatThaiDateTime(r.remind_at)}\n   ${r.message}`)
    .join('\n');
  return reply(replyToken, { type: 'text', text: `⏰ การแจ้งเตือนที่ตั้งไว้\n\n${lines}` });
}
