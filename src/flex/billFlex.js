import { formatBaht } from '../utils/currency.js';
import { formatThaiDate, formatThaiDateTime } from '../utils/dates.js';
import { jobCategory } from '../utils/category.js';
import { COLORS, paymentPresentation } from './theme.js';
import { divider } from './components/divider.js';
import { statusBadge } from './components/statusBadge.js';
import { brandAssetUrl, MASCOT } from '../utils/brand.js';
import { publicBaseUrl } from '../utils/brand.js';

// Cards for the last two steps of the flow: รวมรายการลงบิล -> รับชำระและออกใบเสร็จ.

export function receiptUrl(bill, opts = {}) {
  const base = opts.baseUrl !== undefined ? opts.baseUrl : publicBaseUrl();
  if (!base || !bill?.share_token) return null;
  return `${base}/r/${bill.share_token}`;
}

function jobLine(job, index) {
  const { group, type } = jobCategory(job);
  return {
    type: 'box',
    layout: 'horizontal',
    spacing: 'sm',
    alignItems: 'center',
    contents: [
      {
        type: 'box',
        layout: 'vertical',
        width: '20px',
        height: '20px',
        cornerRadius: '10px',
        backgroundColor: COLORS.accent,
        justifyContent: 'center',
        alignItems: 'center',
        flex: 0,
        contents: [{ type: 'text', text: String(index + 1), size: 'xxs', weight: 'bold', color: COLORS.white, align: 'center' }],
      },
      {
        type: 'box',
        layout: 'vertical',
        flex: 5,
        contents: [
          { type: 'text', text: job.job_name || 'งาน', size: 'sm', color: COLORS.ink, wrap: true },
          { type: 'text', text: `${type?.icon || group.icon} ${formatThaiDate(job.job_date)}`, size: 'xxs', color: COLORS.grey },
        ],
      },
      {
        type: 'text',
        text: formatBaht(Number(job.total) || 0),
        size: 'sm',
        weight: 'bold',
        color: COLORS.ink,
        align: 'end',
        gravity: 'center',
        flex: 3,
      },
    ],
  };
}

function moneyBlock(bill) {
  const rows = [
    {
      type: 'box',
      layout: 'horizontal',
      backgroundColor: COLORS.tint,
      cornerRadius: 'lg',
      paddingAll: 'md',
      alignItems: 'center',
      contents: [
        { type: 'text', text: 'รวมทั้งสิ้น', size: 'md', weight: 'bold', color: COLORS.title, flex: 3 },
        {
          type: 'text',
          text: formatBaht(Number(bill.total) || 0),
          size: 'xxl',
          weight: 'bold',
          color: COLORS.accent,
          align: 'end',
          flex: 4,
        },
      ],
    },
  ];

  if (Number(bill.paid_amount) > 0 || Number(bill.balance_due) > 0) {
    rows.push({
      type: 'box',
      layout: 'horizontal',
      contents: [
        { type: 'text', text: `รับแล้ว ${formatBaht(Number(bill.paid_amount) || 0)}`, size: 'xs', color: COLORS.green, flex: 1 },
        { type: 'text', text: `คงเหลือ ${formatBaht(Number(bill.balance_due) || 0)}`, size: 'xs', color: COLORS.red, align: 'end', flex: 1 },
      ],
    });
  }
  return rows;
}

