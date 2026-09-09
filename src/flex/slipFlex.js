import { formatBaht } from '../utils/currency.js';
import { formatThaiDate } from '../utils/dates.js';
import { jobCategory, categoryLabel } from '../utils/category.js';
import { COLORS } from './theme.js';
import { divider } from './components/divider.js';

// "บันทึกจากหลักฐานสำเร็จ" — the card from the แนบสลิป/หลักฐาน mockup:
// a labelled row per field the slip gave up, then the actions for the job.

function field(icon, label, value, opts = {}) {
  return {
    type: 'box',
    layout: 'horizontal',
    spacing: 'md',
    alignItems: 'center',
    contents: [
      {
        type: 'box',
        layout: 'vertical',
        width: '30px',
        height: '30px',
        cornerRadius: 'md',
        backgroundColor: COLORS.tint,
        justifyContent: 'center',
        alignItems: 'center',
        flex: 0,
        contents: [{ type: 'text', text: icon, size: 'sm', align: 'center' }],
      },
      { type: 'text', text: label, size: 'sm', color: COLORS.sub, flex: 3 },
      {
        type: 'text',
        text: value,
        size: opts.big ? 'lg' : 'sm',
        weight: 'bold',
        color: opts.color || COLORS.ink,
        align: 'end',
        flex: 4,
        wrap: true,
      },
    ],
  };
}

export function slipReceiptFlex(job, opts = {}) {
  const { group, type } = jobCategory(job);

  const body = [
    {
      type: 'box',
      layout: 'horizontal',
      spacing: 'md',
      alignItems: 'center',
      contents: [
        {
          type: 'box',
          layout: 'vertical',
          width: '44px',
          height: '44px',
          cornerRadius: '22px',
          backgroundColor: COLORS.accent,
          justifyContent: 'center',
          alignItems: 'center',
          flex: 0,
          contents: [{ type: 'text', text: '✓', size: 'md', weight: 'bold', color: COLORS.white, align: 'center' }],
        },
        {
          type: 'box',
          layout: 'vertical',
          contents: [
            { type: 'text', text: 'บันทึกจากหลักฐานสำเร็จ', weight: 'bold', size: 'md', color: COLORS.title, wrap: true },
            { type: 'text', text: 'ระบบอ่านข้อมูลและสรุปให้แล้วค่ะ', size: 'xs', color: COLORS.grey, wrap: true },
          ],
        },
      ],
    },
    divider(),
    field('🏪', 'ร้านค้า', job.customer_name || job.job_name || '—'),
    field('💰', 'ยอดชำระ', formatBaht(Number(job.total) || 0), { big: true, color: COLORS.accentText }),
    field('📅', 'วันที่', formatThaiDate(job.job_date)),
    field('🏷️', 'หมวด', type ? `${group.label} / ${type.label}` : categoryLabel(job)),
    field('📎', 'ไฟล์แนบ', opts.attached === false ? 'ยังไม่ได้แนบ' : 'สลิป / ใบเสร็จ'),
  ];

  return {
    type: 'flex',
    altText: `บันทึกจากหลักฐานสำเร็จ ${formatBaht(Number(job.total) || 0)}`,
    contents: {
      type: 'bubble',
      size: 'mega',
      body: { type: 'box', layout: 'vertical', spacing: 'md', paddingAll: 'lg', contents: body },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        paddingAll: 'lg',
        paddingTop: 'none',
        contents: [
          {
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
                  label: '✏️ แก้ไข',
                  data: `action=edit_job&jobId=${encodeURIComponent(job.id || '')}`,
                  displayText: 'แก้ไขรายการ',
                },
              },
              {
                type: 'button',
                style: 'secondary',
                height: 'sm',
                action: {
                  type: 'postback',
                  label: '🗑 ยกเลิก',
                  data: `action=delete_job&jobId=${encodeURIComponent(job.id || '')}`,
                  displayText: 'ยกเลิกรายการ',
                },
              },
            ],
          },
          { type: 'text', text: 'เรียบร้อยแล้วค่ะ มีอะไรให้ช่วยอีกไหมคะ 💜', size: 'xs', color: COLORS.grey, align: 'center', wrap: true },
        ],
      },
      styles: { body: { backgroundColor: COLORS.surface }, footer: { backgroundColor: COLORS.surface } },
    },
  };
}
