import 'server-only';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';

/**
 * Service-role client. Bypasses RLS — use ONLY for:
 *  - reading/writing business_credentials
 *  - uploading to Storage
 *  - the cron path (no user session)
 * Never return its results to the browser without an ownership check.
 */
export function createAdminClient() {
  return createSupabaseClient(env.supabaseUrl(), env.serviceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
