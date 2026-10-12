'use client';

import { useState, useTransition } from 'react';
import { approveAndPostNow, regenerateImage, rejectDraft, saveDraftChanges } from '@/actions/content';
import { StatusBadge } from './status-badge';
import type { ContentWithBusiness } from '@/lib/types';

type Busy = null | 'save' | 'image' | 'post' | 'reject';
type Flash = { kind: 'ok' | 'err'; text: string } | null;

const MAX = 2200;

export function ContentCard({ item, quotaFull }: { item: ContentWithBusiness; quotaFull: boolean }) {
  const [caption, setCaption] = useState(item.generated_caption);
  const [notes, setNotes] = useState(item.admin_notes ?? '');
  const [imageUrl, setImageUrl] = useState(item.generated_image_url);
  const [imagePrompt, setImagePrompt] = useState(item.image_prompt ?? '');
  const [showPrompt, setShowPrompt] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [flash, setFlash] = useState<Flash>(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [, startTransition] = useTransition();

  const dirty = caption !== item.generated_caption || notes !== (item.admin_notes ?? '');
  const isRetry = item.published_status === 'failed';

  function run<T extends { ok: boolean; error?: string; message?: string }>(kind: Busy, fn: () => Promise<T>, onOk?: (r: T) => void) {
    setBusy(kind);
    setFlash(null);
    startTransition(async () => {
      const res = await fn();
      setBusy(null);
      if (res.ok) {
        onOk?.(res);
        if (res.message) setFlash({ kind: 'ok', text: res.message });
      } else {
        setFlash({ kind: 'err', text: res.error ?? 'Something went wrong' });
      }
    });
  }

  const save = () => run('save', () => saveDraftChanges({ contentId: item.id, caption, adminNotes: notes }));

  const regen = () =>
    run(
      'image',
      () => regenerateImage({ contentId: item.id, imagePrompt }),
      (r) => {
        if ('data' in r && r.data) {
          const d = r.data as { generated_image_url: string | null };
          setImgLoaded(false);
          setImageUrl(d.generated_image_url);
        }
      },
    );

  const post = () => {
    if (!confirm(`Publish this post for ${item.business.business_name} now? This uses 1 post from the monthly quota.`)) return;
    run('post', () => approveAndPostNow({ contentId: item.id, caption }));
  };

  const reject = () => {
    if (!confirm('Reject this draft? It will be removed from the hub.')) return;
    run('reject', () => rejectDraft({ contentId: item.id, notes }));
  };

  const locked = busy !== null;

  return (
    <article className="card flex flex-col overflow-hidden">
      {/* Header: client name + status */}
      <header className="flex items-center justify-between gap-3 border-b border-ink-100 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{item.business.business_name}</p>
          <p className="text-xs text-ink-500">
            {item.business.niche} · {new Date(item.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </p>
        </div>
        <StatusBadge review={item.review_status} published={item.published_status} />
      </header>

      {/* Image preview block (square, with skeleton while loading/regenerating) */}
      <div className="relative aspect-square bg-ink-100">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- external, user-generated URLs
          <img
            src={imageUrl}
            alt={imagePrompt || 'AI generated image preview'}
            loading="lazy"
            decoding="async"
            ref={(el) => {
              if (el?.complete && el.naturalWidth > 0) setImgLoaded(true); // cached before hydration
            }}
            onLoad={() => setImgLoaded(true)}
            onError={() => setImgLoaded(true)}
            className={`size-full object-cover transition-opacity duration-300 ${imgLoaded && busy !== 'image' ? 'opacity-100' : 'opacity-0'}`}
          />
        ) : null}
        {(!imgLoaded || busy === 'image' || !imageUrl) && (
          <div className="absolute inset-0 grid place-items-center">
            <div className="flex flex-col items-center gap-2 text-ink-400">
              <div className="size-10 animate-pulse rounded-xl bg-ink-200" />
              <span className="text-xs">{busy === 'image' ? 'Generating new image…' : imageUrl ? 'Loading preview…' : 'No image'}</span>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        {isRetry && item.last_error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">Last attempt failed: {item.last_error}</p>
        )}

        {item.generation_meta?.pillar && (
          <p className="text-xs text-ink-500">
            <span className="font-medium text-ink-700">Pillar:</span> {item.generation_meta.pillar}
            {item.generation_meta.format && <> · <span className="font-medium text-ink-700">Format:</span> {item.generation_meta.format}</>}
          </p>
        )}

        {/* Editable caption */}
        <div>
          <div className="mb-1.5 flex items-baseline justify-between">
            <label htmlFor={`cap-${item.id}`} className="label mb-0">Caption</label>
            <span className={`text-[11px] tabular-nums ${caption.length > MAX ? 'text-red-600' : 'text-ink-400'}`}>
              {caption.length}/{MAX}
            </span>
          </div>
          <textarea
            id={`cap-${item.id}`}
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            rows={7}
            disabled={locked}
            className="input resize-y leading-relaxed"
          />
        </div>

        {/* Collapsible: image prompt + notes */}
        <button type="button" onClick={() => setShowPrompt((s) => !s)} className="self-start text-xs font-medium text-ink-500 hover:text-ink-900">
          {showPrompt ? '▾' : '▸'} Image prompt & notes
        </button>
        {showPrompt && (
          <div className="space-y-3">
            <div>
              <label htmlFor={`prompt-${item.id}`} className="label">Image prompt</label>
              <textarea id={`prompt-${item.id}`} value={imagePrompt} onChange={(e) => setImagePrompt(e.target.value)} rows={3} disabled={locked} className="input text-xs" />
            </div>
            <div>
              <label htmlFor={`notes-${item.id}`} className="label">Admin notes</label>
              <textarea id={`notes-${item.id}`} value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} disabled={locked} className="input text-xs" placeholder="Internal only — never posted" />
            </div>
          </div>
        )}

        {flash && (
          <p role="status" className={`text-xs ${flash.kind === 'ok' ? 'text-green-700' : 'text-red-600'}`}>
            {flash.text}
          </p>
        )}

        {/* Actions: stack on mobile, 2-col grid on wider cards */}
        <div className="mt-auto grid grid-cols-2 gap-2 pt-1">
          <button onClick={save} disabled={locked || !dirty} className="btn-secondary">
            {busy === 'save' ? 'Saving…' : 'Save Changes'}
          </button>
          <button onClick={regen} disabled={locked} className="btn-secondary">
            {busy === 'image' ? 'Working…' : 'Regenerate Image'}
          </button>
          <button
            onClick={post}
            disabled={locked || quotaFull || !caption.trim() || caption.length > MAX || !imageUrl}
            title={quotaFull ? 'Monthly quota reached' : undefined}
            className="btn-primary col-span-2"
          >
            {busy === 'post' ? 'Posting…' : isRetry ? 'Retry: Approve & Post Now' : 'Approve & Post Now'}
          </button>
          <button onClick={reject} disabled={locked} className="btn-ghost col-span-2 text-xs">
            {busy === 'reject' ? 'Rejecting…' : 'Reject draft'}
          </button>
        </div>
      </div>
    </article>
  );
}
