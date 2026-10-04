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
// `blob` is the soft pastel shape behind the character: a circle for the tall pictures,
// a rounded pill for the wide ones.
const PICTURES = {
  staff: { w: 104, ratio: '773:800', blob: 'circle', tint: '#FFE1D3' },
  admin: { w: 106, ratio: '800:778', blob: 'circle', tint: '#DCEBFF' },
  school: { w: 122, ratio: '800:630', blob: 'circle', tint: '#FFF0B3' },
  order: { w: 170, ratio: '1024:377', blob: 'pill', tint: '#FFF0B3' },
  ask: { w: 170, ratio: '1024:398', blob: 'pill', tint: '#DCEBFF' },
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
    gravity: 'bottom', // stands on the lower edge of the band
  };
}

// The picture with its pastel shape behind it, as one block for the header's corner.
function cornerArt(shop, name) {
  const pic = picture(shop, name);
  if (!pic) return null;
  const spec = PICTURES[name];
  const [rw, rh] = spec.ratio.split(':').map(Number);
  const h = Math.round((spec.w * rh) / rw);
  const boxW = spec.w + 8;
  const circle = spec.blob === 'circle';
  const d = Math.round(Math.min(spec.w, h) * 0.94);
  const blob = {
    type: 'box',
    layout: 'vertical',
    position: 'absolute',
    contents: [],
    backgroundColor: spec.tint,
    width: `${circle ? d : Math.round(spec.w * 0.96)}px`,
    height: `${circle ? d : h}px`,
    cornerRadius: circle ? `${Math.round(d / 2)}px` : '22px',
    offsetBottom: '0px',
    offsetStart: `${circle ? Math.round((boxW - d) / 2) : 4}px`,
  };
  return {
    type: 'box',
    layout: 'vertical',
    flex: 0,
    width: `${boxW}px`,
    height: `${h + 6}px`,
    // both layers are placed absolutely, shape first, so the picture is always on top
    contents: [blob, { ...pic, position: 'absolute', offsetBottom: '0px', offsetStart: '4px', align: undefined, gravity: undefined }],
  };
}

const flex = (altText, contents, quickReply) => ({
  type: 'flex',
  altText: clip(altText, 400),
  contents,
  ...(quickReply ? { quickReply } : {}),
});

// Title on the left; the picture is big and tucked into the top-right corner with no
// padding on its side or underneath. No coloured band: the picture sits straight on the
// card's cream paper.
function header(title, shop, imageName, height) {
  const pic = imageName ? cornerArt(shop, imageName) : null;
  return {
    type: 'box',
    layout: 'horizontal',
    backgroundColor: pal(shop).cream,
    ...(pic
      ? { paddingTop: 'md', paddingBottom: 'none', paddingStart: 'lg', paddingEnd: 'sm' }
      : { paddingAll: 'lg' }),
    spacing: 'md',
    ...(height ? { height } : {}),
    contents: [
      text(title, { weight: 'bold', size: 'md', flex: 1, gravity: 'center' }),
      ...(pic ? [pic] : []),
    ],
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
          ...(shop.contact?.button ? [msgButton(shop.contact.button, shop.contact.button, shop, 'primary')] : []),
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
    header: header(p.name, shop, p.image || PRODUCT_PICTURES[index % PRODUCT_PICTURES.length], '116px'),
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
      contents: [
        inStock
          ? msgButton('สั่งซื้อ', 'สั่งของ', shop, 'primary')
          : msgButton('ถามวันเข้าสินค้า', `ถามวันเข้าสินค้า ${p.name}`, shop, 'primary'),
      ],
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

// A round profile photo. A box with a corner radius clips the image to a circle.
function avatar(url, size = 44) {
  return {
    type: 'box',
    layout: 'vertical',
    flex: 0,
    width: `${size}px`,
    height: `${size}px`,
    cornerRadius: `${Math.round(size / 2)}px`,
    contents: [{ type: 'image', url, size: `${size}px`, aspectRatio: '1:1', aspectMode: 'cover' }],
  };
}

// "ต้องการติดต่อใคร?" — one button per person, with their photo when LINE gave us one
// (`photos` maps a person's name to an https image URL). The button sends "ติดต่อ <name>".
export function contactCard(shop, text, photos = {}) {
  const ppl = shop.contact?.people ?? [];
  return flex(
    `${text} ${ppl.map((p) => `ติดต่อ ${p.name}`).join(' / ')}`,
    bubble(shop, {
      header: header('ติดต่อแอดมิน', shop, 'admin'),
      body: { type: 'box', layout: 'vertical', contents: [text_(text)] },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: ppl.map((p, i) => {
          const button = { ...msgButton(`ติดต่อ ${p.name}`, `ติดต่อ ${p.name}`, shop, 'secondary', i), flex: 1 };
          return photos[p.name]
            ? { type: 'box', layout: 'horizontal', spacing: 'md', alignItems: 'center', contents: [avatar(photos[p.name]), button] }
            : button;
        }),
      },
    })
  );
}
const text_ = (t) => text(t, { size: 'sm' });

// What pops up on the admin's LINE. `customer` / `contactPhoto` are optional photos.
export function notifyCard(shop, { title, customerName, customerPhoto, contactName, contactPhoto, said, link, altText }) {
  const who = [
    ...(customerPhoto ? [avatar(customerPhoto, 48)] : []),
    {
      type: 'box',
      layout: 'vertical',
      flex: 1,
      justifyContent: 'center',
      contents: [
        text(customerName || 'ไม่ทราบชื่อ', { weight: 'bold', size: 'md' }),
        text('ลูกค้า', { size: 'xs', color: pal(shop).muted }),
      ],
    },
  ];
  const wants = contactName
    ? {
        type: 'box',
        layout: 'horizontal',
        spacing: 'md',
        alignItems: 'center',
        contents: [
          text('ต้องการติดต่อ', { size: 'sm', color: pal(shop).muted, flex: 0 }),
          ...(contactPhoto ? [avatar(contactPhoto, 32)] : []),
          text(contactName, { weight: 'bold', size: 'md', flex: 1 }),
        ],
      }
    : text('ยังไม่ได้เลือกว่าจะติดต่อใคร', { size: 'sm', weight: 'bold', color: pal(shop).accent });
  return flex(
    altText,
    bubble(shop, {
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: pal(shop).cream,
        paddingAll: 'lg',
        contents: [text(title, { weight: 'bold', size: 'md' })],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          { type: 'box', layout: 'horizontal', spacing: 'md', alignItems: 'center', contents: who },
          wants,
          ...(said ? [text(`“${said}”`, { size: 'sm', color: pal(shop).ink })] : []),
          text('ตอบในแชท OA ของร้าน (ไม่ใช่ห้องนี้)', { size: 'xs', color: pal(shop).muted }),
        ],
      },
      ...(link
        ? { footer: { type: 'box', layout: 'vertical', contents: [uriButton('เปิดแชทตอบลูกค้า', link, shop)] } }
        : {}),
    })
  );
}
