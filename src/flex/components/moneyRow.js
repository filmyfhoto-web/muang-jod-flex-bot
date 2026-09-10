import { formatBaht } from '../../utils/currency.js';
import { COLORS } from '../theme.js';

// A label + amount row. `amount` may be a number (formatted as baht) or a
// ready string. Options tune emphasis and colour.
export function moneyRow(label, amount, opts = {}) {
  const value = typeof amount === 'number' ? formatBaht(amount) : String(amount);
  return {
    type: 'box',
    layout: 'horizontal',
    contents: [
      // wrap, always: a job called "สั่งป้ายไวนิลหน้างานสีดำ" turned into
      // "สั่งป้ายไวนิลหน้…" and the shop could not tell which job it was.
      { type: 'text', text: label, size: opts.size || 'md', color: COLORS.sub, flex: 4, wrap: true },
      {
        type: 'text',
        text: value,
        size: opts.big ? 'lg' : opts.size || 'sm',
        weight: opts.bold === false ? 'regular' : 'bold',
        color: opts.color || COLORS.ink,
        align: 'end',
        flex: 4,
        wrap: true,
      },
    ],
  };
}
