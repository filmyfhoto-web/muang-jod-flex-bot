import { COLORS } from '../theme.js';

function button(btn) {
  return {
    type: 'button',
    style: btn.style || 'secondary',
    height: btn.height || 'sm',
    ...(btn.color ? { color: btn.color } : {}),
    action: {
      type: 'postback',
      label: btn.label,
      data: btn.data,
      displayText: btn.displayText || btn.label,
    },
  };
}

// Footer of postback buttons. `primary` renders full-width on its own row;
// `secondary` buttons share a row beneath it.
export function footerActions({ primary, secondary = [] } = {}) {
  const contents = [];
  if (primary) {
    contents.push(button({ style: 'primary', color: COLORS.purple, ...primary }));
  }
  if (secondary.length) {
    contents.push({
      type: 'box',
      layout: 'horizontal',
      spacing: 'sm',
      contents: secondary.map((b) => button(b)),
    });
  }
  return {
    type: 'box',
    layout: 'vertical',
    spacing: 'sm',
    contents,
  };
}
