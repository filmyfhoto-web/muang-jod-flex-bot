function bool(value, fallback = false) {
  if (value == null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

export function readConfig(env = process.env) {
  const demoMode = bool(env.DEMO_MODE, true);
  const port = Number(env.PORT || 3000);
  const publicBaseUrl = String(env.PUBLIC_BASE_URL || `http://localhost:${port}`).replace(/\/$/, '');
  const config = {
    demoMode,
    port,
    publicBaseUrl,
    signingSecret: env.APP_SIGNING_SECRET || 'TEST-only-secret-change-before-production',
    line: {
      channelSecret: env.LINE_CHANNEL_SECRET || '',
      accessToken: env.LINE_CHANNEL_ACCESS_TOKEN || '',
      loginChannelId: env.LINE_LOGIN_CHANNEL_ID || '',
      liffId: env.LINE_LIFF_ID || ''
    },
    supabase: {
      url: String(env.SUPABASE_URL || '').replace(/\/$/, ''),
      secretKey: env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || ''
    }
  };

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT ต้องเป็นเลข 1-65535');
  }
  if (!demoMode) {
    const missing = [];
    if (!config.line.channelSecret) missing.push('LINE_CHANNEL_SECRET');
    if (!config.line.accessToken) missing.push('LINE_CHANNEL_ACCESS_TOKEN');
    if (!config.line.loginChannelId) missing.push('LINE_LOGIN_CHANNEL_ID');
    if (!config.line.liffId) missing.push('LINE_LIFF_ID');
    if (!config.supabase.url) missing.push('SUPABASE_URL');
    if (!config.supabase.secretKey) missing.push('SUPABASE_SECRET_KEY');
    if (!env.APP_SIGNING_SECRET || env.APP_SIGNING_SECRET.length < 32) missing.push('APP_SIGNING_SECRET(>=32)');
    if (missing.length) throw new Error(`ค่าระบบจริงยังไม่ครบ: ${missing.join(', ')}`);
    if (!publicBaseUrl.startsWith('https://')) throw new Error('PUBLIC_BASE_URL ของระบบจริงต้องเป็น HTTPS');
  }
  return config;
}
