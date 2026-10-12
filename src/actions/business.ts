'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ACTIVE_BUSINESS_COOKIE } from '@/lib/session';
import { accessTokenFromRefresh, getAgencyGoogle, listManagedLocations } from '@/lib/google-oauth';
import type { ActionResult, BusinessProfile, GoogleLocation } from '@/lib/types';

const LOCATION_NAME = /^accounts\/[^/]+\/locations\/[^/]+$/;

/** Picker JSON → validated list, or null when invalid. */
function parseLocations(raw: string): GoogleLocation[] | null {
  if (!raw) return [];
  try {
    const list = JSON.parse(raw) as unknown;
    if (!Array.isArray(list) || list.length > 50) return null;
    const out: GoogleLocation[] = [];
    for (const l of list as Record<string, unknown>[]) {
      const name = typeof l?.name === 'string' ? l.name.trim() : '';
      if (!LOCATION_NAME.test(name)) return null;
      if (out.some((o) => o.name === name)) continue;
      out.push({
        name,
        title: (typeof l.title === 'string' && l.title.trim() ? l.title.trim() : name).slice(0, 200),
        ...(typeof l.address === 'string' && l.address.trim() ? { address: l.address.trim().slice(0, 300) } : {}),
      });
    }
    return out;
  } catch {
    return null;
  }
}

/** Global switcher: remember the selected client in a cookie. */
export async function setActiveBusiness(businessId: string): Promise<void> {
  const supabase = await createClient();
  const { data } = await supabase.from('business_profiles').select('id').eq('id', businessId).maybeSingle();
  if (!data) return; // not theirs / doesn't exist — ignore silently

  (await cookies()).set(ACTIVE_BUSINESS_COOKIE, businessId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath('/dashboard', 'layout');
}

export type BusinessFormState = ActionResult<{ id: string }> & { fieldErrors?: Record<string, string> };

/** Create or update a client business from the Client Settings form. */
export async function saveBusinessProfile(_prev: BusinessFormState | null, formData: FormData): Promise<BusinessFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sign in required' };

  const str = (k: string) => String(formData.get(k) ?? '').trim();
  const id = str('id') || null;

  const values = {
    business_name: str('business_name'),
    niche: str('niche'),
    target_location: str('target_location'),
    brand_voice_style: str('brand_voice_style') || 'Warm, friendly and local',
    target_keywords: str('target_keywords')
      .split(/[,\n]/)
      .map((k) => k.trim())
      .filter(Boolean)
      .slice(0, 20),
    content_pillars: str('content_pillars')
      .split('\n')
      .map((p) => p.trim())
      .filter(Boolean)
      .slice(0, 15),
    caption_instructions: str('caption_instructions'),
    image_style: str('image_style'),
    max_posts_per_month: Number(str('max_posts_per_month')),
    auto_generate_enabled: formData.get('auto_generate_enabled') === 'on',
    instagram_page_id: str('instagram_page_id') || null,
    // Locations now come from the picker; the legacy single-ID column is cleared on save.
    google_gbp_location_id: null as string | null,
    google_locations: parseLocations(str('google_locations')),
  };

  // ---- Validation --------------------------------------------------------
  const fieldErrors: Record<string, string> = {};
  if (!values.business_name) fieldErrors.business_name = 'Required';
  else if (values.business_name.length > 120) fieldErrors.business_name = 'Max 120 characters';
  if (!values.niche) fieldErrors.niche = 'Required';
  if (!values.target_location) fieldErrors.target_location = 'Required';
  if (!Number.isInteger(values.max_posts_per_month) || values.max_posts_per_month < 0 || values.max_posts_per_month > 1000) {
    fieldErrors.max_posts_per_month = 'Whole number between 0 and 1000';
  }
  if (values.content_pillars.some((p) => p.length > 120)) fieldErrors.content_pillars = 'Keep each pillar under 120 characters';
  if (values.caption_instructions.length > 2000) fieldErrors.caption_instructions = 'Max 2000 characters';
  if (values.image_style.length > 1000) fieldErrors.image_style = 'Max 1000 characters';
  if (values.google_locations === null) fieldErrors.google_locations = 'Each location must look like accounts/{id}/locations/{id} (max 50)';
  if (Object.keys(fieldErrors).length) return { ok: false, error: 'Please fix the highlighted fields', fieldErrors };

  // ---- Write profile (RLS + column grants enforce ownership & safe columns)
  let businessId: string;
  if (id) {
    const { data, error } = await supabase.from('business_profiles').update(values).eq('id', id).select('id').maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: 'Business not found' };
    businessId = data.id;
  } else {
    const { data, error } = await supabase
      .from('business_profiles')
      .insert({ ...values, agency_user_id: user.id })
      .select('id')
      .single();
    if (error) return { ok: false, error: error.message };
    businessId = (data as Pick<BusinessProfile, 'id'>).id;
  }

  // ---- Secrets: write-only. Blank field = keep existing; "__clear__" = remove.
  const igToken = str('instagram_access_token');
  const gbpToken = str('google_gbp_token');
  if (igToken || gbpToken) {
    const patch: Record<string, string | null> = { business_id: businessId };
    if (igToken) patch.instagram_access_token = igToken === '__clear__' ? null : igToken;
    if (gbpToken) patch.google_gbp_token = gbpToken === '__clear__' ? null : gbpToken;
    // Ownership verified above via the RLS-scoped write that returned this id.
    const { error } = await createAdminClient().from('business_credentials').upsert(patch, { onConflict: 'business_id' });
    if (error) return { ok: false, error: `Profile saved, but tokens failed: ${error.message}` };
  }

  revalidatePath('/dashboard', 'layout');

  if (!id) {
    await setActiveBusiness(businessId);
    redirect('/dashboard/settings?created=1');
  }
  return { ok: true, data: { id: businessId }, message: 'Client settings saved' };
}

