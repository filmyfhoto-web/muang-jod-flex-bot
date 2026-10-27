// The tables the bot's own app flow reads (app_config, app_secrets, line_*), made as the database owner as the shop's app creates them.
// Only the columns the bot uses are here; the shop's real project has more.
export async function seedBotTables(db, { lineBot = { enabled: true, relay: true, menu_card: false, admin_pick: false, docs: false, menu_style: 'both' } } = {}) {
  await db.exec(`
    create table app_config (key text primary key, value jsonb, updated_at timestamptz default now());
    create table app_secrets (key text primary key, value text, updated_at timestamptz default now());
    create table line_chat_state (user_id text primary key, mode text not null default 'bot', admin_ms bigint, last_ms bigint,
      seen_ms bigint, menu_ms bigint, admin_name text, updated_at timestamptz not null default now());
    create table line_doc_state (line_user_id text primary key, step text, data jsonb, updated_at timestamptz default now());
    create table line_school_links (line_user_id text not null, school_id uuid not null, line_name text, friend boolean,
      first_at timestamptz not null default now(), last_at timestamptz not null default now(), visits integer not null default 0,
      primary key (line_user_id, school_id));
    grant all on app_config, app_secrets, line_chat_state, line_doc_state, line_school_links to service_role;
  `);
  await db.query("insert into app_config (key, value) values ('line_bot', $1::jsonb)", [JSON.stringify(lineBot)]);
  await db.query("insert into app_secrets (key, value) values ('push_hook_key', 'hook-key')");
}
