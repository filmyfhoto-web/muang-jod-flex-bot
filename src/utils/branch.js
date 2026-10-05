/* ร้านสองร้านของเจ้าของ — จับว่าข้อความพูดถึงร้านไหน
 *
 * ร้านบอกว่า "ให้ม่วงจดดูข้อมูลรวมจากระบบหลังร้านได้ แต่ต้องแยกงานของแต่ละร้าน
 * ให้ชัดเจน ห้ามนำงานมาปนกัน"
 *
 * จุดที่พลาดง่ายที่สุดของงานนี้: ชื่อร้านสองร้านขึ้นต้นเหมือนกัน — "นัฐภรณ์
 * ปริ้นงาน" กับ "นัฐภรณ์ เชียงกลาง" ถ้าจับคำว่า "นัฐภรณ์" แล้วตอบร้านแรก งาน
 * ครึ่งหนึ่งจะลงผิดร้านเงียบ ๆ โดยไม่มีใครรู้จนกว่าจะปิดบัญชีสิ้นเดือนแล้วยอด
 * ไม่ตรง ไฟล์นี้จึงคิด "คำที่ชี้เฉพาะร้านนั้น" จากรายชื่อร้านจริงที่มีอยู่
 * ไม่ใช่จากคำที่เขียนตายไว้ — คำที่อีกร้านก็มีเหมือนกันจะไม่ถูกนับว่าชี้ร้านไหน
 * เลย และข้อความกำกวมจะได้ null กลับไปเพื่อให้ไปถามว่า "ลงร้านไหนดีคะ"
 */

// ร้านตั้งต้นของเจ้าของ สร้างให้ครั้งเดียวตอนใช้ครั้งแรก
export const DEFAULT_BRANCHES = Object.freeze([
  Object.freeze({ slug: 'print', name: 'นัฐภรณ์ ปริ้นงาน', sort: 0 }),
  Object.freeze({ slug: 'chiangklang', name: 'นัฐภรณ์ เชียงกลาง', sort: 1 }),
]);

/* คำสะกดอื่นที่ร้านพิมพ์จริง
 *
 * "ปริ้นงาน" มีวิธีสะกดเยอะมากและทุกแบบถูกใช้จริง ถ้าไม่รับไว้ ร้านพิมพ์ "ปริ้นท์"
 * แล้วม่วงถามกลับว่าลงร้านไหน ทั้งที่บอกไปแล้ว
 */
const ALIASES = Object.freeze({
  print: Object.freeze(['ปริ้นงาน', 'ปริ้น', 'ปริ้นท์', 'ปริ้นต์', 'ปริ๊น', 'ปริ๊นท์', 'พริ้น', 'พริ้นท์', 'print', 'printing']),
  chiangklang: Object.freeze(['เชียงกลาง', 'chiangklang', 'chiang klang']),
});

/* ตัดช่องว่างและเครื่องหมายคั่นออกก่อนเทียบ
 *
 * ภาษาไทยเว้นวรรคตามใจคนพิมพ์ "ปริ้น งาน" กับ "ปริ้นงาน" คือคำเดียวกัน และชื่อ
 * ร้านเองก็มีช่องว่างอยู่กลางชื่อ การเทียบแบบตรงตัวอักษรจึงพลาดเกือบทุกครั้ง
 */
