import 'server-only';
import { AppError } from '@/lib/errors';

/**
 * Turn a failed OpenAI response into an AppError whose message says what to fix,
 * followed by OpenAI's own error.message.
 */
export async function openaiError(res: Response, kind: 'text' | 'image', model: string): Promise<AppError> {
  const raw = await res.text().catch(() => '');
  let apiMessage = '';
  let apiCode = '';
  try {
    const json = JSON.parse(raw) as { error?: { message?: string; code?: string | null } };
    apiMessage = json.error?.message ?? '';
    apiCode = json.error?.code ?? '';
  } catch {
    apiMessage = raw.slice(0, 200);
  }

  const modelVar = kind === 'text' ? 'OPENAI_TEXT_MODEL' : 'OPENAI_IMAGE_MODEL';
  const lower = apiMessage.toLowerCase();
  let hint: string;

  if (res.status === 401) {
    hint = 'OpenAI rejected the API key — check OPENAI_API_KEY.';
  } else if (res.status === 404 || apiCode === 'model_not_found') {
    hint = `OpenAI model "${model}" was not found or is not available to this key — check ${modelVar}.`;
  } else if (res.status === 429) {
    hint =
      apiCode === 'insufficient_quota'
        ? 'OpenAI account is out of credit — add billing credit at platform.openai.com → Settings → Billing.'
        : 'OpenAI rate limit hit or no credit left — wait a minute, or check billing at platform.openai.com.';
  } else if (res.status === 403 && lower.includes('verif')) {
    hint = 'This model requires a verified organization — verify your organization at platform.openai.com → Settings → Organization.';
  } else {
    hint = `OpenAI ${kind === 'text' ? 'text' : 'image'} generation failed (HTTP ${res.status}).`;
  }

  return new AppError('PROVIDER_ERROR', apiMessage ? `${hint} OpenAI said: ${apiMessage}` : hint);
}
