// Two-level work taxonomy: a group ("งานพิมพ์") holding types ("ถ่ายเอกสาร").
// Jobs are classified automatically from item names; the LIFF form lets the
// owner correct it. Order matters — earlier entries win when keywords overlap,
// so put the more specific type first inside each group.

export const CATEGORY_GROUPS = [
  {
    id: 'sign',
    label: 'งานป้าย',
    icon: '🪧',
    color: '#F471B5', // pink, as in the proportions chart
    types: [
      // สติ๊กเกอร์ติดฟิวเจอร์บอร์ดต้องมาก่อนทั้งโฟมบอร์ดและสติ๊กเกอร์ ไม่งั้นมันจะถูก
      // หยิบไปลงหมวดใดหมวดหนึ่งตามคำที่เจอก่อน ทั้งที่เป็นงานของมันเอง
      {
        id: 'sticker_board',
        label: 'สติ๊กเกอร์ฟิวเจอร์บอร์ด',
        icon: '📋',
        hint: 'สติ๊กเกอร์ติดบอร์ด / ป้ายตั้งพื้น',
        keys: ['สติ๊กเกอร์ฟิวเจอร์', 'สติกเกอร์ฟิวเจอร์', 'สติ๊กเกอร์บอร์ด', 'สติกเกอร์บอร์ด'],
        // เขียนสลับกันก็ต้องเข้า เช่น "ฟิวเจอร์บอร์ดติดสติ๊กเกอร์" — ทุกวงเล็บ
        // ต้องเจออย่างน้อยหนึ่งคำ ไม่ต้องไล่เดาลำดับคำเอง
        all: [
          ['สติ๊กเกอร์', 'สติกเกอร์'],
          ['ฟิวเจอร์', 'พีพีบอร์ด'],
        ],
      },
      { id: 'vinyl', label: 'ป้ายไวนิล', icon: '🪧', hint: 'ขนาดตามต้องการ / งานด่วน', keys: ['ไวนิล', 'อิงค์เจ็ท', 'ป้ายผ้า'] },
      { id: 'foamboard', label: 'โฟมบอร์ด', icon: '🧊', hint: 'ขนาดต่าง ๆ / พร้อมติดตั้ง', keys: ['โฟมบอร์ด', 'ฟิวเจอร์บอร์ด', 'พีพีบอร์ด'] },
      { id: 'sticker', label: 'สติ๊กเกอร์', icon: '🏷️', hint: 'สติ๊กเกอร์ไดคัท / ฉลากสินค้า', keys: ['สติกเกอร์', 'สติ๊กเกอร์', 'ฉลาก', 'ไดคัท', 'label'] },
      { id: 'banner', label: 'แบนเนอร์', icon: '🎌', hint: 'งานออกบูธ / ใช้โครง / ขอบตาไก่', keys: ['แบนเนอร์', 'โรลอัพ', 'x-stand', 'ธง', 'ออกบูธ'] },
      { id: 'standee', label: 'ป้ายตั้งโต๊ะ', icon: '🪧', hint: 'อะคริลิค / พลาสวูด / สั่งทำพิเศษ', keys: ['ตั้งโต๊ะ', 'อะคริลิค', 'พลาสวูด', 'ตัวอักษร', 'ป้าย'] },
    ],
  },
  {
    id: 'print',
    label: 'งานพิมพ์',
    icon: '🖨️',
    color: '#A78BFA', // purple
    types: [
      { id: 'copy', label: 'ถ่ายเอกสาร', icon: '📄', hint: 'ขาวดำ / สี / จำนวนหลายชุด', keys: ['ถ่ายเอกสาร', 'ถ่ายเอก', 'copy'] },
      { id: 'print', label: 'พิมพ์งาน', icon: '📄', hint: 'ไฟล์เอกสาร / ไฟล์ PDF / งานด่วน', keys: ['ปริ้น', 'พิมพ์งาน', 'พิมพ์เอกสาร', 'print', 'ใบปลิว', 'โบรชัวร์', 'แผ่นพับ', 'นามบัตร'] },
      { id: 'binding', label: 'เข้าเล่ม', icon: '📚', hint: 'สันห่วง / สันกาว / ไสกาว / ปกแข็ง', keys: ['เข้าเล่ม', 'สันห่วง', 'สันกาว', 'ไสกาว', 'ปกแข็ง', 'เคลือบ'] },
      // "ปั๊ม" เฉย ๆ ไม่เอา ไม่งั้นปั๊มน้ำมันกับค่าปั๊มอะไรก็ตกมาลงหมวดนี้หมด
      { id: 'stamp', label: 'ตรายาง', icon: '🔖', hint: 'หมึกในตัว / ด้ามไม้ / สั่งทำตามแบบ', keys: ['ตรายาง', 'ตราปั๊ม', 'ปั๊มยาง', 'หมึกในตัว', 'stamp'] },
      // กรอบรูปมาก่อนรูปด่วน เพราะ "รูปหน้างานพร้อมกรอบ" ต้องไปลงกรอบรูป
      // ไม่ใช่รูปด่วน — กติกาของไฟล์นี้คือของที่เจาะจงกว่าต้องอยู่บนสุด
      { id: 'frame', label: 'กรอบรูป', icon: '🖼️', hint: 'ใส่กรอบ / เข้ากรอบ / พร้อมกรอบ', keys: ['กรอบรูป', 'ใส่กรอบ', 'เข้ากรอบ', 'พร้อมกรอบ', 'กรอบ'] },
      { id: 'photo', label: 'รูปด่วน', icon: '🖼️', hint: 'ขนาดต่าง ๆ / รูปติดบัตร / ปริ้นรูป', keys: ['รูปด่วน', 'อัดรูป', 'ล้างรูป', 'รูปติดบัตร', 'ปริ้นรูป'] },
      { id: 'scan', label: 'สแกนเอกสาร', icon: '📠', hint: 'สแกนเป็นไฟล์ PDF / JPG', keys: ['สแกน', 'scan'] },
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
    id: 'food',
    label: 'อาหาร & เครื่องดื่ม',
    icon: '☕',
    color: '#F59E0B',
    types: [
      { id: 'food', label: 'อาหาร / เครื่องดื่ม', icon: '☕', hint: 'กาแฟ / ข้าว / ขนม', keys: ['กาแฟ', 'อาหาร', 'ขนม', 'เครื่องดื่ม', 'ข้าว', 'เบเกอรี่'] },
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

const ALL_TYPES = CATEGORY_GROUPS.flatMap((g) => g.types.map((t) => ({ ...t, group: g })));

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
export function jobCategory(job = {}) {
  const group = findGroup(job.category);
  const type = findType(job.category_type);
  if (group) return { group, type: type || null };
  const hit = classifyJob(job.items || []);
  return { group: hit?.group || OTHER_GROUP, type: hit?.type || null };
}

// Heading shown on cards: "งานป้าย / ป้ายไวนิล".
export function categoryLabel(job = {}) {
  const { group, type } = jobCategory(job);
  return type ? `${group.label} / ${type.label}` : group.label;
}

// --- Compatibility with the earlier flat API -------------------------------

// { label, icon } for the group a job's items belong to, or null.
export function guessCategory(items = []) {
  const hit = classifyJob(items);
  if (!hit) return null;
  return { ...hit.group, label: `${hit.group.label} / ${hit.type.label}`, groupLabel: hit.group.label, type: hit.type };
}

export function itemIcon(itemName) {
  return classifyItem(itemName)?.type.icon || '📦';
}

// Job heading: the category when recognised, else derived from the items.
export function deriveJobName(items = []) {
  if (!items.length) return null;
  const hit = classifyJob(items);
  if (hit) return `${hit.group.label} / ${hit.type.label}`;
  if (items.length === 1) return items[0].item_name;
  return `${items[0].item_name} +${items.length - 1} รายการ`;
}
