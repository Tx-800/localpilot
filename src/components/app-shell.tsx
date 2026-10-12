'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { BusinessSwitcher } from './business-switcher';
import { CheckCircleIcon, InboxIcon, LogoMark, LogoutIcon, MenuIcon, PlusIcon, SettingsIcon, UserIcon, XIcon } from './icons';
import { signOut } from '@/actions/auth';
import type { BusinessProfile } from '@/lib/types';

const NAV = [
  { href: '/dashboard', label: 'Approval Hub', Icon: InboxIcon },
  { href: '/dashboard/published', label: 'Published', Icon: CheckCircleIcon },
  { href: '/dashboard/settings', label: 'Client Settings', Icon: SettingsIcon },
  { href: '/dashboard/businesses/new', label: 'Add Client', Icon: PlusIcon },
  { href: '/dashboard/profile', label: 'My Profile', Icon: UserIcon },
];

type ShellBusiness = Pick<BusinessProfile, 'id' | 'business_name' | 'niche'>;
type ShellUser = { email: string; name: string | null; agency: string | null };

/**
 * Layout strategy
 *  - ≥ lg (1024px): fixed 17rem sidebar (full height) + scrolling main column
 *  - <  lg       : sticky top bar with logo + client switcher + slide-over drawer for nav
 */
export function AppShell({
  businesses,
  activeId,
  user,
  children,
}: {
  businesses: ShellBusiness[];
  activeId: string | null;
  user: ShellUser;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [pathname]); // close drawer on navigation

  const displayName = user.name || user.email.split('@')[0];
  const initials = displayName
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const sidebar = (
    <div className="flex h-full flex-col gap-7 px-4 py-6">
      <Link href="/dashboard" className="flex items-center gap-2.5 px-2">
        <LogoMark />
        <span className="font-display text-xl font-semibold tracking-tight">LocalPilot</span>
      </Link>

      <BusinessSwitcher businesses={businesses} activeId={activeId} />

      <nav className="flex flex-col gap-0.5" aria-label="Main">
        <p className="mb-1.5 px-3 text-[11px] font-semibold tracking-wider text-ink-400 uppercase">Workspace</p>
        {NAV.map(({ href, label, Icon }) => {
          const active = href === '/dashboard' ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                active ? 'bg-brand-50 text-brand-700' : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900'
              }`}
            >
              <Icon className={`size-[18px] ${active ? 'text-brand-600' : 'text-ink-400 group-hover:text-ink-600'}`} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto rounded-2xl border border-ink-200/80 bg-ink-50 p-3">
        <div className="flex items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-ink-800 text-xs font-semibold text-white">
            {initials}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink-900">{displayName}</p>
            <p className="truncate text-xs text-ink-500" title={user.email}>
              {user.agency || user.email}
            </p>
          </div>
          <form action={signOut}>
            <button className="btn-ghost size-9 p-0" aria-label="Sign out" title="Sign out">
              <LogoutIcon className="size-[18px]" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh lg:pl-68">
      {/* Desktop sidebar: fixed so it always spans the full viewport height */}
      <aside className="fixed inset-y-0 left-0 hidden w-68 border-r border-ink-200/80 bg-white lg:block">{sidebar}</aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-ink-200/80 bg-white/90 px-4 py-2.5 backdrop-blur lg:hidden">
        <button onClick={() => setOpen(true)} aria-label="Open menu" className="btn-ghost -ml-2 size-10 shrink-0 p-0">
          <MenuIcon />
        </button>
        <LogoMark className="size-8 shrink-0" />
        <BusinessSwitcher businesses={businesses} activeId={activeId} compact />
      </header>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <button className="absolute inset-0 bg-ink-900/40 backdrop-blur-[2px]" aria-label="Close menu" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[84%] max-w-xs bg-white shadow-lift">
            <button onClick={() => setOpen(false)} aria-label="Close menu" className="btn-ghost absolute top-5 right-3 size-9 p-0">
              <XIcon className="size-[18px]" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      <main className="mx-auto min-w-0 max-w-[1400px] px-4 py-6 sm:px-6 lg:px-10 lg:py-10">{children}</main>
    </div>
  );
}
