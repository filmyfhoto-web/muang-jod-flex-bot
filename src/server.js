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
const { supabase } = await import('./config/supabase.js');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => res.send('ม่วงจด LINE Bot กำลังทำงานอยู่ค่ะ 💜'));

// Brand assets (e.g. public/brand/mascot.png) served over HTTPS for Flex images.
app.use('/brand', express.static('public/brand', { maxAge: '1d' }));

// LIFF web app (dashboard + edit form) and the JSON API behind it.
const { default: apiRouter } = await import('./routes/api.js');
app.use('/app', express.static('public/liff', { maxAge: '5m', extensions: ['html'] }));
app.use('/api', apiRouter);

// Health: also probes the database so setup problems (migration not run,
// wrong key, wrong URL) are visible from a browser instead of only in logs.
// A real GET, not HEAD: a HEAD 404 has no body and reads as success.
app.get('/health', async (req, res) => {
  const body = { status: 'ok', service: 'muang-jod', db: 'unknown' };
  try {
    const { error } = await supabase.from('profiles').select('id').limit(1);
    if (error) {
      body.db = 'error';
      body.dbError = `${error.code || ''} ${error.message || ''}`.trim();
    } else {
      body.db = 'ok';
    }
  } catch (err) {
    body.db = 'error';
    body.dbError = err?.message || String(err);
  }
  res.json(body);
});

// Deep health: probes every table the bot writes to, so a half-applied
// migration shows up as one failing table instead of a generic chat error.
app.get('/health/db', async (req, res) => {
  const TABLES = ['profiles', 'jobs', 'job_items', 'attachments', 'user_states', 'webhook_events'];
  const tables = {};
  for (const table of TABLES) {
    try {
      const { error } = await supabase.from(table).select('id').limit(1);
      tables[table] = error ? `error: ${`${error.code || ''} ${error.message || ''}`.trim()}` : 'ok';
    } catch (err) {
      tables[table] = `error: ${err?.message || String(err)}`;
    }
  }
  const failed = Object.entries(tables).filter(([, v]) => v !== 'ok').map(([k]) => k);
  res.json({ status: failed.length ? 'error' : 'ok', tables, failed });
});

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
