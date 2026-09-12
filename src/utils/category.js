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

// ลำดับการจับคำ ไม่ใช่ลำดับที่คนเห็น ของที่เจาะจงกว่าต้องได้ตรวจก่อน และบางอัน
// ก็ต้องชนะของที่อยู่คนละหมวดกัน (สติ๊กเกอร์ฟิวเจอร์บอร์ด ต้องมาก่อนทั้งโฟมบอร์ด
// ในหมวดป้าย และสติ๊กเกอร์ในหมวดของมันเอง) — priority สูงกว่าได้ตรวจก่อน ที่เท่ากัน
// เรียงตามลิสต์เหมือนเดิม
const ALL_TYPES = CATEGORY_GROUPS.flatMap((g) => g.types.map((t) => ({ ...t, group: g }))).sort(
  (a, b) => (b.priority || 0) - (a.priority || 0)
);

export function findGroup(groupId) {
  return CATEGORY_GROUPS.find((g) => g.id === groupId) || (groupId === OTHER_GROUP.id ? OTHER_GROUP : null);
}

export function findType(typeId) {
  return ALL_TYPES.find((t) => t.id === typeId) || null;
}

// Classify one item name -> { group, type } or null.
export function classifyItem(name) {
  const n = String(name || '').toLowerCase();
  if (!n) return null;
  for (const type of ALL_TYPES) {
    // `all` คืองานที่ต้องมีครบทุกฝั่งถึงจะใช่ (แต่ละวงเล็บคือคำที่สะกดได้หลายแบบ)
    // ใช้กับของที่เป็นสองอย่างรวมกัน ซึ่งเขียนสลับลำดับคำได้
    if (type.all?.every((alts) => alts.some((k) => n.includes(k)))) return { group: type.group, type };
    if (type.keys?.some((k) => n.includes(k))) return { group: type.group, type };
  }
  return null;
}

// Classify a job from its items: the first item that matches decides.
export function classifyJob(items = []) {
  for (const it of items) {
    const hit = classifyItem(it?.item_name);
    if (hit) return hit;
  }
  return null;
}

// The database columns a new/edited job should carry.
export function categoryFields(items = []) {
  const hit = classifyJob(items);
  return { category: hit?.group.id || OTHER_GROUP.id, category_type: hit?.type.id || null };
}

// Presentation for a stored job (falls back to classifying its items).
//
// ประเภทที่บันทึกไว้ชนะหมวดที่บันทึกไว้ เพราะมันเจาะจงกว่า และเพราะงานที่จดไว้
// ก่อนที่ตรายาง/สติ๊กเกอร์จะแยกออกมาเป็นหมวดของตัวเอง ยังมี category เป็นของเก่า
// ติดอยู่ — ถ้าเชื่อหมวดที่เก็บไว้ งานเดิมจะโชว์ผิดหมวดตลอดไป
export function jobCategory(job = {}) {
  const type = findType(job.category_type);
  if (type) return { group: type.group, type };
  const group = findGroup(job.category);
  if (group) return { group, type: null };
  const hit = classifyJob(job.items || []);
  return { group: hit?.group || OTHER_GROUP, type: hit?.type || null };
}

// ป้ายหัวการ์ด: "งานป้าย / ป้ายไวนิล" — แต่หมวดที่มีประเภทเดียวชื่อเดียวกัน
// ("ตรายาง / ตรายาง") พูดสองครั้งเปล่า ๆ
function pairLabel(group, type) {
  if (!type || type.label === group.label) return group.label;
  return `${group.label} / ${type.label}`;
}

export function categoryLabel(job = {}) {
  const { group, type } = jobCategory(job);
  return pairLabel(group, type);
}

// --- Compatibility with the earlier flat API -------------------------------

// { label, icon } for the group a job's items belong to, or null.
export function guessCategory(items = []) {
  const hit = classifyJob(items);
  if (!hit) return null;
  return { ...hit.group, label: pairLabel(hit.group, hit.type), groupLabel: hit.group.label, type: hit.type };
}

export function itemIcon(itemName) {
  return classifyItem(itemName)?.type.icon || '📦';
}

// Job heading: the category when recognised, else derived from the items.
export function deriveJobName(items = []) {
  if (!items.length) return null;
  const hit = classifyJob(items);
  if (hit) return pairLabel(hit.group, hit.type);
  if (items.length === 1) return items[0].item_name;
  return `${items[0].item_name} +${items.length - 1} รายการ`;
}
