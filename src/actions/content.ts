'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { AppError, fromDbError, toMessage } from '@/lib/errors';
import { generateImageUrl } from '@/lib/ai/image';
import { publishToChannels } from '@/lib/publishers';
import { rewriteCopyForDraft } from '@/lib/generation';
import { persistImage } from '@/lib/storage';
import { composeInstagramCaption, GBP_MAX, INSTAGRAM_MAX, normalizeHashtags } from '@/lib/captions';
import type { ActionResult, BusinessCredentials, BusinessProfile, ContentItem } from '@/lib/types';

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // browser compresses to JPEG well below this

/** Editable text of a draft, as sent from the card. */
type DraftText = { caption: string; hashtags: string[] | string; gbpCaption: string };

async function sessionClient() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AppError('UNAUTHORIZED', 'Sign in required');
  return supabase;
}

function refresh() {
  revalidatePath('/dashboard', 'layout');
}

/** Validate + normalise the editable text; returns the DB column values. */
function validateText(input: DraftText) {
  const caption = input.caption.trim();
  const hashtags = normalizeHashtags(input.hashtags);
  const gbp = input.gbpCaption.trim();
  if (!caption) throw new AppError('VALIDATION', 'Instagram caption cannot be empty');
  const igLength = composeInstagramCaption(caption, hashtags).length;
  if (igLength > INSTAGRAM_MAX) {
    throw new AppError('VALIDATION', `Instagram caption + hashtags is ${igLength} characters (max ${INSTAGRAM_MAX})`);
  }
  if (gbp.length > GBP_MAX) throw new AppError('VALIDATION', `Google text is ${gbp.length} characters (max ${GBP_MAX})`);
  return { generated_caption: caption, hashtags, gbp_caption: gbp };
}

/** [Save Changes] — persist edited text / notes. RLS only allows editing open drafts. */
export async function saveDraftChanges(input: DraftText & {
  contentId: string;
  adminNotes?: string;
}): Promise<ActionResult<ContentItem>> {
  try {
    const supabase = await sessionClient();
    const text = validateText(input);

    const { data, error } = await supabase
      .from('content_queue')
      .update({ ...text, admin_notes: input.adminNotes?.trim() || null })
      .eq('id', input.contentId)
      .select('*')
      .maybeSingle();

    if (error) throw fromDbError(error);
    if (!data) throw new AppError('INVALID_STATE', 'This draft can no longer be edited');

    refresh();
    return { ok: true, data: data as ContentItem, message: 'Changes saved' };
  } catch (err) {
    return { ok: false, ...toMessage(err) };
  }
}

/** [Regenerate Image] — new image for the same (optionally edited) prompt. */
export async function regenerateImage(input: {
  contentId: string;
  imagePrompt?: string;
}): Promise<ActionResult<ContentItem>> {
  try {
    const supabase = await sessionClient();

    const { data: item } = await supabase
      .from('content_queue')
      .select('*')
      .eq('id', input.contentId)
      .maybeSingle();
    if (!item) throw new AppError('NOT_FOUND', 'Draft not found');
    const current = item as ContentItem;
    if (!['draft', 'failed'].includes(current.published_status) || current.review_status === 'rejected') {
      throw new AppError('INVALID_STATE', 'Only open drafts can be regenerated');
    }

    const prompt = (input.imagePrompt ?? current.image_prompt ?? '').trim();
    if (!prompt) throw new AppError('VALIDATION', 'No image prompt available for this draft');

    const url = await generateImageUrl(prompt, current.business_id);

    const { data, error } = await supabase
      .from('content_queue')
      .update({ generated_image_url: url, image_prompt: prompt })
      .eq('id', current.id)
      .select('*')
      .maybeSingle();
    if (error) throw fromDbError(error);
    if (!data) throw new AppError('INVALID_STATE', 'This draft changed while the image was generating');

    refresh();
    return { ok: true, data: data as ContentItem, message: 'New image generated' };
  } catch (err) {
    return { ok: false, ...toMessage(err) };
  }
}

/** Load a draft the signed-in user owns that can still be edited (RLS-scoped). */
async function loadOpenDraft(supabase: Awaited<ReturnType<typeof sessionClient>>, contentId: string) {
  const { data: item } = await supabase.from('content_queue').select('*').eq('id', contentId).maybeSingle();
  if (!item) throw new AppError('NOT_FOUND', 'Draft not found');
  const current = item as ContentItem;
  if (!['draft', 'failed'].includes(current.published_status) || current.review_status === 'rejected') {
    throw new AppError('INVALID_STATE', 'Only open drafts can be changed');
  }
  return current;
}

/** [Rewrite] — AI writes new Instagram text, hashtags and Google text; the image is kept. */
export async function rewriteCaption(input: { contentId: string }): Promise<ActionResult<ContentItem>> {
  try {
    const supabase = await sessionClient();
    const current = await loadOpenDraft(supabase, input.contentId);
    const { data: business } = await supabase.from('business_profiles').select('*').eq('id', current.business_id).single();

    const copy = await rewriteCopyForDraft(supabase, business as BusinessProfile, current);
    const text = validateText({ caption: copy.caption, hashtags: copy.hashtags, gbpCaption: copy.gbpCaption });

    const { data, error } = await supabase
      .from('content_queue')
      .update(text)
      .eq('id', current.id)
      .select('*')
      .maybeSingle();
    if (error) throw fromDbError(error);
    if (!data) throw new AppError('INVALID_STATE', 'This draft changed while the text was being rewritten');

    refresh();
    return { ok: true, data: data as ContentItem, message: 'New text written' };
  } catch (err) {
    return { ok: false, ...toMessage(err) };
  }
}

