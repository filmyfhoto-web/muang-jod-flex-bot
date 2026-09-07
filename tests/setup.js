// Preloaded before test files (see the "test" script). Provides dummy env so
// modules that construct the Supabase / LINE clients at import time can load.
// No network happens — service tests pass a mock client explicitly.
process.env.SUPABASE_URL ||= 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-key';
process.env.LINE_CHANNEL_ACCESS_TOKEN ||= 'test-token';
process.env.LINE_CHANNEL_SECRET ||= 'test-secret';
process.env.LOG_LEVEL ||= 'error'; // keep test output quiet
