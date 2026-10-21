// ---------------------------------------------------------------------------------------------------------------
// A Flex Message drawn on the page the way LINE draws it (close enough to judge a card before it is sent).
// Covers what the bot's cards use: bubble / carousel, box, text, image, button, separator, spacer, filler.
// ---------------------------------------------------------------------------------------------------------------
const FX = {
  text: { xxs: 11, xs: 13, sm: 14, md: 16, lg: 19, xl: 22, xxl: 29, '3xl': 35, '4xl': 40, '5xl': 46 },
  space: { none: 0, xs: 2, sm: 4, md: 8, lg: 12, xl: 16, xxl: 20 },
  image: { xxs: 40, xs: 60, sm: 80, md: 100, lg: 120, xl: 140, xxl: 160, '3xl': 180, '4xl': 200, '5xl': 220 },
  bubble: { nano: 120, micro: 160, deca: 220, hecto: 241, kilo: 260, mega: 300, giga: 320 },
  radius: { none: 0, xs: 3, sm: 7, md: 10, lg: 13, xl: 16, xxl: 20 },
  border: { none: 0, light: 0.5, normal: 1, medium: 2, 'semi-bold': 3, bold: 4 },
};

// keyword | "12px" | "40%" | number → CSS length (or null)
function fxLen(v, table) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return `${v}px`;
  const s = String(v);
  if (table && s in table) return `${table[s]}px`;
  return /^-?\d+(\.\d+)?(px|%)$/.test(s) ? s : null;
}

function fxPlaceholder(label, w, hgt) {
  return h('div', { class: 'fx-missing', style: { width: w || '100%', height: hgt || '80px' } }, label);
}

function fxImage(n) {
  const size = n.size === 'full' ? '100%' : fxLen(n.size, FX.image) || '100px';
  const ratio = /^\d+(\.\d+)?:\d+(\.\d+)?$/.test(String(n.aspectRatio ?? '')) ? String(n.aspectRatio).replace(':', ' / ') : null;
  const img = h('img', { class: 'fx-img', alt: '', src: n.url, draggable: 'false' });
  img.style.width = size;
  if (ratio) img.style.aspectRatio = ratio;
  img.style.objectFit = n.aspectMode === 'cover' ? 'cover' : 'contain';
  // pictures the page does not hold (another web address) cannot be fetched here: LINE will show them, we show a box
  img.addEventListener('error', () => {
    const w = img.style.width;
    img.replaceWith(fxPlaceholder('รูป (แสดงใน LINE)', w, ratio ? '' : '80px'));
  });
  return img;
}

function fxButton(n, ctx) {
  const style = n.style || 'link';
  const el = h('div', { class: `fx-btn fx-btn-${style}`, role: 'button', tabindex: '0' }, String(n.action?.label ?? ''));
  if (n.color) {
    if (style === 'primary' || style === 'secondary') el.style.background = n.color;
    else el.style.color = n.color;
  }
  el.style.minHeight = n.height === 'sm' ? '40px' : '52px';
  const act = () => ctx?.onAction?.(n.action || {});
  el.addEventListener('click', act);
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      act();
    }
  });
  if (n.action?.type === 'uri') el.title = n.action.uri;
  return el;
}

function fxText(n) {
  const el = h('div', { class: 'fx-text' }, String(n.text ?? ''));
  let fs = FX.text[n.size];
  if (fs == null) {
    const m = /^(\d+(?:\.\d+)?)px$/.exec(String(n.size ?? ''));
    fs = m ? parseFloat(m[1]) : 14;
  }
  el.style.fontSize = `${fs}px`;
  if (n.weight === 'bold') el.style.fontWeight = '700';
  if (n.color) el.style.color = n.color;
  if (n.align === 'center') el.style.textAlign = 'center';
  else if (n.align === 'end') el.style.textAlign = 'right';
  if (n.wrap === false) el.classList.add('fx-nowrap');
  if (n.decoration === 'underline') el.style.textDecoration = 'underline';
  return el;
}

