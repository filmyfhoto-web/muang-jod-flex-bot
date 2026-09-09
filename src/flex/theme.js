// ม่วงจด Flex design system — white cards, blue accents.
// Single source of truth for colours so cards stay consistent.
//
// The names are what each colour is FOR, not what it looks like. Two blues,
// because one cannot do both jobs: `accent` is the button FILL that white
// labels sit on, `accentText` is the blue that is READ as text on the card.
// The fill is too heavy for a line of text and the text blue is too pale
// behind white labels. The brand's purple lives in the wordmark and the mascot.

export const COLORS = {
  accent: '#1C4FD8', // filled things — buttons, badges, the numbered circle
  accentText: '#17357E', // blue as TEXT on the white card: totals, links
  title: '#17357E', // headings
  tint: '#F2F6FF', // a panel inside a card: stat tiles, badges, icon chips
  surface: '#FFFFFF', // the card itself
  line: '#DCE3F5', // separators and card borders

  ink: '#1B2540', // primary text
  sub: '#3D4C73', // secondary text
  grey: '#8794B4', // muted text

  white: '#FFFFFF', // literal white — text sitting on the accent colour

  // Status colours, darkened so they read on a white surface.
  green: '#15803D',
  orange: '#B45309',
  red: '#DC2626',
};

// Flex gives a bubble a white background unless told otherwise. That happens
// to be the surface now, but it is still set explicitly: the surface is one
// value here, and a card should not quietly depend on LINE's default matching
// it. Only sections the bubble actually has are styled.
export function themed(bubble) {
  const styles = {};
  for (const part of ['header', 'body', 'footer']) {
    if (bubble[part]) styles[part] = { backgroundColor: COLORS.surface };
  }
  return { ...bubble, styles: { ...styles, ...(bubble.styles || {}) } };
}

// The same, for a bubble or every bubble in a carousel.
export function themedContents(contents) {
  if (contents?.type === 'carousel') {
    return { ...contents, contents: (contents.contents || []).map(themed) };
  }
  return contents?.type === 'bubble' ? themed(contents) : contents;
}

// Payment status -> label + colour (used by badges and rows). The backgrounds
// are the palest tint of each status: enough to read as a chip on white, not
// enough to fight the text sitting on it.
export function paymentPresentation(status) {
  switch (status) {
    case 'paid':
      return { text: 'รับเงินแล้ว', color: COLORS.green, bg: '#E7F7EE' };
    case 'partial':
      return { text: 'รับบางส่วน', color: COLORS.orange, bg: '#FDF1DC' };
    case 'pending':
    default:
      return { text: 'ค้างรับ', color: COLORS.red, bg: '#FDEAEA' };
  }
}
