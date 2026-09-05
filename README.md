# ม่วงจดให้ — LINE Flex Card + LIFF (TEST)

ชุดโค้ดใหม่ที่แก้จุดเสียของไฟล์เดิม และสร้างการ์ดแบบตัวอย่างให้กดใช้งานได้จริงในโหมดจำลอง โดย **ไม่เขียนทับไฟล์เดิม ไม่ส่ง LINE จริง และไม่แตะ Supabase จริง**

## เปิดดูทันที

ต้องมี Node.js 20 ขึ้นไป และไม่ต้องติดตั้งแพ็กเกจเพิ่มเติม

```bash
cp .env.example .env
set -a; . ./.env; set +a
npm start
```

เปิด `http://localhost:3000` แล้วลองข้อความ:

```text
งานวันนี้ ป้ายไวนิล 60*100 150 บาท โฟมบอร์ด 40*60 250 บาท
```

ระบบจะอ่านเป็น 2 รายการ ราคา 150 และ 250 บาท โดยเก็บ `60*100` และ `40*60` ไว้ในรายละเอียด

## หน้าที่มีแล้ว

- `/` ห้องแชต TEST + การ์ดยืนยัน + Rich Menu จำลอง
- `/edit?t=...` แก้ไขและยกเลิกรายการ
- `/transactions` รายการล่าสุด
- `/summary` สรุปวันนี้/เดือนนี้และยอดตามหมวด
- `/categories` ดูหมวดที่ใช้งาน
- `/webhook/line` LINE Messaging API webhook
- `/health` ตรวจสุขภาพเซิร์ฟเวอร์

## เชื่อม LINE ภายหลัง

1. Deploy ด้วย HTTPS และตั้ง `PUBLIC_BASE_URL`
2. ตั้ง Messaging API Webhook เป็น `https://โดเมน/webhook/line`
3. สร้าง LINE Login channel + LIFF app โดยใช้ endpoint URL เป็นโดเมนเดียวกัน
4. ใส่ค่า `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_LOGIN_CHANNEL_ID`, `LINE_LIFF_ID`
5. เปลี่ยน `DEMO_MODE=false`
6. ทดสอบ Webhook และ LIFF ด้วยบัญชีทดสอบก่อนอัปโหลด Rich Menu

ระบบตรวจ `x-line-signature` ที่ webhook และตรวจ LIFF ID token ที่ API ทุกครั้ง ปุ่มแก้ไขมีลายเซ็นกำกับ แต่ยังตรวจเจ้าของรายการด้วย LINE user ID ซ้ำอีกชั้น

## เชื่อม Supabase เดิมภายหลัง

ไฟล์ `supabase/schema-preview.sql` เป็นเพียงแบบร่างสำหรับตรวจ ไม่ได้รันอัตโนมัติ ตารางทั้งหมดขึ้นต้น `mj_*` และเปิด RLS โดยไม่ให้ browser เรียกตรง ๆ

ใช้ `SUPABASE_SECRET_KEY` เฉพาะฝั่ง server ห้ามใส่ใน HTML หรือค่าที่ขึ้นต้น `NEXT_PUBLIC_` เมื่อย้ายไป Next.js

## ทดสอบ

```bash
npm test
npm run check
```

ดูผลการทดลองและรายการที่ยังไม่เปิดใช้ใน `docs/PREFLIGHT_REPORT.md`
