import { publicBaseUrl } from '../utils/brand.js';
import { logger } from './logger.js';

// Keeps the web process awake on hosts that sleep an idle instance (Render's
// free tier does, after ~15 minutes without a request).
//
// Why this matters here rather than being a nicety: a sleeping instance takes
// most of a minute to wake, and LINE's reply token has expired by the time it
// does — so the first tap after a quiet spell gets no answer at all. The timer
// that sends reminders has the same problem: it does not run while the process
// is asleep, so a reminder set for 09:00 arrives whenever someone next writes
// to the bot.
//
// Only an inbound request resets the host's idle timer, so an internal timer is
// not enough — the ping has to go out over the network and come back in.

const DEFAULT_INTERVAL_MS = 10 * 60_000; // comfortably under a 15-minute idle cut-off

export function keepAliveEnabled(env = process.env) {
  const v = String(env.KEEP_ALIVE ?? '').trim().toLowerCase();
  return !(v === '0' || v === 'false' || v === 'off' || v === 'no');
}

// Start pinging. Returns a stop function, or null when there is nothing to ping
// (no public URL configured, or switched off) — running locally, that is right.
export function startKeepAlive(opts = {}) {
  const env = opts.env || process.env;
  if (!keepAliveEnabled(env)) return null;

  const base = opts.baseUrl !== undefined ? opts.baseUrl : publicBaseUrl(env);
  if (!base) return null;

  const url = `${base}/health`;
  const intervalMs = Number(env.KEEP_ALIVE_INTERVAL_MS) || opts.intervalMs || DEFAULT_INTERVAL_MS;
  const doFetch = opts.fetch || globalThis.fetch;

  const ping = async () => {
    try {
      // A failed ping is not worth a retry: the next one is minutes away.
      await doFetch(url, { method: 'GET', signal: AbortSignal.timeout(20_000) });
    } catch (err) {
      logger.warn('keepalive.ping_failed', { message: err?.message });
    }
  };

  const timer = setInterval(ping, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();
  logger.info('keepalive.started', { url, intervalMs });
  return () => clearInterval(timer);
}
