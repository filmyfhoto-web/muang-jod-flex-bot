import { reply } from '../services/lineService.js';
import { getAiUsageSummary } from '../services/aiUsageService.js';
import { formatBaht, usdToThb } from '../utils/aiCost.js';
import { formatThaiDate } from '../utils/dates.js';

// action=ai_cost — "ค่า AI": วันนี้ / เดือนนี้ / 7 วันล่าสุด เป็นบาท
export async function aiCost({ replyToken, profile }) {
  const s = await getAiUsageSummary(profile.id);
  if (!s) {
    return reply(replyToken, {
      type: 'text',
      text: 'ยังดูค่า AI ไม่ได้ค่ะ 😔 ต้องรันไมเกรชัน 017_ai_usage.sql ใน Supabase ก่อน (ทำครั้งเดียว)',
    });
  }

  const lines = [
    '💜 ค่า AI ที่ใช้ไป (อ่านรูป)',
    '',
    `วันนี้ ${s.today.count} รูป ≈ ${formatBaht(s.today.usd)}`,
    `เดือนนี้ ${s.month.count} รูป ≈ ${formatBaht(s.month.usd)}`,
  ];
  if (s.days.length) {
    lines.push('', '7 วันล่าสุด');
    for (const d of s.days) lines.push(`• ${formatThaiDate(d.day)} — ${d.count} รูป ≈ ${formatBaht(d.usd)}`);
  }
  lines.push(
    '',
    `คิดจากจำนวนโทเคนจริงที่ Anthropic ตอบกลับ x ${usdToThb()} บาท/ดอลลาร์ ยอดบิลจริงดูที่ console.anthropic.com`
  );
  return reply(replyToken, { type: 'text', text: lines.join('\n') });
}
