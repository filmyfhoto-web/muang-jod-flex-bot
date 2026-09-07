import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import linebot from '@line/bot-sdk';

const { MessagingApiClient, MessagingApiBlobClient } = linebot.messagingApi;

// ------------------------------------------------------------
// Rich Menu layout config — edit these to fine-tune tappable areas.
// The image is 2500 x 1686 with 8 menu cards (4 columns x 2 rows).
// A footer strip at the bottom may hold decoration that should NOT
// be tappable, so we reserve FOOTER_HEIGHT and only map the 8 cards.
// ------------------------------------------------------------
const LAYOUT = {
  width: 2500,
  height: 1686,
  cols: 4,
  rows: 2,
  marginX: 0, // left/right margin around the grid
  marginTop: 0, // top margin above the first row
  footerHeight: 186, // bottom strip reserved for decoration (not tappable)
  gutter: 0, // gap between cards, if the artwork has spacing
};

// 8 buttons, left-to-right, top-to-bottom.
const BUTTONS = [
  { label: 'บันทึกงานวันนี้', data: 'action=add_job' },
  { label: 'แนบสลิป/หลักฐาน', data: 'action=attach_evidence' },
  { label: 'รายการล่าสุด', data: 'action=recent_jobs' },
  { label: 'สรุปวันนี้', data: 'action=today_summary' },
  { label: 'แก้ไขล่าสุด', data: 'action=edit_latest' },
  { label: 'ยกเลิกล่าสุด', data: 'action=cancel_latest' },
  { label: 'ค้างรับ', data: 'action=pending_payment' },
  { label: 'ช่วยเหลือ', data: 'action=help' },
];

// Compute the 8 tappable areas from LAYOUT.
function buildAreas() {
  const gridWidth = LAYOUT.width - LAYOUT.marginX * 2;
  const gridHeight = LAYOUT.height - LAYOUT.marginTop - LAYOUT.footerHeight;
  const cellW = Math.floor((gridWidth - LAYOUT.gutter * (LAYOUT.cols - 1)) / LAYOUT.cols);
  const cellH = Math.floor((gridHeight - LAYOUT.gutter * (LAYOUT.rows - 1)) / LAYOUT.rows);

  const areas = [];
  BUTTONS.forEach((btn, i) => {
    const col = i % LAYOUT.cols;
    const row = Math.floor(i / LAYOUT.cols);
    const x = LAYOUT.marginX + col * (cellW + LAYOUT.gutter);
    const y = LAYOUT.marginTop + row * (cellH + LAYOUT.gutter);
    areas.push({
      bounds: { x, y, width: cellW, height: cellH },
      action: {
        type: 'postback',
        label: btn.label.slice(0, 20),
        data: btn.data,
        displayText: btn.label,
      },
    });
  });
  return areas;
}

const CONTENT_TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png' };

async function main() {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) {
    console.error('❌ ขาด LINE_CHANNEL_ACCESS_TOKEN ใน .env');
    process.exit(1);
  }

  const imagePath = process.env.RICH_MENU_IMAGE_PATH;
  if (!imagePath) {
    console.error('❌ ขาด RICH_MENU_IMAGE_PATH ใน .env (path ไปยังรูป Rich Menu 2500x1686)');
    process.exit(1);
  }

  const ext = path.extname(imagePath).toLowerCase();
  const contentType = CONTENT_TYPES[ext];
  if (!contentType) {
    console.error(`❌ รูปต้องเป็น .jpg หรือ .png (ได้รับ ${ext || 'ไม่ทราบ'})`);
    process.exit(1);
  }

  let imageBuffer;
  try {
    imageBuffer = await readFile(imagePath);
  } catch (err) {
    console.error(`❌ อ่านไฟล์รูปไม่ได้: ${imagePath}`);
    console.error(err.message);
    process.exit(1);
  }

  const client = new MessagingApiClient({ channelAccessToken: token });
  const blobClient = new MessagingApiBlobClient({ channelAccessToken: token });

  const richMenu = {
    size: { width: LAYOUT.width, height: LAYOUT.height },
    selected: true,
    name: 'muang-jod-main',
    chatBarText: 'เมนูม่วงจด',
    areas: buildAreas(),
  };

  console.log('📐 กำลังสร้าง Rich Menu ด้วย areas:');
  richMenu.areas.forEach((a, i) => {
    console.log(
      `   ${i + 1}. ${a.action.displayText} -> ` +
        `x:${a.bounds.x} y:${a.bounds.y} w:${a.bounds.width} h:${a.bounds.height}`
    );
  });

  try {
    const { richMenuId } = await client.createRichMenu(richMenu);
    console.log(`✅ สร้าง Rich Menu แล้ว: ${richMenuId}`);

    const blob = new Blob([imageBuffer], { type: contentType });
    await blobClient.setRichMenuImage(richMenuId, blob);
    console.log('✅ อัปโหลดรูป Rich Menu แล้ว');

    await client.setDefaultRichMenu(richMenuId);
    console.log('✅ ตั้งเป็น Rich Menu เริ่มต้นให้ผู้ใช้ทุกคนแล้ว');
    console.log('\n🎉 เสร็จเรียบร้อยค่ะ เปิด LINE OA แล้วดู Rich Menu ได้เลย 💜');
  } catch (err) {
    console.error('❌ สร้าง Rich Menu ไม่สำเร็จ:');
    console.error(err?.body || err?.message || err);
    process.exit(1);
  }
}

main();
