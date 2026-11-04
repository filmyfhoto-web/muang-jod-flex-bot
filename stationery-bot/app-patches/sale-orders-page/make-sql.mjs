// Writes apply.sql, reverse.sql, upgrade.sql and downgrade.sql for the back-office module "saleorders" (table app_modules) from the module files.
// Run: node app-patches/sale-orders-page/make-sql.mjs   (from stationery-bot/)
//   saleorders.module.js      the current version (v2: the page with the LINE bridge; works without it too, showing "ยังไม่ได้เชื่อมต่อ")
//   saleorders.module.v1.js   the version installed in the live back office on 4 Nov 2569 (md5 9559832b…, without LINE) — kept so the
//                             upgrade can be checked against it and the rollback gives back exactly those bytes
// apply.sql      inserts the current version DISABLED and only when the module is not there yet (a fresh install)
// upgrade.sql    replaces the installed v1 by the current version — only if the stored code is exactly v1 (md5); enabled and seq stay as they are
// downgrade.sql  puts v1 back — only if the stored code is exactly the current version (md5)
// reverse.sql    removes the module — only while its code is v1 or the current version (md5), so a later edit by anyone is never deleted by accident
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DIR = fileURLToPath(new URL('.', import.meta.url));
const TAG = '$so$'; // the dollar quote; the code must not contain it
const SEQ = 66; // ข้าง ๆ salechat (66) — หน้าเดิมยังอยู่ จนกว่าเจ้าของจะสั่งปิด
const md5Of = (s) => createHash('md5').update(s, 'utf8').digest('hex');

// code = the current version · previous = the version installed before it (optional: without it only apply/reverse are made)
export function buildSql(code, previous = null) {
  if (code.includes(TAG)) throw new Error(`the module code contains ${TAG}; pick another tag`);
  if (previous && previous.includes(TAG)) throw new Error(`the previous module code contains ${TAG}; pick another tag`);
  const md5 = md5Of(code);
  const prevMd5 = previous ? md5Of(previous) : null;
  const apply = `-- ติดตั้งหน้า "แชตและออเดอร์" (โมดูล saleorders) ในแอปหลังร้าน: แถวใหม่ในตาราง app_modules เท่านั้น
-- · ไม่แก้โมดูลเดิมแม้แต่บรรทัดเดียว · ติดตั้งซ้ำได้ (ถ้ามีแถวนี้อยู่แล้วจะไม่ทำอะไร — ถ้าติดตั้งรุ่นเก่าไว้แล้ว ให้ใช้ upgrade.sql)
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
  const known = prevMd5 ? `'${md5}', '${prevMd5}'` : `'${md5}'`;
  const reverse = `-- ย้อนกลับ apply.sql: ลบแถว saleorders ออกจาก app_modules · ลบเฉพาะเมื่อโค้ดยังเป็นรุ่นที่ติดตั้งไว้${prevMd5 ? ` (รุ่นปัจจุบัน md5 ${md5} หรือรุ่นก่อนหน้า md5 ${prevMd5})` : ` (md5 ${md5})`}
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
  let upgrade = null;
  let downgrade = null;
  if (previous) {
    upgrade = `-- อัปเกรดหน้า "แชตและออเดอร์" ที่ติดตั้งไว้แล้ว (รุ่นเดิม md5 ${prevMd5}) เป็นรุ่นที่ต่อ LINE OA ได้ (md5 ${md5})
-- · เปลี่ยนเฉพาะคอลัมน์ code (กับ updated_at) ของแถว saleorders · enabled และ seq ไม่เปลี่ยน · โมดูลอื่นไม่ถูกแตะ
-- · ทำเฉพาะเมื่อโค้ดที่เก็บอยู่ตรงกับรุ่นเดิมทุกไบต์ (md5) — ถ้ามีคนแก้ไว้ จะไม่ทับและแจ้งเตือน · รันซ้ำได้ (ถ้าเป็นรุ่นใหม่แล้วจะไม่ทำอะไร)
-- · หน้ารุ่นใหม่ทำงานได้ทั้งก่อนและหลังติดตั้ง 003_sale_line_bridge.sql (ก่อนติดตั้งแสดง "LINE OA: ยังไม่ได้เชื่อมต่อ" เหมือนเดิม)
-- · ย้อนกลับ: downgrade.sql (ได้โค้ดรุ่นเดิมกลับมาตรงทุกไบต์)
do $do$
declare c text;
begin
  select code into c from app_modules where name = 'saleorders';
  if c is null then
    raise exception 'saleorders: not installed; use apply.sql';
  end if;
  if md5(c) = '${md5}' then
    raise notice 'saleorders: already up to date, nothing changed';
    return;
  end if;
  if md5(c) <> '${prevMd5}' then
    raise exception 'saleorders: the stored code is neither the installed version nor this one (it was changed); not overwritten';
  end if;
  update app_modules set code = ${TAG}${code}${TAG}, updated_at = now() where name = 'saleorders';
  raise notice 'saleorders: upgraded (enabled and seq unchanged)';
end
$do$;
`;
    downgrade = `-- ย้อนกลับ upgrade.sql: เอาโค้ดหน้า "แชตและออเดอร์" รุ่นเดิม (md5 ${prevMd5}) กลับมาแทนรุ่นที่ต่อ LINE (md5 ${md5})
-- · เปลี่ยนเฉพาะคอลัมน์ code (กับ updated_at) ของแถว saleorders · enabled และ seq ไม่เปลี่ยน
-- · ทำเฉพาะเมื่อโค้ดที่เก็บอยู่ตรงกับรุ่นที่ต่อ LINE ทุกไบต์ (md5) — ถ้ามีคนแก้ไว้ จะไม่ทับและแจ้งเตือน · รันซ้ำได้
do $do$
declare c text;
begin
  select code into c from app_modules where name = 'saleorders';
  if c is null then
    raise exception 'saleorders: not installed; nothing to put back';
  end if;
  if md5(c) = '${prevMd5}' then
    raise notice 'saleorders: already the earlier version, nothing changed';
    return;
  end if;
  if md5(c) <> '${md5}' then
    raise exception 'saleorders: the stored code is neither the LINE version nor the earlier one (it was changed); not overwritten';
  end if;
  update app_modules set code = ${TAG}${previous}${TAG}, updated_at = now() where name = 'saleorders';
  raise notice 'saleorders: earlier version put back (enabled and seq unchanged)';
end
$do$;
`;
  }
  return { md5, prevMd5, apply, reverse, upgrade, downgrade };
}

// the command line: write the files next to this script
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const code = readFileSync(DIR + 'saleorders.module.js', 'utf8');
  const previous = existsSync(DIR + 'saleorders.module.v1.js') ? readFileSync(DIR + 'saleorders.module.v1.js', 'utf8') : null;
  const { md5, prevMd5, apply, reverse, upgrade, downgrade } = buildSql(code, previous);
  writeFileSync(DIR + 'apply.sql', apply);
  writeFileSync(DIR + 'reverse.sql', reverse);
  if (upgrade) writeFileSync(DIR + 'upgrade.sql', upgrade);
  if (downgrade) writeFileSync(DIR + 'downgrade.sql', downgrade);
  console.log(`wrote apply.sql, reverse.sql${upgrade ? ', upgrade.sql and downgrade.sql' : ''} (module md5 ${md5}, ${code.length} characters${prevMd5 ? `; earlier version md5 ${prevMd5}` : ''})`);
}
