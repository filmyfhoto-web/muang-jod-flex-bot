/* ม่วงแวะมาถามว่ามีงานให้จดไหม — ตัวตัดสินว่า "ตอนนี้ถึงเวลาทักใครหรือยัง"
 *
 * ทั้งไฟล์เป็นฟังก์ชันล้วน ไม่แตะฐานข้อมูล ไม่แตะ LINE รับเวลากับการตั้งค่าเข้าไป
 * แล้วคืนคำตอบออกมา — เพราะกฎพวกนี้ทดสอบยากมากถ้าต้องมีนาฬิกาจริงกับเน็ตจริง
 * และกฎที่ทดสอบไม่ได้คือกฎที่จะส่งข้อความผิดเวลาให้ร้านสักวันหนึ่ง
 *
 * ทุกกฎในนี้เขียนไว้เพื่อ "อย่าส่ง" ไม่ใช่ "ส่ง" การส่งเกินหนึ่งครั้งทำลาย
 * ความไว้ใจมากกว่าการไม่ส่งเลย
 */

export const DEFAULT_TIMES = ['12:00', '18:00'];
export const DEFAULT_TZ = 'Asia/Bangkok';
export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

// ทักช้าได้ไม่เกินเท่านี้ — โฮสต์หลับแล้วตื่นมาตอนบ่ายสาม ไม่ควรทักรอบเที่ยง
// ย้อนหลัง มันอ่านเหมือนบอทค้าง ไม่ใช่เหมือนคนแวะมาถาม
export const GRACE_MINUTES = 90;

// เพิ่งจดงานไปหยก ๆ ก็ไม่ต้องถามว่ามีงานไหม เขาเพิ่งตอบไปแล้วด้วยการกระทำ
export const RECENT_JOB_MINUTES = 90;

/* --------------------------------------------------------------- เวลา */

// วัน เวลา และวันในสัปดาห์ ตามเขตเวลาของร้าน ไม่ใช่ของเครื่องที่รันอยู่
//
// Render รันด้วย UTC ถ้าอ่านวันจากเครื่องตรง ๆ ร้านไทยจะข้ามวันตอนตีเจ็ด
export function zonedParts(date = new Date(), timeZone = DEFAULT_TZ) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short',
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  const weekdays = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  // 24 นาฬิกาในบางโลแคลคือเที่ยงคืนของวันถัดไป ปรับให้เป็น 0
  const hour = Number(parts.hour) % 24;
  return {
    day: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: weekdays[parts.weekday] ?? 0,
    minutes: hour * 60 + Number(parts.minute),
  };
}

// 'HH:MM' → นาทีนับจากเที่ยงคืน คืน null เมื่อรูปแบบไม่ถูก
export function toMinutes(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm ?? '').trim());
  if (!m) return null;
  const hours = Number(m[1]);
  const mins = Number(m[2]);
  if (hours > 23 || mins > 59) return null;
  return hours * 60 + mins;
}

export function toHHMM(minutes) {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/* ------------------------------------------------------- การตั้งค่าที่ใช้จริง */

// เติมค่าที่ขาดให้ครบ และทิ้งค่าที่ใช้ไม่ได้
//
// ไม่มีแถวในตาราง = ใช้ค่าเริ่มต้นทั้งหมด ร้านที่ไม่เคยเข้าหน้าตั้งค่าเลยต้อง
// ได้พฤติกรรมที่ถูกต้อง ไม่ใช่เงียบไปเฉย ๆ
export function normalizeSettings(row = {}) {
  const times = (Array.isArray(row.reminder_times) ? row.reminder_times : DEFAULT_TIMES)
    .map((t) => (toMinutes(t) === null ? null : toHHMM(toMinutes(t))))
    .filter(Boolean);
  const days = (Array.isArray(row.active_days) ? row.active_days : ALL_DAYS)
    .map(Number)
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);

  return {
    enabled: row.enabled !== false,
    lineUserId: row.line_user_id || null,
    displayName: row.display_name || null,
    // เรียงเวลาแล้วตัดที่ซ้ำ จะได้ไม่มีรอบซ้อนกันเอง
    times: [...new Set(times.length ? times : DEFAULT_TIMES)].sort(),
    days: days.length ? [...new Set(days)].sort() : ALL_DAYS,
    timezone: row.timezone || DEFAULT_TZ,
    skipHolidays: Boolean(row.skip_holidays),
    message: row.preferred_message || null,
  };
}

