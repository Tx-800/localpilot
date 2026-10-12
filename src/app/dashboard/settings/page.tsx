import type { Metadata } from 'next';
import { getCredentialStatus } from '@/actions/business';
import { BusinessSettingsForm } from '@/components/business-settings-form';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { QuotaMeter } from '@/components/quota-meter';
import { getActiveBusiness } from '@/lib/session';

export const metadata: Metadata = { title: 'Client Settings' };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ created?: string }> }) {
  const { created } = await searchParams;
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
      {/* key forces a fresh form when the admin switches clients */}
      <BusinessSettingsForm key={business.id} business={business} credentialStatus={credentialStatus} />
    </div>
  );
}
