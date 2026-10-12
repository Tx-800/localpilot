import type { Metadata } from 'next';
import { EmptyState } from '@/components/empty-state';
import { ImageIcon } from '@/components/icons';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { getActiveBusiness, requireUser } from '@/lib/session';
import type { ContentItem } from '@/lib/types';

export const metadata: Metadata = { title: 'Published' };

const CHANNEL_LABELS: Record<string, string> = { instagram: 'Instagram', google_business: 'Google Business', mock: 'Practice' };

export default async function PublishedPage() {
  const { supabase } = await requireUser();
  const business = await getActiveBusiness();
  if (!business) {
    return (
      <EmptyState
        title="No clients yet"
        body="Add a client to see its post history."
        action={{ href: '/dashboard/businesses/new', label: 'Add client' }}
      />
    );
  }

  const { data, error } = await supabase
    .from('content_queue')
    .select('id, generated_image_url, generated_caption, review_status, published_status, published_at, external_post_ids')
    .eq('business_id', business.id)
    .in('published_status', ['published', 'processing'])
    .order('published_at', { ascending: false, nullsFirst: true })
    .limit(100);
  if (error) throw new Error(error.message);
  const items = (data ?? []) as Pick<
    ContentItem,
    'id' | 'generated_image_url' | 'generated_caption' | 'review_status' | 'published_status' | 'published_at' | 'external_post_ids'
  >[];

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        eyebrow="Published"
        title={business.business_name}
        description={`${items.length} post${items.length === 1 ? '' : 's'} sent${items.length === 100 ? ' (latest 100 shown)' : ''}`}
      />

      {items.length === 0 ? (
        <EmptyState title="No posts yet" body="Posts you approve in the Approval Hub will appear here with where they were posted." />
      ) : (
        <ul className="card divide-y divide-ink-100 overflow-hidden">
          {items.map((item) => {
            const caption = item.generated_caption.trim();
            const firstLine = caption.split('\n')[0];
            const rest = caption.slice(firstLine.length).trim();
            return (
              <li key={item.id} className="flex gap-4 p-4 transition-colors hover:bg-ink-50/60 sm:gap-5 sm:p-5">
                {item.generated_image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.generated_image_url}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="size-20 shrink-0 rounded-xl object-cover ring-1 ring-ink-200/80 sm:size-24"
                  />
                ) : (
                  <span className="grid size-20 shrink-0 place-items-center rounded-xl bg-ink-100 text-ink-400 sm:size-24">
                    <ImageIcon />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <StatusBadge review={item.review_status} published={item.published_status} />
                    <span className="text-xs text-ink-500">
                      {item.published_at
                        ? new Date(item.published_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
                        : 'In progress'}
                    </span>
                  </div>
                  <p className="mt-2 truncate text-sm font-semibold text-ink-900">{firstLine}</p>
                  {rest && <p className="mt-0.5 line-clamp-2 text-sm leading-relaxed text-ink-500">{rest}</p>}
                  {Object.keys(item.external_post_ids ?? {}).length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {Object.entries(item.external_post_ids).map(([channel, id]) => (
                        <span key={channel} className="chip" title={id}>
                          {channel.startsWith('google_business:') ? `Google · ${channel.slice('google_business:'.length)}` : (CHANNEL_LABELS[channel] ?? channel)}
                          <span className="font-mono text-[10px] text-ink-400">{id.slice(-8)}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
