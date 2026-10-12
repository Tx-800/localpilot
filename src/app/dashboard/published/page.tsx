import type { Metadata } from 'next';
import { EmptyState } from '@/components/empty-state';
import { StatusBadge } from '@/components/status-badge';
import { getActiveBusiness, requireUser } from '@/lib/session';
import type { ContentItem } from '@/lib/types';

export const metadata: Metadata = { title: 'Published' };

export default async function PublishedPage() {
  const { supabase } = await requireUser();
  const business = await getActiveBusiness();
  if (!business) return <EmptyState title="No clients yet" body="Add a client to see its post history." />;

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
      <div className="mb-6">
        <p className="text-xs font-semibold tracking-wide text-brand-700 uppercase">Published</p>
        <h1 className="font-display text-2xl font-semibold sm:text-3xl">{business.business_name}</h1>
      </div>

      {items.length === 0 ? (
        <EmptyState title="No posts yet" body="Approved posts will appear here with their platform IDs." />
      ) : (
        <ul className="card divide-y divide-ink-100">
          {items.map((item) => (
            <li key={item.id} className="flex gap-4 p-4">
              {item.generated_image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.generated_image_url} alt="" loading="lazy" decoding="async" className="size-16 shrink-0 rounded-lg object-cover sm:size-20" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge review={item.review_status} published={item.published_status} />
                  <span className="text-xs text-ink-500">
                    {item.published_at ? new Date(item.published_at).toLocaleString() : 'In progress'}
                  </span>
                </div>
                <p className="mt-1.5 line-clamp-2 text-sm text-ink-700">{item.generated_caption}</p>
                {Object.keys(item.external_post_ids ?? {}).length > 0 && (
                  <p className="mt-1 truncate font-mono text-[11px] text-ink-400">
                    {Object.entries(item.external_post_ids).map(([k, v]) => `${k}: ${v}`).join(' · ')}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
