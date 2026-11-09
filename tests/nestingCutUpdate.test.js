// ปลั๊กอิน Nesting Cut: ระบบอัปเดตในแผง + หน้าดาวน์โหลดตัวติดตั้ง
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import express from 'express';
import { createNestingCutRouter, pluginIndex, makeZip, crc32, latestNotes } from '../src/routes/nestingCut.js';

const require = createRequire(import.meta.url);
const U = require('../adobe/nesting-cut/core/update.js');

test('แผงเทียบรุ่นเป็นตัวเลข (1.10 ใหม่กว่า 1.9) · โหลดเฉพาะไฟล์ที่เปลี่ยน · path แปลกไม่รับ', () => {
  assert.equal(U.compareVersion('1.10.0', '1.9.2'), 1);
  assert.equal(U.compareVersion('1.9.0', '1.9'), 0);
  assert.equal(U.compareVersion('1.8.9', '1.9.0'), -1);
  const info = { version: '2.0.0', files: [{ path: 'a.js', sha256: '1' }, { path: 'core/b.js', sha256: '2' }, { path: '../evil.js', sha256: '3' }, { path: '/etc/x', sha256: '4' }, { path: 'C:/x', sha256: '5' }] };
  assert.deepEqual(U.filesToFetch(info, null).map((f) => f.path), ['a.js', 'core/b.js']); // ยังไม่เคยอัปเดต → ทุกไฟล์
  assert.deepEqual(U.filesToFetch(info, { files: { 'a.js': '1', 'core/b.js': 'old' } }).map((f) => f.path), ['core/b.js']);
  assert.deepEqual(U.dirsFor(['a/b/c.js', 'a/d.js', 'x.js']), ['a', 'a/b']);
  assert.deepEqual(U.newState(info, 't'), { version: '2.0.0', at: 't', files: { 'a.js': '1', 'core/b.js': '2' } });
});

function tmpPlugin(version) {
  const root = mkdtempSync(join(tmpdir(), 'nc-'));
  mkdirSync(join(root, 'core'));
  mkdirSync(join(root, 'install'));
  mkdirSync(join(root, '.git'));
  writeFileSync(join(root, 'package.json'), JSON.stringify({ version }));
  writeFileSync(join(root, 'CHANGELOG.md'), `# x\n\n## ${version}\n\n- ใหม่หนึ่ง\n- ใหม่สอง\n\n## 0.9.0\n\n- เก่า\n`);
  writeFileSync(join(root, 'core', 'a.js'), 'console.log("a");\n'.repeat(50));
  writeFileSync(join(root, 'install', 'go.command'), '#!/bin/bash\necho hi\n');
  writeFileSync(join(root, '.debug'), 'secret');
  writeFileSync(join(root, '.git', 'HEAD'), 'ref');
  writeFileSync(join(root, 'update-state.json'), '{}');
  return root;
}

