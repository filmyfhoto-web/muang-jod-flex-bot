# assets/

วางรูป Rich Menu ไว้ที่นี่:

    assets/rich-menu.png

ข้อกำหนดรูป:
- ขนาด 2500 x 1686 px
- ไฟล์ .png หรือ .jpg
- เป็นเมนู 8 ปุ่ม จัดแบบ 4 คอลัมน์ x 2 แถว (ปุ่ม 1–4 แถวบน, 5–8 แถวล่าง)
- เผื่อแถบตกแต่งด้านล่างสูง ~186px ที่ไม่ต้องกดได้ (ปรับได้ที่ LAYOUT.footerHeight
  ใน scripts/create-rich-menu.js)

ตั้ง path ได้ที่ .env:

    RICH_MENU_IMAGE_PATH=./assets/rich-menu.png

แล้วรัน:

    npm run rich-menu
