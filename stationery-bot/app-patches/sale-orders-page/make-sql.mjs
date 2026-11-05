// Writes the SQL that puts the back-office page "แชตและออเดอร์" (module saleorders, table app_modules) in place.
// Run: node app-patches/sale-orders-page/make-sql.mjs   (from stationery-bot/)
//   saleorders.module.js      the current version (v7: a link in a LINE message opens)
//   saleorders.module.v6.js   the version on the live back office since the bot's answers show in the chat (md5 b78b1655…)
//   saleorders.module.v5.js   the version on the live back office since the payment status "ลงบัญชี" (md5 6bdd44fa…)
//   saleorders.module.v4.js   the version on the live back office since the customer accounts and order cards (md5 144675be…)
//   saleorders.module.v3.js   the version on the live back office before v4, since the LINE bridge (md5 9f5e3e41…)
//   saleorders.module.v2.js   the version on the live back office since 4 Nov 2569 before v3 (md5 021d0e36…)
//   saleorders.module.v1.js   the version installed on 4 Nov 2569 before the LINE version (md5 9559832b…)
// apply.sql             installs the current version DISABLED, only when the module is not there yet
// upgrade.sql           v2 → v3: replaces the stored code only while it is exactly v2 (md5); enabled and seq stay
// downgrade.sql         v3 → v2: puts v2 back only while the stored code is exactly v3 (md5)
// upgrade-v3-to-v4.sql  v3 → v4 (the step run on the live back office) · downgrade-v4-to-v3.sql v4 → v3
// upgrade-v4-to-v5.sql  v4 → v5 · downgrade-v5-to-v4.sql v5 → v4 (each only while the stored code is exactly the version it expects)
// upgrade-v5-to-v6.sql  v5 → v6 (the step run on the live back office) · downgrade-v6-to-v5.sql v6 → v5
// upgrade-v6-to-v7.sql  v6 → v7 · downgrade-v7-to-v6.sql v7 → v6
// upgrade-v3-to-v4.sql, upgrade-v4-to-v5.sql and upgrade-v5-to-v6.sql are the steps that ran on production: their bytes must not change (the tests check them)
// reverse.sql           removes the module while its code is v1, v2, v3, v4, v5, v6 or v7 (md5); an edited page is never removed
// upgrade-v1-to-v2.sql  the step run on 4 Nov 2569 — written once and frozen (this script does not regenerate it)
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DIR = fileURLToPath(new URL('.', import.meta.url));
const TAG = '$so$'; // the dollar quote; no version of the code may contain it
const SEQ = 66; // ข้าง ๆ salechat (66) — หน้าเดิมยังอยู่ จนกว่าเจ้าของจะสั่งปิด

export const md5Of = (text) => createHash('md5').update(text, 'utf8').digest('hex');

