// Rebuilds public/brand/ui/ from the full-size mascot cut-outs.
//
//   npm i --no-save sharp
//   node scripts/build-ui-mascots.mjs
//
// Two kinds of output:
//   <pose>.png     — the cut-out at 260px, small enough to load several of on
//                    a phone, used by the LIFF page where CSS can tuck the
//                    body behind a card.
//   card-hero.png  — the same trick baked into one image, because Flex has no
//                    z-index and an image cannot overflow its bubble.
import sharp from 'sharp';

const POSES = ['peek', 'rest', 'hello', 'pen', 'wave', 'sit', 'sleep', 'happy', 'nap'];
const OUT = 'public/brand/ui';

for (const pose of POSES) {
  const to = `${OUT}/${pose}.png`;
  const { size } = await sharp(`public/brand/mascot-${pose}.png`)
    .resize({ width: 260, withoutEnlargement: true })
    .png({ compressionLevel: 9, palette: true, quality: 88 })
    .toFile(to);
  console.log(`${to.padEnd(30)} ${(size / 1024).toFixed(0)} KB`);
}

// 20:5 — the ratio the bubble heroes declare. Was 20:8; the home card was too
// tall on a phone, and the strip is the easiest third to give back. The colours
// are the card's own surface and tint from src/flex/theme.js; a white strip
// would read as a hole punched in the top of a dark card.
const W = 1040, H = 260, BAND = 156;
const SURFACE = '#121A2A', EDGE = '#1B2537', RULE = '#7C3AED';
const backdrop = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="${SURFACE}"/>
  <rect x="0" y="${BAND}" width="${W}" height="${H - BAND}" fill="${EDGE}"/>
  <rect x="0" y="${BAND}" width="${W}" height="5" fill="${RULE}"/>
</svg>`;

const dog = await sharp('public/brand/mascot-peek.png').resize({ height: 200 }).toBuffer();
const { width, height } = await sharp(dog).metadata();
const hero = await sharp(Buffer.from(backdrop))
  // Straddling the band is what sells it: head above the edge, paws over it.
  .composite([{ input: dog, left: W - width - 60, top: BAND - height + 50 }])
  .png({ compressionLevel: 9, palette: true })
  .toBuffer();
await sharp(hero).toFile(`${OUT}/card-hero.png`);
console.log(`${OUT}/card-hero.png`.padEnd(30) + ` ${(hero.length / 1024).toFixed(0)} KB  ${W}x${H}`);
