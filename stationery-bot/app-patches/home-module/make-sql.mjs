// สร้าง apply.sql / reverse.sql ของโมดูล "ภาพรวม" (overview) จาก overview.module.js · รันซ้ำได้ ผลเหมือนเดิมทุกครั้ง
//   node app-patches/home-module/make-sql.mjs
// apply: เพิ่มแถวโมดูลแบบปิดไว้ (ทำซ้ำได้) · reverse: ลบเฉพาะเมื่อโค้ดในระบบยังตรงกับ md5 ของรุ่นที่สร้างไฟล์นี้
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const NAME = 'overview';
export const SEQ = 66;
const TAG = 'ov'; // dollar-quote tag: $ov$ … $ov$

export function buildSql(code) {
  if (code.includes(`$${TAG}$`)) throw new Error('the module code contains the dollar-quote tag');
  const md5 = createHash('md5').update(code).digest('hex');
  const apply = `-- NATTA GROUP · ติดตั้งโมดูล "ภาพรวม" (overview) แบบปิดไว้ · สร้างจาก make-sql.mjs (อย่าแก้มือ)
-- ต้องรัน db/migrations/002_home_summary.sql ก่อน (โมดูลนี้เรียกฟังก์ชัน home_summary)
insert into app_modules (name, code, seq, enabled)
select '${NAME}', $${TAG}$${code}$${TAG}$, ${SEQ}, false
where not exists (select 1 from app_modules where name = '${NAME}');
`;
  const reverse = `-- ถอดโมดูล "ภาพรวม": ลบแถวเฉพาะเมื่อโค้ดยังเป็นรุ่นที่ติดตั้ง (md5 ${md5}) · ถ้ามีคนแก้โค้ดแล้ว จะไม่ลบและแจ้งเตือน
do $$
begin
  if (select md5(code) from app_modules where name = '${NAME}') = '${md5}' then
    delete from app_modules where name = '${NAME}';
  else
    raise notice 'overview: โค้ดในระบบไม่ตรงกับรุ่นที่ติดตั้ง — ไม่ลบ';
  end if;
end $$;
`;
  return { md5, apply, reverse };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = fileURLToPath(new URL('.', import.meta.url));
  const { md5, apply, reverse } = buildSql(readFileSync(dir + 'overview.module.js', 'utf8'));
  writeFileSync(dir + 'apply.sql', apply);
  writeFileSync(dir + 'reverse.sql', reverse);
  console.log('overview module md5', md5);
}
