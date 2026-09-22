import { formatBaht } from '../utils/currency.js';
import { COLORS } from './theme.js';
import { divider } from './components/divider.js';
import { footerActions } from './components/footerActions.js';

/* การ์ด "แยกให้แล้ว N งาน" — ตรวจก่อนบันทึก
 *
 * ร้านจดรวดเดียวทั้งวันแล้วให้ม่วงแยกให้ การ์ดนี้คือจุดที่ร้านตรวจว่าแยกถูกคน
 * ไหม ก่อนที่อะไรจะลงฐานข้อมูล — เพราะแยกผิดคนแปลว่าออกใบเสร็จผิดคน
 *
 * แต่ละแถวจึงโชว์ชื่อลูกค้าเด่นที่สุด ไม่ใช่ชื่องาน: สิ่งที่ผิดได้คือการจับคู่
 * "ใครสั่งอะไร" ส่วนชื่องานกับยอดมาจากบรรทัดที่ร้านพิมพ์เองอยู่แล้ว
 */

const MAX_ROWS = 20;

function jobRow(job) {
  const who = job.customerName || 'ไม่ระบุลูกค้า';
  const what = [job.jobName, job.items.length > 1 ? `${job.items.length} รายการ` : null]
    .filter(Boolean)
    .join(' · ');

  return {
    type: 'box',
    layout: 'horizontal',
    spacing: 'sm',
    contents: [
      {
        type: 'text',
        text: String(job.no),
        size: 'xs',
        weight: 'bold',
        color: COLORS.accent,
        flex: 0,
        align: 'center',
        gravity: 'top',
      },
      {
        type: 'box',
        layout: 'vertical',
        flex: 6,
        contents: [
          {
            type: 'text',
            text: who,
            size: 'sm',
            weight: 'bold',
            color: job.customerName ? COLORS.ink : COLORS.grey,
            wrap: true,
          },
          { type: 'text', text: what, size: 'xs', color: COLORS.grey, wrap: true },
        ],
      },
      {
        type: 'text',
        text: formatBaht(job.total),
        size: 'sm',
        weight: 'bold',
        color: COLORS.accentText,
        align: 'end',
        flex: 3,
      },
    ],
  };
}

export function dumpPreviewFlex(jobs = [], total = 0) {
  const shown = jobs.slice(0, MAX_ROWS);
  const hidden = jobs.length - shown.length;
  const noName = jobs.filter((j) => !j.customerName).length;

  const body = [
    { type: 'text', text: `แยกให้แล้ว ${jobs.length} งาน`, weight: 'bold', size: 'md', color: COLORS.title },
    {
      type: 'text',
      text: 'ตรวจว่าแยกถูกคนไหมคะ ถ้าถูกกดบันทึกได้เลย',
      size: 'xs',
      color: COLORS.grey,
      wrap: true,
    },
    divider(),
    { type: 'box', layout: 'vertical', spacing: 'md', contents: shown.map(jobRow) },
  ];

  if (hidden > 0) {
    body.push({ type: 'text', text: `และอีก ${hidden} งาน`, size: 'xs', color: COLORS.grey, align: 'center' });
  }

  body.push(divider(), {
    type: 'box',
    layout: 'horizontal',
    contents: [
      { type: 'text', text: 'รวมทั้งหมด', size: 'sm', weight: 'bold', color: COLORS.sub },
      { type: 'text', text: formatBaht(total), size: 'md', weight: 'bold', color: COLORS.accentText, align: 'end' },
    ],
  });

  // งานที่ไม่มีชื่อลูกค้ายังบันทึกได้ (ขายหน้าร้านก็เป็นงาน) แต่ต้องบอกให้รู้
  // ตัว ไม่ใช่ปล่อยให้ไปเจอตอนจะออกใบเสร็จ
  if (noName > 0) {
    body.push({
      type: 'text',
      text: `มี ${noName} งานที่ยังไม่มีชื่อลูกค้า เติมทีหลังได้ค่ะ`,
      size: 'xxs',
      color: COLORS.grey,
      wrap: true,
    });
  }

  return {
    type: 'flex',
    altText: `แยกให้แล้ว ${jobs.length} งาน รวม ${formatBaht(total)}`,
    contents: {
      type: 'bubble',
      size: 'mega',
      body: { type: 'box', layout: 'vertical', spacing: 'sm', contents: body },
      footer: footerActions({
        primary: {
          label: `✅ บันทึกทั้งหมด ${jobs.length} งาน`,
          data: 'action=confirm_dump',
          displayText: 'บันทึกทั้งหมด',
        },
        links: [
          { label: '❌ ยกเลิก', data: 'action=cancel_dump', displayText: 'ยกเลิก', color: COLORS.red },
        ],
      }),
    },
  };
}
