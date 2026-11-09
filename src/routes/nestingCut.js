// ปลั๊กอิน "นัดพอน Nesting Cut" — หน้าดาวน์โหลด + ระบบอัปเดตในแผง
//
//   GET /nesting-cut                 หน้าดาวน์โหลดตัวติดตั้ง (รุ่นล่าสุด + วิธีติดตั้ง + มีอะไรใหม่)
//   GET /nesting-cut/nesting-cut.zip ไฟล์ zip ทั้งโฟลเดอร์ (ทำในหน่วยความจำ ไฟล์ .command ยังดับเบิลคลิกได้บน Mac)
//   GET /nesting-cut/update.json     แผงเช็กรุ่น: { version, notes, files: [{ path, size, sha256 }] }
//   GET /nesting-cut/file/<path>     ไฟล์ทีละไฟล์ (เฉพาะที่อยู่ในรายการ — กันขอไฟล์อื่นของเซิร์ฟเวอร์)
//
// อ่านจากโฟลเดอร์ adobe/nesting-cut ที่ขึ้นระบบมาพร้อมเซิร์ฟเวอร์ (main = รุ่นล่าสุดเสมอ)
// แผงเปิดจาก file:// → ทุกคำตอบใส่ CORS เปิด (อ่านอย่างเดียว ไม่มีข้อมูลลับ)

import express from 'express';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { escapeHtml } from '../utils/html.js';

const SKIP = /(^|\/)(\.[^/]*|node_modules|update-state\.json)(\/|$)/;

function walk(dir, root, out) {
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    const rel = relative(root, full).split(sep).join('/');
    if (SKIP.test(rel)) continue;
    const st = statSync(full);
    if (st.isDirectory()) walk(full, root, out);
    else if (st.isFile()) out.push(rel);
  }
  return out;
}

// ส่วน "## รุ่นล่าสุด" บนสุดของ CHANGELOG.md (ข้อความสั้น ๆ ให้แผงโชว์ว่ามีอะไรใหม่)
export function latestNotes(md, version) {
  const lines = String(md || '').split(/\r?\n/);
  let on = false;
  const out = [];
  for (const line of lines) {
    if (/^##\s/.test(line)) {
      if (on) break;
      on = !version || line.includes(version);
      continue;
    }
    if (on && line.trim()) out.push(line.replace(/^[-*]\s+/, '').trim());
  }
  return out.slice(0, 8);
}

// ดัชนีไฟล์ของปลั๊กอิน (ทำครั้งเดียวต่อการเปิดเซิร์ฟเวอร์)
export function pluginIndex(root) {
  const paths = walk(root, root, []);
  const files = paths.map((path) => {
    const data = readFileSync(join(root, path));
    return { path, size: data.length, sha256: createHash('sha256').update(data).digest('hex'), data };
  });
  let version = '0.0.0';
  try {
    version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version || version;
  } catch {}
  let notes = [];
  try {
    notes = latestNotes(readFileSync(join(root, 'CHANGELOG.md'), 'utf8'), version);
  } catch {}
  return { version, notes, files };
}

// ---------------------------------------------------------------- zip (ไม่ต้องพึ่งไลบรารี)

const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

export function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

// entries: [{ name, data }] → Buffer · ไฟล์ .command/.sh ได้สิทธิ์รันบน Mac (unix 0755)
export function makeZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8');
    const raw = e.data;
    const packed = deflateRawSync(raw, { level: 9 });
    const useDeflate = packed.length < raw.length;
    const body = useDeflate ? packed : raw;
    const crc = crc32(raw);
    const exec = /\.(command|sh)$/.test(e.name);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0x0800, 6); // ชื่อไฟล์เป็น UTF-8
    lh.writeUInt16LE(useDeflate ? 8 : 0, 8);
    lh.writeUInt16LE(0, 10);
    lh.writeUInt16LE(0x21, 12); // 1980-01-01
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(body.length, 18);
    lh.writeUInt32LE(raw.length, 22);
    lh.writeUInt16LE(name.length, 26);
    lh.writeUInt16LE(0, 28);
    locals.push(lh, name, body);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(0x0314, 4); // ทำบน unix (เก็บสิทธิ์ไฟล์)
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0x0800, 8);
    ch.writeUInt16LE(useDeflate ? 8 : 0, 10);
    ch.writeUInt16LE(0, 12);
    ch.writeUInt16LE(0x21, 14);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(body.length, 20);
    ch.writeUInt32LE(raw.length, 24);
    ch.writeUInt16LE(name.length, 28);
    ch.writeUInt16LE(0, 30);
    ch.writeUInt16LE(0, 32);
    ch.writeUInt16LE(0, 34);
    ch.writeUInt16LE(0, 36);
    ch.writeUInt32LE((((exec ? 0o100755 : 0o100644) << 16) >>> 0), 38);
    ch.writeUInt32LE(offset, 42);
    centrals.push(ch, name);
    offset += lh.length + name.length + body.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

// ---------------------------------------------------------------- หน้าดาวน์โหลด

