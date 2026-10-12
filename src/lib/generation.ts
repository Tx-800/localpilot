import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { BusinessProfile, ContentItem } from '@/lib/types';
import { AppError, fromDbError } from '@/lib/errors';
import { assertDraftCapacity } from '@/lib/quota';
import { generateCopy, type GeneratedCopy } from '@/lib/ai/llm';
import { generateImageUrl } from '@/lib/ai/image';
import { isTooSimilar, loadRecentPosts, planNext, withImageStyle, type GenerationPlan } from '@/lib/ai/strategy';

/**
 * Full generation pipeline for one business:
 *   quota pre-check → plan (rotate pillar / format / visual away from recent posts)
 *   → LLM caption + hashtags + Google text + image prompt (retry once if too similar)
 *   → image → create_draft RPC
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

  const plan = planNext(business, await loadRecentPosts(db, business.id));

  let copy = await generateCopy(business, plan);
  let attempts = 1;
  if (isTooSimilar(copy.caption, plan.recentCaptions)) {
    copy = await generateCopy(business, plan, { retry: true });
    attempts = 2;
  }

  const imagePrompt = withImageStyle(copy.imagePrompt, business.image_style);
  const imageUrl = await generateImageUrl(imagePrompt, business.id);

  const { data, error } = await db.rpc('create_draft', {
    p_business_id: business.id,
    p_caption: copy.caption,
    p_image_prompt: imagePrompt,
    p_image_url: imageUrl,
    p_scheduled_for: opts.scheduledFor ?? null,
    p_generation_meta: { pillar: plan.pillar, format: plan.format, visual: plan.visual, attempts },
    p_hashtags: copy.hashtags,
    p_gbp_caption: copy.gbpCaption,
  });

  if (error) throw fromDbError(error);
  if (!data) throw new AppError('INTERNAL', 'Draft was not created');
  return data as ContentItem;
}

/**
 * [Rewrite] — new caption, hashtags and Google text for an existing draft,
 * keeping its topic, format and image. The current caption is included in
 * "recent posts", so the model is pushed away from it.
 */
export async function rewriteCopyForDraft(
  db: SupabaseClient,
  business: BusinessProfile,
  item: ContentItem,
): Promise<GeneratedCopy> {
  const recent = await loadRecentPosts(db, business.id);
  const fallback = planNext(business, recent);
  const plan: GenerationPlan = {
    pillar: item.generation_meta?.pillar ?? fallback.pillar,
    format: item.generation_meta?.format ?? fallback.format,
    visual: item.generation_meta?.visual ?? fallback.visual,
    recentCaptions: [item.generated_caption, ...fallback.recentCaptions.filter((c) => c !== item.generated_caption)]
      .filter(Boolean)
      .slice(0, 6),
  };
  return generateCopy(business, plan, { retry: true });
}
