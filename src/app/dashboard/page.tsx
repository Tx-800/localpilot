import type { Metadata } from 'next';
import Link from 'next/link';
import { ContentCard } from '@/components/content-card';
import { EmptyState } from '@/components/empty-state';
import { GenerateDraftButton } from '@/components/generate-draft-button';
import { InfoIcon } from '@/components/icons';
import { PageHeader } from '@/components/page-header';
import { QuotaMeter } from '@/components/quota-meter';
import { env } from '@/lib/env';
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
  const practiceMode = env.textProvider() === 'mock' && env.imageProvider() === 'mock';

  const tab = (on: boolean) =>
    `rounded-lg px-3.5 py-1.5 transition-colors ${on ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-900'}`;

  return (
    <div>
      <PageHeader
        eyebrow="Approval Hub"
        title={showAll ? 'All clients' : active.business_name}
        description={
          <div className="mt-1 inline-flex rounded-xl bg-ink-100 p-1 text-sm font-medium">
            <Link href="/dashboard" className={tab(!showAll)}>This client</Link>
            <Link href="/dashboard?scope=all" className={tab(showAll)}>All clients</Link>
          </div>
        }
      >
        <QuotaMeter business={active} openDrafts={activeOpen} />
        <GenerateDraftButton businessId={active.id} disabled={!canGenerate} />
      </PageHeader>

      {practiceMode && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-sky-200/70 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          <InfoIcon className="mt-0.5 size-[18px] shrink-0 text-sky-600" />
          <p>
            <strong className="font-semibold">Practice mode.</strong> Captions use a template and pictures are random sample photos
            until an OpenAI API key is added. Nothing is posted to Instagram or Google.
          </p>
        </div>
      )}

      {items.length === 0 ? (
        <EmptyState
          title="Nothing waiting for review"
          body={`Generate a draft for ${active.business_name}, or turn on auto-generate in Client Settings.`}
        />
      ) : (
        // 1 col → 2 cols (md) → 3 cols (xl) → 4 cols (very wide screens)
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3 min-[1800px]:grid-cols-4">
          {items.map((item) => (
            <ContentCard
              key={item.id}
              item={item}
              quotaFull={quotaFullById.get(item.business_id) ?? false}
              showBusiness={showAll}
            />
          ))}
        </div>
      )}
    </div>
  );
}
