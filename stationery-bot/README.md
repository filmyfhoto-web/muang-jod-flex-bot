# stationery-bot

บอท LINE OA ช่วยตอบลูกค้าร้านเครื่องเขียน (แยกจากบอท "ม่วงจดให้" ที่อยู่โฟลเดอร์ด้านนอก ไม่ใช้โค้ดร่วมกัน)

ตอบจากข้อมูลที่ร้านกรอกเองใน `data/shop.json` — ไม่ใช้ AI:

- **สินค้า** พิมพ์ชื่อ/ชื่อเรียก → บอกราคา ราคายกจำนวนมาก และมี/หมดสต็อก
- **คำถามทั่วไป (FAQ)** เวลาเปิด ที่ตั้ง จัดส่ง ชำระเงิน โปร ใบเสร็จ — จับจากคำสำคัญ
- **รอ 90 วินาทีก่อนตอบข้อความพิมพ์เอง** (ปุ่มเมนูตอบทันที) ตั้งที่ `replyDelaySeconds` (0 = ตอบทันที) ถ้า token ตอบกลับหมดอายุ บอทส่งแบบ push แทน (นับโควตาข้อความ)
- **ช่วยรับงาน** ข้อความที่ไม่มีคำตอบสำเร็จรูป (และรูป/สลิป) บอทขอรายละเอียดงาน 1 ครั้ง ขอบคุณ 1 ครั้ง แล้วเงียบให้แอดมินตอบ ครบ 20 นาทีไม่มีข้อความ เริ่มรอบใหม่ (`intake` ใน `data/shop.json`)
- ปิดบอทชั่วคราว: `"paused": true` หรือแอดมินพิมพ์ "ปิดบอท" (ดู `ADMIN_USER_IDS`) ระหว่างรอ 90 วินาที จะยกเลิกคำตอบที่ค้างอยู่
- หัวข้อที่ยังไม่มีข้อมูลจริง ปิดไว้ด้วย `"enabled": false` (FAQ) / `"productsEnabled": false` (สินค้า)
- แก้ `data/shop.json` ได้เลยโดยไม่ต้อง restart

## รัน
```bash
cp .env.example .env   # ใส่ LINE_CHANNEL_ACCESS_TOKEN / LINE_CHANNEL_SECRET
npm install
node --env-file=.env src/server.js
npm test
```
ตั้ง Webhook URL ใน LINE Developers เป็น `https://<โดเมน>/webhook` (ปิด "Auto-reply messages" ใน OA Manager)

## แก้ข้อมูลร้าน (`data/shop.json`)
- `products[]`: `name`, `aliases` (คำที่ลูกค้าใช้เรียก), `price`, `unit`, `bulk` (ไม่บังคับ), `inStock`
- `faq[]`: `keywords` (ลูกค้าพิมพ์คำใดคำหนึ่งก็ตรง), `label`, `answer`
- `greeting`, `fallback`, `handoff`, `quickReplies`
ข้อมูลในไฟล์เป็นตัวอย่าง ต้องแก้เป็นของร้านจริงก่อนใช้งาน
