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

/* แบบเข้มสำหรับ "ข้อความจดงาน" — จับเฉพาะเมื่อพูดถึงร้านแบบตั้งใจ
 *
 * ในข้อความจดงาน คำหลวม ๆ อันตราย: "ปริ้นงานเอกสาร 100 แผ่น 150 บาท" คือ
 * งานปริ้น ไม่ใช่ร้านปริ้นงาน และ "ป้ายโรงเรียนเชียงกลาง 150" คือลูกค้าชื่อ
 * โรงเรียนเชียงกลาง ไม่ใช่ร้านเชียงกลาง — จับผิดแล้วชื่อร้าน/ลูกค้าถูกตัดทิ้ง
 * จากใบงานเลย
 *
 * จึงนับเฉพาะ: ชื่อเต็ม ("นัฐภรณ์ ปริ้นงาน") หรือมีคำว่า ร้าน/ลงร้าน นำหน้า
 * ("ร้านเชียงกลาง", "ลงร้านปริ้น") ที่เหลือปล่อยให้ตอนกดบันทึกถามเอาเองว่า
 * "งานนี้ลงร้านไหนดีคะ" — ถามหนึ่งครั้งถูกกว่าเดาผิดหนึ่งครั้งเสมอ
 */
export function matchBranchStrict(text, branches = []) {
  const hay = norm(text);
  if (!hay) return null;

  const hits = branches.filter((b) => {
    const full = norm(b?.name);
    if (full && full.length >= 4 && hay.includes(full)) return true;
    return branchKeys(b, branches).some((k) => k && (hay.includes('ร้าน' + k) || hay.includes('ลง' + k)));
  });
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

  // คำที่เหลือค้างอย่าง "ร้าน" "ลงร้าน" หรือ "ของ" ที่นำหน้าชื่อร้าน
  return out.replace(/\s+/g, ' ').replace(/^[\s·,\-–—]*(?:ลงร้าน|ลง|ร้าน|ของ|ที่)?\s*/, '').trim();
}

/* "ดูงานนัฐภรณ์ ปริ้นงาน" — คำสั่งขอดูงานของร้าน
 *
 * คำสั่งดูไม่ใช่การจดงาน จึงไม่มีตัวเลข ไม่มีราคา — ใช้ข้อนี้เป็นตัวกันพลาด:
 * ประโยคที่มีตัวเลขหรือ "บาท" ไม่มีทางเป็นคำสั่งดู ปล่อยให้ไปทางจดงานตามเดิม
 *
 * คืน { branch } เมื่อชี้ร้านเดียว, { all: true } เมื่อพูดถึงทั้งสองร้านหรือ
 * พูดกำกวม ("ดูงานนัฐภรณ์" — คำตอบที่ปลอดภัยคือสรุปให้ทั้งคู่ ไม่ใช่เดาร้าน),
 * และ null เมื่อไม่ใช่คำสั่งดูร้านเลย
 */
const VIEW_WORDS = /(ดู|เช็ค|เช็ก|เปิด|สรุป|ขอ|ส่อง)/;
const TOPIC_WORDS = /(งาน|ยอด|บัญชี|สมุด|รายการ|เงิน)/;

/* "วันนี้มีงานอะไรบ้าง" — คำถามที่เจ้าของบอกไว้ตรง ๆ ว่าจะถาม และสั่งว่า
 * คำตอบคือสรุปแยกเป็นสองร้านให้ชัดเจน ไม่ใช่คำทักทายต้อนรับ
 */
export const TODAY_QUESTION = /(วันนี้\s*มี\s*งาน|มี\s*งาน\s*อะไร\s*(?:บ้าง|มั่ง|ไหม|มั้ย))/;

export function parseBranchView(text, branches = []) {
  const raw = String(text ?? '').trim();
  if (!raw || branches.length === 0) return null;
  if (/[\d๐-๙]/.test(raw) || /บาท/.test(raw)) return null;
  if (!VIEW_WORDS.test(raw) && !TOPIC_WORDS.test(raw)) return null;

  const one = matchBranch(raw, branches);
  if (one) return { branch: one };
  if (matchesAll(raw, branches)) return { all: true };

  // พูดถึงเจ้าของร้านหรือคำว่าร้าน แต่ชี้ไม่ได้ว่าร้านไหน → สรุปให้ทั้งคู่
  const hay = norm(raw);
  const shared = branches
    .flatMap((b) => String(b?.name ?? '').split(/\s+/).map(norm))
    .filter((w, _, arr) => w.length >= 3 && arr.filter((x) => x === w).length > 1);
  if (shared.some((w) => hay.includes(w))) return { all: true };
  return null;
}

/* "ย้าย MJ-SGN-0001 ไปร้านเชียงกลาง" — ย้ายงานเข้าร้านจากแชต
 *
 * งานเก่าทุกใบถูกจดก่อนจะมีสองร้าน จึงขึ้นเป็น "ยังไม่ระบุร้าน" ทั้งหมด และ
 * งานที่เผลอลงผิดร้านก็ต้องย้ายได้โดยไม่ต้องเปิดหน้าเว็บ
 *
 * ไม่บอกเลขงาน = งานล่าสุด ("ย้ายไปร้านเชียงกลาง" หลังเพิ่งจดเสร็จ) — คำตอบ
 * จะทวนเลขงานกลับไปเสมอ จะได้เห็นทันทีถ้าม่วงหยิบใบผิด
 */
const JOB_NUMBER = /MJ-[A-Z]{2,4}-\d{1,6}/i;

export function parseMoveCommand(text, branches = []) {
  const raw = String(text ?? '').trim();
  if (!/^ย้าย/.test(raw)) return null;
  if (!/(ไป|เข้า|ลง)/.test(raw)) return null;

  const branch = matchBranch(raw, branches);
  if (!branch) return null;

  const number = raw.match(JOB_NUMBER)?.[0]?.toUpperCase() || null;
  return { ref: number || 'latest', branch };
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
