import { COLORS } from '../theme.js';

function actionOf(btn) {
  return btn.uri
    ? { type: 'uri', label: btn.label, uri: btn.uri }
    : { type: 'postback', label: btn.label, data: btn.data, displayText: btn.displayText || btn.label };
}

function button(btn) {
  return {
    type: 'button',
    style: btn.style || 'secondary',
    // `sm` by default. Flex only offers sm and md, and md is a slab: on a card
    // whose whole point is a compact table, a full-height grey block for
    // "เลือกหมวด" reads louder than the job it belongs to.
    height: btn.height || 'sm',
    ...(btn.color ? { color: btn.color } : {}),
    action: actionOf(btn),
  };
}

// A tappable word rather than a filled block — for the actions that are worth
// offering but not worth a button's weight.
function linkAction(btn) {
  return {
    type: 'text',
    text: btn.label,
    size: 'sm',
    weight: 'bold',
    color: btn.color || COLORS.accentText,
    align: 'center',
    flex: 1,
    wrap: true,
    action: actionOf(btn),
  };
}

// Footer of postback buttons. `primary` renders full-width on its own row;
// `secondary` buttons share a row beneath it; `links` share a row as plain
// tappable text, for actions that should stay out of the way.
export function footerActions({ primary, secondary = [], links = [] } = {}) {
  const contents = [];
  if (primary) {
    contents.push(button({ style: 'primary', color: COLORS.accent, ...primary }));
  }
  if (secondary.length) {
    contents.push({
      type: 'box',
      layout: 'horizontal',
      spacing: 'sm',
      contents: secondary.map((b) => button(b)),
    });
  }
  if (links.length) {
    contents.push({
      type: 'box',
      layout: 'horizontal',
      spacing: 'md',
      paddingTop: 'xs',
      contents: links.map(linkAction),
    });
  }
  return {
    type: 'box',
    layout: 'vertical',
    spacing: 'sm',
    contents,
  };
}
