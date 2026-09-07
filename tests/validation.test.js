import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  safe,
  jobItemSchema,
  paymentAmountSchema,
  searchQuerySchema,
  postbackActionSchema,
} from '../src/utils/validation.js';

test('jobItem: quantity must be > 0', () => {
  assert.equal(safe(jobItemSchema, { item_name: 'x', quantity: 0, unit_price: 10 }).ok, false);
  assert.equal(safe(jobItemSchema, { item_name: 'x', quantity: -1, unit_price: 10 }).ok, false);
  assert.equal(safe(jobItemSchema, { item_name: 'x', quantity: 2, unit_price: 10 }).ok, true);
});

test('jobItem: unit_price must be >= 0', () => {
  assert.equal(safe(jobItemSchema, { item_name: 'x', quantity: 1, unit_price: -5 }).ok, false);
  assert.equal(safe(jobItemSchema, { item_name: 'x', quantity: 1, unit_price: 0 }).ok, true);
});

test('jobItem: item_name required', () => {
  assert.equal(safe(jobItemSchema, { item_name: '', quantity: 1, unit_price: 10 }).ok, false);
});

test('paymentAmount must be positive number', () => {
  assert.equal(safe(paymentAmountSchema, 500).ok, true);
  assert.equal(safe(paymentAmountSchema, 0).ok, false);
  assert.equal(safe(paymentAmountSchema, -1).ok, false);
  assert.equal(safe(paymentAmountSchema, 'abc').ok, false);
});

test('searchQuery: non-empty, trimmed', () => {
  assert.equal(safe(searchQuerySchema, '   ').ok, false);
  const r = safe(searchQuerySchema, '  กาแฟ  ');
  assert.equal(r.ok, true);
  assert.equal(r.data, 'กาแฟ');
});

test('postback action: known vs unknown', () => {
  assert.equal(safe(postbackActionSchema, 'add_job').ok, true);
  assert.equal(safe(postbackActionSchema, 'record_payment').ok, true);
  assert.equal(safe(postbackActionSchema, 'drop_table').ok, false);
});
