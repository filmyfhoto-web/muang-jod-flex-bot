import { formatBaht } from '../utils/currency.js';
import { formatThaiDate, formatThaiDateTime } from '../utils/dates.js';
import { guessCategory } from '../utils/category.js';
import { COLORS, paymentPresentation } from './theme.js';
import { divider } from './components/divider.js';
import { statusBadge } from './components/statusBadge.js';
import { liffUrl } from '../utils/liff.js';

// "สรุปวันนี้" styled after the dashboard mockup: three stat tiles, an
// overview with proportion bars, the latest jobs, and a button that opens the
// LIFF dashboard when one is configured.

function tile({ icon, label, value, color, bg }) {
  return {
    type: 'box',
    layout: 'vertical',
    backgroundColor: bg,
    cornerRadius: 'lg',
    paddingAll: 'md',
    alignItems: 'center',
    flex: 1,
    contents: [
      { type: 'text', text: icon, size: 'lg', align: 'center' },
      { type: 'text', text: label, size: 'xs', color: COLORS.sub, align: 'center' },
      { type: 'text', text: String(value), size: 'xxl', weight: 'bold', color, align: 'center' },
      { type: 'text', text: 'รายการ', size: 'xxs', color: COLORS.grey, align: 'center' },
    ],
  };
}

function bar(pct, color) {
  const filled = Math.max(0, Math.min(100, Math.round(pct)));
  return {
    type: 'box',
    layout: 'horizontal',
    height: '6px',
    cornerRadius: 'sm',
    backgroundColor: COLORS.line,
    contents: [
      { type: 'box', layout: 'vertical', flex: Math.max(filled, 0), backgroundColor: color, cornerRadius: 'sm', contents: [] },
      { type: 'box', layout: 'vertical', flex: Math.max(100 - filled, 0), contents: [] },
    ].filter((b) => b.flex > 0),
  };
}

function overviewRow(label, count, total, color) {
  const pct = total ? (count / total) * 100 : 0;
  return {
    type: 'box',
    layout: 'vertical',
    spacing: 'xs',
    contents: [
      {
        type: 'box',
        layout: 'horizontal',
        contents: [
          { type: 'text', text: `● ${label}`, size: 'sm', color, flex: 3 },
          { type: 'text', text: `${count} (${Math.round(pct)}%)`, size: 'sm', color: COLORS.sub, align: 'end', flex: 2 },
        ],
      },
      bar(pct, color),
    ],
  };
}

function recentRow(job) {
  const cat = guessCategory(job.items || []);
  const p = paymentPresentation(job.payment_status);
  const when = job.created_at ? formatThaiDateTime(job.created_at).split(' ').slice(-1)[0] : '';
  const sub = [job.customer_name ? `ลูกค้า: ${job.customer_name}` : null, when].filter(Boolean).join(' · ');
  return {
    type: 'box',
    layout: 'horizontal',
    spacing: 'md',
    alignItems: 'center',
    contents: [
      {
        type: 'box',
        layout: 'vertical',
        width: '36px',
        height: '36px',
        cornerRadius: 'md',
        backgroundColor: COLORS.purpleSoft,
        justifyContent: 'center',
        alignItems: 'center',
        flex: 0,
        contents: [{ type: 'text', text: cat?.icon || '📦', size: 'md', align: 'center' }],
      },
      {
        type: 'box',
        layout: 'vertical',
        flex: 5,
        contents: [
          { type: 'text', text: job.job_name || 'งาน', size: 'sm', weight: 'bold', color: COLORS.ink, wrap: true },
          { type: 'text', text: sub || job.job_number || ' ', size: 'xxs', color: COLORS.grey },
        ],
      },
      {
        type: 'box',
        layout: 'vertical',
        flex: 3,
        alignItems: 'flex-end',
        spacing: 'xs',
        contents: [
          { type: 'text', text: formatBaht(Number(job.total) || 0), size: 'sm', weight: 'bold', color: COLORS.ink, align: 'end' },
          statusBadge(job.payment_status),
        ],
      },
    ],
    action: { type: 'postback', label: p.text, data: `action=recent_jobs`, displayText: 'รายการล่าสุด' },
  };
}

