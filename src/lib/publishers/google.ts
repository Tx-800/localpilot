import 'server-only';

/**
 * Google Business Profile "local post".
 * `locationName` is the full resource name: accounts/{accountId}/locations/{locationId}
 * (stored as google_gbp_location_id). `accessToken` is an OAuth access token with the
 * business.manage scope — in production, store a refresh token and exchange it here.
 */
export async function publishToGoogleBusiness(params: {
  locationName: string;
  accessToken: string;
  imageUrl: string;
  caption: string;
}): Promise<string> {
  const res = await fetch(`https://mybusiness.googleapis.com/v4/${params.locationName}/localPosts`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      languageCode: 'en',
      topicType: 'STANDARD',
      summary: params.caption.slice(0, 1500), // GBP summary limit
      media: [{ mediaFormat: 'PHOTO', sourceUrl: params.imageUrl }],
    }),
    signal: AbortSignal.timeout(60_000),
  });

  const json = (await res.json().catch(() => ({}))) as { name?: string; error?: { message?: string } };
  if (!res.ok || !json.name) {
    throw new Error(`Google Business: ${json.error?.message ?? `HTTP ${res.status}`}`);
  }
  return json.name;
}
