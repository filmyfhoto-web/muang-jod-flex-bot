/* ทีมของร้าน — บทสนทนาในแชต
 *
 * ฝั่งเจ้าของ: "เพิ่มพนักงาน" ได้รหัสเชิญ · "ทีม" ดูรายชื่อ · "ลบพนักงาน <ชื่อ>"
 * ฝั่งคนถูกชวน: แอดบอทแล้วพิมพ์ "ทีม ABC123" = เข้าทีม เริ่มช่วยจดได้เลย
 * ฝั่งสมาชิก: ใช้ได้เท่าที่ teamGate เปิด (จดงาน/คิว/เกม) นอกนั้นปัดสุภาพ
 *
 * ทุกฟังก์ชันรับ deps ฉีดแทนได้ เพื่อให้เทสต์เดินบทสนทนาได้โดยไม่ต้องมี LINE
 * หรือฐานข้อมูลจริง (ทางเดียวกับ createApiRouter)
 */

import { reply as lineReply } from '../services/lineService.js';
import * as teamService from '../services/teamService.js';
import {
  parseJoinCode,
  OWNER_INVITE_WORDS,
  OWNER_LIST_WORDS,
  OWNER_REMOVE_WORDS,
  JOIN_TEXT,
  MEMBER_POSTBACKS,
  MEMBER_BLOCKED_TEXT,
  MEMBER_DENIED_TEXT,
  INVITE_TTL_HOURS,
} from '../utils/teamGate.js';
import { liffPage } from '../utils/liff.js';
import { publicBaseUrl } from '../utils/brand.js';
import { logger, maskUserId } from '../services/logger.js';

const text = (t) => ({ type: 'text', text: t });

function gameLink() {
  const base = publicBaseUrl();
  return liffPage('game') || (base ? `${base}/game/` : null);
}

export function welcomeMemberText(name) {
  const game = gameLink();
  return (
    `ยินดีต้อนรับเข้าทีมร้านค่ะ${name ? ` คุณ${name}` : ''} 💜\n` +
    'ช่วยร้านได้เลยแบบนี้:\n' +
    '• พิมพ์งานที่รับมาในแชตนี้ = จดเข้าคิวร้านทันที\n' +
    '  เช่น "โรงเรียนบ้านหนองแดง ป้ายไวนิล 3×1 ม. 2 ผืน รับศุกร์"\n' +
    (game ? `• บอร์ดคิวงานแบบเกม: ${game}\n` : '') +
    '• กดปุ่ม "จดงาน" บนเมนูด้านล่างก็ได้\n\n' +
    'เรื่องเงิน บัญชี และรายงาน เป็นของเจ้าของร้านนะคะ'
  );
}

/* คนที่ยังไม่ผ่านด่าน (allowlist เปิดอยู่) พิมพ์อะไรมา — เป็นรหัสเชิญไหม
 * คืน true = จัดการจบแล้ว (ตอบไปแล้ว) · false = ไม่ใช่เรื่องทีม ให้ด่านเดิมปัดตามปกติ */
export async function handleJoinAttempt(event, deps = {}) {
  const { reply = lineReply, svc = teamService } = deps;
  if (event?.type !== 'message' || event.message?.type !== 'text') return false;
  const code = parseJoinCode(event.message.text);
  if (!code) return false;

  const lineUserId = event.source?.userId;
  const r = await svc.redeemInvite(code, lineUserId);
  if (!r.ok) {
    await reply(event.replyToken, text(
      r.reason === 'owner_self'
        ? 'คุณเป็นเจ้าของร้านอยู่แล้วค่ะ ไม่ต้องใช้รหัสนะคะ 💜'
        : 'รหัสไม่ถูกต้องหรือหมดอายุแล้วค่ะ ขอรหัสใหม่จากเจ้าของร้านนะคะ 💜'
    ));
    return true;
  }
  logger.info('team.member_joined', { user: maskUserId(lineUserId), already: Boolean(r.already) });
  await reply(event.replyToken, text(
    r.already ? `คุณอยู่ในทีมร้านอยู่แล้วค่ะ${r.member?.name ? ` คุณ${r.member.name}` : ''} 💜 ช่วยจดงานต่อได้เลย` : welcomeMemberText(r.member?.name)
  ));
  return true;
}

