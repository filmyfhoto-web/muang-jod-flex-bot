import { formatThaiDate } from '../../utils/dates.js';
import { todayISO } from '../../utils/dates.js';
import { COLORS } from '../theme.js';

// "📅 นัดรับ 15 ก.ย. 2569 · อีก 5 วัน" — the one line every card uses to say
// when a job is due, so the wording never drifts between them.
//
// The countdown is the point: a date alone makes the shop do the arithmetic,
// and "เลยกำหนดแล้ว" is the thing they most need to see without doing any.
export function dueText(dueDate, today = todayISO()) {
  if (!dueDate) return null;
  const days = Math.round((Date.parse(`${dueDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
  if (!Number.isFinite(days)) return null;

  const when =
    days < 0 ? `เลยกำหนด ${Math.abs(days)} วัน` : days === 0 ? 'วันนี้' : days === 1 ? 'พรุ่งนี้' : `อีก ${days} วัน`;
  return { text: `📅 นัดรับ ${formatThaiDate(dueDate)} · ${when}`, late: days < 0, soon: days >= 0 && days <= 1 };
}

// The same line as a Flex text node, or null when the job has no pickup date.
export function dueLine(dueDate, { size = 'xs', today = todayISO() } = {}) {
  const due = dueText(dueDate, today);
  if (!due) return null;
  return {
    type: 'text',
    text: due.text,
    size,
    weight: due.late || due.soon ? 'bold' : 'regular',
    color: due.late ? COLORS.red : due.soon ? COLORS.orange : COLORS.sub,
    wrap: true,
  };
}
