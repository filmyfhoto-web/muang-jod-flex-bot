import { formatBaht } from '../utils/currency.js';
import { formatThaiDate } from '../utils/dates.js';
import { COLORS, paymentPresentation } from './theme.js';
import { moneyRow } from './components/moneyRow.js';
import { divider } from './components/divider.js';
import { statusBadge } from './components/statusBadge.js';
import { footerActions } from './components/footerActions.js';
import { categoryLabel } from '../utils/category.js';
import { brandAssetUrl } from '../utils/brand.js';

export function paymentLabel(status) {
  const p = paymentPresentation(status);
  return { text: p.text, color: p.color };
}

// A strip drawn ahead of time with the mascot resting its paws on a lavender
// edge. Flex has no z-index and cannot let an image overflow its bubble, so a
// mascot that appears to sit on the card's rim has to be baked into one image.
// Carousels skip it: eight copies of the same strip is noise, not charm.
function heroStrip() {
  const url = brandAssetUrl('ui/card-hero.png');
  return url ? { type: 'image', url, size: 'full', aspectRatio: '20:8', aspectMode: 'cover' } : null;
}

// Build a single job bubble. Reused as a standalone card and inside carousels.
export function buildJobBubble(job) {
  const items = job.items || [];

  // Numbered rows, as in the "พิมพ์งานพร้อมราคา" mockup: ① ป้ายไวนิล … 150
  const itemRows = items.slice(0, 8).map((it, i) => {
    const qty = Number(it.quantity) || 1;
    const pieces = [it.item_name];
    if (it.size) pieces.push(it.size);
    const label = pieces.join(' ') + (qty > 1 ? ` x${qty}` : '');
    return {
      type: 'box',
      layout: 'horizontal',
      spacing: 'sm',
      alignItems: 'center',
      contents: [
        {
          type: 'box',
          layout: 'vertical',
          width: '30px',
          height: '30px',
          cornerRadius: '15px',
          backgroundColor: COLORS.accent,
          justifyContent: 'center',
          alignItems: 'center',
          flex: 0,
          contents: [{ type: 'text', text: String(i + 1), size: 'md', weight: 'bold', color: COLORS.white, align: 'center' }],
        },
        moneyRow(label, Number(it.total) || 0, { color: COLORS.ink, bold: false }),
      ],
    };
  });

  if (!itemRows.length) {
    itemRows.push({ type: 'text', text: 'ไม่มีรายการสินค้า', size: 'md', color: COLORS.grey });
  }

  const bodyContents = [
    {
      type: 'box',
      layout: 'horizontal',
      contents: [
        {
          type: 'text',
          text: job.job_name || categoryLabel(job),
          weight: 'bold',
          size: 'xl',
          color: COLORS.title,
          flex: 5,
          wrap: true,
        },
        statusBadge(job.payment_status),
      ],
    },
    {
      type: 'text',
      text: `${formatThaiDate(job.job_date)} · ${job.job_number || ''}`.trim(),
      size: 'sm',
      color: COLORS.grey,
    },
    ...(job.customer_name
      ? [{ type: 'text', text: `ลูกค้า: ${job.customer_name}`, size: 'sm', color: COLORS.sub }]
      : []),
    divider(),
    { type: 'box', layout: 'vertical', spacing: 'sm', contents: itemRows },
    divider(),
    moneyRow('ยอดรวม', Number(job.total) || 0, { color: COLORS.accent, big: true }),
  ];

  // Show payment progress when partially paid.
  if (Number(job.paid_amount) > 0 && job.payment_status !== 'paid') {
    bodyContents.push(moneyRow('รับแล้ว', Number(job.paid_amount) || 0, { color: COLORS.green, size: 'md' }));
    bodyContents.push(moneyRow('คงเหลือ', Number(job.balance_due) || 0, { color: COLORS.red, size: 'md' }));
  }

  if (job.note) {
    bodyContents.push({
      type: 'text',
      text: `📝 ${job.note}`,
      size: 'sm',
      color: COLORS.grey,
      wrap: true,
    });
  }

  const bubble = {
    type: 'bubble',
    size: 'mega',
    body: { type: 'box', layout: 'vertical', spacing: 'md', contents: bodyContents },
  };

  // A saved job carries its own ✏️ / 🗑 / 🗂 actions, as in the mockup's
  // "รายการล่าสุด" card. A draft (no id yet) gets its own footer instead.
  if (job.id) {
    bubble.footer = footerActions({
      secondary: [
        { label: '✏️ แก้ไข', data: `action=edit_job&jobId=${encodeURIComponent(job.id)}`, displayText: 'แก้ไขรายการ' },
        { label: '🗑 ยกเลิก', data: `action=delete_job&jobId=${encodeURIComponent(job.id)}`, displayText: 'ยกเลิกรายการ' },
        { label: '🗂 หมวด', data: `action=pick_category&jobId=${encodeURIComponent(job.id)}`, displayText: 'เลือกหมวด' },
      ],
    });
  }

  return bubble;
}

// Wrap a single bubble as a sendable flex message.
export function jobCardMessage(job, altText = 'รายละเอียดงาน') {
  const bubble = buildJobBubble(job);
  const hero = heroStrip();
  if (hero) bubble.hero = hero;
  return { type: 'flex', altText, contents: bubble };
}

// Preview card shown BEFORE saving: receipt bubble + header + action buttons.
export function jobPreviewMessage(draftJob, altText = 'ตรวจสอบก่อนบันทึก') {
  const bubble = buildJobBubble({ ...draftJob, id: undefined });
  bubble.header = {
    type: 'box',
    layout: 'vertical',
    contents: [{ type: 'text', text: '📋 ตรวจสอบก่อนบันทึก', weight: 'bold', size: 'lg', color: COLORS.accent }],
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
