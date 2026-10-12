'use client';

import { useState, useTransition } from 'react';
import { approveAndPostNow, regenerateImage, rejectDraft, saveDraftChanges } from '@/actions/content';
import { ChevronDownIcon, ImageIcon, RefreshIcon, SaveIcon, SendIcon, XIcon } from './icons';
import { StatusBadge } from './status-badge';
import type { ContentWithBusiness } from '@/lib/types';

type Busy = null | 'save' | 'image' | 'post' | 'reject';
type Flash = { kind: 'ok' | 'err'; text: string } | null;

const MAX = 2200;

export function ContentCard({
  item,
  quotaFull,
  showBusiness = false,
}: {
  item: ContentWithBusiness;
  quotaFull: boolean;
  showBusiness?: boolean;
}) {
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

  const meta = item.generation_meta ?? {};
  const created = new Date(item.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

  return (
    <article className="card flex flex-col overflow-hidden transition-shadow hover:shadow-lift">
      {/* Image: square like the Instagram post, status + regenerate overlaid */}
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
              <ImageIcon className={`size-8 ${busy === 'image' || (imageUrl && !imgLoaded) ? 'animate-pulse' : ''}`} />
              <span className="text-xs font-medium">{busy === 'image' ? 'Generating new image…' : imageUrl ? 'Loading preview…' : 'No image'}</span>
            </div>
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
          <span className="rounded-full bg-white/95 shadow-sm backdrop-blur">
            <StatusBadge review={item.review_status} published={item.published_status} />
          </span>
          <button
            type="button"
            onClick={regen}
            disabled={locked}
            className="pointer-events-auto inline-flex h-8 items-center gap-1.5 rounded-full bg-white/95 px-3 text-xs font-semibold text-ink-800 shadow-sm backdrop-blur transition hover:bg-white disabled:opacity-60"
            title="Generate a new image from the image prompt"
          >
            <RefreshIcon className={`size-3.5 ${busy === 'image' ? 'animate-spin' : ''}`} />
            {busy === 'image' ? 'Working…' : 'New image'}
          </button>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4 p-4 sm:p-5">
        {/* Meta row */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            {showBusiness && <span className="truncate text-sm font-semibold text-ink-900">{item.business.business_name}</span>}
            {meta.pillar && <span className="chip min-w-0 truncate bg-brand-50 text-brand-800">{meta.pillar}</span>}
            <span className="ml-auto shrink-0 text-xs text-ink-400">{created}</span>
          </div>
          {meta.format && (
            <p className="truncate text-xs text-ink-500" title={meta.format}>
              Format: {meta.format}
            </p>
          )}
        </div>

        {isRetry && item.last_error && (
          <p className="rounded-xl bg-red-50 px-3 py-2.5 text-xs leading-relaxed text-red-700">
            <strong className="font-semibold">Last attempt failed:</strong> {item.last_error}
          </p>
        )}

        {/* Editable caption */}
        <div>
          <div className="mb-1.5 flex items-baseline justify-between">
            <label htmlFor={`cap-${item.id}`} className="label mb-0">Caption</label>
            <span className={`text-xs tabular-nums ${caption.length > MAX ? 'font-semibold text-red-600' : 'text-ink-400'}`}>
              {caption.length.toLocaleString()} / {MAX.toLocaleString()}
            </span>
          </div>
          <textarea
            id={`cap-${item.id}`}
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            rows={8}
            disabled={locked}
            className="input resize-y text-[13px] leading-relaxed"
          />
        </div>

        {/* Collapsible: image prompt + notes */}
        <div className="rounded-xl border border-ink-200/80">
          <button
            type="button"
            onClick={() => setShowPrompt((s) => !s)}
            aria-expanded={showPrompt}
            className="flex w-full items-center justify-between px-3.5 py-2.5 text-sm font-medium text-ink-600 hover:text-ink-900"
          >
            Image prompt & notes
            <ChevronDownIcon className={`size-4 transition-transform ${showPrompt ? 'rotate-180' : ''}`} />
          </button>
          {showPrompt && (
            <div className="space-y-3 border-t border-ink-200/80 p-3.5">
              <div>
                <label htmlFor={`prompt-${item.id}`} className="label text-xs">Image prompt</label>
                <textarea id={`prompt-${item.id}`} value={imagePrompt} onChange={(e) => setImagePrompt(e.target.value)} rows={4} disabled={locked} className="input text-xs leading-relaxed" />
                <p className="hint">Edit, then press “New image” on the picture.</p>
              </div>
              <div>
                <label htmlFor={`notes-${item.id}`} className="label text-xs">Admin notes</label>
                <textarea id={`notes-${item.id}`} value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} disabled={locked} className="input text-xs" placeholder="Internal only — never posted" />
              </div>
            </div>
          )}
        </div>

        {flash && (
          <p role="status" className={`rounded-xl px-3 py-2 text-xs font-medium ${flash.kind === 'ok' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>
            {flash.text}
          </p>
        )}

        {/* Actions */}
        <div className="mt-auto flex flex-col gap-2 pt-1">
          <button
            onClick={post}
            disabled={locked || quotaFull || !caption.trim() || caption.length > MAX || !imageUrl}
            title={quotaFull ? 'Monthly quota reached' : undefined}
            className="btn-primary h-11 w-full"
          >
            <SendIcon className="size-4" />
            {busy === 'post' ? 'Posting…' : isRetry ? 'Retry: Approve & Post Now' : 'Approve & Post Now'}
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={save} disabled={locked || !dirty} className="btn-secondary">
              <SaveIcon className="size-4" />
              {busy === 'save' ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}
            </button>
            <button onClick={reject} disabled={locked} className="btn-danger">
              <XIcon className="size-4" />
              {busy === 'reject' ? 'Rejecting…' : 'Reject'}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
