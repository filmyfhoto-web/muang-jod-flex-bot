// ---------------------------------------------------------------------------------------------------------------
// State, and the line to the shop's database (the owner's own Supabase connection, through Claude's connector).
// ---------------------------------------------------------------------------------------------------------------
const PROJECT = 'mamlmgixovlwnjstetkj';
const SERVER = 'Supabase';
const CONTACT_KEYS = ['ask', 'orderAsk', 'documentAsk', 'orderWords', 'askWords', 'documentWords'];
const DEMO_ID = 'U' + '0'.repeat(32);

const S = {
  conn: 'connecting', // connecting | ready | offline | error
  connMsg: '',
  mcp: null,
  row: null, // the bot's settings row as the database shows it (LINE ids hidden)
  bot: null, // the shop's own bot settings
  history: [],
  content: null, // the working copy the owner edits
  savedJson: '',
  hasSavedRules: false,
  view: 'editor', // editor | flow | texts | schools | bot | json
  sel: null,
  q: '',
  pane: 'rules', // on a phone: rules | center | sim
  simTab: 'chat',
  chat: [],
  awaiting: false,
  lastRun: null,
  holidayShown: false,
  busy: false,
  saveConfirm: false,
  modal: null,
  modeAsk: null,
  schoolQ: '',
};

const uid = () => 'r' + Math.random().toString(36).slice(2, 8);
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o && o[k] !== undefined).map((k) => [k, o[k]]));

// The working copy: what the bot uses today (the shipped list until the owner saves one).
function contentFrom(row, bot) {
  const shop = Engine.buildShop(row, { bot: bot || {}, iconsBase: '' });
  return clone({
    rules: shop.rules ?? Engine.rulesFromFaq(shop.faq),
    schoolSupplies: shop.schoolSupplies,
    greeting: shop.greeting,
    thanks: shop.thanks,
    holiday: shop.holiday,
    contact: pick(shop.contact, CONTACT_KEYS),
  });
}

// The bot as the page imagines it right now (pictures come from the page's own files).
function currentShop() {
  const row = { ...(S.row || {}), content: S.content };
  const shop = Engine.buildShop(row, { bot: S.bot || {}, iconsBase: '' });
  shop.assetBase = 'img';
  return shop;
}

const dirty = () => S.content != null && JSON.stringify(S.content) !== S.savedJson;
const ruleById = (id) => (S.content?.rules || []).find((r) => r.id === id) || null;

// ---- the database --------------------------------------------------------------------------------------------

function textOf(res) {
  const p = res?.payload;
  if (typeof p === 'string') {
    try {
      const j = JSON.parse(p);
      if (typeof j?.result === 'string') return j.result;
    } catch {
      /* plain text */
    }
    return p;
  }
  if (p && typeof p.result === 'string') return p.result;
  return (res?.content || []).map((c) => c.text || '').join('');
}

// The connector wraps rows as  "…the below <untrusted-data-ID> boundaries.\n\n<untrusted-data-ID>\n[rows]\n</untrusted-data-ID>\n\n…"
// (the opening tag is also named in its first sentence, so the rows are what sits between the closing tag and the
// opening tag nearest before it)
function rowsOf(res) {
  const text = textOf(res);
  let body = text;
  const close = text.search(/<\/untrusted-data-[^>]*>/);
  if (close >= 0) {
    const open = text.lastIndexOf('<untrusted-data-', close);
    if (open >= 0) body = text.slice(text.indexOf('>', open) + 1, close);
  }
  try {
    return JSON.parse(body.trim());
  } catch {
    throw Object.assign(new Error('อ่านคำตอบจากฐานข้อมูลไม่ได้'), { code: 'unreadable' });
  }
}

async function runSql(query) {
  if (!S.mcp) throw Object.assign(new Error('ยังไม่ได้เชื่อมฐานข้อมูล'), { code: 'offline' });
  return rowsOf(await S.mcp.callTool(SERVER, 'execute_sql', { project_id: PROJECT, query }));
}

