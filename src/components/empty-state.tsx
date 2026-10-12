import Link from 'next/link';

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="card grid place-items-center px-6 py-16 text-center">
      <div className="mb-4 grid size-12 place-items-center rounded-2xl bg-brand-50 text-xl text-brand-600">✦</div>
      <h2 className="font-display text-xl font-semibold">{title}</h2>
      <p className="mt-1 max-w-sm text-sm text-ink-500">{body}</p>
      {action && (
        <Link href={action.href} className="btn-primary mt-5">
          {action.label}
        </Link>
      )}
    </div>
  );
}
