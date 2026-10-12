import type { Metadata } from 'next';
import Link from 'next/link';
import { ContentCard } from '@/components/content-card';
import { EmptyState } from '@/components/empty-state';
import { GenerateDraftButton } from '@/components/generate-draft-button';
import { QuotaMeter } from '@/components/quota-meter';
import { effectiveUsage } from '@/lib/quota';
import { getActiveBusiness, listBusinesses, requireUser } from '@/lib/session';
import type { ContentWithBusiness } from '@/lib/types';

export const metadata: Metadata = { title: 'Approval Hub' };

/**
 * Content Approval Hub
 *  - default: drafts for the active client
 *  - ?scope=all: drafts across every client (client name shown on each card)
 * Shows pending_review drafts plus failed publishes awaiting retry.
 */
export default async function ApprovalHubPage({ searchParams }: { searchParams: Promise<{ scope?: string }> }) {
  const { scope } = await searchParams;
  const showAll = scope === 'all';

  const { supabase } = await requireUser();
  const [businesses, active] = await Promise.all([listBusinesses(), getActiveBusiness()]);

  if (!active) {
    return (
      <EmptyState
        title="Add your first client"
        body="Create a business profile to start generating on-brand drafts for review."
        action={{ href: '/dashboard/businesses/new', label: 'Add client' }}
      />
    );
  }

  let query = supabase
    .from('content_queue')
    .select('*, business:business_profiles!inner(id, business_name, niche)')
    .neq('review_status', 'rejected')
    .in('published_status', ['draft', 'failed']);
  if (!showAll) query = query.eq('business_id', active.id);

  const { data, error } = await query.order('created_at', { ascending: false }).limit(60);
  if (error) throw new Error(error.message);
  const items = (data ?? []) as unknown as ContentWithBusiness[];

  const quotaFullById = new Map(businesses.map((b) => [b.id, effectiveUsage(b).remaining === 0]));
  const activeOpen = items.filter((i) => i.business_id === active.id).length;
  const activeUsage = effectiveUsage(active);
  const canGenerate = activeUsage.used + activeOpen < activeUsage.max;

  return (
    <div className="mx-auto max-w-7xl">
      {/* Page header: stacks on mobile, row on sm+ */}
      <div className="mb-6 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-wide text-brand-700 uppercase">Content Approval Hub</p>
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">
            {showAll ? 'All clients' : active.business_name}
          </h1>
          <div className="mt-3 inline-flex rounded-lg bg-ink-100 p-1 text-xs font-medium">
            <Link href="/dashboard" className={`rounded-md px-3 py-1 ${!showAll ? 'bg-white shadow-sm' : 'text-ink-500'}`}>
              This client
            </Link>
            <Link href="/dashboard?scope=all" className={`rounded-md px-3 py-1 ${showAll ? 'bg-white shadow-sm' : 'text-ink-500'}`}>
              All clients
            </Link>
          </div>
        </div>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <QuotaMeter business={active} openDrafts={activeOpen} />
          <GenerateDraftButton businessId={active.id} disabled={!canGenerate} />
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState
          title="Nothing waiting for review"
          body={`Generate a draft for ${active.business_name}, or turn on auto-generate in Client Settings.`}
        />
      ) : (
        // 1 col → 2 cols (sm) → 3 cols (xl) → 4 cols (2xl wide laptops / monitors)
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {items.map((item) => (
            <ContentCard key={item.id} item={item} quotaFull={quotaFullById.get(item.business_id) ?? false} />
          ))}
        </div>
      )}
    </div>
  );
}
