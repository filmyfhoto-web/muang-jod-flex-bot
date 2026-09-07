const TZ = 'Asia/Bangkok';

// Returns today's date in Bangkok timezone as YYYY-MM-DD.
export function todayISO() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return parts; // en-CA gives YYYY-MM-DD
}

// Start and end ISO timestamps (UTC) covering "today" in Bangkok time.
export function todayRange() {
  const date = todayISO();
  return {
    date,
    start: `${date}T00:00:00+07:00`,
    end: `${date}T23:59:59.999+07:00`,
  };
}

// Format a date/timestamp into Thai short form, e.g. "7 ก.ย. 2569".
export function formatThaiDate(input) {
  const d = input ? new Date(input) : new Date();
  if (Number.isNaN(d.getTime())) return String(input ?? '');
  return new Intl.DateTimeFormat('th-TH', {
    timeZone: TZ,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(d);
}
