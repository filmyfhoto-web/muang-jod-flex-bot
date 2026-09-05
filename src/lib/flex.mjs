const COLORS = {
  purple: '#6D3B8C',
  purpleSoft: '#F3EAF8',
  cream: '#FFF9F0',
  ink: '#26212A',
  muted: '#6E6672',
  income: '#4DAF8B',
  incomeSoft: '#E4F6EF',
  expense: '#D75287',
  expenseSoft: '#FBEAF1',
  danger: '#D64545',
  divider: '#E8DFEA'
};

function money(value) {
  return new Intl.NumberFormat('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(value || 0));
}

function thaiDate(value = new Date()) {
  return new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  }).format(new Date(value));
}

function labelFor(type) {
  return type === 'income' ? 'รายรับ' : 'รายจ่าย';
}

function colorFor(type) {
  return type === 'income' ? COLORS.income : COLORS.expense;
}

function softColorFor(type) {
  return type === 'income' ? COLORS.incomeSoft : COLORS.expenseSoft;
}

function mascotUrl(baseUrl) {
  return `${String(baseUrl).replace(/\/$/, '')}/assets/mamung-card.png`;
}

function liffUrl(liffId, path, params = {}) {
  const query = new URLSearchParams(params).toString();
  const suffix = query ? `${path}?${query}` : path;
  return liffId ? `https://liff.line.me/${liffId}${suffix}` : `https://example.com${suffix}`;
}

export function buildConfirmFlex(batch) {
  const total = batch.entries.reduce((sum, entry) => sum + Number(entry.amount), 0);
  const rows = batch.entries.flatMap((entry, index) => [
    {
      type: 'box', layout: 'horizontal', margin: index ? 'md' : 'none', contents: [
        { type: 'text', text: `${index + 1}. ${entry.description}`, size: 'sm', color: COLORS.ink, wrap: true, flex: 5 },
        { type: 'text', text: `฿${money(entry.amount)}`, size: 'sm', weight: 'bold', align: 'end', color: colorFor(entry.type), flex: 2 }
      ]
    },
    { type: 'text', text: `${entry.type ? labelFor(entry.type) : 'เลือกประเภท'} · ${entry.category}`, size: 'xs', color: COLORS.muted, margin: 'xs' }
  ]);

  return {
    type: 'flex',
    altText: `ตรวจสอบก่อนบันทึก ${batch.entries.length} รายการ รวม ${money(total)} บาท`,
    contents: {
      type: 'bubble', size: 'kilo',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: COLORS.purpleSoft, paddingAll: '18px',
        contents: [
          { type: 'text', text: 'ตรวจสอบก่อนบันทึก', weight: 'bold', size: 'lg', color: COLORS.purple },
          { type: 'text', text: 'ม่วงจดให้จะบันทึกเมื่อคุณกดยืนยัน', size: 'xs', color: COLORS.muted, margin: 'sm', wrap: true }
        ]
      },
      body: {
        type: 'box', layout: 'vertical', paddingAll: '18px', contents: [
          ...rows,
          { type: 'separator', margin: 'lg', color: COLORS.divider },
          { type: 'box', layout: 'horizontal', margin: 'lg', contents: [
            { type: 'text', text: 'รวม', weight: 'bold', color: COLORS.ink },
            { type: 'text', text: `฿${money(total)}`, weight: 'bold', align: 'end', color: COLORS.purple }
          ] }
        ]
      },
      footer: {
        type: 'box', layout: 'horizontal', spacing: 'sm', paddingAll: '14px', contents: [
          { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: 'ยกเลิก', data: `action=cancel_batch&batchId=${batch.id}` } },
          { type: 'button', style: 'primary', height: 'sm', color: COLORS.purple, action: { type: 'postback', label: 'ยืนยันบันทึก', data: `action=confirm_batch&batchId=${batch.id}`, displayText: 'ยืนยันบันทึก' } }
        ]
      }
    }
  };
}

