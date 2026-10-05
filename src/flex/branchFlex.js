import { formatBaht } from '../utils/currency.js';
import { formatThaiDate } from '../utils/dates.js';
import { COLORS } from './theme.js';
import { header } from './components/header.js';
import { divider } from './components/divider.js';
import { footerActions } from './components/footerActions.js';
import { joinMeta } from './components/metaLine.js';

/* การ์ดของสองร้าน — "ถ้าฉันถามว่า 'วันนี้มีงานอะไรบ้าง' ให้สรุปแยกเป็น 2 ร้าน
 * ให้ชัดเจน" และ "ดูงานนัฐภรณ์ ปริ้นงาน ให้แสดงเฉพาะงานของนัฐภรณ์ ปริ้นงาน"
 */

const money = (n) => formatBaht(Number(n) || 0);

function statRow(label, value, color = COLORS.ink) {
  return {
    type: 'box',
    layout: 'horizontal',
    contents: [
      { type: 'text', text: label, size: 'sm', color: COLORS.sub, flex: 5 },
      { type: 'text', text: value, size: 'sm', weight: 'bold', color, align: 'end', flex: 4 },
    ],
  };
}

// กล่องของร้านหนึ่งร้านบนการ์ดรวม
function shopBlock(shop) {
  const rows = [
    { type: 'text', text: shop.branch.name, size: 'md', weight: 'bold', color: COLORS.accentText, wrap: true },
    statRow('วันนี้', shop.todayCount ? `${shop.todayCount} งาน · ${money(shop.todayTotal)}` : 'ยังไม่มีงานเข้า'),
  ];
  rows.push(
    statRow('ค้างเก็บ', shop.owed > 0 ? `${money(shop.owed)} (${shop.openCount} ใบ)` : 'ไม่มีค้างค่ะ', shop.owed > 0 ? COLORS.red : COLORS.green),
  );
  return { type: 'box', layout: 'vertical', spacing: 'xs', contents: rows };
}

export function branchOverviewFlex(sum) {
  const body = [];
  sum.shops.forEach((shop, i) => {
    if (i > 0) body.push(divider());
    body.push(shopBlock(shop));
  });

  /* งานที่ยังไม่ระบุร้านไม่ถูกซ่อน — เงินของมันไม่อยู่ในร้านไหนเลย ถ้าไม่โชว์
   * ยอดรวมจะไม่เท่ากับสองร้านบวกกัน แล้วร้านจะไล่หาเงินที่ "หาย" อยู่ครึ่งวัน
   */
  if (sum.unassigned.count > 0) {
    body.push(divider());
    body.push(
      statRow('ยังไม่ระบุร้าน', `${sum.unassigned.count} งาน · ค้าง ${money(sum.unassigned.owed)}`, COLORS.orange),
    );
  }

  body.push(divider());
  body.push(statRow('รวมวันนี้ทั้งหมด', `${sum.combined.todayCount} งาน · ${money(sum.combined.todayTotal)}`, COLORS.accentText));
  body.push(statRow('ค้างเก็บรวม', money(sum.combined.owed), sum.combined.owed > 0 ? COLORS.red : COLORS.green));

  return {
    type: 'flex',
    altText: `สรุปสองร้าน · ค้างเก็บรวม ${money(sum.combined.owed)}`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: header('🏪 สรุปแยกร้าน', formatThaiDate(sum.date)),
      body: { type: 'box', layout: 'vertical', spacing: 'md', paddingAll: 'lg', contents: body },
      footer: footerActions({
        secondary: sum.shops.slice(0, 2).map((s) => ({
          label: shortName(s.branch.name),
          data: `action=branch_view&branch=${encodeURIComponent(s.branch.slug)}`,
          displayText: `ดูงาน${s.branch.name}`,
        })),
      }),
    },
  };
}

