-- ถอดโมดูล "ภาพรวม": ลบแถวเฉพาะเมื่อโค้ดยังเป็นรุ่นที่ติดตั้ง (md5 454fcd6ba756030b50538aa0093250b4) · ถ้ามีคนแก้โค้ดแล้ว จะไม่ลบและแจ้งเตือน
do $$
begin
  if (select md5(code) from app_modules where name = 'overview') = '454fcd6ba756030b50538aa0093250b4' then
    delete from app_modules where name = 'overview';
  else
    raise notice 'overview: โค้ดในระบบไม่ตรงกับรุ่นที่ติดตั้ง — ไม่ลบ';
  end if;
end $$;