function fxNode(n, parentLayout, ctx) {
  if (!n || typeof n !== 'object') return document.createComment('');
  let el;
  switch (n.type) {
    case 'box': {
      const layout = n.layout || 'vertical';
      el = h('div', { class: `fx-box fx-${layout}` });
      const gap = fxLen(n.spacing, FX.space);
      if (gap) el.style.gap = gap;
      for (const kid of n.contents || []) {
        const ke = fxNode(kid, layout, ctx);
        const m = fxLen(kid?.margin, FX.space);
        if (m && ke.style) ke.style[layout === 'vertical' ? 'marginTop' : 'marginLeft'] = m;
        el.append(ke);
      }
      // padding
      const all = fxLen(n.paddingAll, FX.space);
      if (all) el.style.padding = all;
      for (const [prop, css] of [['paddingTop', 'paddingTop'], ['paddingBottom', 'paddingBottom'], ['paddingStart', 'paddingLeft'], ['paddingEnd', 'paddingRight']]) {
        const v = fxLen(n[prop], FX.space);
        if (v) el.style[css] = v;
      }
      if (n.backgroundColor) el.style.background = n.backgroundColor;
      const bw = n.borderWidth != null ? (n.borderWidth in FX.border ? FX.border[n.borderWidth] : parseFloat(n.borderWidth)) : 0;
      if (bw) {
        el.style.border = `${bw}px solid ${n.borderColor || '#ccc'}`;
      }
      const rad = fxLen(n.cornerRadius, FX.radius);
      if (rad) {
        el.style.borderRadius = rad;
        el.style.overflow = 'hidden';
      }
      if (n.alignItems) el.style.alignItems = { center: 'center', 'flex-start': 'flex-start', 'flex-end': 'flex-end' }[n.alignItems] || '';
      if (n.justifyContent) el.style.justifyContent = { center: 'center', 'flex-start': 'flex-start', 'flex-end': 'flex-end', 'space-between': 'space-between', 'space-around': 'space-around', 'space-evenly': 'space-evenly' }[n.justifyContent] || '';
      break;
    }
    case 'text':
      el = fxText(n);
      break;
    case 'image':
      el = fxImage(n);
      break;
    case 'button':
      el = fxButton(n, ctx);
      break;
    case 'separator':
      el = h('div', { class: 'fx-sep' });
      if (n.color) el.style.borderTopColor = n.color;
      break;
    case 'spacer':
      el = h('div', { class: 'fx-spacer' });
      el.style.height = fxLen(n.size, FX.space) || '8px';
      break;
    case 'filler':
      el = h('div', { class: 'fx-filler' });
      break;
    default:
      el = h('div', { class: 'fx-missing' }, `(${n.type ?? '?'})`);
  }

  if (el.nodeType !== 1) return el;
  // size and place inside the parent
  const w = fxLen(n.width);
  const hgt = fxLen(n.height);
  if (w && n.type !== 'image') el.style.width = w;
  if (hgt) el.style.height = hgt;
  if (fxLen(n.maxWidth)) el.style.maxWidth = fxLen(n.maxWidth);
  if (fxLen(n.maxHeight)) el.style.maxHeight = fxLen(n.maxHeight);
  if (n.position === 'absolute') {
    el.style.position = 'absolute';
    for (const [prop, css] of [['offsetTop', 'top'], ['offsetBottom', 'bottom'], ['offsetStart', 'left'], ['offsetEnd', 'right']]) {
      const v = fxLen(n[prop], FX.space);
      if (v) el.style[css] = v;
    }
  } else if (n.type !== 'spacer' && n.type !== 'filler' && n.type !== 'separator') {
    const f = n.flex != null ? Number(n.flex) : parentLayout === 'vertical' ? 0 : 1;
    el.style.flex = f > 0 && !(w && parentLayout !== 'vertical') ? `${f} 1 ${parentLayout === 'vertical' ? 'auto' : '0%'}` : '0 0 auto';
    if (n.type === 'text' || n.type === 'box') el.style.minWidth = '0';
  }
  // alignment of a child along the cross axis
  if (n.align && n.type === 'image') {
    if (parentLayout === 'vertical') el.style.alignSelf = { start: 'flex-start', center: 'center', end: 'flex-end' }[n.align] || '';
    else el.style.marginLeft = n.align === 'end' ? 'auto' : n.align === 'center' ? 'auto' : '';
  }
  if (n.gravity) {
    const g = { top: 'flex-start', center: 'center', bottom: 'flex-end' }[n.gravity];
    if (g && parentLayout !== 'vertical') el.style.alignSelf = g;
  }
  return el;
}

// → the element for one Flex Message (bubble or carousel). ctx.onAction(action) hears the buttons.
function renderFlex(msg, ctx = {}) {
  const c = msg?.contents;
  const bubble = (b) => {
    const el = h('div', { class: 'fx-bubble' });
    el.style.width = `${FX.bubble[b.size] ?? 300}px`;
    for (const part of ['header', 'hero', 'body', 'footer']) {
      if (!b[part]) continue;
      const sec = fxNode(b[part], 'vertical', ctx);
      if (sec.nodeType !== 1) continue;
      sec.classList.add('fx-section', `fx-${part}`);
      const bg = b.styles?.[part]?.backgroundColor;
      if (bg) sec.style.background = bg;
      sec.style.flex = 'none';
      el.append(sec);
    }
    if (b.styles?.body?.backgroundColor && !b.body) el.style.background = b.styles.body.backgroundColor;
    return el;
  };
  if (c?.type === 'carousel') return h('div', { class: 'fx-carousel' }, (c.contents || []).map(bubble));
  if (c?.type === 'bubble') return bubble(c);
  return h('div', { class: 'fx-missing' }, 'Flex ที่แสดงไม่ได้');
}
