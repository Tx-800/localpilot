import 'server-only';

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable: ${name}`);
  return v;
}

const IMAGE_QUALITIES = ['low', 'medium', 'high'] as const;
type ImageQuality = (typeof IMAGE_QUALITIES)[number];
const REASONING_EFFORTS = ['minimal', 'low', 'medium', 'high'] as const;
type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

export const env = {
  supabaseUrl: () => required('NEXT_PUBLIC_SUPABASE_URL'),
  supabaseAnonKey: () => required('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  serviceRoleKey: () => required('SUPABASE_SERVICE_ROLE_KEY'),
  cronSecret: () => process.env.CRON_SECRET ?? '',

  textProvider: () => (process.env.AI_TEXT_PROVIDER ?? 'mock') as 'mock' | 'openai',
  imageProvider: () => (process.env.AI_IMAGE_PROVIDER ?? 'mock') as 'mock' | 'openai' | 'flux',
  openaiKey: () => required('OPENAI_API_KEY'),
  openaiTextModel: () => process.env.OPENAI_TEXT_MODEL || 'gpt-5-mini',
  openaiImageModel: () => process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1-mini',
  openaiImageQuality: (): ImageQuality => {
    const q = process.env.OPENAI_IMAGE_QUALITY?.trim().toLowerCase();
    return IMAGE_QUALITIES.includes(q as ImageQuality) ? (q as ImageQuality) : 'medium';
  },
  /** Caption reasoning depth; hidden reasoning tokens bill as output, and captions need little. */
  openaiReasoningEffort: (): ReasoningEffort => {
    const e = process.env.OPENAI_REASONING_EFFORT?.trim().toLowerCase();
    return REASONING_EFFORTS.includes(e as ReasoningEffort) ? (e as ReasoningEffort) : 'low';
  },
  /** Optional: only sent when set, since GPT-5-family models reject a custom temperature. */
  openaiTextTemperature: (): number | undefined => {
    const raw = process.env.OPENAI_TEXT_TEMPERATURE?.trim();
    if (!raw) return undefined;
    const t = Number(raw);
    return Number.isFinite(t) && t >= 0 && t <= 2 ? t : undefined;
  },
  replicateToken: () => required('REPLICATE_API_TOKEN'),
  fluxModel: () => process.env.FLUX_MODEL ?? 'black-forest-labs/flux-schnell',

  /** Set ALLOW_SIGNUP=false to hide and refuse self sign-up (pair with Supabase's "Allow new users to sign up" off). */
  allowSignup: () => process.env.ALLOW_SIGNUP?.trim().toLowerCase() !== 'false',

  publishMode: () => (process.env.PUBLISH_MODE ?? 'mock') as 'mock' | 'live',
  metaGraphVersion: () => process.env.META_GRAPH_VERSION ?? 'v21.0',
};
