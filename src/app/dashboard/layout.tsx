import { AppShell } from '@/components/app-shell';
import { getActiveBusiness, listBusinesses, requireUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireUser();
  const [businesses, active] = await Promise.all([listBusinesses(), getActiveBusiness()]);

  return (
    <AppShell
      businesses={businesses.map(({ id, business_name, niche }) => ({ id, business_name, niche }))}
      activeId={active?.id ?? null}
      userEmail={user.email ?? ''}
    >
      {children}
    </AppShell>
  );
}
