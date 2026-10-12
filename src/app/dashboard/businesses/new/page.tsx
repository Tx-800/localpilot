import type { Metadata } from 'next';
import { getAgencyGoogleStatus } from '@/actions/business';
import { BusinessSettingsForm } from '@/components/business-settings-form';
import { PageHeader } from '@/components/page-header';
import { env } from '@/lib/env';

export const metadata: Metadata = { title: 'Add client' };

export default async function NewBusinessPage() {
  const agencyGoogle = await getAgencyGoogleStatus();
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow="New client"
        title="Add a business"
        description="Tell LocalPilot about the business. You can connect Instagram and Google Business now or later."
      />
      <BusinessSettingsForm
        googleOAuthEnabled={env.googleOAuthEnabled()}
        credentialStatus={{ instagram: false, google: false, googleConnected: false, agencyGoogle }}
      />
    </div>
  );
}