// The bill itself: what is on it, what it comes to, and how to settle it.
export function billFlex(bill, opts = {}) {
  const jobs = bill.jobs || [];
  const url = opts.receiptUrl !== undefined ? opts.receiptUrl : receiptUrl(bill);

  const footer = [
    {
      type: 'button',
      style: 'primary',
      color: COLORS.accent,
      height: 'sm',
      action: {
        type: 'postback',
        label: '💰 รับชำระเงิน',
        data: `action=bill_payment&billId=${encodeURIComponent(bill.id)}`,
        displayText: 'รับชำระเงิน',
      },
    },
  ];
  if (url) {
    footer.push({
      type: 'button',
      style: 'secondary',
      height: 'sm',
      action: { type: 'uri', label: '🧾 เปิดใบเสร็จ', uri: url },
    });
  }

  return {
    type: 'flex',
    altText: `บิล ${bill.bill_number || ''} ${formatBaht(Number(bill.total) || 0)}`.trim(),
    contents: {
      type: 'bubble',
      size: 'mega',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        paddingAll: 'lg',
        backgroundColor: COLORS.surface,
        contents: [
          {
            type: 'box',
            layout: 'horizontal',
            alignItems: 'center',
            contents: [
              { type: 'text', text: '🧾 บิลรวมรายการ', weight: 'bold', size: 'lg', color: COLORS.title, flex: 4 },
              statusBadge(bill.payment_status),
            ],
          },
          {
            type: 'text',
            text: `${bill.bill_number || ''} · ${formatThaiDateTime(bill.created_at)}`.trim(),
            size: 'xs',
            color: COLORS.grey,
            wrap: true,
          },
          ...(bill.customer_name
            ? [{ type: 'text', text: `ลูกค้า: ${bill.customer_name}`, size: 'sm', color: COLORS.sub, wrap: true }]
            : []),
          divider(),
          {
            type: 'box',
            layout: 'vertical',
            spacing: 'md',
            contents: jobs.length
              ? jobs.slice(0, 10).map(jobLine)
              : [{ type: 'text', text: 'ยังไม่มีรายการในบิลนี้', size: 'sm', color: COLORS.grey }],
          },
          ...(jobs.length > 10
            ? [{ type: 'text', text: `และอีก ${jobs.length - 10} รายการ`, size: 'xs', color: COLORS.grey }]
            : []),
          divider(),
          ...moneyBlock(bill),
        ],
      },
      footer: { type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: 'lg', paddingTop: 'none', contents: footer },
      styles: { body: { backgroundColor: COLORS.surface }, footer: { backgroundColor: COLORS.surface } },
    },
  };
}

// The receipt, once the bill is settled.
export function billReceiptFlex(bill, opts = {}) {
  const p = paymentPresentation(bill.payment_status);
  const url = opts.receiptUrl !== undefined ? opts.receiptUrl : receiptUrl(bill);
  const mascot = opts.mascotImageUrl !== undefined ? opts.mascotImageUrl : brandAssetUrl(MASCOT.clipboard);
  const settled = bill.payment_status === 'paid';

  const head = [
    {
      type: 'box',
      layout: 'vertical',
      width: '48px',
      height: '48px',
      cornerRadius: '24px',
      backgroundColor: settled ? COLORS.accent : COLORS.orange,
      justifyContent: 'center',
      alignItems: 'center',
      flex: 0,
      contents: [{ type: 'text', text: settled ? '✓' : '💰', size: 'xl', weight: 'bold', color: COLORS.white, align: 'center' }],
    },
    {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: settled ? 'ออกใบเสร็จแล้ว' : 'รับชำระบางส่วน',
          weight: 'bold',
          size: 'xl',
          color: COLORS.title,
          wrap: true,
        },
        { type: 'text', text: settled ? 'ขอบคุณที่ชำระเงินค่ะ 💜' : `ยังค้าง ${formatBaht(Number(bill.balance_due) || 0)}`, size: 'xs', color: COLORS.grey, wrap: true },
      ],
    },
  ];
  if (mascot) {
    head.push({ type: 'image', url: mascot, size: '56px', aspectRatio: '1:1', aspectMode: 'cover', align: 'end', flex: 0 });
  }

  const footer = [];
  if (url) {
    footer.push({
      type: 'button',
      style: 'primary',
      color: COLORS.accent,
      height: 'sm',
      action: { type: 'uri', label: '🧾 เปิด/ส่งใบเสร็จ', uri: url },
    });
  }
  footer.push({
    type: 'text',
    text: settled ? 'ส่งลิงก์ใบเสร็จให้ลูกค้าได้เลยค่ะ' : 'กดรับชำระอีกครั้งเมื่อได้เงินส่วนที่เหลือนะคะ',
    size: 'xs',
    color: COLORS.grey,
    align: 'center',
    wrap: true,
  });

  return {
    type: 'flex',
    altText: `ใบเสร็จ ${bill.bill_number || ''} ${formatBaht(Number(bill.paid_amount) || 0)}`.trim(),
    contents: {
      type: 'bubble',
      size: 'mega',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        paddingAll: 'lg',
        backgroundColor: COLORS.surface,
        contents: [
          { type: 'box', layout: 'horizontal', spacing: 'md', alignItems: 'center', contents: head },
          divider(),
          {
            type: 'box',
            layout: 'vertical',
            backgroundColor: COLORS.tint,
            cornerRadius: 'lg',
            paddingAll: 'md',
            spacing: 'xs',
            contents: [
              { type: 'text', text: bill.bill_number || '', size: 'sm', weight: 'bold', color: COLORS.title },
              {
                type: 'text',
                text: `${bill.customer_name ? `ลูกค้า: ${bill.customer_name} · ` : ''}${(bill.jobs || []).length} รายการ`,
                size: 'xs',
                color: COLORS.sub,
                wrap: true,
              },
              { type: 'text', text: formatThaiDateTime(bill.issued_at || bill.updated_at || bill.created_at), size: 'xxs', color: COLORS.grey },
            ],
          },
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              { type: 'text', text: 'ยอดบิล', size: 'sm', color: COLORS.sub, flex: 3 },
              { type: 'text', text: formatBaht(Number(bill.total) || 0), size: 'sm', weight: 'bold', color: COLORS.ink, align: 'end', flex: 3 },
            ],
          },
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              { type: 'text', text: 'รับชำระแล้ว', size: 'sm', color: COLORS.sub, flex: 3 },
              { type: 'text', text: formatBaht(Number(bill.paid_amount) || 0), size: 'lg', weight: 'bold', color: p.color, align: 'end', flex: 3 },
            ],
          },
        ],
      },
      footer: { type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: 'lg', paddingTop: 'none', contents: footer },
      styles: { body: { backgroundColor: COLORS.surface }, footer: { backgroundColor: COLORS.surface } },
    },
  };
}

