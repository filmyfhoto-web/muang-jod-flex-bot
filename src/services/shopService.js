import { supabase } from '../config/supabase.js';
import { logger } from './logger.js';

// The shop's own details — what goes at the top of a receipt handed to a
// customer. Every field is optional: a shop that never opens ตั้งค่า must keep
// working exactly as before, with a receipt that simply has no letterhead.

const FIELDS = ['shop_name', 'phone', 'address', 'tax_id', 'footer_note'];

const EMPTY = Object.freeze(Object.fromEntries(FIELDS.map((f) => [f, null])));

// Blank strings mean "cleared", not the string "" — a receipt would otherwise
// render an empty line where the phone number used to be.
function clean(patch = {}) {
  const out = {};
  for (const f of FIELDS) {
    if (!(f in patch)) continue;
    const v = patch[f];
    const s = v === null || v === undefined ? '' : String(v).trim();
    out[f] = s === '' ? null : s.slice(0, f === 'address' || f === 'footer_note' ? 500 : 200);
  }
  return out;
}

// Never throws: the letterhead is decoration on a receipt that has to render
// either way, so a database hiccup must not be able to take the receipt down.
export async function getShopProfile(userId, client = supabase) {
  if (!userId) return { ...EMPTY };
  try {
    const { data, error } = await client
      .from('shop_profiles')
      .select(FIELDS.join(','))
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    return { ...EMPTY, ...(data || {}) };
  } catch (err) {
    logger.warn('shop.read_failed', { message: err?.message });
    return { ...EMPTY };
  }
}

// Upsert, so the first save creates the row and later ones patch it. Only the
// fields the caller sent are touched — clearing the phone must not wipe the
// address typed on another visit.
export async function saveShopProfile(userId, patch, client = supabase) {
  const fields = clean(patch);
  if (!userId) throw new Error('missing user');

  const { data, error } = await client
    .from('shop_profiles')
    .upsert({ user_id: userId, ...fields }, { onConflict: 'user_id' })
    .select(FIELDS.join(','))
    .single();

  if (error) throw error;
  return { ...EMPTY, ...(data || {}) };
}

// True when there is anything worth printing. A receipt asks this before it
// draws a letterhead block, rather than drawing an empty box.
export function hasShopDetails(shop) {
  return FIELDS.some((f) => shop?.[f]);
}

export { FIELDS as SHOP_FIELDS };
