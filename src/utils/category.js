// Two-level work taxonomy: a group ("งานพิมพ์") holding types ("ถ่ายเอกสาร").
// Jobs are classified automatically from item names; the LIFF form lets the
// owner correct it. Order matters — earlier entries win when keywords overlap,
// so put the more specific type first inside each group.

// ร้านขอให้แยกหมวดให้ชัดว่า "พิมพ์ / ป้าย / ตรายาง / สติ๊กเกอร์" — สี่อย่างนี้คือ
// งานที่ร้านทำจริง จึงเป็นหมวดของตัวเองทั้งสี่ ไม่ใช่ของที่ซ่อนอยู่ใต้หมวดอื่น
// ลำดับในนี้คือลำดับที่คนเห็น ส่วนลำดับที่ใช้จับคำดูที่ ALL_TYPES ข้างล่าง
export const CATEGORY_GROUPS = [
  {
    id: 'print',
    label: 'งานพิมพ์',
    icon: '🖨️',
    color: '#A78BFA', // purple
    types: [
      { id: 'copy', label: 'ถ่ายเอกสาร', icon: '📄', hint: 'ขาวดำ / สี / จำนวนหลายชุด', keys: ['ถ่ายเอกสาร', 'ถ่ายเอก', 'copy'] },
      { id: 'print', label: 'พิมพ์งาน', icon: '📄', hint: 'ไฟล์เอกสาร / ไฟล์ PDF / งานด่วน', keys: ['ปริ้น', 'พิมพ์งาน', 'พิมพ์เอกสาร', 'print', 'ใบปลิว', 'โบรชัวร์', 'แผ่นพับ', 'นามบัตร'] },
      { id: 'binding', label: 'เข้าเล่ม', icon: '📚', hint: 'สันห่วง / สันกาว / ไสกาว / ปกแข็ง', keys: ['เข้าเล่ม', 'สันห่วง', 'สันกาว', 'ไสกาว', 'ปกแข็ง', 'เคลือบ'] },
      { id: 'scan', label: 'สแกนเอกสาร', icon: '📠', hint: 'สแกนเป็นไฟล์ PDF / JPG', keys: ['สแกน', 'scan'] },
    ],
  },
  {
    id: 'sign',
    label: 'งานป้าย',
    icon: '🪧',
    color: '#F471B5', // pink, as in the proportions chart
    types: [
      { id: 'vinyl', label: 'ป้ายไวนิล', icon: '🪧', hint: 'ขนาดตามต้องการ / งานด่วน', keys: ['ไวนิล', 'อิงค์เจ็ท', 'ป้ายผ้า'] },
      { id: 'foamboard', label: 'โฟมบอร์ด', icon: '🧊', hint: 'ขนาดต่าง ๆ / พร้อมติดตั้ง', keys: ['โฟมบอร์ด', 'ฟิวเจอร์บอร์ด', 'พีพีบอร์ด'] },
      { id: 'banner', label: 'แบนเนอร์', icon: '🎌', hint: 'งานออกบูธ / ใช้โครง / ขอบตาไก่', keys: ['แบนเนอร์', 'โรลอัพ', 'x-stand', 'ธง', 'ออกบูธ'] },
      { id: 'standee', label: 'ป้ายตั้งโต๊ะ', icon: '🪧', hint: 'อะคริลิค / พลาสวูด / สั่งทำพิเศษ', keys: ['ตั้งโต๊ะ', 'อะคริลิค', 'พลาสวูด', 'ตัวอักษร', 'ป้าย'] },
    ],
  },
  {
    id: 'stamp',
    label: 'ตรายาง',
    icon: '🔖',
    color: '#FB923C', // orange

    types: [
      // "ปั๊ม" เฉย ๆ ไม่เอา ไม่งั้นปั๊มน้ำมันกับค่าปั๊มอะไรก็ตกมาลงหมวดนี้หมด
      { id: 'stamp', label: 'ตรายาง', icon: '🔖', hint: 'หมึกในตัว / ด้ามไม้ / สั่งทำตามแบบ', keys: ['ตรายาง', 'ตราปั๊ม', 'ปั๊มยาง', 'หมึกในตัว', 'stamp'] },
    ],
  },
  {
    id: 'sticker',
    label: 'สติ๊กเกอร์',
    icon: '🏷️',
    color: '#22C55E',
    types: [
      {
        id: 'sticker_board',
        label: 'สติ๊กเกอร์ฟิวเจอร์บอร์ด',
        icon: '📋',
        hint: 'สติ๊กเกอร์ติดบอร์ด / ป้ายตั้งพื้น',
        // ต้องชนะทั้งโฟมบอร์ดและสติ๊กเกอร์ ซึ่งอยู่คนละหมวดกัน ลำดับในลิสต์จึง
        // ตัดสินให้ไม่ได้ ต้องบอกลำดับการจับคำไว้ตรงนี้
        priority: 10,
        keys: ['สติ๊กเกอร์ฟิวเจอร์', 'สติกเกอร์ฟิวเจอร์', 'สติ๊กเกอร์บอร์ด', 'สติกเกอร์บอร์ด'],
        // เขียนสลับกันก็ต้องเข้า เช่น "ฟิวเจอร์บอร์ดติดสติ๊กเกอร์" — ทุกวงเล็บ
        // ต้องเจออย่างน้อยหนึ่งคำ ไม่ต้องไล่เดาลำดับคำเอง
        all: [
          ['สติ๊กเกอร์', 'สติกเกอร์'],
          ['ฟิวเจอร์', 'พีพีบอร์ด'],
        ],
      },
      { id: 'sticker', label: 'สติ๊กเกอร์', icon: '🏷️', hint: 'สติ๊กเกอร์ไดคัท / ฉลากสินค้า', keys: ['สติกเกอร์', 'สติ๊กเกอร์', 'ฉลาก', 'ไดคัท', 'label'] },
    ],
  },
  {
    id: 'photo',
    label: 'งานรูป & กรอบ',
    icon: '🖼️',
    color: '#38BDF8', // sky
    types: [
      // กรอบรูปมาก่อนรูปด่วน เพราะ "รูปหน้างานพร้อมกรอบ" ต้องไปลงกรอบรูป
      // ไม่ใช่รูปด่วน — กติกาของไฟล์นี้คือของที่เจาะจงกว่าต้องอยู่บนสุด
      { id: 'frame', label: 'กรอบรูป', icon: '🖼️', hint: 'ใส่กรอบ / เข้ากรอบ / พร้อมกรอบ', priority: 6, keys: ['กรอบรูป', 'ใส่กรอบ', 'เข้ากรอบ', 'พร้อมกรอบ', 'กรอบ'] },
      // "ปริ้นรูป" ต้องเป็นงานรูป ไม่ใช่งานพิมพ์ที่จับคำว่า "ปริ้น" ได้ก่อน
      { id: 'photo', label: 'อัดรูป', icon: '📷', hint: 'ขนาดต่าง ๆ / รูปติดบัตร / ปริ้นรูป', priority: 5, keys: ['รูปด่วน', 'อัดรูป', 'ล้างรูป', 'รูปติดบัตร', 'ปริ้นรูป'] },
    ],
  },
  {
    id: 'design',
    label: 'งานออกแบบ',
    icon: '🎨',
    color: '#60A5FA', // blue
    types: [
      { id: 'artwork', label: 'ออกแบบ / อาร์ตเวิร์ก', icon: '🎨', hint: 'โลโก้ / จัดหน้า / รีทัชรูป', keys: ['ออกแบบ', 'ดีไซน์', 'โลโก้', 'artwork', 'อาร์ตเวิร์ค', 'อาร์ตเวิร์ก', 'รีทัช'] },
    ],
  },
  {
    id: 'shipping',
    label: 'ค่าจัดส่ง / ขนส่ง',
    icon: '🚚',
    color: '#34D399',
    types: [
      { id: 'shipping', label: 'ค่าจัดส่ง', icon: '🚚', hint: 'ส่งของ / ค่ารถ / แมสเซนเจอร์', keys: ['จัดส่ง', 'ขนส่ง', 'ค่าส่ง', 'ค่ารถ', 'แมสเซนเจอร์', 'ems', 'kerry'] },
    ],
  },
];

