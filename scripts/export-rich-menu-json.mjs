// Writes assets/richmenu.json — the Rich Menu object as the LINE API wants it.
//
//   node scripts/export-rich-menu-json.mjs
//
// scripts/create-rich-menu.js already posts this object through the SDK. This
// exists so the same menu can be installed with nothing but curl (see
// scripts/install-rich-menu.sh), and so the tap areas are reviewable as a file
// rather than only as the output of a function.
//
// It is generated, never hand-edited: the areas come from buildAreas(), which
// the tests hold to the artwork's geometry. A test also fails if the committed
// file drifts from what this prints.
import { writeFileSync } from 'node:fs';
import { LAYOUT, buildAreas } from './create-rich-menu.js';

export function richMenuObject() {
  return {
    size: { width: LAYOUT.width, height: LAYOUT.height },
    selected: true,
    name: 'muang-jod-main',
    chatBarText: 'เมนูม่วงจด',
    areas: buildAreas(),
  };
}

const OUT = new URL('../assets/richmenu.json', import.meta.url);

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const menu = richMenuObject();
  writeFileSync(OUT, `${JSON.stringify(menu, null, 2)}\n`);
  console.log(`wrote assets/richmenu.json (${menu.areas.length} areas)`);

  // Buttons that open a page do so directly when LIFF is configured, and fall
  // back to a postback when it is not. Whichever this run saw is now baked
  // into the file, so say which it was rather than let it be discovered later
  // on a phone.
  const links = menu.areas.filter((a) => a.action.type === 'uri').length;
  console.log(
    links
      ? `   ${links} ปุ่มเปิดหน้าเว็บตรง ๆ (uri) — มาจาก LIFF_ID ที่ตั้งไว้ใน env`
      : '   ⚠️ ไม่มี LIFF_ID ใน env — ทุกปุ่มเป็น postback ให้บอตตอบ ' +
          'ถ้าอยากได้ปุ่มที่เปิดหน้าเว็บเลย ให้ตั้ง LIFF_ID แล้วรันใหม่'
  );
}