export type CredentialStatus = {
  instagram: boolean;
  /** A pasted Google access token exists (legacy fallback). */
  google: boolean;
  /** This client has its own Google connection. */
  googleConnected: boolean;
  /** The agency's Google connection (My Profile). */
  agencyGoogle: { connected: boolean; email: string | null };
};

/** Which secret tokens exist (booleans only — values never leave the server). */
export async function getCredentialStatus(businessId: string): Promise<CredentialStatus> {
  const supabase = await createClient();
  const { data: owned } = await supabase.from('business_profiles').select('id').eq('id', businessId).maybeSingle();
  const agencyGoogle = await getAgencyGoogleStatus();
  if (!owned) return { instagram: false, google: false, googleConnected: false, agencyGoogle };

  const { data } = await createAdminClient()
    .from('business_credentials')
    .select('instagram_access_token, google_gbp_token, google_refresh_token')
    .eq('business_id', businessId)
    .maybeSingle();
  return {
    instagram: !!data?.instagram_access_token,
    google: !!data?.google_gbp_token,
    googleConnected: !!data?.google_refresh_token,
    agencyGoogle,
  };
}

/** Agency-level Google connection (My Profile), for the signed-in user. */
export async function getAgencyGoogleStatus(): Promise<{ connected: boolean; email: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { connected: false, email: null };
  const agency = await getAgencyGoogle(user.id);
  return { connected: !!agency, email: agency?.email ?? null };
}

/** [Disconnect] on My Profile — forget the agency's Google refresh token. */
export async function disconnectAgencyGoogle(): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sign in required' };
  const { error } = await createAdminClient().from('agency_credentials').delete().eq('user_id', user.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/dashboard', 'layout');
  return { ok: true, message: 'Google disconnected' };
}

/**
 * [Choose locations] — every Business Profile location the connected Google account manages.
 * Uses the client's own Google connection when it has one, otherwise the agency's.
 */
export async function listGoogleLocations(businessId?: string): Promise<ActionResult<GoogleLocation[]>> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: 'Sign in required' };

    let refreshToken: string | null = null;
    if (businessId) {
      const { data: owned } = await supabase.from('business_profiles').select('id').eq('id', businessId).maybeSingle();
      if (!owned) return { ok: false, error: 'Business not found' };
      const { data: creds } = await createAdminClient()
        .from('business_credentials')
        .select('google_refresh_token')
        .eq('business_id', businessId)
        .maybeSingle();
      refreshToken = creds?.google_refresh_token ?? null;
    }
    refreshToken ??= (await getAgencyGoogle(user.id))?.refreshToken ?? null;
    if (!refreshToken) return { ok: false, error: 'Connect Google on My Profile first.' };

    const locations = await listManagedLocations(await accessTokenFromRefresh(refreshToken));
    return { ok: true, data: locations, message: `${locations.length} location${locations.length === 1 ? '' : 's'} found` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not load locations' };
  }
}

/** [Disconnect Google] — forget the stored Google refresh token for this client. */
export async function disconnectGoogle(businessId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: owned } = await supabase.from('business_profiles').select('id').eq('id', businessId).maybeSingle();
  if (!owned) return { ok: false, error: 'Business not found' };
  const { error } = await createAdminClient()
    .from('business_credentials')
    .update({ google_refresh_token: null })
    .eq('business_id', businessId);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/dashboard/settings');
  return { ok: true, message: 'Google disconnected' };
}

export async function deleteBusiness(businessId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from('business_profiles').delete().eq('id', businessId);
  if (error) return { ok: false, error: error.message };
  (await cookies()).delete(ACTIVE_BUSINESS_COOKIE);
  revalidatePath('/dashboard', 'layout');
  redirect('/dashboard');
}
