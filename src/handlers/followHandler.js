import { reply } from '../services/lineService.js';
import { clearState } from '../services/stateService.js';
import { syncProfile } from '../services/userService.js';
import { logger } from '../services/logger.js';

const WELCOME = `สวัสดีค่ะ 💜
ม่วงจดพร้อมช่วยจดงานให้แล้วค่ะ

เริ่มง่าย ๆ ด้วยปุ่ม "บันทึกงานวันนี้" ด้านล่างได้เลย`;

function qr(label, action) {
  return {
    type: 'action',
    action: { type: 'postback', label, data: `action=${action}`, displayText: label },
  };
}

const QUICK_REPLY = {
  items: [
    qr('📝 บันทึกงาน', 'add_job'),
    qr('📊 สรุปวันนี้', 'today_summary'),
    qr('💰 ค้างรับ', 'pending_payment'),
    qr('🔍 ค้นหางาน', 'search_jobs'),
    qr('❓ วิธีใช้', 'help'),
  ],
};

// New follower / unblock: greet, refresh profile (best effort), reset state.
export async function handleFollow(event, profile) {
  await clearState(profile.id);

  // Refresh display name / picture from LINE, but never fail onboarding on it.
  try {
    const lineUserId = event.source?.userId;
    if (lineUserId) await syncProfile(profile, lineUserId);
  } catch (err) {
    logger.warn('follow.profile_sync_failed', { message: err?.message });
  }

  await reply(event.replyToken, {
    type: 'text',
    text: WELCOME,
    quickReply: QUICK_REPLY,
  });
}
