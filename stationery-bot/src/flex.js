// LINE Flex Message builders. Everything here is plain data → easy to test.

// Pastel palette: cream paper, apricot / butter-yellow / powder-blue accents, black
// for the one button that matters. shop.theme (an object) may override any key.
const PALETTE = {
  cream: '#FBF7EF',
  apricot: '#FFB493',
  yellow: '#FFE68A',
  blue: '#BFDBFF',
  ink: '#2B2B2B',
  accent: '#E8643A', // prices, highlights
  muted: '#7A7468',
  ok: '#2F9E6E',
  warn: '#E5533D',
};
const pal = (shop) => ({ ...PALETTE, ...(shop.theme && typeof shop.theme === 'object' ? shop.theme : {}) });
const TONES = ['apricot', 'yellow', 'blue'];
const baht = (n) => `${Number(n).toLocaleString('th-TH')} บาท`;
const clip = (s, n) => String(s).slice(0, n);

const text = (t, extra = {}) => ({ type: 'text', text: t, wrap: true, color: PALETTE.ink, ...extra });

// primary → black; secondary → a pastel chosen by `tone` (index into TONES)
export const msgButton = (label, sendText, shop, style = 'secondary', tone = 0) => ({
  type: 'button',
  style,
  height: 'sm',
  color: style === 'primary' ? pal(shop).ink : pal(shop)[TONES[tone % TONES.length]],
  action: { type: 'message', label: clip(label, 20), text: sendText ?? label },
});

const uriButton = (label, uri, shop) => ({
  type: 'button',
  style: 'primary',
  height: 'sm',
  color: pal(shop).ink,
  action: { type: 'uri', label: clip(label, 20), uri },
});

// Every bubble gets the cream paper behind it.
const bubble = (shop, parts) => ({
  type: 'bubble',
  ...parts,
  styles: ['header', 'hero', 'body', 'footer'].reduce(
    (o, k) => ({ ...o, [k]: { backgroundColor: pal(shop).cream } }),
    {}
  ),
});

// Pictures live in public/ and are reachable only once the server knows its own
// https address (shop.assetBase). Without it every card simply has no picture.
// Each one sits in the top-right corner of the card's header band.
const PICTURES = {
  staff: { w: 84, ratio: '773:800' },
  admin: { w: 80, ratio: '800:778' },
  school: { w: 92, ratio: '800:630' },
  order: { w: 112, ratio: '1024:377' },
  ask: { w: 112, ratio: '1024:398' },
};
export function picture(shop, name) {
  const spec = PICTURES[name];
  if (!shop.assetBase || !spec) return null;
  return {
    type: 'image',
    url: `${shop.assetBase}/assets/${name}.png`,
    size: `${spec.w}px`,
    aspectRatio: spec.ratio,
    aspectMode: 'fit',
    flex: 0,
    align: 'end',
    gravity: 'center',
  };
}

const flex = (altText, contents, quickReply) => ({
  type: 'flex',
  altText: clip(altText, 400),
  contents,
  ...(quickReply ? { quickReply } : {}),
});

function header(title, shop, imageName, height) {
  const pic = imageName ? picture(shop, imageName) : null;
  return {
    type: 'box',
    layout: 'horizontal',
    backgroundColor: pal(shop).apricot,
    paddingAll: 'lg',
    spacing: 'md',
    ...(height ? { height } : {}),
    contents: [text(title, { weight: 'bold', size: 'md', flex: 1, gravity: 'center' }), ...(pic ? [pic] : [])],
  };
}

// ข้อความสั้นพร้อมปุ่มหัวข้อ (ใช้ทั้งทักทายและตอบไม่ตรง)
export function menuCard(shop, title, body, { image } = {}) {
  const topicList = (shop.quickReplies ?? [])
    .slice(0, 6)
    .map((t) => (typeof t === 'string' ? { label: t, text: t } : t));
  return flex(
    title,
    bubble(shop, {
      header: header(title, shop, image),
      body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [text(body, { size: 'sm' })] },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          ...topicList.map((t, i) => msgButton(t.label, t.text, shop, 'secondary', i)),
          msgButton('คุยกับแอดมิน', 'แอดมิน', shop, 'primary'),
        ],
      },
    })
  );
}

