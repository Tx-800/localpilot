import 'server-only';
import { env } from '@/lib/env';
import { AppError } from '@/lib/errors';
import { openaiError } from './openai-errors';
import { buildCopyUserPrompt, COPY_SYSTEM_PROMPT, type CopyBrief } from './prompts';
import type { GenerationPlan } from './strategy';
import { GBP_MAX, INSTAGRAM_MAX, normalizeHashtags, splitTrailingHashtags } from '@/lib/captions';

export interface GeneratedCopy {
  /** Instagram body, without hashtags. */
  caption: string;
  hashtags: string[];
  /** Google Business Profile text (no hashtags). */
  gbpCaption: string;
  imagePrompt: string;
}

export async function generateCopy(
  brief: CopyBrief,
  plan: GenerationPlan,
  opts: { retry?: boolean } = {},
): Promise<GeneratedCopy> {
  if (env.textProvider() === 'openai') return generateWithOpenAI(brief, plan, opts);
  return generateMock(brief, plan);
}

async function generateWithOpenAI(brief: CopyBrief, plan: GenerationPlan, opts: { retry?: boolean }): Promise<GeneratedCopy> {
  const model = env.openaiTextModel();
  const temperature = env.openaiTextTemperature();
  const effort = env.openaiReasoningEffort();

  const request = (withEffort: boolean) =>
    fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.openaiKey()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        // GPT-5-family models reject a custom temperature, so it is opt-in.
        ...(temperature !== undefined && { temperature }),
        ...(withEffort && { reasoning_effort: effort }),
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: COPY_SYSTEM_PROMPT },
          { role: 'user', content: buildCopyUserPrompt(brief, plan, opts) },
        ],
      }),
      signal: AbortSignal.timeout(60_000), // reasoning models think before answering
    });

  let res = await request(true);
  if (res.status === 400 && (await rejectsReasoningEffort(res.clone()))) {
    console.warn(`[openai] ${model} rejected reasoning_effort="${effort}"; retrying without it`);
    res = await request(false);
  }

  if (!res.ok) throw await openaiError(res, 'text', model);

  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const raw = json.choices?.[0]?.message?.content ?? '';

  let parsed: { caption?: unknown; hashtags?: unknown; gbp_caption?: unknown; image_prompt?: unknown };
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new AppError('PROVIDER_ERROR', 'Text model returned invalid JSON');
  }

  const rawCaption = typeof parsed.caption === 'string' ? parsed.caption.trim() : '';
  const imagePrompt = typeof parsed.image_prompt === 'string' ? parsed.image_prompt.trim() : '';
  if (!rawCaption || !imagePrompt) throw new AppError('PROVIDER_ERROR', 'Text model returned an incomplete draft');

  // Models occasionally still append hashtags to the caption; move them to the list.
  const { body, hashtags: inline } = splitTrailingHashtags(rawCaption);
  const listed = Array.isArray(parsed.hashtags) ? parsed.hashtags.filter((t): t is string => typeof t === 'string') : [];
  const hashtags = normalizeHashtags([...listed, ...inline]);
  const gbpCaption = typeof parsed.gbp_caption === 'string' ? parsed.gbp_caption.trim() : '';

  return {
    caption: body.slice(0, INSTAGRAM_MAX),
    hashtags,
    gbpCaption: gbpCaption.slice(0, GBP_MAX),
    imagePrompt,
  };
}

/** True when a 400 is about reasoning_effort itself (unsupported parameter, or e.g. "minimal" not allowed). */
async function rejectsReasoningEffort(res: Response): Promise<boolean> {
  try {
    const { error } = (await res.json()) as { error?: { param?: string | null; message?: string } };
    return error?.param === 'reasoning_effort' || !!error?.message?.includes('reasoning_effort');
  } catch {
    return false;
  }
}

// Practice-mode copy: no AI, but still follows the plan so drafts visibly rotate.
const MOCK_OPENERS = [
  (b: CopyBrief, p: GenerationPlan) => `✨ ${b.business_name}: ${p.pillar} ✨`,
  (b: CopyBrief, p: GenerationPlan) => `Ever wondered about ${p.pillar} at ${b.business_name}?`,
  (b: CopyBrief, p: GenerationPlan) => `This week at ${b.business_name} — ${p.pillar}.`,
  (b: CopyBrief, p: GenerationPlan) => `${b.target_location}, let's talk about ${p.pillar}.`,
  (b: CopyBrief, p: GenerationPlan) => `A little peek into ${p.pillar} 👀`,
];
const MOCK_CTAS = [
  `Swing by this week and see what we mean — we'd love to say hi. 👋`,
  'Drop us a DM with your questions — we reply to every one.',
  'Tag a friend who needs to see this, then come visit together.',
  'Save this post and pop in when you are nearby.',
  'Tell us in the comments — what would you pick?',
];

function generateMock(b: CopyBrief, plan: GenerationPlan): GeneratedCopy {
  const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];
  const tag = (s: string) => '#' + s.replace(/[^\p{L}\p{N}]/gu, '');
  const kw = b.target_keywords.slice(0, 2);
  const caption = [
    pick(MOCK_OPENERS)(b, plan),
    '',
    `Here in ${b.target_location}, we put everything into being your go-to ${b.niche.toLowerCase()}.` +
      (kw.length ? ` Looking for ${kw.join(' or ')}? You're in the right place.` : ''),
    pick(MOCK_CTAS),
  ].join('\n');

  const hashtags = normalizeHashtags([tag(b.business_name), tag(b.target_location), tag(b.niche), '#SupportLocal', '#ShopLocal']);

  const gbpCaption =
    `${b.business_name} in ${b.target_location}: ${plan.pillar}. ` +
    `We're your local ${b.niche.toLowerCase()}` +
    (kw.length ? `, and a favourite for anyone searching "${kw[0]}"` : '') +
    `. Visit us this week or message us to learn more.`;

  const imagePrompt =
    `Photorealistic photo for a ${b.niche} in ${b.target_location} about ${plan.pillar}: ${plan.visual}. ` +
    `Mood: ${b.brand_voice_style}. No text, no logos.`;

  return { caption, hashtags, gbpCaption, imagePrompt };
}
