'use client';

import { useId, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setActiveBusiness } from '@/actions/business';
import type { BusinessProfile } from '@/lib/types';
import { ChevronDownIcon } from './icons';

/** Global client-context dropdown, used in both the sidebar and the mobile header. */
export function BusinessSwitcher({
  businesses,
  activeId,
  compact = false,
}: {
  businesses: Pick<BusinessProfile, 'id' | 'business_name' | 'niche'>[];
  activeId: string | null;
  compact?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const selectId = useId();

  if (businesses.length === 0) return null;

  return (
    <div className={compact ? 'min-w-0 flex-1' : ''}>
      {!compact && (
        <label htmlFor={selectId} className="mb-1.5 block px-1 text-[11px] font-semibold tracking-wider text-ink-400 uppercase">
          Active client
        </label>
      )}
      <div className="relative">
        <select
          id={selectId}
          aria-label="Switch active client"
          value={activeId ?? ''}
          disabled={pending}
          onChange={(e) => {
            const id = e.target.value;
            startTransition(async () => {
              await setActiveBusiness(id);
              router.refresh();
            });
          }}
          className={`input cursor-pointer appearance-none truncate pr-9 font-semibold disabled:opacity-60 ${compact ? "h-10 py-2" : ""}`}
        >
          {businesses.map((b) => (
            <option key={b.id} value={b.id}>
              {compact ? b.business_name : `${b.business_name} · ${b.niche}`}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute inset-y-0 right-3 grid place-items-center text-ink-400">
          {pending ? <span className="size-3.5 animate-spin rounded-full border-2 border-ink-200 border-t-brand-600" /> : <ChevronDownIcon className="size-4" />}
        </span>
      </div>
    </div>
  );
}
