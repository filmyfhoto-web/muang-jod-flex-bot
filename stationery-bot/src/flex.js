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
export function menuCard(shop, title, body) {
  const topics = (shop.quickReplies ?? []).slice(0, 6);
  return flex(title, {
    type: 'bubble',
    header: header(title, shop),
    body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [text(body, { size: 'sm' })] },
    footer: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: [
        ...topics.map((t) => msgButton(t, t, shop)),
        msgButton('คุยกับแอดมิน', 'แอดมิน', shop, 'primary'),
      ],
    },
  });
}

export function faqCard(shop, entry, quickReply) {
  const title = entry.label || 'ข้อมูลร้าน';
  return flex(
    `${title}: ${entry.answer}`,
    {
      type: 'bubble',
      header: header(title, shop),
      body: { type: 'box', layout: 'vertical', contents: [text(entry.answer, { size: 'sm' })] },
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
  return flex(`${school.name}: ${school.link}`, {
    type: 'bubble',
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

// LINE quick replies stop at 13 buttons, so schools go in a carousel instead:
// 10 per page, each button sends the full school name as the customer's message.
export function schoolPicker(shop, schools) {
  const PAGE = 10;
  const pages = [];
  for (let i = 0; i < schools.length && pages.length < 12; i += PAGE) pages.push(schools.slice(i, i + PAGE));
  const bubbles = pages.map((group, i) => ({
    type: 'bubble',
    size: 'kilo',
    header: header(`เลือกโรงเรียน (${i + 1}/${pages.length})`, shop),
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'xs',
      contents: group.map((sc) => msgButton(sc.name.replace(/^โรงเรียน/, ''), sc.name, shop)),
    },
  }));
  return flex('เลือกโรงเรียน', bubbles.length === 1 ? bubbles[0] : { type: 'carousel', contents: bubbles });
}
