import { reply } from '../services/lineService.js';
import { getDashboard } from '../services/dashboardService.js';
import { dashboardFlex } from '../flex/dashboardFlex.js';
import { liffUrl } from '../utils/liff.js';

// action=open_dashboard — the menu's "แดชบอร์ด" button.
//
// With LIFF configured this is a link into the web view; without it the same
// numbers still arrive as a card, so the button is never a dead end.
export async function openDashboard({ replyToken, profile }) {
  const url = liffUrl({ tab: 'today' });
  const dash = await getDashboard(profile.id, { recentLimit: 3 });

  if (!url) {
    return reply(replyToken, [
      { type: 'text', text: 'นี่คือภาพรวมวันนี้ค่ะ 💜 (เปิดหน้าเว็บได้เมื่อตั้งค่า LIFF แล้วนะคะ)' },
      dashboardFlex(dash),
    ]);
  }

  // No link message after the card: the card's own "📊 เปิดแดชบอร์ด" button
  // goes to the same place, and a raw URL under it only earns a link preview
  // nobody asked for.
  return reply(replyToken, dashboardFlex(dash));
}
