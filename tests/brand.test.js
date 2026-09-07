import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { publicBaseUrl, brandAssetUrl, MASCOT } from '../src/utils/brand.js';

test('publicBaseUrl: PUBLIC_BASE_URL wins, Render fallback, https only, no trailing slash', () => {
  assert.equal(publicBaseUrl({ PUBLIC_BASE_URL: 'https://bot.example.com/' }), 'https://bot.example.com');
  assert.equal(publicBaseUrl({ RENDER_EXTERNAL_URL: 'https://x.onrender.com' }), 'https://x.onrender.com');
  assert.equal(
    publicBaseUrl({ PUBLIC_BASE_URL: 'https://a.com', RENDER_EXTERNAL_URL: 'https://b.com' }),
    'https://a.com'
  );
  assert.equal(publicBaseUrl({ PUBLIC_BASE_URL: 'http://insecure.com' }), null);
  assert.equal(publicBaseUrl({}), null);
});

test('brandAssetUrl: only when the base is known AND the file exists', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'brand-'));
  writeFileSync(path.join(dir, MASCOT.clipboard), 'png');

  assert.equal(
    brandAssetUrl(MASCOT.clipboard, { baseUrl: 'https://bot.example.com', dir }),
    'https://bot.example.com/brand/mascot.png'
  );
  assert.equal(brandAssetUrl(MASCOT.wave, { baseUrl: 'https://bot.example.com', dir }), null); // missing file
  assert.equal(brandAssetUrl(MASCOT.clipboard, { baseUrl: null, dir }), null); // unknown origin
});
