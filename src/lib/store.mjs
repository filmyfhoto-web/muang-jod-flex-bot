import crypto from 'node:crypto';

function iso(value = new Date()) {
  return new Date(value).toISOString();
}

function startOfBangkokDay(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(date);
  return new Date(`${parts}T00:00:00+07:00`).toISOString();
}

function startOfBangkokMonth(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit'
  }).formatToParts(date);
  const year = parts.find((part) => part.type === 'year').value;
  const month = parts.find((part) => part.type === 'month').value;
  return new Date(`${year}-${month}-01T00:00:00+07:00`).toISOString();
}

function endFromStart(start, unit) {
  const date = new Date(start);
  if (unit === 'month') date.setUTCMonth(date.getUTCMonth() + 1);
  else date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString();
}

function clone(value) {
  return structuredClone(value);
}

function summaryOf(items, label) {
  const active = items.filter((item) => !item.deletedAt && item.status === 'active');
  const income = active.filter((item) => item.type === 'income').reduce((sum, item) => sum + Number(item.amount), 0);
  const expense = active.filter((item) => item.type === 'expense').reduce((sum, item) => sum + Number(item.amount), 0);
  const categories = new Map();
  for (const item of active) {
    const current = categories.get(item.category) || { category: item.category, income: 0, expense: 0, count: 0 };
    current[item.type] += Number(item.amount);
    current.count += 1;
    categories.set(item.category, current);
  }
  return { income, expense, balance: income - expense, count: active.length, label, categories: [...categories.values()] };
}

export class DemoStore {
  constructor({ now = new Date() } = {}) {
    const baseTime = iso(now);
    this.pending = new Map();
    this.transactions = [
      {
        id: 'TEST-TX-001', lineUserId: 'TEST-U001', type: 'expense', description: 'TEST - กาแฟ',
        amount: 50, category: 'อาหาร', paymentMethod: 'เงินสด', occurredAt: baseTime,
        sourceText: 'กาแฟ 50', sourceMessageId: 'TEST-MSG-001', pendingBatchId: null,
        batchItemIndex: 0, status: 'active', createdAt: baseTime, updatedAt: baseTime, deletedAt: null
      },
      {
        id: 'TEST-TX-002', lineUserId: 'TEST-U001', type: 'income', description: 'TEST - งานรูปติดบัตร',
        amount: 240, category: 'งานรูป', paymentMethod: 'พร้อมเพย์', occurredAt: baseTime,
        sourceText: 'ขายรูปติดบัตร 240 พร้อมเพย์', sourceMessageId: 'TEST-MSG-002', pendingBatchId: null,
        batchItemIndex: 0, status: 'active', createdAt: baseTime, updatedAt: baseTime, deletedAt: null
      }
    ];
  }

  async createPending({ lineUserId, sourceText, sourceMessageId, entries }) {
    const id = `TEST-BATCH-${crypto.randomUUID()}`;
    const batch = {
      id, lineUserId, sourceText, sourceMessageId: sourceMessageId || null,
      entries: clone(entries), status: 'pending', createdAt: iso(), expiresAt: iso(Date.now() + 10 * 60 * 1000)
    };
    this.pending.set(id, batch);
    return clone(batch);
  }

  async getPending(id, lineUserId) {
    const batch = this.pending.get(id);
    return batch && batch.lineUserId === lineUserId ? clone(batch) : null;
  }

  async confirmPending(id, lineUserId) {
    const batch = this.pending.get(id);
    if (!batch || batch.lineUserId !== lineUserId) throw new Error('ไม่พบรายการรอยืนยัน');
    if (new Date(batch.expiresAt) < new Date()) throw new Error('รายการรอยืนยันหมดอายุแล้ว กรุณาส่งใหม่');
    if (batch.status === 'confirmed') {
      return clone(this.transactions.filter((item) => item.pendingBatchId === id));
    }
    if (batch.status !== 'pending') throw new Error('รายการนี้ถูกยกเลิกแล้ว');
    const createdAt = iso();
    const created = batch.entries.map((entry, index) => ({
      id: `TEST-TX-${crypto.randomUUID()}`,
      lineUserId,
      type: entry.type,
      description: entry.description.startsWith('TEST') ? entry.description : `TEST - ${entry.description}`,
      amount: Number(entry.amount), category: entry.category, paymentMethod: entry.paymentMethod || null,
      occurredAt: entry.occurredAt || createdAt, sourceText: batch.sourceText,
      sourceMessageId: batch.sourceMessageId, pendingBatchId: id, batchItemIndex: index,
      status: 'active', createdAt, updatedAt: createdAt, deletedAt: null
    }));
    this.transactions.push(...created);
    batch.status = 'confirmed';
    batch.confirmedAt = createdAt;
    return clone(created);
  }

  async cancelPending(id, lineUserId) {
    const batch = this.pending.get(id);
    if (!batch || batch.lineUserId !== lineUserId) return false;
    if (batch.status === 'confirmed') return false;
    batch.status = 'cancelled';
    batch.cancelledAt = iso();
    return true;
  }