export const OTHER_GROUP = { id: 'other', label: 'งานทั่วไป', icon: '📦', color: '#94A3B8', types: [] };

// ป้ายหัวการ์ด: "งานป้าย / ป้ายไวนิล" — แต่หมวดที่มีประเภทเดียวชื่อเดียวกัน
// ("ตรายาง / ตรายาง") พูดสองครั้งเปล่า ๆ
function pairLabel(group, type) {
  if (!type || type.label === group.label) return group.label;
  return `${group.label} / ${type.label}`;
}

/* ชุดหมวดงานชุดหนึ่ง — จุดเดียวที่เก็บ "วิธีจัดหมวด" ทั้งหมด
 *
 * ร้านขอ "แก้ไขหมวดงานเองได้ เพราะมันจะมีเพิ่มเติม" ชุดหมวดจึงไม่ใช่ค่าตายตัวในไฟล์
 * อีกต่อไป: ชุดตั้งต้นของระบบคือชุดหนึ่ง และร้านแต่ละร้านมีชุดของตัวเอง (เปลี่ยนชื่อ
 * ซ่อน เพิ่มหมวด/ประเภท เพิ่มคำค้น) สร้างด้วยฟังก์ชันนี้เหมือนกัน
 *
 * groups: ทุกหมวดรวมที่ซ่อนอยู่ — ที่ซ่อนยังต้องหาเจอ เพราะงานเก่าที่อยู่ในหมวดนั้น
 *         ต้องโชว์ชื่อหมวดถูกต่อไป แค่ไม่เสนอให้เลือก และไม่จัดงานใหม่เข้าไปเอง
 * group.keys     คำค้นระดับหมวด (จัดเข้าหมวดโดยไม่ระบุประเภท)
 * type.extraKeys คำค้นที่ร้านเพิ่มให้ประเภทนั้น ต่อท้ายคำค้นตั้งต้น
 * custom=true    ของที่ร้านเพิ่มเอง ชนะของระบบเมื่อคำซ้อนกัน (priority 100/99)
 */
