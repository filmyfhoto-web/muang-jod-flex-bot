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
2. คัดลอกเนื้อหาทั้งหมดจาก `supabase/migrations/001_initial_schema.sql` วางลงไป กด **Run**
3. เปิด query ใหม่ คัดลอก `supabase/migrations/002_phase2.sql` วางลงไป กด **Run**

migration 001 จะสร้างตาราง `profiles`, `jobs`, `job_items`, `attachments`, `user_states`,
เปิด Row Level Security และสร้าง Storage bucket ชื่อ `job-evidence` (แบบ private) ให้อัตโนมัติ

migration 002 (Phase 2) จะเพิ่มตาราง `webhook_events` (กันบันทึกซ้ำ), คอลัมน์ `paid_amount`/`balance_due`
สำหรับรับเงินบางส่วน, ฟังก์ชัน `create_job_with_items()` (บันทึกงาน+รายการแบบ atomic + เลขที่งาน
`MJ-YYYYMMDD-XXXX` ไม่ซ้ำ) — รันทั้งสองไฟล์ตามลำดับ

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

### เข้าใจภาษาธรรมชาติ (Phase 4)

พิมพ์เล่าเป็นประโยคเดียวได้เลย เช่น
`วันนี้ทำป้ายร้านพี่นก 2 ป้าย ป้ายละ 350 รับมาแล้ว 300`
ม่วงจดจะเข้าใจเอง: ลูกค้า = พี่นก · จำนวน = 2 · ราคาต่อชิ้น = 350 · รวม = 700 · รับแล้ว = 300 · ค้าง = 400
แล้วสรุปเป็นการ์ด preview ให้ยืนยันก่อนบันทึก

- ค่าเริ่มต้นใช้ตัวแยกคำแบบ **rule-based** (ทำงานทันที ไม่ต้องตั้งค่าเพิ่ม)
- ถ้าตั้ง `ANTHROPIC_API_KEY` ใน `.env` จะเปิดชั้น **Claude** ช่วยอ่านประโยคที่ซับซ้อนกว่า
  (โมเดลปรับได้ที่ `NLP_MODEL`, ค่าเริ่มต้น `claude-haiku-4-5`) — หากเรียกไม่สำเร็จจะ fallback
  กลับมาใช้ rule-based อัตโนมัติ บอตทำงานต่อได้เสมอ

### รายงาน (Phase 3)

พิมพ์ **"รายงาน"** ในแชท (หรือกด 📈 รายงาน จาก Quick Reply) เพื่อเปิดเมนูรายงาน
เลือกได้: รายวัน / 7 วันล่าสุด / เดือนนี้ — แต่ละรายงานแสดงจำนวนงาน ยอดขายรวม รับเงินแล้ว
ค้างรับ งานที่ยกเลิก ค่าเฉลี่ยต่อบิล 5 งานล่าสุด และ 5 งานมูลค่าสูงสุด (เวลาไทย Asia/Bangkok)

ปุ่ม **⬇️ ดาวน์โหลด CSV** จะสร้างไฟล์ `muang-jod-report-YYYY-MM.csv` ของเดือนปัจจุบัน
เก็บในโฟลเดอร์ส่วนตัวของผู้ใช้ (`<user_id>/reports/…` ใน bucket `job-evidence`) แล้วส่งลิงก์
แบบ signed URL (อายุ 7 วัน) ให้ในแชท — ข้อมูลถูกกรองด้วย `user_id` ของเจ้าของทุกครั้ง
รายงานไม่กระทบ Rich Menu 8 ปุ่มเดิม

### 8) สร้าง Rich Menu

1. เตรียมรูป Rich Menu ขนาด **2500 x 1686 px** (.jpg หรือ .png) วางไว้ที่ `assets/rich-menu.png`
   (path ตั้งได้ที่ `RICH_MENU_IMAGE_PATH` ใน `.env`, ค่าเริ่มต้น `./assets/rich-menu.png`)
2. รัน

```bash
npm run rich-menu
```

สคริปต์จะ **แสดงรายการ Rich Menu เดิมก่อน (ไม่ลบให้อัตโนมัติ)** แล้วสร้างเมนูใหม่, อัปโหลดรูป,
ตั้งเป็นเมนูเริ่มต้นให้ผู้ใช้ทุกคน และพิมพ์ `richMenuId` ที่สร้างสำเร็จ พร้อมรายงานสถานะทุกขั้นตอน

