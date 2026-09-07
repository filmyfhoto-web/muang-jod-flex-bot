import { paymentPresentation } from '../theme.js';

// A small pill showing payment status, coloured by state.
export function statusBadge(paymentStatus) {
  const p = paymentPresentation(paymentStatus);
  return {
    type: 'box',
    layout: 'vertical',
    backgroundColor: p.bg,
    cornerRadius: 'md',
    paddingAll: 'xs',
    paddingStart: 'sm',
    paddingEnd: 'sm',
    flex: 0,
    contents: [
      { type: 'text', text: p.text, size: 'xs', color: p.color, weight: 'bold', align: 'center' },
    ],
  };
}
