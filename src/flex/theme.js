// ม่วงจด Flex design system — white cards, navy and gold.
// Single source of truth for colours so cards stay consistent.
//
// The names are what each colour is FOR, not what it looks like. Two navies,
// because one cannot do both jobs: `accent` is the button FILL that white
// labels sit on, `accentText` is the navy that is READ as text on the card.
// The fill is too heavy for a line of text and the text navy is too pale
// behind white labels. The brand's purple lives in the wordmark and the mascot.
//
// ร้านเลือกชุดนี้เองตอนออกแบบ (กรม + ทอง) แล้วบอกว่า "ธีมที่ออกแบบก็ไม่เหมือน"
// ตอนเห็นของจริงยังเป็นน้ำเงินชุดเดิม — สีอยู่ที่ไฟล์นี้ไฟล์เดียว การ์ดในแชต
// ฟอร์มจดงาน และหน้าเว็บจึงย้ายพร้อมกันได้ ไม่มีหน้าไหนหลงเหลือเป็นคนละแอป

export const COLORS = {
  accent: '#6C5CA8', // filled things — buttons, badges, the numbered circle
  accentText: '#6B5AA7', // navy as TEXT on the white card: totals, links
  title: '#2E2655', // headings
  gold: '#DDA83D', // the money figure on a navy panel, and the "เลขที่" chip
  tint: '#EFEAF9', // a panel inside a card: stat tiles, badges, icon chips
  surface: '#FFFFFF', // the card itself
  line: '#E6E1F2', // separators and card borders

  ink: '#2E2655', // primary text
  sub: '#6E6694', // secondary text
  grey: '#9088AE', // muted text

  white: '#FFFFFF', // literal white — text sitting on the accent colour

  // Status colours, darkened so they read on a white surface.
  green: '#2E7D5B',
  orange: '#8A6114',
  red: '#B3402F',
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
      return { text: 'รับเงินแล้ว', color: COLORS.green, bg: '#E4F0EA' };
    case 'partial':
      return { text: 'รับบางส่วน', color: COLORS.orange, bg: '#FBEFD8' };
    case 'pending':
    default:
      return { text: 'ค้างรับ', color: COLORS.red, bg: '#F8E4E1' };
  }
}
