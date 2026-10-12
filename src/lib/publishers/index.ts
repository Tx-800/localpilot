import 'server-only';
import { env } from '@/lib/env';
import type { BusinessCredentials, BusinessProfile, ContentItem, GoogleLocation } from '@/lib/types';
import { publishToInstagram } from './meta';
import { publishToGoogleBusiness } from './google';
import { composeGoogleText, composeInstagramCaption } from '@/lib/captions';
import { googleAccessTokenForBusiness, hasGoogleAccess } from '@/lib/google-oauth';

export interface PublishOutcome {
  anySuccess: boolean;
  externalIds: Record<string, string>;
  errors: string[];
}

/**
 * Fan out to every connected channel. Succeeds if at least one channel posted;
 * per-channel errors are returned so they can be shown on the card.
 */
export async function publishToChannels(
  business: BusinessProfile,
  creds: BusinessCredentials | null,
  item: ContentItem,
): Promise<PublishOutcome> {
  const instagramCaption = composeInstagramCaption(item.generated_caption, item.hashtags ?? []);
  const googleText = composeGoogleText(item.gbp_caption ?? '', item.generated_caption);
  const imageUrl = item.generated_image_url!;

  if (env.publishMode() === 'mock') {
    await new Promise((r) => setTimeout(r, 600)); // feel like a network call
    return {
      anySuccess: true,
      externalIds: { mock: `mock_${item.id.slice(0, 8)}_${Date.now()}` },
      errors: [],
    };
  }

  const jobs: { channel: string; run: () => Promise<string> }[] = [];

  if (business.instagram_page_id && creds?.instagram_access_token) {
    jobs.push({
      channel: 'instagram',
      run: () =>
        publishToInstagram({
          igUserId: business.instagram_page_id!,
          accessToken: creds.instagram_access_token!,
          imageUrl,
          caption: instagramCaption,
        }),
    });
  }

  // Every picked location (legacy single ID as fallback); one access token shared by all of them.
  const locations: GoogleLocation[] = business.google_locations?.length
    ? business.google_locations
    : business.google_gbp_location_id
      ? [{ name: business.google_gbp_location_id, title: 'Google Business' }]
      : [];
  if (locations.length && (await hasGoogleAccess(creds, business.agency_user_id))) {
    let token: Promise<string> | null = null;
    const accessToken = () => (token ??= googleAccessTokenForBusiness(creds, business.agency_user_id));
    for (const loc of locations) {
      jobs.push({
        channel: locations.length > 1 ? `google_business:${loc.title}` : 'google_business',
        run: () =>
          accessToken()
            .then((t) => publishToGoogleBusiness({ locationName: loc.name, accessToken: t, imageUrl, caption: googleText }))
            .catch((err: unknown) => {
              const msg = err instanceof Error ? err.message : String(err);
              throw new Error(locations.length > 1 ? `${msg} (${loc.title})` : msg);
            }),
      });
    }
  }

  if (jobs.length === 0) {
    return {
      anySuccess: false,
      externalIds: {},
      errors: ['No channels connected. Connect Google on My Profile and pick locations, or add Instagram details, in Client Settings.'],
    };
  }

  const results = await Promise.allSettled(jobs.map((j) => j.run()));
  const externalIds: Record<string, string> = {};
  const errors: string[] = [];

  results.forEach((r, i) => {
    if (r.status === 'fulfilled') externalIds[jobs[i].channel] = r.value;
    else errors.push(r.reason instanceof Error ? r.reason.message : String(r.reason));
  });

  return { anySuccess: Object.keys(externalIds).length > 0, externalIds, errors };
}