  async listTransactions(lineUserId, { limit = 50, from = null, to = null, category = null } = {}) {
    return clone(this.transactions
      .filter((item) => item.lineUserId === lineUserId && !item.deletedAt)
      .filter((item) => !from || item.occurredAt >= from)
      .filter((item) => !to || item.occurredAt < to)
      .filter((item) => !category || item.category === category)
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
      .slice(0, Math.min(Number(limit) || 50, 200)));
  }

  async getTransaction(id, lineUserId) {
    const item = this.transactions.find((tx) => tx.id === id && tx.lineUserId === lineUserId && !tx.deletedAt);
    return item ? clone(item) : null;
  }

  async updateTransaction(id, lineUserId, patch) {
    const item = this.transactions.find((tx) => tx.id === id && tx.lineUserId === lineUserId && !tx.deletedAt);
    if (!item) throw new Error('ไม่พบรายการที่ต้องการแก้ไข');
    Object.assign(item, patch, { updatedAt: iso() });
    return clone(item);
  }

  async softDeleteTransaction(id, lineUserId) {
    const item = this.transactions.find((tx) => tx.id === id && tx.lineUserId === lineUserId && !tx.deletedAt);
    if (!item) return false;
    item.status = 'cancelled';
    item.deletedAt = iso();
    item.updatedAt = item.deletedAt;
    return true;
  }

  async getSummary(lineUserId, period = 'today', now = new Date()) {
    const start = period === 'month' ? startOfBangkokMonth(now) : startOfBangkokDay(now);
    const end = endFromStart(start, period === 'month' ? 'month' : 'day');
    const items = await this.listTransactions(lineUserId, { from: start, to: end, limit: 200 });
    return summaryOf(items, period === 'month' ? 'เดือนนี้ · เวลาไทย' : 'วันนี้ · เวลาไทย');
  }

  async getMonthCategoryTotal(lineUserId, category, now = new Date()) {
    const start = startOfBangkokMonth(now);
    const end = endFromStart(start, 'month');
    const items = await this.listTransactions(lineUserId, { from: start, to: end, category, limit: 200 });
    return items.reduce((sum, item) => sum + Number(item.amount), 0);
  }
}

function fromDb(row) {
  if (!row) return null;
  return {
    id: row.id,
    lineUserId: row.line_user_id,
    type: row.entry_type,
    description: row.description,
    amount: Number(row.amount),
    category: row.category,
    paymentMethod: row.payment_method,
    occurredAt: row.occurred_at,
    sourceText: row.source_text,
    sourceMessageId: row.source_message_id,
    pendingBatchId: row.pending_batch_id,
    batchItemIndex: row.batch_item_index,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at
  };
}

function pendingFromDb(row) {
  if (!row) return null;
  return {
    id: row.id, lineUserId: row.line_user_id, sourceText: row.source_text,
    sourceMessageId: row.source_message_id, entries: row.entries, status: row.status,
    createdAt: row.created_at, expiresAt: row.expires_at
  };
}

export class SupabaseRestStore {
  constructor({ url, secretKey }) {
    if (!url || !secretKey) throw new Error('Supabase config ไม่ครบ');
    this.url = url;
    this.secretKey = secretKey;
  }

