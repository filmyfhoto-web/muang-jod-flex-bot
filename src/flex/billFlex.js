import { formatBaht } from '../utils/currency.js';
import { formatThaiDate, formatThaiDateTime } from '../utils/dates.js';
import { jobCategory } from '../utils/category.js';
import { COLORS, paymentPresentation } from './theme.js';
import { divider } from './components/divider.js';
import { statusBadge } from './components/statusBadge.js';
import { brandAssetUrl, MASCOT } from '../utils/brand.js';
import { publicBaseUrl } from '../utils/brand.js';
import { linkRow, footerActions } from './components/footerActions.js';
import { withShopKey } from '../utils/receiptLink.js';

// Cards for the last two steps of the flow: รวมรายการลงบิล -> รับชำระและออกใบเสร็จ.

export function receiptUrl(bill, opts = {}) {
  const base = opts.baseUrl !== undefined ? opts.baseUrl : publicBaseUrl();
  if (!base || !bill?.share_token) return null;
  return `${base}/r/${bill.share_token}`;
}

// "Send it to the customer" without the bot needing to know who the customer
// is or spending a push on them. LINE's share URL opens the shop's own friend
// picker with the message already written; they choose the chat and send.
export function shareReceiptUrl(bill, opts = {}) {
  const url = receiptUrl(bill, opts);
  if (!url) return null;
  const lines = [
    'ใบเสร็จรับเงิน 🧾',
    `เลขที่ ${bill.bill_number || ''}`.trim(),
    ...(bill.customer_name ? [`ลูกค้า: ${bill.customer_name}`] : []),
    `ยอด ${formatBaht(Number(bill.total) || 0)}`,
    '',
    url,
  ];
  return `https://line.me/R/share?text=${encodeURIComponent(lines.join('\n'))}`;
}

// The two things a finished receipt needs: look at it, and send it on. Words,
// not slabs — three stacked full-width buttons made the card's footer taller
// than the bill it belonged to.
function receiptButtons(bill, opts = {}) {
  // opts carries baseUrl through, so a card built for a different host (or for
  // a test) shares the link that host would actually serve.
  const url = opts.receiptUrl !== undefined ? opts.receiptUrl : receiptUrl(bill, opts);
  if (!url) return [];
  const share = opts.shareUrl !== undefined ? opts.shareUrl : shareReceiptUrl(bill, opts);
  // การ์ดใบนี้อยู่ในแชตของร้าน ปุ่มเปิดจึงพาไปโหมดร้าน ซึ่งเห็นราคาที่คิดได้จริง
  // ก่อนปัดด้วย ส่วนปุ่มส่งให้ลูกค้าใช้ลิงก์เปล่า — ไม่มีกุญแจติดไป
  const mine = withShopKey(url, bill?.share_token) || url;
  return [
    linkRow([
      { label: '🧾 เปิดใบเสร็จ', uri: mine },
      ...(share ? [{ label: '📤 ส่งให้ลูกค้า', uri: share }] : []),
    ]),
  ];
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
          size: 'lg',
          weight: 'bold',
          color: COLORS.accentText,
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

  const footer = [
    {
      type: 'button',
      style: 'primary',
      color: COLORS.accentText,
      height: 'sm',
      action: {
        type: 'postback',
        label: '💰 รับชำระเงิน',
        data: `action=bill_payment&billId=${encodeURIComponent(bill.id)}`,
        displayText: 'รับชำระเงิน',
      },
    },
  ];
  footer.push(...receiptButtons(bill, opts));

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
              { type: 'text', text: '🧾 บิลรวมรายการ', weight: 'bold', size: 'md', color: COLORS.title, flex: 4 },
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
      contents: [{ type: 'text', text: settled ? '✓' : '💰', size: 'md', weight: 'bold', color: COLORS.white, align: 'center' }],
    },
    {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: settled ? 'ออกใบเสร็จแล้ว' : 'รับชำระบางส่วน',
          weight: 'bold',
          size: 'md',
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

  const footer = receiptButtons(bill, opts);
  // Only point at the button when there IS one — with no public URL there is
  // nothing to press, and telling the shop to press it would be a lie.
  const settledNote = footer.length
    ? 'กดปุ่มส่งต่อ แล้วเลือกแชตลูกค้าได้เลยค่ะ'
    : 'ชำระครบแล้วค่ะ ขอบคุณนะคะ 💜';
  footer.push({
    type: 'text',
    text: settled ? settledNote : 'กดรับชำระอีกครั้งเมื่อได้เงินส่วนที่เหลือนะคะ',
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
              { type: 'text', text: formatBaht(Number(bill.paid_amount) || 0), size: 'md', weight: 'bold', color: p.color, align: 'end', flex: 3 },
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
      { type: 'text', text: formatBaht(c.total), size: 'sm', weight: 'bold', color: COLORS.accentText, align: 'end', flex: 3 },
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
              { type: 'text', text: '🧾 ออกบิล', size: 'md', weight: 'bold', color: COLORS.title },
              { type: 'text', text: 'เลือกลูกค้า แล้วเลือกได้ว่าจะออกทีละงาน หรือรวมทั้งหมดค่ะ', size: 'xs', color: COLORS.sub, wrap: true },
            ],
          },
          ...rows,
        ],
      },
    },
  };
}

// The jobs one customer has waiting, so the shop can hand over a receipt for
// the job that is finished without dragging the rest onto the same bill.
// Combining them is still one tap, at the bottom — it just is not the default
// any more.
export function billJobsFlex(customerName, jobs = []) {
  const rows = jobs.slice(0, 10).map((j, i) => ({
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
      data: `action=bill_job&jobId=${encodeURIComponent(j.id)}`,
      displayText: `ออกใบเสร็จ ${j.job_name || 'งาน'}`,
    },
    contents: [
      { type: 'text', text: `${i + 1}.`, size: 'sm', color: COLORS.grey, flex: 0 },
      {
        type: 'box',
        layout: 'vertical',
        flex: 6,
        contents: [
          { type: 'text', text: j.job_name || 'งาน', size: 'sm', weight: 'bold', color: COLORS.ink, wrap: true },
          { type: 'text', text: formatThaiDate(j.job_date), size: 'xxs', color: COLORS.grey },
        ],
      },
      { type: 'text', text: formatBaht(Number(j.total) || 0), size: 'sm', weight: 'bold', color: COLORS.accentText, align: 'end', flex: 3 },
    ],
  }));

  const total = jobs.reduce((s, j) => s + (Number(j.total) || 0), 0);
  const who = customerName || 'ไม่ระบุลูกค้า';

  return {
    type: 'flex',
    altText: `เลือกงานเพื่อออกใบเสร็จ — ${who}`,
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
              { type: 'text', text: `🧾 ${who}`, size: 'md', weight: 'bold', color: COLORS.title, wrap: true },
              { type: 'text', text: `${jobs.length} งานรอออกบิล · รวม ${formatBaht(total)}`, size: 'xs', color: COLORS.sub, wrap: true },
              { type: 'text', text: 'แตะงานที่ต้องการ เพื่อออกใบเสร็จเฉพาะงานนั้นค่ะ', size: 'xs', color: COLORS.grey, wrap: true },
            ],
          },
          ...rows,
        ],
      },
      footer: footerActions({
        primary: {
          label: `🧷 รวมทุกงาน (${jobs.length})`,
          data: `action=bill_all&customer=${encodeURIComponent(customerName || '')}`,
          displayText: `รวมบิลทุกงานของ ${who}`,
        },
      }),
    },
  };
}
