// The order cards of the "แชตและออเดอร์" page (a LINE Flex message, so it looks like a card, not a plain text):
//   · buildCustomerCard  the summary the staff send to the customer ("ส่งสรุปให้ลูกค้า") — the customer checks the items and the total
//   · buildTeamCard      a new order for the team (saved on the page) — the people on the shop's contact list get it once
// Both are built from the database rows of the order (sale_orders + sale_order_items), never from what the page sent, so the
// totals are the ones the server worked out. Plain strings only: nothing here changes a page, a database row or a price.

const COLOR = { head: '#12335F', ink: '#1B2433', muted: '#6B7587', line: '#E3E9F1', total: '#0F2A4F', tot_bg: '#FFF4D6' };
const MAX_ROWS = 15; // a long order is cut short in the card; the page has the full list

const clip = (s, n) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
};
export const money = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qtyText = (n) => {
  const v = Number(n || 0);
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
};
// "2026-11-04" → "4 พ.ย. 2569" (Thai month names, Buddhist year), "" when empty
const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
export function thaiDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return '';
  return `${Number(m[3])} ${TH_MONTHS[Number(m[2]) - 1]} ${Number(m[1]) + 543}`;
}

const text = (t, o = {}) => ({ type: 'text', text: String(t), wrap: true, size: 'sm', color: COLOR.ink, ...o });
const row = (label, value, o = {}) => ({
  type: 'box',
  layout: 'horizontal',
  spacing: 'sm',
  contents: [text(label, { size: 'sm', color: COLOR.muted, flex: 3 }), text(value, { size: 'sm', align: 'end', flex: 5, ...o })],
});
const sep = () => ({ type: 'separator', margin: 'md', color: COLOR.line });

function itemRows(items) {
  const shown = items.slice(0, MAX_ROWS).map((it) =>
    row(`${clip(it.name, 60)}  ×${qtyText(it.qty)}${it.unit ? ' ' + clip(it.unit, 12) : ''}`, money(it.line_total ?? Number(it.qty || 0) * Number(it.unit_price || 0)), { weight: 'regular' }),
  );
  if (items.length > MAX_ROWS) shown.push(text(`และอีก ${items.length - MAX_ROWS} รายการ (ดูครบในหน้าแชตและออเดอร์)`, { size: 'xs', color: COLOR.muted }));
  return shown;
}

function fulfilRows(order) {
  const out = [];
  out.push(row('การรับของ', order.fulfil === 'delivery' ? 'จัดส่ง' : 'รับที่ร้าน'));
  if (order.need_date) out.push(row('วันที่ต้องการ', thaiDate(order.need_date)));
  return out;
}

// the customer's card: the shop's name, what was ordered, the totals, and what to check
export function buildCustomerCard({ order, items = [] }, { shopName = 'ร้านของเรา', payNote = '' } = {}) {
  const vat = Number(order.vat_rate || 0) > 0 ? Number(order.vat_amount || 0) : 0;
  const body = [
    row('เลขที่', order.order_no || '-'),
    row('วันที่สั่ง', thaiDate(order.order_date) || '-'),
    row('ลูกค้า', clip(order.customer_name, 80) || '-'),
    sep(),
    ...itemRows(items),
    sep(),
    row('รวมเป็นเงิน', money(order.subtotal)),
    ...(vat > 0 ? [row(`ภาษีมูลค่าเพิ่ม ${Number(order.vat_rate)}%`, money(vat))] : []),
    {
      type: 'box',
      layout: 'horizontal',
      backgroundColor: COLOR.tot_bg,
      cornerRadius: '8px',
      paddingAll: '10px',
      contents: [
        text('ยอดรวมทั้งสิ้น', { weight: 'bold', flex: 4 }),
        text(`${money(order.total)} บาท`, { weight: 'bold', size: 'lg', align: 'end', color: COLOR.total, flex: 5 }),
      ],
    },
    ...fulfilRows(order),
    ...(order.note ? [sep(), text(`หมายเหตุ: ${clip(order.note, 300)}`, { size: 'sm', color: COLOR.muted })] : []),
    ...(payNote ? [sep(), text(clip(payNote, 300), { size: 'sm', color: COLOR.muted })] : []),
  ];
  return {
    type: 'flex',
    altText: `ยืนยันคำสั่งซื้อ ${order.order_no || ''} ยอดรวม ${money(order.total)} บาท`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: COLOR.head,
        paddingAll: '14px',
        contents: [text(clip(shopName, 60) || 'ร้านของเรา', { weight: 'bold', color: '#FFFFFF', size: 'md' }), text('ยืนยันคำสั่งซื้อ', { size: 'sm', color: '#DCEBFB' })],
      },
      body: { type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '14px', contents: body },
      footer: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '10px',
        contents: [text('รบกวนตรวจสอบรายการและยืนยันกลับมาในแชตนี้ค่ะ', { size: 'xs', color: COLOR.muted, align: 'center' })],
      },
    },
  };
}

// the team's card: a new order to act on — who, what, how much, when
export function buildTeamCard({ order, items = [] }, { shopName = '' } = {}) {
  const vat = Number(order.vat_rate || 0) > 0 ? Number(order.vat_amount || 0) : 0;
  const body = [
    row('ลูกค้า', clip(order.customer_name, 80) || '-'),
    ...(order.phone ? [row('เบอร์', clip(order.phone, 30))] : []),
    ...fulfilRows(order),
    sep(),
    ...itemRows(items),
    sep(),
    row('ยอดรวม', `${money(order.total)} บาท${vat > 0 ? ` (รวม VAT ${Number(order.vat_rate)}%)` : ''}`, { weight: 'bold' }),
    ...(order.note ? [sep(), text(`หมายเหตุ: ${clip(order.note, 300)}`, { size: 'sm', color: COLOR.muted })] : []),
  ];
  return {
    type: 'flex',
    altText: `คำสั่งงานใหม่ ${order.order_no || ''} · ${clip(order.customer_name, 40)} · ${money(order.total)} บาท`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: COLOR.head,
        paddingAll: '14px',
        contents: [
          text(`คำสั่งงานใหม่ ${order.order_no || ''}`.trim(), { weight: 'bold', color: '#FFFFFF', size: 'md' }),
          text(clip(shopName, 60) || 'แชตและออเดอร์', { size: 'sm', color: '#DCEBFB' }),
        ],
      },
      body: { type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '14px', contents: body },
      footer: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '10px',
        contents: [text('เปิดดูและบันทึกได้ในหน้า "แชตและออเดอร์"', { size: 'xs', color: COLOR.muted, align: 'center' })],
      },
    },
  };
}
