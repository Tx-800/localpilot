'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { BusinessSwitcher } from './business-switcher';
import { signOut } from '@/actions/auth';
import type { BusinessProfile } from '@/lib/types';

const NAV = [
  { href: '/dashboard', label: 'Approval Hub', icon: '◎' },
  { href: '/dashboard/published', label: 'Published', icon: '✓' },
  { href: '/dashboard/settings', label: 'Client Settings', icon: '⚙' },
  { href: '/dashboard/businesses/new', label: 'Add Client', icon: '+' },
  { href: '/dashboard/profile', label: 'My Profile', icon: '☺' },
];

type ShellBusiness = Pick<BusinessProfile, 'id' | 'business_name' | 'niche'>;

/**
 * Layout strategy
 *  - ≥ lg (1024px): fixed 18rem sidebar + scrolling main column
 *  - <  lg       : sticky top bar with the client switcher inline + slide-over drawer for nav
 */
export function AppShell({
  businesses,
  activeId,
  userEmail,
  children,
}: {
  businesses: ShellBusiness[];
  activeId: string | null;
  userEmail: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [pathname]); // close drawer on navigation

  const sidebar = (
    <div className="flex h-full flex-col gap-6 p-5">
      <Link href="/dashboard" className="flex items-center gap-2.5">
        <span className="grid size-9 place-items-center rounded-xl bg-brand-600 text-white">✦</span>
        <span className="font-display text-xl font-semibold">LocalPilot</span>
      </Link>

      <BusinessSwitcher businesses={businesses} activeId={activeId} />

      <nav className="flex flex-col gap-1">
        {NAV.map((item) => {
          const active = item.href === '/dashboard' ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                active ? 'bg-brand-50 text-brand-700' : 'text-ink-700 hover:bg-ink-100'
              }`}
            >
              <span className="w-4 text-center opacity-70">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-ink-100 pt-4">
        <p className="truncate text-xs text-ink-500" title={userEmail}>
          {userEmail}
        </p>
        <form action={signOut}>
          <button className="btn-ghost -ml-3 mt-1 text-xs">Sign out</button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[18rem_1fr]">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh border-r border-ink-200 bg-white lg:block">{sidebar}</aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-ink-200 bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
        <button
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="btn-ghost -ml-2 size-10 shrink-0 p-0 text-lg"
        >
          ☰
        </button>
        <BusinessSwitcher businesses={businesses} activeId={activeId} compact />
      </header>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <button className="absolute inset-0 bg-ink-900/40" aria-label="Close menu" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[82%] max-w-xs bg-white shadow-xl">{sidebar}</aside>
        </div>
      )}

      <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-10 lg:py-10">{children}</main>
    </div>
  );
}
