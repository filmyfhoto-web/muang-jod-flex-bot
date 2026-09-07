// Tiny structured logger. Never logs secrets (tokens, keys, file binary).

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const THRESHOLD = LEVELS[process.env.LOG_LEVEL] || LEVELS.info;

// Keys whose values must never be logged.
const SECRET_KEYS = [
  'access_token',
  'accesstoken',
  'channelaccesstoken',
  'channel_access_token',
  'channel_secret',
  'channelsecret',
  'service_role_key',
  'service_role',
  'authorization',
  'secret',
  'token',
  'password',
  'buffer',
  'file',
  'binary',
  'content',
];

function isSecretKey(key) {
  const k = String(key).toLowerCase();
  return SECRET_KEYS.some((s) => k.includes(s));
}

// Mask a LINE user id (or any id) to avoid logging it in full.
// "U1234567890abcdef..." -> "U123…cdef"
export function maskUserId(id) {
  if (!id) return 'unknown';
  const s = String(id);
  if (s.length <= 8) return `${s.slice(0, 2)}…`;
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

// Redact secret-looking fields and Buffers from a metadata object (shallow + 1 level).
function sanitize(meta) {
  if (!meta || typeof meta !== 'object') return meta;
  const out = Array.isArray(meta) ? [] : {};
  for (const [key, value] of Object.entries(meta)) {
    if (Buffer.isBuffer(value)) {
      out[key] = `[buffer ${value.length}b]`;
    } else if (isSecretKey(key)) {
      out[key] = '[REDACTED]';
    } else if (value && typeof value === 'object') {
      out[key] = sanitize(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function emit(level, msg, meta) {
  if (LEVELS[level] < THRESHOLD) return;
  const record = {
    t: new Date().toISOString(),
    level,
    msg,
    ...(meta ? { meta: sanitize(meta) } : {}),
  };
  const line = JSON.stringify(record);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (msg, meta) => emit('debug', msg, meta),
  info: (msg, meta) => emit('info', msg, meta),
  warn: (msg, meta) => emit('warn', msg, meta),
  error: (msg, meta) => emit('error', msg, meta),
};

export { sanitize as _sanitizeForTest };
