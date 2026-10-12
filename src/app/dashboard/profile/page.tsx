import type { Metadata } from 'next';
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
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <p className="text-xs font-semibold tracking-wide text-brand-700 uppercase">My Profile</p>
        <h1 className="font-display text-2xl font-semibold sm:text-3xl">{profile?.full_name || 'Your account'}</h1>
      </div>
      {missingAgency && (
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
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
