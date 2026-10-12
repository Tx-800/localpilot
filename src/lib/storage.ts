import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { AppError } from '@/lib/errors';

export const IMAGE_BUCKET = 'content-images';

export type ImageSource =
  | { kind: 'base64'; data: string; contentType: string }
  | { kind: 'url'; url: string };

const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

/** Copy a provider image into the public bucket and return its permanent URL. */
export async function persistImage(src: ImageSource, businessId: string): Promise<string> {
  let bytes: Uint8Array;
  let contentType: string;

  if (src.kind === 'base64') {
    bytes = Uint8Array.from(Buffer.from(src.data, 'base64'));
    contentType = src.contentType;
  } else {
    const res = await fetch(src.url, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new AppError('PROVIDER_ERROR', `Could not download generated image (${res.status})`);
    contentType = res.headers.get('content-type')?.split(';')[0] ?? 'image/jpeg';
    bytes = new Uint8Array(await res.arrayBuffer());
  }

  if (!EXT[contentType]) contentType = 'image/jpeg';
  const path = `${businessId}/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${EXT[contentType]}`;

  const admin = createAdminClient();
  const { error } = await admin.storage.from(IMAGE_BUCKET).upload(path, bytes, {
    contentType,
    cacheControl: '31536000',
    upsert: false,
  });
  if (error) throw new AppError('INTERNAL', `Image upload failed: ${error.message}`);

  return admin.storage.from(IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;
}
