/** Instant skeleton while a dashboard page loads; the sidebar stays in place. */
export default function DashboardLoading() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="Loading">
      <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-3">
          <div className="h-3 w-24 rounded-full bg-brand-100" />
          <div className="h-9 w-72 max-w-full rounded-xl bg-ink-200/70" />
          <div className="h-4 w-48 rounded-full bg-ink-200/50" />
        </div>
        <div className="h-[74px] w-full rounded-2xl bg-white shadow-card sm:w-72" />
      </div>
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="card overflow-hidden">
            <div className="aspect-square bg-ink-100" />
            <div className="space-y-3 p-5">
              <div className="h-5 w-28 rounded-full bg-ink-100" />
              <div className="h-32 rounded-xl bg-ink-100" />
              <div className="h-11 rounded-xl bg-brand-100" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
