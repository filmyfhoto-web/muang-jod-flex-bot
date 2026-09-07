// ม่วงจด Flex design system — pastel purple / white / light grey.
// Single source of truth for colours so cards stay consistent.

export const COLORS = {
  purple: '#7C3AED', // primary
  purpleDark: '#5B21B6',
  purpleSoft: '#EDE9FE', // pastel lavender background
  white: '#FFFFFF',
  ink: '#1F2937', // primary text
  sub: '#555555', // secondary text
  grey: '#8E8E93', // muted
  greyLight: '#F5F5F7', // surface
  line: '#ECECF0', // separators
  green: '#22A06B',
  orange: '#E8833A',
  red: '#E5484D',
};

// Payment status -> label + colour (used by badges and rows).
export function paymentPresentation(status) {
  switch (status) {
    case 'paid':
      return { text: 'รับเงินแล้ว', color: COLORS.green, bg: '#E7F6EE' };
    case 'partial':
      return { text: 'รับบางส่วน', color: COLORS.orange, bg: '#FDF0E6' };
    case 'pending':
    default:
      return { text: 'ค้างรับ', color: COLORS.red, bg: '#FCEBEC' };
  }
}
