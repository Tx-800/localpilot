import 'server-only';

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable: ${name}`);
  return v;
}

export const env = {
  supabaseUrl: () => required('NEXT_PUBLIC_SUPABASE_URL'),
  supabaseAnonKey: () => required('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  serviceRoleKey: () => required('SUPABASE_SERVICE_ROLE_KEY'),
  cronSecret: () => process.env.CRON_SECRET ?? '',

  textProvider: () => (process.env.AI_TEXT_PROVIDER ?? 'mock') as 'mock' | 'openai',
  imageProvider: () => (process.env.AI_IMAGE_PROVIDER ?? 'mock') as 'mock' | 'openai' | 'flux',
  openaiKey: () => required('OPENAI_API_KEY'),
  openaiTextModel: () => process.env.OPENAI_TEXT_MODEL ?? 'gpt-4o-mini',
  openaiImageModel: () => process.env.OPENAI_IMAGE_MODEL ?? 'gpt-image-1',
  replicateToken: () => required('REPLICATE_API_TOKEN'),
  fluxModel: () => process.env.FLUX_MODEL ?? 'black-forest-labs/flux-schnell',

  publishMode: () => (process.env.PUBLISH_MODE ?? 'mock') as 'mock' | 'live',
  metaGraphVersion: () => process.env.META_GRAPH_VERSION ?? 'v21.0',
};
