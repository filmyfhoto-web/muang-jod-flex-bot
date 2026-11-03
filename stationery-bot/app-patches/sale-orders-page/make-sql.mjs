// Writes apply.sql and reverse.sql for the back-office module "saleorders" (table app_modules) from saleorders.module.js.
// Run: node app-patches/sale-orders-page/make-sql.mjs   (from stationery-bot/)
// apply.sql inserts the module DISABLED and only when it is not there yet; reverse.sql removes it only while its code is the one
// installed here (md5 check), so a later edit by anyone is never deleted by accident.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DIR = fileURLToPath(new URL('.', import.meta.url));
const TAG = '$so$'; // the dollar quote; the code must not contain it
const SEQ = 66; // ข้าง ๆ salechat (66) — หน้าเดิมยังอยู่ จนกว่าเจ้าของจะสั่งปิด

export function buildSql(code) {
  if (code.includes(TAG)) throw new Error(`the module code contains ${TAG}; pick another tag`);
  const md5 = createHash('md5').update(code, 'utf8').digest('hex');
  const apply = `-- ติดตั้งหน้า "แชตและออเดอร์" (โมดูล saleorders) ในแอปหลังร้าน: แถวใหม่ในตาราง app_modules เท่านั้น
-- · ไม่แก้โมดูลเดิมแม้แต่บรรทัดเดียว · ติดตั้งซ้ำได้ (ถ้ามีแถวนี้อยู่แล้วจะไม่ทำอะไร)
-- · ติดตั้งแบบปิดไว้ (enabled = false): เปิดหลังตรวจแล้วด้วย update app_modules set enabled = true where name = 'saleorders';
-- · ต้องติดตั้ง migration db/migrations/002_sale_orders.sql ก่อน (หน้านี้เรียก sale_order_save / sale_order_log_send)
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
  const reverse = `-- ย้อนกลับ apply.sql: ลบแถว saleorders ออกจาก app_modules · ลบเฉพาะเมื่อโค้ดยังเป็นรุ่นที่ติดตั้ง (md5 ${md5})
-- ถ้ามีคนแก้โค้ดหลังติดตั้ง จะไม่ลบและแจ้งเตือน (ให้ตรวจก่อนว่าจะลบหรือไม่)
do $do$
declare c text;
begin
  select code into c from app_modules where name = 'saleorders';
  if c is null then
    raise notice 'saleorders: not installed, nothing to remove';
    return;
  end if;
  if md5(c) <> '${md5}' then
    raise exception 'saleorders: the code was changed after it was installed; not removed';
  end if;
  delete from app_modules where name = 'saleorders';
  raise notice 'saleorders: removed';
end
$do$;
`;
  return { md5, apply, reverse };
}

// the command line: write both files next to this script
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const code = readFileSync(DIR + 'saleorders.module.js', 'utf8');
  const { md5, apply, reverse } = buildSql(code);
  writeFileSync(DIR + 'apply.sql', apply);
  writeFileSync(DIR + 'reverse.sql', reverse);
  console.log(`wrote apply.sql and reverse.sql (module md5 ${md5}, ${code.length} characters)`);
}
