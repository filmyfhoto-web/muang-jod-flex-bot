import { formatBaht, numText } from '../utils/currency.js';
import { formatThaiDate } from '../utils/dates.js';
import { brandAssetUrl } from '../utils/brand.js';
import { dueText } from './components/dueLine.js';

// การ์ด "กรอกข้อมูลงานได้เลย" ที่อยู่ในแชตจริง ๆ ตามแบบที่ออกไว้ — การ์ดขาว
// หัวการ์ดชิปน้ำเงิน น้องหมาโผล่มุมขวา และแถวที่หน้าตาเหมือนช่องกรอก
// ปัดซ้าย-ขวาได้ด้วย carousel ของ LINE เอง
//
// ข้อจำกัดที่ต้องพูดให้ชัด: Flex Message **พิมพ์ลงไปตรง ๆ ไม่ได้** LINE ไม่มี
// ช่องรับข้อความในการ์ด แถวที่เห็นจึงเป็นปุ่มที่แตะแล้วเปิดฟอร์มจริง (LIFF)
// ให้พิมพ์ต่อ — การ์ดนี้คือหน้าตาและทางเข้า ไม่ใช่ที่กรอก
//
// การ์ดใบนี้เป็นชุดขาว-น้ำเงินตามแบบที่ออกไว้ จงใจไม่ใช้ COLORS ของธีมมืดที่
// การ์ดอื่นใช้ — และเพราะทางส่ง (themed) ประทับพื้นเข้มให้ทุกบับเบิลอัตโนมัติ
// การ์ดนี้จึงต้องประกาศ styles พื้นขาวไว้เอง ของที่ตั้งไว้แล้วชนะ
// (tests/formCard.test.js ยิงผ่านทางส่งจริงเพื่อกันไม่ให้โดนทับ)

const BLUE = '#1C4FD8'; // ปุ่มหลัก ชิปไอคอน
const BLUE_DEEP = '#17357E'; // พาดหัว ตัวเลข
const BLUE_SOFT = '#DCE7FB'; // ปุ่มรอง ชิปอ่อน
const CARD = '#FFFFFF';
const FIELD = '#F7F9FF'; // พื้นของช่องกรอก
const LINE_SOFT = '#DCE3F5';
const INK = '#1B2540';
const SUB = '#3D4C73';
const GREY = '#8794B4';

