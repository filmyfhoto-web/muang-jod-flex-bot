import { formatBaht } from '../utils/currency.js';
import { formatThaiDate } from '../utils/dates.js';
import { COLORS } from './theme.js';
import { header } from './components/header.js';
import { divider } from './components/divider.js';
import { footerActions } from './components/footerActions.js';

// Amount still owed on a job (balance_due if present, else the full total).
function outstanding(job) {
  if (job.balance_due != null) return Number(job.balance_due) || 0;
  return Number(job.total) || 0;
}

export function pendingPaymentFlex(jobs) {
  if (!jobs || !jobs.length) {
    return {
      type: 'flex',
      altText: 'ไม่มีงานค้างรับ',
      contents: {
        type: 'bubble',
        size: 'kilo',
        body: {
          type: 'box',
          layout: 'vertical',
          spacing: 'md',
          contents: [
            { type: 'text', text: '💰 ค้างรับ', weight: 'bold', color: COLORS.accent },
            { type: 'text', text: 'ไม่มีงานค้างรับเลยค่ะ เก่งมาก 💜', size: 'sm', color: COLORS.grey, wrap: true },
          ],
        },
      },
    };
  }

  const total = jobs.reduce((sum, j) => sum + outstanding(j), 0);

  const rows = jobs.slice(0, 15).map((job) => ({
    type: 'box',
    layout: 'horizontal',
    contents: [
      {
        type: 'box',
        layout: 'vertical',
        flex: 5,
        contents: [
          { type: 'text', text: job.job_name || 'งาน', size: 'sm', weight: 'bold', wrap: true },
          {
            type: 'text',
            text: `${formatThaiDate(job.job_date)} · ${job.job_number || ''}`.trim(),
            size: 'xs',
            color: COLORS.grey,
          },
        ],
      },
      {
        type: 'text',
        text: formatBaht(outstanding(job)),
        size: 'sm',
        color: COLORS.red,
        align: 'end',
        gravity: 'center',
        flex: 3,
      },
    ],
  }));

  const bodyContents = [];
  rows.forEach((r, i) => {
    if (i > 0) bodyContents.push(divider());
    bodyContents.push(r);
  });

  return {
    type: 'flex',
    altText: `งานค้างรับ ${jobs.length} รายการ`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: header('💰 งานค้างรับ', `${jobs.length} รายการ`),
      body: { type: 'box', layout: 'vertical', spacing: 'md', contents: bodyContents },
      footer: {
        type: 'box',
        layout: 'vertical',
        paddingAll: 'lg',
        spacing: 'md',
        contents: [
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              { type: 'text', text: 'ยอดรวมค้างรับ', size: 'sm', weight: 'bold', flex: 3 },
              {
                type: 'text',
                text: formatBaht(total),
                size: 'lg',
                weight: 'bold',
                color: COLORS.red,
                align: 'end',
                flex: 4,
              },
            ],
          },
          footerActions({
            primary: {
              label: '💰 บันทึกรับเงิน',
              data: 'action=record_payment',
              displayText: 'บันทึกรับเงิน',
            },
          }),
        ],
      },
    },
  };
}
