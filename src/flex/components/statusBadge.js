import { paymentPresentation } from '../theme.js';

// A small pill showing payment status, coloured by state. `size` follows the
// line it sits on: a badge a step larger than the text beside it stops being
// a note in the margin and starts being a headline.
export function statusBadge(paymentStatus, opts = {}) {
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
      { type: 'text', text: p.text, size: opts.size || 'sm', color: p.color, weight: 'bold', align: 'center' },
    ],
  };
}