/* ------------------------------------------------- ถึงเวลาทักหรือยัง */

// กุญแจกันส่งซ้ำ: คนนี้ วันนี้ รอบนี้ ประเภทนี้ ส่งได้ครั้งเดียวตลอดกาล
export function sendKey({ lineUserId, day, slot, type = 'checkin' }) {
  return [lineUserId, day, slot, type].join('|');
}

/* รอบที่ถึงเวลาแล้วและยังไม่ได้ส่ง — คืน null พร้อมเหตุผลเสมอเมื่อไม่ส่ง
 *
 * `sentKeys` คือกุญแจของรอบที่ส่งไปแล้ว (อ่านมาจาก notification_logs)
 * `dayState` คือสถานะของวันนี้: ตอบแล้วหรือยัง ปิดเสียงวันนี้ไหม เลื่อนไปถึงกี่โมง
 */
export function dueSlot(settings, ctx = {}) {
  const cfg = normalizeSettings(settings);
  const now = ctx.now || new Date();
  const { day, weekday, minutes } = zonedParts(now, cfg.timezone);
  const dayState = ctx.dayState || {};
  const sentKeys = ctx.sentKeys instanceof Set ? ctx.sentKeys : new Set(ctx.sentKeys || []);

  if (!cfg.enabled) return { ok: false, why: 'ปิดการทักไว้' };
  if (!cfg.lineUserId) return { ok: false, why: 'ไม่มี LINE user id' };
  if (!cfg.days.includes(weekday)) return { ok: false, why: 'ไม่ใช่วันที่ตั้งให้ทัก' };
  if (cfg.skipHolidays && ctx.isHoliday) return { ok: false, why: 'วันหยุด' };

  // ตอบไปแล้วว่ามีงาน/ไม่มีงาน — วันนี้ไม่ถามอีก ไม่ว่าจะเหลืออีกกี่รอบ
  if (dayState.answered_at) return { ok: false, why: 'ตอบไปแล้ววันนี้' };
  if (dayState.muted) return { ok: false, why: 'ปิดเสียงเฉพาะวันนี้' };
  if (dayState.snooze_until && now < new Date(dayState.snooze_until)) {
    return { ok: false, why: 'เลื่อนไปก่อน' };
  }

  // เพิ่งจดงานไป ไม่ต้องถาม เขาตอบไปแล้วด้วยการจด
  if (ctx.lastJobAt && now - new Date(ctx.lastJobAt) < RECENT_JOB_MINUTES * 60_000) {
    return { ok: false, why: 'เพิ่งจดงานไป' };
  }

  // รอบที่เลยเวลามาแล้วแต่ยังไม่เกินเวลาผ่อนผัน เอาอันที่ใหม่ที่สุด —
  // ตื่นมาตอนหกโมงครึ่งแล้วมีทั้งรอบเที่ยงและรอบหกโมงค้าง ควรถามรอบหกโมง
  // ไม่ใช่ถามรอบเที่ยงย้อนหลัง
  const ready = cfg.times
    .map((slot) => ({ slot, at: toMinutes(slot) }))
    .filter(({ at }) => at !== null && minutes >= at && minutes - at <= GRACE_MINUTES)
    .sort((a, b) => b.at - a.at);

  if (!ready.length) return { ok: false, why: 'ยังไม่ถึงเวลา' };

  for (const { slot } of ready) {
    const key = sendKey({ lineUserId: cfg.lineUserId, day, slot });
    if (!sentKeys.has(key)) return { ok: true, slot, day, key, settings: cfg };
  }

  return { ok: false, why: 'ส่งรอบนี้ไปแล้ว' };
}

/* -------------------------------------------------------- เลื่อนเวลา */

export const SNOOZE_CHOICES = [
  { id: '1h', label: 'อีก 1 ชั่วโมง', minutes: 60 },
  { id: '2h', label: 'อีก 2 ชั่วโมง', minutes: 120 },
  { id: '17', label: 'เวลา 17:00 น.', at: '17:00' },
];

