import type { PublishedStatus, ReviewStatus } from '@/lib/types';

const STYLES: Record<string, string> = {
  pending_review: 'bg-amber-50 text-amber-800 ring-amber-200',
  approved: 'bg-sky-50 text-sky-800 ring-sky-200',
  rejected: 'bg-ink-100 text-ink-500 ring-ink-200',
  processing: 'bg-sky-50 text-sky-800 ring-sky-200',
  published: 'bg-green-50 text-green-800 ring-green-200',
  failed: 'bg-red-50 text-red-700 ring-red-200',
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
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${STYLES[key]}`}>
      {LABELS[key]}
    </span>
  );
}
