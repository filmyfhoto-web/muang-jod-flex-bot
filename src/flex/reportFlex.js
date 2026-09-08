import { formatBaht } from '../utils/currency.js';
import { COLORS } from './theme.js';
import { header } from './components/header.js';
import { moneyRow } from './components/moneyRow.js';
import { divider } from './components/divider.js';

function listSection(title, jobs) {
  const contents = [
    { type: 'text', text: title, size: 'sm', weight: 'bold', color: COLORS.title },
  ];
  if (!jobs.length) {
    contents.push({ type: 'text', text: '— ไม่มีข้อมูล —', size: 'xs', color: COLORS.grey });
  } else {
    for (const j of jobs) {
      contents.push({
        type: 'box',
        layout: 'horizontal',
        contents: [
          { type: 'text', text: j.job_name || 'งาน', size: 'xs', color: COLORS.sub, flex: 5, wrap: true },
          {
            type: 'text',
            text: formatBaht(j.total),
            size: 'xs',
            color: COLORS.ink,
            align: 'end',
            flex: 3,
          },
        ],
      });
    }
  }
  return { type: 'box', layout: 'vertical', spacing: 'xs', contents };
}

// Readable report card for daily / weekly / monthly.
export function reportCardFlex(report) {
  return {
    type: 'flex',
    altText: `รายงาน ${report.label}`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: header('📈 รายงานสรุป', report.label),
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          moneyRow('จำนวนงาน', `${report.jobCount} งาน`, { color: COLORS.title }),
          moneyRow('ยอดขายรวม', report.totalSales, { color: COLORS.ink }),
          moneyRow('รับเงินแล้ว', report.paid, { color: COLORS.green }),
          moneyRow('ค้างรับ', report.pending, { color: COLORS.red }),
          moneyRow('งานที่ยกเลิก', `${report.cancelledCount} งาน`, { color: COLORS.grey }),
          moneyRow('ค่าเฉลี่ยต่อบิล', report.avgPerBill, { color: COLORS.ink }),
          divider(),
          listSection('🕘 5 งานล่าสุด', report.recent),
          divider(),
          listSection('🏆 5 งานมูลค่าสูงสุด', report.top),
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'button',
            style: 'primary',
            color: COLORS.accentText,
            height: 'sm',
            action: {
              type: 'postback',
              label: '⬇️ ดาวน์โหลด CSV (เดือนนี้)',
              data: 'action=export_csv',
              displayText: 'ดาวน์โหลด CSV',
            },
          },
        ],
      },
    },
  };
}

// Menu to pick a report period.
export function reportMenuFlex() {
  const btn = (label, action) => ({
    type: 'button',
    style: 'secondary',
    height: 'sm',
    action: { type: 'postback', label, data: `action=${action}`, displayText: label },
  });
  return {
    type: 'flex',
    altText: 'เลือกช่วงรายงาน',
    contents: {
      type: 'bubble',
      size: 'kilo',
      header: header('📈 รายงาน', 'เลือกช่วงเวลาที่ต้องการดูค่ะ'),
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          btn('📅 วันนี้', 'report_daily'),
          btn('🗓 7 วันล่าสุด', 'report_weekly'),
          btn('📆 เดือนนี้', 'report_monthly'),
          {
            type: 'button',
            style: 'primary',
            color: COLORS.accentText,
            height: 'sm',
            action: {
              type: 'postback',
              label: '⬇️ ดาวน์โหลด CSV',
              data: 'action=export_csv',
              displayText: 'ดาวน์โหลด CSV',
            },
          },
        ],
      },
    },
  };
}
