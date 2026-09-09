import { formatBaht } from '../utils/currency.js';
import { formatThaiDate } from '../utils/dates.js';
import { COLORS } from './theme.js';
import { brandAssetUrl } from '../utils/brand.js';
import { liffUrl } from '../utils/liff.js';

// The card behind the mascot on the Rich Menu: a greeting, the day in three
// numbers, and the four things people actually open the bot to do. It is the
// "front page" — deliberately shorter than the summary card, which goes on to
// break the day down by category.

function stat(label, value, color) {
  return {
    type: 'box',
    layout: 'vertical',
    flex: 1,
    spacing: 'xs',
    contents: [
      { type: 'text', text: label, size: 'sm', color: COLORS.grey },
      { type: 'text', text: value, size: 'lg', weight: 'bold', color, wrap: true },
    ],
  };
}

function button(label, data, opts = {}) {
  return {
    type: 'button',
    style: opts.primary ? 'primary' : 'secondary',
    height: 'md',
    ...(opts.primary ? { color: COLORS.accent } : {}),
    action: { type: 'postback', label, data, displayText: opts.displayText || label },
  };
}

function linkButton(label, uri) {
  return { type: 'button', style: 'secondary', height: 'md', action: { type: 'uri', label, uri } };
}

export function homeFlex(summary = {}, opts = {}) {
  const name = String(opts.displayName || '').trim();
  const dashUrl = opts.liffUrl !== undefined ? opts.liffUrl : liffUrl({ tab: 'today' });
  const hero = opts.heroImageUrl !== undefined ? opts.heroImageUrl : brandAssetUrl('ui/card-hero.png');

  const body = [
    {
      type: 'text',
      text: name ? `สวัสดีค่ะ คุณ${name} 💜` : 'ม่วงจดพร้อมช่วยแล้วค่ะ 💜',
      weight: 'bold',
      size: 'xl',
      color: COLORS.title,
      wrap: true,
    },
    { type: 'text', text: formatThaiDate(summary.date), size: 'md', color: COLORS.grey },
    {
      type: 'box',
      layout: 'horizontal',
      backgroundColor: COLORS.tint,
      cornerRadius: 'lg',
      paddingAll: 'lg',
      spacing: 'md',
      margin: 'lg',
      contents: [
        stat('ยอดวันนี้', formatBaht(summary.total || 0), COLORS.accentText),
        stat('งาน', `${summary.jobCount || 0}`, COLORS.ink),
        stat('ค้างรับ', formatBaht(summary.pending || 0), COLORS.red),
      ],
    },
  ];

  const footer = [
    button('📝 บันทึกงานวันนี้', 'action=add_job', { primary: true }),
    {
      type: 'box',
      layout: 'horizontal',
      spacing: 'sm',
      contents: [
        button('📊 สรุปวันนี้', 'action=today_summary'),
        button('💰 ค้างรับ', 'action=pending_payment'),
      ],
    },
  ];

  // The dashboard button only exists when there is somewhere for it to go.
  if (dashUrl) footer.push(linkButton('📋 เปิดแดชบอร์ด', dashUrl));

  const bubble = {
    type: 'bubble',
    size: 'mega',
    body: { type: 'box', layout: 'vertical', paddingAll: 'lg', contents: body },
    footer: { type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: 'lg', paddingTop: 'none', contents: footer },
  };
  if (hero) bubble.hero = { type: 'image', url: hero, size: 'full', aspectRatio: '20:8', aspectMode: 'cover' };

  return { type: 'flex', altText: 'ม่วงจดพร้อมช่วยแล้วค่ะ', contents: bubble };
}