/* คำสั่งทีมของเจ้าของร้าน — คืน true = จัดการจบแล้ว */
export async function handleOwnerTeamCommand(event, profile, deps = {}) {
  const { reply = lineReply, svc = teamService } = deps;
  if (event?.type !== 'message' || event.message?.type !== 'text') return false;
  const t = String(event.message.text ?? '').trim();

  /* พิมพ์รหัสเชิญทั้งที่ผ่านด่านอยู่แล้ว — เกิดได้สองแบบ: เจ้าของเผลอพิมพ์รหัส
   * ของตัวเอง (redeemInvite ตอบ owner_self ให้) หรือบอทยังไม่ตั้ง allowlist
   * แล้วคนที่ถูกชวนพิมพ์รหัสเข้ามา ซึ่งต้องได้เข้าทีมเหมือนทางด่านปิดทุกอย่าง */
  if (JOIN_TEXT.test(t)) return handleJoinAttempt(event, deps);

  if (OWNER_INVITE_WORDS.test(t)) {
    const { code } = await svc.createInvite(profile.id);
    await reply(event.replyToken, text(
      'ชวนคนเข้ามาช่วยจดงานของร้านค่ะ 💜\n' +
      '1) ให้เขาเพิ่มเพื่อนบอทม่วงจด (OA เดียวกับที่คุณใช้อยู่)\n' +
      `2) ให้เขาพิมพ์ในแชตว่า:\nทีม ${code}\n\n` +
      `รหัสใช้ได้ ${INVITE_TTL_HOURS} ชั่วโมง ใช้ได้คนเดียว (ชวนหลายคน พิมพ์ "เพิ่มพนักงาน" อีกครั้งได้เลย)\n` +
      'คนในทีมจะ จดงาน / ดูคิว / ใช้บอร์ดเกมคิวงาน ของร้านนี้ได้\n' +
      'ส่วนเรื่องเงิน บัญชี รายงาน ยังเห็นเฉพาะคุณคนเดียวค่ะ\n\n' +
      'ดูรายชื่อ: พิมพ์ "ทีม" · เอาออก: พิมพ์ "ลบพนักงาน ชื่อ"'
    ));
    return true;
  }

  if (OWNER_LIST_WORDS.test(t)) {
    const members = await svc.listMembers(profile.id);
    if (!members.length) {
      await reply(event.replyToken, text('ยังไม่มีคนในทีมค่ะ — พิมพ์ "เพิ่มพนักงาน" เพื่อสร้างรหัสเชิญนะคะ 💜'));
      return true;
    }
    const lines = members.map((m, i) => `${i + 1}. ${m.name || 'พนักงาน'} — เข้าทีม ${String(m.created_at).slice(0, 10)}`);
    await reply(event.replyToken, text(
      `ทีมของร้าน (${members.length} คน) 💜\n${lines.join('\n')}\n\nเอาออก: พิมพ์ "ลบพนักงาน ชื่อ"`
    ));
    return true;
  }

  const rm = OWNER_REMOVE_WORDS.exec(t);
  if (rm) {
    const name = rm[1].trim();
    const n = await svc.removeMemberByName(profile.id, name);
    await reply(event.replyToken, text(
      n ? `เอา "${name}" ออกจากทีมแล้วค่ะ (${n} คน) เขาจะจดงานเข้าร้านไม่ได้อีก` : `ไม่พบ "${name}" ในทีมค่ะ — พิมพ์ "ทีม" ดูชื่อที่สะกดไว้ก่อนนะคะ`
    ));
    return true;
  }

  return false;
}

/* ด่านของสมาชิกทีม — คืน true = ปัดแล้ว (ตอบสุภาพไปแล้ว) · false = ปล่อยผ่าน */
export async function memberGate(event, deps = {}) {
  const { reply = lineReply } = deps;

  if (event?.type === 'postback') {
    const action = new URLSearchParams(event.postback?.data || '').get('action') || '';
    if (MEMBER_POSTBACKS.has(action)) return false;
    await reply(event.replyToken, text(MEMBER_DENIED_TEXT));
    return true;
  }

  if (event?.type === 'message' && event.message?.type === 'text') {
    const t = String(event.message.text ?? '').trim();
    if (JOIN_TEXT.test(t)) {
      await reply(event.replyToken, text('คุณอยู่ในทีมอยู่แล้วค่ะ 💜 พิมพ์งานที่รับมาได้เลย'));
      return true;
    }
    if (MEMBER_BLOCKED_TEXT.test(t)) {
      await reply(event.replyToken, text(MEMBER_DENIED_TEXT));
      return true;
    }
    return false; // ข้อความปกติ = จดงาน/ถามคิว เดินเครื่องเดิมได้เต็มที่
  }

  // รูป/ไฟล์ (แนบหลักฐานงาน) และ follow ผ่านได้
  return false;
}
