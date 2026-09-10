import { formatThaiDate } from '../utils/dates.js';
import { COLORS } from './theme.js';
import { header } from './components/header.js';
import { moneyRow } from './components/moneyRow.js';
import { divider } from './components/divider.js';
import { statusBadge } from './components/statusBadge.js';
import { joinMeta } from './components/metaLine.js';

// Shown after a payment is recorded — total / paid / outstanding + status.
export function paymentConfirmationFlex(job) {
  return {
    type: 'flex',
    altText: 'บันทึกรับเงินแล้ว',
    contents: {
      type: 'bubble',
      size: 'kilo',
      header: header('💰 บันทึกรับเงินแล้ว', job.job_name || 'งาน'),
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              {
                type: 'text',
                text: joinMeta(formatThaiDate(job.job_date), job.job_number),
                size: 'xs',
                color: COLORS.grey,
                flex: 5,
                gravity: 'center',
              },
              statusBadge(job.payment_status),
            ],
          },
          divider(),
          moneyRow('ยอดรวม', Number(job.total) || 0, { color: COLORS.ink }),
          moneyRow('รับแล้วทั้งหมด', Number(job.paid_amount) || 0, { color: COLORS.green }),
          moneyRow('คงเหลือ', Number(job.balance_due) || 0, {
            color: Number(job.balance_due) > 0 ? COLORS.red : COLORS.green,
            big: true,
          }),
        ],
      },
    },
  };
}
