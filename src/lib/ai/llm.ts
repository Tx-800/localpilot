import 'server-only';
import { env } from '@/lib/env';
import { AppError } from '@/lib/errors';
import { buildCopyUserPrompt, COPY_SYSTEM_PROMPT, pickAngle, type CopyBrief } from './prompts';

export interface GeneratedCopy {
  caption: string;
  imagePrompt: string;
}

export async function generateCopy(brief: CopyBrief): Promise<GeneratedCopy> {
  const angle = pickAngle();
  if (env.textProvider() === 'openai') return generateWithOpenAI(brief, angle);
  return generateMock(brief, angle);
}

async function generateWithOpenAI(brief: CopyBrief, angle: string): Promise<GeneratedCopy> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.openaiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: env.openaiTextModel(),
      temperature: 0.9,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: COPY_SYSTEM_PROMPT },
        { role: 'user', content: buildCopyUserPrompt(brief, angle) },
      ],
    }),
    signal: AbortSignal.timeout(45_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new AppError('PROVIDER_ERROR', `Text generation failed (${res.status}): ${body.slice(0, 200)}`);
  }

  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const raw = json.choices?.[0]?.message?.content ?? '';

  let parsed: { caption?: unknown; image_prompt?: unknown };
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new AppError('PROVIDER_ERROR', 'Text model returned invalid JSON');
  }

  const caption = typeof parsed.caption === 'string' ? parsed.caption.trim() : '';
  const imagePrompt = typeof parsed.image_prompt === 'string' ? parsed.image_prompt.trim() : '';
  if (!caption || !imagePrompt) throw new AppError('PROVIDER_ERROR', 'Text model returned an incomplete draft');

  return { caption: caption.slice(0, 2200), imagePrompt };
}

function generateMock(b: CopyBrief, angle: string): GeneratedCopy {
  const tag = (s: string) => '#' + s.replace(/[^a-z0-9]/gi, '');
  const kw = b.target_keywords.slice(0, 2);
  const caption = [
    `✨ ${b.business_name} — ${angle} ✨`,
    '',
    `Here in ${b.target_location}, we put everything into being your go-to ${b.niche.toLowerCase()}.` +
      (kw.length ? ` Looking for ${kw.join(' or ')}? You're in the right place.` : ''),
    `Swing by this week and see what we mean — we'd love to say hi. 👋`,
    '',
    [tag(b.business_name), tag(b.target_location), tag(b.niche), '#SupportLocal', '#ShopLocal']
      .filter((t) => t.length > 1)
      .join(' '),
  ].join('\n');

  const imagePrompt =
    `Photorealistic, natural-light photo for a ${b.niche} in ${b.target_location}: ${angle}. ` +
    `Mood: ${b.brand_voice_style}. Shallow depth of field, warm tones, no text, no logos.`;

  return { caption, imagePrompt };
}
