import test from 'node:test';
import assert from 'node:assert/strict';
import { buildConfirmFlex, buildSavedFlex, buildSummaryFlex } from '../src/lib/flex.mjs';

function allActions(value, result = []) {
  if (!value || typeof value !== 'object') return result;
  if (value.action) result.push(value.action);
  for (const child of Object.values(value)) {
    if (Array.isArray(child)) child.forEach((item) => allActions(item, result));
    else if (child && typeof child === 'object') allActions(child, result);
  }
  return result;
}

const tx = {
  id: 'TEST-TX-1', type: 'expense', description: 'TEST - กาแฟ', amount: 50,
  category: 'อาหาร', paymentMethod: 'เงินสด', occurredAt: new Date().toISOString()
};

test('การ์ดยืนยันมีปุ่ม confirm และ cancel', () => {
  const flex = buildConfirmFlex({ id: 'TEST-BATCH-1', entries: [tx] });
  assert.equal(flex.type, 'flex');
  const data = allActions(flex).map((item) => item.data);
  assert.ok(data.includes('action=confirm_batch&batchId=TEST-BATCH-1'));
  assert.ok(data.includes('action=cancel_batch&batchId=TEST-BATCH-1'));
});

test('การ์ดสำเร็จมี URI แก้ไขและ postback ยกเลิก', () => {
  const flex = buildSavedFlex(tx, { baseUrl: 'https://test.example', liffId: '123-test', signedId: 'signed' });
  const actions = allActions(flex);
  assert.ok(actions.some((item) => item.type === 'uri' && item.uri.includes('/edit?t=signed')));
  assert.ok(actions.some((item) => item.type === 'postback' && item.data === 'action=request_delete&id=TEST-TX-1'));
  assert.equal(flex.contents.header.contents[1].url, 'https://test.example/assets/mamung-card.png');
});

test('การ์ดสรุปคำนวณข้อความสำรอง', () => {
  const flex = buildSummaryFlex({ income: 500, expense: 125, balance: 375, label: 'วันนี้' }, { liffId: '123-test' });
  assert.match(flex.altText, /รายรับ 500/);
  assert.match(flex.altText, /รายจ่าย 125/);
});
