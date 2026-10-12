import type { Metadata } from 'next';
import { CheckCircleIcon, LogoMark } from '@/components/icons';
import { env } from '@/lib/env';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in' };

const POINTS = [
  'On-brand captions and images for every client',
  'Every post is different — topics and styles rotate automatically',
  'Nothing goes live until you press Approve',
];

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      {/* Brand panel (desktop) */}
      <section className="relative hidden overflow-hidden bg-ink-900 p-12 text-white lg:flex lg:flex-col">
        <div className="pointer-events-none absolute -top-40 -right-40 size-[32rem] rounded-full bg-brand-600/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-48 -left-24 size-[28rem] rounded-full bg-brand-500/15 blur-3xl" />
        <div className="relative flex items-center gap-2.5">
          <LogoMark />
          <span className="font-display text-xl font-semibold tracking-tight">LocalPilot</span>
        </div>
        <div className="relative my-auto max-w-lg">
          <h2 className="font-display text-5xl leading-[1.1] font-semibold tracking-tight">
            Social posts for every local client, <span className="text-brand-500">in minutes.</span>
          </h2>
          <ul className="mt-10 space-y-4">
            {POINTS.map((p) => (
              <li key={p} className="flex items-start gap-3 text-base text-white/80">
                <CheckCircleIcon className="mt-0.5 size-5 shrink-0 text-brand-500" />
                {p}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-white/40">The AI marketing cockpit for local businesses.</p>
      </section>

      {/* Form */}
      <section className="grid place-items-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <LogoMark className="size-11" />
          </div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Welcome back</h1>
          <p className="mt-1.5 mb-8 text-sm text-ink-500">Sign in to manage your clients’ posts.</p>
          {error && (
            <p className="mb-5 rounded-xl border border-red-200/70 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
              That confirmation link didn&apos;t work. Try signing in.
            </p>
          )}
          <LoginForm next={next ?? '/dashboard'} allowSignup={env.allowSignup()} />
        </div>
      </section>
    </main>
  );
}
