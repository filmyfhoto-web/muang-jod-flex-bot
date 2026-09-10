import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import linebot from '@line/bot-sdk';

const { MessagingApiClient, MessagingApiBlobClient } = linebot.messagingApi;

// ------------------------------------------------------------
// Rich Menu layout config — must match assets/rich-menu.jpg, which is drawn by
// scripts/build-rich-menu.mjs. The image is 2500 x 1686:
//   - a big "จดงาน" panel down the left, spanning two rows
//   - a 2 x 2 of cards to its right
//   - a row of three under both: ออกใบเสร็จ (wide), ตั้งค่า, ช่วยเหลือ
//   - the brand footer across the bottom — tappable, opens the home card
//
// The old menu was a uniform 4 x 2 grid, so its areas could be computed. This
// one is not, so each rectangle is written out: the artwork is the spec, and a
// formula that no longer matches it is worse than a list that does.
// ------------------------------------------------------------
const LAYOUT = { width: 2500, height: 1686 };

// Mirrors the geometry block in build-rich-menu.mjs.
const PAD = 68;
const GAP_X = 42, GAP_Y = 36;
const LEFT_X = PAD, LEFT_W = 1175;
const COL1_X = LEFT_X + LEFT_W + GAP_X;
const COL_W = 552;
const COL2_X = COL1_X + COL_W + GAP_X;
const ROW1_Y = 36, ROW_H = 455;
const ROW2_Y = ROW1_Y + ROW_H + GAP_Y;
const BIG_Y = ROW1_Y, BIG_H = ROW_H * 2 + GAP_Y;
const ROW3_Y = ROW2_Y + ROW_H + GAP_Y;
const ROW3_H = 400;
const FOOT_Y = ROW3_Y + ROW3_H;
const FOOT_H = LAYOUT.height - FOOT_Y;

// A tap area is grown to the gutter around its card, so a press that lands
// between two cards still does something rather than nothing.
const BUTTONS = [
  { label: 'จดงาน', data: 'action=add_job',
    bounds: { x: 0, y: 0, width: LEFT_X + LEFT_W + GAP_X / 2, height: BIG_Y + BIG_H + GAP_Y / 2 } },

  { label: 'รายการล่าสุด/แก้ไข', data: 'action=recent_jobs',
    bounds: { x: COL1_X - GAP_X / 2, y: 0, width: COL_W + GAP_X, height: ROW1_Y + ROW_H + GAP_Y / 2 } },
  { label: 'บันทึก/แนบสลิป', data: 'action=attach_evidence',
    bounds: { x: COL2_X - GAP_X / 2, y: 0, width: LAYOUT.width - COL2_X + GAP_X / 2, height: ROW1_Y + ROW_H + GAP_Y / 2 } },

  { label: 'งานค้าง', data: 'action=pending_payment',
    bounds: { x: COL1_X - GAP_X / 2, y: ROW2_Y - GAP_Y / 2, width: COL_W + GAP_X, height: ROW_H + GAP_Y } },
  { label: 'หมวดงาน', data: 'action=pick_category',
    bounds: { x: COL2_X - GAP_X / 2, y: ROW2_Y - GAP_Y / 2, width: LAYOUT.width - COL2_X + GAP_X / 2, height: ROW_H + GAP_Y } },

  { label: 'ออกใบเสร็จ', data: 'action=create_bill',
    bounds: { x: 0, y: ROW3_Y - GAP_Y / 2, width: LEFT_X + LEFT_W + GAP_X / 2, height: ROW3_H + GAP_Y / 2 } },
  { label: 'ตั้งค่า', data: 'action=open_dashboard',
    bounds: { x: COL1_X - GAP_X / 2, y: ROW3_Y - GAP_Y / 2, width: COL_W + GAP_X, height: ROW3_H + GAP_Y / 2 } },
  { label: 'ช่วยเหลือ', data: 'action=help',
    bounds: { x: COL2_X - GAP_X / 2, y: ROW3_Y - GAP_Y / 2, width: LAYOUT.width - COL2_X + GAP_X / 2, height: ROW3_H + GAP_Y / 2 } },
];

// The brand footer. It reads as decoration, which is exactly why the old menu's
// decorative panel had to be made tappable: people press the logo.
const FOOTER = { label: 'ม่วงจดให้', data: 'action=home',
  bounds: { x: 0, y: FOOT_Y, width: LAYOUT.width, height: FOOT_H } };

function area(btn) {
  return {
    bounds: {
      x: Math.round(btn.bounds.x),
      y: Math.round(btn.bounds.y),
      width: Math.round(btn.bounds.width),
      height: Math.round(btn.bounds.height),
    },
    action: {
      type: 'postback',
      label: btn.label.slice(0, 20),
      data: btn.data,
      displayText: btn.label,
    },
  };
}

// The nine tappable areas: eight cards, then the brand footer.
export function buildAreas() {
  return [...BUTTONS, FOOTER].map(area);
}

export { LAYOUT, BUTTONS, FOOTER };

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

  const imagePath = process.env.RICH_MENU_IMAGE_PATH || './assets/rich-menu.jpg';
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

// Only upload when run as a script — importing this file (tests do) must not
// touch the LINE API.
const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) main().catch(() => process.exit(1));
