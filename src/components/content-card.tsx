'use client';

import { useRef, useState, useTransition } from 'react';
import {
  approveAndPostNow,
  regenerateImage,
  rejectDraft,
  rewriteCaption,
  saveDraftChanges,
  uploadDraftImage,
} from '@/actions/content';
import { composeInstagramCaption, GBP_MAX, INSTAGRAM_MAX, normalizeHashtags } from '@/lib/captions';
import { ChevronDownIcon, ImageIcon, RefreshIcon, SaveIcon, SendIcon, SparklesIcon, UploadIcon, XIcon } from './icons';
import { StatusBadge } from './status-badge';
import type { ActionResult, ContentItem, ContentWithBusiness } from '@/lib/types';

type Busy = null | 'save' | 'image' | 'upload' | 'rewrite' | 'post' | 'reject';
type Flash = { kind: 'ok' | 'err'; text: string } | null;
type Channel = 'instagram' | 'google';

/** Resize to ≤ 1600px and re-encode as JPEG in the browser (Instagram needs JPEG; keeps uploads small). */
async function toJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not read this image');
  ctx.fillStyle = '#fff'; // transparent PNGs get a white background, not black
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not convert image'))), 'image/jpeg', 0.86),
  );
}

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
  const [hashtagText, setHashtagText] = useState((item.hashtags ?? []).join(' '));
  const [gbpCaption, setGbpCaption] = useState(item.gbp_caption ?? '');
  const [channel, setChannel] = useState<Channel>('instagram');
  const [notes, setNotes] = useState(item.admin_notes ?? '');
  const [imageUrl, setImageUrl] = useState(item.generated_image_url);
  const [imagePrompt, setImagePrompt] = useState(item.image_prompt ?? '');
  const [showPrompt, setShowPrompt] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [flash, setFlash] = useState<Flash>(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  const hashtags = normalizeHashtags(hashtagText);
  const igLength = composeInstagramCaption(caption, hashtags).length;
  const text = { caption, hashtags, gbpCaption };

  const dirty =
    caption !== item.generated_caption ||
    hashtags.join(' ') !== (item.hashtags ?? []).join(' ') ||
    gbpCaption !== (item.gbp_caption ?? '') ||
    notes !== (item.admin_notes ?? '');
  const isRetry = item.published_status === 'failed';
  const tooLong = igLength > INSTAGRAM_MAX || gbpCaption.length > GBP_MAX;

  function run<T extends { ok: boolean; error?: string; message?: string }>(kind: Busy, fn: () => Promise<T>, onOk?: (r: T) => void) {
    setBusy(kind);
    setFlash(null);
    startTransition(async () => {
      try {
        const res = await fn();
        if (res.ok) {
          onOk?.(res);
          if (res.message) setFlash({ kind: 'ok', text: res.message });
        } else {
          setFlash({ kind: 'err', text: res.error ?? 'Something went wrong' });
        }
      } catch (err) {
        setFlash({ kind: 'err', text: err instanceof Error ? err.message : 'Something went wrong' });
      } finally {
        setBusy(null);
      }
    });
  }

  const withImage = (r: ActionResult<ContentItem>) => {
    const d = r.ok ? r.data : undefined;
    if (d) {
      setImgLoaded(false);
      setImageUrl(d.generated_image_url);
    }
  };

  const save = () => run('save', () => saveDraftChanges({ contentId: item.id, ...text, adminNotes: notes }));

  const regen = () => run('image', () => regenerateImage({ contentId: item.id, imagePrompt }), withImage);

  const upload = (file: File | undefined) => {
    if (!file) return;
    run(
      'upload',
      async () => {
        const jpeg = await toJpeg(file);
        const form = new FormData();
        form.set('contentId', item.id);
        form.set('file', new File([jpeg], 'upload.jpg', { type: 'image/jpeg' }));
        return uploadDraftImage(form);
      },
      withImage,
    );
  };

  const rewrite = () => {
    if (dirty && !confirm('Replace your unsaved text edits with a new AI version?')) return;
    run('rewrite', () => rewriteCaption({ contentId: item.id }), (r) => {
      const d = r.ok ? r.data : undefined;
      if (d) {
        setCaption(d.generated_caption);
        setHashtagText((d.hashtags ?? []).join(' '));
        setGbpCaption(d.gbp_caption ?? '');
      }
    });
  };

  const post = () => {
    if (!confirm(`Publish this post for ${item.business.business_name} now? This uses 1 post from the monthly quota.`)) return;
    run('post', () => approveAndPostNow({ contentId: item.id, text }));
  };

  const reject = () => {
    if (!confirm('Reject this draft? It will be removed from the hub.')) return;
    run('reject', () => rejectDraft({ contentId: item.id, notes }));
  };

  const locked = busy !== null;
  const imageBusy = busy === 'image' || busy === 'upload';

  const meta = item.generation_meta ?? {};
  const created = new Date(item.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  const pill = 'pointer-events-auto inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full bg-white/95 px-3 text-xs font-semibold text-ink-800 shadow-sm backdrop-blur transition hover:bg-white disabled:opacity-60';
  const tab = (on: boolean) =>
    `flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${on ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-900'}`;

  return (
    <article className="card flex flex-col overflow-hidden transition-shadow hover:shadow-lift">
      {/* Image: square like the Instagram post; status + image actions overlaid */}
      <div className="relative aspect-square bg-ink-100">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- external, user-generated URLs
          <img
            src={imageUrl}
            alt={imagePrompt || 'Post image preview'}
            loading="lazy"
            decoding="async"
            ref={(el) => {
              if (el?.complete && el.naturalWidth > 0) setImgLoaded(true); // cached before hydration
            }}
            onLoad={() => setImgLoaded(true)}
            onError={() => setImgLoaded(true)}
            className={`size-full object-cover transition-opacity duration-300 ${imgLoaded && !imageBusy ? 'opacity-100' : 'opacity-0'}`}
          />
        ) : null}
        {(!imgLoaded || imageBusy || !imageUrl) && (
          <div className="absolute inset-0 grid place-items-center">
            <div className="flex flex-col items-center gap-2 text-ink-400">
              <ImageIcon className={`size-8 ${imageBusy || (imageUrl && !imgLoaded) ? 'animate-pulse' : ''}`} />
              <span className="text-xs font-medium">
                {busy === 'image' ? 'Generating new image…' : busy === 'upload' ? 'Uploading…' : imageUrl ? 'Loading preview…' : 'No image'}
              </span>
            </div>
          </div>
        )}
        <span className="absolute top-3 left-3 rounded-full bg-white/95 shadow-sm backdrop-blur">
          <StatusBadge review={item.review_status} published={item.published_status} />
        </span>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-end p-3">
          <div className="flex gap-1.5">
            <button type="button" onClick={() => fileInput.current?.click()} disabled={locked} className={pill} title="Use your own photo">
              <UploadIcon className="size-3.5" />
              Upload
            </button>
            <button type="button" onClick={regen} disabled={locked} className={pill} title="Generate a new image from the image prompt">
              <RefreshIcon className={`size-3.5 ${busy === 'image' ? 'animate-spin' : ''}`} />
              {busy === 'image' ? 'Working…' : 'New image'}
            </button>
          </div>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            upload(e.target.files?.[0]);
            e.target.value = ''; // allow re-selecting the same file
          }}
        />
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

        {/* Post text: one tab per channel */}
        <div>
          <div className="mb-2 flex items-center gap-2">
            <div className="flex flex-1 rounded-xl bg-ink-100 p-1" role="tablist" aria-label="Post text per channel">
              <button type="button" role="tab" aria-selected={channel === 'instagram'} onClick={() => setChannel('instagram')} className={tab(channel === 'instagram')}>
                Instagram
              </button>
              <button type="button" role="tab" aria-selected={channel === 'google'} onClick={() => setChannel('google')} className={tab(channel === 'google')}>
                Google
              </button>
            </div>
            <button
              type="button"
              onClick={rewrite}
              disabled={locked}
              className="btn-ghost h-9 shrink-0 px-2.5 text-xs text-brand-700 hover:bg-brand-50 hover:text-brand-800"
              title="Let AI write new text for both channels (the image is kept)"
            >
              <SparklesIcon className={`size-4 ${busy === 'rewrite' ? 'animate-pulse' : ''}`} />
              {busy === 'rewrite' ? 'Writing…' : 'Rewrite'}
            </button>
          </div>

          {channel === 'instagram' ? (
            <div className="space-y-3">
              <div>
                <div className="mb-1.5 flex items-baseline justify-between">
                  <label htmlFor={`cap-${item.id}`} className="label mb-0">Caption</label>
                  <span className={`text-xs tabular-nums ${igLength > INSTAGRAM_MAX ? 'font-semibold text-red-600' : 'text-ink-400'}`}>
                    {igLength.toLocaleString()} / {INSTAGRAM_MAX.toLocaleString()}
                  </span>
                </div>
                <textarea
                  id={`cap-${item.id}`}
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  rows={7}
                  disabled={locked}
                  className="input resize-y text-[13px] leading-relaxed"
                />
              </div>
              <div>
                <label htmlFor={`tags-${item.id}`} className="label">Hashtags</label>
                <textarea
                  id={`tags-${item.id}`}
                  value={hashtagText}
                  onChange={(e) => setHashtagText(e.target.value)}
                  rows={3}
                  disabled={locked}
                  className="input resize-y text-[13px] leading-relaxed text-sky-800"
                  placeholder="#PowaiCafe #BestCoffeeMumbai"
                />
                <p className="hint">
                  {hashtags.length} of 30 · separate with spaces or commas · added at the end on Instagram only
                </p>
              </div>
            </div>
          ) : (
            <div>
              <div className="mb-1.5 flex items-baseline justify-between">
                <label htmlFor={`gbp-${item.id}`} className="label mb-0">Google Business post</label>
                <span className={`text-xs tabular-nums ${gbpCaption.length > GBP_MAX ? 'font-semibold text-red-600' : 'text-ink-400'}`}>
                  {gbpCaption.length.toLocaleString()} / {GBP_MAX.toLocaleString()}
                </span>
              </div>
              <textarea
                id={`gbp-${item.id}`}
                value={gbpCaption}
                onChange={(e) => setGbpCaption(e.target.value)}
                rows={9}
                disabled={locked}
                className="input resize-y text-[13px] leading-relaxed"
                placeholder="Leave empty to use the Instagram caption without hashtags."
              />
              <p className="hint">No hashtags on Google. Shorter, informative text with a clear call to action works best.</p>
            </div>
          )}
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
            disabled={locked || quotaFull || !caption.trim() || tooLong || !imageUrl}
            title={quotaFull ? 'Monthly quota reached' : tooLong ? 'Text is too long' : undefined}
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