export function downloadPage(idx) {
  const v = escapeHtml(idx.version);
  const notes = idx.notes.map((n) => `<li>${escapeHtml(n)}</li>`).join('');
  return `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>นัดพอน Nesting Cut — ดาวน์โหลด</title>
<link rel="icon" href="/nesting-cut/file/assets/icons/plugin@1x.png">
<style>
:root{--bg:#f3f1ec;--card:#fff;--ink:#1c2541;--muted:#5d6479;--accent:#d9622b;--line:#e2ddd3}
@media (prefers-color-scheme:dark){:root{--bg:#121626;--card:#1c2238;--ink:#eef0f6;--muted:#aab1c6;--line:#2d3550}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 "Noto Sans Thai","Leelawadee UI",Tahoma,sans-serif}
main{max-width:640px;margin:0 auto;padding:24px 16px 48px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:20px;margin-bottom:16px}
h1{font-size:24px;margin:0 0 4px}h2{font-size:18px;margin:0 0 8px}.ver{color:var(--muted);margin:0 0 16px}
.dl{display:inline-block;background:var(--accent);color:#fff;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:12px;font-size:18px}
ol,ul{padding-left:22px;margin:6px 0}li{margin:4px 0}code{background:rgba(127,127,127,.15);padding:1px 6px;border-radius:6px;word-break:break-all}
.muted{color:var(--muted);font-size:14px}
</style></head><body><main>
<div class="card">
<h1>✂️ นัดพอน Nesting Cut</h1>
<p class="ver">ปลั๊กอิน Illustrator · รุ่นล่าสุด <b>${v}</b></p>
<a class="dl" href="/nesting-cut/nesting-cut.zip" download>ดาวน์โหลดตัวติดตั้ง (.zip)</a>
<p class="muted">ติดตั้งครั้งเดียว — รุ่นต่อไปกด “อัปเดตเลย” ในแผงได้เลย ไม่ต้องดาวน์โหลดใหม่</p>
</div>
${notes ? `<div class="card"><h2>มีอะไรใหม่ในรุ่น ${v}</h2><ul>${notes}</ul></div>` : ''}
<div class="card">
<h2>ติดตั้ง</h2>
<ol>
<li>ดาวน์โหลดแล้ว <b>แตกไฟล์ zip</b> (ดับเบิลคลิก) จะได้โฟลเดอร์ <code>nesting-cut</code></li>
<li><b>Mac</b>: เปิดโฟลเดอร์ <code>install</code> → ดับเบิลคลิก <code>install-illustrator-mac.command</code> (ครั้งแรกถ้าเปิดไม่ได้ ให้คลิกขวา › Open)<br>
<b>Windows</b>: เปิดโฟลเดอร์ <code>install</code> → ดับเบิลคลิก <code>install-illustrator-windows.cmd</code></li>
<li>ปิด Illustrator ให้สนิท แล้วเปิดใหม่ → เมนู <b>Window › Extensions › นัดพอน Nesting Cut</b></li>
<li>มุมล่างขวาของแผงต้องขึ้น “รุ่น ${v}”</li>
</ol>
</div>
<div class="card">
<h2>อัปเดตรุ่นใหม่</h2>
<p>เปิดแผงแล้วถ้ามีรุ่นใหม่ จะขึ้นแถบ <b>“มีรุ่นใหม่ — อัปเดตเลย”</b> ด้านบน กดปุ่มเดียว แผงดาวน์โหลดไฟล์ที่เปลี่ยนแล้วโหลดตัวเองใหม่ให้ (ไม่ต้องปิด Illustrator)
· หรือกด “เช็กอัปเดต” ในหน้า ❓ สอน</p>
</div>
</main></body></html>`;
}

// ---------------------------------------------------------------- router

export function createNestingCutRouter({ root = 'adobe/nesting-cut' } = {}) {
  const router = express.Router();
  let idx = null;
  let zip = null;
  const index = () => {
    if (!idx) idx = pluginIndex(root);
    return idx;
  };
  const byPath = () => {
    const m = new Map();
    for (const f of index().files) m.set(f.path, f);
    return m;
  };
  let paths = null;

  router.use((req, res, next) => {
    res.set('Access-Control-Allow-Origin', '*');
    next();
  });

  router.get('/', (req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.type('html').send(downloadPage(index()));
  });

  router.get('/update.json', (req, res) => {
    const i = index();
    res.set('Cache-Control', 'no-cache');
    res.json({
      version: i.version,
      notes: i.notes,
      zip: '/nesting-cut/nesting-cut.zip',
      files: i.files.map((f) => ({ path: f.path, size: f.size, sha256: f.sha256 })),
    });
  });

  router.get('/nesting-cut.zip', (req, res) => {
    const i = index();
    if (!zip) zip = makeZip(i.files.map((f) => ({ name: 'nesting-cut/' + f.path, data: f.data })));
    res.set('Cache-Control', 'no-cache');
    res.set('Content-Type', 'application/zip');
    res.set('Content-Disposition', `attachment; filename="nesting-cut-${i.version}.zip"`);
    res.send(zip);
  });

  router.get(/^\/file\/(.+)$/, (req, res) => {
    if (!paths) paths = byPath();
    let p = '';
    try {
      p = decodeURIComponent(req.params[0]);
    } catch {}
    const f = paths.get(p);
    if (!f) return res.status(404).type('text').send('not found');
    res.set('Cache-Control', 'no-cache');
    res.set('Content-Type', 'application/octet-stream');
    res.send(f.data);
  });

  return router;
}

export default createNestingCutRouter();
