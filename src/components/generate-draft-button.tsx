'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { SparklesIcon } from './icons';

export function GenerateDraftButton({ businessId, disabled }: { businessId: string; disabled?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/generate-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessId }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!json.ok) setError(json.error ?? 'Generation failed');
      else startTransition(() => router.refresh());
    } catch {
      setError('Network error — please try again');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-stretch gap-1 sm:items-end">
      <button onClick={generate} disabled={busy || disabled} className="btn-primary h-11 px-5">
        {busy ? (
          <>
            <span className="size-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            Generating…
          </>
        ) : (
          <>
            <SparklesIcon className="size-4" />
            Generate draft
          </>
        )}
      </button>
      {disabled && !error && <p className="text-xs text-ink-500">Quota full for this month</p>}
      {error && <p role="alert" className="max-w-xs rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 sm:text-right">{error}</p>}
    </div>
  );
}
