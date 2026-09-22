import { parseNaturalJob, extractCustomer } from './nlParser.js';
import { deriveJobName, classifyJob } from './category.js';
import { round2 } from './currency.js';

/* จดรวดเดียวทั้งวัน แล้วให้ม่วงแยกเป็นงาน ๆ ให้
 *
 * ร้านบอกว่า "ถ้าเราใส่จดประจำวันอ่ะ แบบคิดได้ก็ใส่ ให้ม่วงแยกประจำวันให้ได้ไหม
 * บางทีไม่มีเวลามานั่งใส่เป็นหมวด ๆ"
 *
 * ของเดิมข้อความหลายบรรทัดถูกอ่านเป็น "งานเดียวที่มีหลายรายการ" ซึ่งแปลว่า
 * ลูกค้าสี่คนในสี่บรรทัดกลายเป็นบิลใบเดียวของคนแรก ส่วนชื่ออีกสามคนถูกยัดไป
 * เป็นชื่อสินค้า ("โรงเรียนบ้านปงสนุก ตรายาง") — ออกใบเสร็จให้ใครไม่ได้เลย
 *
 * ตรงนี้อ่านทีละบรรทัดแทน ซึ่งนอกจากจะแยกลูกค้าได้ถูกแล้ว ยังคิดเลขถูกกว่าเดิม
 * ด้วย: "สติ๊กเกอร์ 50 ดวง ดวงละ 5" ตัวอ่านหลายบรรทัดได้ ฿5 (จำนวนถูกกลืนไป
 * อยู่ในชื่อสินค้า) ส่วนตัวอ่านบรรทัดเดียวได้ ฿250 ซึ่งถูก
 */

// ขีดหรือจุดนำหน้าบรรทัด เป็นเครื่องหมายรายการ ไม่ใช่ส่วนหนึ่งของชื่อของ
const BULLET = /^[-–—•*+]\s*/;

// บรรทัดที่ไม่ได้สั่งอะไร เป็นหัวข้อของวันหรือคำพูดลอย ๆ
const NOISE_LINE = /^(?:วันนี้|เมื่อวาน|งานวันนี้|รายการวันนี้|สรุป|จด|จดงาน|โน้ต|note)\s*[:：]?\s*$/i;

function hasDigit(text) {
  return /[\d๐-๙]/.test(String(text || ''));
}

/* บรรทัดนี้เปิดกลุ่มใหม่ไหม
 *
 * "พี่ต่าย" เดี่ยว ๆ คือหัวกลุ่ม ของที่ตามมาข้างใต้เป็นของพี่ต่าย
 * "พี่ต่าย สติ๊กเกอร์ 50 ดวง" คือทั้งงานในบรรทัดเดียว ไม่ได้เปิดกลุ่มให้ใคร
 *
 * แยกสองแบบนี้ออกจากกันเพราะเดาผิดแล้วบิลผิดคน: ถ้าให้ชื่อลูกค้าไหลลงไปทุก
 * บรรทัดที่ไม่มีชื่อ งานขายหน้าร้านที่จดต่อท้ายจะกลายเป็นของลูกค้าคนก่อนหน้า
 */
function isHeading(line) {
  if (hasDigit(line)) return false;
  return Boolean(extractCustomer(line).customerName);
}

/* ข้อความหนึ่งก้อน → กลุ่มบรรทัดที่ควรเป็นงานเดียวกัน
 *
 * คืน [{ customer, lines }] โดยที่ customer มาจากหัวกลุ่มเท่านั้น ส่วนบรรทัด
 * ที่มีชื่อลูกค้าอยู่ในตัวเอง ปล่อยให้ตัวอ่านงานหยิบไปเอง
 */
export function groupLines(text) {
  const groups = [];
  let heading = null;

  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim().replace(BULLET, '').trim();
    if (!line || NOISE_LINE.test(line)) continue;

    if (isHeading(line)) {
      heading = extractCustomer(line).customerName;
      continue;
    }

    /* บรรทัดที่ตามหลังหัวกลุ่ม และไม่มีชื่อลูกค้าของตัวเอง = ของลูกค้าคนนั้น
     *
     * ร้านบอกว่า "บางทีอยากพิมพ์สั้น ๆ ว่างานนี้ชื่อเดียวกัน ม่วงแยกชื่อและงาน
     * ให้หน่อย แต่รับพร้อมกัน" — ของเดิมต้องย่อหน้าเข้ามาถึงจะรู้ว่าเป็นพวก
     * เดียวกัน ซึ่งไม่มีใครพิมพ์แบบนั้นในไลน์
     *
     * "รับพร้อมกัน" จึงรวมเป็นงานเดียวหลายรายการ ใบเสร็จของลูกค้าคนนั้นเป็น
     * ใบเดียว — ไม่ใช่แยกเป็นหลายงานที่ต้องออกใบเสร็จทีละใบ
     *
     * ยังไม่เดาเกินที่ร้านเขียนอยู่ดี: ต้องมี "หัวกลุ่ม" (บรรทัดที่มีแต่ชื่อ
     * ไม่มีของ) มาก่อนเท่านั้น บรรทัดที่มีทั้งชื่อและของไม่เปิดกลุ่มให้ใคร
     * งานขายหน้าร้านที่จดต่อท้ายจึงไม่ถูกยัดให้ลูกค้าคนก่อนหน้า
     */
    if (heading && !extractCustomer(line).customerName) {
      const last = groups[groups.length - 1];
      if (last && last.customer === heading) last.lines.push(line);
      else groups.push({ customer: heading, lines: [line] });
      continue;
    }

    // บรรทัดที่มีชื่อลูกค้าของตัวเอง ออกจากกลุ่มข้างบนแล้ว
    heading = null;
    groups.push({ customer: null, lines: [line] });
  }

  return groups;
}