  async request(path, { method = 'GET', body, prefer } = {}) {
    const response = await fetch(`${this.url}/rest/v1/${path}`, {
      method,
      headers: {
        apikey: this.secretKey,
        authorization: `Bearer ${this.secretKey}`,
        'content-type': 'application/json',
        ...(prefer ? { prefer } : {})
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok) throw new Error(data?.message || data?.hint || `Supabase ${response.status}`);
    return data;
  }

  async createPending({ lineUserId, sourceText, sourceMessageId, entries }) {
    const rows = await this.request('mj_pending_batches', {
      method: 'POST', prefer: 'return=representation',
      body: { line_user_id: lineUserId, source_text: sourceText, source_message_id: sourceMessageId || null, entries }
    });
    return pendingFromDb(rows[0]);
  }

  async getPending(id, lineUserId) {
    const query = new URLSearchParams({ id: `eq.${id}`, line_user_id: `eq.${lineUserId}`, limit: '1' });
    const rows = await this.request(`mj_pending_batches?${query}`);
    return pendingFromDb(rows[0]);
  }

  async confirmPending(id, lineUserId) {
    const batch = await this.getPending(id, lineUserId);
    if (!batch) throw new Error('ไม่พบรายการรอยืนยัน');
    if (new Date(batch.expiresAt) < new Date()) throw new Error('รายการรอยืนยันหมดอายุแล้ว กรุณาส่งใหม่');
    if (batch.status === 'cancelled') throw new Error('รายการนี้ถูกยกเลิกแล้ว');
    const now = iso();
    const payload = batch.entries.map((entry, index) => ({
      line_user_id: lineUserId, entry_type: entry.type, description: entry.description,
      amount: Number(entry.amount), category: entry.category, payment_method: entry.paymentMethod || null,
      occurred_at: entry.occurredAt || now, source_text: batch.sourceText,
      source_message_id: batch.sourceMessageId, pending_batch_id: id, batch_item_index: index
    }));
    await this.request('mj_transactions?on_conflict=pending_batch_id,batch_item_index', {
      method: 'POST', body: payload, prefer: 'resolution=ignore-duplicates,return=minimal'
    });
    const updateQuery = new URLSearchParams({ id: `eq.${id}`, line_user_id: `eq.${lineUserId}`, status: 'eq.pending' });
    await this.request(`mj_pending_batches?${updateQuery}`, {
      method: 'PATCH', body: { status: 'confirmed', confirmed_at: now }, prefer: 'return=minimal'
    });
    const listQuery = new URLSearchParams({ pending_batch_id: `eq.${id}`, line_user_id: `eq.${lineUserId}`, order: 'batch_item_index.asc' });
    return (await this.request(`mj_transactions?${listQuery}`)).map(fromDb);
  }

  async cancelPending(id, lineUserId) {
    const query = new URLSearchParams({ id: `eq.${id}`, line_user_id: `eq.${lineUserId}`, status: 'eq.pending' });
    const rows = await this.request(`mj_pending_batches?${query}`, {
      method: 'PATCH', body: { status: 'cancelled', cancelled_at: iso() }, prefer: 'return=representation'
    });
    return Boolean(rows.length);
  }

  async listTransactions(lineUserId, { limit = 50, from = null, to = null, category = null } = {}) {
    const query = new URLSearchParams({
      line_user_id: `eq.${lineUserId}`, deleted_at: 'is.null', order: 'occurred_at.desc', limit: String(Math.min(Number(limit) || 50, 200))
    });
    if (from) query.set('occurred_at', `gte.${from}`);
    if (to) query.append('occurred_at', `lt.${to}`);
    if (category) query.set('category', `eq.${category}`);
    return (await this.request(`mj_transactions?${query}`)).map(fromDb);
  }

  async getTransaction(id, lineUserId) {
    const query = new URLSearchParams({ id: `eq.${id}`, line_user_id: `eq.${lineUserId}`, deleted_at: 'is.null', limit: '1' });
    const rows = await this.request(`mj_transactions?${query}`);
    return fromDb(rows[0]);
  }

  async updateTransaction(id, lineUserId, patch) {
    const dbPatch = {
      ...(patch.type ? { entry_type: patch.type } : {}),
      ...(patch.description ? { description: patch.description } : {}),
      ...(patch.amount !== undefined ? { amount: Number(patch.amount) } : {}),
      ...(patch.category ? { category: patch.category } : {}),
      ...(patch.paymentMethod !== undefined ? { payment_method: patch.paymentMethod || null } : {}),
      ...(patch.occurredAt ? { occurred_at: patch.occurredAt } : {}),
      updated_at: iso()
    };
    const query = new URLSearchParams({ id: `eq.${id}`, line_user_id: `eq.${lineUserId}`, deleted_at: 'is.null' });
    const rows = await this.request(`mj_transactions?${query}`, { method: 'PATCH', body: dbPatch, prefer: 'return=representation' });
    if (!rows.length) throw new Error('ไม่พบรายการที่ต้องการแก้ไข');
    return fromDb(rows[0]);
  }

  async softDeleteTransaction(id, lineUserId) {
    const now = iso();
    const query = new URLSearchParams({ id: `eq.${id}`, line_user_id: `eq.${lineUserId}`, deleted_at: 'is.null' });
    const rows = await this.request(`mj_transactions?${query}`, {
      method: 'PATCH', body: { status: 'cancelled', deleted_at: now, updated_at: now }, prefer: 'return=representation'
    });
    return Boolean(rows.length);
  }

  async getSummary(lineUserId, period = 'today', now = new Date()) {
    const start = period === 'month' ? startOfBangkokMonth(now) : startOfBangkokDay(now);
    const end = endFromStart(start, period === 'month' ? 'month' : 'day');
    const items = await this.listTransactions(lineUserId, { from: start, to: end, limit: 200 });
    return summaryOf(items, period === 'month' ? 'เดือนนี้ · เวลาไทย' : 'วันนี้ · เวลาไทย');
  }

  async getMonthCategoryTotal(lineUserId, category, now = new Date()) {
    const start = startOfBangkokMonth(now);
    const end = endFromStart(start, 'month');
    const items = await this.listTransactions(lineUserId, { from: start, to: end, category, limit: 200 });
    return items.reduce((sum, item) => sum + Number(item.amount), 0);
  }
}

export function createStore(config) {
  return config.demoMode ? new DemoStore() : new SupabaseRestStore(config.supabase);
}

export { startOfBangkokDay, startOfBangkokMonth, summaryOf };