// เวลาตายตัวของวันนี้ ('17:00') → เวลาจริง คืน null เมื่อผ่านไปแล้ววันนี้
//
// คิดจากส่วนต่างของนาทีตามเขตเวลาร้าน ไม่ต้องแปลงวันที่ข้ามโซน ซึ่งเป็นที่ที่
// บั๊กเรื่องเวลาชอบไปอยู่
export function snoozeUntilAt(hhmm, { now = new Date(), timezone = DEFAULT_TZ } = {}) {
  const target = toMinutes(hhmm);
  if (target === null) return null;
  const { minutes } = zonedParts(now, timezone);
  if (target <= minutes) return null;
  return new Date(now.getTime() + (target - minutes) * 60_000);
}

// เวลาที่จะกลับมาถามใหม่ คืน null เมื่อเลือกเวลาที่ผ่านไปแล้ววันนี้
export function snoozeUntil(choice, { now = new Date(), timezone = DEFAULT_TZ } = {}) {
  const pick = SNOOZE_CHOICES.find((c) => c.id === choice) || null;
  if (!pick) return null;
  if (pick.minutes) return new Date(now.getTime() + pick.minutes * 60_000);
  return snoozeUntilAt(pick.at, { now, timezone });
}

// "ได้เลยค่ะ ม่วงจดจะกลับมาถามอีกครั้งเวลา 17:00 น."
export function snoozeText(until, timezone = DEFAULT_TZ) {
  const { minutes } = zonedParts(until, timezone);
  return `ได้เลยค่ะ ม่วงจดจะกลับมาถามอีกครั้งเวลา ${toHHMM(minutes)} น. 💜`;
}

/* ------------------------------------------------------- ข้อความที่ทัก */

// รอบไหนของวันถามคนละอย่าง — ตอนเที่ยงถามงานช่วงเช้าที่ผ่านมาแล้ว ตอนเย็นถาม
// ว่ามีอะไรตกหล่นอีกไหม ถามประโยคเดียวกันสองรอบอ่านเหมือนบอทที่ไม่รู้ว่าเคยถาม
export function checkinText(slot, displayName, preferred = null) {
  const who = displayName ? `${displayName}คะ` : 'สวัสดีค่ะ';
  if (preferred) return `${who} ${preferred}`;
  const at = toMinutes(slot) ?? 0;
  if (at < 15 * 60) return `${who} ช่วงเช้ามีงานอะไรให้ม่วงจดไหมคะ? 💜`;
  return `${who} วันนี้มีงานที่ยังไม่ได้จดอีกไหมคะ? ให้ม่วงช่วยจดได้นะ 💜`;
}

/* ปุ่มบนข้อความที่ทักไป ทางออกอยู่ในมือร้านเสมอ
 *
 * ป้ายปุ่มยาวได้ไม่เกิน 20 หน่วย UTF-16 (อีโมจินอก BMP กินสองหน่วย) LINE ไม่ได้
 * ตัดป้ายที่ยาวเกินให้ — มันปฏิเสธทั้งข้อความ แปลว่าร้านจะไม่ได้รับอะไรเลย
 * "🔕 ไม่ต้องเตือนวันนี้" ยาว 21 พอดี ป้ายจึงสั้นกว่าคำเต็ม ส่วนคำเต็มไปอยู่ใน
 * displayText กับข้อความที่ตอบกลับ
 */
export const CHECKIN_ACTIONS = [
  { label: '✏️ มีงานให้จด', action: 'checkin_has_work', text: 'มีงานให้จด' },
  { label: '📋 ดูงานวันนี้', action: 'checkin_today', text: 'ดูงานวันนี้' },
  { label: '✅ วันนี้ไม่มีงาน', action: 'checkin_no_work', text: 'วันนี้ไม่มีงาน' },
  { label: '⏰ เตือนอีกที', action: 'checkin_snooze', text: 'เตือนอีกที' },
  { label: '🔕 วันนี้ไม่ต้อง', action: 'checkin_mute_today', text: 'ไม่ต้องเตือนวันนี้' },
];