// Picker: which customer's outstanding work to put on a bill.
export function billCustomersFlex(customers = []) {
  if (!customers.length) {
    return {
      type: 'text',
      text: 'ยังไม่มีงานที่รอออกบิลค่ะ 💜\nบันทึกงานก่อน แล้วค่อยกด "ออกบิล" นะคะ',
    };
  }

  const rows = customers.slice(0, 10).map((c) => ({
    type: 'box',
    layout: 'horizontal',
    spacing: 'md',
    alignItems: 'center',
    paddingAll: 'md',
    cornerRadius: 'lg',
    borderWidth: '1px',
    borderColor: COLORS.line,
    action: {
      type: 'postback',
      data: `action=create_bill&customer=${encodeURIComponent(c.customerName || '')}`,
      displayText: `ออกบิล ${c.customerName || 'ไม่ระบุลูกค้า'}`,
    },
    contents: [
      {
        type: 'box',
        layout: 'vertical',
        flex: 5,
        contents: [
          { type: 'text', text: c.customerName || 'ไม่ระบุลูกค้า', size: 'sm', weight: 'bold', color: COLORS.ink, wrap: true },
          { type: 'text', text: `${c.jobCount} งาน · ค้าง ${formatBaht(c.due)}`, size: 'xxs', color: COLORS.grey },
        ],
      },
      { type: 'text', text: formatBaht(c.total), size: 'sm', weight: 'bold', color: COLORS.accent, align: 'end', flex: 3 },
    ],
  }));

  return {
    type: 'flex',
    altText: 'เลือกลูกค้าเพื่อออกบิล',
    contents: {
      type: 'bubble',
      size: 'mega',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        paddingAll: 'lg',
        backgroundColor: COLORS.surface,
        contents: [
          {
            type: 'box',
            layout: 'vertical',
            backgroundColor: COLORS.tint,
            cornerRadius: 'lg',
            paddingAll: 'md',
            spacing: 'xs',
            contents: [
              { type: 'text', text: '🧾 ออกบิล', size: 'lg', weight: 'bold', color: COLORS.title },
              { type: 'text', text: 'เลือกลูกค้า แล้วม่วงจดจะรวมงานที่ยังไม่ได้ออกบิลให้ค่ะ', size: 'xs', color: COLORS.sub, wrap: true },
            ],
          },
          ...rows,
        ],
      },
    },
  };
}
