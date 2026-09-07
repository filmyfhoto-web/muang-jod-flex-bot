import 'dotenv/config';
import express from 'express';
import linebot from '@line/bot-sdk';

const { SignatureValidationFailed, JSONParseError } = linebot;

// --- Validate environment before wiring up anything that needs it ---
const REQUIRED_ENV = [
  'LINE_CHANNEL_ACCESS_TOKEN',
  'LINE_CHANNEL_SECRET',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
];

const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
if (missing.length) {
  console.error('❌ ขาด environment variables ที่จำเป็น:');
  for (const key of missing) console.error(`   - ${key}`);
  console.error('\nคัดลอก .env.example เป็น .env แล้วกรอกค่าให้ครบก่อนรันค่ะ');
  process.exit(1);
}

// Dynamic import AFTER validation so config modules read a populated env.
const { default: webhookRouter } = await import('./routes/webhook.js');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => res.send('ม่วงจด LINE Bot กำลังทำงานอยู่ค่ะ 💜'));
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'muang-jod' }));

// Mount webhook. NOTE: no express.json() before this — the LINE middleware
// needs the raw body to verify the signature.
app.use('/webhook', webhookRouter);

// Signature / parse error handler for the webhook.
app.use((err, req, res, next) => {
  if (err instanceof SignatureValidationFailed) {
    console.error('[server] invalid LINE signature');
    return res.status(401).json({ error: 'invalid signature' });
  }
  if (err instanceof JSONParseError) {
    console.error('[server] JSON parse error:', err.message);
    return res.status(400).json({ error: 'invalid payload' });
  }
  console.error('[server] unhandled error:', err?.message || err);
  return res.status(500).json({ error: 'internal error' });
});

app.listen(PORT, () => {
  console.log(`💜 ม่วงจด LINE Bot listening on port ${PORT}`);
  console.log(`   Webhook URL: <your-domain>/webhook`);
});
