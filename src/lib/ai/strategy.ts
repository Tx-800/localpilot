import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { BusinessProfile, GenerationMeta } from '@/lib/types';

/**
 * Per-business orchestration: decides WHAT the next post is about and how it
 * looks, rotating away from what this business has recently used so every
 * draft differs. History = the business's own content_queue (all statuses),
 * so each publish automatically steers the next generation.
 */

/** Used when a business has not defined its own content pillars. */
export const DEFAULT_PILLARS = [
  'a behind-the-scenes moment',
  'a customer favourite',
  'a seasonal hook relevant to this month',
  'a quick tip related to the niche',
  'the people/craft behind the business',
  'a neighbourhood / community angle',
];

export const POST_FORMATS = [
  'a short story told in the first person',
  'a practical tip the audience can use today',
  'a spotlight on one specific product or service',
  'a question that invites people to comment',
  'a myth-buster or little-known fact about the niche',
  'a "why locals choose us" reason',
  'a mini list of three quick points',
  'a this-week / timely hook',
];

export const VISUAL_DIRECTIONS = [
  'close-up detail shot with shallow depth of field',
  'wide establishing shot of the space',
  'overhead flat-lay composition',
  'candid in-action shot of hands at work, no faces',
  'eye-level hero shot of one product on a simple surface',
  'exterior or street-context shot in golden-hour light',
  'moody low-key lighting with a single strong light source',
  'bright, airy morning light with a minimal background',
];

const HISTORY_SIZE = 12;
const PROMPT_HISTORY = 6;

export interface RecentPost {
  caption: string;
  meta: GenerationMeta;
}

export interface GenerationPlan {
  pillar: string;
  format: string;
  visual: string;
  /** Newest first — shown to the model as "do not repeat" and checked by isTooSimilar. */
  recentCaptions: string[];
}

export async function loadRecentPosts(db: SupabaseClient, businessId: string): Promise<RecentPost[]> {
  const { data } = await db
    .from('content_queue')
    .select('generated_caption, generation_meta')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .limit(HISTORY_SIZE);
  return (data ?? []).map((r) => ({
    caption: (r.generated_caption as string) ?? '',
    meta: (r.generation_meta as GenerationMeta) ?? {},
  }));
}

export function planNext(
  business: Pick<BusinessProfile, 'content_pillars'>,
  recent: RecentPost[],
  rand: () => number = Math.random,
): GenerationPlan {
  const pillars = business.content_pillars.length ? business.content_pillars : DEFAULT_PILLARS;
  return {
    pillar: leastRecentlyUsed(pillars, recent.map((r) => r.meta.pillar), rand),
    format: leastRecentlyUsed(POST_FORMATS, recent.map((r) => r.meta.format), rand),
    visual: leastRecentlyUsed(VISUAL_DIRECTIONS, recent.map((r) => r.meta.visual), rand),
    recentCaptions: recent
      .map((r) => r.caption.trim())
      .filter(Boolean)
      .slice(0, PROMPT_HISTORY),
  };
}

/** Pick an option never used, else the one used longest ago; ties broken randomly. */
function leastRecentlyUsed(options: string[], usedNewestFirst: (string | undefined)[], rand: () => number): string {
  const lastUse = new Map<string, number>();
  usedNewestFirst.forEach((u, i) => {
    if (u && !lastUse.has(u)) lastUse.set(u, i);
  });
  const age = (o: string) => lastUse.get(o) ?? Number.POSITIVE_INFINITY;
  const best = Math.max(...options.map(age));
  const candidates = options.filter((o) => age(o) === best);
  return candidates[Math.floor(rand() * candidates.length)];
}

// ---- Similarity guard -----------------------------------------------------

function shingles(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/#\S+/g, ' ') // hashtags are expected to overlap
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const out = new Set<string>();
  for (let i = 0; i + 2 < words.length; i++) out.add(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const s of a) if (b.has(s)) inter++;
  return inter / (a.size + b.size - inter);
}

const firstLine = (t: string) => t.trim().split('\n')[0].trim().toLowerCase();

/** True when the caption reuses an opening line or most of its phrasing from a recent post. */
export function isTooSimilar(caption: string, recentCaptions: string[], threshold = 0.3): boolean {
  const mine = shingles(caption);
  const opener = firstLine(caption);
  return recentCaptions.some((c) => firstLine(c) === opener || jaccard(mine, shingles(c)) >= threshold);
}

/** Make sure the business's visual style reaches the image model even if the LLM dropped it. */
export function withImageStyle(prompt: string, imageStyle: string): string {
  const style = imageStyle.trim();
  if (!style || prompt.toLowerCase().includes(style.toLowerCase())) return prompt;
  return `${prompt.replace(/\s*\.?\s*$/, '.')} Brand visual style: ${style}`;
}
