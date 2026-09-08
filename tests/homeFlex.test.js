import { test } from 'node:test';
import assert from 'node:assert/strict';
import { homeFlex } from '../src/flex/homeFlex.js';
import { COLORS } from '../src/flex/theme.js';

const SUMMARY = { date: '2026-09-08', total: 2450, jobCount: 6, pending: 550 };

test('the home card greets by name when there is one, and by the brand when there is not', () => {
  const named = JSON.stringify(homeFlex(SUMMARY, { displayName: 'ฟิล์ม', heroImageUrl: null }));
  assert.ok(named.includes('สวัสดีค่ะ คุณฟิล์ม'));

  for (const missing of [undefined, null, '', '   ']) {
    const anon = JSON.stringify(homeFlex(SUMMARY, { displayName: missing, heroImageUrl: null }));
    assert.ok(anon.includes('ม่วงจดพร้อมช่วยแล้ว'), `${JSON.stringify(missing)}: no greeting`);
    assert.ok(!anon.includes('คุณnull') && !anon.includes('คุณundefined'));
  }
});

test('it shows the day in three numbers and the buttons someone came for', () => {
  const json = JSON.stringify(homeFlex(SUMMARY, { heroImageUrl: null, liffUrl: null }));
  assert.ok(json.includes('฿2,450'), 'the day total');
  assert.ok(json.includes('"6"'), 'the job count');
  assert.ok(json.includes('฿550'), 'what is still owed');

  for (const action of ['action=add_job', 'action=today_summary', 'action=pending_payment']) {
    assert.ok(json.includes(action), `${action} is missing`);
  }
});

test('the dashboard button and the mascot strip appear only when they resolve', () => {
  const without = homeFlex(SUMMARY, { heroImageUrl: null, liffUrl: null });
  assert.equal(without.contents.hero, undefined, 'no strip, no hero');
  assert.ok(!JSON.stringify(without).includes('เปิดแดชบอร์ด'), 'no LIFF, no dashboard button');

  const with_ = homeFlex(SUMMARY, {
    heroImageUrl: 'https://bot.example.com/brand/ui/card-hero.png',
    liffUrl: 'https://liff.line.me/1234567890-AbCdEfGh?tab=today',
  });
  assert.equal(with_.contents.hero.url, 'https://bot.example.com/brand/ui/card-hero.png');
  assert.ok(JSON.stringify(with_).includes('liff.line.me'));
});

test('an empty day still renders, since a new user taps the mascot first', () => {
  const json = JSON.stringify(homeFlex({}, { heroImageUrl: null, liffUrl: null }));
  assert.ok(json.includes('฿0'));
  assert.ok(json.includes(COLORS.accent));
});
