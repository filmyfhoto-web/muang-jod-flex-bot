import { formatBaht } from '../utils/currency.js';
import { formatThaiDate } from '../utils/dates.js';
import { PURPLE, RED, GREY } from './jobCard.js';

// Confirmation card for cancelling a job. Encodes jobId in the postback data.
export function confirmCancelFlex(job) {
  return {
    type: 'flex',
    altText: 'ยืนยันการยกเลิกงาน',
    contents: {
      type: 'bubble',
      size: 'kilo',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          { type: 'text', text: '🗑 ยืนยันการยกเลิก', weight: 'bold', size: 'md', color: RED },
          {
            type: 'text',
            text: 'ต้องการยกเลิกรายการนี้ใช่ไหมคะ?',
            size: 'sm',
            color: '#555555',
            wrap: true,
          },
          { type: 'separator' },
          {
            type: 'box',
            layout: 'vertical',
            spacing: 'xs',
            contents: [
              { type: 'text', text: job.job_name || 'งาน', weight: 'bold', size: 'sm', wrap: true },
              {
                type: 'text',
                text: `${formatThaiDate(job.job_date)} · ${job.job_number || ''}`.trim(),
                size: 'xs',
                color: GREY,
              },
              { type: 'text', text: `ยอดรวม ${formatBaht(job.total)}`, size: 'sm', color: PURPLE },
            ],
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'horizontal',
        spacing: 'sm',
        contents: [
          {
            type: 'button',
            style: 'secondary',
            height: 'sm',
            action: {
              type: 'postback',
              label: '❌ ไม่ยกเลิก',
              data: 'action=cancel_cancel',
              displayText: 'ไม่ยกเลิก',
            },
          },
          {
            type: 'button',
            style: 'primary',
            color: RED,
            height: 'sm',
            action: {
              type: 'postback',
              label: '✅ ยืนยันยกเลิก',
              data: `action=confirm_cancel&jobId=${encodeURIComponent(job.id)}`,
              displayText: 'ยืนยันยกเลิก',
            },
          },
        ],
      },
    },
  };
}