export function norm(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[\s_.·,:;|/\\()[\]{}"'`\-–—]/g, '');
}

// ชื่อร้านตัดเป็นคำ ๆ ตามช่องว่างที่เจ้าของพิมพ์ไว้เอง
function words(name) {
  return String(name ?? '')
    .split(/\s+/)
    .map((w) => norm(w))
    .filter(Boolean);
}

/* คำที่ชี้ร้านนี้ร้านเดียว
 *
 * คำที่ชื่อร้านอื่นก็มี (เช่น "นัฐภรณ์") ถูกตัดทิ้ง เหลือเฉพาะคำที่พูดแล้วรู้
 * ทันทีว่าหมายถึงร้านไหน บวกชื่อเต็มแบบไม่มีช่องว่าง และคำสะกดอื่นของ slug
 */
export function branchKeys(branch, all = []) {
  const others = all.filter((b) => b !== branch && String(b?.slug) !== String(branch?.slug));
  const taken = new Set(others.flatMap((b) => words(b.name)));

  const keys = new Set();
  const full = norm(branch?.name);
  if (full) keys.add(full);
  for (const w of words(branch?.name)) {
    // คำสั้นเกินไปชนคำอื่นในประโยคได้ง่าย เช่น "งาน"
    if (w.length >= 3 && !taken.has(w)) keys.add(w);
  }
  for (const a of ALIASES[branch?.slug] || []) keys.add(norm(a));
  const slug = norm(branch?.slug);
  if (slug.length >= 3) keys.add(slug);
  return [...keys];
}

/* ข้อความนี้พูดถึงร้านไหน
 *
 * คืน null เมื่อไม่พบ และเมื่อ "พบมากกว่าหนึ่งร้าน" ด้วย — ประโยคที่พูดถึงทั้ง
 * สองร้านไม่ใช่คำสั่งให้ลงร้านใดร้านหนึ่ง มันคือคำสั่งที่ต้องถามกลับ
 */
export function matchBranch(text, branches = []) {
  const hay = norm(text);
  if (!hay) return null;

  const hits = branches.filter((b) => branchKeys(b, branches).some((k) => k && hay.includes(k)));
  return hits.length === 1 ? hits[0] : null;
}

// ข้อความนี้พูดถึงทั้งสองร้านพร้อมกันไหม ("ดูงานทั้งสองร้าน" ไม่ใช่ความกำกวม)
export function matchesAll(text, branches = []) {
  const hay = norm(text);
  if (!hay || branches.length < 2) return false;
  if (/(ทั้งสอง|ทั้ง2|ทั้ง๒|ทุกร้าน|สองร้าน|รวมทุกร้าน|ทั้งหมดทุกร้าน)/.test(String(text))) return true;
  return branches.every((b) => branchKeys(b, branches).some((k) => k && hay.includes(k)));
}

/* เอาชื่อร้านออกจากข้อความ เหลือแต่เนื้องาน
 *
 * "นัฐภรณ์ ปริ้นงาน ป้ายไวนิล 60x100 150 บาท" ต้องกลายเป็น "ป้ายไวนิล 60x100
 * 150 บาท" ก่อนส่งให้ตัวอ่านงาน ไม่งั้นชื่อร้านจะถูกอ่านเป็นชื่อลูกค้า แล้ว
 * ใบเสร็จจะออกในนามร้านตัวเอง
 *
 * ตัดจากข้อความจริง ไม่ใช่จากข้อความที่ normalize แล้ว เพราะต้องคืนข้อความที่
 * ยังอ่านออกกลับไป
 */
export function stripBranch(text, branch, branches = []) {
  let out = String(text ?? '');
  if (!branch) return out.trim();

  // ชื่อเต็มก่อน แล้วค่อยคำสั้น ไม่งั้นตัดคำสั้นออกแล้วชื่อเต็มจะเหลือเศษค้าง
  const names = [branch.name, ...(ALIASES[branch.slug] || [])]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  for (const name of names) {
    // ยอมให้มีช่องว่างแทรกกลางคำได้เท่าไหร่ก็ได้ ตามที่คนพิมพ์จริง
    const pattern = [...String(name)]
      .filter((ch) => !/\s/.test(ch))
      .map((ch) => ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('\\s*');
    if (!pattern) continue;
    out = out.replace(new RegExp(pattern, 'gi'), ' ');
  }

  // คำที่เหลือค้างอย่าง "ร้าน" หรือ "ของ" ที่นำหน้าชื่อร้าน
  return out.replace(/\s+/g, ' ').replace(/^[\s·,\-–—]*(?:ร้าน|ของ|ที่)?\s*/, '').trim();
}

/* แยกกองงานตามร้าน
 *
 * งานที่ยังไม่ได้ระบุร้านไม่ถูกยัดเข้าร้านใดร้านหนึ่ง มันไปอยู่ใน unassigned
 * ให้ร้านเห็นว่ามีค้างอยู่กี่ใบและกดย้ายเอง — การเดาแทนคือการทำบัญชีผิดให้เขา
 */
export function groupByBranch(jobs = [], branches = []) {
  const byId = new Map(branches.map((b) => [String(b.id), b]));
  const groups = branches.map((b) => ({ branch: b, jobs: [] }));
  const index = new Map(branches.map((b, i) => [String(b.id), i]));
  const unassigned = [];

  for (const job of jobs) {
    const key = String(job?.branch_id ?? '');
    if (key && byId.has(key)) groups[index.get(key)].jobs.push(job);
    else unassigned.push(job);
  }
  return { groups, unassigned };
}
