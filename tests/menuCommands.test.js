import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveMenuCommand, splitLeadingAddJob } from '../src/utils/menuCommands.js';

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

test('"งานวันนี้" alone is add_job; with details it splits into a job entry', () => {
  assert.equal(resolveMenuCommand('งานวันนี้'), 'add_job');
  assert.deepEqual(splitLeadingAddJob('งานวันนี้ ป้ายไวนิล 60x100 150 บาท'), {
    action: 'add_job',
    rest: 'ป้ายไวนิล 60x100 150 บาท',
  });
  assert.deepEqual(splitLeadingAddJob('บันทึกงาน ถ่ายเอกสาร 120'), {
    action: 'add_job',
    rest: 'ถ่ายเอกสาร 120',
  });
  assert.equal(splitLeadingAddJob('สรุปวันนี้ อะไรก็ได้'), null); // not an add-job label
  assert.equal(splitLeadingAddJob('ป้ายไวนิล 150 บาท'), null);
});

test('never hijacks ordinary job text', () => {
  assert.equal(resolveMenuCommand('ป้ายไวนิล 60x100 150 บาท'), null);
  assert.equal(resolveMenuCommand('ค้างรับ 500'), null);
  assert.equal(resolveMenuCommand(''), null);
  assert.equal(resolveMenuCommand(null), null);
});

test('a menu whose buttons send text still reaches every handler', () => {
  // A Rich Menu can be built with "send message" actions instead of postbacks —
  // the artwork's own labels arrive as ordinary chat text. Every button on the
  // 9-area menu has to land somewhere, or it looks like the bot ignored a tap.
  const buttons = {
    'จดงาน': 'add_job',
    'รายการล่าสุด/แก้ไข': 'recent_jobs',
    'บันทึก/แนบสลิป': 'attach_evidence',
    'งานค้าง': 'pending_payment',
    'หมวดงาน': 'pick_category',
    'ออกใบเสร็จ': 'create_bill',
    'ตั้งค่า': 'open_dashboard',
    'ช่วยเหลือ': 'help',
    'แจ้งเตือนงาน': 'remind_job',
    'ม่วงจดให้': 'home',
  };
  for (const [label, action] of Object.entries(buttons)) {
    assert.equal(resolveMenuCommand(label), action, `${label} does not reach ${action}`);
  }

  // The small captions printed under a heading, in case those are sent instead.
  assert.equal(resolveMenuCommand('ดูงานทั้งหมด'), 'recent_jobs');
  assert.equal(resolveMenuCommand('ปรับแต่งแอป'), 'open_dashboard');
});