export function createTaxonomy({ groups = CATEGORY_GROUPS, other = OTHER_GROUP } = {}) {
  const typeIndex = new Map(); // ทุกประเภท รวมที่ซ่อน
  const groupIndex = new Map();
  const visibleGroups = [];

  const allGroups = groups.map((g) => {
    const visibleTypes = (g.types || []).filter((t) => !t.hidden);
    const copy = { ...g, types: visibleTypes };
    groupIndex.set(copy.id, copy);
    for (const t of g.types || []) typeIndex.set(t.id, { ...t, group: copy });
    if (!g.hidden) visibleGroups.push(copy);
    return { ...g, types: g.types || [] };
  });
  groupIndex.set(other.id, other);

  // ลำดับการจับคำ ไม่ใช่ลำดับที่คนเห็น ของที่เจาะจงกว่าต้องได้ตรวจก่อน และบางอัน
  // ก็ต้องชนะของที่อยู่คนละหมวดกัน (สติ๊กเกอร์ฟิวเจอร์บอร์ด ต้องมาก่อนทั้งโฟมบอร์ด
  // ในหมวดป้าย และสติ๊กเกอร์ในหมวดของมันเอง) — priority สูงกว่าได้ตรวจก่อน ที่เท่ากัน
  // เรียงตามลิสต์เหมือนเดิม และคำค้นระดับหมวดมาหลังคำค้นของประเภททุกอัน
  const entries = [];
  for (const g of visibleGroups) {
    for (const t of g.types) {
      entries.push({ group: g, type: typeIndex.get(t.id), priority: t.priority || 0, keys: [...(t.keys || []), ...(t.extraKeys || [])], all: t.all });
    }
  }
  for (const g of visibleGroups) {
    if (g.keys?.length) entries.push({ group: g, type: null, priority: g.custom ? 99 : 0, keys: g.keys, all: null });
  }
  entries.sort((a, b) => b.priority - a.priority);

  const findGroup = (groupId) => groupIndex.get(groupId) || null;
  const findType = (typeId) => typeIndex.get(typeId) || null;

  // Classify one item name -> { group, type } (type อาจเป็น null เมื่อเข้าด้วยคำค้นระดับหมวด) หรือ null
  function classifyItem(name) {
    const n = String(name || '').toLowerCase();
    if (!n) return null;
    for (const e of entries) {
      // `all` คืองานที่ต้องมีครบทุกฝั่งถึงจะใช่ (แต่ละวงเล็บคือคำที่สะกดได้หลายแบบ)
      // ใช้กับของที่เป็นสองอย่างรวมกัน ซึ่งเขียนสลับลำดับคำได้
      if (e.all?.every((alts) => alts.some((k) => n.includes(k)))) return { group: e.group, type: e.type };
      if (e.keys.some((k) => n.includes(String(k).toLowerCase()))) return { group: e.group, type: e.type };
    }
    return null;
  }

  // Classify a job from its items: the first item that matches decides.
  function classifyJob(items = []) {
    for (const it of items) {
      const hit = classifyItem(it?.item_name);
      if (hit) return hit;
    }
    return null;
  }

  // The database columns a new/edited job should carry.
  function categoryFields(items = []) {
    const hit = classifyJob(items);
    return { category: hit?.group.id || other.id, category_type: hit?.type?.id || null };
  }

  // Presentation for a stored job (falls back to classifying its items).
  //
  // ประเภทที่บันทึกไว้ชนะหมวดที่บันทึกไว้ เพราะมันเจาะจงกว่า และเพราะงานที่จดไว้
  // ก่อนที่ตรายาง/สติ๊กเกอร์จะแยกออกมาเป็นหมวดของตัวเอง ยังมี category เป็นของเก่า
  // ติดอยู่ — ถ้าเชื่อหมวดที่เก็บไว้ งานเดิมจะโชว์ผิดหมวดตลอดไป
  function jobCategory(job = {}) {
    const type = findType(job.category_type);
    if (type) return { group: type.group, type };
    const group = findGroup(job.category);
    if (group) return { group, type: null };
    const hit = classifyJob(job.items || []);
    return { group: hit?.group || other, type: hit?.type || null };
  }

  function categoryLabel(job = {}) {
    const { group, type } = jobCategory(job);
    return pairLabel(group, type);
  }

  // { label, icon } for the group a job's items belong to, or null.
  function guessCategory(items = []) {
    const hit = classifyJob(items);
    if (!hit) return null;
    return { ...hit.group, label: pairLabel(hit.group, hit.type), groupLabel: hit.group.label, type: hit.type };
  }

  function itemIcon(itemName) {
    const hit = classifyItem(itemName);
    return hit?.type?.icon || hit?.group.icon || '📦';
  }

  // Job heading: the category when recognised, else derived from the items.
  function deriveJobName(items = []) {
    if (!items.length) return null;
    const hit = classifyJob(items);
    if (hit) return pairLabel(hit.group, hit.type);
    if (items.length === 1) return items[0].item_name;
    return `${items[0].item_name} +${items.length - 1} รายการ`;
  }

  return {
    groups: visibleGroups, // ที่เสนอให้เลือก (ไม่รวมที่ซ่อน) — ไม่รวม other
    allGroups, // ทุกหมวดรวมที่ซ่อน — ไม่รวม other
    other,
    findGroup,
    findType,
    classifyItem,
    classifyJob,
    categoryFields,
    jobCategory,
    categoryLabel,
    guessCategory,
    itemIcon,
    deriveJobName,
  };
}