// An FAQ entry may carry `link: { label, url }` → a button that opens the page,
// and the address is also written out so it can be copied.
export function faqCard(shop, entry, quickReply) {
  const title = entry.label || 'ข้อมูลร้าน';
  const link = entry.link?.url ? entry.link : null;
  return flex(
    `${title}: ${entry.answer}${link ? ` ${link.url}` : ''}`,
    bubble(shop, {
      header: header(title, shop, entry.image),
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          text(entry.answer, { size: 'sm' }),
          ...(link ? [text(link.url, { size: 'xs', color: pal(shop).muted })] : []),
        ],
      },
      ...(link ? { footer: { type: 'box', layout: 'vertical', contents: [uriButton(link.label || 'เปิดลิงก์', link.url, shop)] } } : {}),
    }),
    quickReply
  );
}

// Products without their own `image` take turns with these (the roomy, roughly
// square pictures; the wide ones would leave no room for the name).
const PRODUCT_PICTURES = ['school', 'staff', 'admin'];

function productBubble(p, shop, index = 0) {
  const inStock = p.inStock !== false;
  return bubble(shop, {
    size: 'kilo',
    // fixed height so the cards of one carousel line up whatever the picture's shape
    header: header(p.name, shop, p.image || PRODUCT_PICTURES[index % PRODUCT_PICTURES.length], '104px'),
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: [
        text(`${baht(p.price)} / ${p.unit ?? 'ชิ้น'}`, { size: 'xl', weight: 'bold', color: pal(shop).accent }),
        ...(p.bulk ? [text(`จำนวนมาก: ${p.bulk}`, { size: 'xs', color: pal(shop).muted })] : []),
        text(inStock ? '● มีสินค้า' : '● สินค้าหมดชั่วคราว', {
          size: 'sm',
          weight: 'bold',
          color: inStock ? pal(shop).ok : pal(shop).warn,
        }),
      ],
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      contents: [msgButton(inStock ? 'สั่งซื้อ/สอบถาม' : 'ถามวันเข้าสินค้า', 'แอดมิน', shop, 'primary')],
    },
  });
}

// LINE carousel allows at most 12 bubbles.
export function productCards(shop, products, quickReply) {
  const shown = products.slice(0, 10);
  const alt = shown.map((p) => `${p.name} ${baht(p.price)}/${p.unit ?? 'ชิ้น'}`).join(' | ');
  const contents =
    shown.length === 1
      ? productBubble(shown[0], shop, 0)
      : { type: 'carousel', contents: shown.map((p, i) => productBubble(p, shop, i)) };
  return flex(alt, contents, quickReply);
}

// ส่งลิงก์รายการอุปกรณ์ของโรงเรียน — ปุ่มเปิดลิงก์ + ลิงก์ตัวหนังสือให้ก๊อปได้
export function schoolLinkCard(shop, school, message) {
  return flex(
    `${school.name}: ${school.link}`,
    bubble(shop, {
      header: header(school.name, shop, 'school'),
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [text(message, { size: 'sm' }), text(school.link, { size: 'xs', color: pal(shop).muted })],
      },
      footer: { type: 'box', layout: 'vertical', contents: [uriButton('เปิดรายการอุปกรณ์', school.link, shop)] },
    })
  );
}

// A short message under a titled header with a picture in its corner. Returns null
// without a picture so the caller can fall back to plain text.
export function noteCard(shop, imageName, title, body, quickReply) {
  if (!picture(shop, imageName)) return null;
  return flex(
    `${title}: ${body}`,
    bubble(shop, {
      header: header(title, shop, imageName),
      body: { type: 'box', layout: 'vertical', contents: [text(body, { size: 'sm' })] },
    }),
    quickReply
  );
}
