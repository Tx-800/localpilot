'use client';

import { useMemo, useState, useTransition } from 'react';
import { listGoogleLocations } from '@/actions/business';
import type { GoogleLocation } from '@/lib/types';
import { CheckCircleIcon, PlusIcon, RefreshIcon, XIcon } from './icons';

const LOCATION_NAME = /^accounts\/[^/]+\/locations\/[^/]+$/;

/**
 * Pick which Google Business Profile locations a client posts to.
 * Loads every location the connected Google account manages; the selection is
 * submitted with the settings form as JSON in a hidden `google_locations` input.
 */
export function GoogleLocationPicker({
  businessId,
  initial,
  canLoad,
  error,
}: {
  businessId?: string;
  initial: GoogleLocation[];
  /** A Google connection exists (agency or client), so the list can be loaded. */
  canLoad: boolean;
  error?: string;
}) {
  const [selected, setSelected] = useState<GoogleLocation[]>(initial);
  const [available, setAvailable] = useState<GoogleLocation[] | null>(null);
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [manual, setManual] = useState('');
  const [loading, startLoading] = useTransition();

  const isSelected = (name: string) => selected.some((s) => s.name === name);
  const toggle = (loc: GoogleLocation) =>
    setSelected((cur) => (cur.some((s) => s.name === loc.name) ? cur.filter((s) => s.name !== loc.name) : [...cur, loc]));

  const load = () =>
    startLoading(async () => {
      const res = await listGoogleLocations(businessId);
      if (res.ok) {
        setAvailable(res.data ?? []);
        setMessage({ ok: true, text: res.message ?? '' });
      } else {
        setMessage({ ok: false, text: res.error });
      }
    });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (available ?? []).filter((l) => !q || `${l.title} ${l.address ?? ''}`.toLowerCase().includes(q));
  }, [available, query]);

  const addManual = () => {
    const name = manual.trim();
    if (!LOCATION_NAME.test(name)) {
      setMessage({ ok: false, text: 'Format: accounts/{id}/locations/{id}' });
      return;
    }
    if (!isSelected(name)) setSelected((cur) => [...cur, { name, title: name }]);
    setManual('');
    setMessage(null);
  };

  return (
    <div>
      <input type="hidden" name="google_locations" value={JSON.stringify(selected)} />

      <div className="flex items-center justify-between gap-3">
        <p className="label mb-0">Google Business locations</p>
        {canLoad && (
          <button type="button" onClick={load} disabled={loading} className="btn-secondary h-9 px-3 text-xs">
            <RefreshIcon className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Loading…' : available ? 'Reload list' : 'Choose from Google'}
          </button>
        )}
      </div>
      <p className="hint mt-1">An approved post goes to every location ticked here and counts as one post.</p>

      {/* Current selection */}
      {selected.length > 0 ? (
        <ul className="mt-3 divide-y divide-ink-100 rounded-xl border border-ink-200/80">
          {selected.map((l) => (
            <li key={l.name} className="flex items-center gap-3 px-3.5 py-2.5">
              <CheckCircleIcon className="size-4 shrink-0 text-emerald-600" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink-900">{l.title}</p>
                <p className="truncate text-xs text-ink-500">{l.address ?? (l.title === l.name ? 'Added manually' : l.name)}</p>
              </div>
              <button type="button" onClick={() => toggle(l)} className="btn-ghost size-8 p-0" aria-label={`Remove ${l.title}`}>
                <XIcon className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 rounded-xl border border-dashed border-ink-300 px-3.5 py-3 text-sm text-ink-500">
          No locations yet{canLoad ? ' — press “Choose from Google”.' : '.'}
        </p>
      )}

      {message && (
        <p className={`mt-2 text-xs font-medium ${message.ok ? 'text-emerald-700' : 'text-red-600'}`}>{message.text}</p>
      )}
      {error && <p className="hint font-medium text-red-600">{error}</p>}

      {/* Everything the Google account manages */}
      {available && available.length > 0 && (
        <div className="mt-3 rounded-xl border border-ink-200/80">
          <div className="border-b border-ink-100 p-2.5">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${available.length} locations…`}
              className="input h-9 py-1.5"
              aria-label="Search locations"
            />
          </div>
          <ul className="max-h-72 divide-y divide-ink-100 overflow-y-auto">
            {filtered.map((l) => (
              <li key={l.name}>
                <label className="flex cursor-pointer items-center gap-3 px-3.5 py-2.5 hover:bg-ink-50">
                  <input type="checkbox" checked={isSelected(l.name)} onChange={() => toggle(l)} className="size-4 accent-brand-600" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink-900">{l.title}</span>
                    {l.address && <span className="block truncate text-xs text-ink-500">{l.address}</span>}
                  </span>
                </label>
              </li>
            ))}
            {filtered.length === 0 && <li className="px-3.5 py-3 text-sm text-ink-500">No locations match “{query}”.</li>}
          </ul>
        </div>
      )}

      {/* Manual entry (when the list can't be loaded) */}
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-xs font-medium text-ink-500 hover:text-ink-900">Add a location ID manually</summary>
        <div className="mt-2 flex gap-2">
          <input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addManual();
              }
            }}
            placeholder="accounts/123/locations/456"
            className="input font-mono text-xs"
            aria-label="Location ID"
          />
          <button type="button" onClick={addManual} className="btn-secondary shrink-0">
            <PlusIcon className="size-4" />
            Add
          </button>
        </div>
      </details>
    </div>
  );
}
