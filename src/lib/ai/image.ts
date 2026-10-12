import 'server-only';
import { env } from '@/lib/env';
import { AppError } from '@/lib/errors';
import { persistImage, type ImageSource } from '@/lib/storage';
import { openaiError } from './openai-errors';

/**
 * Generate an image for `prompt` and return a stable, public URL.
 * Provider URLs expire, so real outputs are copied into Supabase Storage.
 */
export async function generateImageUrl(prompt: string, businessId: string): Promise<string> {
  switch (env.imageProvider()) {
    case 'openai':
      return persistImage(await generateWithOpenAI(prompt), businessId);
    case 'flux':
      return persistImage(await generateWithFlux(prompt), businessId);
    default:
      return mockImageUrl(prompt);
  }
}

async function generateWithOpenAI(prompt: string): Promise<ImageSource> {
  const model = env.openaiImageModel();
  // GPT image models can return compressed JPEG: ~10x smaller than PNG, and
  // Instagram's publishing API only accepts JPEG.
  const jpeg = model.startsWith('gpt-image');
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.openaiKey()}`, 'Content-Type': 'application/json' },
    // Explicit quality: omitted, the API uses "auto", which can bill at high quality.
    body: JSON.stringify({
      model,
      prompt,
      size: '1024x1024',
      quality: env.openaiImageQuality(),
      n: 1,
      ...(jpeg && { output_format: 'jpeg', output_compression: 85 }),
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) throw await openaiError(res, 'image', model);
  const json = (await res.json()) as { data?: { b64_json?: string; url?: string }[] };
  const first = json.data?.[0];
  if (first?.b64_json) return { kind: 'base64', data: first.b64_json, contentType: jpeg ? 'image/jpeg' : 'image/png' };
  if (first?.url) return { kind: 'url', url: first.url };
  throw new AppError('PROVIDER_ERROR', 'Image provider returned no image');
}

async function generateWithFlux(prompt: string): Promise<ImageSource> {
  // Replicate "sync" mode: Prefer: wait holds the request open until the prediction finishes.
  const res = await fetch(`https://api.replicate.com/v1/models/${env.fluxModel()}/predictions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.replicateToken()}`,
      'Content-Type': 'application/json',
      Prefer: 'wait',
    },
    body: JSON.stringify({ input: { prompt, aspect_ratio: '1:1', output_format: 'jpg' } }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new AppError('PROVIDER_ERROR', `Flux generation failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as { status?: string; output?: string | string[]; error?: string };
  const url = Array.isArray(json.output) ? json.output[0] : json.output;
  if (!url) throw new AppError('PROVIDER_ERROR', json.error ?? `Flux prediction not ready (status: ${json.status})`);
  return { kind: 'url', url };
}

function mockImageUrl(prompt: string): string {
  // Deterministic-per-prompt placeholder; picsum serves stable images per seed.
  let hash = 0;
  for (let i = 0; i < prompt.length; i++) hash = (hash * 31 + prompt.charCodeAt(i)) | 0;
  const seed = `${Math.abs(hash)}-${Date.now() % 100000}`;
  return `https://picsum.photos/seed/${seed}/1024/1024`;
}
