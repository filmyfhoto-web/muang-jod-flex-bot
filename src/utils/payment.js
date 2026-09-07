import { round2 } from './currency.js';

// Derive payment_status from paid_amount vs total.
//   paid = 0            -> pending
//   0 < paid < total    -> partial
//   paid >= total       -> paid
export function computePaymentStatus(paidAmount, total) {
  const paid = round2(Number(paidAmount) || 0);
  const grand = round2(Number(total) || 0);
  if (paid <= 0) return 'pending';
  if (paid < grand) return 'partial';
  return 'paid';
}

// Outstanding balance, never negative.
export function computeBalanceDue(total, paidAmount) {
  const grand = round2(Number(total) || 0);
  const paid = round2(Number(paidAmount) || 0);
  return round2(Math.max(grand - paid, 0));
}

// Given a job's total and a new paid_amount, return the derived fields.
export function derivePaymentFields(total, paidAmount) {
  const paid = round2(Math.max(Number(paidAmount) || 0, 0));
  return {
    paid_amount: paid,
    balance_due: computeBalanceDue(total, paid),
    payment_status: computePaymentStatus(paid, total),
  };
}
