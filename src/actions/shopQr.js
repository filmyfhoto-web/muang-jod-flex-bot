import { reply } from '../services/lineService.js';
import { setState, clearState, STATES } from '../services/stateService.js';
import { getShopProfile, shopQrUrl } from '../services/shopService.js';

/* QR รับเงินของร้าน
 *
 * ร้านบอกว่า "ฉันเพิ่ม QR สแกนเงิน ไว้ในม่วงได้ไหม บางทีฉันหาในอัลบั้มไม่เจอ"
 *
 * คำเดียวแล้วรูปเด้งขึ้นมาเลย ไม่ต้องไถหาในอัลบั้มตอนลูกค้ายืนรออยู่ และยัง
 * ไม่มีก็บอกวิธีเก็บในคำตอบเดียวกัน ไม่ต้องไปหาในเมนูตั้งค่า
 */

const ASK =
  'ยังไม่ได้เก็บ QR รับเงินไว้เลยค่ะ 📷\n' +
  'ส่งรูป QR เข้ามาในแชตนี้ได้เลยนะคะ ม่วงจะเก็บไว้ให้\n' +
  'คราวหลังพิมพ์ว่า "QR" คำเดียว รูปจะเด้งขึ้นมาเลยค่ะ 💜';

export async function shopQr({ replyToken, profile }) {
  const shop = await getShopProfile(profile.id);
  const url = await shopQrUrl(shop);

  if (!url) {
    await setState(profile.id, STATES.WAITING_FOR_QR, {});
    return reply(replyToken, { type: 'text', text: ASK });
  }

  await clearState(profile.id);
  return reply(replyToken, [
    { type: 'image', originalContentUrl: url, previewImageUrl: url },
    {
      type: 'text',
      text: 'QR รับเงินของร้านค่ะ 💜 ให้ลูกค้าสแกนได้เลย\nอยากเปลี่ยนรูป พิมพ์ว่า "เปลี่ยน QR" นะคะ',
    },
  ]);
}

// เปลี่ยนรูปใหม่ — ร้านย้ายบัญชีหรือเปลี่ยนพร้อมเพย์ได้ ไม่ใช่ตั้งครั้งเดียวตลอดชาติ
export async function replaceShopQr({ replyToken, profile }) {
  await setState(profile.id, STATES.WAITING_FOR_QR, {});
  return reply(replyToken, {
    type: 'text',
    text: 'ส่งรูป QR อันใหม่เข้ามาได้เลยค่ะ ม่วงจะเก็บทับอันเดิมให้ 💜',
  });
}