export function dashboardFlex(dash, opts = {}) {
  const { summary, counts, recent = [] } = dash;
  const total = summary.jobCount || 0;
  const dashUrl = opts.liffUrl !== undefined ? opts.liffUrl : liffUrl({ tab: 'today' });

  const body = [
    {
      type: 'box',
      layout: 'horizontal',
      alignItems: 'center',
      contents: [
        { type: 'text', text: '📊 สรุปวันนี้', weight: 'bold', size: 'lg', color: COLORS.purpleDark, flex: 4 },
        {
          type: 'box',
          layout: 'vertical',
          backgroundColor: COLORS.purpleSoft,
          cornerRadius: 'xxl',
          paddingAll: 'xs',
          paddingStart: 'md',
          paddingEnd: 'md',
          flex: 0,
          contents: [{ type: 'text', text: formatThaiDate(summary.date), size: 'xs', color: COLORS.purpleDark, weight: 'bold' }],
        },
      ],
    },
    {
      type: 'box',
      layout: 'horizontal',
      spacing: 'sm',
      contents: [
        tile({ icon: '🗓️', label: 'งานวันนี้', value: total, color: COLORS.purple, bg: COLORS.purpleSoft }),
        tile({ icon: '✅', label: 'รับเงินแล้ว', value: counts.paid, color: COLORS.green, bg: '#E7F6EE' }),
        tile({ icon: '💰', label: 'ค้างรับ', value: counts.pending + counts.partial, color: COLORS.red, bg: '#FCEBEC' }),
      ],
    },
    {
      type: 'box',
      layout: 'horizontal',
      backgroundColor: COLORS.greyLight,
      cornerRadius: 'lg',
      paddingAll: 'md',
      contents: [
        {
          type: 'box',
          layout: 'vertical',
          flex: 1,
          contents: [
            { type: 'text', text: 'ยอดรวม', size: 'xxs', color: COLORS.grey },
            { type: 'text', text: formatBaht(summary.total), size: 'md', weight: 'bold', color: COLORS.ink },
          ],
        },
        {
          type: 'box',
          layout: 'vertical',
          flex: 1,
          contents: [
            { type: 'text', text: 'รับแล้ว', size: 'xxs', color: COLORS.grey, align: 'center' },
            { type: 'text', text: formatBaht(summary.paid), size: 'md', weight: 'bold', color: COLORS.green, align: 'center' },
          ],
        },
        {
          type: 'box',
          layout: 'vertical',
          flex: 1,
          contents: [
            { type: 'text', text: 'ค้างรับ', size: 'xxs', color: COLORS.grey, align: 'end' },
            { type: 'text', text: formatBaht(summary.pending), size: 'md', weight: 'bold', color: COLORS.red, align: 'end' },
          ],
        },
      ],
    },
  ];

  if (total > 0) {
    body.push(
      { type: 'text', text: 'ภาพรวมงาน', weight: 'bold', size: 'sm', color: COLORS.purpleDark },
      overviewRow('รับเงินแล้ว', counts.paid, total, COLORS.green),
      overviewRow('รับบางส่วน', counts.partial, total, COLORS.orange),
      overviewRow('ค้างรับ', counts.pending, total, COLORS.red)
    );
  }

  body.push(divider());
  if (recent.length) {
    body.push(
      { type: 'text', text: 'รายการล่าสุด', weight: 'bold', size: 'sm', color: COLORS.purpleDark },
      ...recent.slice(0, 3).map(recentRow)
    );
  } else {
    body.push({
      type: 'text',
      text: 'วันนี้ยังไม่มีงานค่ะ พิมพ์รายการงานมาได้เลยนะคะ 💜',
      size: 'sm',
      color: COLORS.grey,
      align: 'center',
      wrap: true,
    });
  }

  const footerContents = [];
  if (dashUrl) {
    footerContents.push({
      type: 'button',
      style: 'primary',
      color: COLORS.purple,
      height: 'sm',
      action: { type: 'uri', label: '📊 เปิดแดชบอร์ด', uri: dashUrl },
    });
  }
  footerContents.push({
    type: 'box',
    layout: 'horizontal',
    spacing: 'sm',
    contents: [
      {
        type: 'button',
        style: 'secondary',
        height: 'sm',
        action: { type: 'postback', label: '📋 รายการล่าสุด', data: 'action=recent_jobs', displayText: 'รายการล่าสุด' },
      },
      {
        type: 'button',
        style: 'secondary',
        height: 'sm',
        action: { type: 'postback', label: '💰 ค้างรับ', data: 'action=pending_payment', displayText: 'ค้างรับ' },
      },
    ],
  });

  return {
    type: 'flex',
    altText: `สรุปวันนี้ ${total} งาน รวม ${formatBaht(summary.total)}`,
    contents: {
      type: 'bubble',
      size: 'mega',
      body: { type: 'box', layout: 'vertical', spacing: 'md', paddingAll: 'lg', contents: body },
      footer: { type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: 'lg', paddingTop: 'none', contents: footerContents },
      styles: { body: { backgroundColor: COLORS.white }, footer: { backgroundColor: COLORS.white } },
    },
  };
}
