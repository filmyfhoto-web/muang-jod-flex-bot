import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { signOpaqueId, verifyLineSignature, verifyOpaqueId } from '../src/lib/security.mjs';

test('ตรวจ LINE signature แบบ timing safe', () => {
  const body = Buffer.from('{"events":[]}');
  const secret = 'TEST-CHANNEL-SECRET';
  const signature = crypto.createHmac('sha256', secret).update(body).digest('base64');
  assert.equal(verifyLineSignature(body, signature, secret), true);
  assert.equal(verifyLineSignature(body, `${signature}x`, secret), false);
});

test('ลิงก์แก้ไขที่ถูกเปลี่ยนถูกปฏิเสธ', () => {
  const signed = signOpaqueId('TEST-TX-001', 'TEST-SIGNING-SECRET');
  assert.equal(verifyOpaqueId(signed, 'TEST-SIGNING-SECRET'), 'TEST-TX-001');
  assert.equal(verifyOpaqueId(`${signed}x`, 'TEST-SIGNING-SECRET'), null);
});
