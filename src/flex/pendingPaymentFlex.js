import { formatBaht } from '../utils/currency.js';
import { formatThaiDate } from '../utils/dates.js';
import { PURPLE, RED, GREY } from './jobCard.js';

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
            { type: 'text', text: '💰 ค้างรับ', weight: 'bold', color: PURPLE },
            {
              type: 'text',
              text: 'ไม่มีงานค้างรับเลยค่ะ เก่งมาก 💜',
              size: 'sm',
              color: GREY,
              wrap: true,
            },
          ],
        },
      },
    };
  }

  const total = jobs.reduce((sum, j) => sum + (Number(j.total) || 0), 0);

  const jobRows = jobs.slice(0, 15).map((job) => ({
    type: 'box',
    layout: 'horizontal',
    contents: [
      {
        type: 'box',
        layout: 'vertical',
        flex: 5,
        contents: [
          { type: 'text', text: job.job_name || 'งาน', size: 'sm', weight: 'bold', wrap: true },
          { type: 'text', text: formatThaiDate(job.job_date), size: 'xs', color: GREY },
        ],
      },
      {
        type: 'text',
        text: formatBaht(job.total),
        size: 'sm',
        color: RED,
        align: 'end',
        gravity: 'center',
        flex: 3,
      },
    ],
  }));

  const bodyContents = [];
  jobRows.forEach((r, i) => {
    if (i > 0) bodyContents.push({ type: 'separator' });
    bodyContents.push(r);
  });

  return {
    type: 'flex',
    altText: `งานค้างรับ ${jobs.length} รายการ`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: PURPLE,
        paddingAll: 'lg',
        contents: [
          { type: 'text', text: '💰 งานค้างรับ', weight: 'bold', color: '#FFFFFF', size: 'lg' },
          { type: 'text', text: `${jobs.length} รายการ`, size: 'xs', color: '#EDE9FE' },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: bodyContents,
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        paddingAll: 'lg',
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
                color: RED,
                align: 'end',
                flex: 4,
              },
            ],
          },
        ],
      },
    },
  };
}