// code = the current version (v7) · v6 / v5 / v4 / v3 / v2 / v1 = the earlier versions (optional). Returns every script as text.
export function buildSql(code, { v6 = null, v5 = null, v4 = null, v3 = null, v2 = null, v1 = null } = {}) {
  for (const [name, text] of [['module code', code], ['v6', v6], ['v5', v5], ['v4', v4], ['v3', v3], ['v2', v2], ['v1', v1]]) {
    if (text && text.includes(TAG)) throw new Error(`the ${name} contains ${TAG}; pick another tag`);
  }
  const md5 = md5Of(code);
  const md5v6 = v6 ? md5Of(v6) : null;
  const md5v5 = v5 ? md5Of(v5) : null;
  const md5v4 = v4 ? md5Of(v4) : null;
  const md5v3 = v3 ? md5Of(v3) : null;
  const md5v2 = v2 ? md5Of(v2) : null;
  const md5v1 = v1 ? md5Of(v1) : null;
  const known = [md5, md5v6, md5v5, md5v4, md5v3, md5v2, md5v1].filter(Boolean).map((x) => `'${x}'`).join(', ');

  const apply = `-- ติดตั้งหน้า "แชตและออเดอร์" (โมดูล saleorders) ในแอปหลังร้าน: แถวใหม่ในตาราง app_modules เท่านั้น
-- · ไม่แก้โมดูลเดิมแม้แต่บรรทัดเดียว · ติดตั้งซ้ำได้ (ถ้ามีแถวนี้อยู่แล้วจะไม่ทำอะไร — ถ้าเป็นรุ่นเก่าให้ใช้ upgrade-v6-to-v7.sql (หรือ upgrade-v5-to-v6.sql / upgrade-v4-to-v5.sql / upgrade-v3-to-v4.sql ตามรุ่นที่ติดตั้งอยู่))
-- · ติดตั้งแบบปิดไว้ (enabled = false): เปิดหลังตรวจแล้วด้วย update app_modules set enabled = true where name = 'saleorders';
-- · ต้องติดตั้ง migration db/migrations/002_sale_orders.sql ก่อน (หน้านี้เรียก sale_order_save / sale_order_log_send)
-- · ส่วน LINE ใช้ได้ต่อเมื่อติดตั้ง db/migrations/003_sale_line_bridge.sql และเปิดสะพานที่บอท — ถ้ายังไม่ติดตั้ง หน้าแสดง "LINE OA: ยังไม่ได้เชื่อมต่อ"
-- · ลูกค้าลงบัญชี การ์ด และสถานะ "ลงบัญชี" ต้องติดตั้ง db/migrations/004_sale_order_cards.sql และ 005_sale_order_account.sql ด้วย
-- · ย้อนกลับ: reverse.sql
-- md5 ของโค้ดที่ติดตั้ง: ${md5}
do $do$
begin
  if exists (select 1 from app_modules where name = 'saleorders') then
    raise notice 'saleorders: already installed, nothing changed';
    return;
  end if;
  insert into app_modules (name, code, seq, enabled)
  values ('saleorders', ${TAG}${code}${TAG}, ${SEQ}, false);
  raise notice 'saleorders: installed, disabled (enable it after checking)';
end
$do$;
`;

  const reverse = `-- ย้อนกลับ apply.sql: ลบแถว saleorders ออกจาก app_modules · ลบเฉพาะเมื่อโค้ดยังเป็นรุ่นที่รู้จัก (md5 ${[md5, md5v6, md5v5, md5v4, md5v3, md5v2, md5v1].filter(Boolean).join(' · ')})
-- ถ้ามีคนแก้โค้ดหลังติดตั้ง จะไม่ลบและแจ้งเตือน (ให้ตรวจก่อนว่าจะลบหรือไม่)
do $do$
declare c text;
begin
  select code into c from app_modules where name = 'saleorders';
  if c is null then
    raise notice 'saleorders: not installed, nothing to remove';
    return;
  end if;
  if md5(c) not in (${known}) then
    raise exception 'saleorders: the code was changed after it was installed; not removed';
  end if;
  delete from app_modules where name = 'saleorders';
  raise notice 'saleorders: removed';
end
$do$;
`;

  const out = { md5, md5v6, md5v5, md5v4, md5v3, md5v2, md5v1, apply, reverse };
  if (v6) {
    out.upgrade67 = replaceScript({
      note: 'อัปเกรดหน้าเป็นรุ่น 7: ลิงก์ (http/https) ในข้อความจาก LINE กดเปิดได้ในแท็บใหม่',
      from: { label: 'v6', md5: md5v6 },
      to: { label: 'v7', md5, code },
    });
    out.downgrade76 = replaceScript({
      note: `ย้อนหน้า v7 กลับเป็น v6 ตรงทุกไบต์ (md5 ${md5v6})`,
      from: { label: 'v7', md5 },
      to: { label: 'v6', md5: md5v6, code: v6 },
    });
  }
  // each step names its own two files, so adding a version never changes the steps already run on production
  if (v5 && v6) {
    out.upgrade56 = replaceScript({
      note: 'อัปเกรดหน้าเป็นรุ่น 6: คำตอบของบอทแสดงในแชตด้วย · หมายเหตุหัวแชตบอกว่าคำตอบที่พิมพ์ใน LINE OA Manager ไม่แสดง',
      from: { label: 'v5', md5: md5v5 },
      to: { label: 'v6', md5: md5v6, code: v6 },
    });
    out.downgrade65 = replaceScript({
      note: `ย้อนหน้า v6 กลับเป็น v5 ตรงทุกไบต์ (md5 ${md5v5})`,
      from: { label: 'v6', md5: md5v6 },
      to: { label: 'v5', md5: md5v5, code: v5 },
    });
  }
  // each step names its own two files, so adding a version never changes the steps already run on production
  if (v4 && v5) {
    out.upgrade45 = replaceScript({
      note: 'อัปเกรดหน้าเป็นรุ่น 5: สถานะการชำระ "ลงบัญชี" (ลูกค้าชำระทีหลัง)',
      from: { label: 'v4', md5: md5v4 },
      to: { label: 'v5', md5: md5v5, code: v5 },
    });
    out.downgrade54 = replaceScript({
      note: `ย้อนหน้า v5 กลับเป็น v4 ตรงทุกไบต์ (md5 ${md5v4})`,
      from: { label: 'v5', md5: md5v5 },
      to: { label: 'v4', md5: md5v4, code: v4 },
    });
  }
  if (v3 && v4) {
    out.upgrade34 = replaceScript({
      note: 'อัปเกรดหน้าเป็นรุ่น 4: เมนูกระชับ (ช่องที่ใช้ไม่บ่อยไว้ใต้ "เพิ่มเติม") · ลูกค้าลงบัญชีอัตโนมัติ · การ์ดคำสั่งงานให้ลูกค้าและทีมงาน',
      from: { label: 'v3', md5: md5v3 },
      to: { label: 'v4', md5: md5v4, code: v4 },
    });
    out.downgrade43 = replaceScript({
      note: `ย้อนหน้า v4 กลับเป็น v3 ตรงทุกไบต์ (md5 ${md5v3})`,
      from: { label: 'v4', md5: md5v4 },
      to: { label: 'v3', md5: md5v3, code: v3 },
    });
  }
  if (v2 && v3) {
    out.upgrade = replaceScript({
      note: 'อัปเกรดหน้า v2 (รุ่นบนหลังร้านตั้งแต่ 4 พ.ย.) เป็น v3 (รีเฟรชทุก 2 วินาที พร้อมสะพาน LINE)',
      from: { label: 'v2', md5: md5v2 },
      to: { label: 'v3', md5: md5v3, code: v3 },
    });
    out.downgrade = replaceScript({
      note: `ย้อนหน้า v3 กลับเป็น v2 ตรงทุกไบต์ (md5 ${md5v2})`,
      from: { label: 'v3', md5: md5v3 },
      to: { label: 'v2', md5: md5v2, code: v2 },
    });
  }
  return out;
}

