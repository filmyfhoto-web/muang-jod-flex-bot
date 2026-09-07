import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computePaymentStatus,
  computeBalanceDue,
  derivePaymentFields,
} from '../src/utils/payment.js';

test('computePaymentStatus: zero -> pending', () => {
  assert.equal(computePaymentStatus(0, 400), 'pending');
});

test('computePaymentStatus: partial', () => {
  assert.equal(computePaymentStatus(150, 400), 'partial');
});

test('computePaymentStatus: full and overpaid -> paid', () => {
  assert.equal(computePaymentStatus(400, 400), 'paid');
  assert.equal(computePaymentStatus(500, 400), 'paid');
});

test('computeBalanceDue never negative', () => {
  assert.equal(computeBalanceDue(400, 150), 250);
  assert.equal(computeBalanceDue(400, 500), 0);
});

test('derivePaymentFields returns consistent trio', () => {
  assert.deepEqual(derivePaymentFields(400, 150), {
    paid_amount: 150,
    balance_due: 250,
    payment_status: 'partial',
  });
  assert.deepEqual(derivePaymentFields(400, 0), {
    paid_amount: 0,
    balance_due: 400,
    payment_status: 'pending',
  });
});
