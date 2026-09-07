import { buildJobBubble, PURPLE } from './jobCard.js';

// Carousel of recent jobs. Falls back to a friendly empty-state bubble.
export function recentJobsFlex(jobs) {
  if (!jobs || !jobs.length) {
    return {
      type: 'flex',
      altText: 'ยังไม่มีรายการงาน',
      contents: {
        type: 'bubble',
        size: 'kilo',
        body: {
          type: 'box',
          layout: 'vertical',
          spacing: 'md',
          contents: [
            { type: 'text', text: 'ยังไม่มีรายการงานค่ะ 💜', weight: 'bold', color: PURPLE },
            {
              type: 'text',
              text: 'กด "บันทึกงานวันนี้" เพื่อเริ่มจดงานแรกได้เลยค่ะ',
              size: 'sm',
              color: '#8E8E93',
              wrap: true,
            },
          ],
        },
      },
    };
  }

  const bubbles = jobs.slice(0, 10).map((job) => buildJobBubble(job));

  return {
    type: 'flex',
    altText: `รายการงานล่าสุด ${bubbles.length} รายการ`,
    contents: {
      type: 'carousel',
      contents: bubbles,
    },
  };
}
