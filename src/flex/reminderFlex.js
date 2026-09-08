import { formatBaht } from '../utils/currency.js';
import { formatThaiDateTime } from '../utils/dates.js';
import { COLORS } from './theme.js';
import { divider } from './components/divider.js';
import { REMIND_CHOICES } from '../utils/remindTimes.js';

// "ตั้งแจ้งเตือนงาน" — pick when to be nudged about a job.
export function remindPickerFlex(job) {
  const buttons = REMIND_CHOICES.map((c) => ({
    type: 'button',
    style: 'secondary',
    height: 'sm',
    action: {
      type: 'postback',
      label: c.label,
      data: `action=set_reminder&when=${c.id}${job?.id ? `&jobId=${encodeURIComponent(job.id)}` : ''}`,
      displayText: `เตือน ${c.label}`,
    },
  }));

  const body = [
    { type: 'text', text: '⏰ ตั้งแจ้งเตือนงาน', weight: 'bold', size: 'lg', color: COLORS.purpleDark },
    {
      type: 'text',
      text: job ? 'จะให้ม่วงจดเตือนเรื่องงานนี้เมื่อไหร่ดีคะ' : 'จะให้ม่วงจดเตือนคุณเมื่อไหร่ดีคะ',
      size: 'sm',
      color: COLORS.sub,
      wrap: true,
    },
  ];

  if (job) {
    body.push(divider(), {
      type: 'box',
      layout: 'vertical',
      backgroundColor: COLORS.purpleSoft,
      cornerRadius: 'lg',
      paddingAll: 'md',
      spacing: 'xs',
      contents: [
        { type: 'text', text: job.job_name || 'งาน', size: 'sm', weight: 'bold', color: COLORS.purpleDark, wrap: true },
        {
          type: 'text',
          text: `${job.customer_name ? `ลูกค้า: ${job.customer_name} · ` : ''}${formatBaht(Number(job.total) || 0)}`,
          size: 'xs',
          color: COLORS.sub,
          wrap: true,
        },
      ],
    });
  }

  return {
    type: 'flex',
    altText: 'ตั้งแจ้งเตือนงาน',
    contents: {
      type: 'bubble',
      size: 'mega',
      body: { type: 'box', layout: 'vertical', spacing: 'md', paddingAll: 'lg', contents: body },
      footer: { type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: 'lg', paddingTop: 'none', contents: buttons },
      styles: { body: { backgroundColor: COLORS.white }, footer: { backgroundColor: COLORS.white } },
    },
  };
}

// Confirmation once a reminder is set, plus a way to call it off.
export function reminderSetFlex(reminder, job) {
  return {
    type: 'flex',
    altText: `ตั้งเตือนแล้ว ${formatThaiDateTime(reminder.remind_at)}`,
    contents: {
      type: 'bubble',
      size: 'kilo',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        paddingAll: 'lg',
        contents: [
          { type: 'text', text: '⏰ ตั้งเตือนให้แล้วค่ะ', weight: 'bold', size: 'md', color: COLORS.purpleDark },
          {
            type: 'text',
            text: formatThaiDateTime(reminder.remind_at),
            size: 'xl',
            weight: 'bold',
            color: COLORS.purple,
            wrap: true,
          },
          divider(),
          { type: 'text', text: reminder.message, size: 'sm', color: COLORS.sub, wrap: true },
          ...(job
            ? [{ type: 'text', text: `${job.job_number || ''}`.trim(), size: 'xxs', color: COLORS.grey }]
            : []),
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        paddingAll: 'lg',
        paddingTop: 'none',
        contents: [
          {
            type: 'button',
            style: 'secondary',
            height: 'sm',
            action: {
              type: 'postback',
              label: '✕ ยกเลิกการเตือน',
              data: `action=cancel_reminder&reminderId=${encodeURIComponent(reminder.id)}`,
              displayText: 'ยกเลิกการเตือน',
            },
          },
        ],
      },
    },
  };
}
