import { formatThaiDate } from '../utils/dates.js';
import { COLORS } from './theme.js';
import { header } from './components/header.js';
import { moneyRow } from './components/moneyRow.js';
import { divider } from './components/divider.js';

export function todaySummaryFlex(summary) {
  return {
    type: 'flex',
    altText: `สรุปวันนี้ ${summary.jobCount} งาน`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: header('📊 สรุปวันนี้', formatThaiDate(summary.date)),
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          moneyRow('จำนวนงานทั้งหมด', `${summary.jobCount} งาน`, { color: COLORS.purpleDark }),
          divider(),
          moneyRow('ยอดรวมทั้งหมด', summary.total, { color: COLORS.ink }),
          moneyRow('รับเงินแล้ว', summary.paid, { color: COLORS.green }),
          moneyRow('ค้างรับ', summary.pending, { color: COLORS.red }),
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: summary.jobCount ? 'สู้ ๆ นะคะ วันนี้ทำได้ดีมากค่ะ 💜' : 'วันนี้ยังไม่มีงานค่ะ',
            size: 'md',
            color: COLORS.grey,
            align: 'center',
            wrap: true,
          },
        ],
      },
    },
  };
}
