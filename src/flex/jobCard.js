import { formatBaht, numText } from '../utils/currency.js';
import { formatThaiDate } from '../utils/dates.js';
import { COLORS, paymentPresentation } from './theme.js';
import { moneyRow } from './components/moneyRow.js';
import { divider } from './components/divider.js';
import { statusBadge } from './components/statusBadge.js';
import { footerActions } from './components/footerActions.js';
import { categoryLabel } from '../utils/category.js';
import { brandAssetUrl } from '../utils/brand.js';
import { dueLine } from './components/dueLine.js';
import { joinMeta } from './components/metaLine.js';

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
  return url ? { type: 'image', url, size: 'full', aspectRatio: '20:5', aspectMode: 'cover' } : null;
}

// A small square button, the way the reference card puts ✏️ and ✕ beside a
// row rather than in a footer. Flex buttons are full-width blocks, so an icon
// this size has to be a box with an action on it.
function iconAction(emoji, { data, displayText, bg = COLORS.tint, color = COLORS.sub }) {
  return {
    type: 'box',
    layout: 'vertical',
    width: '30px',
    height: '30px',
    cornerRadius: 'md',
    backgroundColor: bg,
    justifyContent: 'center',
    alignItems: 'center',
    flex: 0,
    action: { type: 'postback', label: displayText, data, displayText },
    contents: [{ type: 'text', text: emoji, size: 'sm', align: 'center', color }],
  };
}

// One line of the job: what it is, how much of it, and what it came to.
// Two lines rather than one, so a long name reads in full instead of being
// squeezed against the amount and cut.
function itemLine(it, index) {
  const qty = Number(it.quantity) || 1;
  const sub = [it.size, qty !== 1 ? `${numText(qty)} ${it.unit || 'ชิ้น'}` : null].filter(Boolean).join(' · ');

  return {
    type: 'box',
    layout: 'vertical',
    spacing: 'none',
    contents: [
      {
        type: 'box',
        layout: 'horizontal',
        spacing: 'sm',
        contents: [
          { type: 'text', text: `${index + 1}.`, size: 'sm', color: COLORS.grey, flex: 0 },
          { type: 'text', text: it.item_name || 'รายการ', size: 'sm', color: COLORS.ink, wrap: true, flex: 6 },
          {
            type: 'text',
            text: formatBaht(Number(it.total) || 0),
            size: 'sm',
            weight: 'bold',
            color: COLORS.ink,
            align: 'end',
            flex: 3,
          },
        ],
      },
      ...(sub
        ? [{ type: 'text', text: sub, size: 'xxs', color: COLORS.grey, margin: 'none', offsetStart: '16px', wrap: true }]
        : []),
    ],
  };
}

// Build a single job bubble. Reused as a standalone card and inside carousels.
export function buildJobBubble(job) {
  const items = job.items || [];

  // A small table: one line per item, a hairline between them, amounts in a
  // column down the right.
  const itemRows = [];
  items.slice(0, 8).forEach((it, i) => {
    if (i) itemRows.push({ type: 'separator', color: COLORS.line });
    itemRows.push(itemLine(it, i));
  });

  if (!itemRows.length) {
    itemRows.push({ type: 'text', text: 'ไม่มีรายการสินค้า', size: 'md', color: COLORS.grey });
  }

  // ✏️ and ✕ sit beside the job's name, not in a footer — the reference card
  // puts them on the row itself, and it reads as "this row, these buttons".
  const rowActions = job.id
    ? [
        iconAction('✏️', {
          data: `action=edit_job&jobId=${encodeURIComponent(job.id)}`,
          displayText: 'แก้ไขรายการ',
        }),
        iconAction('✕', {
          data: `action=delete_job&jobId=${encodeURIComponent(job.id)}`,
          displayText: 'ยกเลิกรายการ',
          bg: '#FDEAEA',
          color: COLORS.red,
        }),
      ]
    : [];

  const bodyContents = [
    {
      type: 'box',
      layout: 'horizontal',
      spacing: 'sm',
      alignItems: 'center',
      contents: [
        {
          type: 'text',
          text: job.job_name || categoryLabel(job),
          weight: 'bold',
          size: 'md',
          color: COLORS.title,
          flex: 5,
          wrap: true,
        },
        ...rowActions,
      ],
    },
    {
      type: 'box',
      layout: 'horizontal',
      spacing: 'sm',
      alignItems: 'center',
      contents: [
        {
          type: 'text',
          text: joinMeta(formatThaiDate(job.job_date), job.job_number),
          size: 'xs',
          color: COLORS.grey,
          flex: 5,
          wrap: true,
        },
        statusBadge(job.payment_status, { size: 'xs' }),
      ],
    },
    ...(job.customer_name
      ? [{ type: 'text', text: `ลูกค้า: ${job.customer_name}`, size: 'xs', color: COLORS.sub, wrap: true }]
      : []),
    ...(dueLine(job.due_date, { size: 'sm' }) ? [dueLine(job.due_date, { size: 'sm' })] : []),
    divider(),
    { type: 'box', layout: 'vertical', spacing: 'sm', contents: itemRows },
    divider(),
    moneyRow('ยอดรวม', Number(job.total) || 0, { color: COLORS.accentText, big: true }),
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

  // A saved job can be billed and re-categorised from its footer; ✏️ and ✕
  // live beside its name. A draft (no id yet) gets its own footer instead.
  if (job.id) {
    bubble.footer = footerActions({
      primary: {
        label: '🧾 ออกใบเสร็จ',
        data: `action=bill_job&jobId=${encodeURIComponent(job.id)}`,
        displayText: 'ออกใบเสร็จงานนี้',
      },
      // ✏️ and ✕ are up beside the name now. Re-categorising is a once-in-a-
      // while correction, so it goes as a word, not a slab of grey.
      links: [
        { label: '🗂 เลือกหมวด', data: `action=pick_category&jobId=${encodeURIComponent(job.id)}`, displayText: 'เลือกหมวด' },
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
    contents: [{ type: 'text', text: '📋 ตรวจสอบก่อนบันทึก', weight: 'bold', size: 'md', color: COLORS.accentText }],
  };
  // Saving is the one thing this card is for; แก้ไข and ยกเลิก are the ways
  // out, and nothing is in the database yet, so they cost nothing to offer
  // quietly. Two more grey slabs under the button doubled the card's footer.
  bubble.footer = footerActions({
    primary: { label: '✅ บันทึกงาน', data: 'action=confirm_add_job', displayText: 'บันทึกงาน' },
    links: [
      { label: '✏️ แก้ไข', data: 'action=edit_new_job', displayText: 'แก้ไข' },
      { label: '❌ ยกเลิก', data: 'action=cancel_new_job', displayText: 'ยกเลิก', color: COLORS.red },
    ],
  });
  return { type: 'flex', altText, contents: bubble };
}
