// LINE Flex Message builders. Everything here is plain data → easy to test.

const DEFAULT_THEME = '#2E7D6B';

const color = (shop) => shop.theme || DEFAULT_THEME;
const baht = (n) => `${Number(n).toLocaleString('th-TH')} บาท`;
const clip = (s, n) => String(s).slice(0, n);

const text = (t, extra = {}) => ({ type: 'text', text: t, wrap: true, ...extra });

export const msgButton = (label, sendText, shop, style = 'secondary') => ({
  type: 'button',
  style,
  height: 'sm',
  ...(style === 'primary' ? { color: color(shop) } : {}),
  action: { type: 'message', label: clip(label, 20), text: sendText ?? label },
});

// Pictures live in public/ and are reachable only once the server knows its own
// https address (shop.assetBase). Without it every card simply has no picture.
const SIZE = { banner: '953:375' };
export function picture(shop, name) {
  if (!shop.assetBase) return null;
  const banner = name === 'banner';
  return {
    type: 'image',
    url: `${shop.assetBase}/assets/${name}.png`,
    size: 'full',
    aspectRatio: SIZE[name] || '20:13',
    aspectMode: 'fit',
    backgroundColor: banner ? '#FAF7F0' : '#FFFFFF',
  };
}

const flex = (altText, contents, quickReply) => ({
  type: 'flex',
  altText: clip(altText, 400),
  contents,
  ...(quickReply ? { quickReply } : {}),
});

function header(title, shop) {
  return {
    type: 'box',
    layout: 'vertical',
    backgroundColor: color(shop),
    paddingAll: 'lg',
    contents: [text(title, { color: '#FFFFFF', weight: 'bold', size: 'md' })],
  };
}

// ข้อความสั้นพร้อมปุ่มหัวข้อ (ใช้ทั้งทักทายและตอบไม่ตรง)
// shop.iconUrl (set by the server when it knows its public address) puts the
// shop's picture in front of the text.
export function menuCard(shop, title, body, { banner = false } = {}) {
  const topicList = (shop.quickReplies ?? [])
    .slice(0, 6)
    .map((t) => (typeof t === 'string' ? { label: t, text: t } : t));
  const message = text(body, { size: 'sm', flex: 1, gravity: 'center' });
  const content = shop.iconUrl
    ? {
        type: 'box',
        layout: 'horizontal',
        spacing: 'md',
        contents: [
          { type: 'image', url: shop.iconUrl, size: '64px', aspectRatio: '1:1', aspectMode: 'cover', flex: 0 },
          message,
        ],
      }
    : message;
  const hero = banner ? picture(shop, 'banner') : null;
  return flex(title, {
    type: 'bubble',
    ...(hero ? { hero } : { header: header(title, shop) }),
    body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [content] },
    footer: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: [
        ...topicList.map((t) => msgButton(t.label, t.text, shop)),
        msgButton('คุยกับแอดมิน', 'แอดมิน', shop, 'primary'),
      ],
    },
  });
}

// An FAQ entry may carry `link: { label, url }` → a button that opens the page,
// and the address is also written out so it can be copied.
export function faqCard(shop, entry, quickReply) {
  const title = entry.label || 'ข้อมูลร้าน';
  const link = entry.link?.url ? entry.link : null;
  const hero = entry.image ? picture(shop, entry.image) : null;
  return flex(
    `${title}: ${entry.answer}${link ? ` ${link.url}` : ''}`,
    {
      type: 'bubble',
      ...(hero ? { hero } : {}),
      header: header(title, shop),
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          text(entry.answer, { size: 'sm' }),
          ...(link ? [text(link.url, { size: 'xs', color: '#666666' })] : []),
        ],
      },
      ...(link
        ? {
            footer: {
              type: 'box',
              layout: 'vertical',
              contents: [
                {
                  type: 'button',
                  style: 'primary',
                  height: 'sm',
                  color: color(shop),
                  action: { type: 'uri', label: clip(link.label || 'เปิดลิงก์', 20), uri: link.url },
                },
              ],
            },
          }
        : {}),
    },
    quickReply
  );
}

function productBubble(p, shop) {
  const inStock = p.inStock !== false;
  return {
    type: 'bubble',
    size: 'kilo',
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: [
        text(p.name, { weight: 'bold', size: 'md' }),
        text(`${baht(p.price)} / ${p.unit ?? 'ชิ้น'}`, { size: 'xl', weight: 'bold', color: color(shop) }),
        ...(p.bulk ? [text(`จำนวนมาก: ${p.bulk}`, { size: 'xs', color: '#666666' })] : []),
        text(inStock ? '● มีสินค้า' : '● สินค้าหมดชั่วคราว', {
          size: 'sm',
          weight: 'bold',
          color: inStock ? '#1B8A3B' : '#C62828',
        }),
      ],
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      contents: [
        msgButton(inStock ? 'สั่งซื้อ/สอบถาม' : 'ถามวันเข้าสินค้า', 'แอดมิน', shop, 'primary'),
      ],
    },
  };
}

// LINE carousel allows at most 12 bubbles.
export function productCards(shop, products, quickReply) {
  const shown = products.slice(0, 10);
  const alt = shown.map((p) => `${p.name} ${baht(p.price)}/${p.unit ?? 'ชิ้น'}`).join(' | ');
  const contents =
    shown.length === 1
      ? productBubble(shown[0], shop)
      : { type: 'carousel', contents: shown.map((p) => productBubble(p, shop)) };
  return flex(alt, contents, quickReply);
}

// ส่งลิงก์รายการอุปกรณ์ของโรงเรียน — ปุ่มเปิดลิงก์ + ลิงก์ตัวหนังสือให้ก๊อปได้
export function schoolLinkCard(shop, school, message) {
  const hero = picture(shop, 'school');
  return flex(`${school.name}: ${school.link}`, {
    type: 'bubble',
    ...(hero ? { hero } : {}),
    header: header(school.name, shop),
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'md',
      contents: [text(message, { size: 'sm' }), text(school.link, { size: 'xs', color: '#666666' })],
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'button',
          style: 'primary',
          height: 'sm',
          color: color(shop),
          action: { type: 'uri', label: 'เปิดรายการอุปกรณ์', uri: school.link },
        },
      ],
    },
  });
}


// A short message under a picture. Returns null without a picture so the caller
// can fall back to plain text.
export function noteCard(shop, imageName, body) {
  const hero = picture(shop, imageName);
  if (!hero) return null;
  return flex(body, {
    type: 'bubble',
    hero,
    body: { type: 'box', layout: 'vertical', contents: [text(body, { size: 'sm' })] },
  });
}
