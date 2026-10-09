import { formatBaht } from '../utils/currency.js';
import { formatThaiDate } from '../utils/dates.js';
import { COLORS } from './theme.js';
import { brandAssetUrl } from '../utils/brand.js';
import { liffUrl } from '../utils/liff.js';

// The card behind the mascot on the Rich Menu: a greeting, the day in three
// numbers, and the four things people actually open the bot to do. It is the
// "front page" — deliberately shorter than the summary card, which goes on to
// break the day down by category.

function stat(label, value, color) {
  return {
    type: 'box',
    layout: 'vertical',
    flex: 1,
    contents: [
      { type: 'text', text: label, size: 'xxs', color: COLORS.grey },
      { type: 'text', text: value, size: 'md', weight: 'bold', color, wrap: true },
    ],
  };
}

// ปุ่มเตี้ยทั้งการ์ด: นี่คือหน้าแรก ไม่ใช่หน้ารายละเอียด ยิ่งสั้นยิ่งกดง่าย
function button(label, data, opts = {}) {
  return {
    type: 'button',
    style: opts.primary ? 'primary' : 'secondary',
    height: 'sm',
    ...(opts.primary ? { color: COLORS.accent } : {}),
    action: { type: 'postback', label, data, displayText: opts.displayText || label },
  };
}

export function homeFlex(summary = {}, opts = {}) {
  const name = String(opts.displayName || '').trim();
  const dashUrl = opts.liffUrl !== undefined ? opts.liffUrl : liffUrl({ tab: 'today' });
  const mascot = opts.mascotImageUrl !== undefined ? opts.mascotImageUrl : brandAssetUrl('ui/nap.png');

  // น้องหมานอนอยู่มุมขวาของบรรทัดทักทาย — ที่ตรงนั้นเดิมว่างเปล่า และรูปนอน
  // เป็นแนวนอน จึงพอดีกับความสูงของสองบรรทัดโดยไม่ดันการ์ดให้ยาวขึ้นเลย
  const greeting = {
    type: 'box',
    layout: 'vertical',
    contents: [
      {
        type: 'text',
        text: name ? `สวัสดีค่ะ คุณ${name} 💜` : 'ม่วงจดพร้อมช่วยแล้วค่ะ 💜',
        weight: 'bold',
        size: 'md',
        color: COLORS.title,
        wrap: true,
      },
      { type: 'text', text: formatThaiDate(summary.date), size: 'xxs', color: COLORS.grey },
    ],
  };

  const body = [
    mascot
      ? {
          type: 'box',
          layout: 'horizontal',
          spacing: 'sm',
          alignItems: 'center',
          contents: [
            { ...greeting, flex: 1 },
            { type: 'image', url: mascot, size: 'md', flex: 0, aspectMode: 'fit', align: 'end' },
          ],
        }
      : greeting,
    {
      type: 'box',
      layout: 'horizontal',
      backgroundColor: COLORS.tint,
      cornerRadius: 'md',
      paddingAll: 'sm',
      spacing: 'sm',
      margin: 'md',
      contents: [
        stat('ยอดวันนี้', formatBaht(summary.total || 0), COLORS.accentText),
        stat('งาน', `${summary.jobCount || 0}`, COLORS.ink),
        stat('ค้างรับ', formatBaht(summary.pending || 0), COLORS.red),
      ],
    },
  ];

  /* หน้าแรกมี 4 เมนูหลัก (V2): จดงานใหม่ · จดรายรับ–รายจ่าย · งานวันนี้ · สรุปยอดร้าน
   *
   * สี่อย่างนี้คือสิ่งที่ร้านเปิดบอทมาทำจริง อย่างอื่น (ค้างรับ ตั้งค่า ฯลฯ)
   * อยู่บนริชเมนูและในการ์ดสรุปอยู่แล้ว — หน้าแรกไม่ใช่สารบัญของทุกฟีเจอร์
   */
  const footer = [
    button('📝 จดงานใหม่', 'action=add_job', { primary: true, displayText: 'จดงานใหม่' }),
    {
      type: 'box',
      layout: 'horizontal',
      spacing: 'sm',
      contents: [
        button('💸 จดรายรับ–รายจ่าย', 'action=money_note', { displayText: 'จดรายรับ–รายจ่าย' }),
        button('📋 งานวันนี้', 'action=branch_view', { displayText: 'งานวันนี้' }),
      ],
    },
    button('📊 สรุปยอดร้าน', 'action=today_summary', { displayText: 'สรุปยอดร้าน' }),
  ];

  // แดชบอร์ดเป็นลิงก์ตัวหนังสือ ไม่ใช่ปุ่ม — ประหยัดไปทั้งแถว และคนที่มาหน้านี้
  // ส่วนใหญ่มากดสามปุ่มบน ไม่ได้มาเปิดเว็บ
  if (dashUrl) {
    footer.push({
      type: 'text',
      text: '📋 เปิดแดชบอร์ด ›',
      size: 'xs',
      weight: 'bold',
      color: COLORS.accentText,
      align: 'center',
      margin: 'sm',
      action: { type: 'uri', label: 'เปิดแดชบอร์ด', uri: dashUrl },
    });
  }

  const bubble = {
    type: 'bubble',
    size: 'mega',
    body: { type: 'box', layout: 'vertical', paddingAll: 'md', contents: body },
    footer: { type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: 'md', paddingTop: 'none', contents: footer },
  };
  return { type: 'flex', altText: 'ม่วงจดพร้อมช่วยแล้วค่ะ', contents: bubble };
}
