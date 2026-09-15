import { reply } from '../services/lineService.js';
import { setState, STATES } from '../services/stateService.js';
import { getJobsInPeriod, attachItems } from '../services/jobService.js';
import { categoryLabel } from '../utils/category.js';
import { logger } from '../services/logger.js';
import {
  getCheckinSettings,
  saveCheckinSettings,
  setDayState,
  logResponse,
  shopDay,
  settingsView,
} from '../services/checkinService.js';
import { SNOOZE_CHOICES, snoozeUntil, snoozeUntilAt, snoozeText } from '../utils/checkinSchedule.js';
import { quickFormUrl, liffUrl } from '../utils/liff.js';

/* ปุ่มห้าปุ่มบนข้อความที่ม่วงทักไป
 *
 * ทุกปุ่มต้องจบเรื่องได้ในตัวเอง ไม่ใช่พาไปเปิดหน้าอื่นแล้วค่อยทำต่อ — ข้อความ
 * ที่ทักมาตอนร้านกำลังยุ่งจะได้ใช้เวลาแค่แตะเดียว
 *
 * และของสำคัญที่สุดในไฟล์นี้: บันทึกว่า "ตอบแล้ว" เฉพาะตอนที่ร้านกดจริง ๆ
 * การไม่ตอบไม่ใช่คำตอบ ไม่มีที่ไหนในนี้ที่เขียนว่าไม่มีงานให้เองได้
 */

async function dayOf(profile) {
  const row = await getCheckinSettings(profile.id);
  const cfg = settingsView(row);
  return { cfg, day: shopDay(new Date(), cfg.timezone), lineUserId: row?.line_user_id || profile.line_user_id };
}

// บันทึกคำตอบทั้งสองที่: สถานะของวัน (ใช้ตัดสินว่าจะถามอีกไหม) และ log
// (ใช้ดูย้อนหลังว่าร้านตอบว่าอะไร) ล้มที่ใดที่หนึ่งไม่ควรทำให้ร้านเห็น error
async function remember(profile, answer, patch = {}) {
  try {
    const { day, lineUserId } = await dayOf(profile);
    await setDayState(profile.id, day, { answer, answered_at: new Date().toISOString(), ...patch });
    if (lineUserId) await logResponse(lineUserId, day, answer);
  } catch (err) {
    logger.warn('checkin.remember_failed', { message: err?.message });
  }
}

/* ✏️ มีงานให้จด — เข้าโหมดคุยเก็บงานต่อทันที ไม่ต้องเปิดฟอร์ม */
export async function checkinHasWork({ replyToken, profile }) {
  await remember(profile, 'has_work');
  await setState(profile.id, STATES.WAITING_FOR_JOB, {});
  return reply(replyToken, {
    type: 'text',
    text: 'ได้เลยค่ะ วันนี้มีงานอะไรคะ?\nพิมพ์มาได้เลย เช่น "มีงานกรอบรูป" แล้วม่วงจะถามต่อให้เองค่ะ 💜',
  });
}

/* 📋 ดูงานวันนี้ */
export async function checkinToday({ replyToken, profile }) {
  await remember(profile, 'view');

  const { rows } = await getJobsInPeriod(profile.id, 'daily');
  const jobs = await attachItems(rows.filter((j) => j.status !== 'cancelled'));
  if (!jobs.length) {
    return reply(replyToken, {
      type: 'text',
      text: 'วันนี้ยังไม่มีงานที่จดไว้เลยค่ะ\nมีงานให้ม่วงจดไหมคะ? พิมพ์มาได้เลย 💜',
    });
  }

  // "1. กรอบรูป 12 × 18 นิ้ว — คุณแอน"
  const lines = jobs.slice(0, 10).map((job, i) => {
    const name = job.job_name || categoryLabel(job);
    const size = (job.items || []).map((it) => it.size).find(Boolean);
    const who = job.customer_name ? ` — ${job.customer_name}` : '';
    return `${i + 1}. ${[name, size].filter(Boolean).join(' ')}${who}`;
  });
  const more = jobs.length > lines.length ? `\n…และอีก ${jobs.length - lines.length} งานค่ะ` : '';

  return reply(replyToken, {
    type: 'text',
    text: `วันนี้มีงานทั้งหมด ${jobs.length} งานค่ะ\n\n${lines.join('\n')}${more}`,
    quickReply: {
      items: [
        addWorkButton(),
        { type: 'action', action: { type: 'postback', label: '✏️ แก้ไขรายการ', data: 'action=recent_jobs', displayText: 'แก้ไขรายการ' } },
        { type: 'action', action: { type: 'postback', label: '📊 ดูสรุปวันนี้', data: 'action=today_summary', displayText: 'ดูสรุปวันนี้' } },
      ],
    },
  });
}

