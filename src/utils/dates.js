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

// Add days to a YYYY-MM-DD string (date-only, TZ-independent). Returns YYYY-MM-DD.
export function addDays(dateISO, n) {
  const [y, m, d] = String(dateISO).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

// Current year-month in Bangkok, as YYYY-MM.
export function currentYearMonth() {
  return todayISO().slice(0, 7);
}

// A Bangkok-anchored [start, end] timestamp window plus a human label for a
// reporting period: 'daily' (today), 'weekly' (last 7 days), 'monthly' (this month).
export function rangeForPeriod(period) {
  const today = todayISO();

  if (period === 'weekly') {
    const start = addDays(today, -6);
    return {
      period,
      periodKey: today.slice(0, 7),
      label: `7 วันล่าสุด (${formatThaiDate(start)} – ${formatThaiDate(today)})`,
      start: `${start}T00:00:00+07:00`,
      end: `${today}T23:59:59.999+07:00`,
    };
  }

  if (period === 'monthly') {
    const [y, m] = today.split('-').map(Number);
    const first = `${today.slice(0, 7)}-01`;
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const last = `${today.slice(0, 7)}-${String(lastDay).padStart(2, '0')}`;
    return {
      period,
      periodKey: today.slice(0, 7),
      label: formatThaiMonth(first),
      start: `${first}T00:00:00+07:00`,
      end: `${last}T23:59:59.999+07:00`,
    };
  }

  // daily (default)
  return {
    period: 'daily',
    periodKey: today,
    label: formatThaiDate(today),
    start: `${today}T00:00:00+07:00`,
    end: `${today}T23:59:59.999+07:00`,
  };
}

// "กันยายน 2569"
export function formatThaiMonth(input) {
  const d = input ? new Date(`${String(input).slice(0, 10)}T00:00:00+07:00`) : new Date();
  if (Number.isNaN(d.getTime())) return String(input ?? '');
  return new Intl.DateTimeFormat('th-TH', { timeZone: TZ, month: 'long', year: 'numeric' }).format(d);
}

// Thai short date + time in Bangkok, e.g. "7 ก.ย. 2569 10:25".
export function formatThaiDateTime(input) {
  const d = input ? new Date(input) : new Date();
  if (Number.isNaN(d.getTime())) return String(input ?? '');
  return new Intl.DateTimeFormat('th-TH', {
    timeZone: TZ,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
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
