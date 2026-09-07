// Format a number as Thai Baht, e.g. 1250 -> "฿1,250"
export function formatBaht(amount) {
  const n = Number(amount) || 0;
  const formatted = n.toLocaleString('th-TH', {
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `฿${formatted}`;
}

// Parse a price token like "150", "1,250", "150บาท" into a number.
export function parsePrice(text) {
  if (text == null) return 0;
  const cleaned = String(text).replace(/[^0-9.]/g, '');
  const value = parseFloat(cleaned);
  return Number.isFinite(value) ? value : 0;
}

// Round to 2 decimals to avoid floating point noise.
export function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}