export function buildSavedFlex(transaction, options = {}) {
  const { baseUrl = 'https://example.com', liffId = '', signedId = transaction.id, monthCategoryTotal = transaction.amount } = options;
  const typeColor = colorFor(transaction.type);
  return {
    type: 'flex',
    altText: `จด${labelFor(transaction.type)}สำเร็จ ${transaction.description} ${money(transaction.amount)} บาท`,
    contents: {
      type: 'bubble', size: 'kilo',
      header: {
        type: 'box', layout: 'horizontal', backgroundColor: COLORS.cream, paddingAll: '16px', alignItems: 'center', contents: [
          { type: 'box', layout: 'vertical', flex: 4, contents: [
            { type: 'text', text: 'จดสำเร็จ ✅', size: 'lg', weight: 'bold', color: COLORS.ink },
            { type: 'text', text: 'อย่าลืมตรวจสอบรายการที่จดด้วยนะคะ', size: 'xs', color: COLORS.muted, margin: 'sm', wrap: true }
          ] },
          { type: 'image', url: mascotUrl(baseUrl), size: 'sm', aspectMode: 'cover', aspectRatio: '1:1', flex: 1 }
        ]
      },
      body: {
        type: 'box', layout: 'vertical', paddingAll: '16px', contents: [
          { type: 'box', layout: 'horizontal', alignItems: 'center', contents: [
            { type: 'box', layout: 'vertical', flex: 0, backgroundColor: softColorFor(transaction.type), cornerRadius: '12px', paddingStart: '8px', paddingEnd: '8px', paddingTop: '4px', paddingBottom: '4px', contents: [
              { type: 'text', text: labelFor(transaction.type), size: 'xs', weight: 'bold', color: typeColor }
            ] },
            { type: 'text', text: `– ${transaction.category}`, size: 'sm', weight: 'bold', color: COLORS.ink, margin: 'sm', wrap: true }
          ] },
          { type: 'text', text: thaiDate(transaction.occurredAt || transaction.createdAt), size: 'xs', color: COLORS.muted, margin: 'md' },
          { type: 'box', layout: 'horizontal', margin: 'sm', alignItems: 'center', contents: [
            { type: 'text', text: transaction.description, size: 'md', color: COLORS.ink, wrap: true, flex: 5 },
            { type: 'text', text: `฿${money(transaction.amount)}`, size: 'lg', weight: 'bold', align: 'end', color: typeColor, flex: 2 }
          ] },
          { type: 'separator', margin: 'lg', color: COLORS.divider },
          { type: 'box', layout: 'horizontal', margin: 'lg', contents: [
            { type: 'text', text: `เดือนนี้ · ${transaction.category}`, size: 'sm', color: COLORS.ink, wrap: true, flex: 4 },
            { type: 'text', text: `฿${money(monthCategoryTotal)}`, size: 'sm', weight: 'bold', align: 'end', color: typeColor, flex: 2 }
          ] },
          ...(transaction.paymentMethod ? [{ type: 'text', text: `ชำระ: ${transaction.paymentMethod}`, size: 'xs', color: COLORS.muted, margin: 'sm' }] : [])
        ]
      },
      footer: {
        type: 'box', layout: 'horizontal', spacing: 'sm', paddingAll: '14px', contents: [
          { type: 'button', style: 'secondary', height: 'sm', action: { type: 'uri', label: '✏️ แก้ไข', uri: liffUrl(liffId, '/edit', { t: signedId }) } },
          { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '✕ ยกเลิก', data: `action=request_delete&id=${transaction.id}` } }
        ]
      }
    }
  };
}

export function buildSavedBatchFlex(transactions, options = {}) {
  if (transactions.length === 1) return buildSavedFlex(transactions[0], options);
  const total = transactions.reduce((sum, item) => sum + Number(item.amount), 0);
  const rows = transactions.map((item, index) => ({
    type: 'box', layout: 'horizontal', margin: index ? 'md' : 'none', contents: [
      { type: 'text', text: `${index + 1}. ${item.description}`, size: 'sm', color: COLORS.ink, wrap: true, flex: 5 },
      { type: 'text', text: `฿${money(item.amount)}`, size: 'sm', weight: 'bold', align: 'end', color: colorFor(item.type), flex: 2 }
    ]
  }));
  return {
    type: 'flex', altText: `บันทึกให้ ${transactions.length} รายการแล้ว รวม ${money(total)} บาท`,
    contents: {
      type: 'bubble', size: 'kilo',
      header: { type: 'box', layout: 'vertical', backgroundColor: COLORS.cream, paddingAll: '18px', contents: [
        { type: 'text', text: `บันทึกให้ ${transactions.length} รายการแล้ว ✅`, weight: 'bold', size: 'lg', color: COLORS.ink },
        { type: 'text', text: 'ตรวจสอบรายการได้จากปุ่มด้านล่าง', size: 'xs', color: COLORS.muted, margin: 'sm' }
      ] },
      body: { type: 'box', layout: 'vertical', paddingAll: '18px', contents: [
        ...rows,
        { type: 'separator', margin: 'lg', color: COLORS.divider },
        { type: 'box', layout: 'horizontal', margin: 'lg', contents: [
          { type: 'text', text: 'รวม', weight: 'bold' },
          { type: 'text', text: `฿${money(total)}`, weight: 'bold', align: 'end', color: COLORS.purple }
        ] }
      ] },
      footer: { type: 'box', layout: 'vertical', paddingAll: '14px', contents: [
        { type: 'button', style: 'primary', height: 'sm', color: COLORS.purple, action: { type: 'uri', label: 'ดูรายการล่าสุด', uri: liffUrl(options.liffId, '/transactions') } }
      ] }
    }
  };
}

