import type { Metadata } from 'next';
import { getCredentialStatus } from '@/actions/business';
import { BusinessSettingsForm } from '@/components/business-settings-form';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { QuotaMeter } from '@/components/quota-meter';
import { env } from '@/lib/env';
import { getActiveBusiness } from '@/lib/session';

export const metadata: Metadata = { title: 'Client Settings' };

const GOOGLE_NOTICES: Record<string, { ok: boolean; text: string }> = {
  connected: { ok: true, text: 'Google Business connected. Posts will now go to Google for this client (set the location below if you have not).' },
  cancelled: { ok: false, text: 'Google connection was cancelled.' },
  error: { ok: false, text: 'Could not connect Google. Make sure you signed in with the account that manages this business, then try again.' },
  not_configured: { ok: false, text: 'Google sign-in is not set up on the server yet (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).' },
};

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ created?: string; google?: string }> }) {
  const { created, google } = await searchParams;
  const googleNotice = google ? GOOGLE_NOTICES[google] : undefined;
  const business = await getActiveBusiness();

  if (!business) {
    return (
      <EmptyState
        title="No clients yet"
        body="Add a client business to configure its identity and quota."
        action={{ href: '/dashboard/businesses/new', label: 'Add client' }}
      />
    );
  }

  const credentialStatus = await getCredentialStatus(business.id);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader eyebrow="Client Settings" title={business.business_name} description={business.niche + ' · ' + business.target_location}>
        <QuotaMeter business={business} />
      </PageHeader>
      {created && (
        <p className="mb-6 rounded-2xl border border-emerald-200/70 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Client created and set as active. Head to the Approval Hub to generate the first draft.
        </p>
      )}
      {googleNotice && (
        <p
          className={`mb-6 rounded-2xl border px-4 py-3 text-sm ${
            googleNotice.ok ? 'border-emerald-200/70 bg-emerald-50 text-emerald-800' : 'border-amber-200/70 bg-amber-50 text-amber-900'
          }`}
        >
          {googleNotice.text}
        </p>
      )}
      {/* key forces a fresh form when the admin switches clients */}
      <BusinessSettingsForm
        key={business.id}
        business={business}
        credentialStatus={credentialStatus}
        googleOAuthEnabled={env.googleOAuthEnabled()}
      />
    </div>
  );
}
