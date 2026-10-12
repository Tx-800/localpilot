import type { SupabaseClient } from '@supabase/supabase-js';
import type { BusinessProfile } from '@/lib/types';
import { AppError } from '@/lib/errors';

/** First day of the current month in UTC, as YYYY-MM-DD (matches Postgres date_trunc on a UTC server). */
export function currentPeriodStart(now = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

/**
 * Usage as the UI should display it. The DB resets the counter lazily,
 * so a stale period means "0 used" even if the stored count is higher.
 */
export function effectiveUsage(b: Pick<BusinessProfile, 'current_month_post_count' | 'max_posts_per_month' | 'quota_period_start'>) {
  const used = b.quota_period_start < currentPeriodStart() ? 0 : b.current_month_post_count;
  const max = b.max_posts_per_month;
  return {
    used,
    max,
    remaining: Math.max(max - used, 0),
    percent: max === 0 ? 100 : Math.min(100, Math.round((used / max) * 100)),
  };
}

/**
 * Cheap read-only pre-check before spending money on AI calls.
 * The authoritative, race-safe check runs again inside `create_draft`.
 */
export async function assertDraftCapacity(db: SupabaseClient, business: BusinessProfile) {
  const { count, error } = await db
    .from('content_queue')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', business.id)
    .neq('review_status', 'rejected')
    .in('published_status', ['draft', 'processing', 'failed']);

  if (error) throw new AppError('INTERNAL', error.message);

  const { used, max } = effectiveUsage(business);
  const open = count ?? 0;
  if (used + open >= max) {
    throw new AppError(
      'QUOTA_EXCEEDED',
      `${business.business_name} has ${used} published + ${open} open drafts of ${max} allowed this month.`,
    );
  }
}
