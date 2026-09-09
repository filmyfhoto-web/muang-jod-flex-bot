import { formatBaht } from '../utils/currency.js';
import { formatThaiDate } from '../utils/dates.js';
import { brandAssetUrl } from '../utils/brand.js';
import { COLORS } from './theme.js';

// การ์ด "กรอกข้อมูลงานได้เลย" ที่อยู่ในแชตจริง ๆ ตามแบบที่ออกไว้ — พื้นกรมท่า
// หัวการ์ดชิปฟ้า น้องหมาโผล่มุมขวา และแถวที่หน้าตาเหมือนช่องกรอก ปัดซ้าย-ขวา
// ได้ด้วย carousel ของ LINE เอง
//
// ข้อจำกัดที่ต้องพูดให้ชัด: Flex Message **พิมพ์ลงไปตรง ๆ ไม่ได้** LINE ไม่มี
// ช่องรับข้อความในการ์ด แถวที่เห็นจึงเป็นปุ่มที่แตะแล้วเปิดฟอร์มจริง (LIFF)
// ให้พิมพ์ต่อ — การ์ดนี้คือหน้าตาและทางเข้า ไม่ใช่ที่กรอก
//
// สีมาจาก theme.js ชุดเดียวกับการ์ดอื่นทั้งบอท — พื้นกรมท่า ปุ่มฟ้า ตามแบบ

// ชิปไอคอนสี่เหลี่ยมมนหน้าช่อง เหมือนในแบบ
function iconChip(emoji, { size = '30px', bg = COLORS.tint, text = 'sm', color = COLORS.ink } = {}) {
  return {
    type: 'box',
    layout: 'vertical',
    width: size,
    height: size,
    cornerRadius: 'md',
    backgroundColor: bg,
    justifyContent: 'center',
    alignItems: 'center',
    flex: 0,
    contents: [{ type: 'text', text: emoji, size: text, align: 'center', weight: 'bold', color }],
  };
}

// หนึ่ง "ช่องกรอก" บนการ์ด: ป้ายกำกับ + กล่องอ่อน ๆ ที่มีไอคอนกับตัวอย่าง
// ทั้งกล่องเป็นปุ่ม แตะแล้วเปิดฟอร์มจริง
function field(label, emoji, placeholder, opts = {}) {
  const box = {
    type: 'box',
    layout: 'horizontal',
    backgroundColor: COLORS.tint,
    cornerRadius: 'lg',
    paddingAll: 'md',
    spacing: 'sm',
    alignItems: 'center',
    contents: [
      iconChip(emoji),
      {
        type: 'text',
        text: placeholder,
        size: 'sm',
        color: opts.value ? COLORS.ink : COLORS.grey,
        weight: opts.value ? 'bold' : 'regular',
        wrap: false,
        gravity: 'center',
      },
    ],
  };
  if (opts.uri) box.action = { type: 'uri', label: label, uri: opts.uri };

  return {
    type: 'box',
    layout: 'vertical',
    spacing: 'xs',
    flex: opts.flex ?? 1,
    contents: [{ type: 'text', text: label, size: 'xs', weight: 'bold', color: COLORS.sub }, box],
  };
}

function pair(left, right) {
  return { type: 'box', layout: 'horizontal', spacing: 'sm', contents: [left, right] };
}

// หัวการ์ด: ชิปไอคอนม่วง + ชื่อ/คำโปรย + น้องหมามุมขวา
function cardHead(title, subtitle, emoji, mascot) {
  const contents = [
    iconChip(emoji, { size: '46px', bg: COLORS.accent, text: 'xl', color: COLORS.white }),
    {
      type: 'box',
      layout: 'vertical',
      flex: 1,
      contents: [
        { type: 'text', text: title, size: 'lg', weight: 'bold', color: COLORS.accentText, wrap: true },
        { type: 'text', text: subtitle, size: 'xxs', color: COLORS.grey, wrap: true },
      ],
    },
  ];
  // รูปน้องหมาใส่ได้ต่อเมื่อมี URL สาธารณะให้ LINE ไปโหลด
  if (mascot) contents.push({ type: 'image', url: mascot, size: 'xs', flex: 0, aspectMode: 'fit' });

  return { type: 'box', layout: 'horizontal', spacing: 'md', alignItems: 'center', contents };
}

function button(label, opts) {
  return {
    type: 'button',
    style: opts.primary ? 'primary' : 'secondary',
    height: 'sm',
    ...(opts.primary ? { color: COLORS.accent } : {}),
    action: opts.uri
      ? { type: 'uri', label, uri: opts.uri }
      : { type: 'postback', label, data: opts.data, displayText: opts.displayText || label },
  };
}