> ปรับตำแหน่งปุ่มได้ที่ `LAYOUT` และ `BUTTONS` ในไฟล์ `scripts/create-rich-menu.js`
> ค่า `footerHeight` เผื่อไว้สำหรับแถบตกแต่งด้านล่างที่ไม่ต้องการให้กดได้
> ถ้าต้องการลบเมนูเดิม ให้ลบเองผ่าน API (`deleteRichMenu(richMenuId)`) — สคริปต์จะไม่ลบให้

### 9) เพิ่มเพื่อน OA แล้วทดลองใช้

สแกน QR ของ OA (แท็บ Messaging API) เพิ่มเป็นเพื่อน แล้วกดเมนูใช้งานได้เลย

ทดลองพิมพ์หลังกด "บันทึกงานวันนี้":

```
ป้ายไวนิล 60x100 150 บาท
โฟมบอร์ด 40x60 250 บาท
```

### คิดราคาแบบตารางเมตร

พิมพ์ขนาดกับเรตมา บอทคูณพื้นที่ให้เอง ไม่ต้องกดเครื่องคิดเลข

```
รพสตบ้านชี ไวนิล ขนาด 160*300 ตรมละ 165 บาท
→ ลูกค้า รพสตบ้านชี · 160x300 ซม. = 4.8 ตร.ม. × 165 = 792 บาท
```

| เรื่อง | ที่บอทเข้าใจ |
|---|---|
| คำว่าต่อตารางเมตร | `ตรมละ` `ตร.ม.ละ` `ตารางเมตรละ` `165 บาท/ตร.ม.` `165 ต่อตารางเมตร` |
| ตัวคูณขนาด | `160x300` `160*300` `160×300` `กว้าง 1.6 ยาว 3` |
| หน่วยที่ใส่เอง | `ซม.` `ม.` `นิ้ว` `ฟุต` (ใส่มาแล้วเชื่อหน่วยนั้นเสมอ) |
| ไม่ใส่หน่วย | ตัวเลข ≥ 20 = เซนติเมตร (160x300), < 20 = เมตร (1.6x3) |
| หลายผืน | `160x300 2 ผืน ตรมละ 165` → 9.6 ตร.ม. = 1,584 บาท |
| บอกพื้นที่มาเลย | `ไวนิล 4.8 ตร.ม. ตรมละ 165` |

บิล/การ์ดจะเก็บเป็น `จำนวน = ตร.ม.` และ `ราคาต่อหน่วย = เรตต่อตารางเมตร`
จึงเห็นวิธีคิดบนการ์ด (`ไวนิล 160x300 ซม. · 4.8 ตร.ม. × 165`)

ชื่อลูกค้าที่เป็นหน่วยงาน (`รพสต` `โรงเรียน` `อบต.` `เทศบาล` `วัด` `บริษัท` `หจก.`)
อ่านได้โดยไม่ต้องมีคำนำหน้าอย่าง "พี่/คุณ"

---

## 📝 หน้าฟอร์มบันทึกงาน (`/app/jot`)

พิมพ์ในแชตเร็วกว่า แต่บางงานต้องแยกช่องกันจริง ๆ — โดยเฉพาะเวลามีรูปแนบ
หน้านี้จึงเป็นฟอร์มเต็ม บนธีมกลางคืนเดียวกับการ์ดในแชต

| ไฟล์ | หน้าที่ |
|---|---|
| `public/liff/jot/index.html` | โครงหน้า + `<template>` ของการ์ดหนึ่งใบ |
| `public/liff/jot/style.css` | สองธีมในไฟล์เดียว สลับด้วยคลาสบน `body` |
| `public/liff/jot/script.js` | สถานะ การคำนวณ รูป การปัดการ์ด และการยิง API |

**การ์ดปัดซ้าย-ขวาได้** — หนึ่งรายการ = หนึ่งการ์ด เรียงแนวนอนด้วย
`scroll-snap` มีจุดบอกตำแหน่งใต้การ์ด กดจุดกระโดดไปใบนั้นได้ ปุ่ม "เพิ่มรายการ"
สร้างใบใหม่แล้วเลื่อนไปให้เอง

**สองธีม** — ค่าเริ่มต้นเป็นม่วงพาสเทลการ์ดขาวตามแบบที่ออกไว้
`?theme=night` ได้โทนกรมท่าเหมือนการ์ดในแชต ทุกสีอ้าง `var()` ทั้งไฟล์
สลับธีมจึงเป็นแค่คลาสเดียวบน `body` (มีเทสต์กันไม่ให้มีสีดิบหลุดออกนอก
บล็อก token)

