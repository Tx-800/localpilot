import { effectiveUsage } from '@/lib/quota';
import type { BusinessProfile } from '@/lib/types';

export function QuotaMeter({
  business,
  openDrafts,
}: {
  business: Pick<BusinessProfile, 'current_month_post_count' | 'max_posts_per_month' | 'quota_period_start'>;
  openDrafts?: number;
}) {
  const { used, max, remaining, percent } = effectiveUsage(business);
  const tone = percent >= 100 ? 'bg-red-500' : percent >= 80 ? 'bg-amber-500' : 'bg-brand-600';

  return (
    <div className="card w-full px-4 py-3 sm:w-72">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium text-ink-500">Posts this month</span>
        <span className="tabular-nums text-sm text-ink-500">
          <strong className="text-lg font-semibold text-ink-900">{used}</strong> / {max}
        </span>
      </div>
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-100"
        role="progressbar"
        aria-label="Monthly post quota"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={used}
      >
        <div className={`h-full rounded-full transition-all ${tone}`} style={{ width: `${Math.max(percent, used > 0 ? 3 : 0)}%` }} />
      </div>
      <p className="mt-2 text-xs text-ink-500">
        <span className="font-medium text-ink-700">{remaining} left</span>
        {openDrafts !== undefined && ` · ${openDrafts} draft${openDrafts === 1 ? '' : 's'} in review`}
      </p>
    </div>
  );
}
