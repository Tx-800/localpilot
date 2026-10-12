import type { Metadata } from 'next';
import { BusinessSettingsForm } from '@/components/business-settings-form';

export const metadata: Metadata = { title: 'Add client' };

export default function NewBusinessPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <p className="text-xs font-semibold tracking-wide text-brand-700 uppercase">New client</p>
        <h1 className="font-display text-2xl font-semibold sm:text-3xl">Add a business</h1>
        <p className="mt-1 text-sm text-ink-500">You can connect Instagram and Google Business now or later.</p>
      </div>
      <BusinessSettingsForm />
    </div>
  );
}
