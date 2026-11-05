import { reply } from '../services/lineService.js';
import { getBookJobs } from '../services/jobService.js';
import { buildAccount, accountKey } from '../utils/customerBook.js';
import { matchCustomer } from '../utils/customerMatch.js';
import { formatBaht } from '../utils/currency.js';
import { formatThaiDate } from '../utils/dates.js';
import { liffPage } from '../utils/liff.js';
import { COLORS, themed } from '../flex/theme.js';

/* การ์ดลูกค้ารายคน — พิมพ์ชื่อแล้วเห็นงาน "ทุกใบ" ของเขา เก็บเงินแยกใบได้
 *
 * ร้านขอตรง ๆ: "ลูกค้าคนไหนที่มีงานหลายชิ้น คนละอย่าง ช่วยแสดงทั้งหมดด้วย
 * บางอย่างชื่อเดียวกันแต่ขอแยกจ่าย" — ลูกค้าโรงเรียน/หน่วยงานส่งหลายงาน บางงาน
 * ชื่อซ้ำกัน และจ่ายแยกทีละใบ
 *
 *   แถวละงานเสมอ ไม่รวบ — งานชื่อซ้ำแยกกันด้วยเลขงาน+วันที่
 *   ใบที่ค้างมีปุ่ม 💵 สด / 🏦 โอน ของตัวเอง (action=sbn เดิม — กติกาเงิน
 *   อยู่ที่ statusPatch ที่เดียว) = แยกจ่ายรายใบโดยธรรมชาติ
 *   เทียบชื่อแบบ accountKey เดียวกับสมุดลูกค้า — "รร สบกอน" เจอ "รร.สบกอน"
 */

const ROWS_PER_BUBBLE = 6;
const MAX_BUBBLES = 12; // เพดาน carousel ของ LINE

function collectChip(job, code, label, spoken) {
  return {
    type: 'button',
    style: 'secondary',
    height: 'sm',
    flex: 2,
    action: {
      type: 'postback',
      label,
      data: `action=sbn&id=${job.id}&c=${code}`,
      displayText: `${spoken} — ${job.jobName || 'งาน'}`,
    },
  };
}

function jobRow(job) {
  const owed = Number(job.owed) || 0;
  const moneyLine =
    owed > 0
      ? {
          type: 'box',
          layout: 'horizontal',
          spacing: 'sm',
          alignItems: 'center',
          contents: [
            { type: 'text', text: `ค้าง ${formatBaht(owed)}`, size: 'sm', weight: 'bold', color: COLORS.red, flex: 3 },
            collectChip(job, 'cash', '💵 สด', 'เก็บเงินสดแล้ว'),
            collectChip(job, 'transfer', '🏦 โอน', 'รับโอนแล้ว'),
          ],
        }
      : {
          type: 'box',
          layout: 'horizontal',
          contents: [
            { type: 'text', text: formatBaht(Number(job.total) || 0), size: 'sm', weight: 'bold', color: COLORS.ink, flex: 3 },
            {
              type: 'text',
              text: job.billed ? '✓ จ่ายแล้ว · ออกใบแล้ว' : '✓ จ่ายแล้ว',
              size: 'xs',
              color: COLORS.green,
              align: 'end',
              flex: 4,
            },
          ],
        };

  return {
    type: 'box',
    layout: 'vertical',
    spacing: 'xs',
    margin: 'md',
    contents: [
      { type: 'text', text: job.jobName || 'งาน', size: 'sm', color: COLORS.ink, wrap: true },
      {
        // เลขงาน+วันที่คือตัวแยกงาน "ชื่อเดียวกัน" สองใบออกจากกัน
        type: 'text',
        text: [job.jobNumber, formatThaiDate(job.jobDate)].filter(Boolean).join(' · '),
        size: 'xxs',
        color: COLORS.grey,
      },
      moneyLine,
    ],
  };
}

function headerBox(account) {
  return {
    type: 'box',
    layout: 'vertical',
    backgroundColor: COLORS.tint,
    cornerRadius: 'lg',
    paddingAll: 'md',
    spacing: 'xs',
    contents: [
      { type: 'text', text: `👤 ${account.name}`, size: 'md', weight: 'bold', color: COLORS.title, wrap: true },
      {
        type: 'text',
        text:
          `${account.jobCount} งาน · รวม ${formatBaht(account.total)}` +
          (account.owed > 0.009 ? ` · ค้าง ${formatBaht(account.owed)}` : ' · จ่ายครบแล้ว'),
        size: 'xs',
        color: account.owed > 0.009 ? COLORS.red : COLORS.green,
        wrap: true,
      },
    ],
  };
}

