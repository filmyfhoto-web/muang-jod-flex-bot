// Map plain-text menu labels to postback actions.
//
// A Rich Menu built in LINE Official Account Manager usually sends the button
// label as a normal text message instead of a postback. This lets those
// buttons (and typed commands) reach the same handlers as postback buttons.
// Matching is exact (after trimming) so ordinary job text is never hijacked.

const COMMANDS = new Map([
  // 8 core menu buttons
  ['บันทึกงานวันนี้', 'add_job'],
  ['บันทึกงาน', 'add_job'],
  ['แนบสลิป/หลักฐาน', 'attach_evidence'],
  ['แนบสลิป', 'attach_evidence'],
  ['แนบหลักฐาน', 'attach_evidence'],
  ['รายการล่าสุด', 'recent_jobs'],
  ['สรุปวันนี้', 'today_summary'],
  ['แก้ไขล่าสุด', 'edit_latest'],
  ['แก้ล่าสุด', 'edit_latest'],
  ['ยกเลิกล่าสุด', 'cancel_latest'],
  ['ค้างรับ', 'pending_payment'],
  ['ช่วยเหลือ', 'help'],
  ['วิธีใช้', 'help'],
  ['help', 'help'],
  // extras reachable by text
  ['บันทึกรับเงิน', 'record_payment'],
  ['รับเงิน', 'record_payment'],
  ['ค้นหางาน', 'search_jobs'],
  ['ค้นหา', 'search_jobs'],
  ['รายงาน', 'report_menu'],
  ['report', 'report_menu'],
]);

// Normalise: trim, collapse spaces, drop a leading emoji/number decoration,
// lower-case latin. Returns the action name or null.
export function resolveMenuCommand(text) {
  if (!text) return null;
  const cleaned = String(text)
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '') // emoji
    .replace(/^\s*\d+[.)]?\s*/, '') // "1. " / "1) " prefixes
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  if (!cleaned) return null;
  return COMMANDS.get(cleaned) ?? null;
}
