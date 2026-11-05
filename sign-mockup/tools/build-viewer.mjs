// สร้าง vendor/viewer3d.standalone.js ใหม่ (ตัวดู 3 มิติ + three.js เป็นสคริปต์ธรรมดาไฟล์เดียว สำหรับไฟล์ HTML พรีวิว 3 มิติ)
//   node sign-mockup/tools/build-viewer.mjs        (ต้องต่อเน็ต: ดึง esbuild ผ่าน npx ครั้งแรก)
// หัวไฟล์จด sha256 ของ viewer3d-core.js ไว้ — เทสต์เช็กว่าแก้ตัวดูแล้วสร้างไฟล์นี้ใหม่ด้วย
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('..', import.meta.url));
const hash = createHash('sha256').update(readFileSync(dir + 'viewer3d-core.js')).digest('hex').slice(0, 16);
execFileSync(
  'npx',
  [
    '--yes',
    'esbuild@0.20.2',
    'viewer3d-standalone.js',
    '--bundle',
    '--format=iife',
    '--minify',
    '--legal-comments=inline',
    '--alias:three=./vendor/three.module.min.js',
    `--banner:js=/* NTP viewer3d standalone · viewer3d-core sha256:${hash} · three.js r160 (MIT) — สร้างจาก tools/build-viewer.mjs ห้ามแก้ไฟล์นี้ตรง ๆ */`,
    '--outfile=vendor/viewer3d.standalone.js',
  ],
  { cwd: dir, stdio: 'inherit' }
);
console.log('viewer3d.standalone.js built · core', hash);
