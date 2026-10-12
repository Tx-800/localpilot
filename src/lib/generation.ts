import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { BusinessProfile, ContentItem } from '@/lib/types';
import { AppError, fromDbError } from '@/lib/errors';
import { assertDraftCapacity } from '@/lib/quota';
import { generateCopy } from '@/lib/ai/llm';
import { generateImageUrl } from '@/lib/ai/image';

/**
 * Full generation pipeline for one business:
 *   quota pre-check → LLM caption + image prompt → image → create_draft RPC
 *
 * `db` is either the user's session client (button) or the admin client (cron).
 * create_draft re-checks quota under a row lock, so concurrent runs are safe.
 */
export async function generateDraftForBusiness(
  db: SupabaseClient,
  business: BusinessProfile,
  opts: { scheduledFor?: string | null } = {},
): Promise<ContentItem> {
  await assertDraftCapacity(db, business);

  const copy = await generateCopy(business);
  const imageUrl = await generateImageUrl(copy.imagePrompt, business.id);

  const { data, error } = await db.rpc('create_draft', {
    p_business_id: business.id,
    p_caption: copy.caption,
    p_image_prompt: copy.imagePrompt,
    p_image_url: imageUrl,
    p_scheduled_for: opts.scheduledFor ?? null,
  });

  if (error) throw fromDbError(error);
  if (!data) throw new AppError('INTERNAL', 'Draft was not created');
  return data as ContentItem;
}