/* กลุ่มบรรทัด → ร่างงานหนึ่งใบ
 *
 * ชื่อลูกค้าของหัวกลุ่มชนะ เพราะร้านตั้งใจเขียนไว้ตรงนั้น ส่วนที่ตัวอ่านเดาได้
 * จากบรรทัดเป็นตัวสำรอง
 */
function draftOf(group, index) {
  /* อ่านทีละบรรทัด ไม่ใช่ต่อกันแล้วอ่านทีเดียว
   *
   * ตัวอ่านหลายบรรทัดคิด "สติ๊กเกอร์ 50 ดวง ดวงละ 5" ได้ ฿5 เพราะจำนวนถูก
   * กลืนไปอยู่ในชื่อสินค้า ส่วนตัวอ่านบรรทัดเดียวได้ ฿250 ซึ่งถูก — กลุ่มที่มี
   * หลายบรรทัดจึงต้องอ่านทีละบรรทัดแล้วค่อยเอารายการมารวมกัน
   */
  const perLine = group.lines.map((line) => parseNaturalJob(line));

  /* บรรทัดสรุป ("ทั้งหมด 6*50 = 300") บอกยอด ไม่ได้สั่งของ
   *
   * พอยอดถูกยกออกไปแล้ว บรรทัดก็ไม่เหลืออะไร ตัวอ่านจึงคืนรายการเปล่าชื่อ "งาน"
   * ราคา 0 มาให้ — กลายเป็นรายการที่สามบนใบเสร็จที่ลูกค้าไม่ได้สั่ง
   */
  const items = perLine
    .filter((p) => !(p.statedTotal != null && p.subtotal === 0))
    .flatMap((p) => p.items || []);
  const stated = perLine.map((p) => p.statedTotal).find((t) => t != null);
  const parsed = {
    customerName: perLine.map((p) => p.customerName).find(Boolean) || null,
    jobName: perLine.map((p) => p.jobName).find(Boolean) || null,
    paidAmount: perLine.reduce((s, p) => s + (Number(p.paidAmount) || 0), 0),
    statedTotal: stated == null ? null : stated,
  };
  const subtotal = round2(items.reduce((s, it) => s + (Number(it.total) || 0), 0));
  const total = parsed.statedTotal != null ? parsed.statedTotal : subtotal;

  return {
    no: index + 1,
    customerName: group.customer || parsed.customerName || null,
    jobName: parsed.jobName || deriveJobName(items) || 'งาน',
    items,
    subtotal,
    discount: round2(subtotal - total),
    total,
    paidAmount: parsed.paidAmount || 0,
    // บรรทัดที่ร้านพิมพ์มาจริง ๆ เอาไว้โชว์บนการ์ดให้ตรวจว่าแยกถูกไหม
    source: group.lines.join(' · '),
  };
}

/* บรรทัดนี้เป็น "งาน" จริงไหม
 *
 * ตัวอ่านคืนรายการหนึ่งใบเสมอ แม้ข้อความจะเป็นคำทักทาย — ถ้าเชื่อแค่ว่ามี
 * รายการ "สวัสดีค่ะ / วันนี้เป็นยังไงบ้าง" ก็กลายเป็นการจดงานสองงาน
 *
 * ใช้เกณฑ์เดียวกับทางของงานเดี่ยวในตัวจัดการข้อความ: มีตัวเลข และ (มีราคา
 * หรือเป็นของที่ระบบรู้จักว่าเป็นงานประเภทไหน) — กองหนึ่งกองจึงแปลว่า
 * "หลายอย่างที่แต่ละอันก็ถูกรับเป็นงานได้อยู่แล้วถ้าพิมพ์มาเดี่ยว ๆ"
 */
function isRealJob(job, group) {
  if (!job.items.length) return false;
  if (!hasDigit(group.lines.join(' '))) return false;
  return job.total > 0 || Boolean(classifyJob(job.items));
}

/* ข้อความที่ร้านจดรวดเดียว → หลายงาน
 *
 * คืน { jobs, total } — jobs ว่างแปลว่าอ่านไม่ออกสักบรรทัด
 */
export function splitDump(text) {
  const groups = groupLines(text);
  const jobs = groups
    .map(draftOf)
    .filter((j, i) => isRealJob(j, groups[i]))
    // เลขลำดับต้องเรียงตามที่เหลือจริง ไม่ใช่ตามก่อนกรอง
    .map((j, i) => ({ ...j, no: i + 1 }));

  return { jobs, total: round2(jobs.reduce((s, j) => s + (Number(j.total) || 0), 0)) };
}

/* ข้อความนี้เป็น "จดหลายบรรทัดรวดเดียว" ไหม
 *
 * ไม่ได้ถามว่ามีหลายลูกค้าไหม — ถามว่าควรอ่านทีละบรรทัดไหม ลูกค้าคนเดียวที่
 * จดมาสามบรรทัดก็ต้องมาทางนี้ เพราะตัวอ่านหลายบรรทัดแบบเดิมกลืนจำนวนไปอยู่ใน
 * ชื่อของ ("สติ๊กเกอร์ 50 ดวง ดวงละ 5" คิดได้ ฿5 แทนที่จะเป็น ฿250) ตัวเรียก
 * เป็นคนตัดสินเองว่าผลที่ได้เป็นงานเดียวหรือหลายงาน
 *
 * บรรทัดเดียวไม่ต้องมาทางนี้ ตัวอ่านบรรทัดเดียวถูกอยู่แล้ว
 */
export function looksLikeDump(text) {
  const lines = String(text || '').split('\n').filter((l) => l.trim());
  if (lines.length < 2) return false;
  return splitDump(text).jobs.length >= 1;
}
