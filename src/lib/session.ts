import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { BusinessProfile } from '@/lib/types';

export const ACTIVE_BUSINESS_COOKIE = 'active_business_id';

/** Signed-in user + session client, or redirect to /login. Cached per request. */
export const requireUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  return { supabase, user };
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
