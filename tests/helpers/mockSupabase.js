// Minimal in-memory stand-in for the Supabase JS client, supporting just the
// query-builder surface our services use. Enough to unit-test data isolation,
// idempotency, partial payments and soft-delete without a real database.

let idCounter = 0;
let seqCounter = 0;

function matchesIlike(value, pattern) {
  const needle = String(pattern).replace(/%/g, '').toLowerCase();
  return String(value ?? '').toLowerCase().includes(needle);
}

class Query {
  constructor(store, table) {
    this.store = store;
    this.table = table;
    this.op = 'select';
    this.payload = null;
    this.filters = []; // {kind, col, val}
    this._order = null;
    this._limit = null;
    this._count = false;
    this._head = false;
    this._selectAfterWrite = false;
  }

  select(_sel, opts) {
    if (this.op === 'insert' || this.op === 'update') this._selectAfterWrite = true;
    if (opts?.count) this._count = true;
    if (opts?.head) this._head = true;
    return this;
  }
  insert(rows) {
    this.op = 'insert';
    this.payload = Array.isArray(rows) ? rows : [rows];
    return this;
  }
  update(patch) {
    this.op = 'update';
    this.payload = patch;
    return this;
  }
  delete() {
    this.op = 'delete';
    return this;
  }
  eq(col, val) {
    this.filters.push({ kind: 'eq', col, val });
    return this;
  }
  in(col, vals) {
    this.filters.push({ kind: 'in', col, val: vals });
    return this;
  }
  gte(col, val) {
    this.filters.push({ kind: 'gte', col, val });
    return this;
  }
  lte(col, val) {
    this.filters.push({ kind: 'lte', col, val });
    return this;
  }
  or(expr) {
    this.filters.push({ kind: 'or', expr });
    return this;
  }
  order(col, opts) {
    this._order = { col, ascending: opts?.ascending !== false };
    return this;
  }
  limit(n) {
    this._limit = n;
    return this;
  }

  _rows() {
    return this.store.tables[this.table] || (this.store.tables[this.table] = []);
  }

  _applyFilters(rows) {
    return rows.filter((row) =>
      this.filters.every((f) => {
        if (f.kind === 'eq') return row[f.col] === f.val;
        if (f.kind === 'in') return f.val.includes(row[f.col]);
        if (f.kind === 'gte') return row[f.col] >= f.val;
        if (f.kind === 'lte') return row[f.col] <= f.val;
        if (f.kind === 'or') {
          return String(f.expr)
            .split(',')
            .some((clause) => {
              const [col, kind, ...rest] = clause.split('.');
              const pattern = rest.join('.');
              if (kind === 'ilike') return matchesIlike(row[col], pattern);
              return false;
            });
        }
        return true;
      })
    );
  }

  _uniqueConflict(row) {
    const uniques = this.store.uniques[this.table] || [];
    const rows = this._rows();
    return uniques.some((cols) =>
      rows.some((existing) => cols.every((c) => existing[c] === row[c]))
    );
  }

  _run() {
    const rows = this._rows();

    if (this.op === 'insert') {
      const inserted = [];
      for (const raw of this.payload) {
        const row = { ...raw };
        if (row.id == null) row.id = `id-${++idCounter}`;
        if (row.created_at == null) {
          row.created_at = new Date(1700000000000 + ++seqCounter * 1000).toISOString();
        }
        if (this._uniqueConflict(row)) {
          return { data: null, error: { code: '23505', message: 'duplicate key value' } };
        }
        rows.push(row);
        inserted.push(row);
      }
      return { data: this._selectAfterWrite ? inserted : null, error: null };
    }

    if (this.op === 'update') {
      const set = this._applyFilters(rows);
      for (const row of set) Object.assign(row, this.payload);
      return { data: this._selectAfterWrite ? set : null, error: null };
    }

    if (this.op === 'delete') {
      const set = new Set(this._applyFilters(rows));
      this.store.tables[this.table] = rows.filter((r) => !set.has(r));
      return { data: null, error: null };
    }

    // select
    let set = this._applyFilters(rows);
    if (this._count) return { data: null, error: null, count: set.length };
    if (this._order) {
      const { col, ascending } = this._order;
      set = [...set].sort((a, b) => {
        if (a[col] < b[col]) return ascending ? -1 : 1;
        if (a[col] > b[col]) return ascending ? 1 : -1;
        return 0;
      });
    }
    if (this._limit != null) set = set.slice(0, this._limit);
    return { data: set.map((r) => ({ ...r })), error: null };
  }

  async single() {
    const res = this._run();
    if (res.error) return res;
    const row = res.data?.[0] ?? null;
    if (!row) return { data: null, error: { code: 'PGRST116', message: 'no rows' } };
    return { data: row, error: null };
  }
  async maybeSingle() {
    const res = this._run();
    if (res.error) return res;
    return { data: res.data?.[0] ?? null, error: null };
  }
  then(resolve, reject) {
    try {
      resolve(this._run());
    } catch (e) {
      if (reject) reject(e);
    }
  }
}

export function createMockSupabase(seed = {}) {
  const store = {
    tables: {
      profiles: seed.profiles || [],
      jobs: seed.jobs || [],
      job_items: seed.job_items || [],
      attachments: seed.attachments || [],
      user_states: seed.user_states || [],
      webhook_events: seed.webhook_events || [],
    },
    uniques: {
      profiles: [['line_user_id']],
      webhook_events: [['line_event_id']],
      jobs: [['user_id', 'job_number']],
      user_states: [['user_id']],
    },
  };

  return {
    _store: store,
    from(table) {
      return new Query(store, table);
    },
    // Force the JS fallback path in createJob (RPC "not installed").
    async rpc() {
      return { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } };
    },
  };
}
