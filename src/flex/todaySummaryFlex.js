import { formatBaht } from '../utils/currency.js';
import { formatThaiDate } from '../utils/dates.js';
import { PURPLE, PURPLE_DARK, GREEN, RED, GREY } from './jobCard.js';

function row(label, value, color) {
  return {
    type: 'box',
    layout: 'horizontal',
    contents: [
      { type: 'text', text: label, size: 'sm', color: '#555555', flex: 4 },
      {
        type: 'text',
        text: value,
        size: 'sm',
        weight: 'bold',
        color: color || '#111111',
        align: 'end',
        flex: 3,
      },
    ],
  };
}

export function todaySummaryFlex(summary) {
  return {
    type: 'flex',
    altText: `สรุปวันนี้ ${summary.jobCount} งาน`,
    contents: {
      type: 'bubble',
      size: 'kilo',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: PURPLE,
        paddingAll: 'lg',
        contents: [
          { type: 'text', text: '📊 สรุปวันนี้', weight: 'bold', color: '#FFFFFF', size: 'lg' },
          { type: 'text', text: formatThaiDate(summary.date), size: 'xs', color: '#EDE9FE' },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          row('จำนวนงานทั้งหมด', `${summary.jobCount} งาน`, PURPLE_DARK),
          { type: 'separator' },
          row('ยอดรวมทั้งหมด', formatBaht(summary.total), '#111111'),
          row('รับเงินแล้ว', formatBaht(summary.paid), GREEN),
          row('ค้างรับ', formatBaht(summary.pending), RED),
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: summary.jobCount
              ? 'สู้ ๆ นะคะ วันนี้ทำได้ดีมากค่ะ 💜'
              : 'วันนี้ยังไม่มีงานค่ะ',
            size: 'xs',
            color: GREY,
            align: 'center',
            wrap: true,
          },
        ],
      },
    },
  };
}
