import { existsSync } from 'node:fs';
import path from 'node:path';

// Brand assets live in public/brand and are served at /brand/<file> by
// server.js. LINE only loads https images, so a URL is produced only when
// the bot knows its own public origin and the file actually exists — a
// missing mascot simply leaves the card without one.

export const BRAND_DIR = path.resolve('public/brand');

// Files the bot looks for (drop them in public/brand; PNG with transparency).
export const MASCOT = {
  clipboard: 'mascot.png', // holding a clipboard — receipt card
  wave: 'mascot-wave.png', // waving — welcome message
  sit: 'mascot-sit.png',
  sleep: 'mascot-sleep.png',
  happy: 'mascot-happy.png',
};

// PUBLIC_BASE_URL wins; Render sets RENDER_EXTERNAL_URL automatically.
export function publicBaseUrl(env = process.env) {
  const raw = String(env.PUBLIC_BASE_URL || env.RENDER_EXTERNAL_URL || '').trim();
  const base = raw.replace(/\/+$/, '');
  return /^https:\/\//i.test(base) ? base : null;
}

export function brandAssetUrl(file, opts = {}) {
  const base = opts.baseUrl !== undefined ? opts.baseUrl : publicBaseUrl();
  const dir = opts.dir ?? BRAND_DIR;
  if (!base || !file) return null;
  if (!existsSync(path.join(dir, file))) return null;
  return `${base}/brand/${file}`;
}
