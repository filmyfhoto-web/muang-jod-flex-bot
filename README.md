# ม่วงจดให้ (Muang Jod) 💜

LINE Bot ผู้ช่วยจดงานสำหรับร้านค้า/ธุรกิจขนาดเล็ก
บันทึกงาน · บันทึกราคา · แนบหลักฐาน · ดูรายการ · สรุปยอด · แก้ไข · ยกเลิก · ติดตามงานค้างรับ

สร้างด้วย **Node.js + Express + LINE Messaging API + Supabase**

---

## ✨ ความสามารถ (Rich Menu 8 ปุ่ม)

| ปุ่ม | ทำอะไร |
|------|--------|
| 📝 บันทึกงานวันนี้ | พิมพ์รายละเอียดงาน ระบบแยกเป็นรายการ + ราคาให้อัตโนมัติ |
| 📎 แนบสลิป/หลักฐาน | ส่งรูป/ไฟล์ แนบเข้ากับงานล่าสุด |
| 🕘 รายการล่าสุด | ดูงาน 5 รายการล่าสุดแบบ Flex Message |
| 📊 สรุปวันนี้ | จำนวนงาน ยอดรวม ยอดที่รับแล้ว ยอดค้างรับ |
| ✏️ แก้ไขล่าสุด | แก้ชื่องาน ลูกค้า ราคา สถานะ หมายเหตุ |
| 🗑 ยกเลิกล่าสุด | ยกเลิกงาน (soft delete, ยืนยันก่อนเสมอ) |
| 💰 ค้างรับ | งานที่ยังไม่ได้รับเงิน + ยอดรวมค้างรับ |
| ❓ ช่วยเหลือ | คู่มือย่อ |

---

## 📁 โครงสร้างโปรเจกต์

```
src/
  server.js                 # entry point + ตรวจ env + error handling
  config/
    supabase.js             # Supabase service-role client
    line.js                 # LINE config
  routes/
    webhook.js              # POST /webhook + ตรวจ signature + dispatch event
  handlers/
    messageHandler.js       # ข้อความ text (ตาม state)
    postbackHandler.js      # router ของ postback action
    imageHandler.js         # รูป/ไฟล์
    followHandler.js        # ผู้ใช้เพิ่มเพื่อน
  actions/                  # ตรรกะของแต่ละปุ่มเมนู
    addJob.js  attachEvidence.js  recentJobs.js  todaySummary.js
    editLatest.js  cancelLatest.js  pendingPayment.js  help.js
  services/                 # เข้าถึงข้อมูล/บริการ
    jobService.js  userService.js  stateService.js
    attachmentService.js  lineService.js
  flex/                     # Flex Message builders
    jobCard.js  recentJobsFlex.js  todaySummaryFlex.js
    pendingPaymentFlex.js  confirmationFlex.js
  utils/
    parser.js  currency.js  dates.js
supabase/
  migrations/001_initial_schema.sql
scripts/
  create-rich-menu.js
.env.example  .gitignore  package.json  README.md
```

---

## 🚀 เริ่มต้นใช้งาน (Step by step)

### 1) ติดตั้ง dependencies

ต้องมี Node.js 20 ขึ้นไป

```bash
npm install
```

### 2) สร้าง Supabase project

1. ไปที่ https://supabase.com แล้ว **New project**
2. ตั้งชื่อ + รหัสผ่าน database + เลือก region ใกล้ที่สุด (เช่น Singapore)
3. รอสร้างเสร็จ (~2 นาที)
4. ไปที่ **Project Settings → API** เก็บค่า
   - `Project URL` → ใช้เป็น `SUPABASE_URL`
   - `service_role` secret key → ใช้เป็น `SUPABASE_SERVICE_ROLE_KEY`
   > ⚠️ `service_role` มีสิทธิ์เต็ม ใช้ฝั่ง server เท่านั้น ห้ามใส่ในหน้าเว็บ/แอปฝั่ง client

### 3) รัน SQL migration

1. ในหน้า Supabase เปิด **SQL Editor → New query**
2. คัดลอกเนื้อหาทั้งหมดจาก `supabase/migrations/001_initial_schema.sql` วางลงไป
3. กด **Run**

migration จะสร้างตาราง `profiles`, `jobs`, `job_items`, `attachments`, `user_states`,
เปิด Row Level Security และสร้าง Storage bucket ชื่อ `job-evidence` (แบบ private) ให้อัตโนมัติ

### 4) สร้าง LINE Official Account + Messaging API channel

1. ไปที่ https://developers.line.biz/console/
2. สร้าง **Provider** (ถ้ายังไม่มี)
3. **Create a new channel → Messaging API**
4. กรอกข้อมูล OA แล้วสร้าง

#### สร้าง Channel Access Token
- ในแท็บ **Messaging API** เลื่อนไปหัวข้อ **Channel access token (long-lived)**
- กด **Issue** → คัดลอกค่าไปใส่ `LINE_CHANNEL_ACCESS_TOKEN`

#### เก็บ Channel Secret
- แท็บ **Basic settings → Channel secret** → คัดลอกไปใส่ `LINE_CHANNEL_SECRET`

