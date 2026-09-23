import { COLORS } from './theme.js';
import { footerActions } from './components/footerActions.js';

/* การ์ดเลือก QR — ร้านมีหลายบัญชี กดเลือกเองว่าจะใช้ใบไหน
 *
 * ร้านส่ง QR มาสองใบ: พร้อมเพย์ของกสิกร (ชื่อบุคคล) กับ Thai QR ของออมสิน
 * (ชื่อร้าน มีรหัสร้านค้า) แล้วบอกว่า "ให้ฉันกดเลือกว่าจะใส่ QR อันไหน"
 *
 * รูปขึ้นเต็มใบเลย เพราะสิ่งที่ร้านใช้แยกว่าใบไหนเป็นใบไหนคือหน้าตาของรูป
 * ไม่ใช่ชื่อที่ตั้งไว้ — ใบเขียวคือกสิกร ใบแดงคือออมสิน ร้านรู้ทันทีที่เห็น
 */

// LINE รับ carousel ได้ 12 ใบ ร้านหนึ่งร้านไม่น่ามีบัญชีเกินนั้น
const MAX = 12;

function qrBubble(qr, url, index) {
  const name = String(qr.label || '').trim() || `QR ${index + 1}`;

  return {
    type: 'bubble',
    size: 'kilo',
    hero: {
      type: 'image',
      url,
      size: 'full',
      aspectRatio: '1:1',
      // ทั้งใบต้องเห็น ตัดขอบทิ้งแม้นิดเดียวก็อาจกินมุมของรหัสไป
      aspectMode: 'fit',
      backgroundColor: '#FFFFFF',
      action: { type: 'postback', data: `action=qr_send&id=${encodeURIComponent(qr.id)}`, displayText: name },
    },
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'xs',
      contents: [
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            { type: 'text', text: name, weight: 'bold', size: 'sm', color: COLORS.ink, wrap: true, flex: 5 },
            ...(qr.is_default
              ? [{ type: 'text', text: '● ใช้อยู่', size: 'xxs', weight: 'bold', color: COLORS.green, align: 'end', flex: 3 }]
              : []),
          ],
        },
        {
          type: 'text',
          text: qr.is_default ? 'ขึ้นท้ายใบเสร็จที่ยังค้างจ่าย' : 'แตะรูปเพื่อส่งใบนี้',
          size: 'xxs',
          color: COLORS.grey,
          wrap: true,
        },
      ],
    },
    footer: footerActions({
      primary: {
        label: '📤 ส่งรูปนี้',
        data: `action=qr_send&id=${encodeURIComponent(qr.id)}`,
        displayText: `ส่ง ${name}`,
      },
      links: [
        ...(qr.is_default
          ? []
          : [
              {
                label: 'ใช้ใบนี้บนใบเสร็จ',
                data: `action=qr_default&id=${encodeURIComponent(qr.id)}`,
                displayText: `ใช้ ${name} บนใบเสร็จ`,
              },
            ]),
        {
          label: '🗑 ลบ',
          data: `action=qr_delete&id=${encodeURIComponent(qr.id)}`,
          displayText: `ลบ ${name}`,
          color: COLORS.red,
        },
      ],
    }),
  };
}

export function qrPickerFlex(qrs = [], urls = new Map()) {
  const shown = qrs.filter((q) => urls.get(q.id)).slice(0, MAX);

  return {
    type: 'flex',
    altText: `QR รับเงินของร้าน ${shown.length} ใบ`,
    contents: {
      type: 'carousel',
      contents: shown.map((q, i) => qrBubble(q, urls.get(q.id), i)),
    },
  };
}
