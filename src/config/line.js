// A value pasted into a hosting dashboard often arrives with a stray space or
// newline around it. On the access token that is a 401 from LINE; on the
// channel secret it is a failed signature on every webhook, which stops
// delivery entirely and looks like a bot with nothing to say. Trim both.
const LINE_CHANNEL_ACCESS_TOKEN = String(process.env.LINE_CHANNEL_ACCESS_TOKEN ?? '').trim();
const LINE_CHANNEL_SECRET = String(process.env.LINE_CHANNEL_SECRET ?? '').trim();

if (!LINE_CHANNEL_ACCESS_TOKEN || !LINE_CHANNEL_SECRET) {
  throw new Error(
    'Missing LINE env vars. Set LINE_CHANNEL_ACCESS_TOKEN and LINE_CHANNEL_SECRET.'
  );
}

export const lineConfig = {
  channelAccessToken: LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: LINE_CHANNEL_SECRET,
};

// A channel secret is 32 hex characters. Anything else was mistyped, truncated,
// or is some other value entirely — most often the channel ID, or the secret
// from a different channel. Reported by /health as a shape, never as a value.
export function channelSecretShape(secret = LINE_CHANNEL_SECRET, raw = process.env.LINE_CHANNEL_SECRET) {
  const length = secret.length;
  const trimmed = String(raw ?? '') !== secret;
  if (length !== 32) return { ok: false, length, trimmed, why: 'ต้องยาว 32 ตัวอักษร' };
  if (!/^[0-9a-f]{32}$/i.test(secret)) return { ok: false, length, trimmed, why: 'ต้องเป็น 0-9 a-f เท่านั้น' };
  return { ok: true, length, trimmed };
}

export const LINE_API_BASE = 'https://api.line.me/v2/bot';
export const LINE_DATA_API_BASE = 'https://api-data.line.me/v2/bot';
