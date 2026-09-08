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
//
// The catch is that a free plan bills the hours the instance is awake, and
// Render's allowance is 750 a month — pinging around the clock spends about 720
// of them and leaves nothing for a second service or a busy month. So the ping
// runs only during the hours anyone is likely to write to the shop's bot: about
// 510 hours, with the same instant answers when it matters and the old 50-second
// wake overnight.

const DEFAULT_INTERVAL_MS = 10 * 60_000; // comfortably under a 15-minute idle cut-off
const DEFAULT_HOURS = [6, 23]; // 06:00–23:00 in Bangkok
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

export function keepAliveEnabled(env = process.env) {
  const v = String(env.KEEP_ALIVE ?? '').trim().toLowerCase();
  return !(v === '0' || v === 'false' || v === 'off' || v === 'no');
}

// "6-23" -> [6, 23]. "0-24" means around the clock. Anything unparseable falls
// back to the default rather than leaving the bot asleep all day.
export function parseHours(value, fallback = DEFAULT_HOURS) {
  const m = /^\s*(\d{1,2})\s*-\s*(\d{1,2})\s*$/.exec(String(value ?? ''));
  if (!m) return fallback;
  const from = Number(m[1]);
  const to = Number(m[2]);
  if (from > 24 || to > 24 || from === to) return fallback;
  return [from, to];
}

// Bangkok has no daylight saving, so a fixed offset is exact.
export function withinActiveHours(now, [from, to]) {
  if (from === 0 && to === 24) return true;
  const hour = new Date(now.getTime() + BANGKOK_OFFSET_MS).getUTCHours();
  // A window that wraps past midnight (22-6) is still one window.
  return from < to ? hour >= from && hour < to : hour >= from || hour < to;
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
  const hours = parseHours(env.KEEP_ALIVE_HOURS, opts.hours || DEFAULT_HOURS);
  const doFetch = opts.fetch || globalThis.fetch;
  const clock = opts.now || (() => new Date());

  const ping = async () => {
    if (!withinActiveHours(clock(), hours)) return;
    try {
      // A failed ping is not worth a retry: the next one is minutes away.
      await doFetch(url, { method: 'GET', signal: AbortSignal.timeout(20_000) });
    } catch (err) {
      logger.warn('keepalive.ping_failed', { message: err?.message });
    }
  };

  const timer = setInterval(ping, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();
  logger.info('keepalive.started', { url, intervalMs, hours: `${hours[0]}-${hours[1]}` });
  return () => clearInterval(timer);
}
