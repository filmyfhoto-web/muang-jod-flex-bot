import test from 'node:test';
import assert from 'node:assert/strict';
import { DemoStore } from '../src/lib/store.mjs';

test('ต้องยืนยันก่อนจึงสร้างรายการ และยืนยันซ้ำไม่เพิ่มซ้ำ', async () => {
  const store = new DemoStore();
  const before = await store.listTransactions('TEST-U001');
  const batch = await store.createPending({
    lineUserId: 'TEST-U001', sourceText: 'กาแฟ 50', sourceMessageId: 'TEST-MSG',
    entries: [{ type: 'expense', description: 'กาแฟ', amount: 50, category: 'อาหาร', paymentMethod: null }]
  });
  assert.equal((await store.listTransactions('TEST-U001')).length, before.length);
  const first = await store.confirmPending(batch.id, 'TEST-U001');
  const second = await store.confirmPending(batch.id, 'TEST-U001');
  assert.equal(first.length, 1);
  assert.equal(second.length, 1);
  assert.equal(first[0].id, second[0].id);
  assert.equal((await store.listTransactions('TEST-U001')).length, before.length + 1);
});

test('ผู้ใช้อื่นแก้และยกเลิกรายการไม่ได้', async () => {
  const store = new DemoStore();
  await assert.rejects(() => store.updateTransaction('TEST-TX-001', 'TEST-U999', { amount: 1 }), /ไม่พบรายการ/);
  assert.equal(await store.softDeleteTransaction('TEST-TX-001', 'TEST-U999'), false);
});

test('ยกเลิกเป็น soft delete และหายจากรายการใช้งาน', async () => {
  const store = new DemoStore();
  assert.equal(await store.softDeleteTransaction('TEST-TX-001', 'TEST-U001'), true);
  assert.equal(await store.getTransaction('TEST-TX-001', 'TEST-U001'), null);
});
