import { CATEGORY_GROUPS, OTHER_GROUP, findGroup } from '../utils/category.js';
import { COLORS } from './theme.js';

// Two-step category picker, as in the "เลือกหมวดงานให้ตรงประเภท" mockup:
// first the kind of work, then the specific type inside it.

function row({ icon, label, hint, data }) {
  return {
    type: 'box',
    layout: 'horizontal',
    spacing: 'md',
    alignItems: 'center',
    paddingAll: 'md',
    backgroundColor: COLORS.surface,
    cornerRadius: 'lg',
    borderWidth: '1px',
    borderColor: COLORS.line,
    action: { type: 'postback', data, displayText: label },
    contents: [
      {
        type: 'box',
        layout: 'vertical',
        width: '38px',
        height: '38px',
        cornerRadius: 'md',
        backgroundColor: COLORS.tint,
        justifyContent: 'center',
        alignItems: 'center',
        flex: 0,
        contents: [{ type: 'text', text: icon, size: 'lg', align: 'center' }],
      },
      {
        type: 'box',
        layout: 'vertical',
        flex: 5,
        contents: [
          { type: 'text', text: label, size: 'sm', weight: 'bold', color: COLORS.ink, wrap: true },
          ...(hint ? [{ type: 'text', text: hint, size: 'xxs', color: COLORS.grey, wrap: true }] : []),
        ],
      },
      { type: 'text', text: '›', size: 'lg', color: COLORS.accentText, align: 'end', flex: 0 },
    ],
  };
}

function bubble({ title, subtitle, rows, footer }) {
  return {
    type: 'bubble',
    size: 'mega',
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'md',
      paddingAll: 'lg',
      backgroundColor: COLORS.surface,
      contents: [
        {
          type: 'box',
          layout: 'vertical',
          backgroundColor: COLORS.tint,
          cornerRadius: 'lg',
          paddingAll: 'md',
          spacing: 'xs',
          contents: [
            { type: 'text', text: title, size: 'lg', weight: 'bold', color: COLORS.title, wrap: true },
            { type: 'text', text: subtitle, size: 'xs', color: COLORS.sub, wrap: true },
          ],
        },
        ...rows,
      ],
    },
    ...(footer ? { footer } : {}),
  };
}

// Step 1 — pick the kind of work.
export function categoryGroupsFlex(jobId) {
  const q = jobId ? `&jobId=${encodeURIComponent(jobId)}` : '';
  const rows = [...CATEGORY_GROUPS, OTHER_GROUP].map((g) =>
    row({
      icon: g.icon,
      label: g.label,
      hint: g.types.map((t) => t.label).join(' / ') || 'งานอื่น ๆ ที่ไม่เข้าหมวด',
      data: `action=pick_category&group=${g.id}${q}`,
    })
  );

  return {
    type: 'flex',
    altText: 'เลือกหมวดงาน',
    contents: bubble({
      title: 'เลือกหมวดงานให้ตรงประเภท',
      subtitle: 'เลือกประเภทงานที่ต้องการ แล้วม่วงจดจะจัดให้อัตโนมัติค่ะ',
      rows,
    }),
  };
}

// Step 2 — pick the specific type inside that group.
export function categoryTypesFlex(groupId, jobId) {
  const group = findGroup(groupId) || OTHER_GROUP;
  const q = jobId ? `&jobId=${encodeURIComponent(jobId)}` : '';

  const rows = group.types.map((t) =>
    row({
      icon: t.icon,
      label: t.label,
      // A human description, as in the mockup — never the matching keywords.
      hint: t.hint || '',
      data: `action=pick_category&group=${group.id}&type=${t.id}${q}`,
    })
  );

  // A group with no types (or the catch-all) is chosen as-is.
  if (!rows.length) {
    rows.push(
      row({
        icon: group.icon,
        label: `ใช้ "${group.label}"`,
        hint: 'ไม่ต้องระบุหมวดย่อย',
        data: `action=pick_category&group=${group.id}&type=${q}`,
      })
    );
  }

  return {
    type: 'flex',
    altText: `เลือกหมวด ${group.label}`,
    contents: bubble({
      title: `${group.icon} ${group.label}`,
      subtitle: `เลือกประเภท${group.label}ที่ต้องการ`,
      rows,
      footer: {
        type: 'box',
        layout: 'vertical',
        paddingAll: 'lg',
        paddingTop: 'none',
        contents: [
          {
            type: 'button',
            style: 'secondary',
            height: 'sm',
            action: {
              type: 'postback',
              label: '← เลือกประเภทงานใหม่',
              data: `action=pick_category${q}`,
              displayText: 'เลือกประเภทงาน',
            },
          },
        ],
      },
    }),
  };
}
