import Link from 'next/link';
import { SparklesIcon } from './icons';

export function EmptyState({
  title,
  body,
  action,
  children,
}: {
  title: string;
  body: string;
  action?: { href: string; label: string };
  children?: React.ReactNode;
}) {
  return (
    <div className="card grid place-items-center border-dashed px-6 py-16 text-center sm:py-20">
      <div className="mb-5 grid size-14 place-items-center rounded-2xl bg-brand-50 text-brand-600 ring-8 ring-brand-50/50">
        <SparklesIcon className="size-6" />
      </div>
      <h2 className="font-display text-2xl font-semibold tracking-tight">{title}</h2>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-ink-500">{body}</p>
      {action && (
        <Link href={action.href} className="btn-primary mt-6">
          {action.label}
        </Link>
      )}
      {children && <div className="mt-6">{children}</div>}
    </div>
  );
}
