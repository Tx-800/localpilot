import { AppShell } from '@/components/app-shell';
import { getActiveBusiness, getProfile, listBusinesses, requireUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireUser();
  const [businesses, active, profile] = await Promise.all([listBusinesses(), getActiveBusiness(), getProfile()]);

  return (
    <AppShell
      businesses={businesses.map(({ id, business_name, niche }) => ({ id, business_name, niche }))}
      activeId={active?.id ?? null}
      user={{ email: user.email ?? '', name: profile.full_name, agency: profile.agency_name }}
    >
      {children}
    </AppShell>
  );
}
