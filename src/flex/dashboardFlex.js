import { formatBaht } from '../utils/currency.js';
import { formatThaiDate, formatThaiDateTime } from '../utils/dates.js';
import { jobCategory } from '../utils/category.js';
import { COLORS } from './theme.js';
import { divider } from './components/divider.js';
import { statusBadge } from './components/statusBadge.js';
import { liffUrl } from '../utils/liff.js';

// "สรุปงานวันนี้" as in the mockup: the day's total with its trend against
// yesterday, a tile per work category, the proportions of the day, and the
// latest jobs — with a button into the LIFF dashboard when one is configured.

const TREND = { up: { arrow: '↗', color: COLORS.green }, down: { arrow: '↘', color: COLORS.red }, flat: { arrow: '→', color: COLORS.grey } };

function trendLine(trend) {
  const t = TREND[trend?.direction] || TREND.flat;
  const text =
    trend?.percent === null || trend?.percent === undefined
      ? 'ยังไม่มียอดเมื่อวานให้เทียบ'
      : `${t.arrow} ${trend.percent > 0 ? '+' : ''}${trend.percent}% จากเมื่อวาน`;
  return { type: 'text', text, size: 'md', color: t.color, weight: 'bold' };
}

// One category tile: icon + name, jobs, money.
function categoryTile(cat) {
  return {
    type: 'box',
    layout: 'vertical',
    backgroundColor: COLORS.tint,
    cornerRadius: 'lg',
    paddingAll: 'md',
    spacing: 'xs',
    flex: 1,
    contents: [
      {
        type: 'box',
        layout: 'horizontal',
        spacing: 'xs',
        alignItems: 'center',
        contents: [
          { type: 'text', text: cat.icon, size: 'xxl', flex: 0 },
          { type: 'text', text: cat.label, size: 'sm', color: COLORS.sub, wrap: true },
        ],
      },
      { type: 'text', text: `${cat.count} งาน`, size: 'xxl', weight: 'bold', color: cat.color },
      { type: 'text', text: formatBaht(cat.total), size: 'md', color: COLORS.grey },
    ],
  };
}

// Tiles laid out two per row.
function categoryTiles(categories) {
  const rows = [];
  for (let i = 0; i < categories.length; i += 2) {
    const pair = categories.slice(i, i + 2).map(categoryTile);
    if (pair.length === 1) pair.push({ type: 'box', layout: 'vertical', flex: 1, contents: [] });
    rows.push({ type: 'box', layout: 'horizontal', spacing: 'sm', contents: pair });
  }
  return rows;
}

function shareRow(cat) {
  const filled = Math.max(0, Math.min(100, cat.percent));
  return {
    type: 'box',
    layout: 'vertical',
    spacing: 'xs',
    contents: [
      {
        type: 'box',
        layout: 'horizontal',
        contents: [
          { type: 'text', text: `${cat.icon} ${cat.label}`, size: 'md', color: COLORS.sub, flex: 3 },
          { type: 'text', text: `${cat.percent}%`, size: 'md', color: cat.color, weight: 'bold', align: 'end', flex: 1 },
        ],
      },
      {
        type: 'box',
        layout: 'horizontal',
        height: '10px',
        cornerRadius: 'sm',
        backgroundColor: COLORS.line,
        contents: [
          { type: 'box', layout: 'vertical', flex: filled, backgroundColor: cat.color, cornerRadius: 'sm', contents: [] },
          { type: 'box', layout: 'vertical', flex: 100 - filled, contents: [] },
        ].filter((b) => b.flex > 0),
      },
    ],
  };
}

function recentRow(job) {
  const { group, type } = jobCategory(job);
  const time = job.created_at ? formatThaiDateTime(job.created_at).split(' ').pop() : '';
  const sub = [type?.label || group.label, job.customer_name ? `· ${job.customer_name}` : '', time ? `· ${time}` : '']
    .filter(Boolean)
    .join(' ');
  return {
    type: 'box',
    layout: 'horizontal',
    spacing: 'md',
    alignItems: 'center',
    contents: [
      {
        type: 'box',
        layout: 'vertical',
        width: '54px',
        height: '54px',
        cornerRadius: 'md',
        backgroundColor: COLORS.tint,
        justifyContent: 'center',
        alignItems: 'center',
        flex: 0,
        contents: [{ type: 'text', text: type?.icon || group.icon, size: 'xxl', align: 'center' }],
      },
      {
        type: 'box',
        layout: 'vertical',
        flex: 5,
        contents: [
          { type: 'text', text: job.job_name || 'งาน', size: 'lg', weight: 'bold', color: COLORS.ink, wrap: true },
          { type: 'text', text: sub, size: 'sm', color: COLORS.grey, wrap: true },
        ],
      },
      {
        type: 'box',
        layout: 'vertical',
        flex: 3,
        alignItems: 'flex-end',
        spacing: 'xs',
        contents: [
          { type: 'text', text: formatBaht(Number(job.total) || 0), size: 'lg', weight: 'bold', color: COLORS.ink, align: 'end' },
          statusBadge(job.payment_status),
        ],
      },
    ],
  };
}

