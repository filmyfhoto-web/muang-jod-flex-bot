import { createClient } from '@supabase/supabase-js';
import { normalizeSupabaseUrl } from '../utils/supabaseUrl.js';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    'Missing Supabase env vars. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'
  );
}

// Tolerate the REST/Auth/Storage endpoint URLs the dashboard also shows;
// the client must get the bare project origin.
const supabaseUrl = normalizeSupabaseUrl(SUPABASE_URL);
if (!supabaseUrl) {
  throw new Error('Invalid SUPABASE_URL: must look like https://<project-ref>.supabase.co');
}
if (supabaseUrl !== SUPABASE_URL.trim()) {
  console.warn(`[supabase] SUPABASE_URL normalised to ${supabaseUrl} (was "${SUPABASE_URL}")`);
}

// Service role client — server-side only. Never expose this key to clients.
export const supabase = createClient(supabaseUrl, SUPABASE_SERVICE_ROLE_KEY.trim(), {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

export const STORAGE_BUCKET = 'job-evidence';