/**
 * [Upload] — replace the image with the user's own photo. The browser converts
 * it to JPEG first (Instagram only accepts JPEG); stored like generated images.
 */
export async function uploadDraftImage(formData: FormData): Promise<ActionResult<ContentItem>> {
  try {
    const supabase = await sessionClient();
    const contentId = String(formData.get('contentId') ?? '');
    const file = formData.get('file');
    if (!(file instanceof File) || file.size === 0) throw new AppError('VALIDATION', 'Choose an image to upload');
    if (file.type !== 'image/jpeg') throw new AppError('VALIDATION', 'Image must be a JPEG');
    if (file.size > MAX_UPLOAD_BYTES) throw new AppError('VALIDATION', 'Image is too large (max 4 MB)');

    const current = await loadOpenDraft(supabase, contentId);
    const url = await persistImage(
      { kind: 'bytes', data: new Uint8Array(await file.arrayBuffer()), contentType: 'image/jpeg' },
      current.business_id,
    );

    const { data, error } = await supabase
      .from('content_queue')
      .update({ generated_image_url: url })
      .eq('id', current.id)
      .select('*')
      .maybeSingle();
    if (error) throw fromDbError(error);
    if (!data) throw new AppError('INVALID_STATE', 'This draft can no longer be edited');

    refresh();
    return { ok: true, data: data as ContentItem, message: 'Image uploaded' };
  } catch (err) {
    return { ok: false, ...toMessage(err) };
  }
}

/**
 * [Approve & Post Now] — the "increment" action.
 *  1. Save any unsaved caption edits (so what you see is what gets posted)
 *  2. claim_publish_slot  → validates state + quota, ATOMICALLY increments the
 *                           monthly counter, sets status 'processing'
 *  3. Forward to Meta / Google
 *  4. finalize_publish    → 'published', or 'failed' + slot refunded
 */
export async function approveAndPostNow(input: {
  contentId: string;
  text?: DraftText;
}): Promise<ActionResult<ContentItem>> {
  try {
    const supabase = await sessionClient();

    if (input.text) {
      const { error } = await supabase
        .from('content_queue')
        .update(validateText(input.text))
        .eq('id', input.contentId);
      if (error) throw fromDbError(error);
    }

    // 2. Reserve the slot (raises QUOTA_EXCEEDED / INVALID_STATE / VALIDATION)
    const { data: claimed, error: claimError } = await supabase.rpc('claim_publish_slot', {
      p_content_id: input.contentId,
    });
    if (claimError) throw fromDbError(claimError);
    const item = claimed as ContentItem;

    // 3. Publish. Any exception here must still finalize, or the slot stays held.
    let outcome: Awaited<ReturnType<typeof publishToChannels>>;
    try {
      const { data: business } = await supabase
        .from('business_profiles')
        .select('*')
        .eq('id', item.business_id)
        .single();

      // Tokens are service-role only; ownership was just proven by claim_publish_slot.
      const { data: creds } = await createAdminClient()
        .from('business_credentials')
        .select('*')
        .eq('business_id', item.business_id)
        .maybeSingle();

      outcome = await publishToChannels(business as BusinessProfile, creds as BusinessCredentials | null, item);
    } catch (err) {
      outcome = { anySuccess: false, externalIds: {}, errors: [err instanceof Error ? err.message : String(err)] };
    }

    // 4. Finalize
    const { data: finalized, error: finalError } = await supabase.rpc('finalize_publish', {
      p_content_id: item.id,
      p_success: outcome.anySuccess,
      p_external_ids: outcome.externalIds,
      p_error: outcome.errors.length ? outcome.errors.join(' | ') : null,
    });
    if (finalError) throw fromDbError(finalError);

    refresh();

    if (!outcome.anySuccess) {
      return { ok: false, code: 'PROVIDER_ERROR', error: `Publish failed — slot refunded. ${outcome.errors.join(' | ')}` };
    }
    return {
      ok: true,
      data: finalized as ContentItem,
      message: outcome.errors.length ? `Published with warnings: ${outcome.errors.join(' | ')}` : 'Published 🎉',
    };
  } catch (err) {
    return { ok: false, ...toMessage(err) };
  }
}

/** [Reject] — remove from the hub without publishing (frees the draft's quota hold). */
export async function rejectDraft(input: { contentId: string; notes?: string }): Promise<ActionResult> {
  try {
    const supabase = await sessionClient();
    const { error } = await supabase.rpc('reject_draft', {
      p_content_id: input.contentId,
      p_notes: input.notes?.trim() || null,
    });
    if (error) throw fromDbError(error);
    refresh();
    return { ok: true, message: 'Draft rejected' };
  } catch (err) {
    return { ok: false, ...toMessage(err) };
  }
}