export function buildDeleteConfirmFlex(transaction) {
  return {
    type: 'flex', altText: `ยืนยันยกเลิกรายการ ${transaction.description}`,
    contents: {
      type: 'bubble', size: 'micro',
      body: { type: 'box', layout: 'vertical', paddingAll: '18px', contents: [
        { type: 'text', text: 'ยืนยันยกเลิกรายการ?', weight: 'bold', size: 'md', color: COLORS.ink },
        { type: 'text', text: `${transaction.description} · ฿${money(transaction.amount)}`, size: 'sm', color: COLORS.muted, wrap: true, margin: 'md' }
      ] },
      footer: { type: 'box', layout: 'horizontal', spacing: 'sm', paddingAll: '14px', contents: [
        { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: 'ไม่ยกเลิก', data: 'action=keep' } },
        { type: 'button', style: 'primary', height: 'sm', color: COLORS.danger, action: { type: 'postback', label: 'ยืนยัน', data: `action=confirm_delete&id=${transaction.id}` } }
      ] }
    }
  };
}

export function buildSummaryFlex(summary, { liffId = '' } = {}) {
  return {
    type: 'flex', altText: `สรุปวันนี้ รายรับ ${money(summary.income)} รายจ่าย ${money(summary.expense)} บาท`,
    contents: {
      type: 'bubble', size: 'kilo',
      header: { type: 'box', layout: 'vertical', backgroundColor: COLORS.purpleSoft, paddingAll: '18px', contents: [
        { type: 'text', text: 'สรุปวันนี้', weight: 'bold', size: 'xl', color: COLORS.purple },
        { type: 'text', text: summary.label || 'ข้อมูลตามเวลาไทย', size: 'xs', color: COLORS.muted, margin: 'sm' }
      ] },
      body: { type: 'box', layout: 'vertical', paddingAll: '18px', contents: [
        { type: 'box', layout: 'horizontal', contents: [
          { type: 'text', text: 'รายรับ', color: COLORS.muted },
          { type: 'text', text: `฿${money(summary.income)}`, align: 'end', weight: 'bold', color: COLORS.income }
        ] },
        { type: 'box', layout: 'horizontal', margin: 'md', contents: [
          { type: 'text', text: 'รายจ่าย', color: COLORS.muted },
          { type: 'text', text: `฿${money(summary.expense)}`, align: 'end', weight: 'bold', color: COLORS.expense }
        ] },
        { type: 'separator', margin: 'lg', color: COLORS.divider },
        { type: 'box', layout: 'horizontal', margin: 'lg', contents: [
          { type: 'text', text: 'คงเหลือ', weight: 'bold', color: COLORS.ink },
          { type: 'text', text: `฿${money(summary.balance)}`, align: 'end', weight: 'bold', size: 'xl', color: summary.balance >= 0 ? COLORS.income : COLORS.expense }
        ] }
      ] },
      footer: { type: 'box', layout: 'horizontal', spacing: 'sm', paddingAll: '14px', contents: [
        { type: 'button', style: 'secondary', height: 'sm', action: { type: 'uri', label: 'รายการ', uri: liffUrl(liffId, '/transactions') } },
        { type: 'button', style: 'primary', height: 'sm', color: COLORS.purple, action: { type: 'uri', label: 'ดูสรุปเต็ม', uri: liffUrl(liffId, '/summary') } }
      ] }
    }
  };
}

export { COLORS, money, thaiDate };
