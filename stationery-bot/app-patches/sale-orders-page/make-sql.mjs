// Writes the SQL that puts the back-office page "แชตและออเดอร์" (module saleorders, table app_modules) in place.
// Run: node app-patches/sale-orders-page/make-sql.mjs   (from stationery-bot/)
//   saleorders.module.js      the current version (v3: refreshes every 2 seconds, ready for the LINE bridge)
//   saleorders.module.v2.js   the version on the live back office since 4 Nov 2569 (md5 021d0e36…)
//   saleorders.module.v1.js   the version installed on 4 Nov 2569 before the LINE version (md5 9559832b…)
// apply.sql             installs the current version DISABLED, only when the module is not there yet
// upgrade.sql           v2 → v3: replaces the stored code only while it is exactly v2 (md5); enabled and seq stay
// downgrade.sql         v3 → v2: puts v2 back only while the stored code is exactly v3 (md5)
// reverse.sql           removes the module while its code is v1, v2 or v3 (md5); an edited page is never removed
// upgrade-v1-to-v2.sql  the step run on 4 Nov 2569 — written once and frozen (this script does not regenerate it)
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DIR = fileURLToPath(new URL('.', import.meta.url));
const TAG = '$so$'; // the dollar quote; no version of the code may contain it
const SEQ = 66; // ข้าง ๆ salechat (66) — หน้าเดิมยังอยู่ จนกว่าเจ้าของจะสั่งปิด

export const md5Of = (text) => createHash('md5').update(text, 'utf8').digest('hex');

// code = the current version · v2 / v1 = the earlier versions (optional). Returns every script as text.
export function buildSql(code, { v2 = null, v1 = null } = {}) {
  for (const [name, text] of [['module code', code], ['v2', v2], ['v1', v1]]) {
    if (text && text.includes(TAG)) throw new Error(`the ${name} contains ${TAG}; pick another tag`);
  }
  const md5 = md5Of(code);
  const md5v2 = v2 ? md5Of(v2) : null;
  const md5v1 = v1 ? md5Of(v1) : null;
  const known = [md5, md5v2, md5v1].filter(Boolean).map((x) => `'${x}'`).join(', ');

  const apply = `-- ติดตั้งหน้า "แชตและออเดอร์" (โมดูล saleorders) ในแอปหลังร้าน: แถวใหม่ในตาราง app_modules เท่านั้น
-- · ไม่แก้โมดูลเดิมแม้แต่บรรทัดเดียว · ติดตั้งซ้ำได้ (ถ้ามีแถวนี้อยู่แล้วจะไม่ทำอะไร — ถ้าเป็นรุ่นเก่าให้ใช้ upgrade.sql)
-- · ติดตั้งแบบปิดไว้ (enabled = false): เปิดหลังตรวจแล้วด้วย update app_modules set enabled = true where name = 'saleorders';
-- · ต้องติดตั้ง migration db/migrations/002_sale_orders.sql ก่อน (หน้านี้เรียก sale_order_save / sale_order_log_send)
-- · ส่วน LINE ใช้ได้ต่อเมื่อติดตั้ง db/migrations/003_sale_line_bridge.sql และเปิดสะพานที่บอท — ถ้ายังไม่ติดตั้ง หน้าแสดง "LINE OA: ยังไม่ได้เชื่อมต่อ"
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

  const reverse = `-- ย้อนกลับ apply.sql: ลบแถว saleorders ออกจาก app_modules · ลบเฉพาะเมื่อโค้ดยังเป็นรุ่นที่รู้จัก (md5 ${[md5, md5v2, md5v1].filter(Boolean).join(' · ')})
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

  const out = { md5, md5v2, md5v1, apply, reverse };
  if (v2) {
    out.upgrade = replaceScript({
      note: 'อัปเกรดหน้า v2 (รุ่นบนหลังร้านตั้งแต่ 4 พ.ย.) เป็น v3 (รีเฟรชทุก 2 วินาที พร้อมสะพาน LINE)',
      from: { label: 'v2', md5: md5v2 },
      to: { label: 'v3', md5, code },
    });
    out.downgrade = replaceScript({
      note: `ย้อนหน้า v3 กลับเป็น v2 ตรงทุกไบต์ (md5 ${md5v2})`,
      from: { label: 'v3', md5 },
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
  const b = buildSql(file('saleorders.module.js'), { v2: file('saleorders.module.v2.js'), v1: file('saleorders.module.v1.js') });
  writeFileSync(DIR + 'apply.sql', b.apply);
  writeFileSync(DIR + 'reverse.sql', b.reverse);
  writeFileSync(DIR + 'upgrade.sql', b.upgrade);
  writeFileSync(DIR + 'downgrade.sql', b.downgrade);
  console.log(`wrote apply.sql, reverse.sql, upgrade.sql and downgrade.sql (current md5 ${b.md5}; v2 ${b.md5v2}; v1 ${b.md5v1})`);
}
