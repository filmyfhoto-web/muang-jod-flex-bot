// ม่วงจด Flex design system — the dark navy and bright blue of the Rich Menu.
// Single source of truth for colours so cards stay consistent.
//
// The names are what each colour is FOR, not what it looks like. Two blues,
// because one cannot do both jobs on a dark card: `accent` is the button fill
// that white labels sit on, `accentText` is light enough to be READ as text on
// the surface. Swapping them makes the button label wash out or the total go
// dim. The brand's purple lives in the wordmark and the mascot.

export const COLORS = {
  accent: '#2E7DF7', // filled things — buttons, badges, the numbered circle
  accentText: '#60A5FA', // blue as TEXT on the dark surface: totals, links
  title: '#E8EDF5', // headings
  tint: '#1B2537', // a panel inside a card: stat tiles, badges, icon chips
  surface: '#121A2A', // the card itself
  line: '#25324A', // separators and card borders

  ink: '#E8EDF5', // primary text
  sub: '#AEBACD', // secondary text
  grey: '#8494A8', // muted text

  white: '#FFFFFF', // literal white — text sitting on the accent colour

  // Status colours, lifted so they read on a dark surface.
  green: '#4ADE80',
  orange: '#FBBF24',
  red: '#F87171',
};

// Flex gives a bubble a white background unless told otherwise, and a white
// card with light text is unreadable — so every bubble gets its surface set.
// Only sections the bubble actually has are styled.
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

// Payment status -> label + colour (used by badges and rows).
export function paymentPresentation(status) {
  switch (status) {
    case 'paid':
      return { text: 'รับเงินแล้ว', color: COLORS.green, bg: '#12301F' };
    case 'partial':
      return { text: 'รับบางส่วน', color: COLORS.orange, bg: '#33270D' };
    case 'pending':
    default:
      return { text: 'ค้างรับ', color: COLORS.red, bg: '#3A1C21' };
  }
}
