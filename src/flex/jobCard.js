import { formatBaht } from '../utils/currency.js';
import { formatThaiDate } from '../utils/dates.js';
import { COLORS, paymentPresentation } from './theme.js';
import { moneyRow } from './components/moneyRow.js';
import { divider } from './components/divider.js';
import { statusBadge } from './components/statusBadge.js';
import { footerActions } from './components/footerActions.js';

// Backward-compatible colour re-exports (older modules import these here).
export const PURPLE = COLORS.purple;
export const PURPLE_DARK = COLORS.purpleDark;
export const GREY = COLORS.grey;
export const GREEN = COLORS.green;
export const ORANGE = COLORS.orange;
export const RED = COLORS.red;

export function paymentLabel(status) {
  const p = paymentPresentation(status);
  return { text: p.text, color: p.color };
}

// Build a single job bubble. Reused as a standalone card and inside carousels.
export function buildJobBubble(job) {
  const items = job.items || [];

  const itemRows = items.slice(0, 8).map((it) => {
    const qty = Number(it.quantity) || 1;
    const pieces = [it.item_name];
    if (it.size) pieces.push(it.size);
    const label = pieces.join(' ') + (qty > 1 ? ` x${qty}` : '');
    return moneyRow(label, Number(it.total) || 0, { color: COLORS.ink, bold: false });
  });

  if (!itemRows.length) {
    itemRows.push({ type: 'text', text: 'ไม่มีรายการสินค้า', size: 'sm', color: COLORS.grey });
  }

  const bodyContents = [
    {
      type: 'box',
      layout: 'horizontal',
      contents: [
        {
          type: 'text',
          text: job.job_name || 'งาน',
          weight: 'bold',
          size: 'md',
          color: COLORS.purpleDark,
          flex: 5,
          wrap: true,
        },
        statusBadge(job.payment_status),
      ],
    },
    {
      type: 'text',
      text: `${formatThaiDate(job.job_date)} · ${job.job_number || ''}`.trim(),
      size: 'xs',
      color: COLORS.grey,
    },
    divider(),
    { type: 'box', layout: 'vertical', spacing: 'sm', contents: itemRows },
    divider(),
    moneyRow('ยอดรวม', Number(job.total) || 0, { color: COLORS.purple, big: true }),
  ];

  // Show payment progress when partially paid.
  if (Number(job.paid_amount) > 0 && job.payment_status !== 'paid') {
    bodyContents.push(moneyRow('รับแล้ว', Number(job.paid_amount) || 0, { color: COLORS.green, size: 'xs' }));
    bodyContents.push(moneyRow('คงเหลือ', Number(job.balance_due) || 0, { color: COLORS.red, size: 'xs' }));
  }

  if (job.note) {
    bodyContents.push({
      type: 'text',
      text: `📝 ${job.note}`,
      size: 'xs',
      color: COLORS.grey,
      wrap: true,
    });
  }

  return {
    type: 'bubble',
    size: 'kilo',
    body: { type: 'box', layout: 'vertical', spacing: 'md', contents: bodyContents },
  };
}

// Wrap a single bubble as a sendable flex message.
export function jobCardMessage(job, altText = 'รายละเอียดงาน') {
  return { type: 'flex', altText, contents: buildJobBubble(job) };
}

// Preview card shown BEFORE saving: receipt bubble + header + action buttons.
export function jobPreviewMessage(draftJob, altText = 'ตรวจสอบก่อนบันทึก') {
  const bubble = buildJobBubble(draftJob);
  bubble.header = {
    type: 'box',
    layout: 'vertical',
    contents: [{ type: 'text', text: '📋 ตรวจสอบก่อนบันทึก', weight: 'bold', size: 'sm', color: COLORS.purple }],
  };
  bubble.footer = footerActions({
    primary: { label: '✅ บันทึกงาน', data: 'action=confirm_add_job', displayText: 'บันทึกงาน' },
    secondary: [
      { label: '✏️ แก้ไข', data: 'action=edit_new_job', displayText: 'แก้ไข' },
      { label: '❌ ยกเลิก', data: 'action=cancel_new_job', displayText: 'ยกเลิก' },
    ],
  });
  return { type: 'flex', altText, contents: bubble };
}
