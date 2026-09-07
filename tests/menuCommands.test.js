import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveMenuCommand } from '../src/utils/menuCommands.js';

test('maps the 8 core menu labels to their postback actions', () => {
  assert.equal(resolveMenuCommand('บันทึกงานวันนี้'), 'add_job');
  assert.equal(resolveMenuCommand('แนบสลิป/หลักฐาน'), 'attach_evidence');
  assert.equal(resolveMenuCommand('รายการล่าสุด'), 'recent_jobs');
  assert.equal(resolveMenuCommand('สรุปวันนี้'), 'today_summary');
  assert.equal(resolveMenuCommand('แก้ไขล่าสุด'), 'edit_latest');
  assert.equal(resolveMenuCommand('ยกเลิกล่าสุด'), 'cancel_latest');
  assert.equal(resolveMenuCommand('ค้างรับ'), 'pending_payment');
  assert.equal(resolveMenuCommand('ช่วยเหลือ'), 'help');
});

test('tolerates variants, emoji/number decoration and whitespace', () => {
  assert.equal(resolveMenuCommand('แก้ล่าสุด'), 'edit_latest');
  assert.equal(resolveMenuCommand('  📊 สรุปวันนี้ '), 'today_summary');
  assert.equal(resolveMenuCommand('7. ค้างรับ'), 'pending_payment');
  assert.equal(resolveMenuCommand('HELP'), 'help');
  assert.equal(resolveMenuCommand('รายงาน'), 'report_menu');
});

test('never hijacks ordinary job text', () => {
  assert.equal(resolveMenuCommand('ป้ายไวนิล 60x100 150 บาท'), null);
  assert.equal(resolveMenuCommand('ค้างรับ 500'), null);
  assert.equal(resolveMenuCommand(''), null);
  assert.equal(resolveMenuCommand(null), null);
});