#### ปิด Auto-reply (สำคัญ เพื่อไม่ให้ชนกับบอท)
- แท็บ **Messaging API → LINE Official Account features**
  หรือกด **Edit** เพื่อไปที่ LINE Official Account Manager
- ไปที่ **Settings → Response settings**
  - เปิด **Webhook** (Use webhook = ON)
  - ปิด **Auto-reply messages** = OFF
  - ปิด **Greeting messages** = OFF (ถ้าต้องการให้บอทส่งข้อความต้อนรับเอง)

### 5) ตั้งค่า .env

```bash
cp .env.example .env
```

แก้ไขไฟล์ `.env`

```env
PORT=3000
LINE_CHANNEL_ACCESS_TOKEN=<จากขั้นตอน 4>
LINE_CHANNEL_SECRET=<จากขั้นตอน 4>
SUPABASE_URL=<จากขั้นตอน 2>
SUPABASE_SERVICE_ROLE_KEY=<จากขั้นตอน 2>
RICH_MENU_IMAGE_PATH=./public/rich-menu.jpg
```

> ⚠️ ห้าม commit ไฟล์ `.env` — มีระบุไว้ใน `.gitignore` แล้ว

### 6) รันเซิร์ฟเวอร์

```bash
npm run dev     # โหมดพัฒนา (auto-restart)
# หรือ
npm start       # โหมดปกติ
```

ถ้า env ครบจะเห็น `💜 ม่วงจด LINE Bot listening on port 3000`

### 7) เปิด public URL แล้วตั้ง Webhook

บอทต้องเข้าถึงได้ผ่าน HTTPS ระหว่างพัฒนาใช้ [ngrok](https://ngrok.com/) ได้

```bash
ngrok http 3000
```

จะได้ URL เช่น `https://abcd-1234.ngrok-free.app`

1. กลับไปที่ LINE Developers Console → แท็บ **Messaging API**
2. ช่อง **Webhook URL** ใส่ `https://abcd-1234.ngrok-free.app/webhook`
3. กด **Update** แล้วกด **Verify** (ควรได้ Success)
4. เปิด **Use webhook** = ON

### 8) สร้าง Rich Menu

1. เตรียมรูป Rich Menu ขนาด **2500 x 1686 px** (.jpg หรือ .png) วางไว้ตาม path ใน `RICH_MENU_IMAGE_PATH`
   (ค่าเริ่มต้น `./public/rich-menu.jpg`)
2. รัน

```bash
npm run create-rich-menu
```

สคริปต์จะสร้าง Rich Menu, อัปโหลดรูป และตั้งเป็นเมนูเริ่มต้นให้ผู้ใช้ทุกคน

> ปรับตำแหน่งปุ่มได้ที่ `LAYOUT` และ `BUTTONS` ในไฟล์ `scripts/create-rich-menu.js`
> ค่า `footerHeight` เผื่อไว้สำหรับแถบตกแต่งด้านล่างที่ไม่ต้องการให้กดได้

### 9) เพิ่มเพื่อน OA แล้วทดลองใช้

สแกน QR ของ OA (แท็บ Messaging API) เพิ่มเป็นเพื่อน แล้วกดเมนูใช้งานได้เลย

ทดลองพิมพ์หลังกด "บันทึกงานวันนี้":

```
ป้ายไวนิล 60x100 150 บาท
โฟมบอร์ด 40x60 250 บาท
```

---

## 🔐 ความปลอดภัย & การแยกข้อมูลผู้ใช้

- ทุก event จะหา/สร้าง `profile` จาก `line_user_id` ก่อน (`userService.getOrCreateProfile`)
- ทุก query ของ `jobs` / `attachments` / `user_states` อ้างอิง `user_id` ของเจ้าของข้อมูลเสมอ
  → ผู้ใช้ A ไม่มีทางเห็นข้อมูลของผู้ใช้ B
- ตรวจ `X-Line-Signature` ทุกคำขอที่ `/webhook`
- ใช้ค่าลับผ่าน environment variables เท่านั้น ไม่ hardcode
- เปิด RLS ทุกตาราง และใช้ service-role key เฉพาะฝั่ง server

---

## 🧪 ตรวจสอบโค้ด

```bash
npm run check     # node --check syntax ของ server
npm test          # unit tests (parser ฯลฯ)
```

---

## 🗄️ ฐานข้อมูล

| ตาราง | หน้าที่ |
|-------|--------|
| `profiles` | ผู้ใช้ LINE แต่ละคน (security anchor) |
| `jobs` | งาน + ยอดเงิน + สถานะชำระ/สถานะงาน |
| `job_items` | รายการสินค้าในแต่ละงาน |
| `attachments` | ไฟล์หลักฐานที่แนบกับงาน |
| `user_states` | สถานะบทสนทนาของผู้ใช้ |

`payment_status`: `pending` · `paid` · `partial`
`status`: `active` · `completed` · `cancelled` (ยกเลิกใช้ soft delete ไม่ลบจริง)