// the same shape for an upgrade and for a downgrade: the stored code must be exactly `from`, and then it becomes `to`
function replaceScript({ note, from, to }) {
  return `-- ${note}
-- · เปลี่ยนเฉพาะคอลัมน์ code (กับ updated_at) ของแถว saleorders · enabled และ seq ไม่เปลี่ยน · โมดูลอื่นไม่ถูกแตะ
-- · ทำเฉพาะเมื่อโค้ดที่เก็บอยู่ตรงกับ ${from.label} ทุกไบต์ (md5 ${from.md5}) — ถ้ามีคนแก้ไว้ จะไม่ทับและแจ้งเตือน · รันซ้ำได้
do $do$
declare c text;
begin
  select code into c from app_modules where name = 'saleorders';
  if c is null then
    raise exception 'saleorders: not installed; use apply.sql';
  end if;
  if md5(c) = '${to.md5}' then
    raise notice 'saleorders: already ${to.label}, nothing changed';
    return;
  end if;
  if md5(c) <> '${from.md5}' then
    raise exception 'saleorders: the stored code is neither ${from.label} nor ${to.label} (it was changed); not overwritten';
  end if;
  update app_modules set code = ${TAG}${to.code}${TAG}, updated_at = now() where name = 'saleorders';
  raise notice 'saleorders: now ${to.label} (enabled and seq unchanged)';
end
$do$;
`;
}

// the command line: writes the scripts next to this file (upgrade-v1-to-v2.sql is the frozen record and is not written here)
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = (name) => (existsSync(DIR + name) ? readFileSync(DIR + name, 'utf8') : null);
  const b = buildSql(file('saleorders.module.js'), {
    v6: file('saleorders.module.v6.js'),
    v5: file('saleorders.module.v5.js'),
    v4: file('saleorders.module.v4.js'),
    v3: file('saleorders.module.v3.js'),
    v2: file('saleorders.module.v2.js'),
    v1: file('saleorders.module.v1.js'),
  });
  writeFileSync(DIR + 'apply.sql', b.apply);
  writeFileSync(DIR + 'reverse.sql', b.reverse);
  writeFileSync(DIR + 'upgrade.sql', b.upgrade);
  writeFileSync(DIR + 'downgrade.sql', b.downgrade);
  writeFileSync(DIR + 'upgrade-v3-to-v4.sql', b.upgrade34);
  writeFileSync(DIR + 'downgrade-v4-to-v3.sql', b.downgrade43);
  writeFileSync(DIR + 'upgrade-v4-to-v5.sql', b.upgrade45);
  writeFileSync(DIR + 'downgrade-v5-to-v4.sql', b.downgrade54);
  writeFileSync(DIR + 'upgrade-v5-to-v6.sql', b.upgrade56);
  writeFileSync(DIR + 'downgrade-v6-to-v5.sql', b.downgrade65);
  writeFileSync(DIR + 'upgrade-v6-to-v7.sql', b.upgrade67);
  writeFileSync(DIR + 'downgrade-v7-to-v6.sql', b.downgrade76);
  console.log(`wrote the scripts (current md5 ${b.md5}; v6 ${b.md5v6}; v5 ${b.md5v5}; v4 ${b.md5v4}; v3 ${b.md5v3}; v2 ${b.md5v2}; v1 ${b.md5v1})`);
}
