import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { BusinessProfile } from '@/lib/types';

export const ACTIVE_BUSINESS_COOKIE = 'active_business_id';

/**
 * Signed-in user + session client, or redirect to /login. Cached per request.
 * getClaims verifies the session JWT locally against the project's ES256 signing
 * key (JWKS cached), so page loads skip a round-trip to the Auth server.
 * Mutating actions still use getUser() for a server-side check.
 */
export const requireUser = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) redirect('/login');
  return { supabase, user: { id: claims.sub, email: (claims.email as string | undefined) ?? undefined } };
});

/** All businesses this agency user owns (RLS-scoped). */
export const listBusinesses = cache(async (): Promise<BusinessProfile[]> => {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from('business_profiles')
    .select('*')
    .order('business_name', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as BusinessProfile[];
});

/** The business currently selected in the global switcher (falls back to the first). */
export const getActiveBusiness = cache(async (): Promise<BusinessProfile | null> => {
  const businesses = await listBusinesses();
  if (businesses.length === 0) return null;
  const id = (await cookies()).get(ACTIVE_BUSINESS_COOKIE)?.value;
  return businesses.find((b) => b.id === id) ?? businesses[0];
});

/** Name + agency for the signed-in user (shown in the app shell). */
export const getProfile = cache(async (): Promise<{ full_name: string | null; agency_name: string | null }> => {
  const { supabase, user } = await requireUser();
  const { data } = await supabase.from('profiles').select('full_name, agency_name').eq('id', user.id).maybeSingle();
  return { full_name: data?.full_name ?? null, agency_name: data?.agency_name ?? null };
});
