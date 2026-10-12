import type { BusinessProfile } from '@/lib/types';

export type CopyBrief = Pick<
  BusinessProfile,
  'business_name' | 'niche' | 'target_location' | 'brand_voice_style' | 'target_keywords'
>;

export const COPY_SYSTEM_PROMPT = `You are a senior social media copywriter for small local businesses.
You write scroll-stopping Instagram / Google Business Profile posts that feel human, local and specific.
Rules:
- Never invent prices, discounts, opening hours, awards or claims the business did not provide.
- Mention the location naturally once; weave in at most two of the target keywords.
- 80-180 words for the caption, then a blank line, then 5-8 relevant hashtags (mix of local + niche).
- End the body with a soft call to action (visit, book, DM, call).
- The image prompt must describe ONE photorealistic scene with no text, logos, or recognisable people's faces.
Respond ONLY with JSON: {"caption": string, "image_prompt": string}`;

const ANGLES = [
  'a behind-the-scenes moment',
  'a customer favourite',
  'a seasonal hook relevant to this month',
  'a quick tip related to the niche',
  'the people/craft behind the business',
  'a neighbourhood / community angle',
];

export function pickAngle(seed = Date.now()): string {
  return ANGLES[seed % ANGLES.length];
}

export function buildCopyUserPrompt(b: CopyBrief, angle: string, now = new Date()): string {
  const month = now.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
  return [
    `Business name: ${b.business_name}`,
    `Niche: ${b.niche}`,
    `Location: ${b.target_location}`,
    `Brand voice: ${b.brand_voice_style}`,
    `Target local keywords: ${b.target_keywords.length ? b.target_keywords.join(', ') : '(none provided)'}`,
    `Current month: ${month}`,
    `Post angle: ${angle}`,
    '',
    'Write one post.',
  ].join('\n');
}
