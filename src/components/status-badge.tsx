import type { PublishedStatus, ReviewStatus } from '@/lib/types';

const STYLES: Record<string, { pill: string; dot: string }> = {
  pending_review: { pill: 'bg-amber-50 text-amber-800 ring-amber-200/70', dot: 'bg-amber-500' },
  approved: { pill: 'bg-sky-50 text-sky-800 ring-sky-200/70', dot: 'bg-sky-500' },
  rejected: { pill: 'bg-ink-100 text-ink-500 ring-ink-200', dot: 'bg-ink-400' },
  processing: { pill: 'bg-sky-50 text-sky-800 ring-sky-200/70', dot: 'bg-sky-500 animate-pulse' },
  published: { pill: 'bg-emerald-50 text-emerald-800 ring-emerald-200/70', dot: 'bg-emerald-500' },
  failed: { pill: 'bg-red-50 text-red-700 ring-red-200/70', dot: 'bg-red-500' },
};

const LABELS: Record<string, string> = {
  pending_review: 'Pending review',
  approved: 'Approved',
  rejected: 'Rejected',
  processing: 'Posting…',
  published: 'Published',
  failed: 'Publish failed',
};

export function StatusBadge({ review, published }: { review: ReviewStatus; published: PublishedStatus }) {
  const key = published === 'draft' ? review : published;
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${STYLES[key].pill}`}>
      <span className={`size-1.5 rounded-full ${STYLES[key].dot}`} />
      {LABELS[key]}
    </span>
  );
}
