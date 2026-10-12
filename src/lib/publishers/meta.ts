import 'server-only';
import { env } from '@/lib/env';

/**
 * Instagram Graph API (Business/Creator account linked to a Facebook Page).
 * Two-step flow: create a media container, then publish it.
 * `igUserId` is the Instagram professional account ID (stored as instagram_page_id).
 */
export async function publishToInstagram(params: {
  igUserId: string;
  accessToken: string;
  imageUrl: string;
  caption: string;
}): Promise<string> {
  const base = `https://graph.facebook.com/${env.metaGraphVersion()}/${params.igUserId}`;

  const container = await graphPost(`${base}/media`, {
    image_url: params.imageUrl,
    caption: params.caption,
    access_token: params.accessToken,
  });

  const published = await graphPost(`${base}/media_publish`, {
    creation_id: container.id,
    access_token: params.accessToken,
  });

  return published.id;
}

async function graphPost(url: string, body: Record<string, string>): Promise<{ id: string }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
    signal: AbortSignal.timeout(60_000),
  });
  const json = (await res.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
  if (!res.ok || !json.id) {
    throw new Error(`Instagram: ${json.error?.message ?? `HTTP ${res.status}`}`);
  }
  return { id: json.id };
}
