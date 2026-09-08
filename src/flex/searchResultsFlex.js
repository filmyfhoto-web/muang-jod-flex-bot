import { buildJobBubble } from './jobCard.js';
import { COLORS } from './theme.js';

// Carousel of search results (up to 10). Friendly empty state otherwise.
export function searchResultsFlex(jobs, query) {
  if (!jobs || !jobs.length) {
    return {
      type: 'flex',
      altText: 'ไม่พบงานที่ค้นหา',
      contents: {
        type: 'bubble',
        size: 'kilo',
        body: {
          type: 'box',
          layout: 'vertical',
          spacing: 'md',
          contents: [
            { type: 'text', text: '🔍 ไม่พบงานที่ค้นหา', weight: 'bold', color: COLORS.accent },
            {
              type: 'text',
              text: query ? `ไม่พบงานที่ตรงกับ "${query}" ค่ะ` : 'ลองพิมพ์คำค้นใหม่นะคะ',
              size: 'sm',
              color: COLORS.grey,
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
    altText: `ผลการค้นหา ${bubbles.length} รายการ`,
    contents: { type: 'carousel', contents: bubbles },
  };
}
