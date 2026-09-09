import { todayISO, addDays } from './dates.js';

// Pull a spoken or typed Thai date out of the front of a job description, so
// "10 กันยา ไก่ทอดน้ำปลา 278" records on the 10th instead of today — and so
// "กันยา" never ends up inside the item name.

// Every way a month gets written or said. Longest first: "กันยายน" must match
// before "กันยา", or the "ยน" is left behind in the description.
const MONTHS = [
  ['มกราคม', 'ม.ค.', 'มกรา'],
  ['กุมภาพันธ์', 'ก.พ.', 'กุมภา'],
  ['มีนาคม', 'มี.ค.', 'มีนา'],
  ['เมษายน', 'เม.ย.', 'เมษา'],
  ['พฤษภาคม', 'พ.ค.', 'พฤษภา'],
  ['มิถุนายน', 'มิ.ย.', 'มิถุนา'],
  ['กรกฎาคม', 'ก.ค.', 'กรกฎา'],
  ['สิงหาคม', 'ส.ค.', 'สิงหา'],
  ['กันยายน', 'ก.ย.', 'กันยา'],
  ['ตุลาคม', 'ต.ค.', 'ตุลา'],
  ['พฤศจิกายน', 'พ.ย.', 'พฤศจิกา'],
  ['ธันวาคม', 'ธ.ค.', 'ธันวา'],
];

// "ก.ย." spoken through a transcriber often comes back as "กย" — accept both.
const MONTH_ALTERNATIVES = MONTHS.flatMap((names, i) =>
  names.flatMap((name) => {
    const bare = name.replace(/\./g, '');
    return (bare === name ? [name] : [name, bare]).map((form) => ({ form, month: i + 1 }));
  })
).sort((a, b) => b.form.length - a.form.length);

const MONTH_PATTERN = MONTH_ALTERNATIVES.map((m) => m.form.replace(/\./g, '\\.')).join('|');

function monthOf(word) {
  const bare = String(word).replace(/\./g, '');
  return MONTH_ALTERNATIVES.find((m) => m.form.replace(/\./g, '') === bare)?.month ?? null;
}

// 68 / 2568 are Buddhist years; 2025 is already Gregorian.
function gregorianYear(raw, fallback) {
  if (raw == null || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  if (n >= 2400) return n - 543; // 2568
  if (n >= 1900) return n; // 2025
  if (n >= 100) return fallback; // nonsense
  return n + 2500 - 543; // 68 -> 2568 -> 2025
}

function iso(year, month, day) {
  if (!(month >= 1 && month <= 12) || !(day >= 1 && day <= 31)) return null;
  const dt = new Date(Date.UTC(year, month - 1, day));
  // Rejects 31 กุมภา rather than silently rolling it into March.
  if (dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day) return null;
  return dt.toISOString().slice(0, 10);
}

// A date with no year said out loud means the one that just happened. But a
// day or two ahead is a slip of the tongue, not last year, so a small window
// forward stays in the current year — anything further back-dates a year.
const FORWARD_GRACE_DAYS = 7;

function resolveYear(month, day, today) {
  const thisYear = Number(today.slice(0, 4));
  const candidate = iso(thisYear, month, day);
  if (!candidate) return null;
  if (candidate <= addDays(today, FORWARD_GRACE_DAYS)) return candidate;
  return iso(thisYear - 1, month, day);
}

// Each pattern gets the whole message and returns [date, matchedText] or null.
// Order matters: the more specific spellings are tried first.
function matchers(today) {
  return [
    // 10 กันยา 68 · 10 ก.ย. 2568 · 10 กันยายน
    (t) => {
      const re = new RegExp(`(\\d{1,2})\\s*(?:วัน)?\\s*(${MONTH_PATTERN})\\s*(\\d{2,4})?`);
      const m = re.exec(t);
      if (!m) return null;
      const month = monthOf(m[2]);
      const day = Number(m[1]);
      const date = m[3]
        ? iso(gregorianYear(m[3]), month, day)
        : resolveYear(month, day, today);
      return date ? [date, m[0]] : null;
    },
    // 10/9/2568 · 10-09-25 · 10/9 — only at the very front, where a date is
    // announced. Mid-sentence, "3/4" is a size ("ท่อ 3/4 นิ้ว"), not April 3rd.
    (t) => {
      const m = /^\s*(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?(?=\s|$)/.exec(t);
      if (!m) return null;
      const day = Number(m[1]);
      const month = Number(m[2]);
      const date = m[3] ? iso(gregorianYear(m[3]), month, day) : resolveYear(month, day, today);
      return date ? [date, m[0]] : null;
    },
    // เมื่อวานซืน / วานซืน — before "เมื่อวาน", which is a prefix of it.
    (t) => {
      const m = /(เมื่อ)?วานซืน(นี้)?/.exec(t);
      return m ? [addDays(today, -2), m[0]] : null;
    },
    (t) => {
      const m = /(เมื่อ)?วาน(นี้)?|เมื่อวานนี้/.exec(t);
      return m ? [addDays(today, -1), m[0]] : null;
    },
    // 3 วันก่อน / 2 วันที่แล้ว
    (t) => {
      const m = /(\d{1,2})\s*วัน(ก่อน|ที่แล้ว|ที่ผ่านมา)/.exec(t);
      return m ? [addDays(today, -Number(m[1])), m[0]] : null;
    },
    (t) => {
      const m = /วันนี้/.exec(t);
      return m ? [today, m[0]] : null;
    },
  ];
}

// Returns { date, rest }: the date spoken in the message (null when none was),
// and the message with that phrase and any "วันที่" label cut out of it.
export function extractDate(text, now = new Date()) {
  const original = String(text ?? '');
  const today = todayISO(now);
  const labelled = original.replace(/วันที่\s*/g, ' ');

  for (const match of matchers(today)) {
    const hit = match(labelled);
    if (!hit) continue;
    const [date, phrase] = hit;
    const rest = labelled.replace(phrase, ' ').replace(/\s+/g, ' ').trim();
    return { date, rest };
  }

  return { date: null, rest: original.trim() };
}
