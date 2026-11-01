# ฟังก์ชัน Supabase `line-richmenu` (เวอร์ชัน 5 · 1 พ.ย. 2569)

ตั้งริชเมนูของ LINE OA "นัฐภรณ์ เชียงกลาง" จากฐานข้อมูล — โค้ดจริงอยู่ที่ Supabase (โปรเจกต์ `mamlmgixovlwnjstetkj`, `verify_jwt: false`)
ไฟล์ `index.ts` นี้คือสำเนาของที่ deploy อยู่ เก็บไว้ให้ตรวจ/สร้างใหม่ได้

- เรียกได้เฉพาะที่ส่ง `key` ตรงกับ `app_secrets.push_hook_key` · token ของ LINE (`app_secrets.line_channel_token`) อ่านในฟังก์ชันเท่านั้น ไม่เคยถูกส่งออก
- วิธีเรียกจาก SQL โดยไม่แสดงคีย์: `select net.http_post(url := '<…>/functions/v1/line-richmenu', body := jsonb_build_object('action','status','key',(select btrim(value) from public.app_secrets where key='push_hook_key')))` แล้วอ่านผลจาก `net._http_response`

| action | ทำอะไร |
|---|---|
| `status` | รายการเมนูทั้งหมดใน OA + เมนูที่ทุกคนเห็นอยู่ (อ่านอย่างเดียว) |
| `webhook` | ที่อยู่ webhook ของ OA + ข้อมูลบัญชี · `test:true` = ให้ LINE ลองยิงไปที่ webhook (events ว่าง ไม่มีข้อความถึงลูกค้า) (อ่านอย่างเดียว) |
| `fetch_check` + `image_url` | ดึงรูปจาก `https://nattagroup-y.onrender.com/assets/…` แล้วบอกขนาด/SHA-256 (ไม่แตะ LINE) |
| `apply` (+ `image_url` + `sha`) | สร้างเมนูใหม่ → อัปโหลดรูป → ตั้งเป็นเมนูของทุกคน · มี `image_url` = เมนู v2 (3 ช่อง 2500×843) · ไม่มี = เมนู v1 กับรูปใน DB · คืน `prev` = เมนูที่ใช้อยู่ก่อนหน้า |
| `on` + `id` | ตั้งเมนูที่มีอยู่แล้วให้เป็นของทุกคน (ใช้ย้อนกลับ) |
| `off` | เลิกแสดงเมนูของทุกคน (ตัวเมนูยังอยู่) |
| `check` | ตรวจรูป v1 ที่เก็บใน `app_config.rm_menu_img` |

เมนูที่มีใน LINE ตอนเขียนไฟล์นี้: v1 `richmenu-f892d58d34f03a46834606e132c1a3dd` (เมนูเดิม 3 ช่อง) · v2 `richmenu-c8a467b300a8cbc4320ad63fdf467d7f` (เมนูที่ใช้อยู่ — 3 ช่องตามที่เจ้าของสั่ง)
