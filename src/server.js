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
const { default: receiptRouter } = await import('./routes/receipt.js');
app.use('/app', express.static('public/liff', { maxAge: '5m', extensions: ['html'] }));
app.use('/api', apiRouter);

// Printable receipt, readable by anyone holding the bill's share token.
app.use('/r', receiptRouter);

// Owner-only setup page (installing the Rich Menu). Serves 404 unless
// ADMIN_TOKEN is set and the request carries it.
const { default: adminRouter, adminToken } = await import('./routes/admin.js');
app.use('/admin', adminRouter);

// Health: also probes the database so setup problems (migration not run,
// wrong key, wrong URL) are visible from a browser instead of only in logs.
// A real GET, not HEAD: a HEAD 404 has no body and reads as success.
app.get('/health', async (req, res) => {
  // `build` and `admin` answer the question a plain 404 cannot: is the running
  // code the code you just pushed, and is the setup page switched on? Without
  // them "not found" could equally mean an old build or a mistyped key.
  const body = {
    status: 'ok',
    service: 'muang-jod',
    build: (process.env.RENDER_GIT_COMMIT || 'local').slice(0, 7),
    admin: adminToken() ? 'on' : 'off',
    db: 'unknown',
    line: 'unknown',
  };
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

  // The channel token is the other thing that silently stops the bot: LINE
  // invalidates the old one the moment a new one is issued, and from the chat
  // that looks exactly like a bot that has nothing to say.
  try {
    const { client } = await import('./services/lineService.js');
    const info = await client.getBotInfo();
    body.line = 'ok';
    body.botName = info?.displayName;
  } catch (err) {
    body.line = 'error';
    body.lineError = `${err?.statusCode ?? err?.status ?? ''} ${err?.message || ''}`.trim();
  }

  // The secret is separate from the token and fails separately: a wrong one
  // makes every webhook fail its signature, so LINE gets a 401 and stops
  // delivering. Report its shape — never the value.
  const { channelSecretShape } = await import('./config/line.js');
  const secret = channelSecretShape();
  body.secret = secret.ok ? 'ok' : `bad: ${secret.why} (ยาว ${secret.length})`;
  if (secret.trimmed) body.secretHadWhitespace = true;

  // Without a LIFF id the dashboard has nowhere to open, and the bot quietly
  // falls back to a chat card — worth seeing here rather than wondering why
  // the button does something else.
  const { liffId } = await import('./utils/liff.js');
  body.liff = liffId() ? 'on' : 'off';

  // Reading a photographed slip or work order needs the Anthropic key. Without
  // it the bot still works — it just attaches the picture instead of reading
  // it — and that difference is invisible from the chat.
  body.vision = process.env.ANTHROPIC_API_KEY ? 'on' : 'off';

  // Same for voice notes, which need a transcriber — and which one, since the
  // bot takes whichever key is set.
  const { transcriberName } = await import('./services/transcriptionService.js');
  body.voice = transcriberName() || 'off';

  res.json(body);
});

// Did LINE actually call us? Every processed event leaves a row, so this
// separates "LINE is not delivering" from "we are failing to answer" — which
// look identical from the chat, where both are a bot that says nothing.
app.get('/health/webhook', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('webhook_events')
      .select('event_type, processed_at')
      .order('processed_at', { ascending: false })
      .limit(5);
    if (error) throw new Error(`${error.code || ''} ${error.message || ''}`.trim());

    const last = data?.[0];
    const minutesAgo = last ? Math.round((Date.now() - new Date(last.processed_at)) / 60000) : null;
    res.json({
      status: last ? 'ok' : 'no events yet',
      lastEventAt: last?.processed_at ?? null,
      minutesAgo,
      recent: (data || []).map((e) => ({ type: e.event_type, at: e.processed_at })),
      hint: last
        ? 'LINE ส่งเข้ามาถึงบอตแล้ว ถ้าบอตยังไม่ตอบ ให้ดู log ใน Render'
        : 'ยังไม่เคยมี event เข้ามาเลย — ตรวจ Webhook URL, "Use webhook" และโหมดตอบกลับใน OA Manager',
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err?.message || String(err) });
  }
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

// Nothing matched. Express's own 404 in production is the bare words "Not
// Found", which does not say whether the path was wrong or the route missing —
// so say which path arrived here.
app.use((req, res) => {
  res.status(404).json({
    error: 'not found',
    path: req.path,
    hint: 'path ที่ใช้ได้: /health, /health/webhook, /health/db, /admin/rich-menu?key=...',
  });
});

// Signature / parse error handler for the webhook.
app.use((err, req, res, next) => {
  if (err instanceof SignatureValidationFailed) {
    // LINE stops delivering after this, so name the cause rather than the symptom:
    // the signature is computed from LINE_CHANNEL_SECRET, not the access token.
    console.error(
      '[server] invalid LINE signature — LINE_CHANNEL_SECRET does not match this channel ' +
        '(it is on the Basic settings tab, not Messaging API)'
    );
    return res.status(401).json({
      error: 'invalid signature',
      hint: 'LINE_CHANNEL_SECRET ไม่ตรงกับ channel นี้ — ดูที่ LINE Developers > Basic settings > Channel secret',
    });
  }
  if (err instanceof JSONParseError) {
    console.error('[server] JSON parse error:', err.message);
    return res.status(400).json({ error: 'invalid payload' });
  }
  console.error('[server] unhandled error:', err?.message || err);
  return res.status(500).json({ error: 'internal error' });
});

app.listen(PORT, async () => {
  console.log(`💜 ม่วงจด LINE Bot listening on port ${PORT}`);
  console.log(`   Webhook URL: <your-domain>/webhook`);

  // Reminders are sent from this process on a timer. REMINDER_DISPATCH=0 turns
  // it off (e.g. when running more than one instance and only one should send).
  if (String(process.env.REMINDER_DISPATCH ?? '1') !== '0') {
    const { startReminderDispatcher } = await import('./services/reminderDispatcher.js');
    startReminderDispatcher();
  }

  // Hosts that sleep an idle instance leave the first tap of the day
  // unanswered and reminders unsent. KEEP_ALIVE=0 turns this off.
  const { startKeepAlive } = await import('./services/keepAlive.js');
  startKeepAlive();
});
