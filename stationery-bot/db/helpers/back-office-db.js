// The shop's rows and the back-office tables that the browser tests need, on the PGlite database (the same shape as production).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const STORE = '22222222-2222-4222-8222-222222222222';
export const P1 = '33333333-3333-4333-8333-333333333331'; // ไม้ถูพื้น 55 บาท สต็อก 10
export const P2 = '33333333-3333-4333-8333-333333333332'; // น้ำยาล้างจาน 60 บาท สต็อก 5
export const P3 = '33333333-3333-4333-8333-333333333333'; // ปากกาลูกลื่นน้ำเงิน 0.5 · 5 บาท · สต็อก 20

const MODULE_DIR = fileURLToPath(new URL('../../app-patches/chat-drafts-module/', import.meta.url));

export async function seedShopCatalogue(db) {
  await db.query("insert into stores (id, name, vat_rate, doc_prefix) values ($1, 'นัฐภรณ์ คัลเลอร์แล็ป', 7, 'RC-CL')", [STORE]);
  await db.query(
    `insert into products (id, code, name, unit, price, stock_qty) values
       ($1, 'A1', 'ไม้ถูพื้น', 'อัน', 55, 10),
       ($2, 'A2', 'น้ำยาล้างจาน', 'ขวด', 60, 5),
       ($3, 'A3', 'ปากกาลูกลื่นน้ำเงิน 0.5', 'ด้าม', 5, 20)`,
    [P1, P2, P3],
  );
}

// The back office's own tables (app_modules and pick_slips), the live weborders module, and the chat-orders screen installed with
// its apply.sql and then switched on: the owner's steps, as they would be on production.
export async function seedBackOffice(db, { weborders }) {
  await db.exec(`
    create table app_modules (name text primary key, code text not null, seq integer not null default 100, enabled boolean not null default true, updated_at timestamptz default now());
    create table pick_slips (id uuid primary key default gen_random_uuid(), order_id uuid, order_no text, customer text, school text, org text, phone text, items integer, total numeric, order_at timestamptz, archived_at timestamptz, file_path text, file_size integer, drive_url text, updated_at timestamptz default now());
    grant all on app_modules, pick_slips to anon, authenticated, service_role;
  `);
  await db.query("insert into app_modules (name, code, seq, enabled) values ('weborders', $1, 62, true)", [readFileSync(weborders, 'utf8')]);
  await db.exec(readFileSync(MODULE_DIR + 'apply.sql', 'utf8'));
  await db.query("update app_modules set enabled = true where name = 'chatorders'");
}