// ชื่อบนปุ่ม — LINE ให้ป้ายปุ่มยาวได้ 20 ตัวอักษร ชื่อเต็มสองร้านยาวไม่เท่ากัน
// ตัดคำหน้า (นัฐภรณ์) ที่ซ้ำกันทั้งคู่ออก เหลือคำที่ต่างกันซึ่งสั้นและชัดกว่า
function shortName(name) {
  const parts = String(name || '').trim().split(/\s+/);
  const tail = parts.length > 1 ? parts.slice(1).join(' ') : name;
  return ('ดู ' + tail).slice(0, 20);
}

function jobRow(job, amountColor = COLORS.ink) {
  return {
    type: 'box',
    layout: 'horizontal',
    contents: [
      {
        type: 'box',
        layout: 'vertical',
        flex: 5,
        contents: [
          { type: 'text', text: job.job_name || 'งาน', size: 'sm', weight: 'bold', wrap: true },
          {
            type: 'text',
            text: joinMeta(job.customer_name, job.due_date ? 'นัด ' + formatThaiDate(job.due_date) : formatThaiDate(job.job_date)) || ' ',
            size: 'xs',
            color: COLORS.grey,
            wrap: true,
          },
        ],
      },
      { type: 'text', text: money(job.total), size: 'sm', color: amountColor, align: 'end', gravity: 'center', flex: 3 },
    ],
  };
}

function section(title, rows) {
  return [
    { type: 'text', text: title, size: 'xs', weight: 'bold', color: COLORS.sub },
    ...rows,
  ];
}

export function branchDetailFlex(branch, detail, opts = {}) {
  const body = [];

  const today = detail.todayJobs.slice(0, 5).map((j) => jobRow(j));
  body.push(
    ...section(
      `วันนี้ · ${detail.money.todayCount} งาน · ${money(detail.money.todayTotal)}`,
      today.length ? today : [{ type: 'text', text: 'ยังไม่มีงานเข้าวันนี้ค่ะ', size: 'sm', color: COLORS.grey }],
    ),
  );

  /* คิวงาน เรียงจากนัดรับ — งานเลยนัด/นัดใกล้ขึ้นก่อน ตามที่ร้านขอให้
   * "ช่วยเรียงลำดับว่างานไหนควรทำก่อน"
   */
  // งานที่โชว์ในช่อง "วันนี้" แล้ว ไม่ต้องขึ้นซ้ำในคิว
  const shown = new Set(detail.todayJobs.slice(0, 5).map((j) => j.id));
  const queue = detail.queue.filter((j) => !shown.has(j.id)).slice(0, 5);
  if (queue.length) {
    body.push(divider());
    body.push(...section(`คิวงานที่ควรทำก่อน · ค้างอยู่ ${detail.queue.length} งาน`, queue.map((j) => jobRow(j))));
  }

  const owedJobs = detail.owedJobs.slice(0, 5).map((j) => jobRow(j, COLORS.red));
  body.push(divider());
  body.push(
    ...section(
      detail.money.owed > 0 ? `ค้างเก็บ · ${money(detail.money.owed)} (${detail.money.openCount} ใบ)` : 'ค้างเก็บ · ไม่มีค่ะ 🎉',
      owedJobs.length ? owedJobs : [{ type: 'text', text: 'เก็บเงินครบทุกใบแล้วค่ะ', size: 'sm', color: COLORS.green }],
    ),
  );

  return {
    type: 'flex',
    altText: `${branch.name} · วันนี้ ${detail.money.todayCount} งาน · ค้างเก็บ ${money(detail.money.owed)}`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: header('🏪 ' + branch.name, `ทั้งหมด ${detail.money.count} งาน · ${money(detail.money.total)}`),
      body: { type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: 'lg', contents: body },
      footer: footerActions({
        secondary: [
          { label: 'ดูทั้งสองร้าน', data: 'action=branch_view', displayText: 'ดูงานทั้งสองร้าน' },
          ...(opts.other
            ? [{
                label: shortName(opts.other.name),
                data: `action=branch_view&branch=${encodeURIComponent(opts.other.slug)}`,
                displayText: `ดูงาน${opts.other.name}`,
              }]
            : []),
        ],
      }),
    },
  };
}
