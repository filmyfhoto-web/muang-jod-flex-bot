// ราคาโมเดลเป็นดอลลาร์ต่อล้านโทเคน [ขาเข้า, ขาออก] — เรียงจากเฉพาะเจาะจงไปทั่วไป
const PRICES = [
  [/fable/, 10, 50],
  [/opus-5-5/, 4, 20],
  [/opus-(?:5|4)/, 5, 25],
  [/sonnet-5/, 2, 10],
  [/sonnet-4/, 3, 15],
  [/haiku/, 1, 5],
];

// รุ่นที่ไม่รู้จักคิดแพงไว้ก่อน ดีกว่าบอกว่าถูกเกินจริง
const FALLBACK = [3, 15];

export function usdPerMillion(model) {
  const name = String(model || '').toLowerCase();
  for (const [re, input, output] of PRICES) {
    if (re.test(name)) return { input, output };
  }
  return { input: FALLBACK[0], output: FALLBACK[1] };
}

export function costUsd(model, inputTokens = 0, outputTokens = 0) {
  const p = usdPerMillion(model);
  const usd = ((Number(inputTokens) || 0) * p.input + (Number(outputTokens) || 0) * p.output) / 1_000_000;
  return Math.round(usd * 1e6) / 1e6;
}

export function usdToThb(env = process.env) {
  const rate = Number(env.USD_THB);
  return Number.isFinite(rate) && rate > 0 ? rate : 35;
}

// "฿0.45" สำหรับยอดเล็ก, "฿132" สำหรับยอดใหญ่
export function formatBaht(usd, env = process.env) {
  const baht = (Number(usd) || 0) * usdToThb(env);
  return baht < 10 ? `฿${baht.toFixed(2)}` : `฿${Math.round(baht).toLocaleString('en-US')}`;
}
