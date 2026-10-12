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
    <div className="w-full sm:w-64">
      <div className="mb-1.5 flex items-baseline justify-between text-xs">
        <span className="font-semibold tracking-wide text-ink-500 uppercase">Monthly quota</span>
        <span className="tabular-nums text-ink-700">
          <strong className="text-ink-900">{used}</strong> / {max} posted
        </span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-ink-100"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={used}
      >
        <div className={`h-full rounded-full transition-all ${tone}`} style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-1.5 text-xs text-ink-500">
        {remaining} left this month
        {openDrafts !== undefined && ` · ${openDrafts} draft${openDrafts === 1 ? '' : 's'} in review`}
      </p>
    </div>
  );
}
