import { formatBaht } from '../utils/currency.js';
import { formatThaiDate } from '../utils/dates.js';

export const PURPLE = '#7C3AED';
export const PURPLE_DARK = '#5B21B6';
export const GREY = '#8E8E93';
export const GREEN = '#22A06B';
export const ORANGE = '#E8833A';
export const RED = '#E5484D';

export function paymentLabel(status) {
  switch (status) {
    case 'paid':
      return { text: 'รับเงินแล้ว', color: GREEN };
    case 'partial':
      return { text: 'รับบางส่วน', color: ORANGE };
    case 'pending':
    default:
      return { text: 'ค้างรับ', color: RED };
  }
}

// Build a single job bubble. Reused as a standalone card and inside carousels.
export function buildJobBubble(job) {
  const items = job.items || [];
  const pay = paymentLabel(job.payment_status);

  const itemRows = items.slice(0, 8).map((it) => {
    const qty = Number(it.quantity) || 1;
    const namePieces = [it.item_name];
    if (it.size) namePieces.push(it.size);
    const label = namePieces.join(' ') + (qty > 1 ? ` x${qty}` : '');
    return {
      type: 'box',
      layout: 'horizontal',
      contents: [
        { type: 'text', text: label, size: 'sm', color: '#555555', flex: 5, wrap: true },
        {
          type: 'text',
          text: formatBaht(it.total),
          size: 'sm',
          color: '#111111',
          align: 'end',
          flex: 3,
        },
      ],
    };
  });

  if (!itemRows.length) {
    itemRows.push({
      type: 'text',
      text: 'ไม่มีรายการสินค้า',
      size: 'sm',
      color: GREY,
    });
  }

  const body = {
    type: 'box',
    layout: 'vertical',
    spacing: 'md',
    contents: [
      {
        type: 'box',
        layout: 'horizontal',
        contents: [
          {
            type: 'text',
            text: job.job_name || 'งาน',
            weight: 'bold',
            size: 'md',
            color: PURPLE_DARK,
            flex: 5,
            wrap: true,
          },
          {
            type: 'text',
            text: pay.text,
            size: 'xs',
            color: pay.color,
            align: 'end',
            gravity: 'center',
            flex: 3,
          },
        ],
      },
      {
        type: 'text',
        text: `${formatThaiDate(job.job_date)} · ${job.job_number || ''}`.trim(),
        size: 'xs',
        color: GREY,
      },
      { type: 'separator' },
      { type: 'box', layout: 'vertical', spacing: 'sm', contents: itemRows },
      { type: 'separator' },
      {
        type: 'box',
        layout: 'horizontal',
        contents: [
          { type: 'text', text: 'ยอดรวม', size: 'sm', color: '#555555', flex: 3 },
          {
            type: 'text',
            text: formatBaht(job.total),
            size: 'md',
            weight: 'bold',
            color: PURPLE,
            align: 'end',
            flex: 4,
          },
        ],
      },
    ],
  };

  if (job.note) {
    body.contents.push({
      type: 'text',
      text: `📝 ${job.note}`,
      size: 'xs',
      color: GREY,
      wrap: true,
    });
  }

  return {
    type: 'bubble',
    size: 'kilo',
    body,
  };
}

// Wrap a single bubble as a sendable flex message.
export function jobCardMessage(job, altText = 'รายละเอียดงาน') {
  return {
    type: 'flex',
    altText,
    contents: buildJobBubble(job),
  };
}