export function customerCardMessage(jobs, name) {
  const account = buildAccount(jobs, accountKey(name));
  if (!account) return null;

  // ทุกใบเรียงใหม่สุดก่อน (ในกลุ่มเรียงมาแล้ว) — โชว์ครบทุกใบ ไม่ใช่แค่หัวกอง
  const rows = account.groups.flatMap((g) => g.jobs).sort((a, b) => String(b.jobDate).localeCompare(String(a.jobDate)));

  const bubbles = [];
  for (let at = 0; at < rows.length && bubbles.length < MAX_BUBBLES; at += ROWS_PER_BUBBLE) {
    const chunk = rows.slice(at, at + ROWS_PER_BUBBLE);
    const body = [
      ...(at === 0
        ? [headerBox(account)]
        : [{ type: 'text', text: `👤 ${account.name} (ต่อ)`, size: 'sm', weight: 'bold', color: COLORS.title, wrap: true }]),
      ...chunk.map(jobRow),
    ];

    const leftOut = at + ROWS_PER_BUBBLE >= MAX_BUBBLES * ROWS_PER_BUBBLE ? rows.length - (at + chunk.length) : 0;
    if (leftOut > 0) {
      body.push({ type: 'text', text: `… และอีก ${leftOut} งาน (ดูครบในสมุดลูกค้า)`, size: 'xs', color: COLORS.grey, wrap: true, margin: 'md' });
    }

    bubbles.push(
      themed({
        type: 'bubble',
        size: 'mega',
        body: { type: 'box', layout: 'vertical', spacing: 'xs', paddingAll: 'lg', contents: body },
      })
    );
  }

  // ท้ายใบสุดท้าย: ทางไปสมุดลูกค้าหน้าของเจ้านี้ + ออกบิลรวมของเขา (ของเดิมทั้งคู่)
  const book = liffPage('book', { key: account.key });
  const last = bubbles[bubbles.length - 1];
  const footer = [];
  if (book) {
    footer.push({
      type: 'button',
      style: 'secondary',
      height: 'sm',
      action: { type: 'uri', label: '📒 เปิดสมุดลูกค้า', uri: book },
    });
  }
  const billData = `action=create_bill&customer=${encodeURIComponent(account.name)}`;
  if (account.owed > 0.009 && billData.length <= 290) {
    footer.push({
      type: 'button',
      style: 'secondary',
      height: 'sm',
      action: { type: 'postback', label: '🧾 ออกบิลของคนนี้', data: billData, displayText: `ออกบิล ${account.name}` },
    });
  }
  if (footer.length) {
    last.footer = {
      type: 'box',
      layout: 'horizontal',
      spacing: 'sm',
      paddingAll: 'md',
      paddingTop: 'none',
      contents: footer,
    };
    last.styles = { ...(last.styles || {}), footer: { backgroundColor: COLORS.surface } };
  }

  const contents = bubbles.length === 1 ? bubbles[0] : { type: 'carousel', contents: bubbles };
  return {
    type: 'flex',
    altText: `${account.name} — ${account.jobCount} งาน` + (account.owed > 0.009 ? ` · ค้าง ${formatBaht(account.owed)}` : ''),
    contents,
  };
}

/* "ขอดูงานของโรงเรียนบ้านห้วยฟอง" → ขอการ์ดลูกค้าเจ้านั้นตรง ๆ (ร้านสอนประโยคนี้มา)
 *
 * explicit = พูดว่า "ของใคร" ชัดเจน: หาไม่เจอก็ต้องตอบว่าไม่เจอ ไม่ปล่อยให้
 * ประโยคไหลไปโดนทายเป็นจดงานใหม่ชื่อ "ขอดูงานของ…" — ส่วนแบบไม่มี "ของ"
 * ("ดูงาน ครูแนน") เป็นแค่การเดา ไม่เจอก็ปล่อยผ่านให้ทางเดิมทำงานต่อ
 * ("ดูงานเชียงกลาง" เขียนติดกัน = มุมมองรายร้าน ถูกจับไปก่อนถึงเกตนี้แล้ว)
 */
export function parseCardAsk(text) {
  const t = String(text || '').trim();
  const withOf = /^(?:ขอ)?(?:ดูงาน|งาน)ของ\s*(.{1,60})$/.exec(t);
  if (withOf) return { name: withOf[1].trim(), explicit: true };
  const loose = /^(?:ขอ)?ดูงาน\s+(.{1,60})$/.exec(t);
  if (loose) return { name: loose[1].trim(), explicit: false };
  return null;
}

/* เกตในแชต: ข้อความเฉย ๆ ที่เป็น "ชื่อลูกค้าที่เคยจด" → การ์ดลูกค้า
 *
 * true = จัดการแล้ว (ตอบไปแล้ว) · false = ไม่ใช่ชื่อลูกค้า ให้ทางเดิมไหลต่อ
 * พิมพ์มาบางส่วนแล้วพ้องหลายเจ้า → ปุ่มชื่อเต็มแบบ message (แตะ = ส่งชื่อนั้น
 * กลับเข้าเกตนี้เอง — ไม่มีเพดาน 300 ตัวอักษรของ postback ให้ห่วง)
 */
export async function customerCardForText({ replyToken, profile }, text) {
  const t = String(text || '').trim();
  if (!t || t.length > 40 || /[\d๐-๙]/.test(t)) return false;

  let jobs;
  try {
    jobs = await getBookJobs(profile.id, 400);
  } catch {
    return false;
  }
  const names = [...new Set(jobs.map((j) => j?.customer_name).filter(Boolean))];
  const hit = matchCustomer(t, names);
  if (!hit) return false;

  if (hit.kind === 'exact') {
    const card = customerCardMessage(jobs, hit.name);
    if (!card) return false;
    await reply(replyToken, card);
    return true;
  }

  await reply(replyToken, {
    type: 'text',
    text: `เจอหลายเจ้าที่ชื่อคล้าย "${t}" ค่ะ หมายถึงท่านไหนคะ?`,
    quickReply: {
      items: hit.names.slice(0, 3).map((n) => ({
        type: 'action',
        action: { type: 'message', label: n.slice(0, 20), text: n },
      })),
    },
  });
  return true;
}
