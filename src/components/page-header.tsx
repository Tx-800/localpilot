/** Consistent page title block: eyebrow, title, optional description and actions on the right. */
export function PageHeader({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">{title}</h1>
        {description && <div className="mt-2 text-sm text-ink-500">{description}</div>}
      </div>
      {children && <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-end">{children}</div>}
    </div>
  );
}