// การ์ดใบแรก — หน้าตาเหมือนฟอร์ม แตะช่องไหนก็เปิดฟอร์มจริงที่ช่องนั้น
function formBubble(formUrl) {
  const mascot = brandAssetUrl('ui/peek.png');
  const open = formUrl || null;

  const body = [
    cardHead('กรอกข้อมูลงานได้เลย', 'บันทึกงานพิมพ์ / ป้ายโฆษณา ของคุณ', '📋', mascot),
    ...(open
      ? [{ type: 'text', text: 'แตะช่องไหนก็ได้ เพื่อเปิดฟอร์มกรอกค่ะ 💜', size: 'xxs', color: COLORS.accentText }]
      : []),
    field('ชื่อ', '👤', 'เช่น ป้ายหน้าร้าน', { uri: open }),
    field('รายละเอียด', '📄', 'เช่น ป้ายไวนิล 60x120 ซม.', { uri: open }),
    pair(
      field('ราคา (บาท)', '🏷', 'เช่น 700', { uri: open }),
      field('จำนวน', '📦', 'เช่น 2', { uri: open })
    ),
    pair(
      field('ตรมละ (บาท)', '🧮', 'เช่น 165', { uri: open }),
      field('แนบรูป', '🖼', 'แตะเพื่อแนบ', { uri: open })
    ),
    field('ยอดรวม (บาท)', 'Σ', 'คำนวณให้อัตโนมัติ', { uri: open }),
  ];

  return {
    type: 'bubble',
    size: 'mega',
    body: { type: 'box', layout: 'vertical', spacing: 'md', paddingAll: 'lg', contents: body },
    footer: {
      type: 'box',
      layout: 'horizontal',
      spacing: 'sm',
      paddingAll: 'lg',
      paddingTop: 'none',
      contents: [
        open
          ? button('💾 กรอกในฟอร์ม', { primary: true, uri: open })
          : button('💾 บันทึกงาน', { primary: true, data: 'action=add_job', displayText: 'บันทึกงานวันนี้' }),
        button('➕ พิมพ์เอง', { data: 'action=add_job', displayText: 'บันทึกงานวันนี้' }),
      ],
    },
    // ประกาศพื้นไว้ตรงนี้ให้ชัด แม้ themed() ตอนส่งจะประทับให้อยู่แล้ว
    styles: { body: { backgroundColor: COLORS.surface }, footer: { backgroundColor: COLORS.surface } },
  };
}

// การ์ดใบที่สอง — งานที่จดไว้แล้ว ภาษาเดียวกับใบแรก
function recentBubble(jobs = [], dashboardUrl) {
  const rows = jobs.slice(0, 4).map((job, i) => ({
    type: 'box',
    layout: 'horizontal',
    spacing: 'sm',
    alignItems: 'center',
    contents: [
      iconChip(String(i + 1), { size: '26px', bg: COLORS.accent, text: 'xs', color: COLORS.white }),
      {
        type: 'box',
        layout: 'vertical',
        flex: 1,
        contents: [
          { type: 'text', text: job.job_name || 'งาน', size: 'sm', color: COLORS.ink, weight: 'bold', wrap: false },
          { type: 'text', text: formatThaiDate(job.job_date), size: 'xxs', color: COLORS.grey },
        ],
      },
      { type: 'text', text: formatBaht(job.total || 0), size: 'sm', weight: 'bold', color: COLORS.accentText, flex: 0 },
    ],
    ...(job.id ? { action: { type: 'postback', label: 'ดูงาน', data: `action=edit_job&jobId=${encodeURIComponent(job.id)}`, displayText: 'ดูรายละเอียดงาน' } } : {}),
  }));

  if (!rows.length) {
    rows.push({ type: 'text', text: 'ยังไม่มีงานที่จดไว้ค่ะ', size: 'sm', color: COLORS.grey, wrap: true });
  }

  const footer = [];
  if (dashboardUrl) footer.push(button('📊 ดูทั้งหมด', { uri: dashboardUrl }));
  footer.push(button('🕘 รายการล่าสุด', { data: 'action=recent_jobs', displayText: 'รายการล่าสุด' }));

  return {
    type: 'bubble',
    size: 'mega',
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'md',
      paddingAll: 'lg',
      contents: [
        cardHead('รายการงานของคุณ', 'งานพิมพ์ / ป้ายที่จดไว้ล่าสุด', '📄', null),
        { type: 'separator', color: COLORS.line },
        { type: 'box', layout: 'vertical', spacing: 'md', contents: rows },
      ],
    },
    footer: {
      type: 'box',
      layout: 'horizontal',
      spacing: 'sm',
      paddingAll: 'lg',
      paddingTop: 'none',
      contents: footer,
    },
    styles: { body: { backgroundColor: COLORS.surface }, footer: { backgroundColor: COLORS.surface } },
  };
}

// ข้อความทักทายสองบรรทัดที่มากับการ์ด ตามแบบ
export function greetingTexts(displayName) {
  const name = String(displayName || '').trim();
  return [
    {
      type: 'text',
      text: `สวัสดีค่ะ${name ? ` คุณ${name}` : ''} 💜\nนี่คือรายการงานของคุณ\nเลื่อนดูรายการได้เลยค่ะ`,
    },
    {
      type: 'text',
      text: 'คุณสามารถเพิ่มข้อมูลงานหรือข้อมูลเองภายหลังได้ ทั้งลูกค้า รายละเอียด หรือหมายเหตุต่าง ๆ ค่ะ 🐾',
    },
  ];
}

// การ์ดทั้งชุด: ปัดซ้าย-ขวาได้ด้วย carousel ของ LINE เอง
export function formCardsMessage({ formUrl = null, dashboardUrl = null, recent = [] } = {}) {
  return {
    type: 'flex',
    altText: 'กรอกข้อมูลงานได้เลย',
    contents: {
      type: 'carousel',
      contents: [formBubble(formUrl), recentBubble(recent, dashboardUrl)],
    },
  };
}

export { formBubble, recentBubble };
