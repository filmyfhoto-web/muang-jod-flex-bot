import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import linebot from '@line/bot-sdk';

const { MessagingApiClient, MessagingApiBlobClient } = linebot.messagingApi;

// ------------------------------------------------------------
// Rich Menu layout config — must match assets/rich-menu.png, which is drawn
// by scripts/build-rich-menu.mjs. The image is 2500 x 1686: a brand panel down
// the left, then 9 cards in 3 columns x 3 rows to its right. The panel is
// decoration and stays untappable.
// ------------------------------------------------------------
const LAYOUT = {
  width: 2500,
  height: 1686,
  cols: 3,
  rows: 3,
  marginLeft: 860, // brand panel to the left of the grid (not tappable)
  marginRight: 0,
  marginTop: 26, // margin above the first row
  footerHeight: 26, // margin below the last row
  gutter: 0, // gap between cards, if the artwork has spacing
};

// 9 buttons, left-to-right, top-to-bottom. Every button is a postback.
const BUTTONS = [
  { label: 'บันทึกงานวันนี้', data: 'action=add_job' },
  { label: 'แนบสลิป/หลักฐาน', data: 'action=attach_evidence' },
  { label: 'รายการล่าสุด', data: 'action=recent_jobs' },
  { label: 'สรุปวันนี้', data: 'action=today_summary' },
  { label: 'แก้ไขล่าสุด', data: 'action=edit_latest' },
  { label: 'ยกเลิกล่าสุด', data: 'action=cancel_latest' },
  { label: 'ค้างรับ & ติดตามงาน', data: 'action=pending_payment' },
  { label: 'ออกบิล & ใบเสร็จ', data: 'action=create_bill' },
  { label: 'ช่วยเหลือ', data: 'action=help' },
];

// Compute the 8 tappable areas from LAYOUT.
function buildAreas() {
  const gridWidth = LAYOUT.width - LAYOUT.marginLeft - LAYOUT.marginRight;
  const gridHeight = LAYOUT.height - LAYOUT.marginTop - LAYOUT.footerHeight;
  const cellW = Math.floor((gridWidth - LAYOUT.gutter * (LAYOUT.cols - 1)) / LAYOUT.cols);
  const cellH = Math.floor((gridHeight - LAYOUT.gutter * (LAYOUT.rows - 1)) / LAYOUT.rows);

  const areas = [];
  BUTTONS.forEach((btn, i) => {
    const col = i % LAYOUT.cols;
    const row = Math.floor(i / LAYOUT.cols);
    const x = LAYOUT.marginLeft + col * (cellW + LAYOUT.gutter);
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

// Wrap an SDK call so that success and failure both report a clear status.
// The SDK resolves only on a 2xx response and throws linebot.HTTPError
// (with .statusCode and .body) on anything else — so a resolved promise
// is itself the "response status OK" check for that request.
async function step(label, fn) {
  try {
    const result = await fn();
    console.log(`✅ ${label} — status OK`);
    return result;
  } catch (err) {
    const status = err?.statusCode ? ` (HTTP ${err.statusCode})` : '';
    console.error(`❌ ${label} — ล้มเหลว${status}`);
    console.error(err?.body || err?.message || err);
    throw err;
  }
}

async function main() {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) {
    console.error('❌ ขาด LINE_CHANNEL_ACCESS_TOKEN ใน .env');
    process.exit(1);
  }

  const imagePath = process.env.RICH_MENU_IMAGE_PATH || './assets/rich-menu.png';
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
    console.error('   วางไฟล์รูป Rich Menu (2500x1686) ไว้ตาม path นี้ หรือแก้ RICH_MENU_IMAGE_PATH ใน .env');
    console.error(`   (${err.message})`);
    process.exit(1);
  }

  const client = new MessagingApiClient({ channelAccessToken: token });
  const blobClient = new MessagingApiBlobClient({ channelAccessToken: token });

  // 1) List existing Rich Menus. We NEVER delete them automatically — just show
  //    them so you can decide. (Delete manually if you want; see the hint below.)
  const list = await step('ดึงรายการ Rich Menu เดิม', () => client.getRichMenuList());
  const existing = list?.richmenus || [];
  if (existing.length) {
    console.log(`\n⚠️  พบ Rich Menu เดิมอยู่แล้ว ${existing.length} รายการ (จะไม่ลบให้อัตโนมัติ):`);
    existing.forEach((m, i) => {
      console.log(`   ${i + 1}. ${m.richMenuId}  |  name: ${m.name}  |  chatBarText: ${m.chatBarText}`);
    });
    console.log(
      '   ℹ️  ถ้าต้องการลบเมนูเดิม ให้ลบเองผ่าน API: ' +
        'client.deleteRichMenu(richMenuId) หรือ curl -X DELETE ' +
        'https://api.line.me/v2/bot/richmenu/{richMenuId}\n'
    );
  } else {
    console.log('ℹ️  ยังไม่มี Rich Menu เดิมในช่องนี้\n');
  }

  // 2) Build + create the new Rich Menu.
  const richMenu = {
    size: { width: LAYOUT.width, height: LAYOUT.height },
    selected: true,
    name: 'muang-jod-main',
    chatBarText: 'เมนูม่วงจด',
    areas: buildAreas(),
  };

  console.log('📐 พื้นที่กด (tappable areas) ที่จะสร้าง:');
  richMenu.areas.forEach((a, i) => {
    console.log(
      `   ${i + 1}. ${a.action.displayText} [${a.action.data}] -> ` +
        `x:${a.bounds.x} y:${a.bounds.y} w:${a.bounds.width} h:${a.bounds.height}`
    );
  });
  console.log('');

  const { richMenuId } = await step('สร้าง Rich Menu', () => client.createRichMenu(richMenu));

  // 3) Upload the image for that Rich Menu.
  const blob = new Blob([imageBuffer], { type: contentType });
  await step('อัปโหลดรูป Rich Menu', () => blobClient.setRichMenuImage(richMenuId, blob));

  // 4) Set it as the default Rich Menu for every user.
  await step('ตั้งเป็น Rich Menu เริ่มต้น', () => client.setDefaultRichMenu(richMenuId));

  console.log('\n🎉 เสร็จเรียบร้อยค่ะ 💜');
  console.log(`🆔 richMenuId: ${richMenuId}`);
  console.log('เปิด LINE OA แล้วดู Rich Menu ได้เลย');
}

main().catch(() => process.exit(1));