<<<<<<< HEAD
**เปิดยังไง** — กด "บันทึกงานวันนี้" ในริชเมนู หรือปุ่ม "⚡ จดด่วน" บนการ์ดหน้าแรก
หรือเปิดตรง ๆ ที่ `<โดเมนบอต>/app/jot`

### โหมดด่วน — การ์ดเด้งทับแชต

`/app/jot?quick=1` ตัดบับเบิลแชตกับการ์ดสรุปออก เหลือฟอร์มกับแถบยอดรวมที่ติดอยู่
ล่างจอ ช่องที่ไม่ได้ใช้ทุกครั้ง (วันที่ · รับเงินมาแล้ว · หมายเหตุ) พับไว้ใต้ "ใส่เพิ่มได้"

ให้เด้งขึ้นมาเป็น **แผ่นการ์ดทับแชตจริง ๆ** ต้องรู้ข้อจำกัดนี้ก่อน: **ขนาดของ LIFF
ผูกกับ LIFF ID ไม่ใช่ URL** — ตัวที่มีอยู่ตั้ง Size = Full ไว้ให้แดชบอร์ด
การ์ดเด้งจึงต้องเป็น LIFF app อีกตัว

1. LINE Developers → LINE Login channel เดิม → **LIFF → Add**
2. Endpoint URL = `https://<โดเมนบอต>/app/jot?quick=1`
3. **Size = Tall** · Scope = `profile`, `openid`
4. เอา LIFF ID ที่ได้ใส่ `LIFF_ID_QUICK` ใน Render

ไม่ตั้งก็ใช้ได้ ลิงก์ "จดด่วน" จะเปิดฟอร์มเดิมแบบเต็มจอแทน (`quickFormUrl()` เลือกให้เอง)
และไม่ว่าทางไหน **Flex Message ในแชตพิมพ์ลงไปตรง ๆ ไม่ได้** — LINE ไม่มีช่องกรอก
ใน Flex การ์ดในแชตจึงเป็น "ปุ่มเข้า" เสมอ
=======
**เปิดยังไง** — กด "บันทึกงานวันนี้" ในริชเมนู บอทจะแนบลิงก์ฟอร์มมาให้
(`https://liff.line.me/<LIFF_ID>/jot`) หรือเปิดตรง ๆ ที่ `<โดเมนบอต>/app/jot`
>>>>>>> origin/main

**ข้อมูลหนึ่งรายการ**

```js
{ id, name, detail, price, qty, rate, total, totalManual, image }
```

- `rate` คือ "ตรมละ" — ถ้ากรอกไว้และมีขนาดในช่อง `detail` (เช่น `160x300`)
  ระบบจะคิด `พื้นที่ × เรต` เป็น `price` ให้เอง แล้วล็อกช่องราคาไว้
- `total` = `price × qty` จนกว่าจะพิมพ์ทับเอง (`totalManual`)
- `image` เป็น data URL ที่ย่อเหลือด้านยาว 1280 px แล้ว
- ร่างทั้งก้อนเก็บใน `localStorage` ทุกครั้งที่พิมพ์ ปิดแล้วเปิดใหม่ยังอยู่

**กติกาเดา "ซม. หรือ ม."** ต้องตรงกับ `src/utils/area.js` เสมอ — ตัวเลข
ตั้งแต่ 20 ขึ้นไปคือเซนติเมตร ต่ำกว่านั้นคือเมตร มีเทสต์ (`tests/jotForm.test.js`)
คุมไม่ให้สองที่หลุดจากกัน

**บันทึกแล้วไปไหน** — `POST /api/jobs` พร้อมโทเคนของ LIFF งานจึงเข้าบัญชี
ของคนที่เปิดหน้านี้เท่านั้น **ยอดเงินคำนวณใหม่ที่เซิร์ฟเวอร์เสมอ** ไม่เชื่อ
ยอดที่ส่งมาจากเบราว์เซอร์ รูปที่แนบไปเก็บใน Supabase Storage ผูกกับงานนั้น
(สูงสุด 4 รูป/งาน) และถ้าอัปโหลดรูปพลาด งานที่บันทึกไปแล้วจะไม่หาย —
ตอบกลับมาเป็น `attachmentsFailed` แทน

เปิดนอก LINE ได้เหมือนกัน แต่จะเป็น **โหมดทดลอง**: กรอกและคำนวณได้ครบ
กดบันทึกแล้วเก็บลง `localStorage` เท่านั้น ไม่ขึ้นระบบ

```bash
npm start          # แล้วเปิด http://localhost:3000/app/jot
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
