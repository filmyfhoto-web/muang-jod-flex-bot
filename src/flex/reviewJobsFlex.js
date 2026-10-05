import { COLORS, themed } from './theme.js';
import { jobOwed } from '../utils/customerBook.js';
import { jobStage } from '../utils/jobState.js';

/* ทบทวนงานเก่า — การ์ดทีละใบ กดทีเดียวบอกว่า จ่ายแล้ว / ยังไม่จ่าย / ลงบัญชีแล้ว
 *
 * ร้านขอ "แก้ไขงานเก่าว่าอันไหนลงบัญชี ยังไม่จ่าย ไม่อยากหลายขั้นตอน" จึงไม่มี
 * ฟอร์ม ไม่มีพิมพ์: ใบละสามปุ่ม แล้วม่วงจำให้
 */

const baht = (n) => `฿${Number(n || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 })}`;

export function statusLine(job) {
  if (jobStage(job) >= 4) return { text: '📒 ลงบัญชีแล้ว', color: COLORS.accentText };
  const owed = jobOwed(job);
  if (owed > 0) return { text: `📛 ยังไม่จ่าย ${baht(owed)}`, color: '#C0392B' };
  return { text: '💰 จ่ายแล้ว (ยังไม่ลงบัญชี)', color: '#1E8449' };
}

const data = (action, job, to, offset) =>
  `action=${action}&jobId=${encodeURIComponent(job.id)}&to=${to}&o=${offset}`;

function jobBubble(job, offset) {
  const st = statusLine(job);
  const sub = [job.customer_name, job.job_date].filter(Boolean).join(' · ');
  const btn = (label, to) => ({
    type: 'button',
    style: 'secondary',
    height: 'sm',
    action: { type: 'postback', label, data: data('job_mark', job, to, offset), displayText: label },
  });

  return themed({
    type: 'bubble',
    size: 'kilo',
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'xs',
      contents: [
        { type: 'text', text: job.job_name || 'งาน', weight: 'bold', size: 'md', wrap: true, color: COLORS.title },
        ...(sub ? [{ type: 'text', text: sub, size: 'xs', color: COLORS.grey, wrap: true }] : []),
        { type: 'text', text: baht(job.total), size: 'lg', weight: 'bold', color: COLORS.title },
        { type: 'text', text: st.text, size: 'sm', weight: 'bold', color: st.color, wrap: true },
      ],
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      spacing: 'xs',
      contents: [btn('💰 จ่ายแล้ว', 'paid'), btn('📛 ยังไม่จ่าย', 'owed'), btn('📒 ลงบัญชีแล้ว', 'booked')],
    },
  });
}

export function reviewJobsFlex({ jobs = [], hasMore = false, offset = 0 } = {}) {
  const bubbles = jobs.map((j) => jobBubble(j, offset));
  if (hasMore) {
    bubbles.push(
      themed({
        type: 'bubble',
        size: 'kilo',
        body: {
          type: 'box',
          layout: 'vertical',
          justifyContent: 'center',
          contents: [
            { type: 'text', text: 'ยังมีอีกค่ะ', weight: 'bold', align: 'center', color: COLORS.title },
            {
              type: 'button',
              style: 'primary',
              color: COLORS.accent,
              action: {
                type: 'postback',
                label: 'ดูงานถัดไป ›',
                data: `action=review_jobs&offset=${offset + jobs.length}`,
                displayText: 'ดูงานถัดไป',
              },
            },
          ],
        },
      })
    );
  }
  return {
    type: 'flex',
    altText: `ทบทวนงานเก่า ${jobs.length} งาน`,
    contents: { type: 'carousel', contents: bubbles },
  };
}
