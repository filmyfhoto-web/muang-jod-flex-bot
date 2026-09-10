import { formatBaht, numText } from '../utils/currency.js';
import { formatThaiDateTime } from '../utils/dates.js';
import { jobCategory, categoryLabel, itemIcon } from '../utils/category.js';
import { COLORS } from './theme.js';
import { divider } from './components/divider.js';
import { brandAssetUrl, MASCOT } from '../utils/brand.js';
import { liffUrl } from '../utils/liff.js';
import { dueLine } from './components/dueLine.js';
import { joinMeta } from './components/metaLine.js';

// Receipt card styled after the brand mockup: white card, purple circle check,
// soft-purple category strip (with optional mascot image), thumbnail-style
// item rows, highlighted total, and "ดูรายงาน (วันนี้) ›" footer link.

function qtyText(it) {
  const q = Number(it.quantity) || 1;
  return `${q} ${it.unit || 'ชิ้น'}`;
}

// A rounded square "thumbnail" holding the category emoji.
function thumb(emoji) {
  return {
    type: 'box',
    layout: 'vertical',
    width: '44px',
    height: '44px',
    cornerRadius: 'md',
    backgroundColor: COLORS.tint,
    justifyContent: 'center',
    alignItems: 'center',
    flex: 0,
    contents: [{ type: 'text', text: emoji, size: 'md', align: 'center' }],
  };
}

function itemRow(it) {
  const name = [it.item_name, it.size].filter(Boolean).join(' ');
  return {
    type: 'box',
    layout: 'horizontal',
    spacing: 'md',
    alignItems: 'center',
    contents: [
      thumb(itemIcon(it.item_name)),
      {
        type: 'box',
        layout: 'vertical',
        flex: 5,
        contents: [
          { type: 'text', text: name || 'รายการ', size: 'sm', weight: 'bold', color: COLORS.ink, wrap: true },
          { type: 'text', text: qtyText(it), size: 'xs', color: COLORS.grey },
        ],
      },
      {
        type: 'text',
        text: formatBaht(Number(it.total) || 0),
        size: 'md',
        weight: 'bold',
        color: COLORS.ink,
        align: 'end',
        gravity: 'center',
        flex: 3,
      },
    ],
  };
}

function link(label, action, displayText) {
  return {
    type: 'text',
    text: label,
    size: 'sm',
    color: COLORS.accentText,
    weight: 'bold',
    action: { type: 'postback', label: displayText, data: `action=${action}`, displayText },
  };
}

// "วันนี้จดไปแล้ว 3 งาน — ฿1,250", with the accent rule under it that makes it
// read as a tally rather than another line of the bill above.
function runningTotal(today) {
  const pending = Number(today.pending) || 0;
  return {
    type: 'box',
    layout: 'vertical',
    spacing: 'xs',
    contents: [
      {
        type: 'box',
        layout: 'horizontal',
        alignItems: 'center',
        contents: [
          {
            type: 'text',
            text: `วันนี้จดไปแล้ว ${numText(today.jobCount)} งาน`,
            size: 'sm',
            color: COLORS.sub,
            flex: 5,
          },
          {
            type: 'text',
            text: formatBaht(Number(today.total) || 0),
            size: 'lg',
            weight: 'bold',
            color: COLORS.accentText,
            align: 'end',
            flex: 4,
          },
        ],
      },
      {
        type: 'box',
        layout: 'vertical',
        height: '3px',
        backgroundColor: COLORS.accent,
        cornerRadius: 'md',
        // Empty contents is how the dashboard draws its bars too — a coloured
        // box with nothing in it, rather than the deprecated filler component.
        contents: [],
      },
      ...(pending > 0
        ? [{ type: 'text', text: `ยังค้างรับ ${formatBaht(pending)}`, size: 'xxs', color: COLORS.orange }]
        : []),
    ],
  };
}