export function dashboardFlex(dash, opts = {}) {
  const { summary, counts, categories = [], trend, recent = [] } = dash;
  const total = summary.jobCount || 0;
  const dashUrl = opts.liffUrl !== undefined ? opts.liffUrl : liffUrl({ tab: 'today' });

  const body = [
    {
      type: 'box',
      layout: 'horizontal',
      alignItems: 'center',
      contents: [
        { type: 'text', text: '📊 สรุปงานวันนี้', weight: 'bold', size: 'xxl', color: COLORS.title, flex: 4 },
        {
          type: 'box',
          layout: 'vertical',
          backgroundColor: COLORS.tint,
          cornerRadius: 'xxl',
          paddingAll: 'xs',
          paddingStart: 'md',
          paddingEnd: 'md',
          flex: 0,
          contents: [{ type: 'text', text: formatThaiDate(summary.date), size: 'md', color: COLORS.title, weight: 'bold' }],
        },
      ],
    },
    // Headline: the day's money and how it compares with yesterday.
    {
      type: 'box',
      layout: 'vertical',
      backgroundColor: COLORS.tint,
      cornerRadius: 'lg',
      paddingAll: 'lg',
      spacing: 'xs',
      contents: [
        { type: 'text', text: 'ยอดวันนี้', size: 'md', color: COLORS.sub },
        { type: 'text', text: formatBaht(summary.total), size: '4xl', weight: 'bold', color: COLORS.accent },
        trendLine(trend),
        {
          type: 'box',
          layout: 'horizontal',
          paddingTop: 'sm',
          contents: [
            { type: 'text', text: `${total} งาน`, size: 'md', color: COLORS.sub, flex: 1 },
            { type: 'text', text: `รับแล้ว ${formatBaht(summary.paid)}`, size: 'md', color: COLORS.green, align: 'center', flex: 2 },
            { type: 'text', text: `ค้าง ${formatBaht(summary.pending)}`, size: 'md', color: COLORS.red, align: 'end', flex: 2 },
          ],
        },
      ],
    },
  ];

  if (categories.length) {
    body.push(...categoryTiles(categories.slice(0, 4)));
    body.push(divider());
    body.push({ type: 'text', text: 'สัดส่วนงานวันนี้', weight: 'bold', size: 'lg', color: COLORS.title });
    body.push(...categories.slice(0, 4).map(shareRow));
  }

  body.push(divider());
  if (recent.length) {
    body.push(
      {
        type: 'box',
        layout: 'horizontal',
        contents: [
          { type: 'text', text: 'รายการล่าสุด', weight: 'bold', size: 'lg', color: COLORS.title, flex: 3 },
          {
            type: 'text',
            text: 'ดูทั้งหมด ›',
            size: 'md',
            color: COLORS.accent,
            align: 'end',
            flex: 2,
            action: { type: 'postback', label: 'ดูทั้งหมด', data: 'action=recent_jobs', displayText: 'รายการล่าสุด' },
          },
        ],
      },
      ...recent.slice(0, 3).map(recentRow)
    );
  } else {
    body.push({
      type: 'text',
      text: 'วันนี้ยังไม่มีงานค่ะ พิมพ์รายการงานมาได้เลยนะคะ 💜',
      size: 'lg',
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
      color: COLORS.accent,
      height: 'md',
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
        height: 'md',
        action: { type: 'postback', label: '📈 รายงาน', data: 'action=report_menu', displayText: 'รายงาน' },
      },
      {
        type: 'button',
        style: 'secondary',
        height: 'md',
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
      styles: { body: { backgroundColor: COLORS.surface }, footer: { backgroundColor: COLORS.surface } },
    },
  };
}
