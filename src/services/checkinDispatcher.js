import { supabase } from '../config/supabase.js';
import { push } from './lineService.js';
import { logger } from './logger.js';
import { lastJobAt } from './nudgeService.js';
import {
  listCheckinTargets,
  getDayState,
  sentKeysForDay,
  claimSend,
  markSent,
  markFailed,
  disableForBlocked,
  shopDay,
} from './checkinService.js';
import { dueSlot, checkinText, CHECKIN_ACTIONS, normalizeSettings } from '../utils/checkinSchedule.js';

/* ม่วงแวะมาถามว่ามีงานให้จดไหม ตามเวลาที่ร้านตั้งไว้
 *
 * เดินบนตัวจับเวลาในโปรเซสเดียวกับ reminderDispatcher และ nudgeDispatcher —
 * ราคาที่จ่ายคือถ้าโฮสต์หลับ ม่วงทักตอนตื่น ไม่ใช่ตรงนาที ซึ่ง GRACE_MINUTES
 * ใน checkinSchedule.js คุมไว้แล้วว่าสายได้แค่ไหนถึงจะยังสมเหตุสมผล
 *
 * ถ้าวันหนึ่งย้ายไปใช้ Supabase Cron หรือ Scheduled Function ตัว dispatchCheckins
 * ด้านล่างเรียกได้ตรง ๆ โดยไม่ต้องแก้อะไร กันส่งซ้ำอยู่ที่ unique_send_key ใน
 * ฐานข้อมูล ไม่ได้อยู่ที่ว่าใครเป็นคนเรียก
 */

const DEFAULT_INTERVAL_MS = 5 * 60_000; // ห้านาทีครั้ง ให้ทักได้ใกล้เวลาที่ตั้งไว้

function quickReplyBlock() {
  return {
    items: CHECKIN_ACTIONS.map((a) => ({
      type: 'action',
      action: { type: 'postback', label: a.label, data: `action=${a.action}`, displayText: a.text },
    })),
  };
}

// LINE ตอบ 403 เมื่อยิงหาคนที่บล็อก OA อยู่
function isBlocked(err) {
  const status = err?.status || err?.statusCode || err?.originalError?.response?.status;
  return status === 403;
}

// หนึ่งรอบ แยกออกมาให้เรียกและทดสอบตรง ๆ ได้
export async function dispatchCheckins(deps = {}) {
  const client = deps.client || supabase;
  const sendPush = deps.push || push;
  const now = deps.now || new Date();

  if (String(deps.env?.CHECKIN_ENABLED ?? process.env.CHECKIN_ENABLED ?? '1') === '0') {
    return { skipped: 'disabled' };
  }

  let targets;
  try {
    targets = await listCheckinTargets(client);
  } catch (err) {
    logger.error('checkin.scan_failed', { message: err?.message });
    return { error: err?.message };
  }

  let sent = 0;
  const skipped = [];

  for (const row of targets) {
    const cfg = normalizeSettings(row);
    const day = shopDay(now, cfg.timezone);

    // อ่านไม่ได้ว่าเคยส่งรอบไหนไปแล้ว — ข้ามไว้ก่อน ยิงซ้ำแย่กว่าไม่ยิง
    const sentKeys = await sentKeysForDay(cfg.lineUserId, day, client);
    if (sentKeys === null) {
      skipped.push('อ่านประวัติการส่งไม่ได้');
      continue;
    }

    const dayState = await getDayState(row.user_id, day, client);
    const recent = await lastJobAt(row.user_id, client);

    const verdict = dueSlot(row, { now, sentKeys, dayState, lastJobAt: recent, isHoliday: deps.isHoliday });
    if (!verdict.ok) {
      skipped.push(verdict.why);
      continue;
    }

    // จองก่อนยิง แพ้การจองแปลว่ามีคนอื่นส่งไปแล้ว ไม่ใช่ความผิดพลาด
    const claimed = await claimSend(
      { userId: row.user_id, lineUserId: cfg.lineUserId, key: verdict.key, slot: verdict.slot, scheduledAt: now.toISOString() },
      client
    );
    if (!claimed) {
      skipped.push('มีรอบนี้อยู่แล้ว');
      continue;
    }

    try {
      await sendPush(cfg.lineUserId, {
        type: 'text',
        text: checkinText(verdict.slot, cfg.displayName, cfg.message),
        quickReply: quickReplyBlock(),
      });
      await markSent(verdict.key, client);
      sent += 1;
    } catch (err) {
      await markFailed(verdict.key, err?.message, client);
      // บล็อกแล้วก็หยุดตารางของคนนี้ไปเลย ไม่ใช่ยิงใหม่ทุกวันไปตลอดกาล
      if (isBlocked(err)) await disableForBlocked(row.user_id, client);
      else logger.error('checkin.push_failed', { userId: row.user_id, message: err?.message });
    }
  }

  if (targets.length) logger.info('checkin.pass', { targets: targets.length, sent, skipped: skipped.length });
  return { targets: targets.length, sent, skipped };
}

// เริ่มตัวจับเวลา คืนฟังก์ชันหยุด unref ไว้ไม่ให้ค้างโปรเซส
export function startCheckinDispatcher(opts = {}) {
  const intervalMs = Number(process.env.CHECKIN_INTERVAL_MS) || opts.intervalMs || DEFAULT_INTERVAL_MS;
  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await dispatchCheckins(opts);
    } catch (err) {
      logger.error('checkin.tick_failed', { message: err?.message });
    } finally {
      running = false;
    }
  };

  const timer = setInterval(tick, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();
  logger.info('checkin.dispatcher_started', { intervalMs });
  return () => clearInterval(timer);
}