// ➕ จดงานเพิ่ม — เปิดฟอร์มจดด่วนถ้ามี LIFF ไม่มีก็คุยในแชตต่อได้เหมือนกัน
function addWorkButton() {
  const uri = quickFormUrl({});
  return {
    type: 'action',
    action: uri
      ? { type: 'uri', label: '➕ จดงานเพิ่ม', uri }
      : { type: 'postback', label: '➕ จดงานเพิ่ม', data: 'action=checkin_has_work', displayText: 'จดงานเพิ่ม' },
  };
}

/* ✅ วันนี้ไม่มีงาน — บันทึกว่าตอบแล้ว วันนี้ไม่ถามซ้ำ */
export async function checkinNoWork({ replyToken, profile }) {
  await remember(profile, 'no_work');
  return reply(replyToken, {
    type: 'text',
    text: 'รับทราบค่ะ วันนี้ม่วงจดจะไม่ถามซ้ำแล้วนะคะ 💜',
  });
}

/* ⏰ เตือนอีกที — ให้เลือกเวลาก่อน ยังไม่ถือว่าตอบแล้ว */
export async function checkinSnooze({ replyToken, profile, params }) {
  const { cfg, day } = await dayOf(profile);

  // ยังไม่ได้เลือกเวลา — เสนอตัวเลือกให้กด
  if (!params?.when) {
    const items = SNOOZE_CHOICES.map((c) => ({
      type: 'action',
      action: {
        type: 'postback',
        label: c.label,
        data: `action=checkin_snooze&when=${c.id}`,
        displayText: c.label,
      },
    }));
    // "เลือกเวลาอื่น" — ให้ LINE เปิดตัวเลือกเวลาของเครื่อง ไม่ต้องพิมพ์เอง
    items.push({
      type: 'action',
      action: {
        type: 'datetimepicker',
        label: 'เลือกเวลาอื่น',
        data: 'action=checkin_snooze&when=pick',
        mode: 'time',
      },
    });
    return reply(replyToken, {
      type: 'text',
      text: 'ให้ม่วงกลับมาถามตอนไหนดีคะ?',
      quickReply: { items },
    });
  }

  const now = new Date();
  // "เลือกเวลาอื่น" — LINE ส่งเวลากลับมาใน postback.params.time เป็น 'HH:MM'
  const until =
    params.when === 'pick'
      ? snoozeUntilAt(params.time, { now, timezone: cfg.timezone })
      : snoozeUntil(params.when, { now, timezone: cfg.timezone });

  if (!until) {
    return reply(replyToken, {
      type: 'text',
      text: 'เวลานั้นผ่านไปแล้ววันนี้ค่ะ 😅 เลือกเวลาอื่นได้ไหมคะ?',
    });
  }

  // เลื่อนไม่ใช่การตอบ — answered_at ต้องยังว่าง ไม่งั้นพอถึงเวลาก็จะไม่ถาม
  await setDayState(profile.id, day, { snooze_until: until.toISOString() });
  return reply(replyToken, { type: 'text', text: snoozeText(until, cfg.timezone) });
}

/* 🔕 ไม่ต้องเตือนวันนี้ — เงียบเฉพาะวันนี้ พรุ่งนี้ทักตามปกติ */
export async function checkinMuteToday({ replyToken, profile }) {
  const { day, lineUserId } = await dayOf(profile);
  // ปิดเสียงไม่ใช่การตอบว่ามีงานหรือไม่มีงาน answered_at จึงยังว่าง — แต่ muted
  // ก็พอที่จะไม่ถามซ้ำวันนี้แล้ว
  await setDayState(profile.id, day, { muted: true });
  try {
    if (lineUserId) await logResponse(lineUserId, day, 'mute');
  } catch {
    /* ไม่ได้บันทึก log ก็ไม่ควรทำให้ร้านเห็น error */
  }
  return reply(replyToken, {
    type: 'text',
    text: 'ได้เลยค่ะ วันนี้ม่วงจดจะไม่รบกวนแล้วนะคะ\nพรุ่งนี้ม่วงจะแวะมาถามใหม่ตามปกติค่ะ 💜',
  });
}

/* ปิดถาวร — จากหน้าตั้งค่าหรือพิมพ์บอกก็ได้ */
export async function checkinOff({ replyToken, profile }) {
  try {
    await saveCheckinSettings(profile.id, profile.line_user_id, { enabled: false });
  } catch {
    return reply(replyToken, { type: 'text', text: 'ตอนนี้บันทึกไม่สำเร็จค่ะ 😢 ลองใหม่อีกครั้งนะคะ' });
  }
  const settings = liffUrl({ tab: 'settings' });
  return reply(replyToken, {
    type: 'text',
    text:
      'ได้เลยค่ะ ม่วงจะไม่ทักถามงานตามเวลาแล้วนะคะ 💜' +
      (settings ? `\nอยากเปิดใหม่เมื่อไหร่ เปิดได้ที่หน้าตั้งค่าค่ะ\n${settings}` : ''),
  });
}
