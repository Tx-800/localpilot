import type { Metadata } from 'next';
import { getAgencyGoogleStatus } from '@/actions/business';
import { PageHeader } from '@/components/page-header';
import { env } from '@/lib/env';
import { ProfileForm } from '@/components/profile-form';
import { requireUser } from '@/lib/session';

export const metadata: Metadata = { title: 'My Profile' };

const GOOGLE_NOTICES: Record<string, { ok: boolean; text: string }> = {
  connected: { ok: true, text: 'Google connected. Open each client’s settings and pick its locations.' },
  cancelled: { ok: false, text: 'Google connection was cancelled.' },
  error: { ok: false, text: 'Could not connect Google. Try again and approve all requested access.' },
  not_configured: { ok: false, text: 'Google sign-in is not set up on the server yet (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).' },
};

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ google?: string }> }) {
  const { google } = await searchParams;
  const googleNotice = google ? GOOGLE_NOTICES[google] : undefined;
  const { supabase, user } = await requireUser();
  const agencyGoogle = await getAgencyGoogleStatus();
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
      {googleNotice && (
        <p
          className={`mb-6 rounded-2xl border px-4 py-3 text-sm ${
            googleNotice.ok ? 'border-emerald-200/70 bg-emerald-50 text-emerald-800' : 'border-amber-200/70 bg-amber-50 text-amber-900'
          }`}
        >
          {googleNotice.text}
        </p>
      )}
      <ProfileForm
        google={{ enabled: env.googleOAuthEnabled(), ...agencyGoogle }}
        email={user.email ?? ''}
        fullName={profile?.full_name ?? ''}
        agencyName={profile?.agency_name ?? ''}
      />
    </div>
  );
}
