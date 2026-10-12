'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { AppError, fromDbError, toMessage } from '@/lib/errors';
import { generateImageUrl } from '@/lib/ai/image';
import { publishToChannels } from '@/lib/publishers';
import type { ActionResult, BusinessCredentials, BusinessProfile, ContentItem } from '@/lib/types';

const MAX_CAPTION = 2200; // Instagram limit

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

function validateCaption(caption: string) {
  const c = caption.trim();
  if (!c) throw new AppError('VALIDATION', 'Caption cannot be empty');
  if (c.length > MAX_CAPTION) throw new AppError('VALIDATION', `Caption exceeds ${MAX_CAPTION} characters`);
  return c;
}

/** [Save Changes] — persist edited caption / notes. RLS only allows editing open drafts. */
export async function saveDraftChanges(input: {
  contentId: string;
  caption: string;
  adminNotes?: string;
}): Promise<ActionResult<ContentItem>> {
  try {
    const supabase = await sessionClient();
    const caption = validateCaption(input.caption);

    const { data, error } = await supabase
      .from('content_queue')
      .update({ generated_caption: caption, admin_notes: input.adminNotes?.trim() || null })
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
  caption?: string;
}): Promise<ActionResult<ContentItem>> {
  try {
    const supabase = await sessionClient();

    if (input.caption !== undefined) {
      const caption = validateCaption(input.caption);
      const { error } = await supabase
        .from('content_queue')
        .update({ generated_caption: caption })
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