// ชิปไอคอนสี่เหลี่ยมมนหน้าช่อง เหมือนในแบบ
function iconChip(emoji, { size = '20px', bg = BLUE_SOFT, text = 'xxs', color = BLUE_DEEP } = {}) {
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
    backgroundColor: FIELD,
    cornerRadius: 'lg',
    borderWidth: '1px',
    borderColor: LINE_SOFT,
    // แถวพวกนี้เป็น "รูปของฟอร์ม" ไม่ใช่ฟอร์ม พิมพ์ลงไปไม่ได้อยู่แล้ว
    // จึงต้องการแค่พออ่านออก ไม่ต้องใหญ่พอให้นิ้วกด — ทุก px ที่ประหยัดได้
    // คือหนึ่งบรรทัดที่ไม่ตกจอ
    paddingAll: 'xs',
    spacing: 'xs',
    alignItems: 'center',
    contents: [
      iconChip(emoji),
      {
        type: 'text',
        text: placeholder,
        size: 'xs',
        color: opts.value ? INK : GREY,
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
    spacing: 'none',
    flex: opts.flex ?? 1,
    contents: [{ type: 'text', text: label, size: 'xxs', weight: 'bold', color: SUB }, box],
  };
}

function pair(left, right) {
  return { type: 'box', layout: 'horizontal', spacing: 'sm', contents: [left, right] };
}

// หัวการ์ด: ชิปไอคอนม่วง + ชื่อ/คำโปรย + น้องหมามุมขวา
function cardHead(title, subtitle, emoji, mascot) {
  const contents = [
    iconChip(emoji, { size: '34px', bg: BLUE, text: 'md', color: CARD }),
    {
      type: 'box',
      layout: 'vertical',
      flex: 1,
      contents: [
        { type: 'text', text: title, size: 'md', weight: 'bold', color: BLUE_DEEP, wrap: true },
        { type: 'text', text: subtitle, size: 'xxs', color: GREY, wrap: true },
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
    ...(opts.primary ? { color: BLUE } : {}),
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
    // ลูกค้าคนเดียวสั่งหลายงานในรอบเดียวเป็นเรื่องปกติ การ์ดใบนี้โชว์ช่องกรอก
    // ชุดเดียวจึงอ่านได้ว่าจดได้ทีละงาน — ต้องบอกตรงนี้ว่าในฟอร์มเพิ่มได้
    ...(open
      ? [
          {
            type: 'text',
            text: 'แตะช่องไหนก็เปิดฟอร์มค่ะ 💜 ลูกค้าสั่งหลายงาน กด ➕ เพิ่มรายการ ในฟอร์มได้เลย',
            size: 'xxs',
            color: BLUE_DEEP,
            wrap: true,
          },
        ]
      : []),
    field('ชื่อ', '👤', 'เช่น ป้ายหน้าร้าน', { uri: open }),
    field('รายละเอียด', '📄', 'เช่น ป้ายไวนิล ตอกตาไก่', { uri: open }),
    // กว้าง/ยาว/จำนวน แยกช่องกันในฟอร์มจริง การ์ดจึงต้องหน้าตาแบบเดียวกัน
    // ไม่งั้นภาพกับของจริงสอนคนละอย่าง
    pair(
      field('กว้าง', '↔', '160', { uri: open }),
      field('ยาว', '↕', '300', { uri: open })
    ),
    pair(
      field('จำนวน', '📦', '1', { uri: open }),
      field('ตรมละ (บาท)', '🧮', 'เช่น 165', { uri: open })
    ),
    field('ราคา (บาท)', '🏷', 'เช่น 700', { uri: open }),
    pair(
      field('ยอดรวม (บาท)', 'Σ', 'คำนวณให้', { uri: open }),
      field('แนบรูป', '🖼', 'แตะเพื่อแนบ', { uri: open })
    ),
  ];

  return {
    type: 'bubble',
    size: 'mega',
    body: { type: 'box', layout: 'vertical', spacing: 'xs', paddingAll: 'md', contents: body },
    footer: {
      type: 'box',
      layout: 'horizontal',
      spacing: 'sm',
      paddingAll: 'md',
      paddingTop: 'none',
      contents: [
        open
          ? button('💾 กรอกในฟอร์ม', { primary: true, uri: open })
          : button('💾 บันทึกงาน', { primary: true, data: 'action=add_job', displayText: 'บันทึกงานวันนี้' }),
        button('➕ พิมพ์เอง', { data: 'action=add_job', displayText: 'บันทึกงานวันนี้' }),
      ],
    },
    // ประกาศพื้นไว้ตรงนี้ให้ชัด แม้ themed() ตอนส่งจะประทับให้อยู่แล้ว
    styles: { body: { backgroundColor: CARD }, footer: { backgroundColor: CARD } },
  };
}

function dueOf(job) {
  const due = dueText(job.due_date);
  if (!due) return null;
  return {
    type: 'text',
    text: due.text,
    size: 'xxs',
    weight: due.late || due.soon ? 'bold' : 'regular',
    color: due.late ? '#DC2626' : due.soon ? '#B45309' : SUB,
    wrap: false,
  };
}

// การ์ดใบที่สอง — งานที่จดไว้แล้ว ภาษาเดียวกับใบแรก
//
// `failed` แยก "ยังไม่เคยจด" ออกจาก "ดึงรายการไม่สำเร็จ" — สองอย่างนี้หน้าตา
// เหมือนกันจากในแชต แต่คนละเรื่องกันสิ้นเชิง การ์ดที่บอกว่าไม่มีงานทั้งที่มี
// คือการ์ดที่โกหก
function recentBubble(jobs = [], dashboardUrl, { failed = false, today = null } = {}) {
  const rows = jobs.slice(0, 4).map((job, i) => ({
    type: 'box',
    layout: 'horizontal',
    spacing: 'sm',
    alignItems: 'center',
    contents: [
      iconChip(String(i + 1), { size: '26px', bg: BLUE, text: 'xs', color: CARD }),
      {
        type: 'box',
        layout: 'vertical',
        flex: 1,
        contents: [
          { type: 'text', text: job.job_name || 'งาน', size: 'sm', color: INK, weight: 'bold', wrap: false },
          // เมื่อมีวันนัดรับ วันนัดสำคัญกว่าวันที่จด — นั่นคือเส้นตายของงาน
          dueOf(job) || { type: 'text', text: formatThaiDate(job.job_date), size: 'xxs', color: GREY },
        ],
      },
      { type: 'text', text: formatBaht(job.total || 0), size: 'sm', weight: 'bold', color: BLUE_DEEP, flex: 0 },
    ],
    ...(job.id ? { action: { type: 'postback', label: 'ดูงาน', data: `action=edit_job&jobId=${encodeURIComponent(job.id)}`, displayText: 'ดูรายละเอียดงาน' } } : {}),
  }));

  if (!rows.length) {
    rows.push({
      type: 'text',
      text: failed
        ? 'ดึงรายการไม่สำเร็จค่ะ 😢\nกด "🕘 รายการล่าสุด" ดูอีกครั้งได้นะคะ'
        : 'ยังไม่มีงานที่จดไว้ค่ะ\nจดงานแรกจากการ์ดข้าง ๆ ได้เลย 💜',
      size: 'sm',
      color: GREY,
      wrap: true,
    });
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
        // The same day tally the receipt shows, so the two cards agree about
        // where you are rather than each telling half the story.
        ...(today && Number(today.jobCount) > 0
          ? [
              {
                type: 'box',
                layout: 'horizontal',
                backgroundColor: FIELD,
                cornerRadius: 'lg',
                paddingAll: 'md',
                alignItems: 'center',
                contents: [
                  { type: 'text', text: `วันนี้จดไปแล้ว ${numText(today.jobCount)} งาน`, size: 'xs', color: SUB, flex: 5 },
                  { type: 'text', text: formatBaht(Number(today.total) || 0), size: 'md', weight: 'bold', color: BLUE_DEEP, align: 'end', flex: 4 },
                ],
              },
            ]
          : []),
        { type: 'separator', color: LINE_SOFT },
        // A carousel stretches every bubble to the tallest one, and the form
        // beside this is long — so one line of text sat at the top of a white
        // desert. Filling the space puts it in the middle of the card instead.
        {
          type: 'box',
          layout: 'vertical',
          spacing: 'md',
          flex: 1,
          ...(jobs.length ? {} : { justifyContent: 'center' }),
          contents: rows,
        },
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
    styles: { body: { backgroundColor: CARD }, footer: { backgroundColor: CARD } },
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
export function formCardsMessage({
  formUrl = null,
  dashboardUrl = null,
  recent = [],
  recentFailed = false,
  today = null,
} = {}) {
  return {
    type: 'flex',
    altText: 'กรอกข้อมูลงานได้เลย',
    contents: {
      type: 'carousel',
      contents: [formBubble(formUrl), recentBubble(recent, dashboardUrl, { failed: recentFailed, today })],
    },
  };
}

export { formBubble, recentBubble };
