import { COLORS } from '../theme.js';

// A coloured card header with a title and optional subtitle.
export function header(title, subtitle, opts = {}) {
  const bg = opts.bg || COLORS.purple;
  const fg = opts.color || COLORS.white;
  const contents = [
    { type: 'text', text: title, weight: 'bold', color: fg, size: opts.size || 'xl', wrap: true },
  ];
  if (subtitle) {
    contents.push({ type: 'text', text: subtitle, size: 'md', color: COLORS.purpleSoft, wrap: true });
  }
  return {
    type: 'box',
    layout: 'vertical',
    backgroundColor: bg,
    paddingAll: 'lg',
    spacing: 'xs',
    contents,
  };
}
