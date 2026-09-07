# การ Deploy ม่วงจด LINE Bot

บอตเป็น Node.js + Express ธรรมดา ต้องการแค่ **HTTPS public URL** ให้ LINE ยิง webhook เข้ามา
เอกสารนี้เน้นวิธีที่ง่ายที่สุดคือ **Render** และแนบทางเลือก Railway / Google Cloud Run ไว้ท้ายไฟล์

> ⚠️ **ห้าม commit ไฟล์ `.env` หรือ secret ใด ๆ ลง repo** — ใส่ค่าลับผ่านหน้า Environment Variables ของแพลตฟอร์มเท่านั้น

---

## สิ่งที่ต้องมีก่อน

1. Supabase project ที่รัน migration แล้ว (`supabase/migrations/001_initial_schema.sql` และ `002_phase2.sql`)
2. LINE Messaging API channel (มี Channel secret + Channel access token)
3. ค่าเหล่านี้พร้อมกรอก:

| ตัวแปร | ที่มา |
|---|---|
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Developers → Messaging API |
| `LINE_CHANNEL_SECRET` | LINE Developers → Basic settings |
| `SUPABASE_URL` | Supabase → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API (service_role — **ฝั่ง server เท่านั้น**) |
| `MAX_UPLOAD_MB` | ไม่บังคับ (ค่าเริ่มต้น 10) |
| `LOG_LEVEL` | ไม่บังคับ (ค่าเริ่มต้น info) |

`PORT` ไม่ต้องตั้งเอง — แพลตฟอร์มจะกำหนดให้ และเซิร์ฟเวอร์อ่านจาก `process.env.PORT` อยู่แล้ว

---

## วิธีที่ 1 — Render (แนะนำ, มี free tier)

1. Push โค้ดขึ้น GitHub
2. เข้า https://render.com → **New → Web Service** → เชื่อม repo นี้
3. ตั้งค่า:
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free ก็ได้ (แต่จะ sleep เมื่อไม่มีทราฟฟิก — งานจริงแนะนำ Starter)
4. ไปที่แท็บ **Environment** → เพิ่ม env vars ทุกตัวจากตารางด้านบน
5. กด **Create Web Service** รอ build เสร็จ จะได้ URL เช่น
   `https://muang-jod.onrender.com`
6. ทดสอบ health: เปิด `https://muang-jod.onrender.com/health` ต้องได้ `{"status":"ok"}`
7. เอา `https://muang-jod.onrender.com/webhook` ไปใส่ใน
   **LINE Developers → Messaging API → Webhook URL** → **Verify** → เปิด **Use webhook = ON**
8. ปิด **Auto-reply / Greeting** ใน LINE Official Account Manager (กันชนกับบอต)
9. สร้าง Rich Menu: รันในเครื่องครั้งเดียว (ต้องมี `assets/rich-menu.png` 2500×1686 และ token ใน `.env`)
   ```bash
   npm run rich-menu
   ```

---

## วิธีที่ 2 — Railway

1. https://railway.app → **New Project → Deploy from GitHub repo**
2. Railway ตรวจเจอ Node เอง; ตั้ง Start Command เป็น `npm start` ถ้าจำเป็น
3. แท็บ **Variables** → ใส่ env vars ทุกตัว
4. **Settings → Networking → Generate Domain** → ได้ HTTPS URL
5. ทำต่อเหมือน Render ข้อ 6–9 (health, webhook URL, use webhook, ปิด auto-reply, rich menu)

---

## วิธีที่ 3 — Google Cloud Run (container)

Cloud Run รับพอร์ตจาก `PORT` อยู่แล้ว เพิ่ม `Dockerfile` สั้น ๆ:

```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
CMD ["npm", "start"]
```

```bash
gcloud run deploy muang-jod \
  --source . \
  --region asia-southeast1 \
  --allow-unauthenticated \
  --set-env-vars LINE_CHANNEL_ACCESS_TOKEN=...,LINE_CHANNEL_SECRET=...,SUPABASE_URL=...,SUPABASE_SERVICE_ROLE_KEY=...
```

> เพื่อความปลอดภัย แนะนำเก็บ `SUPABASE_SERVICE_ROLE_KEY` ไว้ใน **Secret Manager** แล้ว mount เป็น env var แทนการใส่ตรง ๆ

จากนั้นทำต่อเหมือน Render ข้อ 6–9

---

## เปิดหน้าจัดการงาน (LIFF) — ไม่บังคับ

1. LINE Developers → provider เดียวกับบอต → **Create a LINE Login channel**
2. แท็บ **LIFF** → **Add**
   - Endpoint URL: `https://<โดเมนบอต>/app`
   - Size: **Full**
   - Scopes: **profile**, **openid**
3. คัดลอก **LIFF ID** (รูปแบบ `1234567890-AbCdEfGh`) ไปใส่ env `LIFF_ID` แล้ว deploy ใหม่
4. ปุ่ม "✏️ แก้ไข" บนการ์ดใบเสร็จ และปุ่ม "📊 เปิดแดชบอร์ด" บนการ์ดสรุปวันนี้ จะเปิดหน้านี้ให้

ไม่ตั้ง `LIFF_ID` ก็ใช้งานบอตได้ครบ — ปุ่มแก้ไขจะกลับไปใช้การแก้ผ่านแชตแทน

## ตรวจหลัง deploy

- [ ] `GET /health` → `{"status":"ok","db":"ok"}`
- [ ] `GET /health/db` → `{"status":"ok", ...}` — ตรวจทีละตาราง ถ้ามีตารางไหนขึ้น `error`
      แปลว่า migration ยังไม่ครบ ให้รัน `supabase/migrations/` ที่ขาดใน SQL Editor
- [ ] LINE **Verify** webhook สำเร็จ
- [ ] **Use webhook = ON**, ปิด auto-reply/greeting แล้ว
- [ ] แอดเพื่อนแล้วได้ข้อความต้อนรับ + Quick Reply
- [ ] Rich Menu แสดงครบ 8 ปุ่ม กดแล้วตอบถูก
- [ ] ไม่มี secret อยู่ใน repo / log

---

## บอตตอบ "ระบบมีปัญหาชั่วคราว"

0. `[debug] PGRST125 | Invalid path specified in request URL` = `SUPABASE_URL`
   ใส่เป็น `https://xxx.supabase.co/rest/v1` (ช่อง REST) แทน Project URL —
   โค้ดตัด `/rest/v1` ให้เองแล้ว แต่ควรแก้ค่าใน env ให้เหลือแค่ `https://xxx.supabase.co`
1. เปิด `GET /health/db` — ถ้ามีตารางขึ้น `error` ให้รันไฟล์ใน `supabase/migrations/`
   ที่ขาด (เรียงตามเลข) ใน Supabase → SQL Editor
   - อาการ "กดเมนูได้ แต่พิมพ์งานแล้วพัง" มักมาจากตาราง `user_states`
     → รัน `003_repair_user_states.sql` (รันซ้ำได้ ปลอดภัย)
2. ดูบรรทัด `[debug] ...` ที่บอตต่อท้ายข้อความ error — บอกสาเหตุจริง
   (รหัส/สถานะ/ข้อความ/`body` ของ LINE API)
3. เมื่อบอตมีผู้ใช้อื่นนอกจากเจ้าของ ให้ตั้ง env `DEBUG_ERRORS=0` เพื่อปิดบรรทัดนี้