export const BASE_TAXONOMY = createTaxonomy({ groups: CATEGORY_GROUPS, other: OTHER_GROUP });

/* ชุดหมวดของร้านแต่ละร้าน
 *
 * ทุกฟังก์ชันข้างล่างรับ "ของใคร" เป็นพารามิเตอร์ท้ายแบบไม่บังคับ (userId หรือชุดหมวด
 * ที่สร้างไว้แล้ว) — ไม่ใส่มา = ใช้ชุดตั้งต้นของโปรแกรม ซึ่งเป็นพฤติกรรมเดิมทุกอย่าง
 *
 * งานที่ถือ user_id มาในตัว (jobCategory/categoryLabel) หาชุดของเจ้าของเองได้เลย จึงไม่ต้อง
 * ไล่ส่ง userId ผ่านทุกการ์ดทุกหน้า ส่วนตัวแยกคำที่ไม่รู้ว่าใครพิมพ์ (nlParser, slots)
 * ใช้ชุดเดียวกับร้านถ้ามีร้านเดียวที่ปรับแต่งไว้ — บอทนี้ใช้ส่วนตัวร้านเดียว และถ้ามีหลายร้าน
 * ก็ยังรู้จักคำของทุกร้านเพื่อแยกว่าคำไหนคือ "ของ" ไม่ใช่ชื่อคน
 */