function explain(err) {
  const code = err?.code;
  switch (code) {
    case 'server_not_connected':
    case 'server_not_found':
      return 'ยังไม่ได้เชื่อม Supabase ใน Claude (Settings → Connectors) เชื่อมแล้วโหลดหน้านี้ใหม่ค่ะ';
    case 'needs_reauth':
      return 'การเชื่อม Supabase หมดอายุ ต้องเชื่อมใหม่ใน Claude (Settings → Connectors) ค่ะ';
    case 'selection_required':
      return 'มี Supabase หลายบัญชี เลือกบัญชีของร้านให้หน้านี้ก่อนค่ะ';
    case 'approval_required':
    case 'not_in_manifest':
    case 'consent_required':
    case 'not_granted':
      return 'ต้องกด "อนุญาต" ให้หน้านี้ใช้ Supabase ก่อนค่ะ (กดบันทึกหรือโหลดใหม่อีกครั้งแล้วเลือกอนุญาต)';
    case 'blocked_by_policy':
      return 'องค์กรไม่อนุญาตให้ใช้ Supabase จากหน้านี้ค่ะ';
    case 'tool_error':
      return 'ฐานข้อมูลปฏิเสธ: ' + clip(String(err.message || '').replace(/\s+/g, ' '), 180);
    case 'server_unavailable':
    case 'upstream_error':
      return 'เชื่อมต่อฐานข้อมูลไม่ได้ชั่วคราว ลองใหม่อีกครั้งค่ะ';
    default:
      return clip(String(err?.message || 'เกิดข้อผิดพลาด'), 180);
  }
}

function useData(d) {
  S.row = d.faq_bot || { mode: 'off', admins: [], content: {} };
  S.bot = d.line_bot || {};
  S.history = Array.isArray(d.history) ? d.history : [];
  S.hasSavedRules = Array.isArray(S.row?.content?.rules);
  S.content = contentFrom(S.row, S.bot);
  S.savedJson = JSON.stringify(S.content);
  if (!ruleById(S.sel)) S.sel = S.content.rules[0]?.id ?? null;
}

async function loadAll() {
  try {
    const rows = await runSql('select public.studio_load() as d');
    const d = rows[0]?.d;
    if (!d || !d.faq_bot) throw Object.assign(new Error('ไม่พบตั้งค่าบอทในฐานข้อมูล'), { code: 'nodata' });
    useData(d);
    S.conn = 'ready';
    S.connMsg = '';
  } catch (e) {
    S.conn = 'error';
    S.connMsg = explain(e);
    if (!S.content) loadDemo();
  }
}

// Without a database (opened outside Claude, or not allowed): the shipped bot, to look at and try. Nothing is saved.
function loadDemo() {
  const admins = Engine.DEFAULT_ADMINS.map((a) => ({ name: a.name, userId: DEMO_ID }));
  useData({ faq_bot: { mode: 'off', admins, content: {} }, line_bot: {}, history: [] });
  S.savedJson = JSON.stringify(S.content);
}

async function connect() {
  S.conn = 'connecting';
  try {
    S.mcp = (await window.claude?.use?.('mcp')) || null;
  } catch {
    S.mcp = null;
  }
  if (!S.mcp) {
    S.conn = 'offline';
    S.connMsg = 'เปิดนอก Claude หรือยังไม่ได้เชื่อม Supabase: ดู ลอง และ Export ได้ แต่บันทึกเข้าบอทไม่ได้';
    loadDemo();
    return;
  }
  await loadAll();
}

async function saveAll(note) {
  // exactly what the bot will read: cleaned the same way
  const out = clone(S.content);
  out.rules = Engine.cleanRules(out.rules);
  await runSql(`select public.studio_save(${sqlText(JSON.stringify(out))}::jsonb, ${sqlText(note || '')}) as r`);
  const keep = S.sel;
  await loadAll();
  if (ruleById(keep)) S.sel = keep;
}

async function setMode(mode) {
  await runSql(`select public.studio_set_mode(${sqlText(mode)}) as r`);
  S.row = { ...S.row, mode };
}

async function restoreVersion(id) {
  const n = Number(id);
  if (!Number.isInteger(n)) throw new Error('เลขเวอร์ชันไม่ถูกต้อง');
  await runSql(`select public.studio_restore(${n}) as r`);
  await loadAll();
}
