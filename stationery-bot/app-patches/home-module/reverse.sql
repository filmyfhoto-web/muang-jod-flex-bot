-- ถอดโมดูล "ภาพรวม": ลบแถวเฉพาะเมื่อโค้ดยังเป็นรุ่นที่ติดตั้ง (md5 5bdd32c65aee0126d3e8b4c81801a5d9) · ถ้ามีคนแก้โค้ดแล้ว จะไม่ลบและแจ้งเตือน
do $$
begin
  if (select md5(code) from app_modules where name = 'overview') = '5bdd32c65aee0126d3e8b4c81801a5d9' then
    delete from app_modules where name = 'overview';
  else
    raise notice 'overview: โค้ดในระบบไม่ตรงกับรุ่นที่ติดตั้ง — ไม่ลบ';
  end if;
end $$;
