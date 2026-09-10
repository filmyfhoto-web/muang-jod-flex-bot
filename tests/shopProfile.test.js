import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getShopProfile, saveShopProfile, hasShopDetails, SHOP_FIELDS } from '../src/services/shopService.js';
import { renderReceiptHtml } from '../src/routes/receipt.js';

const bill = {
  bill_number: 'MJ-B-20260910-0002',
  customer_name: 'ผู้ใหญ่สมศรี',
  total: 2150,
  paid_amount: 500,
  balance_due: 1650,
  payment_status: 'partial',
  created_at: '2026-09-10T07:24:00.000Z',
  issued_at: '2026-09-10T07:40:00.000Z',
  jobs: [{ job_name: 'ป้ายไวนิล', job_date: '2026-09-10', total: 2150 }],
};

const shop = {
  shop_name: 'ร้านม่วงป้ายโฆษณา',
  phone: '081-234-5678',
  address: '99 ม.4 ต.บ้านชี อ.บ้านหมี่ จ.ลพบุรี',
  tax_id: '1234567890123',
  footer_note: 'ขอบคุณที่อุดหนุนค่ะ',
};

// A stand-in for the Supabase client, so these run without a database.
function fakeClient({ row = null, onUpsert } = {}) {
  return {
    from() {
      return {
        select() {
          return {
            eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }),
            single: async () => ({ data: onUpsert?.captured ?? row, error: null }),
          };
        },
        upsert(values) {
          if (onUpsert) onUpsert.captured = values;
          return {
            select: () => ({ single: async () => ({ data: values, error: null }) }),
          };
        },
      };
    },
  };
}

test('a shop that never opened ตั้งค่า still gets a receipt', () => {
  const html = renderReceiptHtml(bill, {});
  assert.ok(html.includes('ม่วงจดให้ · ผู้ช่วยบันทึกงานใน LINE'), 'falls back to the assistant name');
  // The class names live in the stylesheet either way — it is the div that
  // must not be there.
  assert.ok(!html.includes('<div class="shopinfo">'), 'no empty letterhead block');
  assert.ok(!html.includes('<div class="shopfoot">'));
  assert.ok(html.includes(bill.bill_number), 'the receipt itself still renders');

  // Called with nothing at all, as the route would on a failed lookup.
  assert.ok(renderReceiptHtml(bill).includes(bill.bill_number));
});

test('the shop details reach the receipt', () => {
  const html = renderReceiptHtml(bill, shop);
  assert.ok(html.includes('ร้านม่วงป้ายโฆษณา'));
  assert.ok(html.includes('99 ม.4 ต.บ้านชี'));
  assert.ok(html.includes('โทร. 081-234-5678'));
  assert.ok(html.includes('เลขประจำตัวผู้เสียภาษี 1234567890123'));
  assert.ok(html.includes('ขอบคุณที่อุดหนุนค่ะ'));
  // The picture is drawn from this blob, so it has to carry the shop too.
  assert.ok(html.includes('"shop"'));
});

test('a shop name is escaped, not injected', () => {
  const html = renderReceiptHtml(bill, { shop_name: '<script>alert(1)</script>' });
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes('&lt;script&gt;'));
});

test('blank fields clear, and only the sent fields are touched', async () => {
  const onUpsert = {};
  await saveShopProfile('user-1', { shop_name: '  ร้านม่วง  ', phone: '' }, fakeClient({ onUpsert }));

  assert.equal(onUpsert.captured.shop_name, 'ร้านม่วง', 'trimmed');
  assert.equal(onUpsert.captured.phone, null, 'a blank string clears the field, it is not stored as ""');
  assert.equal(onUpsert.captured.user_id, 'user-1');
  // address was not sent, so it must not appear in the patch at all — saving
  // the phone alone would otherwise wipe an address typed on another visit.
  assert.ok(!('address' in onUpsert.captured));
});

test('a read that fails gives an empty profile rather than throwing', async () => {
  const broken = {
    from() {
      return {
        select() {
          return { eq: () => ({ maybeSingle: async () => ({ data: null, error: new Error('down') }) }) };
        },
      };
    },
  };
  const profile = await getShopProfile('user-1', broken);
  for (const f of SHOP_FIELDS) assert.equal(profile[f], null, f);
  assert.equal(hasShopDetails(profile), false);

  // And a receipt built from it still renders.
  assert.ok(renderReceiptHtml(bill, profile).includes(bill.bill_number));
});

test('hasShopDetails is true as soon as one field is filled', () => {
  assert.equal(hasShopDetails({}), false);
  assert.equal(hasShopDetails(null), false);
  assert.equal(hasShopDetails({ shop_name: null, phone: null }), false);
  assert.equal(hasShopDetails({ phone: '081' }), true);
});
