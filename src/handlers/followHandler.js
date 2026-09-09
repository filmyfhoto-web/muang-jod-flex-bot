import { reply } from '../services/lineService.js';
import { clearState } from '../services/stateService.js';
import { syncProfile } from '../services/userService.js';
import { logger } from '../services/logger.js';
import { brandAssetUrl, MASCOT } from '../utils/brand.js';

const WELCOME = `สวัสดีค่ะ 💜
พิมพ์รายละเอียดงานที่ต้องการให้บันทึกได้เลย
ม่วงจดจะจัดเก็บให้ทันทีค่ะ

เช่น  ป้ายไวนิล 60x100 150 บาท
หรือกดเมนู "บันทึกงานวันนี้" ด้านล่างนะคะ`;

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

  await reply(event.replyToken, welcomeMessages());
}

// The waving mascot leads the greeting when the image is available. The
// quick-reply bar is not set here — the send path puts it on the last message
// of every reply, and this greeting is no exception.
export function welcomeMessages(mascotUrl = brandAssetUrl(MASCOT.wave)) {
  const text = { type: 'text', text: WELCOME };
  if (!mascotUrl) return [text];
  return [{ type: 'image', originalContentUrl: mascotUrl, previewImageUrl: mascotUrl }, text];
}