test('เซิร์ฟเวอร์: update.json บอกรุ่น + มีอะไรใหม่ + ไฟล์ (ไม่รวมไฟล์ซ่อน/บันทึกของเครื่อง) · ไฟล์ทีละไฟล์เฉพาะในรายการ · CORS เปิด', async () => {
  const root = tmpPlugin('3.1.0');
  const app = express();
  app.use('/nesting-cut', createNestingCutRouter({ root }));
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/nesting-cut`;
  try {
    const r = await fetch(base + '/update.json');
    assert.equal(r.headers.get('access-control-allow-origin'), '*');
    const info = await r.json();
    assert.equal(info.version, '3.1.0');
    assert.deepEqual(info.notes, ['ใหม่หนึ่ง', 'ใหม่สอง']);
    assert.deepEqual(info.files.map((f) => f.path).sort(), ['CHANGELOG.md', 'core/a.js', 'install/go.command', 'package.json']);
    const a = info.files.find((f) => f.path === 'core/a.js');
    const got = Buffer.from(await (await fetch(base + '/file/core/a.js')).arrayBuffer());
    assert.equal(got.length, a.size);
    assert.equal(got.toString(), readFileSync(join(root, 'core', 'a.js'), 'utf8'));
    for (const bad of ['/file/.debug', '/file/..%2Fpackage.json', '/file/update-state.json', '/file/nope.js']) {
      assert.equal((await fetch(base + bad)).status, 404, bad);
    }
    const page = await (await fetch(base + '/')).text();
    assert.match(page, /รุ่นล่าสุด <b>3\.1\.0<\/b>/);
    assert.match(page, /href="\/nesting-cut\/nesting-cut\.zip"/);
    assert.match(page, /<li>ใหม่หนึ่ง<\/li>/);
    // zip ทั้งโฟลเดอร์: แตกออกมาได้ไฟล์เดิม · .command รันได้บน Mac
    const zr = await fetch(base + '/nesting-cut.zip');
    assert.match(zr.headers.get('content-disposition'), /nesting-cut-3\.1\.0\.zip/);
    const zip = Buffer.from(await zr.arrayBuffer());
    const entries = readZip(zip);
    assert.deepEqual(entries.map((e) => e.name).sort(), ['nesting-cut/CHANGELOG.md', 'nesting-cut/core/a.js', 'nesting-cut/install/go.command', 'nesting-cut/package.json']);
    const ea = entries.find((e) => e.name === 'nesting-cut/core/a.js');
    assert.equal(ea.data.toString(), readFileSync(join(root, 'core', 'a.js'), 'utf8'));
    assert.equal(ea.method, 8); // บีบอัด
    assert.equal(entries.find((e) => e.name.endsWith('.command')).mode & 0o111, 0o111);
  } finally {
    server.close();
  }
});

// อ่าน zip แบบง่าย (central directory) เพื่อตรวจไฟล์ที่ทำเอง
function readZip(buf) {
  const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buf.readUInt16LE(end + 10);
  let p = buf.readUInt32LE(end + 16);
  const out = [];
  for (let i = 0; i < count; i++) {
    assert.equal(buf.readUInt32LE(p), 0x02014b50);
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28);
    const elen = buf.readUInt16LE(p + 30);
    const clen = buf.readUInt16LE(p + 32);
    const mode = buf.readUInt32LE(p + 38) >>> 16;
    const off = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nlen).toString('utf8');
    const lnl = buf.readUInt16LE(off + 26);
    const lel = buf.readUInt16LE(off + 28);
    const body = buf.slice(off + 30 + lnl + lel, off + 30 + lnl + lel + csize);
    const data = method === 8 ? inflateRawSync(body) : body;
    assert.equal(crc32(data), crc, name + ' crc');
    out.push({ name, method, mode, data });
    p += 46 + nlen + elen + clen;
  }
  return out;
}

test('zip + ข้อความมีอะไรใหม่: crc32 ถูก · ไฟล์เล็กที่บีบไม่ลงเก็บแบบไม่บีบ · โน้ตเอาเฉพาะรุ่นล่าสุด', () => {
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
  const z = readZip(makeZip([{ name: 'a.txt', data: Buffer.from('x') }]));
  assert.equal(z[0].method, 0);
  assert.equal(z[0].data.toString(), 'x');
  assert.deepEqual(latestNotes('## 2.0.0\n\n- หนึ่ง\n* สอง\n\n## 1.0.0\n- เก่า', '2.0.0'), ['หนึ่ง', 'สอง']);
  assert.deepEqual(latestNotes('## 1.0.0\n- เก่า', '2.0.0'), []);
});

test('ปลั๊กอินจริง: รุ่นใน update.json ตรงกับแผง · มีโน้ตรุ่นนี้ · แผงต่อปุ่มอัปเดตครบ · เซิร์ฟเวอร์เปิดเส้นทาง /nesting-cut', () => {
  const idx = pluginIndex(new URL('../adobe/nesting-cut', import.meta.url).pathname);
  const main = readFileSync(new URL('../adobe/nesting-cut/illustrator/main.js', import.meta.url), 'utf8');
  assert.ok(main.includes("var PANEL_VERSION = '" + idx.version + "'"), 'PANEL_VERSION = ' + idx.version);
  assert.ok(idx.notes.length > 0, 'CHANGELOG.md มีหัวข้อ ## ' + idx.version);
  assert.ok(idx.files.some((f) => f.path === 'illustrator/main.js'));
  assert.ok(!idx.files.some((f) => f.path.startsWith('.') || f.path.includes('/.')));
  assert.match(main, /var UPDATE_URL = 'https:\/\/muang-jod-flex-bot\.onrender\.com\/nesting-cut';/);
  assert.match(main, /function doUpdate\(\)/);
  assert.match(main, /host\.writeText\(dir \+ '\/update-state\.json'/);
  const bridge = readFileSync(new URL('../adobe/nesting-cut/illustrator/host-bridge.js', import.meta.url), 'utf8');
  assert.match(bridge, /reloadHost: function \(\)/);
  const html = readFileSync(new URL('../adobe/nesting-cut/illustrator.html', import.meta.url), 'utf8');
  for (const id of ['updBar', 'btnUpdGo', 'btnUpdLater', 'btnUpdCheck', 'guideVer']) assert.match(html, new RegExp('id="' + id + '"'), id);
  assert.ok(html.indexOf('core/update.js') > 0 && html.indexOf('core/update.js') < html.indexOf('illustrator/main.js'));
  const server = readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
  assert.match(server, /app\.use\('\/nesting-cut', nestingCutRouter\);/);
});
