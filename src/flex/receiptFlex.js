import { formatBaht } from '../utils/currency.js';
import { formatThaiDateTime } from '../utils/dates.js';
import { guessCategory, itemIcon } from '../utils/category.js';
import { COLORS } from './theme.js';
import { divider } from './components/divider.js';
import { moneyRow } from './components/moneyRow.js';

function qtyText(it) {
  const q = Number(it.quantity) || 1;
  const n = Number.isInteger(q) ? String(q) : String(q);
  return `${n} ${it.unit || 'ชิ้น'}`;
}

function itemRow(it) {
  const name = [it.item_name, it.size].filter(Boolean).join(' ');
  return {
    type: 'box',
    layout: 'horizontal',
    spacing: 'md',
    alignItems: 'center',
    contents: [
      { type: 'text', text: itemIcon(it.item_name), size: 'xl', flex: 0 },
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

// "บันทึกสำเร็จ" receipt card shown right after a job is saved.
// Optional hero image (brand art) via opts.heroImageUrl or BRAND_HERO_IMAGE_URL.
export function receiptFlex(job, opts = {}) {
  const items = job.items || [];
  const cat = guessCategory(items);
  const heroUrl = opts.heroImageUrl ?? process.env.BRAND_HERO_IMAGE_URL;

  const header = {
    type: 'box',
    layout: 'horizontal',
    backgroundColor: COLORS.purple,
    paddingAll: 'lg',
    spacing: 'md',
    alignItems: 'center',
    contents: [
      { type: 'text', text: '✓', size: 'xxl', weight: 'bold', color: COLORS.white, flex: 0 },
      {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: 'บันทึกสำเร็จ', weight: 'bold', size: 'xl', color: COLORS.white },
          {
            type: 'text',
            text: 'เพิ่มรายการงานเข้าในระบบเรียบร้อยแล้วค่ะ',
            size: 'xs',
            color: COLORS.purpleSoft,
            wrap: true,
          },
        ],
      },
    ],
  };

  const meta = [
    {
      type: 'text',
      text: `${cat?.icon || '🏪'} ${job.job_name || 'งาน'}`,
      weight: 'bold',
      size: 'md',
      color: COLORS.purpleDark,
      wrap: true,
    },
    {
      type: 'text',
      text: `${formatThaiDateTime(job.created_at)} · ${job.job_number || ''}`.trim(),
      size: 'xs',
      color: COLORS.grey,
    },
  ];
  if (job.customer_name) {
    meta.push({ type: 'text', text: `ลูกค้า: ${job.customer_name}`, size: 'xs', color: COLORS.sub });
  }

  const bodyContents = [
    {
      type: 'box',
      layout: 'vertical',
      backgroundColor: COLORS.purpleSoft,
      cornerRadius: 'md',
      paddingAll: 'md',
      spacing: 'xs',
      contents: meta,
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
      layout: 'vertical',
      backgroundColor: COLORS.purpleSoft,
      cornerRadius: 'md',
      paddingAll: 'md',
      contents: [moneyRow('รวมทั้งหมด', Number(job.total) || 0, { big: true, color: COLORS.purple })],
    },
  ];

  if (Number(job.paid_amount) > 0) {
    bodyContents.push(moneyRow('รับแล้ว', Number(job.paid_amount) || 0, { color: COLORS.green, size: 'xs' }));
    bodyContents.push(moneyRow('คงเหลือ', Number(job.balance_due) || 0, { color: COLORS.red, size: 'xs' }));
  }

  const footer = {
    type: 'box',
    layout: 'horizontal',
    spacing: 'sm',
    contents: [
      {
        type: 'button',
        style: 'secondary',
        height: 'sm',
        action: { type: 'postback', label: '📊 ดูสรุปวันนี้', data: 'action=today_summary', displayText: 'สรุปวันนี้' },
      },
      {
        type: 'button',
        style: 'primary',
        color: COLORS.purple,
        height: 'sm',
        action: { type: 'postback', label: '💰 บันทึกรับเงิน', data: 'action=record_payment', displayText: 'บันทึกรับเงิน' },
      },
    ],
  };

  const bubble = {
    type: 'bubble',
    size: 'mega',
    ...(heroUrl
      ? { hero: { type: 'image', url: heroUrl, size: 'full', aspectRatio: '20:8', aspectMode: 'cover' } }
      : {}),
    header,
    body: { type: 'box', layout: 'vertical', spacing: 'md', contents: bodyContents },
    footer,
  };

  return {
    type: 'flex',
    altText: `บันทึกสำเร็จ ${job.job_name || ''} ${formatBaht(Number(job.total) || 0)}`.trim(),
    contents: bubble,
  };
}
