import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DEMO_MODE = 'true';
const { createServer } = await import('../src/server.mjs');

test('หน้า preview → ยืนยัน → สรุป ทำงานครบ', async (t) => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { 'content-type': 'application/json', 'x-test-user-id': 'TEST-U001' };

  const health = await fetch(`${base}/health`).then((response) => response.json());
  assert.equal(health.ok, true);
  assert.equal(health.mode, 'TEST');

  const previewResponse = await fetch(`${base}/api/demo/preview`, {
    method: 'POST', headers,
    body: JSON.stringify({ text: 'งานวันนี้ ป้ายไวนิล 60*100 150 บาท โฟมบอร์ด 40*60 250 บาท' })
  });
  assert.equal(previewResponse.status, 200);
  const preview = await previewResponse.json();
  assert.deepEqual(preview.batch.entries.map((item) => item.amount), [150, 250]);
  assert.match(preview.flex.altText, /2 รายการ/);

  const confirmedResponse = await fetch(`${base}/api/demo/confirm`, {
    method: 'POST', headers, body: JSON.stringify({ batchId: preview.batch.id })
  });
  assert.equal(confirmedResponse.status, 200);
  const confirmed = await confirmedResponse.json();
  assert.equal(confirmed.transactions.length, 2);
  assert.ok(confirmed.transactions.every((item) => item.editToken));

  const summary = await fetch(`${base}/api/summary?period=today`, { headers }).then((response) => response.json());
  assert.ok(summary.summary.income >= 400);
});
