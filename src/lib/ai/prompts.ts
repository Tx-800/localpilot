import type { BusinessProfile } from '@/lib/types';
import type { GenerationPlan } from './strategy';

export type CopyBrief = Pick<
  BusinessProfile,
  | 'business_name'
  | 'niche'
  | 'target_location'
  | 'brand_voice_style'
  | 'target_keywords'
  | 'caption_instructions'
  | 'image_style'
>;

export const COPY_SYSTEM_PROMPT = `You are a senior social media copywriter for small local businesses.
You write scroll-stopping Instagram and Google Business Profile posts that feel human, local and specific.
Rules:
- Never invent prices, discounts, opening hours, awards or claims the business did not provide.
- Mention the location naturally once; weave in at most two of the target keywords.
- "caption" is the Instagram post body: 80-180 words, NO hashtags in it, ending with a soft call to action
  (visit, book, DM, call).
- "hashtags" is a separate list of 5-8 relevant hashtags (mix of local + niche), each starting with #.
- "gbp_caption" is a Google Business Profile post on the same topic: 50-120 words, plain and informative,
  no hashtags, no emojis, a clear call to action, under 1500 characters.
- Follow the business's custom instructions when given; they override these style rules,
  but never the rule against inventing facts.
- Every post must be clearly different from the recent posts you are shown: a new opening line,
  a different hook, different examples and a differently worded call to action.
- The image prompt must describe ONE photorealistic scene with no text, logos, or recognisable people's faces,
  using the requested composition and the brand visual style.
Respond ONLY with JSON: {"caption": string, "hashtags": string[], "gbp_caption": string, "image_prompt": string}`;

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

export function buildCopyUserPrompt(
  b: CopyBrief,
  plan: GenerationPlan,
  opts: { retry?: boolean; now?: Date } = {},
): string {
  const now = opts.now ?? new Date();
  const month = now.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });

  const lines = [
    `Business name: ${b.business_name}`,
    `Niche: ${b.niche}`,
    `Location: ${b.target_location}`,
    `Brand voice: ${b.brand_voice_style}`,
    `Target local keywords: ${b.target_keywords.length ? b.target_keywords.join(', ') : '(none provided)'}`,
    `Current month: ${month}`,
    '',
    `Topic for this post (content pillar): ${plan.pillar}`,
    `Post format: ${plan.format}`,
    `Photo composition: ${plan.visual}`,
  ];

  if (b.caption_instructions.trim()) {
    lines.push('', 'Custom caption instructions from the business:', b.caption_instructions.trim());
  }
  if (b.image_style.trim()) {
    lines.push('', 'Brand visual style for the image prompt:', b.image_style.trim());
  }
  if (plan.recentCaptions.length) {
    lines.push('', 'Recent posts for this business — do NOT reuse their openings, hooks, phrasing or call to action:');
    plan.recentCaptions.forEach((c, i) => lines.push(`--- recent post ${i + 1} ---`, clip(c, 320)));
  }
  if (opts.retry) {
    lines.push('', 'Your previous attempt was too similar to a recent post. Take a noticeably different approach.');
  }

  lines.push('', 'Write one post.');
  return lines.join('\n');
}
