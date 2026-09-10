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
  writeFileSync(OUT, `${JSON.stringify(richMenuObject(), null, 2)}\n`);
  console.log(`wrote assets/richmenu.json (${richMenuObject().areas.length} areas)`);
}
