// A PostgreSQL (PGlite, the real engine compiled to WebAssembly) holding the shop's schema as it is in production, with the
// migration applied. asStaff() runs a callback as the `authenticated` role with a user JWT, the way Supabase does for the
// back office, so RLS, grants and auth.uid() behave as they do for staff.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

export const STAFF = '11111111-1111-4111-8111-111111111111';

const file = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

export async function openShopDb({ migrate = true } = {}) {
  const db = new PGlite();
  await db.exec(file('fixtures/shop-schema.sql'));
  if (migrate) await db.exec(file('migrations/001_chat_drafts.sql'));
  return db;
}

// Runs fn(tx) as the authenticated role with `sub` as auth.uid(). Anything it does is rolled back with the transaction.
export function asStaff(db, fn, sub = STAFF) {
  return db.transaction(async (tx) => {
    await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub, role: 'authenticated' })]);
    await tx.exec('set local role authenticated');
    return fn(tx);
  });
}

// Runs fn(tx) as the service role (the bot): no user, RLS bypassed.
export function asService(db, fn) {
  return db.transaction(async (tx) => {
    await tx.exec('set local role service_role');
    return fn(tx);
  });
}

export const migrationSql = () => file('migrations/001_chat_drafts.sql');
export const reverseSql = () => file('migrations/001_chat_drafts.reverse.sql');
