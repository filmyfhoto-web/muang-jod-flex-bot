import { reply } from '../services/lineService.js';
import { setState, clearState, STATES } from '../services/stateService.js';
import {
  listShopQrs,
  shopQrUrl,
  setDefaultShopQr,
  deleteShopQr,
} from '../services/shopService.js';
import { qrPickerFlex } from '../flex/qrFlex.js';
import { logger } from '../services/logger.js';

/* QR รับเงินของร้าน
 *
 * ร้านบอกว่า "ฉันเพิ่ม QR สแกนเงิน ไว้ในม่วงได้ไหม บางทีฉันหาในอัลบั้มไม่เจอ"
 * แล้วส่ง QR มาสองใบ (กสิกรกับออมสิน) พร้อมบอกว่า "ให้ฉันกดเลือกว่าจะใส่ QR
 * อันไหน" — คนละบัญชีกัน เก็บได้ใบเดียวแปลว่าต้องเลือกทิ้งอีกใบ
 */

const ASK_FIRST =
  'ยังไม่ได้เก็บ QR รับเงินไว้เลยค่ะ 📷\n' +
  'ส่งรูป QR เข้ามาในแชตนี้ได้เลยนะคะ ส่งได้หลายใบด้วย (กสิกร ออมสิน ฯลฯ)\n' +
  'คราวหลังพิมพ์ว่า "QR" คำเดียว รูปจะขึ้นมาให้เลือกเลยค่ะ 💜';

// ลิงก์รูปเซ็นสดทีละใบ เก็บลิงก์ไว้ไม่ได้เพราะมันหมดอายุ
async function urlsFor(qrs) {
  const pairs = await Promise.all(qrs.map(async (q) => [q.id, await shopQrUrl(q)]));
  return new Map(pairs.filter(([, url]) => url));
}

async function askForImage(replyToken, profile, text) {
  await setState(profile.id, STATES.WAITING_FOR_QR, {});
  return reply(replyToken, { type: 'text', text });
}

export async function shopQr({ replyToken, profile }) {
  const qrs = await listShopQrs(profile.id);
  if (!qrs.length) return askForImage(replyToken, profile, ASK_FIRST);

  const urls = await urlsFor(qrs);
  if (!urls.size) {
    return askForImage(
      replyToken,
      profile,
      'เปิดรูป QR ที่เก็บไว้ไม่ได้ค่ะ 😢 ส่งรูปเข้ามาใหม่อีกครั้งได้ไหมคะ'
    );
  }

  await clearState(profile.id);

  // มีใบเดียวก็ส่งรูปให้เลย ไม่ต้องให้เลือกจากของที่มีอย่างเดียว
  if (qrs.length === 1) {
    const url = urls.get(qrs[0].id);
    return reply(replyToken, [
      { type: 'image', originalContentUrl: url, previewImageUrl: url },
      {
        type: 'text',
        text: 'QR รับเงินของร้านค่ะ 💜 ให้ลูกค้าสแกนได้เลย\nมีอีกบัญชี พิมพ์ "เพิ่ม QR" เก็บไว้ได้นะคะ',
      },
    ]);
  }

  return reply(replyToken, [
    qrPickerFlex(qrs, urls),
    {
      type: 'text',
      text: 'เลือกใบที่จะใช้ได้เลยค่ะ 💜\nแตะรูปหรือกด "ส่งรูปนี้" เพื่อส่งให้ลูกค้า · พิมพ์ "เพิ่ม QR" เพื่อเก็บใบใหม่',
    },
  ]);
}

// เพิ่มใบใหม่ — ร้านมีหลายบัญชี ไม่ใช่เก็บได้ใบเดียวตลอดชาติ
export async function addShopQrPrompt({ replyToken, profile }) {
  return askForImage(
    replyToken,
    profile,
    'ส่งรูป QR ใบใหม่เข้ามาได้เลยค่ะ ม่วงจะเก็บเพิ่มให้ (ของเดิมยังอยู่นะคะ) 💜'
  );
}

export async function sendShopQr({ replyToken, profile, params = {} }) {
  const id = params.id;
  const qr = (await listShopQrs(profile.id)).find((q) => String(q.id) === String(id));
  const url = qr ? await shopQrUrl(qr) : null;
  if (!url) {
    return reply(replyToken, { type: 'text', text: 'ไม่พบ QR ใบนี้แล้วค่ะ พิมพ์ "QR" ดูใบที่มีอยู่ได้นะคะ' });
  }
  return reply(replyToken, { type: 'image', originalContentUrl: url, previewImageUrl: url });
}

export async function useShopQr({ replyToken, profile, params = {} }) {
  const id = params.id;
  try {
    const qr = await setDefaultShopQr(profile.id, id);
    if (!qr) throw new Error('not found');
    const name = String(qr.label || '').trim() || 'ใบนี้';
    return reply(replyToken, {
      type: 'text',
      text: `ใช้ ${name} บนใบเสร็จแล้วค่ะ 💜\nใบเสร็จที่ยังค้างจ่ายจะขึ้น QR ใบนี้ให้ลูกค้าสแกน`,
    });
  } catch (err) {
    logger.error('shop.qr_default_failed', { message: err?.message });
    return reply(replyToken, { type: 'text', text: 'เปลี่ยนไม่สำเร็จค่ะ 😢 ลองใหม่อีกครั้งนะคะ' });
  }
}

export async function removeShopQr({ replyToken, profile, params = {} }) {
  const id = params.id;
  try {
    const gone = await deleteShopQr(profile.id, id);
    if (!gone) {
      return reply(replyToken, { type: 'text', text: 'ไม่พบ QR ใบนี้แล้วค่ะ' });
    }
    const left = await listShopQrs(profile.id);
    const name = String(gone.label || '').trim() || 'QR';
    // ลบใบที่ใช้อยู่แล้วมีใบอื่นขึ้นแทน ต้องบอกว่าตอนนี้ใบไหนขึ้นใบเสร็จ
    const now = left.find((q) => q.is_default);
    return reply(replyToken, {
      type: 'text',
      text:
        `ลบ ${name} แล้วค่ะ` +
        (left.length
          ? now
            ? `\nตอนนี้ใบเสร็จใช้ "${String(now.label || '').trim() || 'ใบที่เหลือ'}" นะคะ`
            : ''
          : '\nตอนนี้ไม่มี QR เหลือแล้ว ส่งรูปใหม่เข้ามาได้ทุกเมื่อนะคะ'),
    });
  } catch (err) {
    logger.error('shop.qr_delete_failed', { message: err?.message });
    return reply(replyToken, { type: 'text', text: 'ลบไม่สำเร็จค่ะ 😢 ลองใหม่อีกครั้งนะคะ' });
  }
}
