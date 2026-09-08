import { todayISO, addDays } from './dates.js';

// The choices behind "ตั้งแจ้งเตือนงาน". Each resolves to an absolute instant,
// computed in Bangkok time so "พรุ่งนี้ 9 โมง" means 09:00 for the shop owner
// wherever the server happens to run.

export const REMIND_CHOICES = [
  { id: 'tomorrow_9', label: 'พรุ่งนี้ 09:00', days: 1, hour: 9 },
  { id: 'in3days_9', label: 'อีก 3 วัน 09:00', days: 3, hour: 9 },
  { id: 'nextweek_9', label: 'สัปดาห์หน้า 09:00', days: 7, hour: 9 },
  { id: 'tonight_18', label: 'เย็นนี้ 18:00', days: 0, hour: 18 },
];

export function findChoice(id) {
  return REMIND_CHOICES.find((c) => c.id === id) || null;
}

// Absolute time for a choice. `now` is injectable so the rule is testable.
// A slot that has already passed today rolls to the same time tomorrow —
// a reminder in the past would fire the instant it is created.
export function resolveRemindAt(choiceId, now = new Date()) {
  const choice = findChoice(choiceId);
  if (!choice) return null;

  const base = addDays(todayISO(), choice.days);
  const at = new Date(`${base}T${String(choice.hour).padStart(2, '0')}:00:00+07:00`);
  if (at.getTime() > now.getTime()) return at;

  const next = new Date(`${addDays(base, 1)}T${String(choice.hour).padStart(2, '0')}:00:00+07:00`);
  return next;
}