export function receiptFlex(job, opts = {}) {
  const items = job.items || [];
  const { group, type } = jobCategory(job);
  // Explicit option (null = none) > env override > the bot's own /brand file.
  const mascotUrl =
    opts.mascotImageUrl !== undefined
      ? opts.mascotImageUrl
      : process.env.BRAND_MASCOT_IMAGE_URL || brandAssetUrl(MASCOT.clipboard);
  const heroUrl =
    opts.heroImageUrl !== undefined
      ? opts.heroImageUrl
      : process.env.BRAND_HERO_IMAGE_URL || brandAssetUrl('ui/card-hero.png');

  // ✓ in a purple circle + title/subtitle, on a white background.
  const header = {
    type: 'box',
    layout: 'horizontal',
    spacing: 'md',
    alignItems: 'center',
    paddingAll: 'lg',
    paddingBottom: 'sm',
    contents: [
      {
        type: 'box',
        layout: 'vertical',
        width: '38px',
        height: '38px',
        cornerRadius: '19px',
        backgroundColor: COLORS.accent,
        justifyContent: 'center',
        alignItems: 'center',
        flex: 0,
        contents: [{ type: 'text', text: '✓', size: 'md', weight: 'bold', color: COLORS.white, align: 'center' }],
      },
      {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: 'บันทึกสำเร็จ', weight: 'bold', size: 'lg', color: COLORS.title },
          {
            type: 'text',
            text: 'เพิ่มรายการงานเข้าในระบบเรียบร้อยแล้วค่ะ',
            size: 'xs',
            color: COLORS.grey,
            wrap: true,
          },
        ],
      },
    ],
  };

  // Category strip: icon + category, date-time, job number, customer; mascot on the right.
  const metaText = [
    {
      type: 'text',
      text: `${type?.icon || group.icon} ${job.job_name || categoryLabel(job)}`,
      weight: 'bold',
      size: 'md',
      color: COLORS.title,
      wrap: true,
    },
    {
      type: 'text',
      text: joinMeta(formatThaiDateTime(job.created_at), job.job_number),
      size: 'xs',
      color: COLORS.grey,
    },
  ];
  if (job.customer_name) {
    metaText.push({ type: 'text', text: `ลูกค้า: ${job.customer_name}`, size: 'xs', color: COLORS.sub });
  }
  const due = dueLine(job.due_date);
  if (due) metaText.push(due);

  const metaContents = [{ type: 'box', layout: 'vertical', flex: 5, spacing: 'xs', contents: metaText }];
  if (mascotUrl) {
    metaContents.push({
      type: 'image',
      url: mascotUrl,
      size: '72px',
      aspectRatio: '1:1',
      aspectMode: 'cover',
      align: 'end',
      flex: 0,
    });
  }

  const bodyContents = [
    {
      type: 'box',
      layout: 'horizontal',
      backgroundColor: COLORS.tint,
      cornerRadius: 'lg',
      paddingAll: 'md',
      alignItems: 'center',
      contents: metaContents,
    },
    {
      type: 'box',
      layout: 'vertical',
      spacing: 'md',
      contents: items.length
        ? items.slice(0, 10).map(itemRow)
        : [{ type: 'text', text: 'ไม่มีรายการสินค้า', size: 'sm', color: COLORS.grey }],
    },
    divider(),
    {
      type: 'box',
      layout: 'horizontal',
      backgroundColor: COLORS.tint,
      cornerRadius: 'lg',
      paddingAll: 'md',
      alignItems: 'center',
      contents: [
        { type: 'text', text: 'รวมทั้งหมด', size: 'md', weight: 'bold', color: COLORS.title, flex: 3 },
        {
          type: 'text',
          text: formatBaht(Number(job.total) || 0),
          size: 'lg',
          weight: 'bold',
          color: COLORS.accentText,
          align: 'end',
          flex: 4,
        },
      ],
    },
  ];

  if (Number(job.paid_amount) > 0) {
    bodyContents.push({
      type: 'box',
      layout: 'horizontal',
      contents: [
        { type: 'text', text: `รับแล้ว ${formatBaht(Number(job.paid_amount) || 0)}`, size: 'xs', color: COLORS.green, flex: 1 },
        { type: 'text', text: `คงเหลือ ${formatBaht(Number(job.balance_due) || 0)}`, size: 'xs', color: COLORS.red, align: 'end', flex: 1 },
      ],
    });
  }

  // The running total for the day, under the one job just saved. "Saved" on
  // its own tells you nothing about where you are — this is the line that
  // answers "so what have I got down so far today?" without another tap.
  const today = opts.today;
  if (today && Number(today.jobCount) > 0) {
    bodyContents.push(divider(), runningTotal(today));
  }

  // ✏️ opens the LIFF edit form for this record when LIFF is configured, and
  // falls back to a postback the chat flow answers. ❌ always asks first.
  const editUri = opts.editUrl !== undefined ? opts.editUrl : liffUrl({ edit: job.id });
  const editAction = editUri
    ? { type: 'uri', label: '✏️ แก้ไข', uri: editUri }
    : {
        type: 'postback',
        label: '✏️ แก้ไข',
        data: `action=edit_job&jobId=${encodeURIComponent(job.id || '')}`,
        displayText: 'แก้ไขรายการ',
      };

  const footer = {
    type: 'box',
    layout: 'vertical',
    spacing: 'sm',
    paddingAll: 'lg',
    paddingTop: 'sm',
    contents: [
      // One customer often brings several jobs in one visit. Without this the
      // shop has to go back to the menu and re-type the customer's name for
      // every one of them.
      {
        type: 'button',
        style: 'primary',
        color: COLORS.accent,
        height: 'sm',
        action: {
          type: 'postback',
          label: '➕ เพิ่มงานอีก',
          data: `action=add_more&customer=${encodeURIComponent(job.customer_name || '')}`,
          displayText: job.customer_name ? `เพิ่มงานอีกของ ${job.customer_name}` : 'เพิ่มงานอีก',
        },
      },
      {
        type: 'box',
        layout: 'horizontal',
        contents: [
          link('📄 ดูรายงาน (วันนี้) ›', 'today_summary', 'สรุปวันนี้'),
          { ...link('💰 บันทึกรับเงิน ›', 'record_payment', 'บันทึกรับเงิน'), align: 'end' },
        ],
      },
      // Words, not slabs. Two grey blocks here sat directly under two rows of
      // links and a filled button, and made the footer taller than the bill.
      ...(job.id
        ? [
            {
              type: 'box',
              layout: 'horizontal',
              spacing: 'md',
              contents: [
                {
                  type: 'text',
                  text: '✏️ แก้ไข',
                  size: 'sm',
                  weight: 'bold',
                  color: COLORS.accentText,
                  align: 'center',
                  flex: 1,
                  action: editAction,
                },
                {
                  type: 'text',
                  text: '❌ ลบ',
                  size: 'sm',
                  weight: 'bold',
                  color: COLORS.red,
                  align: 'center',
                  flex: 1,
                  action: {
                    type: 'postback',
                    label: '❌ ลบ',
                    data: `action=delete_job&jobId=${encodeURIComponent(job.id)}`,
                    displayText: 'ลบรายการ',
                  },
                },
              ],
            },
          ]
        : []),
      { type: 'text', text: 'ขอบคุณที่ให้ม่วงจดดูแลงานนะคะ 💜', size: 'xs', color: COLORS.grey, align: 'center' },
    ],
  };

  const bubble = {
    type: 'bubble',
    size: 'mega',
    ...(heroUrl
      ? { hero: { type: 'image', url: heroUrl, size: 'full', aspectRatio: '20:5', aspectMode: 'cover' } }
      : {}),
    header,
    body: { type: 'box', layout: 'vertical', spacing: 'md', paddingTop: 'sm', contents: bodyContents },
    footer,
    styles: { header: { backgroundColor: COLORS.surface }, body: { backgroundColor: COLORS.surface } },
  };

  return {
    type: 'flex',
    altText: `บันทึกสำเร็จ ${job.job_name || ''} ${formatBaht(Number(job.total) || 0)}`.trim(),
    contents: bubble,
  };
}
