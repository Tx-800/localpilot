import type { Metadata } from 'next';
import { PageHeader } from '@/components/page-header';
import { ProfileForm } from '@/components/profile-form';
import { requireUser } from '@/lib/session';

export const metadata: Metadata = { title: 'My Profile' };

export default async function ProfilePage() {
  const { supabase, user } = await requireUser();
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, agency_name')
    .eq('id', user.id)
    .maybeSingle();

  const missingAgency = !profile?.agency_name;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader eyebrow="My Profile" title={profile?.full_name || 'Your account'} description={user.email} />
      {missingAgency && (
        <p className="mb-6 rounded-2xl border border-amber-200/70 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Please add your agency or business name to complete your profile.
        </p>
      )}
      <ProfileForm
        email={user.email ?? ''}
        fullName={profile?.full_name ?? ''}
        agencyName={profile?.agency_name ?? ''}
      />
    </div>
  );
}
