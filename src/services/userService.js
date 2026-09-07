import { supabase } from '../config/supabase.js';
import { getProfile } from './lineService.js';

// Find or create the profile for a LINE user. This is the security anchor:
// every job/attachment/state query is keyed off the returned profile.id so
// one user can never see another user's data.
export async function getOrCreateProfile(lineUserId) {
  if (!lineUserId) throw new Error('lineUserId is required');

  const { data: existing, error: findErr } = await supabase
    .from('profiles')
    .select('*')
    .eq('line_user_id', lineUserId)
    .maybeSingle();

  if (findErr) {
    console.error('[userService] find profile failed:', findErr.message);
    throw findErr;
  }

  if (existing) return existing;

  // New user — enrich with LINE profile if available.
  let displayName = null;
  let pictureUrl = null;
  const profile = await getProfile(lineUserId);
  if (profile) {
    displayName = profile.displayName ?? null;
    pictureUrl = profile.pictureUrl ?? null;
  }

  const { data: created, error: insertErr } = await supabase
    .from('profiles')
    .insert({
      line_user_id: lineUserId,
      display_name: displayName,
      picture_url: pictureUrl,
    })
    .select('*')
    .single();

  if (insertErr) {
    // Handle race: another request may have created it concurrently.
    if (insertErr.code === '23505') {
      const { data: retry } = await supabase
        .from('profiles')
        .select('*')
        .eq('line_user_id', lineUserId)
        .single();
      if (retry) return retry;
    }
    console.error('[userService] create profile failed:', insertErr.message);
    throw insertErr;
  }

  console.log(`[userService] created profile for ${lineUserId}`);
  return created;
}

// Spec-named alias (createOrGetProfile) for getOrCreateProfile.
export const createOrGetProfile = getOrCreateProfile;

// Refresh display name / picture from LINE (best effort).
export async function syncProfile(profile, lineUserId) {
  const fresh = await getProfile(lineUserId);
  if (!fresh) return profile;
  if (
    fresh.displayName === profile.display_name &&
    fresh.pictureUrl === profile.picture_url
  ) {
    return profile;
  }
  const { data } = await supabase
    .from('profiles')
    .update({
      display_name: fresh.displayName ?? null,
      picture_url: fresh.pictureUrl ?? null,
    })
    .eq('id', profile.id)
    .select('*')
    .single();
  return data || profile;
}
