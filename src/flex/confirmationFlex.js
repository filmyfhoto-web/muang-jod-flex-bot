import { formatBaht } from '../utils/currency.js';
import { formatThaiDate } from '../utils/dates.js';
import { COLORS } from './theme.js';
import { divider } from './components/divider.js';
import { footerActions } from './components/footerActions.js';

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
          { type: 'text', text: '🗑 ยืนยันการยกเลิก', weight: 'bold', size: 'md', color: COLORS.red },
          { type: 'text', text: 'ต้องการยกเลิกรายการนี้ใช่ไหมคะ?', size: 'sm', color: COLORS.sub, wrap: true },
          divider(),
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
                color: COLORS.grey,
              },
              { type: 'text', text: `ยอดรวม ${formatBaht(job.total)}`, size: 'sm', color: COLORS.accent },
            ],
          },
        ],
      },
      footer: footerActions({
        secondary: [
          { label: '❌ ไม่ยกเลิก', data: 'action=cancel_cancel', displayText: 'ไม่ยกเลิก' },
          {
            label: '✅ ยืนยันยกเลิก',
            data: `action=confirm_cancel&jobId=${encodeURIComponent(job.id)}`,
            displayText: 'ยืนยันยกเลิก',
            style: 'primary',
            color: COLORS.red,
          },
        ],
      }),
    },
  };
}
