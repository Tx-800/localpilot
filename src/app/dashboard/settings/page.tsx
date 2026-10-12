import type { Metadata } from 'next';
import { getCredentialStatus } from '@/actions/business';
import { BusinessSettingsForm } from '@/components/business-settings-form';
import { EmptyState } from '@/components/empty-state';
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
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-wide text-brand-700 uppercase">Client Settings</p>
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">{business.business_name}</h1>
        </div>
        <QuotaMeter business={business} />
      </div>
      {created && (
        <p className="mb-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
          Client created and set as active. Head to the Approval Hub to generate the first draft.
        </p>
      )}
      {/* key forces a fresh form when the admin switches clients */}
      <BusinessSettingsForm key={business.id} business={business} credentialStatus={credentialStatus} />
    </div>
  );
}