const owners = new Map(); // userId -> ชุดหมวดที่ร้านปรับแต่ง
let sharedTaxonomy = BASE_TAXONOMY; // ใช้เมื่อไม่รู้ว่าใครถาม และมีมากกว่าหนึ่งร้านปรับแต่งไว้

function rebuildShared() {
  if (owners.size < 2) {
    sharedTaxonomy = BASE_TAXONOMY;
    return;
  }
  const extra = [];
  for (const tax of owners.values()) {
    for (const g of tax.allGroups) if (g.custom && !g.hidden) extra.push(g);
  }
  sharedTaxonomy = createTaxonomy({ groups: [...CATEGORY_GROUPS, ...extra], other: OTHER_GROUP });
}

export function registerTaxonomy(userId, taxonomy) {
  if (!userId) return;
  if (taxonomy) owners.set(String(userId), taxonomy);
  else owners.delete(String(userId));
  rebuildShared();
}

export function taxonomyOf(userId) {
  return owners.get(String(userId || '')) || BASE_TAXONOMY;
}

export function hasTaxonomy(userId) {
  return owners.has(String(userId || ''));
}

export function resetTaxonomies() {
  owners.clear();
  rebuildShared();
}

function resolve(who) {
  if (who && typeof who === 'object' && typeof who.findGroup === 'function') return who;
  if (typeof who === 'string' && who) return owners.get(who) || BASE_TAXONOMY;
  if (owners.size === 1) return owners.values().next().value;
  return sharedTaxonomy;
}

export const findGroup = (groupId, who) => resolve(who).findGroup(groupId);
export const findType = (typeId, who) => resolve(who).findType(typeId);
export const classifyItem = (name, who) => resolve(who).classifyItem(name);
export const classifyJob = (items, who) => resolve(who).classifyJob(items);
export const categoryFields = (items, who) => resolve(who).categoryFields(items);
export const guessCategory = (items, who) => resolve(who).guessCategory(items);
export const itemIcon = (itemName, who) => resolve(who).itemIcon(itemName);
export const deriveJobName = (items, who) => resolve(who).deriveJobName(items);
export const jobCategory = (job = {}, who) => resolve(who ?? job?.user_id).jobCategory(job);
export const categoryLabel = (job = {}, who) => resolve(who ?? job?.user_id).categoryLabel(job);

// รหัสสามตัวของหมวดที่ร้านเพิ่มเอง (ใช้ทำเลขงาน MJ-XAA-0001) หรือ null ถ้าไม่ใช่หมวดของร้านไหนเลย
export function customCodeOf(groupId) {
  for (const tax of owners.values()) {
    const g = tax.findGroup(groupId);
    if (g?.custom && g.code) return g.code;
  }
  return null;
}

export function customGroupIdOfCode(code) {
  for (const tax of owners.values()) {
    const g = tax.allGroups.find((x) => x.custom && x.code === code);
    if (g) return g.id;
  }
  return null;
}
