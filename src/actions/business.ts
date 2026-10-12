'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ACTIVE_BUSINESS_COOKIE } from '@/lib/session';
import type { ActionResult, BusinessProfile } from '@/lib/types';

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
    google_gbp_location_id: str('google_gbp_location_id') || null,
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
  if (values.google_gbp_location_id &&!/^accounts\/[^/]+\/locations\/[^/]+$/.test(values.google_gbp_location_id)) {
    fieldErrors.google_gbp_location_id = 'Format: accounts/{id}/locations/{id}';
  }
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

export type CredentialStatus = { instagram: boolean; google: boolean; googleConnected: boolean };

/** Which secret tokens exist (booleans only — values never leave the server). */
export async function getCredentialStatus(businessId: string): Promise<CredentialStatus> {
  const supabase = await createClient();
  const { data: owned } = await supabase.from('business_profiles').select('id').eq('id', businessId).maybeSingle();
  if (!owned) return { instagram: false, google: false, googleConnected: false };

  const { data } = await createAdminClient()
    .from('business_credentials')
    .select('instagram_access_token, google_gbp_token, google_refresh_token')
    .eq('business_id', businessId)
    .maybeSingle();
  return {
    instagram: !!data?.instagram_access_token,
    google: !!data?.google_gbp_token,
    googleConnected: !!data?.google_refresh_token,
  };
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
